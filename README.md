# ContrataData

Plataforma de datos abiertos que consolida, normaliza y visualiza contratos públicos del Estado colombiano extraídos de SECOP II y datos.gov.co.

**Live:** [contratadata.xyz](https://contratadata.xyz)

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
  api.contratadata.xyz
        │
        │  Vercel (Next.js)
        ▼
  contratadata.xyz
```

| Servicio | Plataforma | Rol |
|---|---|---|
| Frontend | Vercel | Next.js · CDN global · deploy automático en push a `main` |
| API REST | Railway | FastAPI · `api.contratadata.xyz` · deploy automático en push a `main` |
| ETL cron | GitHub Actions | `pipeline.py` diario a las 3 AM Colombia |
| Base de datos | Neon | PostgreSQL serverless |

---

## Ejecución local

### Requisitos

- Python 3.12+
- Node.js 18+ y pnpm 9+
- Variable `DATABASE_URL` en `.env`

### Backend

```bash
cp .env.example .env   # completar DATABASE_URL y SOCRATA_APP_TOKEN
pip install -r requirements.txt
python run_api.py
# → http://localhost:8000/api/docs
```

### Tests

```bash
pip install -r requirements-dev.txt
pytest tests/ -v --cov=src --cov-report=term-missing
```

Corren automáticamente en cada push (todas las ramas) vía GitHub Actions (`test.yml`).

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

La primera ejecución descarga todos los registros disponibles. Las corridas siguientes usan un cursor compuesto `(:updated_at, :id)` guardado en `pipeline_meta` y filtran la API de Socrata con `$where=(:updated_at > '<cursor>' OR (:updated_at = '<cursor>' AND :id > '<last_id>'))`. El `:id` desempata cuando la fuente hace un bulk update y miles/millones de filas quedan con el mismo `:updated_at` — sin él, cada corrida reprocesaría toda esa ventana aunque no haya nada realmente nuevo.

Antes de extraer nada, el pipeline hace un *preflight*: una consulta `count(*)` liviana contra el mismo cursor. Si la fuente no publicó cambios, la corrida termina en segundos (`success_no_changes` en `pipeline_runs`) en vez de re-descargar y re-cargar millones de filas ya vistas.

La carga es un upsert real: cada contrato se identifica por `(fuente, proceso_de_compra)` — el id de proceso de SECOP, no una combinación de campos de negocio — así que si Socrata reporta un cambio de `estado` o `valor` sobre un contrato ya cargado, la fila se actualiza en vez de insertarse duplicada o ignorarse.

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
| `PAGE_DELAY` | Segundos de espera entre páginas de Socrata (default `0.3`) | Opcional |
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
| Push a cualquier rama | GitHub Actions → `test.yml` corre la suite de tests |
| Push a `main` | Railway → redeploy automático del backend (integración nativa GitHub↔Railway) |
| Push a `main` | Vercel → redeploy automático del frontend (integración nativa GitHub↔Vercel) |
| Diario 3 AM Colombia (o manual vía `workflow_dispatch`) | GitHub Actions → `etl.yml` ejecuta `pipeline.py` (ETL incremental) |

Secrets requeridos en GitHub → Settings → Secrets → Actions (solo usados por `etl.yml`):

```
DATABASE_URL         → URL de Neon
SOCRATA_APP_TOKEN    → token de datos.gov.co
```

Railway y Vercel despliegan directamente desde su propia integración con el repo — no dependen de GitHub Actions.

---

## Estructura del proyecto

```
Procfile                  # Comando de producción para Railway
pipeline.py               # Orquestador ETL (incremental automático)
run_api.py                # Entry point uvicorn (desarrollo local)
migrate_proceso_de_compra.py  # Migración one-off ya aplicada (ver docstring)
migrate_supplier_unique.py    # Migración one-off ya aplicada (ver docstring)
.github/
  workflows/
    etl.yml               # ETL diario 3 AM + trigger manual (workflow_dispatch)
    test.yml              # Suite de tests en cada push
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

Documentación interactiva en `https://api.contratadata.xyz/api/docs`.

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
