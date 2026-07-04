"""Schemas Pydantic para las respuestas de la API."""

import re
from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


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


# ── Feedback ─────────────────────────────────────────────────────────────────

FeedbackType = Literal["no_encontre", "dificil_buscar", "error", "sugerencia", "otro"]
Importance = Literal["baja", "media", "alta"]


class FeedbackCreate(BaseModel):
    feedback_type: FeedbackType
    comment: str = Field(min_length=3, max_length=4000)
    email: Optional[str] = Field(default=None, max_length=255)
    importance: Importance = "media"
    consent_contact: bool = False
    page_url: Optional[str] = Field(default=None, max_length=1000)
    route: Optional[str] = Field(default=None, max_length=500)
    filters_json: Optional[dict] = None
    user_agent: Optional[str] = Field(default=None, max_length=500)
    viewport: Optional[str] = Field(default=None, max_length=50)
    referrer: Optional[str] = Field(default=None, max_length=1000)

    @field_validator("email")
    @classmethod
    def _validar_email(cls, v: Optional[str]) -> Optional[str]:
        return _validar_email_requerido(v) if v else None

    @field_validator("comment")
    @classmethod
    def _validar_comment(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 3:
            raise ValueError("El comentario es muy corto.")
        return v


class FeedbackResponse(BaseModel):
    id: int
    status: str
    reward_status: str


# ── Premium (MVP de validación — ver scalability.md) ─────────────────────────

Plan = Literal["free", "pro"]
PremiumStatusValue = Literal["active", "trial", "expired"]


def _validar_email_requerido(v: str) -> str:
    v = v.strip()
    if not _EMAIL_RE.match(v):
        raise ValueError("Email inválido.")
    return v


class PremiumLeadCreate(BaseModel):
    email: str = Field(max_length=255)
    feature: Optional[str] = Field(default=None, max_length=50)

    @field_validator("email")
    @classmethod
    def _validar_email(cls, v: str) -> str:
        return _validar_email_requerido(v)


class PremiumLeadResponse(BaseModel):
    id: int
    email: str


class PremiumStatusResponse(BaseModel):
    email: str
    plan: Plan
    premium_status: PremiumStatusValue
    premium_until: Optional[datetime]
    is_pro: bool


# ── Alertas guardadas ─────────────────────────────────────────────────────────

Frecuencia = Literal["daily", "weekly"]


class SavedAlertCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    entidad: Optional[str] = Field(default=None, max_length=500)
    contratista: Optional[str] = Field(default=None, max_length=500)
    estado: Optional[str] = Field(default=None, max_length=100)
    desde: Optional[date] = None
    hasta: Optional[date] = None
    valor_min: Optional[float] = Field(default=None, ge=0)
    valor_max: Optional[float] = Field(default=None, ge=0)
    frecuencia: Frecuencia = "daily"


class SavedAlertUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    is_active: Optional[bool] = None
    frecuencia: Optional[Frecuencia] = None


class SavedAlertItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_email: str
    name: str
    entidad: Optional[str]
    contratista: Optional[str]
    estado: Optional[str]
    desde: Optional[date]
    hasta: Optional[date]
    valor_min: Optional[float]
    valor_max: Optional[float]
    frecuencia: str
    is_active: bool
    last_checked_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime


# ── Monitor de competidores ──────────────────────────────────────────────────

class CompetitorCreate(BaseModel):
    supplier_name: str = Field(min_length=1, max_length=500)
    nickname: Optional[str] = Field(default=None, max_length=200)


class CompetitorItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_email: str
    supplier_name: str
    nickname: Optional[str]
    is_active: bool
    created_at: datetime
