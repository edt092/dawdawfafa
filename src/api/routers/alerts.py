"""Alertas guardadas (plan Pro) — ver scalability.md.

El envío automático (email/push cuando hay contratos nuevos que matchean)
no está implementado todavía; ver evaluate_alerts.py para el chequeo batch
que sí existe (deja el modelo y last_checked_at listos para eso).
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.api.deps import get_db, require_pro
from src.api.schemas import SavedAlertCreate, SavedAlertItem, SavedAlertUpdate
from src.load.models import PremiumUser, SavedAlert

router = APIRouter(prefix="/alerts", tags=["alerts"])


def _get_owned_alert(db: Session, alert_id: int, email: str) -> SavedAlert:
    alert = db.get(SavedAlert, alert_id)
    if alert is None or alert.user_email != email:
        raise HTTPException(status_code=404, detail="Alerta no encontrada.")
    return alert


@router.post("", response_model=SavedAlertItem)
def create_alert(
    payload: SavedAlertCreate,
    user: PremiumUser = Depends(require_pro),
    db: Session = Depends(get_db),
) -> SavedAlertItem:
    row = SavedAlert(user_email=user.email, **payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return SavedAlertItem.model_validate(row)


@router.get("", response_model=list[SavedAlertItem])
def list_alerts(
    user: PremiumUser = Depends(require_pro),
    db: Session = Depends(get_db),
) -> list[SavedAlertItem]:
    rows = db.execute(
        select(SavedAlert)
        .where(SavedAlert.user_email == user.email)
        .order_by(SavedAlert.created_at.desc())
    ).scalars().all()
    return [SavedAlertItem.model_validate(r) for r in rows]


@router.patch("/{alert_id}", response_model=SavedAlertItem)
def update_alert(
    alert_id: int,
    payload: SavedAlertUpdate,
    user: PremiumUser = Depends(require_pro),
    db: Session = Depends(get_db),
) -> SavedAlertItem:
    alert = _get_owned_alert(db, alert_id, user.email)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(alert, key, value)
    db.commit()
    db.refresh(alert)
    return SavedAlertItem.model_validate(alert)


@router.delete("/{alert_id}", status_code=204)
def delete_alert(
    alert_id: int,
    user: PremiumUser = Depends(require_pro),
    db: Session = Depends(get_db),
) -> None:
    alert = _get_owned_alert(db, alert_id, user.email)
    db.delete(alert)
    db.commit()
