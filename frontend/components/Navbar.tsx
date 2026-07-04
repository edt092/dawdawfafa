'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from '@/lib/theme-context'
import { useFeedback } from '@/lib/feedback-context'
import { usePremium } from '@/lib/premium-context'

const NAV = [
  { label: 'Dashboard', href: '/' },
  { label: 'Mis alertas', href: '/alertas' },
  { label: 'Competidores', href: '/competidores' },
  { label: 'Sobre el proyecto', href: '/sobre' },
]

export default function Navbar() {
  const pathname = usePathname()
  const { theme, toggleTheme } = useTheme()
  const { openFeedback } = useFeedback()
  const { requirePro } = usePremium()

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' || pathname.startsWith('/entidad') || pathname.startsWith('/contratista') : pathname === href

  return (
    <header style={{
      position: 'sticky',
      top: 0,
      zIndex: 60,
      background: 'color-mix(in srgb, var(--surface) 88%, transparent)',
      backdropFilter: 'blur(10px)',
      borderBottom: '1px solid var(--border)',
    }}>
      <div style={{
        maxWidth: 1340,
        margin: '0 auto',
        padding: '0 28px',
        height: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 24,
      }}>
        <Link href="/" style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          textDecoration: 'none',
        }}>
          <img src="/favicon.svg" alt="ContrataData" width="40" height="27" style={{ display: 'block' }} />
          <span style={{
            fontWeight: 800,
            fontSize: 17,
            letterSpacing: '-0.025em',
            color: 'var(--text)',
          }}>
            ContrataData
          </span>
        </Link>

        <nav style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {NAV.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className="nav-btn"
              style={{ color: isActive(item.href) ? 'var(--primary)' : 'var(--muted)', textDecoration: 'none' }}
            >
              {item.label}
            </Link>
          ))}

          <button
            onClick={() => requirePro(() => {}, 'navbar')}
            style={{
              marginLeft: 10,
              background: 'linear-gradient(135deg, var(--primary), #8B5CF6)',
              border: 'none',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 700,
              padding: '7px 12px',
              borderRadius: 8,
              color: '#fff',
            }}
          >
            ContrataData Pro
          </button>

          <button
            onClick={openFeedback}
            style={{
              marginLeft: 10,
              background: 'var(--primary-weak)',
              border: '1px solid var(--border)',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              padding: '7px 11px',
              borderRadius: 8,
              color: 'var(--primary)',
            }}
          >
            Feedback
          </button>

          <button
            onClick={toggleTheme}
            aria-label="Cambiar tema"
            style={{
              marginLeft: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              background: 'var(--surface2)',
              border: '1px solid var(--border)',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              padding: '7px 11px',
              borderRadius: 8,
              color: 'var(--muted)',
            }}
          >
            <span style={{
              width: 11,
              height: 11,
              borderRadius: '50%',
              border: '2px solid currentColor',
              background: theme === 'dark' ? 'transparent' : 'currentColor',
              display: 'block',
            }} />
            {theme === 'dark' ? 'Claro' : 'Oscuro'}
          </button>
        </nav>
      </div>
    </header>
  )
}
