"""Migración one-off: prepara el esquema para el fix del bug de cache
poisoning en src/load/loader.py (ver bug.md).

Dos cambios:
1. Amplía suppliers.nit_o_id_fiscal de VARCHAR(50) a VARCHAR(150) — un NIT
   más largo de lo esperado no debe volver a tumbar el INSERT masivo de un
   lote entero.
2. Crea (si no existen) pipeline_runs y pipeline_batch_errors, para que el
   resultado real de cada corrida quede en Neon en vez de solo en errors.md
   (que se destruye junto con el runner efímero de GitHub Actions).

Ejecutar una sola vez contra la base de producción:

    python migrate_pipeline_observability.py

Es idempotente: usar Base.metadata.create_all para las tablas nuevas y
ALTER COLUMN TYPE (sin condición previa, pero seguro de repetir) para
nit_o_id_fiscal.
"""

import logging
import os

from dotenv import load_dotenv
from sqlalchemy import text

from src.load.loader import get_engine
from src.load.models import Base

load_dotenv()
logging.basicConfig(level="INFO", format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("migrate")


def run() -> None:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise EnvironmentError("DATABASE_URL no está configurada.")

    engine = get_engine(database_url)

    with engine.begin() as conn:
        conn.execute(text(
            "ALTER TABLE suppliers ALTER COLUMN nit_o_id_fiscal TYPE VARCHAR(150)"
        ))
        logger.info("suppliers.nit_o_id_fiscal ampliada a VARCHAR(150).")

    Base.metadata.create_all(engine, tables=[
        Base.metadata.tables["pipeline_runs"],
        Base.metadata.tables["pipeline_batch_errors"],
    ])
    logger.info("Tablas pipeline_runs / pipeline_batch_errors verificadas/creadas.")

    logger.info("Migración completada.")


if __name__ == "__main__":
    run()
