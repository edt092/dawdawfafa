'use client'

import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BarList } from '@tremor/react'
import { api, type CompetitorItem } from '@/lib/api'
import { fmtInt, fmtAbbr, estadoStyle } from '@/lib/format'
import { usePremium } from '@/lib/premium-context'

interface CompetitorCardProps {
  competitor: CompetitorItem
}

export default function CompetitorCard({ competitor }: CompetitorCardProps) {
  const router = useRouter()
  const { email } = usePremium()
  const queryClient = useQueryClient()
  const name = competitor.supplier_name

  const summaryQ = useQuery({
    queryKey: ['contractor-summary', name],
    queryFn: () => api.contractorSummary(name),
  })
  const topEntQ = useQuery({
    queryKey: ['contractor-top-entidades', name],
    queryFn: () => api.contractorTopEntidades(name),
  })
  const byEstadoQ = useQuery({
    queryKey: ['contractor-by-estado', name],
    queryFn: () => api.contractorByEstado(name),
  })

  const unfollow = async () => {
    if (!email) return
    await api.unfollowCompetitor(email, competitor.id)
    queryClient.invalidateQueries({ queryKey: ['my-competitors', email] })
  }

  const summary = summaryQ.data
  const topEntData = (topEntQ.data ?? []).slice(0, 5).map(e => ({ name: e.nombre, value: e.valor_total }))

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
            {competitor.nickname || name}
          </div>
          {competitor.nickname && (
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{name}</div>
          )}
        </div>
        <button onClick={unfollow} className="btn-link" style={{ fontSize: 12, fontWeight: 600, color: 'var(--danger)', flexShrink: 0 }}>
          Dejar de seguir
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 4 }}>Contratos</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>{summaryQ.isLoading ? '—' : fmtInt(summary?.total_contratos ?? 0)}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 4 }}>Valor total</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>{summaryQ.isLoading ? '—' : fmtAbbr(summary?.valor_total ?? 0)}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 4 }}>Entidades cliente</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>{summaryQ.isLoading ? '—' : fmtInt(summary?.entidades_unicas ?? 0)}</div>
        </div>
      </div>

      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 8 }}>Entidades donde contrata</div>
      {topEntQ.isLoading ? (
        <div style={{ color: 'var(--muted)', fontSize: 12.5, marginBottom: 14 }}>Cargando…</div>
      ) : topEntData.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontSize: 12.5, marginBottom: 14 }}>Sin datos.</div>
      ) : (
        <div style={{ marginBottom: 14 }}>
          <BarList data={topEntData} valueFormatter={fmtAbbr} color="blue" />
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        {(byEstadoQ.data ?? []).map(e => {
          const s = estadoStyle(e.estado)
          return (
            <span key={e.estado} style={{
              fontSize: 11, fontWeight: 600, padding: '4px 9px', borderRadius: 6,
              color: s.fg, background: s.bg,
            }}>
              {e.estado} · {e.cantidad}
            </span>
          )
        })}
      </div>

      <button
        onClick={() => router.push(`/contratista/${encodeURIComponent(name)}`)}
        className="btn-link"
        style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--primary)' }}
      >
        Ver detalle completo →
      </button>
    </div>
  )
}
