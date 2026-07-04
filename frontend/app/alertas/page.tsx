'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiErrorStatus, type SavedAlertItem } from '@/lib/api'
import { usePremium } from '@/lib/premium-context'
import { fmtDateTime } from '@/lib/format'
import PremiumPageGate from '@/components/PremiumPageGate'

const thStyle: React.CSSProperties = {
  padding: '11px 16px',
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
  fontFamily: 'var(--font-mono)',
  borderBottom: '1px solid var(--border)',
  textAlign: 'left',
  whiteSpace: 'nowrap',
}

function resumenFiltros(a: SavedAlertItem): string {
  const partes: string[] = []
  if (a.entidad) partes.push(`entidad: ${a.entidad}`)
  if (a.contratista) partes.push(`contratista: ${a.contratista}`)
  if (a.estado) partes.push(`estado: ${a.estado}`)
  if (a.desde) partes.push(`desde ${a.desde}`)
  if (a.hasta) partes.push(`hasta ${a.hasta}`)
  if (a.valor_min) partes.push(`valor ≥ ${a.valor_min}`)
  if (a.valor_max) partes.push(`valor ≤ ${a.valor_max}`)
  return partes.length ? partes.join(' · ') : 'Todos los contratos'
}

export default function AlertasPage() {
  const { email } = usePremium()
  const queryClient = useQueryClient()

  const alertsQ = useQuery({
    queryKey: ['my-alerts', email],
    queryFn: () => api.listAlerts(email!),
    enabled: !!email,
    retry: false,
  })

  const needsPro = apiErrorStatus(alertsQ.error) === 402

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['my-alerts', email] })

  const toggleActive = async (alert: SavedAlertItem) => {
    if (!email) return
    await api.updateAlert(email, alert.id, { is_active: !alert.is_active })
    invalidate()
  }

  const remove = async (alert: SavedAlertItem) => {
    if (!email) return
    await api.deleteAlert(email, alert.id)
    invalidate()
  }

  return (
    <main style={{ maxWidth: 1340, margin: '0 auto', padding: '32px 28px 80px' }} className="animate-fade">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, letterSpacing: '-0.025em', color: 'var(--text)' }}>
          Mis alertas
        </h1>
        <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--muted)', maxWidth: 560 }}>
          Guarda una búsqueda desde el dashboard con "Guardar alerta" para avisarte cuando haya contratos nuevos que coincidan.
        </p>
      </div>

      <PremiumPageGate needsPro={needsPro} feature="alerts_page">
        {alertsQ.isLoading ? (
          <div style={{ color: 'var(--muted)', fontSize: 14 }}>Cargando…</div>
        ) : !alertsQ.data || alertsQ.data.length === 0 ? (
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
            padding: '56px 20px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
              Aún no tienes alertas guardadas
            </div>
            <div style={{ fontSize: 13.5, color: 'var(--muted)' }}>
              Ve al dashboard, aplica los filtros que te interesan y usa "Guardar alerta".
            </div>
          </div>
        ) : (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Nombre</th>
                    <th style={thStyle}>Filtros</th>
                    <th style={thStyle}>Frecuencia</th>
                    <th style={thStyle}>Último chequeo</th>
                    <th style={thStyle}>Estado</th>
                    <th style={thStyle}></th>
                  </tr>
                </thead>
                <tbody>
                  {alertsQ.data.map(a => (
                    <tr key={a.id} className="row-hover" style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '13px 16px', fontWeight: 600, color: 'var(--text)' }}>{a.name}</td>
                      <td style={{ padding: '13px 16px', color: 'var(--muted)', maxWidth: 320 }}>{resumenFiltros(a)}</td>
                      <td style={{ padding: '13px 16px', color: 'var(--muted)' }}>{a.frecuencia === 'daily' ? 'Diaria' : 'Semanal'}</td>
                      <td style={{ padding: '13px 16px', color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>
                        {a.last_checked_at ? fmtDateTime(a.last_checked_at) : 'Aún no'}
                      </td>
                      <td style={{ padding: '13px 16px' }}>
                        <button
                          onClick={() => toggleActive(a)}
                          style={{
                            background: a.is_active ? 'rgba(16,185,129,0.15)' : 'var(--surface2)',
                            color: a.is_active ? 'var(--success)' : 'var(--muted)',
                            border: '1px solid var(--border)', borderRadius: 8,
                            padding: '6px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                          }}
                        >
                          {a.is_active ? 'Activa' : 'Pausada'}
                        </button>
                      </td>
                      <td style={{ padding: '13px 16px' }}>
                        <button className="btn-link" onClick={() => remove(a)} style={{ color: 'var(--danger)', fontSize: 12.5, fontWeight: 600 }}>
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </PremiumPageGate>
    </main>
  )
}
