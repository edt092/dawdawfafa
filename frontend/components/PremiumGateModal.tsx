'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

export type GateStep = 'email' | 'checking' | 'paywall' | 'lead-thanks'

interface PremiumGateModalProps {
  open: boolean
  step: GateStep
  email: string | null
  feature?: string
  onClose: () => void
  onEmailSubmit: (email: string) => void
  onLeadSubmitted: () => void
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

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

const primaryBtnStyle: React.CSSProperties = {
  background: 'var(--primary)',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  padding: '10px 18px',
  fontSize: 13.5,
  fontWeight: 600,
  cursor: 'pointer',
}

const BENEFICIOS = [
  'Alertas guardadas por entidad, contratista o filtro',
  'Monitor de competidores',
  'Reportes Excel/PDF de entidades y contratistas',
  'Filtros avanzados',
  'Acceso anticipado a nuevas funciones',
]

export default function PremiumGateModal({
  open, step, email, feature, onClose, onEmailSubmit, onLeadSubmitted,
}: PremiumGateModalProps) {
  const [emailInput, setEmailInput] = useState('')
  const [leadEmail, setLeadEmail] = useState('')
  const [leadStatus, setLeadStatus] = useState<'idle' | 'enviando' | 'error'>('idle')

  useEffect(() => {
    if (open) {
      setEmailInput(email ?? '')
      setLeadEmail(email ?? '')
      setLeadStatus('idle')
    }
  }, [open, email])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const emailValido = EMAIL_RE.test(emailInput.trim())
  const leadEmailValido = EMAIL_RE.test(leadEmail.trim())

  const submitLead = async () => {
    if (!leadEmailValido || leadStatus === 'enviando') return
    setLeadStatus('enviando')
    try {
      await api.submitPremiumLead({ email: leadEmail.trim(), feature })
      onLeadSubmitted()
    } catch {
      setLeadStatus('error')
    }
  }

  return (
    <div
      onClick={onClose}
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
          padding: 26, width: '100%', maxWidth: 440, maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em' }}>
            ContrataData Pro
          </h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 18, lineHeight: 1, padding: 4 }}
          >
            ✕
          </button>
        </div>

        {step === 'email' && (
          <>
            <p style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--muted)', margin: '10px 0 16px' }}>
              Ingresa tu email para ver si tienes acceso Pro activo.
            </p>
            <input
              type="email"
              value={emailInput}
              onChange={e => setEmailInput(e.target.value)}
              placeholder="tu@email.com"
              style={inputStyle}
              autoFocus
            />
            <button
              onClick={() => emailValido && onEmailSubmit(emailInput.trim())}
              disabled={!emailValido}
              style={{ ...primaryBtnStyle, marginTop: 14, width: '100%', opacity: emailValido ? 1 : 0.6, cursor: emailValido ? 'pointer' : 'not-allowed' }}
            >
              Continuar
            </button>
          </>
        )}

        {step === 'checking' && (
          <p style={{ fontSize: 13.5, color: 'var(--muted)', margin: '18px 0' }}>
            Verificando tu acceso…
          </p>
        )}

        {step === 'paywall' && (
          <>
            <p style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--muted)', margin: '10px 0 14px' }}>
              Esta función hace parte de ContrataData Pro. Déjanos tu email para acceso beta.
            </p>

            <ul style={{ margin: '0 0 16px', padding: '0 0 0 18px', fontSize: 13, color: 'var(--text)', lineHeight: 1.9 }}>
              {BENEFICIOS.map(b => <li key={b}>{b}</li>)}
            </ul>

            <div style={{
              display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 16,
              padding: '10px 14px', borderRadius: 8, background: 'var(--primary-weak)',
            }}>
              <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--primary)' }}>COP $149.000</span>
              <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>/mes · precio beta</span>
            </div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
              <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--muted)' }}>
                Email
              </span>
              <input
                type="email"
                value={leadEmail}
                onChange={e => setLeadEmail(e.target.value)}
                placeholder="tu@email.com"
                style={inputStyle}
              />
            </label>

            {leadStatus === 'error' && (
              <div style={{
                padding: '10px 12px', borderRadius: 8, fontSize: 13, marginBottom: 12,
                background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--danger)',
              }}>
                No pudimos registrar tu interés ahora. Intenta de nuevo en unos minutos.
              </div>
            )}

            <button
              onClick={submitLead}
              disabled={!leadEmailValido || leadStatus === 'enviando'}
              style={{
                ...primaryBtnStyle, width: '100%',
                opacity: !leadEmailValido || leadStatus === 'enviando' ? 0.6 : 1,
                cursor: !leadEmailValido || leadStatus === 'enviando' ? 'not-allowed' : 'pointer',
              }}
            >
              {leadStatus === 'enviando' ? 'Enviando…' : 'Solicitar acceso Pro'}
            </button>
          </>
        )}

        {step === 'lead-thanks' && (
          <>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: '14px 0 20px' }}>
              Gracias por tu interés en ContrataData Pro. Te contactaremos pronto para coordinar el acceso beta.
            </p>
            <button onClick={onClose} style={primaryBtnStyle}>Cerrar</button>
          </>
        )}
      </div>
    </div>
  )
}
