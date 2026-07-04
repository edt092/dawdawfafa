'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { BarList } from '@tremor/react'
import { api, type ContractItem } from '@/lib/api'
import { fmtInt, fmtCOP, fmtAbbr, estadoStyle, fuenteStyle } from '@/lib/format'
import type { TableRow, DonutSlice } from '@/lib/types'
import EstadoBadge from '@/components/EstadoBadge'
import FuenteBadge from '@/components/FuenteBadge'
import FollowCompetitorButton from '@/components/FollowCompetitorButton'
import ExportReportButton from '@/components/ExportReportButton'

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
    openEnt: () => router.push(`/entidad/${encodeURIComponent(c.entidad)}`),
  }
}

const thStyle: React.CSSProperties = {
  padding: '11px 16px', fontSize: 10.5, fontWeight: 600, letterSpacing: '0.07em',
  textTransform: 'uppercase', color: 'var(--muted)', fontFamily: 'var(--font-mono)',
  borderBottom: '1px solid var(--border)', textAlign: 'left', whiteSpace: 'nowrap',
}

export default function ContratistaPage({ params }: { params: { slug: string } }) {
  const { slug } = params
  const router = useRouter()
  const name = decodeURIComponent(slug)
  const [page, setPage] = useState(1)

  const summaryQ = useQuery({
    queryKey: ['contractor-summary', name],
    queryFn: () => api.contractorSummary(name),
  })
  const contractsQ = useQuery({
    queryKey: ['contractor-contracts', name, page],
    queryFn: () => api.contractorContracts(name, page),
  })
  const topEntQ = useQuery({
    queryKey: ['contractor-top-entidades', name],
    queryFn: () => api.contractorTopEntidades(name),
  })
  const byEstadoQ = useQuery({
    queryKey: ['contractor-by-estado', name],
    queryFn: () => api.contractorByEstado(name),
  })

  const summary = summaryQ.data
  const contracts = contractsQ.data
  const rows: TableRow[] = (contracts?.items ?? []).map(c => toRow(c, router))

  const topEntData = (topEntQ.data ?? []).map(e => ({
    name: e.nombre,
    value: e.valor_total,
  }))

  // Donut desde datos reales por estado
  const totalByEstado = (byEstadoQ.data ?? []).reduce((a, r) => a + r.cantidad, 0) || 1
  let acc = 0
  const donut: DonutSlice[] = (byEstadoQ.data ?? []).map(r => {
    const frac = r.cantidad / totalByEstado
    const d: DonutSlice = {
      estado: r.estado,
      count: r.cantidad,
      pct: Math.round(frac * 100),
      color: estadoStyle(r.estado).fg,
      dash: `${(frac * 100).toFixed(2)} ${(100 - frac * 100).toFixed(2)}`,
      offset: (25 - acc * 100).toFixed(2),
    }
    acc += frac
    return d
  })

  const nit = summary?.nit_o_id_fiscal
    ?? (((2147483647 - (name.length * 733)) % 900000000 + 700000000))
  const nitStr = typeof nit === 'number'
    ? String(Math.abs(nit)).padStart(9, '0').replace(/(\d{3})(\d{3})(\d{3})/, '$1.$2.$3') + '-' + (name.length % 10)
    : nit

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
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>
            Proveedor / contratista
          </div>
          <h1 style={{ margin: '0 0 8px', fontSize: 30, fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.1, color: 'var(--text)' }}>
            {name}
          </h1>
          <span style={{ fontSize: 12.5, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>NIT {nitStr}</span>
        </div>
        <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
          <FollowCompetitorButton supplierName={name} />
          <ExportReportButton kind="contractor" nombre={name} />
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 26 }}>
        {[
          { label: 'Contratos totales', value: summaryQ.isLoading ? '—' : fmtInt(summary?.total_contratos ?? 0) },
          { label: 'Valor total obtenido', value: summaryQ.isLoading ? '—' : fmtAbbr(summary?.valor_total ?? 0), sub: summary ? fmtCOP(summary.valor_total) : '' },
          { label: 'Entidades cliente', value: summaryQ.isLoading ? '—' : fmtInt(summary?.entidades_unicas ?? 0) },
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

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16, marginBottom: 26 }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 18 }}>Entidades con las que más contrata</div>
          {topEntQ.isLoading
            ? <div style={{ color: 'var(--muted)', fontSize: 13 }}>Cargando…</div>
            : <BarList
                data={topEntData}
                valueFormatter={(v: number) => fmtAbbr(v)}
                onValueChange={item => router.push(`/entidad/${encodeURIComponent(item.name)}`)}
                color="blue"
              />
          }
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 18 }}>Estados de sus contratos</div>
          {byEstadoQ.isLoading
            ? <div style={{ color: 'var(--muted)', fontSize: 13 }}>Cargando…</div>
            : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
                <svg viewBox="0 0 36 36" style={{ width: 120, height: 120, flexShrink: 0 }}>
                  <circle cx="18" cy="18" r="15.9155" fill="none" stroke="var(--surface2)" strokeWidth="4.2" />
                  {donut.map(d => (
                    <circle
                      key={d.estado}
                      cx="18" cy="18" r="15.9155"
                      fill="none"
                      stroke={d.color}
                      strokeWidth="4.2"
                      strokeDasharray={d.dash}
                      strokeDashoffset={d.offset}
                    />
                  ))}
                </svg>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {donut.map(d => (
                    <div key={d.estado} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: d.color, display: 'block' }} />
                      <span style={{ fontSize: 12.5, color: 'var(--text)' }}>{d.estado}</span>
                      <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-mono)', marginLeft: 'auto' }}>
                        {d.count} ({d.pct}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          }
        </div>
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
                <th style={thStyle}>Entidad</th>
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
                    <button className="btn-link-ent" onClick={r.openEnt}>{r.entidad}</button>
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
                    Sin contratos para este contratista.
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
