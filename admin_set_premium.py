"""Utilidad de admin: marcar un email como usuario Pro (o revertirlo a free).

No hay backoffice todavía (ver scalability.md — MVP de validación, sin pagos
automatizados) — este script es la forma de aplicar manualmente el resultado
de una coordinación de pago fuera de banda.

Uso:
    python admin_set_premium.py usuario@ejemplo.com --plan pro --status active
    python admin_set_premium.py usuario@ejemplo.com --plan pro --status active --until 2026-12-31
    python admin_set_premium.py usuario@ejemplo.com --plan free --status expired
"""

import argparse
import logging
import os
from datetime import datetime

from dotenv import load_dotenv
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from src.load.loader import create_tables, get_engine
from src.load.models import PremiumUser

load_dotenv()
logging.basicConfig(level="INFO", format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("admin_set_premium")


def run(email: str, plan: str, status: str, until: str | None) -> None:
    email = email.strip().lower()
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise EnvironmentError("DATABASE_URL no está configurada.")

    engine = get_engine(database_url)
    create_tables(engine)

    premium_until = datetime.strptime(until, "%Y-%m-%d") if until else None
    now = datetime.utcnow()

    with Session(engine) as session:
        with session.begin():
            stmt = (
                pg_insert(PremiumUser)
                .values(
                    email=email, plan=plan, premium_status=status,
                    premium_until=premium_until, created_at=now, updated_at=now,
                )
                .on_conflict_do_update(
                    index_elements=["email"],
                    set_={
                        "plan": plan, "premium_status": status,
                        "premium_until": premium_until, "updated_at": now,
                    },
                )
            )
            session.execute(stmt)

    logger.info(
        "%s → plan=%s, premium_status=%s, premium_until=%s",
        email, plan, status, premium_until.date() if premium_until else None,
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("email")
    parser.add_argument("--plan", choices=["free", "pro"], default="pro")
    parser.add_argument("--status", choices=["active", "trial", "expired"], default="active")
    parser.add_argument("--until", metavar="YYYY-MM-DD", default=None)
    args = parser.parse_args()
    run(args.email, args.plan, args.status, args.until)
