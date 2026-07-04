"""Aplicación FastAPI — ContrataData API."""

import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.routers import (
    alerts, chart_images, charts, competitors, contratistas, contracts,
    entidades, estados, feedback, pipeline, premium, reports,
)

load_dotenv()

app = FastAPI(
    title="ContrataData API",
    description="API REST para datos de contratación pública colombiana (SECOP + datos.gov.co).",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# ── CORS ─────────────────────────────────────────────────────────────────────
_origins = [
    "http://localhost:3000",   # Next.js dev
    "http://localhost:3001",
    "http://127.0.0.1:3000",
]
extra = os.getenv("CORS_ORIGINS", "")
if extra:
    _origins.extend(o.strip() for o in extra.split(",") if o.strip())

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["*"],
)

# ── Routers ──────────────────────────────────────────────────────────────────
PREFIX = "/api"
app.include_router(contracts.router,    prefix=PREFIX)
app.include_router(entidades.router,    prefix=PREFIX)
app.include_router(contratistas.router, prefix=PREFIX)
app.include_router(charts.router,       prefix=PREFIX)
app.include_router(chart_images.router, prefix=PREFIX)
app.include_router(pipeline.router,     prefix=PREFIX)
app.include_router(estados.router,      prefix=PREFIX)
app.include_router(feedback.router,     prefix=PREFIX)
app.include_router(premium.router,      prefix=PREFIX)
app.include_router(alerts.router,       prefix=PREFIX)
app.include_router(competitors.router,  prefix=PREFIX)
app.include_router(reports.router,      prefix=PREFIX)


# ── Health ───────────────────────────────────────────────────────────────────
@app.get("/api/health", tags=["health"])
def health():
    return {"status": "ok"}
