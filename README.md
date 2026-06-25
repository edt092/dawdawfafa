# ContrataData

Plataforma de datos abiertos que consolida, normaliza y visualiza contratos públicos del Estado colombiano extraídos de SECOP II y datos.gov.co.

**Live:** [contratadata.online](https://contratadata.online)

---

## Stack

| Capa | Tecnología |
|---|---|
| ETL | Python 3.12 · SQLAlchemy 2.0 · Socrata API (SODA) |
| Base de datos | PostgreSQL (Neon) |
| API | FastAPI · Pydantic v2 |
| Frontend | Next.js 14 (App Router) · TypeScript · Tailwind CSS |
| UI / Charts | shadcn/ui · Tremor · TanStack Query v5 |

---

## Arquitectura de producción

```
datos.gov.co / SECOP II
        │
        │  GitHub Actions (ETL diario 3 AM)
        ▼
     Neon (PostgreSQL)
        │
        │  Railway (FastAPI)
        ▼
  api.contratadata.online
        │
        │  Vercel (Next.js)
        ▼
  contratadata.online
```

| Servicio | Plataforma | Rol |
|---|---|---|
| Frontend | Vercel | Next.js · CDN global · deploy automático |
| API REST | Railway | FastAPI · `api.contratadata.online` |
| ETL cron | GitHub Actions | `pipeline.py` diario a las 3 AM Colombia |
| Base de datos | Neon | PostgreSQL serverless |

---

## Ejecución local

### Requisitos

- Python 3.12+
- Node.js 18+ y pnpm 11+
- Variable `DATABASE_URL` en `.env`

### Backend

```bash
pip install -r requirements.txt
python run_api.py
# → http://localhost:8000/api/docs
```

### Frontend

```bash
cd frontend
pnpm install
pnpm dev
# → http://localhost:3000
```

### ETL

```bash
# Primera carga completa
python pipeline.py

# Corridas siguientes: incremental automático desde last_run_at
python pipeline.py

# Forzar recarga completa
FORCE_FULL_LOAD=1 python pipeline.py
```

---

## Pipeline ETL — modo incremental

La primera ejecución descarga todos los registros disponibles y guarda un timestamp en `pipeline_meta`. Las corridas siguientes filtran la API de Socrata con `$where=:updated_at >= '<last_run>'`, extrayendo solo contratos nuevos o modificados desde entonces.

En producción el pipeline corre automáticamente cada día a las 3 AM (Colombia) vía GitHub Actions.

---

## Variables de entorno

### Backend (`.env` local / Railway en producción)

| Variable | Descripción | Requerida |
|---|---|---|
| `DATABASE_URL` | URL de conexión PostgreSQL (Neon) | Sí |
| `CORS_ORIGINS` | Orígenes permitidos separados por coma | Sí en prod |
| `SOCRATA_APP_TOKEN` | App Token para mayor cuota en datos.gov.co | Recomendado |
| `MAX_RECORDS` | Límite de registros a extraer (0 = sin límite) | Opcional |
| `DATE_FROM` | Filtrar por `fecha_de_firma >= YYYY-MM-DD` | Opcional |
| `FORCE_FULL_LOAD` | `1` para ignorar el timestamp y recargar todo | Opcional |
| `LOG_LEVEL` | `DEBUG` / `INFO` / `WARNING` | Opcional |
| `PORT` | Puerto del servidor (Railway lo inyecta automáticamente) | Railway |

### Frontend

| Variable | Descripción |
|---|---|
| `NEXT_PUBLIC_API_URL` | URL base de la API (default: `http://localhost:8000/api`) |

---

## CI/CD

| Evento | Acción |
|---|---|
| Push a `main` (archivos backend) | GitHub Actions → redeploy en Railway |
| Push a `main` (cualquier archivo) | Vercel → redeploy del frontend automáticamente |
| Diario 3 AM Colombia | GitHub Actions → ejecuta `pipeline.py` (ETL incremental) |

Secrets requeridos en GitHub → Settings → Secrets:

```
DATABASE_URL         → URL de Neon
SOCRATA_APP_TOKEN    → token de datos.gov.co
RAILWAY_DEPLOY_HOOK  → webhook de deploy de Railway
```

---

## Estructura del proyecto

```
Procfile                  # Comando de producción para Railway
pipeline.py               # Orquestador ETL (incremental automático)
run_api.py                # Entry point uvicorn (desarrollo local)
.github/
  workflows/
    etl.yml               # ETL diario 3 AM + trigger manual
    deploy.yml            # Redeploy Railway en push a main
src/
  extract/
    secop_socrata.py      # Adaptador Socrata (SODA API) con filtro :updated_at
  transform/
    normalize.py          # Normalización de nombres de entidades
    validate.py           # Validación y enrutamiento de rechazos
  load/
    models.py             # Modelos SQLAlchemy (Entity, Supplier, Contract, RejectedRecord, PipelineMeta)
    loader.py             # Carga idempotente + get/set last_run_at
  api/
    main.py               # App FastAPI + CORS
    routers/              # contracts, entidades, contratistas, charts, pipeline, estados
frontend/
  app/
    page.tsx              # Dashboard principal
    entidad/[slug]/       # Detalle de entidad pública
    contratista/[slug]/   # Detalle de proveedor/contratista
    pipeline/             # Monitor ETL
    sobre/                # Sobre el proyecto
  components/             # Navbar, KPICard, FilterBar, ContractsTable, charts
  lib/                    # api.ts, format.ts, types.ts, theme-context.tsx
  public/
    sitemap.xml           # Sitemap para Google Search Console
    robots.txt            # Directivas de crawling
    favicon.svg
    logo.svg
```

---

## Endpoints de la API

Documentación interactiva en `https://api.contratadata.online/api/docs`.

| Endpoint | Descripción |
|---|---|
| `GET /contracts` | Lista paginada con filtros (entidad, contratista, estado, desde, hasta) |
| `GET /contracts/aggregate` | KPIs del filtro actual (total, valor, entidades únicas, contratistas únicos) |
| `GET /entidades/` | Lista de entidades |
| `GET /entidades/{nombre}/summary` | KPIs de la entidad |
| `GET /entidades/{nombre}/contracts` | Contratos paginados de la entidad |
| `GET /entidades/{nombre}/top-contratistas` | Principales proveedores de la entidad |
| `GET /contratistas/{nombre}/summary` | KPIs del contratista |
| `GET /contratistas/{nombre}/contracts` | Contratos paginados del contratista |
| `GET /contratistas/{nombre}/top-entidades` | Principales clientes del contratista |
| `GET /contratistas/{nombre}/by-estado` | Distribución por estado |
| `GET /charts/top-entidades` | Top entidades por valor (filter-aware) |
| `GET /charts/evolucion` | Evolución mensual de contratación (filter-aware) |
| `GET /pipeline/status` | Estado de la base de datos |
| `GET /pipeline/stats` | Estadísticas globales |
| `GET /pipeline/rejected` | Registros rechazados por motivo y fuente |
| `GET /estados/` | Valores distintos de estado |
| `GET /health` | Health check |
