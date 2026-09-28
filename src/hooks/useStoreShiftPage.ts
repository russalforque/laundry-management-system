import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  closeStore, getOpenShift, getShiftDetail, listShifts, openStore, shiftTotals,
  type ShiftTotals, type StoreShift,
} from '../db/shifts'
import { formatPesoShort, parsePesoToCents } from '../lib/money'

/**
 * Store Shift logic shared by pages/mobile/MobileStoreShift.tsx and pages/desktop-tablet/StoreShift.tsx:
 * the open shift with its live drawer figures, shift history, and the open / close / report flows.
 */

export type ShiftDetail = NonNullable<Awaited<ReturnType<typeof getShiftDetail>>>
export type StoreView = { kind: 'home' } | { kind: 'close' } | { kind: 'detail'; id: number } | { kind: 'closed'; id: number }

const QUICK_FLOATS = [0, 500, 1000, 2000]

/** The open shift (null = closed, undefined = loading), its totals, history, and which screen is showing. */
export function useStoreShiftPage() {
  const { can } = useAuth()
  const history = can('store.history')
  const [open, setOpen] = useState<StoreShift | null | undefined>(undefined)
  const [totals, setTotals] = useState<ShiftTotals | null>(null)
  const [rows, setRows] = useState<StoreShift[] | null>(null)
  const [view, setView] = useState<StoreView>({ kind: 'home' })
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(async () => {
    try {
      const s = (await getOpenShift()) ?? null
      setOpen(s)
      setTotals(s ? await shiftTotals(s) : null)
      if (history) setRows(await listShifts())
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the store shift.')
      setOpen(null)
    }
  }, [history])
  useEffect(() => { load() }, [load])
  useEffect(() => { document.querySelector('main')?.scrollTo(0, 0) }, [view])

  // Keep the "open for" time and the drawer figures fresh while the page stays up.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    const onVisible = () => { if (document.visibilityState === 'visible') { setNow(Date.now()); load() } }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible) }
  }, [load])

  return {
    history, open, totals, rows, view, setView, error, now, load,
    lastClosed: rows?.find((r) => r.status === 'closed'),
    /** Refreshes the figures, then shows the closing count. */
    startClose: async () => { await load(); setView({ kind: 'close' }) },
    /** After closing: reload, then show the drawer result for the shift that just closed. */
    afterClose: async (id: number) => { await load(); setView({ kind: 'closed', id }) },
    home: () => setView({ kind: 'home' }),
  }
}

/** Opening cash: quick amounts (last count first), validation and a double-tap-safe submit. */
export function useOpenStoreForm(lastClosed: StoreShift | undefined, onOpened: () => void) {
  const [cash, setCash] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false) // state updates are async; this blocks a double tap in the same frame
  const lastCount = lastClosed?.actual_cash_cents ?? null
  const quick = [
    ...(lastCount != null && lastCount > 0 ? [{ label: `Last count ${formatPesoShort(lastCount)}`, cents: lastCount }] : []),
    ...QUICK_FLOATS.filter((c) => c * 100 !== lastCount).map((c) => ({ label: formatPesoShort(c * 100), cents: c * 100 })),
  ]

  async function submit(e: FormEvent) {
    e.preventDefault()
    const cents = cash.trim() === '' ? null : parsePesoToCents(cash)
    if (cents === null) return setErr('Enter the cash in the drawer now (0 if empty).')
    if (submitting.current) return
    submitting.current = true
    setBusy(true)
    setErr('')
    try { await openStore(cents); onOpened() } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Could not open the store. Please try again.')
      submitting.current = false
      setBusy(false)
    }
  }

  const typed = cash.trim() ? parsePesoToCents(cash) : null
  return { cash, setCash: (v: string) => { setCash(v); setErr('') }, err, busy, quick, submit, typed }
}

/** Closing count: counted cash, the over / short difference, review, and a double-tap-safe close. */
export function useCloseStoreForm(shift: StoreShift, totals: ShiftTotals, onClosed: () => void) {
  const [count, setCount] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const closing = useRef(false) // blocks a double tap closing twice
  const actual = count.trim() === '' ? null : parsePesoToCents(count)
  const diff = actual === null ? null : actual - totals.expected_cash_cents

  function review() {
    if (actual === null) return setErr('Count the cash in the drawer and enter the total.')
    setErr('')
    setReviewing(true)
  }

  async function confirmClose() {
    if (actual === null || closing.current) return
    closing.current = true
    setBusy(true)
    setErr('')
    try { await closeStore(shift.id, actual); onClosed() } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not close the store.')
      closing.current = false
      setBusy(false)
      setReviewing(false)
    }
  }

  return { count, setCount: (v: string) => { setCount(v); setErr('') }, err, busy, reviewing, setReviewing, actual, diff, review, confirmClose }
}

export type ShiftTab = 'payments' | 'orders' | 'refunds' | 'events'

/** Transaction lists in a shift report, with counts; refunds and drawer events only when there are some. */
export function shiftTabs(d: ShiftDetail): { id: ShiftTab; label: string }[] {
  return [
    { id: 'payments', label: `Payments · ${d.payments.length}` },
    { id: 'orders', label: `Orders · ${d.orders.length}` },
    ...(d.refunds.length > 0 ? [{ id: 'refunds' as const, label: `Refunds · ${d.refunds.length}` }] : []),
    ...(d.events.length > 0 ? [{ id: 'events' as const, label: `Drawer & voids · ${d.events.length}` }] : []),
  ]
}

/** One shift's report (undefined while loading, null when missing). */
export function useShiftDetail(id: number) {
  const [d, setD] = useState<ShiftDetail | null | undefined>(undefined)
  useEffect(() => { getShiftDetail(id).then(setD).catch(() => setD(null)) }, [id])
  return d
}
