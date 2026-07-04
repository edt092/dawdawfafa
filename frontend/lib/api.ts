const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api'

function buildUrl(path: string, params?: Record<string, string | number | boolean | undefined | null>): string {
  const url = new URL(`${API}${path}`)
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
    })
  }
  return url.toString()
}

async function get<T>(path: string, params?: Record<string, string | number | boolean | undefined | null>): Promise<T> {
  const res = await fetch(buildUrl(path, params), { next: { revalidate: 0 } })
  if (!res.ok) throw new Error(`API ${res.status} — ${path}`)
  return res.json()
}

async function send<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = new Error(`API ${res.status} — ${path}`) as Error & { status?: number }
    err.status = res.status
    throw err
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

const post = <T>(path: string, body: unknown) => send<T>('POST', path, body)
const patch = <T>(path: string, body: unknown) => send<T>('PATCH', path, body)
const del = <T>(path: string) => send<T>('DELETE', path)

// 402 = requiere plan Pro (ver src/api/deps.py::require_pro) — las páginas
// premium usan esto para distinguir "falta plan Pro" de un error genérico.
export const apiErrorStatus = (err: unknown): number | undefined =>
  (err as { status?: number } | null)?.status

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ContractItem {
  id: number
  entidad: string
  contratista: string
  valor: number
  fecha: string
  estado: string | null
  fuente: string
  extraido_en: string
}

export interface ContractListResponse {
  items: ContractItem[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

export interface ContractAggregate {
  total_contratos: number
  valor_total: number
  entidades_unicas: number
  contratistas_unicos: number
}

export interface GlobalStats {
  total_contratos: number
  valor_total: number
  valor_promedio: number
  entidades_unicas: number
  contratistas_unicos: number
  fecha_mas_antigua: string | null
  fecha_mas_reciente: string | null
}

export interface BarItem {
  nombre: string
  valor_total: number
  porcentaje: number
}

export interface MonthlyPoint {
  periodo: string
  valor_total: number
  cantidad: number
}

export interface CalidadItem {
  motivo: string
  fuente: string
  cantidad: number
}

export interface EntitySummary {
  nombre: string
  sigla: string | null
  total_contratos: number
  valor_total: number
  contratistas_unicos: number
}

export interface ContractorSummary {
  nombre: string
  nit_o_id_fiscal: string | null
  total_contratos: number
  valor_total: number
  entidades_unicas: number
}

export interface ContractorByEstado {
  estado: string
  cantidad: number
}

export interface PipelineStatus {
  db_ok: boolean
  db_latency_ms: number | null
  total_contratos: number
  total_entidades: number
  total_proveedores: number
  total_rechazados: number
}

export interface PipelineRunItem {
  id: number
  started_at: string
  finished_at: string | null
  status: string
  modo: string | null
  extracted_count: number
  inserted_count: number
  updated_count: number
  rejected_count: number
  failed_batches: number
  total_batches: number
  error_summary: string | null
}

export type FeedbackType = 'no_encontre' | 'dificil_buscar' | 'error' | 'sugerencia' | 'otro'
export type FeedbackImportance = 'baja' | 'media' | 'alta'

export interface FeedbackPayload {
  feedback_type: FeedbackType
  comment: string
  email?: string
  importance: FeedbackImportance
  consent_contact: boolean
  page_url?: string
  route?: string
  filters_json?: Record<string, string> | null
  user_agent?: string
  viewport?: string
  referrer?: string
}

export interface FeedbackResponse {
  id: number
  status: string
  reward_status: string
}

// ── Premium (MVP — ver scalability.md) ───────────────────────────────────────

export interface PremiumStatus {
  email: string
  plan: 'free' | 'pro'
  premium_status: 'active' | 'trial' | 'expired'
  premium_until: string | null
  is_pro: boolean
}

export interface PremiumLeadPayload {
  email: string
  feature?: string
}

export interface PremiumLeadResponse {
  id: number
  email: string
}

export type Frecuencia = 'daily' | 'weekly'

export interface SavedAlertPayload {
  name: string
  entidad?: string | null
  contratista?: string | null
  estado?: string | null
  desde?: string | null
  hasta?: string | null
  valor_min?: number | null
  valor_max?: number | null
  frecuencia: Frecuencia
}

export interface SavedAlertItem {
  id: number
  user_email: string
  name: string
  entidad: string | null
  contratista: string | null
  estado: string | null
  desde: string | null
  hasta: string | null
  valor_min: number | null
  valor_max: number | null
  frecuencia: string
  is_active: boolean
  last_checked_at: string | null
  created_at: string
  updated_at: string
}

export interface CompetitorPayload {
  supplier_name: string
  nickname?: string | null
}

export interface CompetitorItem {
  id: number
  user_email: string
  supplier_name: string
  nickname: string | null
  is_active: boolean
  created_at: string
}

export type Filters = {
  entidad?: string
  contratista?: string
  estado?: string
  desde?: string
  hasta?: string
}

// ── API calls ─────────────────────────────────────────────────────────────────

export const api = {
  // Global
  health: () => get<{ status: string }>('/health'),
  globalStats: () => get<GlobalStats>('/pipeline/stats'),

  // Contracts
  contracts: (f: Filters & { page?: number; per_page?: number }) =>
    get<ContractListResponse>('/contracts', f),

  contractsAggregate: (f: Filters) =>
    get<ContractAggregate>('/contracts/aggregate', f),

  // Filter options
  entidades: () => get<string[]>('/entidades'),
  estados: () => get<string[]>('/estados'),

  // Charts (filter-aware)
  topEntidades: (f?: Filters & { limit?: number }) =>
    get<BarItem[]>('/charts/top-entidades', { limit: 15, ...f }),
  evolucion: (f?: Filters) =>
    get<MonthlyPoint[]>('/charts/evolucion', f),

  // Entity detail
  entitySummary: (nombre: string) =>
    get<EntitySummary>(`/entidades/${encodeURIComponent(nombre)}/summary`),
  entityContracts: (nombre: string, page = 1) =>
    get<ContractListResponse>(`/entidades/${encodeURIComponent(nombre)}/contracts`, { page }),
  entityTopContratistas: (nombre: string) =>
    get<BarItem[]>(`/entidades/${encodeURIComponent(nombre)}/top-contratistas`),

  // Contractor detail
  contractorSummary: (nombre: string) =>
    get<ContractorSummary>(`/contratistas/${encodeURIComponent(nombre)}/summary`),
  contractorContracts: (nombre: string, page = 1) =>
    get<ContractListResponse>(`/contratistas/${encodeURIComponent(nombre)}/contracts`, { page }),
  contractorTopEntidades: (nombre: string) =>
    get<BarItem[]>(`/contratistas/${encodeURIComponent(nombre)}/top-entidades`),
  contractorByEstado: (nombre: string) =>
    get<ContractorByEstado[]>(`/contratistas/${encodeURIComponent(nombre)}/by-estado`),

  // Pipeline monitor
  pipelineStatus: () => get<PipelineStatus>('/pipeline/status'),
  pipelineRejected: () => get<CalidadItem[]>('/pipeline/rejected'),
  pipelineRuns: () => get<PipelineRunItem[]>('/pipeline/runs'),

  // Imágenes seaborn/matplotlib (visualizaciones estáticas analíticas)
  imageUrl: (path: string, params?: Record<string, string | number | boolean | undefined | null>) =>
    buildUrl(path, params),

  // Feedback de usuarios (user testing, sin login)
  submitFeedback: (payload: FeedbackPayload) => post<FeedbackResponse>('/feedback', payload),

  // Premium — acceso por email, sin login (ver scalability.md)
  premiumStatus: (email: string) => get<PremiumStatus>('/premium/status', { email }),
  submitPremiumLead: (payload: PremiumLeadPayload) => post<PremiumLeadResponse>('/premium/leads', payload),

  // Alertas guardadas (plan Pro)
  createAlert: (email: string, payload: SavedAlertPayload) =>
    post<SavedAlertItem>(`/alerts?${new URLSearchParams({ email })}`, payload),
  listAlerts: (email: string) => get<SavedAlertItem[]>('/alerts', { email }),
  updateAlert: (email: string, id: number, payload: Partial<Pick<SavedAlertItem, 'name' | 'is_active' | 'frecuencia'>>) =>
    patch<SavedAlertItem>(`/alerts/${id}?${new URLSearchParams({ email })}`, payload),
  deleteAlert: (email: string, id: number) => del<void>(`/alerts/${id}?${new URLSearchParams({ email })}`),

  // Monitor de competidores (plan Pro)
  followCompetitor: (email: string, payload: CompetitorPayload) =>
    post<CompetitorItem>(`/competitors?${new URLSearchParams({ email })}`, payload),
  listCompetitors: (email: string) => get<CompetitorItem[]>('/competitors', { email }),
  unfollowCompetitor: (email: string, id: number) => del<void>(`/competitors/${id}?${new URLSearchParams({ email })}`),

  // Reportes Excel/PDF (plan Pro) — URLs de descarga directa
  entityReportUrl: (nombre: string, email: string, format: 'xlsx' | 'pdf' = 'xlsx') =>
    buildUrl(`/reports/entity/${encodeURIComponent(nombre)}.${format}`, { email }),
  contractorReportUrl: (nombre: string, email: string, format: 'xlsx' | 'pdf' = 'xlsx') =>
    buildUrl(`/reports/contractor/${encodeURIComponent(nombre)}.${format}`, { email }),
}
