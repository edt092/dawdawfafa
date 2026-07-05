'use client'

import { notFound } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useMe } from '@/lib/useMe'
import PremiumGate from '@/components/PremiumGate'
import CompetitorCard from '@/components/CompetitorCard'

// Página oculta a propósito hasta pasar a producción — ver Navbar.tsx.
// Quitar esta línea cuando esté lista para mostrarse.
const HIDDEN_UNTIL_PRODUCTION = true

function CompetitorsList() {
  const { auth0User } = useMe()

  const competitorsQ = useQuery({
    queryKey: ['my-competitors', auth0User?.sub],
    queryFn: api.listCompetitors,
  })

  if (competitorsQ.isLoading) {
    return <div style={{ color: 'var(--muted)', fontSize: 14 }}>Cargando…</div>
  }

  if (!competitorsQ.data || competitorsQ.data.length === 0) {
    return (
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
        padding: '56px 20px', textAlign: 'center',
      }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
          Aún no sigues ningún competidor
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--muted)' }}>
          Ve a la página de un contratista y usa "Seguir competidor".
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
      {competitorsQ.data.map(c => (
        <CompetitorCard key={c.id} competitor={c} />
      ))}
    </div>
  )
}

export default function CompetidoresPage() {
  if (HIDDEN_UNTIL_PRODUCTION) notFound()

  return (
    <main style={{ maxWidth: 1340, margin: '0 auto', padding: '32px 28px 80px' }} className="animate-fade">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, letterSpacing: '-0.025em', color: 'var(--text)' }}>
          Monitor de competidores
        </h1>
        <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--muted)', maxWidth: 560 }}>
          Sigue contratistas específicos desde su página de detalle con "Seguir competidor" para verlos aquí.
        </p>
      </div>

      <PremiumGate feature="competitor_monitor">
        <CompetitorsList />
      </PremiumGate>
    </main>
  )
}
