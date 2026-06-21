# ContrataData

Plataforma de datos abiertos que consolida, normaliza y visualiza contratos públicos del Estado colombiano extraídos de SECOP y datos.gov.co.

## Stack

| Capa | Tecnología |
|---|---|
| ETL | Python 3.12 · SQLAlchemy 2.0 · Socrata API (SODA) |
| Base de datos | PostgreSQL (Neon) |
| API | FastAPI · Pydantic v2 |
| Frontend | Next.js 14 (App Router) · TypeScript · Tailwind CSS |
| UI / Charts | shadcn/ui · Tremor · TanStack Query v5 |

## Arquitectura

```
datos.gov.co / SECOP  →  Extractor  →  Normalizador  →  Validador  →  PostgreSQL
                                                                            ↓
                                                                        FastAPI
                                                                            ↓
                                                                       Next.js 14
```

## Ejecución local

### Requisitos previos

- Python 3.12+
- Node.js 18+ y pnpm 11+
- Variable `DATABASE_URL` configurada en `.env`

### Backend (FastAPI)

```bash
pip install -r requirements.txt

# Arrancar la API (puerto 8000)
python run_api.py
# → http://localhost:8000/api/docs
```

### Frontend (Next.js)

```bash
cd frontend
pnpm install
pnpm dev
# → http://localhost:3000
```

### Pipeline ETL

```bash
# Primera vez: carga completa de todos los registros disponibles
python pipeline.py

# Corridas posteriores: detecta automáticamente el último timestamp
# y extrae solo registros nuevos/modificados en Socrata desde entonces
python pipeline.py

# Forzar recarga completa (ignora el timestamp guardado)
FORCE_FULL_LOAD=1 python pipeline.py
```

## Pipeline ETL — modo incremental

En la primera ejecución el pipeline descarga todos los registros disponibles. Al finalizar guarda un timestamp en la tabla `pipeline_meta` de la base de datos. En las corridas posteriores filtra la API de Socrata con `$where=:updated_at >= '<last_run>'`, extrayendo únicamente contratos añadidos o modificados desde entonces.

Esto elimina la necesidad de re-escanear el dataset completo en cada corrida y reduce el consumo de cuota de la API. Recomendado ejecutar vía cron diario (p.ej. 3 AM).

## Variables de entorno

| Variable | Descripción | Requerida |
|---|---|---|
| `DATABASE_URL` | URL de conexión PostgreSQL (Neon) | Sí |
| `SOCRATA_APP_TOKEN` | App Token para mayor cuota en datos.gov.co | Recomendado |
| `MAX_RECORDS` | Límite de registros a extraer (0 = sin límite) | Opcional |
| `DATE_FROM` | Filtrar por `fecha_de_firma >= YYYY-MM-DD` (backfill manual) | Opcional |
| `FORCE_FULL_LOAD` | `1` para ignorar el timestamp y hacer carga completa | Opcional |
| `LOG_LEVEL` | Nivel de logging (`DEBUG` / `INFO` / `WARNING`) | Opcional |

El frontend usa `NEXT_PUBLIC_API_URL` (default: `http://localhost:8000/api`) configurable en `frontend/.env.local`.

## Estructura

```
pipeline.py               # Orquestador ETL (incremental automático)
run_api.py                # Entry point uvicorn
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
    main.py               # App FastAPI
    routers/              # contracts, entidades, contratistas, charts, pipeline
frontend/
  app/
    page.tsx              # Dashboard principal
    entidad/[slug]/       # Detalle de entidad pública
    contratista/[slug]/   # Detalle de proveedor/contratista
    pipeline/             # Monitor ETL (solo acceso directo por URL)
    sobre/                # Sobre el proyecto
  components/             # Navbar, KPICard, FilterBar, ContractsTable, charts
  lib/                    # api.ts, format.ts, types.ts, theme-context.tsx
  public/
    favicon.svg           # Ícono de la marca
    logo.svg              # Logo completo con texto
```

## Endpoints de la API

Todos prefijados bajo `/api`. Documentación interactiva en `/api/docs`.

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
| `GET /contratistas/{nombre}/by-estado` | Distribución de contratos por estado |
| `GET /charts/top-entidades` | Top entidades por valor (filter-aware) |
| `GET /charts/evolucion` | Evolución mensual de contratación (filter-aware) |
| `GET /pipeline/status` | Estado de la base de datos |
| `GET /pipeline/stats` | Estadísticas globales |
| `GET /pipeline/rejected` | Registros rechazados por motivo y fuente |
| `GET /estados/` | Valores distintos de estado |
| `GET /health` | Health check |

## Competencias demostradas

- Pipeline ETL incremental con detección automática del modo (completo vs. delta) basado en timestamp persistido en PostgreSQL
- Carga idempotente con `ON CONFLICT DO NOTHING` y trazabilidad de rechazos con payload crudo
- Modelado relacional normalizado con SQLAlchemy 2.0 (Entity, Supplier, Contract, RejectedRecord, PipelineMeta)
- API REST con FastAPI y Pydantic v2 (tipado estricto, documentación automática)
- Frontend full-stack con Next.js 14 App Router, TypeScript y Tailwind CSS
- Data fetching reactivo con TanStack Query v5 (caché, estados de carga/error, filtros encadenados)
- Tema dark/light sin dependencias externas de theming
- Consumo de APIs públicas mediante el protocolo Socrata (SODA)
