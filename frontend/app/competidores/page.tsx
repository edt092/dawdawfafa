'use client'

import { useQuery } from '@tanstack/react-query'
import { api, apiErrorStatus } from '@/lib/api'
import { usePremium } from '@/lib/premium-context'
import PremiumPageGate from '@/components/PremiumPageGate'
import CompetitorCard from '@/components/CompetitorCard'

export default function CompetidoresPage() {
  const { email } = usePremium()

  const competitorsQ = useQuery({
    queryKey: ['my-competitors', email],
    queryFn: () => api.listCompetitors(email!),
    enabled: !!email,
    retry: false,
  })

  const needsPro = apiErrorStatus(competitorsQ.error) === 402

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

      <PremiumPageGate needsPro={needsPro} feature="competitors_page">
        {competitorsQ.isLoading ? (
          <div style={{ color: 'var(--muted)', fontSize: 14 }}>Cargando…</div>
        ) : !competitorsQ.data || competitorsQ.data.length === 0 ? (
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
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
            {competitorsQ.data.map(c => (
              <CompetitorCard key={c.id} competitor={c} />
            ))}
          </div>
        )}
      </PremiumPageGate>
    </main>
  )
}
