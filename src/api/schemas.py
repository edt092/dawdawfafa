"""Schemas Pydantic para las respuestas de la API."""

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


# ── Contratos ────────────────────────────────────────────────────────────────

class ContractItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    entidad: str
    contratista: str
    valor: float          # Decimal -> float para JSON limpio
    fecha: date
    estado: Optional[str]
    fuente: str
    extraido_en: datetime


class ContractListResponse(BaseModel):
    items: list[ContractItem]
    total: int
    page: int
    per_page: int
    total_pages: int


class ContractAggregate(BaseModel):
    total_contratos: int
    valor_total: float
    entidades_unicas: int
    contratistas_unicos: int


# ── Estadísticas globales ────────────────────────────────────────────────────

class GlobalStats(BaseModel):
    total_contratos: int
    valor_total: float
    valor_promedio: float
    entidades_unicas: int
    contratistas_unicos: int
    fecha_mas_antigua: Optional[date]
    fecha_mas_reciente: Optional[date]


# ── Entidades ────────────────────────────────────────────────────────────────

class EntitySummary(BaseModel):
    nombre: str
    sigla: Optional[str]
    total_contratos: int
    valor_total: float
    contratistas_unicos: int


# ── Contratistas ─────────────────────────────────────────────────────────────

class ContractorSummary(BaseModel):
    nombre: str
    nit_o_id_fiscal: Optional[str]
    total_contratos: int
    valor_total: float
    entidades_unicas: int


class ContractorByEstado(BaseModel):
    estado: str
    cantidad: int


# ── Charts ───────────────────────────────────────────────────────────────────

class BarItem(BaseModel):
    nombre: str
    valor_total: float
    porcentaje: float


class MonthlyPoint(BaseModel):
    periodo: str        # "2024-03"
    valor_total: float
    cantidad: int


class CalidadItem(BaseModel):
    motivo: str
    fuente: str
    cantidad: int


# ── Pipeline ─────────────────────────────────────────────────────────────────

class PipelineStatus(BaseModel):
    db_ok: bool
    db_latency_ms: Optional[float]
    total_contratos: int
    total_entidades: int
    total_proveedores: int
    total_rechazados: int


class PipelineRunItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    started_at: datetime
    finished_at: Optional[datetime]
    status: str
    modo: Optional[str]
    extracted_count: int
    inserted_count: int
    updated_count: int
    rejected_count: int
    failed_batches: int
    total_batches: int
    error_summary: Optional[str]
