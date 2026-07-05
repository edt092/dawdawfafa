'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { BarList } from '@tremor/react'
import { api, type ContractItem } from '@/lib/api'
import { fmtInt, fmtCOP, fmtAbbr, estadoStyle, fuenteStyle } from '@/lib/format'
import { useTheme } from '@/lib/theme-context'
import type { TableRow } from '@/lib/types'
import EstadoBadge from '@/components/EstadoBadge'
import FuenteBadge from '@/components/FuenteBadge'
import ChartImage from '@/components/charts/ChartImage'
import EvolucionChart from '@/components/charts/EvolucionChart'
import ExportReportButton from '@/components/ExportReportButton'
import { PREMIUM_ENABLED } from '@/lib/featureFlags'

function toRow(c: ContractItem, router: ReturnType<typeof useRouter>): TableRow {
  const es = estadoStyle(c.estado)
  const fu = fuenteStyle(c.fuente)
  return {
    id: String(c.id),
    fecha: typeof c.fecha === 'string' ? c.fecha : new Date(c.fecha).toISOString().slice(0, 10),
    entidad: c.entidad,
    contratista: c.contratista,
    valorFmt: fmtCOP(c.valor),
    estado: c.estado ?? '',
    estadoFg: es.fg, estadoBg: es.bg,
    fuente: c.fuente,
    fuenteFg: fu.fg, fuenteBg: fu.bg,
    openCon: () => router.push(`/contratista/${encodeURIComponent(c.contratista)}`),
  }
}

const thStyle: React.CSSProperties = {
  padding: '11px 16px', fontSize: 10.5, fontWeight: 600, letterSpacing: '0.07em',
  textTransform: 'uppercase', color: 'var(--muted)', fontFamily: 'var(--font-mono)',
  borderBottom: '1px solid var(--border)', textAlign: 'left', whiteSpace: 'nowrap',
}

export default function EntidadPage({ params }: { params: { slug: string } }) {
  const { slug } = params
  const router = useRouter()
  const { theme } = useTheme()
  const name = decodeURIComponent(slug)
  const [page, setPage] = useState(1)

  const summaryQ = useQuery({
    queryKey: ['entity-summary', name],
    queryFn: () => api.entitySummary(name),
  })
  const contractsQ = useQuery({
    queryKey: ['entity-contracts', name, page],
    queryFn: () => api.entityContracts(name, page),
  })
  const topConQ = useQuery({
    queryKey: ['entity-top-contratistas', name],
    queryFn: () => api.entityTopContratistas(name),
  })

  const summary = summaryQ.data
  const contracts = contractsQ.data
  const rows: TableRow[] = (contracts?.items ?? []).map(c => toRow(c, router))

  const topConData = (topConQ.data ?? []).map(e => ({
    name: e.nombre,
    value: e.valor_total,
  }))

  const totalPages = contracts?.total_pages ?? 1
  const totalItems = contracts?.total ?? 0

  return (
    <main style={{ maxWidth: 1340, margin: '0 auto', padding: '32px 28px 80px' }} className="animate-fade">
      <button
        onClick={() => router.back()}
        className="btn-link"
        style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', marginBottom: 18 }}
      >
        ← Volver al dashboard
      </button>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          {summary?.sigla && (
            <span style={{
              fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--primary)',
              background: 'var(--primary-weak)', borderRadius: 7, padding: '6px 10px', marginTop: 6, whiteSpace: 'nowrap',
            }}>
              {summary.sigla}
            </span>
          )}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>
              Entidad pública contratante
            </div>
            <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.1, color: 'var(--text)' }}>
              {name}
            </h1>
          </div>
        </div>
        {PREMIUM_ENABLED && <ExportReportButton kind="entity" nombre={name} />}
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 26 }}>
        {[
          { label: 'Total contratos', value: summaryQ.isLoading ? '—' : fmtInt(summary?.total_contratos ?? 0) },
          { label: 'Valor total', value: summaryQ.isLoading ? '—' : fmtAbbr(summary?.valor_total ?? 0), sub: summary ? fmtCOP(summary.valor_total) : '' },
          { label: 'Contratistas únicos', value: summaryQ.isLoading ? '—' : fmtInt(summary?.contratistas_unicos ?? 0) },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--muted)', fontFamily: 'var(--font-mono)', marginBottom: 12 }}>
              {k.label}
            </div>
            <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
              {k.value}
            </div>
            {k.sub && <div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-mono)', marginTop: 7 }}>{k.sub}</div>}
          </div>
        ))}
      </div>

      {/* Principales contratistas */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 18 }}>Principales contratistas</div>
        {topConQ.isLoading
          ? <div style={{ color: 'var(--muted)', fontSize: 13 }}>Cargando…</div>
          : <BarList
              data={topConData}
              valueFormatter={(v: number) => fmtAbbr(v)}
              onValueChange={item => router.push(`/contratista/${encodeURIComponent(item.name)}`)}
              color="blue"
            />
        }
      </div>

      {/* Evolución de gasto por mes */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 26 }}>
        <EvolucionChart theme={theme} entidad={name} />
      </div>

      {/* Boxenplot de valores por estado */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 26 }}>
        <ChartImage
          src={api.imageUrl('/charts/images/entity-boxenplot.png', { theme, entidad: name })}
          alt={`Distribución de valores de contratos por estado — ${name}`}
          title="¿Cómo cambia el tamaño de los contratos según el estado?"
          subtitle="Distribución de valores en escala logarítmica, agrupados por estado del contrato."
        />
      </div>

      {/* Table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ fontSize: 13, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
            {contractsQ.isLoading ? 'Cargando…' : `${fmtInt(totalItems)} contratos`}
          </span>
          {totalPages > 1 && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-link"
                style={{ fontSize: 12, color: page === 1 ? 'var(--border)' : 'var(--muted)', fontWeight: 600 }}
              >
                ← Anterior
              </button>
              <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>{page}/{totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="btn-link"
                style={{ fontSize: 12, color: page === totalPages ? 'var(--border)' : 'var(--muted)', fontWeight: 600 }}
              >
                Siguiente →
              </button>
            </div>
          )}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr>
                <th style={thStyle}>Fecha</th>
                <th style={thStyle}>Contratista</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Valor</th>
                <th style={thStyle}>Estado</th>
                <th style={thStyle}>Fuente</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="row-hover" style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '13px 16px', fontFamily: 'var(--font-mono)', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{r.fecha}</td>
                  <td style={{ padding: '13px 16px' }}>
                    <button className="btn-link-con" onClick={r.openCon}>{r.contratista}</button>
                  </td>
                  <td style={{ padding: '13px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                    {r.valorFmt}
                  </td>
                  <td style={{ padding: '13px 16px' }}><EstadoBadge estado={r.estado} /></td>
                  <td style={{ padding: '13px 16px' }}><FuenteBadge fuente={r.fuente} /></td>
                </tr>
              ))}
              {!contractsQ.isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                    Sin contratos para esta entidad.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  )
}
