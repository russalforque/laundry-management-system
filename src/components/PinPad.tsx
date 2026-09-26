import { useEffect, useState } from 'react'
import { PinError } from '../db/users'

export const PIN_MIN = 4
export const PIN_MAX = 6
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'ok', '0', 'del'] as const
type Key = (typeof KEYS)[number]

interface EntryOptions {
  /** Known PIN length. Otherwise 4–6 digits. */
  length?: number | null
  /** Throw to reject; the message is shown and a PinError's lockedUntil starts a countdown. */
  onSubmit: (pin: string) => Promise<void> | void
  lockedUntil?: number
  /** Submit as soon as `length` digits are typed (otherwise only on OK / Enter / submit()). */
  autoSubmit?: boolean
}

/** PIN entry state: digits, submit, error + shake, lockout countdown and hardware keyboard. */
export function usePinEntry({ length, onSubmit, lockedUntil = 0, autoSubmit = true }: EntryOptions) {
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [shakes, setShakes] = useState(0)
  const [lockUntil, setLockUntil] = useState(lockedUntil)
  const [now, setNow] = useState(() => Date.now())
  const wait = Math.ceil((lockUntil - now) / 1000)
  const locked = wait > 0
  const max = length ?? PIN_MAX
  const ready = !busy && !locked && pin.length >= (length ?? PIN_MIN)

  useEffect(() => {
    if (!locked) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [locked])

  async function submit(value = pin) {
    setBusy(true)
    setError('')
    try {
      await onSubmit(value)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
      setShakes((n) => n + 1)
      if (e instanceof PinError && e.lockedUntil) {
        setNow(Date.now())
        setLockUntil(e.lockedUntil)
      }
    }
    setPin('')
    setBusy(false)
  }

  function press(key: Key) {
    if (busy || locked) return
    if (key === 'del') return setPin((p) => p.slice(0, -1))
    if (key === 'ok') return void (ready && submit())
    if (pin.length >= max) return
    const next = pin + key
    setPin(next)
    if (autoSubmit && next.length === max) submit(next)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (/^\d$/.test(e.key)) press(e.key as Key)
      else if (e.key === 'Backspace') press('del')
      else if (e.key === 'Enter') press('ok')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const status = locked ? `Locked. Try again in ${wait}s.` : error
  return { pin, busy, error, shakes, locked, ready, status, press, submit, length }
}

type Entry = ReturnType<typeof usePinEntry>

/** The row of digit boxes; grows past 4 while typing a PIN of unknown length. */
export function PinBoxes({ entry }: { entry: Entry }) {
  const { pin, busy, locked, error, shakes, length } = entry
  const boxes = Math.max(length ?? PIN_MIN, pin.length)
  return (
    <>
      <div key={shakes} className={`flex items-center justify-center gap-3 ${shakes ? 'animate-shake' : ''}`} aria-hidden>
        {Array.from({ length: boxes }, (_, i) => {
          const filled = i < pin.length
          const current = i === pin.length && !busy && !locked
          return (
            <span
              key={i}
              className={`grid size-13 place-items-center rounded-xl border-[1.5px] bg-white transition-colors min-[400px]:size-14 ${
                error && !pin ? 'border-red-300' : filled || current ? 'border-blue-600' : 'border-slate-200'
              } ${current ? 'ring-4 ring-blue-100' : ''}`}
            >
              {filled && <span className={`size-3 rounded-full bg-blue-600 ${busy ? 'animate-pulse' : ''}`} />}
            </span>
          )
        })}
      </div>
      <span className="sr-only">{pin.length} digits entered</span>
    </>
  )
}

/** 3×4 numeric keypad. `withOk` shows an OK key bottom-left; otherwise that cell is empty. */
export function PinKeypad({ entry, withOk = false, className = '' }: { entry: Entry; withOk?: boolean; className?: string }) {
  const { pin, busy, locked, ready, press } = entry
  return (
    <div className={`grid w-full grid-cols-3 gap-3 ${className}`}>
      {KEYS.map((k) => {
        if (k === 'ok' && !withOk) return <span key={k} />
        const label = k === 'del' ? 'Delete' : k === 'ok' ? 'Enter PIN' : k
        const disabled = busy || locked || (k === 'ok' && !ready) || (k === 'del' && !pin)
        return (
          <button
            key={k}
            type="button"
            aria-label={label}
            disabled={disabled}
            onClick={() => press(k)}
            className={`grid h-14 place-items-center [@media(min-height:740px)]:h-16 rounded-xl text-[22px] font-semibold transition select-none active:scale-[0.97] ${
              k === 'ok'
                ? 'bg-blue-600 text-base text-white shadow-md shadow-blue-600/25 active:bg-blue-700 disabled:opacity-40'
                : k === 'del'
                  ? 'bg-slate-100 text-slate-700 active:bg-blue-100 disabled:text-slate-400'
                  : 'border border-slate-200/80 bg-white text-slate-900 shadow-[0_1px_3px_rgba(15,23,42,0.06)] active:border-blue-200 active:bg-blue-50 disabled:opacity-40'
            }`}
          >
            {k === 'del' ? (
              <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M9 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6-7Z" /><path d="m12 9.5 5 5m0-5-5 5" />
              </svg>
            ) : k === 'ok' ? 'OK' : k}
          </button>
        )
      })}
    </div>
  )
}

interface Props {
  /** Known PIN length: submits automatically once reached. Otherwise 4–6 digits with an OK key. */
  length?: number | null
  onSubmit: (pin: string) => Promise<void> | void
  hint: string
  lockedUntil?: number
}

/** Boxes + large numeric keypad. Also accepts a hardware keyboard (digits, Backspace, Enter). */
export function PinPad({ length, onSubmit, hint, lockedUntil = 0 }: Props) {
  const entry = usePinEntry({ length, onSubmit, lockedUntil })
  const { busy, status } = entry
  return (
    <div className="flex w-full flex-1 flex-col items-center">
      <PinBoxes entry={entry} />
      <p role="status" aria-live="polite" className={`mt-4 min-h-6 text-center text-sm ${status ? 'font-semibold text-red-600' : 'text-slate-500'}`}>
        {busy ? 'Checking…' : status || hint}
      </p>
      <PinKeypad entry={entry} withOk={!length} className="mt-auto max-w-sm pt-6" />
    </div>
  )
}

/** Choose a new PIN, then type it again to confirm. */
export function NewPinPad({ onDone }: { onDone: (pin: string) => Promise<void> }) {
  const [first, setFirst] = useState<string | null>(null)
  const [note, setNote] = useState('')

  return first === null ? (
    <PinPad key="new" hint={note || 'Choose a 4–6 digit PIN'} onSubmit={(p) => { setNote(''); setFirst(p) }} />
  ) : (
    <PinPad
      key="confirm"
      length={first.length}
      hint="Enter the same PIN again"
      onSubmit={async (p) => {
        if (p !== first) {
          setNote("PINs didn't match. Choose again.")
          setFirst(null)
          return
        }
        await onDone(p)
      }}
    />
  )
}
