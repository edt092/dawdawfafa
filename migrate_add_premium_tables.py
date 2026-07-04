"""Migración one-off: crea las tablas del MVP Premium (ver scalability.md) —
premium_users, premium_leads, saved_alerts, competitor_watchlist.

Ejecutar una sola vez contra la base de producción:

    python migrate_add_premium_tables.py

Es idempotente: usa Base.metadata.create_all, que no toca tablas existentes.
"""

import logging
import os

from dotenv import load_dotenv

from src.load.loader import get_engine
from src.load.models import Base

load_dotenv()
logging.basicConfig(level="INFO", format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("migrate")

TABLES = ["premium_users", "premium_leads", "saved_alerts", "competitor_watchlist"]


def run() -> None:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise EnvironmentError("DATABASE_URL no está configurada.")

    engine = get_engine(database_url)

    Base.metadata.create_all(engine, tables=[Base.metadata.tables[t] for t in TABLES])
    logger.info("Tablas verificadas/creadas: %s", ", ".join(TABLES))


if __name__ == "__main__":
    run()
