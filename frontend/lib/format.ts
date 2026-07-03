export const fmtInt = (n: number) =>
  new Intl.NumberFormat('es-CO').format(Math.round(n))

export const fmtCOP = (n: number) =>
  '$' + new Intl.NumberFormat('es-CO').format(Math.round(n))

export const fmtAbbr = (v: number): string => {
  if (v >= 1e12) return '$' + (v / 1e12).toFixed(2) + ' B'
  if (v >= 1e9) return '$' + fmtInt(v / 1e9) + ' MM'
  if (v >= 1e6) return '$' + fmtInt(v / 1e6) + ' M'
  return '$' + fmtInt(v)
}

export const hexA = (h: string, a: number): string => {
  const n = parseInt(h.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

export const estadoStyle = (e: string | null | undefined) => {
  const map: Record<string, string> = {
    Activo: '#10B981',
    Liquidado: '#94A3B8',
    Terminado: '#6366F1',
    Suspendido: '#F59E0B',
  }
  const c = map[e ?? ''] ?? '#94A3B8'
  return { fg: c, bg: hexA(c, 0.15) }
}

export const fuenteStyle = (f: string) => {
  const c = f === 'SECOP' ? '#3B82F6' : '#8B5CF6'
  return { fg: c, bg: hexA(c, 0.15) }
}

export const pipelineRunStatusMeta = (status: string): { label: string; color: string } => {
  const map: Record<string, { label: string; color: string }> = {
    success: { label: 'Exitosa', color: '#10B981' },
    success_with_errors: { label: 'Con errores', color: '#F59E0B' },
    degraded_aborted: { label: 'Abortada', color: '#EF4444' },
    failed: { label: 'Fallida', color: '#EF4444' },
    running: { label: 'En curso', color: '#3B82F6' },
  }
  return map[status] ?? { label: status, color: '#94A3B8' }
}

export const fmtDateTime = (iso: string | null | undefined): string => {
  if (!iso) return '—'
  return new Date(iso.endsWith('Z') ? iso : iso + 'Z').toLocaleString('es-CO', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}
