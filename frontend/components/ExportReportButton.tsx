'use client'

import { useState } from 'react'
import { api } from '@/lib/api'
import { usePremium } from '@/lib/premium-context'

interface ExportReportButtonProps {
  kind: 'entity' | 'contractor'
  nombre: string
}

export default function ExportReportButton({ kind, nombre }: ExportReportButtonProps) {
  const { requirePro } = usePremium()
  const [open, setOpen] = useState(false)

  const reportUrl = (email: string, format: 'xlsx' | 'pdf') =>
    kind === 'entity'
      ? api.entityReportUrl(nombre, email, format)
      : api.contractorReportUrl(nombre, email, format)

  const download = (format: 'xlsx' | 'pdf') => {
    setOpen(false)
    requirePro(resolvedEmail => {
      window.open(reportUrl(resolvedEmail, format), '_blank')
    }, 'reports')
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: 'var(--surface2)',
          color: 'var(--text)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '9px 14px',
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        ↓ Exportar reporte
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 90 }} />
          <div style={{
            position: 'absolute', top: '110%', right: 0, zIndex: 100,
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.2)', overflow: 'hidden', minWidth: 140,
          }}>
            <button
              onClick={() => download('xlsx')}
              style={{
                display: 'block', width: '100%', textAlign: 'left', background: 'transparent',
                border: 'none', padding: '10px 14px', fontSize: 13, color: 'var(--text)', cursor: 'pointer',
              }}
              className="row-hover"
            >
              Excel (.xlsx)
            </button>
            <button
              onClick={() => download('pdf')}
              style={{
                display: 'block', width: '100%', textAlign: 'left', background: 'transparent',
                border: 'none', padding: '10px 14px', fontSize: 13, color: 'var(--text)', cursor: 'pointer',
                borderTop: '1px solid var(--border)',
              }}
              className="row-hover"
            >
              PDF
            </button>
          </div>
        </>
      )}
    </div>
  )
}
