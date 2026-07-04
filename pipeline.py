"""Punto de entrada del pipeline ETL de ContrataData.

Ejecuta las etapas en orden: extract → normalize → validate → load.
Procesa en lotes de BATCH_SIZE registros con un commit por lote,
de modo que una caída parcial no pierde el progreso ya guardado.
"""

import logging
import os
import sys
from collections import Counter
from datetime import datetime, timezone
from itertools import islice

from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger("pipeline")

BATCH_SIZE = 5_000

# Guarda contra cambios de estructura en el feed de Socrata: si un lote
# suficientemente grande se rechaza casi por completo, lo más probable es
# que una columna fuente (ej. proceso_de_compra, nombre_entidad) llegó vacía
# para todos los registros — no un problema de calidad de datos puntual.
REJECTION_RATE_THRESHOLD = 0.8
MIN_BATCH_FOR_SCHEMA_GUARD = 50

# Guarda contra corridas degradadas: antes solo se abortaba si el 100% de
# los lotes fallaban, lo que permitía que una corrida con cientos de lotes
# fallidos (ej. por cache poisoning, ver src/load/loader.py) terminara
# "exitosa" sin haber cargado casi nada. Si se cruza cualquiera de estos dos
# umbrales, abortamos sin marcar la corrida como exitosa ni avanzar last_run_at.
MAX_FALLOS_CONSECUTIVOS = 3
MIN_LOTES_PARA_TASA_FALLO = 5
MAX_TASA_FALLO = 0.20


def _iter_chunks(iterable, size: int):
    it = iter(iterable)
    while chunk := list(islice(it, size)):
        yield chunk


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
    preflight_skip: bool = False,
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
    if preflight_skip:
        lines.append(
            "\n> Preflight: la fuente no publicó cambios desde el último cursor — "
            "se omitió la extracción completa de esta corrida.\n"
        )
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
        get_last_processed_updated_at,
        get_last_source_cursor, set_last_source_cursor,
        start_pipeline_run, finish_pipeline_run, record_batch_error,
    )

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise EnvironmentError("DATABASE_URL no está configurada.")

    run_started_at = datetime.now(timezone.utc).replace(tzinfo=None)

    engine = get_engine(database_url)
    create_tables(engine)

    # Cursor incremental compuesto (:updated_at, :id) — ver src/load/loader.py
    # y src/extract/secop_socrata.py. El ':id' desempata cuando la fuente hace
    # un bulk update y miles/millones de filas comparten el mismo :updated_at;
    # sin él, cada corrida reprocesa toda esa ventana aunque no haya nada
    # realmente nuevo.
    last_run_at = get_last_run_at(engine)
    since_updated_at, since_id = get_last_source_cursor(engine)
    if since_updated_at is None:
        # Todavía no existe cursor compuesto (primera corrida tras este
        # cambio, o BD nueva): arrancamos desde el cursor legado (solo fecha)
        # para no forzar una recarga completa en la migración. El cursor
        # compuesto toma el control desde el primer lote exitoso de aquí en
        # adelante.
        since_updated_at = get_last_processed_updated_at(engine) or last_run_at

    force_full = os.getenv("FORCE_FULL_LOAD", "").lower() in ("1", "true", "yes")

    if force_full:
        since_updated_at = since_id = None
        modo = "COMPLETO (forzado)"
    elif since_updated_at is None:
        modo = "COMPLETO"
    else:
        ts_repr = since_updated_at if isinstance(since_updated_at, str) else since_updated_at.isoformat()
        modo = f"INCREMENTAL desde {ts_repr}" + (f" (id>{since_id})" if since_id else "")

    logger.info("=== Iniciando pipeline ContrataData — modo %s (lotes de %d) ===", modo, BATCH_SIZE)

    # Fila de seguimiento de esta corrida en pipeline_runs — reemplaza a
    # errors.md como fuente de verdad persistente (ese archivo vive y muere
    # con el runner efímero de GitHub Actions).
    run_id = start_pipeline_run(engine, run_started_at, modo)

    total_extraidos = total_insertados = total_actualizados = total_rechazados = 0
    lote_num = lotes_fallidos = fallos_consecutivos = 0
    run_status = "failed"

    try:
        with PipelineErrorLog() as err:
            extractor = SecopSocrataExtractor(
                max_records=int(os.getenv("MAX_RECORDS") or "0") or None,
                date_from=os.getenv("DATE_FROM"),
                since_updated_at=since_updated_at,
                since_id=since_id,
                error_log=err,
            )

            # Preflight: cuenta liviana de cuántos registros hay pendientes
            # desde el cursor, sin descargar ni procesar nada. Si la fuente no
            # publicó cambios, evita una corrida de 1-2h que reprocesaría
            # millones de filas ya cargadas para no insertar nada nuevo.
            # Solo aplica a corridas incrementales reales (no completas/forzadas).
            skip_full_run = False
            if since_updated_at is not None and not force_full:
                pending = extractor.preflight()
                if pending is not None:
                    logger.info("Preflight: %d registro(s) pendiente(s) desde el cursor.", pending)
                    skip_full_run = pending == 0

            if skip_full_run:
                logger.info(
                    "Sin cambios en la fuente desde el cursor — se omite la extracción completa."
                )
                _write_github_summary(
                    modo=modo, total_extraidos=0, total_insertados=0, total_actualizados=0,
                    total_rechazados=0, lotes_fallidos=0, lote_num=0, motivos_global=Counter(),
                    preflight_skip=True,
                )
                set_last_run_at(engine, run_started_at)
                logger.info("Timestamp de corrida guardado: %s", run_started_at.isoformat())
                run_status = "success_no_changes"
            else:
                # Cachés de entidades y proveedores compartidos entre lotes
                # para evitar SELECTs repetidos a la BD
                entity_cache: dict = {}
                supplier_cache: dict = {}
                motivos_global: Counter = Counter()

                for chunk in _iter_chunks(extractor.extract(), BATCH_SIZE):
                    lote_num += 1
                    total_extraidos += len(chunk)

                    # Normalizar y validar el lote
                    normalized = [normalize_record(r) for r in chunk]
                    result = validate_records(normalized)

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
                        fallos_consecutivos += 1
                        msg = f"Lote {lote_num} (offset ~{total_extraidos}): {type(exc).__name__}: {exc}"
                        err.log("Carga — Error de lote", msg)
                        logger.error("Error en lote %d, continuando con el siguiente. %s", lote_num, exc)
                        record_batch_error(
                            engine, run_id, lote_num, total_extraidos,
                            type(exc).__name__, str(exc),
                        )

                        # Antes solo se abortaba si el 100% de los lotes fallaban.
                        # Con eso, cientos de lotes podían fallar en cascada por un
                        # solo registro problemático (cache poisoning, ver
                        # src/load/loader.py) y la corrida igual terminaba "exitosa".
                        tasa_fallo = lotes_fallidos / lote_num
                        if (
                            fallos_consecutivos >= MAX_FALLOS_CONSECUTIVOS
                            or (lote_num >= MIN_LOTES_PARA_TASA_FALLO and tasa_fallo > MAX_TASA_FALLO)
                        ):
                            run_status = "degraded_aborted"
                            raise RuntimeError(
                                f"Corrida degradada: {lotes_fallidos}/{lote_num} lotes fallidos "
                                f"({fallos_consecutivos} consecutivos). Abortando sin marcar la "
                                "corrida como exitosa ni avanzar el cursor incremental."
                            )
                        continue

                    fallos_consecutivos = 0
                    total_insertados += inserted
                    total_actualizados += updated

                    # Avanzar y persistir el cursor incremental compuesto tras cada
                    # lote exitoso — si Actions cancela la corrida, la próxima retoma
                    # desde aquí en vez de repetir todo el incremental desde el
                    # inicio. El orden de extracción (:updated_at ASC, :id ASC)
                    # garantiza que el último registro del lote es siempre el punto
                    # más avanzado visto hasta ahora.
                    last_rec = normalized[-1] if normalized else None
                    if last_rec and last_rec.get("_updated_at") and last_rec.get("_id"):
                        set_last_source_cursor(engine, last_rec["_updated_at"], last_rec["_id"])

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
                run_status = "success" if lotes_fallidos == 0 else "success_with_errors"
    finally:
        # Se ejecuta tanto en éxito como en cualquiera de los abortos de
        # arriba, para que pipeline_runs siempre refleje el resultado real
        # de la corrida en vez de depender de logs efímeros de Actions.
        finish_pipeline_run(
            engine, run_id,
            finished_at=datetime.now(timezone.utc).replace(tzinfo=None),
            status=run_status,
            extracted_count=total_extraidos,
            inserted_count=total_insertados,
            updated_count=total_actualizados,
            rejected_count=total_rechazados,
            failed_batches=lotes_fallidos,
            total_batches=lote_num,
        )


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
