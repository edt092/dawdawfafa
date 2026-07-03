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
}
