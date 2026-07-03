"""Carga idempotente de registros validados a PostgreSQL."""

import logging
from datetime import datetime
from decimal import Decimal

from sqlalchemy import create_engine, insert, literal_column, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from src.load.models import (
    Base, Contract, Entity, PipelineBatchError, PipelineMeta, PipelineRun,
    RejectedRecord, Supplier,
)

NIT_MAX_LEN = 150

logger = logging.getLogger(__name__)


def get_engine(database_url: str):
    return create_engine(
        database_url,
        echo=False,
        future=True,
        pool_pre_ping=True,  # reconecta automáticamente si la conexión cayó
    )


def create_tables(engine) -> None:
    Base.metadata.create_all(engine)
    logger.info("Tablas verificadas/creadas.")


def _parse_date(raw):
    if raw is None:
        return None
    if isinstance(raw, datetime):
        return raw.date()
    for fmt in ("%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(str(raw)[:19], fmt[:len(fmt)]).date()
        except ValueError:
            continue
    return None


def _bulk_ensure_ids(
    session: Session,
    model,
    unique_col,
    payloads: dict[str, dict],
    cache: dict,
) -> None:
    """Resuelve ids para las claves de 'payloads' contra cache/BD, creando
    en bulk las que falten. Muta 'cache' in-place (clave -> id).

    Dos SELECT WHERE IN + un INSERT ... ON CONFLICT DO NOTHING en vez de un
    SELECT/INSERT por fila: reduce drásticamente los round-trips a la BD
    para lotes grandes (ver src/load/loader.py, antes ~10min/5000 filas).
    """
    missing = {k for k in payloads if k not in cache}
    if not missing:
        return

    rows = session.execute(
        select(model.id, unique_col).where(unique_col.in_(missing))
    ).all()
    for id_, key in rows:
        cache[key] = id_
    missing -= cache.keys()
    if not missing:
        return

    stmt = (
        pg_insert(model)
        .values([payloads[k] for k in missing])
        .on_conflict_do_nothing(index_elements=[unique_col.key])
    )
    session.execute(stmt)

    rows = session.execute(
        select(model.id, unique_col).where(unique_col.in_(missing))
    ).all()
    for id_, key in rows:
        cache[key] = id_


def _persist_rejected(session: Session, records: list[dict]) -> None:
    if not records:
        return
    rows = [
        {
            "fuente": rec.get("fuente", "UNKNOWN"),
            "payload_crudo": {
                k: v for k, v in (rec.get("_raw") or rec).items()
                if not k.startswith("_")
            },
            "motivo_rechazo": rec.get("_motivo_rechazo", "desconocido"),
        }
        for rec in records
    ]
    session.execute(insert(RejectedRecord), rows)


def load_batch(
    engine,
    valid: list[dict],
    rejected: list[dict],
    entity_cache: dict,
    supplier_cache: dict,
) -> tuple[int, int]:
    """Carga un lote en su propia transacción, en operaciones bulk en vez de
    fila por fila. Retorna (insertados, actualizados).

    entity_cache/supplier_cache se comparten entre lotes de toda la corrida
    por eficiencia (evita SELECTs repetidos). Por eso operamos sobre copias
    locales y solo las fusionamos de vuelta al cache del llamador si la
    transacción del lote confirma sin errores: si el lote falla y hace
    rollback, un id "tentativo" que quedó en el cache del llamador seguiría
    apuntando a una fila que ya no existe, y todo lote futuro que reuse ese
    id fallaría con ForeignKeyViolation en cascada (cache poisoning).
    """
    if not valid and not rejected:
        return 0, 0

    batch_entity_cache = dict(entity_cache)
    batch_supplier_cache = dict(supplier_cache)

    with Session(engine) as session:
        with session.begin():
            entity_payloads = {
                rec["entidad_canonica"]: {"nombre_canonico": rec["entidad_canonica"]}
                for rec in valid
            }
            _bulk_ensure_ids(
                session, Entity, Entity.nombre_canonico, entity_payloads, batch_entity_cache
            )

            supplier_payloads: dict[str, dict] = {}
            for rec in valid:
                nombre = rec.get("contratista") or "DESCONOCIDO"
                if nombre not in supplier_payloads:
                    nit = rec.get("identificacion_proveedor")
                    if nit and len(nit) > NIT_MAX_LEN:
                        logger.warning(
                            "nit_o_id_fiscal truncado (%d -> %d chars) para proveedor '%s'",
                            len(nit), NIT_MAX_LEN, nombre,
                        )
                        nit = nit[:NIT_MAX_LEN]
                    supplier_payloads[nombre] = {
                        "nombre": nombre,
                        "nit_o_id_fiscal": nit,
                    }
            _bulk_ensure_ids(
                session, Supplier, Supplier.nombre, supplier_payloads, batch_supplier_cache
            )

            # dedup por clave idempotente: un INSERT ... ON CONFLICT DO UPDATE
            # no puede afectar la misma fila dos veces en la misma sentencia
            # (Postgres lo rechaza). Igual que antes, el último gana.
            contract_rows: dict[tuple[str, str], dict] = {}
            for rec in valid:
                nombre = rec.get("contratista") or "DESCONOCIDO"
                key = (rec.get("fuente", "UNKNOWN"), rec["proceso_de_compra"])
                contract_rows[key] = {
                    "entity_id": batch_entity_cache[rec["entidad_canonica"]],
                    "supplier_id": batch_supplier_cache[nombre],
                    "valor": Decimal(str(rec["valor"])),
                    "fecha": _parse_date(rec.get("fecha")),
                    "estado": rec.get("estado"),
                    "fuente": rec.get("fuente", "UNKNOWN"),
                    "proceso_de_compra": rec["proceso_de_compra"],
                }

            inserted = updated = 0
            if contract_rows:
                pg_stmt = pg_insert(Contract).values(list(contract_rows.values()))
                pg_stmt = pg_stmt.on_conflict_do_update(
                    constraint="uq_contract_idempotent",
                    set_={
                        "entity_id": pg_stmt.excluded.entity_id,
                        "supplier_id": pg_stmt.excluded.supplier_id,
                        "valor": pg_stmt.excluded.valor,
                        "fecha": pg_stmt.excluded.fecha,
                        "estado": pg_stmt.excluded.estado,
                    },
                    # xmax = 0 en la fila devuelta indica que fue un INSERT;
                    # cualquier otro valor indica que existía y fue un UPDATE.
                ).returning(Contract.id, literal_column("(xmax = 0)").label("fue_insertado"))
                results = session.execute(pg_stmt).all()
                inserted = sum(1 for r in results if r.fue_insertado)
                updated = len(results) - inserted

            _persist_rejected(session, rejected)

    # Solo llegamos aquí si el 'with session.begin()' confirmó sin excepción.
    entity_cache.update(batch_entity_cache)
    supplier_cache.update(batch_supplier_cache)

    return inserted, updated


def get_last_run_at(engine) -> datetime | None:
    """Retorna el timestamp de la última corrida exitosa, o None si no existe."""
    with Session(engine) as session:
        row = session.get(PipelineMeta, "last_run_at")
        return datetime.fromisoformat(row.value) if row else None


def set_last_run_at(engine, dt: datetime) -> None:
    """Persiste el timestamp de la corrida actual como la última exitosa."""
    with Session(engine) as session:
        with session.begin():
            stmt = (
                pg_insert(PipelineMeta)
                .values(key="last_run_at", value=dt.isoformat(), updated_at=dt)
                .on_conflict_do_update(
                    index_elements=["key"],
                    set_={"value": dt.isoformat(), "updated_at": dt},
                )
            )
            session.execute(stmt)


def get_last_processed_updated_at(engine) -> datetime | None:
    """Retorna el cursor de progreso incremental (avanza por lote exitoso,
    no solo al final de la corrida), o None si no existe."""
    with Session(engine) as session:
        row = session.get(PipelineMeta, "last_processed_updated_at")
        return datetime.fromisoformat(row.value) if row else None


def set_last_processed_updated_at(engine, dt: datetime) -> None:
    """Persiste el cursor de progreso incremental tras un lote exitoso, para
    que una corrida cancelada a mitad de camino pueda retomar desde ahí en
    vez de repetir todo el incremental desde el inicio de la corrida."""
    with Session(engine) as session:
        with session.begin():
            stmt = (
                pg_insert(PipelineMeta)
                .values(key="last_processed_updated_at", value=dt.isoformat(), updated_at=dt)
                .on_conflict_do_update(
                    index_elements=["key"],
                    set_={"value": dt.isoformat(), "updated_at": dt},
                )
            )
            session.execute(stmt)


def start_pipeline_run(engine, started_at: datetime, modo: str) -> int:
    """Crea la fila de la corrida en estado 'running' y devuelve su id."""
    with Session(engine) as session:
        with session.begin():
            run = PipelineRun(started_at=started_at, status="running", modo=modo)
            session.add(run)
            session.flush()
            return run.id


def record_batch_error(
    engine, run_id: int, batch_number: int, approx_offset: int,
    error_type: str, error_message: str,
) -> None:
    with Session(engine) as session:
        with session.begin():
            session.add(PipelineBatchError(
                run_id=run_id,
                batch_number=batch_number,
                approx_offset=approx_offset,
                error_type=error_type,
                error_message=error_message[:2000],
            ))


def finish_pipeline_run(engine, run_id: int, **fields) -> None:
    """Actualiza la fila de la corrida con el resultado final. 'fields' debe
    incluir al menos 'status'; el resto son columnas opcionales de PipelineRun."""
    with Session(engine) as session:
        with session.begin():
            run = session.get(PipelineRun, run_id)
            if run is None:
                return
            for key, value in fields.items():
                setattr(run, key, value)


def run_load(database_url: str, valid: list[dict], rejected: list[dict]) -> None:
    """Compatibilidad hacia atrás: carga todo en un único lote."""
    engine = get_engine(database_url)
    create_tables(engine)
    inserted, updated = load_batch(engine, valid, rejected, {}, {})
    logger.info(
        "Transacción completada: %d contratos nuevos, %d actualizados, %d rechazos.",
        inserted, updated, len(rejected),
    )
