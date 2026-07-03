"""Modelos SQLAlchemy para el esquema relacional de ContrataData."""

from datetime import datetime, date
from decimal import Decimal

from sqlalchemy import (
    BigInteger, CheckConstraint, Column, Date, DateTime, ForeignKey,
    Integer, Numeric, String, UniqueConstraint, func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


class Entity(Base):
    __tablename__ = "entities"

    id              = Column(Integer, primary_key=True, autoincrement=True)
    nombre_canonico = Column(String(500), unique=True, nullable=False)
    sigla           = Column(String(50))
    creado_en       = Column(DateTime, nullable=False, default=func.now())

    contracts = relationship("Contract", back_populates="entity")

    def __repr__(self) -> str:
        return f"<Entity id={self.id} nombre='{self.nombre_canonico}'>"


class Supplier(Base):
    __tablename__ = "suppliers"
    __table_args__ = (
        # Requerido para el INSERT ... ON CONFLICT DO NOTHING masivo en
        # load_batch (src/load/loader.py). En bases existentes hay que
        # correr migrate_supplier_unique.py antes de desplegar este cambio.
        UniqueConstraint("nombre", name="uq_supplier_nombre"),
    )

    id              = Column(Integer, primary_key=True, autoincrement=True)
    nombre          = Column(String(500), nullable=False)
    # 150 en vez de 50: un NIT/id fiscal más largo de lo esperado no debe
    # tumbar el INSERT masivo del lote entero (ver migrate_widen_nit.py).
    nit_o_id_fiscal = Column(String(150))
    creado_en       = Column(DateTime, nullable=False, default=func.now())

    contracts = relationship("Contract", back_populates="supplier")

    def __repr__(self) -> str:
        return f"<Supplier id={self.id} nombre='{self.nombre}'>"


class Contract(Base):
    __tablename__ = "contracts"
    __table_args__ = (
        # Clave natural real del contrato (id de proceso SECOP), no una combinación
        # de campos de negocio: permite detectar altas Y actualizaciones de estado.
        # Nullable a nivel de columna porque filas cargadas antes de este cambio
        # no tienen proceso_de_compra; NULL no colisiona consigo mismo en Postgres.
        UniqueConstraint("fuente", "proceso_de_compra", name="uq_contract_idempotent"),
        CheckConstraint("valor > 0", name="ck_valor_positivo"),
    )

    id                = Column(Integer, primary_key=True, autoincrement=True)
    entity_id         = Column(Integer, ForeignKey("entities.id"), nullable=False)
    supplier_id       = Column(Integer, ForeignKey("suppliers.id"), nullable=False)
    valor             = Column(Numeric(18, 2), nullable=False)
    fecha             = Column(Date, nullable=False)
    estado            = Column(String(100))
    fuente            = Column(String(100), nullable=False)
    proceso_de_compra = Column(String(150))
    extraido_en       = Column(DateTime, nullable=False, default=func.now())

    entity   = relationship("Entity", back_populates="contracts")
    supplier = relationship("Supplier", back_populates="contracts")

    def __repr__(self) -> str:
        return f"<Contract id={self.id} valor={self.valor} fecha={self.fecha}>"


class PipelineMeta(Base):
    """Metadatos del pipeline (ej. timestamp de la última corrida exitosa)."""
    __tablename__ = "pipeline_meta"

    key        = Column(String(100), primary_key=True)
    value      = Column(String(500), nullable=False)
    updated_at = Column(DateTime, nullable=False, default=func.now())


class PipelineRun(Base):
    """Una fila por corrida de pipeline.py — reemplaza a errors.md (que vive
    y muere con el runner efímero de GitHub Actions) como fuente de verdad
    de si una corrida realmente cargó datos o solo *pareció* exitosa."""
    __tablename__ = "pipeline_runs"

    id               = Column(Integer, primary_key=True, autoincrement=True)
    started_at       = Column(DateTime, nullable=False)
    finished_at      = Column(DateTime)
    # running | success | success_with_errors | degraded_aborted | failed
    status           = Column(String(30), nullable=False, default="running")
    modo             = Column(String(80))
    extracted_count  = Column(Integer, nullable=False, default=0)
    inserted_count   = Column(Integer, nullable=False, default=0)
    updated_count    = Column(Integer, nullable=False, default=0)
    rejected_count   = Column(Integer, nullable=False, default=0)
    failed_batches   = Column(Integer, nullable=False, default=0)
    total_batches    = Column(Integer, nullable=False, default=0)
    error_summary    = Column(String(2000))
    created_at       = Column(DateTime, nullable=False, default=func.now())

    def __repr__(self) -> str:
        return f"<PipelineRun id={self.id} status='{self.status}'>"


class PipelineBatchError(Base):
    """Detalle por lote fallido de una corrida — permite diagnosticar sin
    tener que ir a buscar en los logs crudos de GitHub Actions."""
    __tablename__ = "pipeline_batch_errors"

    id             = Column(Integer, primary_key=True, autoincrement=True)
    run_id         = Column(Integer, ForeignKey("pipeline_runs.id"), nullable=False)
    batch_number   = Column(Integer, nullable=False)
    approx_offset  = Column(Integer)
    error_type     = Column(String(200))
    error_message  = Column(String(2000))
    created_at     = Column(DateTime, nullable=False, default=func.now())


class RejectedRecord(Base):
    __tablename__ = "rejected_records"

    id             = Column(Integer, primary_key=True, autoincrement=True)
    fuente         = Column(String(100), nullable=False)
    payload_crudo  = Column(JSONB, nullable=False)
    motivo_rechazo = Column(String(100), nullable=False)
    fecha_rechazo  = Column(DateTime, nullable=False, default=func.now())

    def __repr__(self) -> str:
        return f"<RejectedRecord id={self.id} motivo='{self.motivo_rechazo}'>"
