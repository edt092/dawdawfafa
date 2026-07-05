'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { api, type ContractItem, type Filters } from '@/lib/api'
import { fmtInt, fmtCOP, fmtAbbr, estadoStyle, fuenteStyle } from '@/lib/format'
import { useTheme } from '@/lib/theme-context'
import type { TableRow } from '@/lib/types'
import KPICard from '@/components/KPICard'
import FilterBar from '@/components/FilterBar'
import ContractsTable from '@/components/ContractsTable'
import TopEntidadesChart from '@/components/charts/TopEntidadesChart'
import EvolucionChart from '@/components/charts/EvolucionChart'
import CalidadChart from '@/components/charts/CalidadChart'
import ChartImage from '@/components/charts/ChartImage'
import FeedbackBanner from '@/components/FeedbackBanner'
import SaveAlertButton from '@/components/SaveAlertButton'
import { PREMIUM_ENABLED } from '@/lib/featureFlags'

const PER_PAGE = 50
type ChartTab = 'entidades' | 'evolucion' | 'calidad' | 'calendario' | 'distribucion'

function toTableRow(c: ContractItem, router: ReturnType<typeof useRouter>): TableRow {
  const es = estadoStyle(c.estado)
  const fu = fuenteStyle(c.fuente)
  return {
    id: String(c.id),
    fecha: typeof c.fecha === 'string' ? c.fecha : new Date(c.fecha).toISOString().slice(0, 10),
    entidad: c.entidad,
    contratista: c.contratista,
    valorFmt: fmtCOP(c.valor),
    estado: c.estado ?? '',
    estadoFg: es.fg,
    estadoBg: es.bg,
    fuente: c.fuente,
    fuenteFg: fu.fg,
    fuenteBg: fu.bg,
    openEnt: () => router.push(`/entidad/${encodeURIComponent(c.entidad)}`),
    openCon: () => router.push(`/contratista/${encodeURIComponent(c.contratista)}`),
  }
}

export default function DashboardPage() {
  const router = useRouter()
  const { theme } = useTheme()

  // Draft state (lo que el usuario escribe antes de aplicar)
  const [dEntidad, setDEntidad] = useState('Todas')
  const [dContratista, setDContratista] = useState('')
  const [dEstado, setDEstado] = useState('Todos')
  const [dDesde, setDDesde] = useState('')
  const [dHasta, setDHasta] = useState('')

  // Applied state (lo que dispara re-fetch)
  const [fEntidad, setFEntidad] = useState('')
  const [fContratista, setFContratista] = useState('')
  const [fEstado, setFEstado] = useState('')
  const [fDesde, setFDesde] = useState('')
  const [fHasta, setFHasta] = useState('')

  const [page, setPage] = useState(1)
  const [chartTab, setChartTab] = useState<ChartTab>('entidades')

  const filters: Filters = {
    entidad: fEntidad || undefined,
    contratista: fContratista || undefined,
    estado: fEstado || undefined,
    desde: fDesde || undefined,
    hasta: fHasta || undefined,
  }

  // ── Queries ──────────────────────────────────────────────────────────────────
  const entidadesQ = useQuery({
    queryKey: ['entidades-list'],
    queryFn: api.entidades,
    staleTime: Infinity,
  })
  const estadosQ = useQuery({
    queryKey: ['estados-list'],
    queryFn: api.estados,
    staleTime: Infinity,
  })
  const statsQ = useQuery({
    queryKey: ['contracts-aggregate', filters],
    queryFn: () => api.contractsAggregate(filters),
  })
  const contractsQ = useQuery({
    queryKey: ['contracts', filters, page],
    queryFn: () => api.contracts({ ...filters, page, per_page: PER_PAGE }),
  })
  const topEntidadesQ = useQuery({
    queryKey: ['top-entidades', filters],
    queryFn: () => api.topEntidades(filters),
    enabled: chartTab === 'entidades',
  })
  const calidadQ = useQuery({
    queryKey: ['pipeline-rejected'],
    queryFn: api.pipelineRejected,
    staleTime: 5 * 60_000,
    enabled: chartTab === 'calidad',
  })

  // ── Derived data ─────────────────────────────────────────────────────────────
  const stats = statsQ.data
  const contracts = contractsQ.data
  const pageRows: TableRow[] = (contracts?.items ?? []).map(c => toTableRow(c, router))

  const totalPages = contracts?.total_pages ?? 1
  const currentPage = contracts?.page ?? 1
  const totalItems = contracts?.total ?? 0
  const showFrom = totalItems ? (currentPage - 1) * PER_PAGE + 1 : 0
  const showTo = Math.min(currentPage * PER_PAGE, totalItems)
  const pageInfo = `Mostrando ${fmtInt(showFrom)}–${fmtInt(showTo)} de ${fmtInt(totalItems)} contratos`

  // ── Actions ──────────────────────────────────────────────────────────────────
  const applyFilters = () => {
    setFEntidad(dEntidad === 'Todas' ? '' : dEntidad)
    setFContratista(dContratista)
    setFEstado(dEstado === 'Todos' ? '' : dEstado)
    setFDesde(dDesde)
    setFHasta(dHasta)
    setPage(1)
  }

  const clearFilters = () => {
    setDEntidad('Todas'); setDContratista(''); setDEstado('Todos'); setDDesde(''); setDHasta('')
    setFEntidad(''); setFContratista(''); setFEstado(''); setFDesde(''); setFHasta('')
    setPage(1)
  }

  const exportCSV = async () => {
    const all = await api.contracts({ ...filters, page: 1, per_page: 10000 })
    const head = ['id', 'fecha', 'entidad', 'contratista', 'valor', 'estado', 'fuente']
    const esc = (v: string | number | null) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [
      head.join(','),
      ...all.items.map(c =>
        [c.id, c.fecha, esc(c.entidad), esc(c.contratista), c.valor, c.estado ?? '', c.fuente].join(',')
      ),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'contratos_contratadata.csv'
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const chartTabs: { key: ChartTab; label: string }[] = [
    { key: 'entidades', label: 'Top entidades' },
    { key: 'evolucion', label: 'Evolución temporal' },
    { key: 'calidad', label: 'Calidad de datos' },
    { key: 'calendario', label: 'Calendario' },
    { key: 'distribucion', label: 'Distribución' },
  ]

  const isLoading = statsQ.isLoading || contractsQ.isLoading
  const hasError = statsQ.isError || contractsQ.isError

  return (
    <main style={{ maxWidth: 1340, margin: '0 auto', padding: '32px 28px 80px' }} className="animate-fade">

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap', marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 34, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1, color: 'var(--text)' }}>
            Contratación pública de Colombia
          </h1>
          <p style={{ margin: '11px 0 0', fontSize: 15, color: 'var(--muted)', maxWidth: 560 }}>
            Datos de contratación pública en Colombia, consolidados y explorables en tiempo real.
          </p>
        </div>
      </div>

      <FeedbackBanner />

      {/* Error banner */}
      {hasError && (
        <div style={{
          marginBottom: 20, padding: '14px 18px', borderRadius: 10,
          background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
          color: 'var(--danger)', fontSize: 13.5,
        }}>
          No se pudo conectar con la API. Verifica que FastAPI esté corriendo en{' '}
          <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>localhost:8000</code>.
        </div>
      )}

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
        <KPICard
          label="Total contratos"
          value={isLoading ? '—' : fmtInt(stats?.total_contratos ?? 0)}
          sub={isLoading ? '' : `${fmtInt(totalItems)} en filtro actual`}
          subColor="var(--success)"
          accentColor="var(--primary)"
        />
        <KPICard
          label="Valor total"
          value={isLoading ? '—' : fmtAbbr(stats?.valor_total ?? 0)}
          sub={isLoading ? '' : `COP · ${fmtCOP(stats?.valor_total ?? 0)}`}
          accentColor="var(--success)"
        />
        <KPICard
          label="Entidades públicas"
          value={isLoading ? '—' : fmtInt(stats?.entidades_unicas ?? 0)}
          sub="contratantes únicas"
          accentColor="var(--warning)"
        />
        <KPICard
          label="Contratistas"
          value={isLoading ? '—' : fmtInt(stats?.contratistas_unicos ?? 0)}
          sub="proveedores únicos"
          accentColor="#8B5CF6"
        />
      </div>

      {/* Filters */}
      <FilterBar
        entidadOptions={['Todas', ...(entidadesQ.data ?? [])]}
        estadoOptions={['Todos', ...(estadosQ.data ?? [])]}
        dEntidad={dEntidad}
        dContratista={dContratista}
        dEstado={dEstado}
        dDesde={dDesde}
        dHasta={dHasta}
        onEntidad={setDEntidad}
        onContratista={setDContratista}
        onEstado={setDEstado}
        onDesde={setDDesde}
        onHasta={setDHasta}
        onApply={applyFilters}
        onClear={clearFilters}
      />

      {PREMIUM_ENABLED && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20, marginTop: -8 }}>
          <SaveAlertButton filters={filters} />
        </div>
      )}

      {/* Contracts Table */}
      <ContractsTable
        rows={pageRows}
        pageInfo={pageInfo}
        currentPage={currentPage}
        totalPages={totalPages}
        isEmpty={!contractsQ.isLoading && totalItems === 0}
        onPrev={() => setPage(p => Math.max(1, p - 1))}
        onNext={() => setPage(p => Math.min(totalPages, p + 1))}
        onExport={exportCSV}
        onClearFilters={clearFilters}
      />

      {/* Chart Section */}
      <div style={{
        marginTop: 28,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4, padding: '12px 14px',
          borderBottom: '1px solid var(--border)', flexWrap: 'wrap',
        }}>
          {chartTabs.map(t => (
            <button
              key={t.key}
              onClick={() => setChartTab(t.key)}
              style={{
                background: chartTab === t.key ? 'var(--primary)' : 'transparent',
                color: chartTab === t.key ? '#fff' : 'var(--muted)',
                border: `1px solid ${chartTab === t.key ? 'var(--primary)' : 'var(--border)'}`,
                borderRadius: 8, padding: '8px 14px', fontSize: 13,
                fontWeight: 600, cursor: 'pointer',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ padding: '22px 22px 26px' }}>
          {chartTab === 'entidades' && (
            topEntidadesQ.isLoading
              ? <div style={{ color: 'var(--muted)', fontSize: 14 }}>Cargando gráfica…</div>
              : <TopEntidadesChart
                  items={topEntidadesQ.data ?? []}
                  onItemClick={n => router.push(`/entidad/${encodeURIComponent(n)}`)}
                />
          )}
          {chartTab === 'evolucion' && (
            <EvolucionChart
              theme={theme}
              entidad={filters.entidad}
              estado={filters.estado}
              desde={filters.desde}
              hasta={filters.hasta}
            />
          )}
          {chartTab === 'calidad' && (
            calidadQ.isLoading
              ? <div style={{ color: 'var(--muted)', fontSize: 14 }}>Cargando gráfica…</div>
              : <CalidadChart data={calidadQ.data ?? []} />
          )}
          {chartTab === 'calendario' && (
            <ChartImage
              src={api.imageUrl('/charts/images/monthly-heatmap.png', { theme, entidad: filters.entidad })}
              alt="Mapa de calor de contratación por año y mes"
              title="¿En qué meses se concentra más contratación?"
              subtitle="Cantidad de contratos por año/mes — respeta el filtro de entidad."
            />
          )}
          {chartTab === 'distribucion' && (
            <ChartImage
              src={api.imageUrl('/charts/images/value-distribution.png', {
                theme, entidad: filters.entidad, estado: filters.estado, desde: filters.desde, hasta: filters.hasta,
              })}
              alt="Distribución de valores de contratos"
              title="¿La mayoría de contratos son pequeños o pocos concentran mucho dinero?"
              subtitle="Distribución de valores en escala logarítmica — respeta los filtros activos."
            />
          )}
        </div>
      </div>
    </main>
  )
}
