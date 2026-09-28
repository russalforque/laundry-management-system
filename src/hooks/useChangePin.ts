import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { changePin, listProfiles, verifyOwnPin, type Profile } from '../db/users'

export type PinStepNo = 1 | 2 | 3

export const PIN_STEPS = ['Current PIN', 'New PIN', 'Confirm PIN'] as const
export const PIN_SUBTITLE: Record<PinStepNo, string> = {
  1: 'Enter your current PIN to continue',
  2: 'Create a new secure PIN',
  3: 'Re-enter your new PIN to confirm',
}

/**
 * My Account › Change PIN: current PIN → new PIN → confirm, with the mismatch sending staff back one step.
 * Shared by pages/mobile/MobileAccount.tsx and pages/desktop-tablet/Account.tsx.
 */
export function useChangePin() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [me, setMe] = useState<Profile | null>(null)
  const [step, setStep] = useState<PinStepNo>(1)
  const [current, setCurrent] = useState('')
  const [first, setFirst] = useState('')
  const [note, setNote] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    listProfiles().then((ps) => setMe(ps.find((p) => p.id === user?.id) ?? null)).catch(console.error)
  }, [user?.id])

  const leave = () => ((window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate('/account'))
  const back = () => {
    if (done || step === 1) return leave()
    setNote('')
    setStep((s) => (s - 1) as PinStepNo)
  }

  return {
    user, me, step, done, note, firstLength: first.length, leave, back,
    submitCurrent: async (pin: string) => { await verifyOwnPin(me!.id, pin); setCurrent(pin); setStep(2) },
    submitNew: (pin: string) => { setNote(''); setFirst(pin); setStep(3) },
    submitConfirm: async (pin: string) => {
      if (pin !== first) {
        setNote("PINs didn't match. Choose again.")
        setStep(2)
        return
      }
      await changePin(me!.id, current, pin)
      setDone(true)
    },
  }
}
export type ChangePin = ReturnType<typeof useChangePin>
