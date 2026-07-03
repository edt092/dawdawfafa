"""Punto de entrada del pipeline ETL de ContrataData.

Ejecuta las etapas en orden: extract → normalize → validate → load.
Procesa en lotes de BATCH_SIZE registros con un commit por lote,
de modo que una caída parcial no pierde el progreso ya guardado.
"""

import logging
import os
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone
from itertools import islice

from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger("pipeline")

BATCH_SIZE = 5_000

# Solape del cursor incremental: al reanudar desde last_processed_updated_at
# retrocedemos unos minutos para no perder registros por pequeños desórdenes
# de :updated_at en el feed. El upsert es idempotente, así que reprocesar
# unos pocos registros de más no duplica nada.
CURSOR_OVERLAP_MINUTES = 10

# Guarda contra cambios de estructura en el feed de Socrata: si un lote
# suficientemente grande se rechaza casi por completo, lo más probable es
# que una columna fuente (ej. proceso_de_compra, nombre_entidad) llegó vacía
# para todos los registros — no un problema de calidad de datos puntual.
REJECTION_RATE_THRESHOLD = 0.8
MIN_BATCH_FOR_SCHEMA_GUARD = 50


def _iter_chunks(iterable, size: int):
    it = iter(iterable)
    while chunk := list(islice(it, size)):
        yield chunk


def _parse_updated_at(raw) -> datetime | None:
    if not raw:
        return None
    for fmt in ("%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(str(raw)[:19], fmt[:len(fmt)])
        except ValueError:
            continue
    return None


def _max_updated_at(records: list[dict]) -> datetime | None:
    parsed = [_parse_updated_at(r.get("_updated_at")) for r in records]
    parsed = [d for d in parsed if d is not None]
    return max(parsed) if parsed else None


def _write_github_summary(
    *,
    modo: str,
    total_extraidos: int,
    total_insertados: int,
    total_actualizados: int,
    total_rechazados: int,
    lotes_fallidos: int,
    lote_num: int,
    motivos_global: Counter,
) -> None:
    summary_path = os.getenv("GITHUB_STEP_SUMMARY")
    if not summary_path:
        return
    estado = "✅ OK" if lotes_fallidos == 0 else f"⚠️ {lotes_fallidos}/{lote_num} lotes fallidos"
    lines = [
        "## ContrataData ETL — Resumen\n\n",
        f"| Campo | Valor |\n|---|---|\n",
        f"| Modo | `{modo}` |\n",
        f"| Estado carga | {estado} |\n",
        f"| Registros extraídos | {total_extraidos:,} |\n",
        f"| Insertados (nuevos) | {total_insertados:,} |\n",
        f"| Actualizados (ya existían) | {total_actualizados:,} |\n",
        f"| Rechazados | {total_rechazados:,} |\n",
    ]
    if motivos_global:
        lines.append("\n### Motivos de rechazo\n\n")
        for motivo, n in motivos_global.most_common(10):
            lines.append(f"- `{motivo}`: {n:,}\n")
    try:
        with open(summary_path, "a", encoding="utf-8") as fh:
            fh.writelines(lines)
    except OSError as exc:
        logger.warning("No se pudo escribir GITHUB_STEP_SUMMARY: %s", exc)


def run() -> None:
    from src.error_log import PipelineErrorLog
    from src.extract.secop_socrata import SecopSocrataExtractor
    from src.transform.normalize import normalize_record
    from src.transform.validate import validate_records
    from src.load.loader import (
        get_engine, create_tables, load_batch,
        get_last_run_at, set_last_run_at,
        get_last_processed_updated_at, set_last_processed_updated_at,
    )

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise EnvironmentError("DATABASE_URL no está configurada.")

    run_started_at = datetime.now(timezone.utc).replace(tzinfo=None)

    engine = get_engine(database_url)
    create_tables(engine)

    # Determinar modo: incremental o completo. El cursor por ventana
    # (last_processed_updated_at, que avanza por lote exitoso) tiene
    # prioridad sobre last_run_at (que solo se guarda al final de una
    # corrida completa) porque refleja mejor de dónde retomar tras una
    # corrida cancelada a mitad de camino.
    last_run_at = get_last_run_at(engine)
    last_processed_updated_at = get_last_processed_updated_at(engine)
    cursor = last_processed_updated_at or last_run_at
    force_full = os.getenv("FORCE_FULL_LOAD", "").lower() in ("1", "true", "yes")

    if force_full or cursor is None:
        since = None
        modo = "COMPLETO" if cursor is None else "COMPLETO (forzado)"
    else:
        since = cursor
        modo = f"INCREMENTAL desde {cursor.isoformat()}"

    # Cota superior del cursor a lo largo de la corrida (independiente de
    # 'since', que no cambia durante la corrida).
    running_max_updated_at: datetime | None = None

    logger.info("=== Iniciando pipeline ContrataData — modo %s (lotes de %d) ===", modo, BATCH_SIZE)

    with PipelineErrorLog() as err:
        extractor = SecopSocrataExtractor(
            max_records=int(os.getenv("MAX_RECORDS") or "0") or None,
            date_from=os.getenv("DATE_FROM"),
            since=since,
            error_log=err,
        )

        # Cachés de entidades y proveedores compartidos entre lotes
        # para evitar SELECTs repetidos a la BD
        entity_cache: dict = {}
        supplier_cache: dict = {}

        total_extraidos = total_insertados = total_actualizados = total_rechazados = 0
        motivos_global: Counter = Counter()
        lote_num = 0
        lotes_fallidos = 0

        for chunk in _iter_chunks(extractor.extract(), BATCH_SIZE):
            lote_num += 1
            total_extraidos += len(chunk)

            # Normalizar y validar el lote
            normalized = [normalize_record(r) for r in chunk]
            result = validate_records(normalized)
            batch_max_updated_at = _max_updated_at(normalized)

            # Contabilizar rechazos
            for rec in result.rejected:
                motivos_global[rec.get("_motivo_rechazo", "desconocido")] += 1
            total_rechazados += len(result.rejected)

            # Si casi todo el lote se rechaza, probablemente el feed cambió de
            # estructura (columna renombrada/vacía) — abortar en vez de seguir
            # cargando lotes vacíos durante horas sin que nadie se entere.
            if len(chunk) >= MIN_BATCH_FOR_SCHEMA_GUARD:
                rejection_rate = len(result.rejected) / len(chunk)
                if rejection_rate > REJECTION_RATE_THRESHOLD:
                    motivos_lote = Counter(
                        r.get("_motivo_rechazo", "desconocido") for r in result.rejected
                    )
                    resumen = ", ".join(f"{m}: {n}" for m, n in motivos_lote.most_common(3))
                    msg = (
                        f"Lote {lote_num}: {rejection_rate:.0%} de rechazo "
                        f"({len(result.rejected)}/{len(chunk)}). Posible cambio de "
                        f"estructura en el feed de Socrata. Motivos principales: {resumen}"
                    )
                    err.log("Validación — Posible cambio de esquema", msg)
                    raise RuntimeError(msg)

            # Cargar lote con su propio commit
            try:
                inserted, updated = load_batch(
                    engine, result.valid, result.rejected,
                    entity_cache, supplier_cache,
                )
            except Exception as exc:
                lotes_fallidos += 1
                msg = f"Lote {lote_num} (offset ~{total_extraidos}): {type(exc).__name__}: {exc}"
                err.log("Carga — Error de lote", msg)
                logger.error("Error en lote %d, continuando con el siguiente. %s", lote_num, exc)
                continue

            total_insertados += inserted
            total_actualizados += updated

            # Avanzar y persistir el cursor incremental tras cada lote exitoso
            # (con solape) — si Actions cancela la corrida, la próxima retoma
            # desde aquí en vez de repetir todo el incremental desde el inicio.
            if batch_max_updated_at and (
                running_max_updated_at is None or batch_max_updated_at > running_max_updated_at
            ):
                running_max_updated_at = batch_max_updated_at
                set_last_processed_updated_at(
                    engine, running_max_updated_at - timedelta(minutes=CURSOR_OVERLAP_MINUTES)
                )

            if lote_num % 10 == 0:
                logger.info(
                    "Progreso — lote %d | extraídos: %d | insertados: %d | rechazados: %d",
                    lote_num, total_extraidos, total_insertados, total_rechazados,
                )

        # Resumen final
        logger.info(
            "=== Pipeline finalizado === extraídos: %d | insertados: %d | "
            "actualizados: %d | rechazados: %d | lotes_fallidos: %d",
            total_extraidos, total_insertados, total_actualizados, total_rechazados, lotes_fallidos,
        )

        if motivos_global:
            resumen = ", ".join(f"{m}: {n}" for m, n in motivos_global.most_common())
            err.log(
                "Validación — Rechazos totales",
                f"{total_rechazados} registros rechazados — {resumen}",
            )

        # Escribir Job Summary para GitHub Actions (visible directo en la UI)
        _write_github_summary(
            modo=modo,
            total_extraidos=total_extraidos,
            total_insertados=total_insertados,
            total_actualizados=total_actualizados,
            total_rechazados=total_rechazados,
            lotes_fallidos=lotes_fallidos,
            lote_num=lote_num,
            motivos_global=motivos_global,
        )

        # Falla explícita si todos los lotes con datos fallaron al cargar
        if lote_num > 0 and lotes_fallidos == lote_num:
            raise RuntimeError(
                f"Todos los lotes fallaron al cargar ({lotes_fallidos}/{lote_num}). "
                "Revisa la conexión a la base de datos y los logs anteriores."
            )

        # Marcar corrida exitosa para la próxima ejecución incremental
        set_last_run_at(engine, run_started_at)
        logger.info("Timestamp de corrida guardado: %s", run_started_at.isoformat())


if __name__ == "__main__":
    try:
        run()
    except Exception as exc:
        logger.critical("Pipeline terminó con error fatal: %s: %s", type(exc).__name__, exc)
        summary_path = os.getenv("GITHUB_STEP_SUMMARY")
        if summary_path:
            try:
                with open(summary_path, "a", encoding="utf-8") as fh:
                    fh.write(f"\n## ❌ Error fatal\n\n```\n{type(exc).__name__}: {exc}\n```\n")
            except OSError:
                pass
        sys.exit(1)
