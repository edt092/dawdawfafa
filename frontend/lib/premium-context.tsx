'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from '@/lib/api'
import PremiumGateModal, { type GateStep } from '@/components/PremiumGateModal'

// onGranted recibe el email ya confirmado como Pro — nunca leer 'email' del
// closure del llamador (en el momento del click puede seguir siendo null si
// el usuario todavía no se había identificado), sino este argumento.
type GrantedCallback = (email: string) => void

interface PremiumContextValue {
  email: string | null
  requirePro: (onGranted: GrantedCallback, feature?: string) => void
}

const PremiumContext = createContext<PremiumContextValue>({
  email: null,
  requirePro: () => {},
})

const STORAGE_KEY = 'cd_premium_email'

export function PremiumProvider({ children }: { children: ReactNode }) {
  const [email, setEmailState] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<GateStep>('email')
  const [feature, setFeature] = useState<string | undefined>(undefined)
  const [pendingAction, setPendingAction] = useState<GrantedCallback | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) setEmailState(stored)
  }, [])

  const checkAndProceed = async (candidateEmail: string, onGranted: GrantedCallback) => {
    setStep('checking')
    try {
      const status = await api.premiumStatus(candidateEmail)
      if (status.is_pro) {
        setOpen(false)
        onGranted(candidateEmail)
      } else {
        setStep('paywall')
      }
    } catch {
      // Fail-safe: si no podemos confirmar el status, no dejamos al usuario
      // en un estado sin salida — mostramos el paywall igual.
      setStep('paywall')
    }
  }

  const requirePro = (onGranted: GrantedCallback, featureName?: string) => {
    setFeature(featureName)
    setPendingAction(() => onGranted)
    setOpen(true)

    if (!email) {
      setStep('email')
      return
    }
    checkAndProceed(email, onGranted)
  }

  const handleEmailSubmit = (value: string) => {
    localStorage.setItem(STORAGE_KEY, value)
    setEmailState(value)
    if (pendingAction) checkAndProceed(value, pendingAction)
  }

  const handleLeadSubmitted = () => {
    setStep('lead-thanks')
  }

  return (
    <PremiumContext.Provider value={{ email, requirePro }}>
      {children}
      <PremiumGateModal
        open={open}
        step={step}
        email={email}
        feature={feature}
        onClose={() => setOpen(false)}
        onEmailSubmit={handleEmailSubmit}
        onLeadSubmitted={handleLeadSubmitted}
      />
    </PremiumContext.Provider>
  )
}

export const usePremium = () => useContext(PremiumContext)
