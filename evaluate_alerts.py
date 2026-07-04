"""Evalúa las alertas guardadas activas contra contratos nuevos desde su
último chequeo (ver scalability.md — MVP: sin envío de email/push todavía,
solo deja constancia de cuántos contratos nuevos matchean cada alerta y
avanza last_checked_at).

Pensado para correr periódicamente (cron manual o un futuro job de GitHub
Actions, separado de pipeline.py) — no se dispara solo.

Uso:
    python evaluate_alerts.py
"""

import logging
import os
from datetime import datetime

from dotenv import load_dotenv
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.load.loader import get_engine
from src.load.models import Contract, Entity, SavedAlert, Supplier

load_dotenv()
logging.basicConfig(level="INFO", format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("evaluate_alerts")


def _match_count(session: Session, alert: SavedAlert, since: datetime) -> int:
    stmt = (
        select(func.count(Contract.id))
        .join(Entity, Contract.entity_id == Entity.id)
        .join(Supplier, Contract.supplier_id == Supplier.id)
        .where(Contract.extraido_en > since)
    )
    if alert.entidad:
        stmt = stmt.where(Entity.nombre_canonico == alert.entidad)
    if alert.contratista:
        stmt = stmt.where(Supplier.nombre.ilike(f"%{alert.contratista}%"))
    if alert.estado:
        stmt = stmt.where(Contract.estado == alert.estado)
    if alert.desde:
        stmt = stmt.where(Contract.fecha >= alert.desde)
    if alert.hasta:
        stmt = stmt.where(Contract.fecha <= alert.hasta)
    if alert.valor_min is not None:
        stmt = stmt.where(Contract.valor >= alert.valor_min)
    if alert.valor_max is not None:
        stmt = stmt.where(Contract.valor <= alert.valor_max)
    return session.execute(stmt).scalar_one()


def run() -> None:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise EnvironmentError("DATABASE_URL no está configurada.")

    engine = get_engine(database_url)
    now = datetime.utcnow()

    with Session(engine) as session:
        alerts = session.execute(
            select(SavedAlert).where(SavedAlert.is_active.is_(True))
        ).scalars().all()

        logger.info("Evaluando %d alerta(s) activa(s).", len(alerts))

        for alert in alerts:
            since = alert.last_checked_at or alert.created_at
            count = _match_count(session, alert, since)
            if count:
                logger.info(
                    "Alerta #%d '%s' (%s): %d contrato(s) nuevo(s) desde %s.",
                    alert.id, alert.name, alert.user_email, count, since.isoformat(),
                )
            alert.last_checked_at = now

        session.commit()

    logger.info("Evaluación completada.")


if __name__ == "__main__":
    run()
