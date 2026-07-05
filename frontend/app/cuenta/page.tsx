'use client'

import { usePathname } from 'next/navigation'
import { useMe } from '@/lib/useMe'
import ProUpgradeCard from '@/components/ProUpgradeCard'
import { PREMIUM_ENABLED } from '@/lib/featureFlags'

const PLAN_LABELS: Record<string, string> = {
  trialing: 'En prueba',
  active: 'Activo',
  past_due: 'Pago pendiente',
  canceled: 'Cancelado',
  expired: 'Expirado',
  none: 'Sin plan',
}

export default function CuentaPage() {
  const pathname = usePathname()
  const { auth0User, isLoggedIn, isLoading, me } = useMe()

  if (isLoading) {
    return (
      <main style={{ maxWidth: 640, margin: '0 auto', padding: '32px 28px 80px' }} className="animate-fade">
        <div style={{ color: 'var(--muted)', fontSize: 14 }}>Cargando…</div>
      </main>
    )
  }

  if (!isLoggedIn) {
    return (
      <main style={{ maxWidth: 640, margin: '0 auto', padding: '32px 28px 80px' }} className="animate-fade">
        <h1 style={{ margin: '0 0 16px', fontSize: 30, fontWeight: 800, color: 'var(--text)' }}>Mi cuenta</h1>
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
          padding: '56px 20px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>
            Inicia sesión para ver tu cuenta
          </div>
          <a
            href={`/api/auth/login?returnTo=${encodeURIComponent(pathname || '/cuenta')}`}
            style={{
              display: 'inline-block', background: 'var(--primary)', color: '#fff', textDecoration: 'none',
              border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 13.5, fontWeight: 600,
            }}
          >
            Iniciar sesión
          </a>
        </div>
      </main>
    )
  }

  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '32px 28px 80px' }} className="animate-fade">
      <h1 style={{ margin: '0 0 24px', fontSize: 30, fontWeight: 800, color: 'var(--text)' }}>Mi cuenta</h1>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20,
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 18,
      }}>
        {auth0User?.picture ? (
          <img src={auth0User.picture} alt="" width={48} height={48} style={{ borderRadius: '50%', display: 'block' }} />
        ) : (
          <span style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--primary)', display: 'block' }} />
        )}
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{auth0User?.name}</div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>{auth0User?.email}</div>
        </div>
      </div>

      {PREMIUM_ENABLED && (
        <>
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, marginBottom: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>
                Plan actual
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>
                {me?.plan === 'pro' ? 'ContrataData Pro' : 'Free'}
              </div>
            </div>
            <span style={{
              fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 8,
              color: me?.plan === 'pro' ? 'var(--success)' : 'var(--muted)',
              background: me?.plan === 'pro' ? 'rgba(16,185,129,0.15)' : 'var(--surface2)',
            }}>
              {PLAN_LABELS[me?.premium_status ?? 'none']}
            </span>
          </div>

          {me?.plan !== 'pro' && <ProUpgradeCard />}
        </>
      )}
    </main>
  )
}
