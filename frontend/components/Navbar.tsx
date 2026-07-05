'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from '@/lib/theme-context'
import { useFeedback } from '@/lib/feedback-context'
import { useMe } from '@/lib/useMe'
import { usePremiumStatus } from '@/lib/usePremiumStatus'
import { PREMIUM_ENABLED } from '@/lib/featureFlags'

// "Mis alertas" y "Competidores" ocultas del nav a propósito hasta que esas
// páginas estén listas para producción (ver frontend/app/alertas y
// frontend/app/competidores — bloqueadas con notFound() mientras tanto).
const NAV = [
  { label: 'Dashboard', href: '/' },
  { label: 'Sobre el proyecto', href: '/sobre' },
]

export default function Navbar() {
  const pathname = usePathname()
  const { theme, toggleTheme } = useTheme()
  const { openFeedback } = useFeedback()
  const { auth0User, isLoggedIn, isLoading } = useMe()
  const { status } = usePremiumStatus()
  const [menuOpen, setMenuOpen] = useState(false)

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' || pathname.startsWith('/entidad') || pathname.startsWith('/contratista') : pathname === href

  const loginUrl = `/api/auth/login?returnTo=${encodeURIComponent(pathname || '/')}`

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

          {isLoading ? null : !isLoggedIn ? (
            <a
              href={loginUrl}
              style={{
                marginLeft: 10,
                background: 'linear-gradient(135deg, var(--primary), #8B5CF6)',
                border: 'none',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 700,
                padding: '7px 14px',
                borderRadius: 8,
                color: '#fff',
                textDecoration: 'none',
              }}
            >
              Ingresar
            </a>
          ) : (
            <div style={{ position: 'relative', marginLeft: 10 }}>
              <button
                onClick={() => setMenuOpen(o => !o)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  borderRadius: 8, padding: '5px 10px 5px 5px', cursor: 'pointer',
                }}
              >
                {auth0User?.picture ? (
                  <img src={auth0User.picture} alt="" width={22} height={22} style={{ borderRadius: '50%', display: 'block' }} />
                ) : (
                  <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--primary)', display: 'block' }} />
                )}
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {auth0User?.name || auth0User?.email}
                </span>
                {PREMIUM_ENABLED && status?.is_pro && (
                  <span style={{
                    fontSize: 10, fontWeight: 800, letterSpacing: '0.04em', color: '#fff',
                    background: 'linear-gradient(135deg, var(--primary), #8B5CF6)',
                    borderRadius: 5, padding: '2px 6px',
                  }}>
                    PRO
                  </span>
                )}
              </button>

              {menuOpen && (
                <>
                  <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 90 }} />
                  <div style={{
                    position: 'absolute', top: '110%', right: 0, zIndex: 100,
                    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.2)', overflow: 'hidden', minWidth: 180,
                  }}>
                    <Link
                      href="/cuenta"
                      onClick={() => setMenuOpen(false)}
                      className="row-hover"
                      style={{ display: 'block', padding: '10px 14px', fontSize: 13, color: 'var(--text)', textDecoration: 'none' }}
                    >
                      Mi cuenta
                    </Link>
                    {PREMIUM_ENABLED && status && !status.is_pro && (
                      <Link
                        href="/cuenta"
                        onClick={() => setMenuOpen(false)}
                        className="row-hover"
                        style={{ display: 'block', padding: '10px 14px', fontSize: 13, color: 'var(--primary)', fontWeight: 600, textDecoration: 'none', borderTop: '1px solid var(--border)' }}
                      >
                        Actualizar a Pro
                      </Link>
                    )}
                    <a
                      href="/api/auth/logout"
                      className="row-hover"
                      style={{ display: 'block', padding: '10px 14px', fontSize: 13, color: 'var(--danger)', textDecoration: 'none', borderTop: '1px solid var(--border)' }}
                    >
                      Cerrar sesión
                    </a>
                  </div>
                </>
              )}
            </div>
          )}
        </nav>
      </div>
    </header>
  )
}
