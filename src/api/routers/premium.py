"""Premium MVP (ver scalability.md): captura de leads y consulta de status.

Sin pagos automatizados todavía — un admin marca el email como 'pro' con
admin_set_premium.py después de coordinar el pago fuera de banda. Este router
solo expone: registrar interés (paywall suave) y consultar si un email ya
tiene acceso Pro activo (usado por el frontend para decidir si desbloquea
una función o muestra el paywall).
"""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.api.deps import _is_active_pro, get_db
from src.api.schemas import PremiumLeadCreate, PremiumLeadResponse, PremiumStatusResponse
from src.load.models import PremiumLead, PremiumUser

router = APIRouter(prefix="/premium", tags=["premium"])


@router.post("/leads", response_model=PremiumLeadResponse)
def create_lead(payload: PremiumLeadCreate, db: Session = Depends(get_db)) -> PremiumLeadResponse:
    row = PremiumLead(email=payload.email, feature=payload.feature)
    db.add(row)
    db.commit()
    db.refresh(row)
    return PremiumLeadResponse(id=row.id, email=row.email)


@router.get("/status", response_model=PremiumStatusResponse)
def premium_status(email: str, db: Session = Depends(get_db)) -> PremiumStatusResponse:
    normalized = email.strip().lower()
    user = db.execute(
        select(PremiumUser).where(PremiumUser.email == normalized)
    ).scalar_one_or_none()

    return PremiumStatusResponse(
        email=normalized,
        plan=user.plan if user else "free",
        premium_status=user.premium_status if user else "expired",
        premium_until=user.premium_until if user else None,
        is_pro=_is_active_pro(user),
    )
