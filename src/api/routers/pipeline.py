"""GET /api/pipeline — estado del ETL y registros rechazados."""

import time

from fastapi import APIRouter, Depends
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from src.api.deps import get_db
from src.api.schemas import CalidadItem, GlobalStats, PipelineRunItem, PipelineStatus
from src.load.models import Contract, Entity, PipelineRun, RejectedRecord, Supplier

router = APIRouter(prefix="/pipeline", tags=["pipeline"])


@router.get("/status", response_model=PipelineStatus)
def pipeline_status(db: Session = Depends(get_db)) -> PipelineStatus:
    t0 = time.perf_counter()
    try:
        db.execute(text("SELECT 1"))
        db_ok = True
        latency_ms = round((time.perf_counter() - t0) * 1000, 2)
    except Exception:
        db_ok = False
        latency_ms = None

    total_c = db.execute(select(func.count(Contract.id))).scalar_one()
    total_e = db.execute(select(func.count(Entity.id))).scalar_one()
    total_s = db.execute(select(func.count(Supplier.id))).scalar_one()
    total_r = db.execute(select(func.count(RejectedRecord.id))).scalar_one()

    return PipelineStatus(
        db_ok=db_ok,
        db_latency_ms=latency_ms,
        total_contratos=total_c,
        total_entidades=total_e,
        total_proveedores=total_s,
        total_rechazados=total_r,
    )


@router.get("/rejected", response_model=list[CalidadItem])
def rejected_records(db: Session = Depends(get_db)) -> list[CalidadItem]:
    rows = db.execute(
        select(
            RejectedRecord.motivo_rechazo.label("motivo"),
            RejectedRecord.fuente,
            func.count(RejectedRecord.id).label("cantidad"),
        )
        .group_by(RejectedRecord.motivo_rechazo, RejectedRecord.fuente)
        .order_by(func.count(RejectedRecord.id).desc())
    ).mappings().all()

    return [
        CalidadItem(motivo=r["motivo"], fuente=r["fuente"], cantidad=r["cantidad"])
        for r in rows
    ]


@router.get("/runs", response_model=list[PipelineRunItem])
def pipeline_runs(limit: int = 20, db: Session = Depends(get_db)) -> list[PipelineRunItem]:
    rows = db.execute(
        select(PipelineRun).order_by(PipelineRun.started_at.desc()).limit(limit)
    ).scalars().all()
    return [PipelineRunItem.model_validate(r) for r in rows]


@router.get("/stats", response_model=GlobalStats)
def global_stats(db: Session = Depends(get_db)) -> GlobalStats:
    row = db.execute(
        select(
            func.count(Contract.id).label("total_contratos"),
            func.coalesce(func.sum(Contract.valor), 0).label("valor_total"),
            func.coalesce(func.avg(Contract.valor), 0).label("valor_promedio"),
            func.count(Contract.entity_id.distinct()).label("entidades_unicas"),
            func.count(Contract.supplier_id.distinct()).label("contratistas_unicos"),
            func.min(Contract.fecha).label("fecha_mas_antigua"),
            func.max(Contract.fecha).label("fecha_mas_reciente"),
        )
    ).mappings().one()

    return GlobalStats(**dict(row))
