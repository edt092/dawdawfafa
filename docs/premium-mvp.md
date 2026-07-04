# MVP Premium — ContrataData Pro

Implementación inicial de las 4 funcionalidades premium descritas en
`scalability.md`: alertas guardadas, monitor de competidores, reportes
Excel/PDF y un plan Pro simple sin pagos automatizados todavía.

**Prioridad del MVP**: validar si usuarios reales pagarían por esto antes de
construir más — por eso no hay login, ni Stripe/MercadoPago, ni backoffice.

---

## Qué se agregó

### Tablas nuevas (`migrate_add_premium_tables.py`)

| Tabla | Para qué |
|---|---|
| `premium_users` | email → plan (`free`/`pro`) + estado (`active`/`trial`/`expired`) + vigencia |
| `premium_leads` | emails interesados desde el paywall suave (con qué feature lo disparó) |
| `saved_alerts` | alertas guardadas por email sobre un filtro (entidad/contratista/estado/rango de fecha/valor) |
| `competitor_watchlist` | contratistas seguidos por email (monitor de competidores) |

Ejecutar una sola vez contra producción:
```bash
python migrate_add_premium_tables.py
```

### Endpoints nuevos (`/api/...`)

| Método | Ruta | Gateado por Pro |
|---|---|---|
| POST | `/premium/leads` | No |
| GET | `/premium/status?email=` | No |
| POST | `/alerts?email=` | Sí |
| GET | `/alerts?email=` | Sí |
| PATCH | `/alerts/{id}?email=` | Sí |
| DELETE | `/alerts/{id}?email=` | Sí |
| POST | `/competitors?email=` | Sí |
| GET | `/competitors?email=` | Sí |
| DELETE | `/competitors/{id}?email=` | Sí |
| GET | `/reports/entity/{nombre}.xlsx?email=` | Sí |
| GET | `/reports/entity/{nombre}.pdf?email=` | Sí |
| GET | `/reports/contractor/{nombre}.xlsx?email=` | Sí |
| GET | `/reports/contractor/{nombre}.pdf?email=` | Sí |

El gating vive en `src/api/deps.py::require_pro` — un dependency de FastAPI
que resuelve `email` como query param, busca el `PremiumUser` y devuelve
**402** (no 403: es un tema de plan, no de permisos) si no hay plan Pro
activo. Se reutiliza en alerts/competitors/reports sin duplicar lógica.

### Frontend

- `frontend/lib/premium-context.tsx` (`PremiumProvider`/`usePremium`): identidad
  simple por email en `localStorage`, sin contraseñas. Expone `requirePro(onGranted, feature)`
  que se puede llamar desde cualquier botón: pide email si falta, valida el
  plan contra `/premium/status`, y si no es Pro abre el paywall con captura
  de lead. **`onGranted` recibe el email confirmado como argumento** — nunca
  leer `email` del closure del componente llamador, porque en el momento del
  click puede seguir siendo `null` si el usuario aún no se había identificado.
- `frontend/components/PremiumGateModal.tsx`: el modal de identificación +
  paywall (beneficios, precio COP $149.000/mes "precio beta", captura de lead).
- `frontend/components/PremiumPageGate.tsx`: empty-state reutilizable para
  páginas enteras premium (`/alertas`, `/competidores`).
- `SaveAlertButton` (en el dashboard, junto a `FilterBar`), `FollowCompetitorButton`
  (página de contratista), `ExportReportButton` (páginas de entidad y contratista).
- Páginas nuevas: `/alertas` ("Mis alertas") y `/competidores` ("Monitor de
  competidores" — reutiliza `contractorSummary`/`contractorTopEntidades`/
  `contractorByEstado` ya existentes, con link a la página de detalle completa
  para contratos recientes).
- Botón "ContrataData Pro" en el Navbar, visible en cualquier página.

### Otros scripts

- `admin_set_premium.py`: marcar/revertir manualmente un email como Pro (no
  hay backoffice — así se aplica un pago coordinado fuera de banda).
- `evaluate_alerts.py`: evalúa alertas activas contra contratos nuevos desde
  `last_checked_at` y lo avanza. **No envía email/push todavía** — solo loguea
  cuántos matches nuevos hay por alerta. Pensado para correr periódicamente
  (cron manual o un futuro workflow de GitHub Actions, separado de `pipeline.py`).

---

## Cómo probar el flujo Pro manualmente

```bash
# 1. Migrar
python migrate_add_premium_tables.py

# 2. Levantar backend y frontend
uvicorn src.api.main:app --reload --port 8000
cd frontend && npm run dev

# 3. En el navegador (localhost:3000):
#    - Clic en "Guardar alerta" / "Seguir competidor" / "Exportar reporte"
#      sin ser Pro → pide email → muestra paywall con precio.
#    - Enviar el lead ("Solicitar acceso Pro") → confirma en premium_leads:
python -c "
from src.load.loader import get_engine
from src.load.models import PremiumLead
from sqlalchemy.orm import Session
from sqlalchemy import select
import os
from dotenv import load_dotenv; load_dotenv()
with Session(get_engine(os.getenv('DATABASE_URL'))) as s:
    for l in s.execute(select(PremiumLead)).scalars():
        print(l.id, l.email, l.feature)
"

# 4. Marcar ese email como Pro:
python admin_set_premium.py tu@email.com --plan pro --status active

# 5. Repetir la acción en el navegador → ya no muestra paywall, la acción
#    se completa (alerta guardada / competidor seguido / reporte descargado).
```

---

## Verificado en esta implementación

- `pytest tests/` — 21 passed, 3 skipped (sin cambios, nada existente se rompió).
- `tsc --noEmit` y `next build` — sin errores, incluye `/alertas` y `/competidores`.
- Backend probado end-to-end contra Neon (branch de producción, datos de
  prueba limpiados después): gating 402 sin plan Pro, lead, `admin_set_premium.py`,
  CRUD completo de alertas y competidores, los 4 reportes (xlsx/pdf de entidad
  y contratista) descargados y abiertos con `openpyxl` para confirmar contenido real.
- No se pudo hacer clic real en un navegador (no hay Playwright/Puppeteer en
  este entorno) — se verificó que los textos y botones nuevos aparecen en el
  HTML servido de cada página (`/`, `/alertas`, `/competidores`, `/entidad/...`,
  `/contratista/...`).

---

## Qué queda pendiente para SaaS pago completo

- **Pagos automatizados**: hoy `admin_set_premium.py` es 100% manual. Integrar
  Stripe o MercadoPago (Wompi/ePayco son alternativas locales) para que el
  pago mueva `plan`/`premium_status` solo.
- **Autenticación real**: el acceso por email sin contraseña es deliberadamente
  inseguro para un MVP de validación — cualquiera que sepa un email puede ver/
  gestionar sus alertas y competidores. Antes de cobrar de verdad hace falta
  al menos un magic link (email con token de un solo uso) para confirmar que
  quien escribe el email es su dueño.
- **Envío real de alertas**: `evaluate_alerts.py` detecta matches pero no
  notifica. Conectarlo a `src/notify.py` (o un servicio de email dedicado)
  y programarlo (GitHub Actions con cron, separado de `etl.yml`).
- **`report_exports`** (tabla opcional mencionada en scalability.md, no
  implementada): un historial de qué reportes se generaron y cuándo, útil si
  se quiere limitar cuántos reportes por mes incluye el plan.
- **Edición de alertas más allá de nombre/activo/frecuencia** (cambiar los
  filtros de una alerta ya creada) — hoy hay que borrarla y crear una nueva.
- **Nickname editable de competidores** después de seguirlos.
