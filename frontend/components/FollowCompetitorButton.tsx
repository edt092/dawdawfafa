'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { usePremium } from '@/lib/premium-context'

interface FollowCompetitorButtonProps {
  supplierName: string
}

export default function FollowCompetitorButton({ supplierName }: FollowCompetitorButtonProps) {
  const { email, requirePro } = usePremium()
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)

  const listQ = useQuery({
    queryKey: ['my-competitors', email],
    queryFn: () => api.listCompetitors(email!),
    enabled: !!email,
    retry: false,
  })

  const existing = listQ.data?.find(c => c.supplier_name === supplierName)

  const follow = async (resolvedEmail: string) => {
    setBusy(true)
    try {
      await api.followCompetitor(resolvedEmail, { supplier_name: supplierName })
      queryClient.invalidateQueries({ queryKey: ['my-competitors', resolvedEmail] })
    } finally {
      setBusy(false)
    }
  }

  const unfollow = async () => {
    if (!email || !existing) return
    setBusy(true)
    try {
      await api.unfollowCompetitor(email, existing.id)
      queryClient.invalidateQueries({ queryKey: ['my-competitors', email] })
    } finally {
      setBusy(false)
    }
  }

  const handleClick = () => {
    if (existing) {
      unfollow()
      return
    }
    requirePro(follow, 'competitors')
  }

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      style={{
        background: existing ? 'rgba(16,185,129,0.15)' : 'var(--surface2)',
        color: existing ? 'var(--success)' : 'var(--text)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '9px 14px',
        fontSize: 13,
        fontWeight: 600,
        cursor: busy ? 'wait' : 'pointer',
        opacity: busy ? 0.7 : 1,
      }}
    >
      {existing ? '✓ Siguiendo competidor' : '+ Seguir competidor'}
    </button>
  )
}
