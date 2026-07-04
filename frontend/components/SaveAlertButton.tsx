'use client'

import { useState } from 'react'
import { api, type Filters, type Frecuencia } from '@/lib/api'
import { usePremium } from '@/lib/premium-context'

interface SaveAlertButtonProps {
  filters: Filters
}

type Status = 'idle' | 'guardando' | 'guardado' | 'error'

const inputStyle: React.CSSProperties = {
  background: 'var(--surface2)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '9px 11px',
  fontSize: 13.5,
  color: 'var(--text)',
  outline: 'none',
  width: '100%',
  fontFamily: 'inherit',
}

export default function SaveAlertButton({ filters }: SaveAlertButtonProps) {
  const { email, requirePro } = usePremium()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [frecuencia, setFrecuencia] = useState<Frecuencia>('daily')
  const [status, setStatus] = useState<Status>('idle')

  const hasFilters = !!(filters.entidad || filters.contratista || filters.estado || filters.desde || filters.hasta)

  const openForm = () => requirePro(() => setOpen(true), 'alerts')

  const save = async () => {
    if (!email || name.trim().length < 1) return
    setStatus('guardando')
    try {
      await api.createAlert(email, {
        name: name.trim(),
        entidad: filters.entidad || null,
        contratista: filters.contratista || null,
        estado: filters.estado || null,
        desde: filters.desde || null,
        hasta: filters.hasta || null,
        frecuencia,
      })
      setStatus('guardado')
      setTimeout(() => {
        setOpen(false)
        setName('')
        setStatus('idle')
      }, 1100)
    } catch {
      setStatus('error')
    }
  }

  return (
    <>
      <button
        onClick={openForm}
        title={hasFilters ? 'Guardar esta búsqueda como alerta' : 'Guardar una alerta (sin filtros aplicados = todos los contratos)'}
        style={{
          background: 'var(--surface2)',
          color: 'var(--text)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '10px 14px',
          fontSize: 13.5,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        🔔 Guardar alerta
      </button>

      {open && (
        <div
          onClick={() => status !== 'guardando' && setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(3px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="animate-fade"
            style={{
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
              padding: 24, width: '100%', maxWidth: 400,
            }}
          >
            <h3 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 800, color: 'var(--text)' }}>
              Guardar alerta
            </h3>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 16px' }}>
              Te avisamos cuando haya contratos nuevos que coincidan con estos filtros.
            </p>

            {status === 'guardado' ? (
              <p style={{ fontSize: 14, color: 'var(--success)', fontWeight: 600 }}>
                ✓ Alerta guardada. Puedes verla en "Mis alertas".
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--muted)' }}>
                    Nombre de la alerta
                  </span>
                  <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="ej. Contratos de Medellín en ejecución"
                    style={inputStyle}
                    autoFocus
                  />
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--muted)' }}>
                    Frecuencia
                  </span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {(['daily', 'weekly'] as Frecuencia[]).map(f => (
                      <button
                        key={f}
                        onClick={() => setFrecuencia(f)}
                        style={{
                          flex: 1,
                          background: frecuencia === f ? 'var(--primary)' : 'transparent',
                          color: frecuencia === f ? '#fff' : 'var(--muted)',
                          border: `1px solid ${frecuencia === f ? 'var(--primary)' : 'var(--border)'}`,
                          borderRadius: 8, padding: '8px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        }}
                      >
                        {f === 'daily' ? 'Diaria' : 'Semanal'}
                      </button>
                    ))}
                  </div>
                </label>

                {status === 'error' && (
                  <div style={{
                    padding: '10px 12px', borderRadius: 8, fontSize: 13,
                    background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--danger)',
                  }}>
                    No pudimos guardar la alerta. Intenta de nuevo.
                  </div>
                )}

                <button
                  onClick={save}
                  disabled={name.trim().length < 1 || status === 'guardando'}
                  style={{
                    background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8,
                    padding: '10px 18px', fontSize: 13.5, fontWeight: 600,
                    cursor: name.trim().length < 1 || status === 'guardando' ? 'not-allowed' : 'pointer',
                    opacity: name.trim().length < 1 || status === 'guardando' ? 0.6 : 1,
                  }}
                >
                  {status === 'guardando' ? 'Guardando…' : 'Guardar alerta'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
