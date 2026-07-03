'use client'

import { useState } from 'react'

interface Props {
  src: string
  alt: string
  title?: string
  subtitle?: string
}

/** Envoltorio para las imágenes PNG generadas con seaborn/matplotlib
 * (/api/charts/images/*.png): estado de carga y fallback visual si la
 * request falla (ej. 404 por filtro inválido — el backend ya devuelve un
 * PNG de fallback para fallas de renderizado, esto cubre fallas de red/HTTP). */
export default function ChartImage({ src, alt, title, subtitle }: Props) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading')

  return (
    <div>
      {title && (
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 3 }}>
          {title}
        </div>
      )}
      {subtitle && (
        <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 16 }}>
          {subtitle}
        </div>
      )}
      <div style={{ position: 'relative', minHeight: status === 'loaded' ? 0 : 180 }}>
        {status === 'loading' && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: 'var(--muted)', fontSize: 13,
          }}>
            Generando gráfica…
          </div>
        )}
        {status === 'error' ? (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            minHeight: 180, color: 'var(--muted)', fontSize: 13,
            border: '1px dashed var(--border)', borderRadius: 10,
          }}>
            No se pudo cargar esta gráfica.
          </div>
        ) : (
          <img
            src={src}
            alt={alt}
            onLoad={() => setStatus('loaded')}
            onError={() => setStatus('error')}
            style={{
              maxWidth: '100%', display: status === 'loaded' ? 'block' : 'none',
              margin: '0 auto', borderRadius: 8,
            }}
          />
        )}
      </div>
    </div>
  )
}
