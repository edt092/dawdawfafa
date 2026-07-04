"""Monitor de competidores (plan Pro) — ver scalability.md."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from src.api.deps import get_db, require_pro
from src.api.schemas import CompetitorCreate, CompetitorItem
from src.load.models import CompetitorWatch, PremiumUser

router = APIRouter(prefix="/competitors", tags=["competitors"])


@router.post("", response_model=CompetitorItem)
def follow_competitor(
    payload: CompetitorCreate,
    user: PremiumUser = Depends(require_pro),
    db: Session = Depends(get_db),
) -> CompetitorItem:
    # ON CONFLICT reactiva (is_active=True) en vez de fallar si el usuario ya
    # había seguido y dejado de seguir a este mismo contratista.
    stmt = (
        pg_insert(CompetitorWatch)
        .values(
            user_email=user.email,
            supplier_name=payload.supplier_name,
            nickname=payload.nickname,
            is_active=True,
        )
        .on_conflict_do_update(
            constraint="uq_competitor_watch_user_supplier",
            set_={"nickname": payload.nickname, "is_active": True},
        )
        .returning(CompetitorWatch.id)
    )
    row_id = db.execute(stmt).scalar_one()
    db.commit()

    row = db.get(CompetitorWatch, row_id)
    return CompetitorItem.model_validate(row)


@router.get("", response_model=list[CompetitorItem])
def list_competitors(
    user: PremiumUser = Depends(require_pro),
    db: Session = Depends(get_db),
) -> list[CompetitorItem]:
    rows = db.execute(
        select(CompetitorWatch)
        .where(CompetitorWatch.user_email == user.email, CompetitorWatch.is_active.is_(True))
        .order_by(CompetitorWatch.created_at.desc())
    ).scalars().all()
    return [CompetitorItem.model_validate(r) for r in rows]


@router.delete("/{competitor_id}", status_code=204)
def unfollow_competitor(
    competitor_id: int,
    user: PremiumUser = Depends(require_pro),
    db: Session = Depends(get_db),
) -> None:
    row = db.get(CompetitorWatch, competitor_id)
    if row is None or row.user_email != user.email:
        raise HTTPException(status_code=404, detail="No encontrado.")
    db.delete(row)
    db.commit()
