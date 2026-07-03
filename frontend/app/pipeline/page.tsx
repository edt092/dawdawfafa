'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { fmtDateTime, fmtInt, fuenteStyle, pipelineRunStatusMeta } from '@/lib/format'

const thStyle: React.CSSProperties = {
  padding: '11px 18px', fontSize: 10.5, fontWeight: 600, letterSpacing: '0.07em',
  textTransform: 'uppercase', color: 'var(--muted)', fontFamily: 'var(--font-mono)',
  borderBottom: '1px solid var(--border)', textAlign: 'left', whiteSpace: 'nowrap',
}

export default function PipelinePage() {
  const statusQ = useQuery({
    queryKey: ['pipeline-status'],
    queryFn: api.pipelineStatus,
    refetchInterval: 30_000,
  })
  const rejectedQ = useQuery({
    queryKey: ['pipeline-rejected'],
    queryFn: api.pipelineRejected,
  })
  const runsQ = useQuery({
    queryKey: ['pipeline-runs'],
    queryFn: api.pipelineRuns,
    refetchInterval: 30_000,
  })

  const status = statusQ.data
  const rejected = rejectedQ.data ?? []
  const runs = runsQ.data ?? []
  const maxCant = rejected.reduce((m, r) => Math.max(m, r.cantidad), 1)

  const dbOk = status?.db_ok ?? null
  const latency = status?.db_latency_ms != null ? `${status.db_latency_ms.toFixed(0)} ms` : '—'

  const kpis = [
    { label: 'Total contratos', value: status ? fmtInt(status.total_contratos) : '—', color: 'var(--text)' },
    { label: 'Entidades únicas', value: status ? fmtInt(status.total_entidades) : '—', color: 'var(--success)' },
    { label: 'Proveedores únicos', value: status ? fmtInt(status.total_proveedores) : '—', color: 'var(--warning)' },
    { label: 'Registros rechazados', value: status ? fmtInt(status.total_rechazados) : '—', color: 'var(--danger)' },
  ]

  return (
    <main style={{ maxWidth: 1340, margin: '0 auto', padding: '32px 28px 80px' }} className="animate-fade">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, letterSpacing: '-0.025em', color: 'var(--text)' }}>
            Monitor de pipeline
          </h1>
          <p style={{ margin: '9px 0 0', fontSize: 14, color: 'var(--muted)' }}>
            Estado del proceso ETL de extracción, normalización y carga.
          </p>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px',
        }}>
          <span
            className="animate-pulse-dot"
            style={{
              width: 9, height: 9, borderRadius: '50%',
              background: dbOk === null ? 'var(--muted)' : dbOk ? 'var(--success)' : 'var(--danger)',
              boxShadow: dbOk ? '0 0 0 4px rgba(16,185,129,.18)' : 'none',
              display: 'block',
            }}
          />
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>
              PostgreSQL · {dbOk === null ? 'verificando…' : dbOk ? 'conectado' : 'error de conexión'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
              Neon DB · {latency}
            </div>
          </div>
        </div>
      </div>

      {/* Error banner */}
      {statusQ.isError && (
        <div style={{
          marginBottom: 20, padding: '14px 18px', borderRadius: 10,
          background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
          color: 'var(--danger)', fontSize: 13.5,
        }}>
          No se pudo conectar con la API FastAPI. Verifica que esté corriendo en{' '}
          <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>localhost:8000</code>.
        </div>
      )}

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 28 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--muted)', fontFamily: 'var(--font-mono)', marginBottom: 12 }}>
              {k.label}
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.03em', color: k.color, fontVariantNumeric: 'tabular-nums' }}>
              {k.value}
            </div>
          </div>
        ))}
      </div>

      {/* Runs history */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
          Historial de corridas del pipeline
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
          <thead>
            <tr>
              <th style={thStyle}>Inicio</th>
              <th style={thStyle}>Modo</th>
              <th style={thStyle}>Estado</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Extraídos</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Insertados</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Actualizados</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Lotes fallidos</th>
            </tr>
          </thead>
          <tbody>
            {runsQ.isLoading && (
              <tr>
                <td colSpan={7} style={{ padding: '24px 18px', color: 'var(--muted)', fontSize: 13 }}>Cargando…</td>
              </tr>
            )}
            {runs.map((r) => {
              const meta = pipelineRunStatusMeta(r.status)
              return (
                <tr key={r.id} className="row-hover" style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '13px 18px', fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>
                    {fmtDateTime(r.started_at)}
                  </td>
                  <td style={{ padding: '13px 18px', color: 'var(--muted)', fontSize: 12.5 }}>
                    {r.modo ?? '—'}
                  </td>
                  <td style={{ padding: '13px 18px' }}>
                    <span style={{
                      display: 'inline-block', padding: '3px 9px', borderRadius: 6,
                      fontSize: 11.5, fontWeight: 600, fontFamily: 'var(--font-mono)',
                      color: meta.color, background: `${meta.color}26`,
                    }}>
                      {meta.label}
                    </span>
                  </td>
                  <td style={{ padding: '13px 18px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>
                    {fmtInt(r.extracted_count)}
                  </td>
                  <td style={{ padding: '13px 18px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--success)' }}>
                    {fmtInt(r.inserted_count)}
                  </td>
                  <td style={{ padding: '13px 18px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>
                    {fmtInt(r.updated_count)}
                  </td>
                  <td style={{ padding: '13px 18px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, color: r.failed_batches > 0 ? 'var(--danger)' : 'var(--text)' }}>
                    {r.failed_batches > 0 ? `${r.failed_batches}/${r.total_batches}` : '0'}
                  </td>
                </tr>
              )
            })}
            {!runsQ.isLoading && runs.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: '24px 18px', color: 'var(--muted)', fontSize: 13 }}>
                  Sin corridas registradas todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Rejects Table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
          Registros rechazados por motivo y fuente
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
          <thead>
            <tr>
              <th style={thStyle}>Motivo</th>
              <th style={thStyle}>Fuente</th>
              <th style={thStyle}>Frecuencia</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Cantidad</th>
            </tr>
          </thead>
          <tbody>
            {rejectedQ.isLoading && (
              <tr>
                <td colSpan={4} style={{ padding: '24px 18px', color: 'var(--muted)', fontSize: 13 }}>Cargando…</td>
              </tr>
            )}
            {rejected.map((r, i) => {
              const fu = fuenteStyle(r.fuente)
              const pct = Math.round(r.cantidad / maxCant * 100)
              return (
                <tr key={i} className="row-hover" style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '13px 18px', fontFamily: 'var(--font-mono)', color: 'var(--text)', fontWeight: 600 }}>
                    {r.motivo}
                  </td>
                  <td style={{ padding: '13px 18px' }}>
                    <span style={{
                      display: 'inline-block', padding: '3px 9px', borderRadius: 6,
                      fontSize: 11.5, fontWeight: 600, fontFamily: 'var(--font-mono)',
                      color: fu.fg, background: fu.bg,
                    }}>
                      {r.fuente}
                    </span>
                  </td>
                  <td style={{ padding: '13px 18px', width: '45%' }}>
                    <span style={{ height: 9, background: 'var(--surface2)', borderRadius: 5, display: 'block', overflow: 'hidden', maxWidth: 340 }}>
                      <span style={{ display: 'block', height: '100%', background: 'var(--danger)', borderRadius: 5, width: `${pct}%`, opacity: 0.8 }} />
                    </span>
                  </td>
                  <td style={{ padding: '13px 18px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text)' }}>
                    {r.cantidad}
                  </td>
                </tr>
              )
            })}
            {!rejectedQ.isLoading && rejected.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: '24px 18px', color: 'var(--muted)', fontSize: 13 }}>
                  Sin registros rechazados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  )
}
