"""Dependencias compartidas — engine SQLAlchemy, sesión de DB y gating premium."""

import os
from datetime import datetime
from functools import lru_cache

from dotenv import load_dotenv
from fastapi import Depends, HTTPException
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from src.load.models import PremiumUser

load_dotenv()


@lru_cache(maxsize=1)
def _engine():
    url = os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL no está configurada.")
    return create_engine(url, pool_pre_ping=True, future=True)


@lru_cache(maxsize=1)
def _session_factory():
    return sessionmaker(bind=_engine(), autocommit=False, autoflush=False)


def get_db():
    db: Session = _session_factory()()
    try:
        yield db
    finally:
        db.close()


def _is_active_pro(user: PremiumUser | None) -> bool:
    if user is None or user.plan != "pro" or user.premium_status != "active":
        return False
    if user.premium_until is not None and user.premium_until < datetime.utcnow():
        return False
    return True


def require_pro(email: str, db: Session = Depends(get_db)) -> PremiumUser:
    """Gating de features Pro por email (sin login — ver scalability.md).

    'email' se resuelve como query param en cualquier endpoint que declare
    esta dependencia. 402 (Payment Required) en vez de 403: el problema no es
    de permisos sino de plan — el frontend usa este código para mostrar el
    paywall suave en vez de un error genérico.
    """
    normalized = email.strip().lower()
    if not normalized:
        raise HTTPException(status_code=402, detail="Se requiere email para esta función.")

    user = db.execute(
        select(PremiumUser).where(PremiumUser.email == normalized)
    ).scalar_one_or_none()

    if not _is_active_pro(user):
        raise HTTPException(status_code=402, detail="Esta función requiere el plan ContrataData Pro.")

    return user
