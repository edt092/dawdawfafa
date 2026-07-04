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

// Valores reales de contracts.estado en SECOP (ver `SELECT DISTINCT estado
// FROM contracts`) — no son Activo/Liquidado/Terminado como se asumía antes,
// por lo que casi todo caía en el color por defecto. Mismo mapeo que
// ESTADO_COLORS en src/api/chart_render.py, para que el color de un estado
// signifique lo mismo en los badges interactivos y en las gráficas estáticas
// de seaborn. Orden fijo, nunca ciclado.
export const estadoStyle = (e: string | null | undefined) => {
  const map: Record<string, string> = {
    'En ejecución': '#3B82F6',
    'Cerrado': '#94A3B8',
    'Modificado': '#6366F1',
    'terminado': '#64748B',
    'Aprobado': '#10B981',
    'cedido': '#F59E0B',
    'Suspendido': '#EF4444',
    'Borrador': '#CBD5E1',
    'Prorrogado': '#14B8A6',
    'En aprobación': '#0EA5E9',
    'Cancelado': '#DC2626',
    'enviado Proveedor': '#A855F7',
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
    success_no_changes: { label: 'Sin cambios', color: '#10B981' },
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
