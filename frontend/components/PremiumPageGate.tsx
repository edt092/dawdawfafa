'use client'

import type { ReactNode } from 'react'
import { usePremium } from '@/lib/premium-context'

interface PremiumPageGateProps {
  needsPro: boolean
  feature: string
  children: ReactNode
}

/** Empty state para páginas enteras de Pro (Mis alertas, Competidores):
 * pide email si no hay uno guardado, o muestra el paywall si el email no
 * tiene plan Pro activo (distinguido vía 402 — ver apiErrorStatus). */
export default function PremiumPageGate({ needsPro, feature, children }: PremiumPageGateProps) {
  const { email, requirePro } = usePremium()

  if (!email || needsPro) {
    return (
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
        padding: '56px 20px', textAlign: 'center',
      }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
          {!email ? 'Identifícate para continuar' : 'Esta función es parte de ContrataData Pro'}
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--muted)', marginBottom: 16 }}>
          {!email
            ? 'Usamos tu email para guardar tus alertas y competidores — sin contraseñas.'
            : 'Déjanos tu email para acceso beta a esta función.'}
        </div>
        <button
          onClick={() => requirePro(() => {}, feature)}
          style={{
            background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8,
            padding: '10px 18px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
          }}
        >
          {!email ? 'Identificarme' : 'Ver ContrataData Pro'}
        </button>
      </div>
    )
  }

  return <>{children}</>
}
