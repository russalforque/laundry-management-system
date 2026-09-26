import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getOpenShift, shiftTotals, type ShiftTotals, type StoreShift } from '../db/shifts'
import { formatPeso } from '../lib/money'
import { I, Icon } from './Icons'

/** The open store shift (null = closed, undefined = still loading or no access). Refreshes on mount. */
export function useStoreShift() {
  const { can } = useAuth()
  const allowed = can('store.operate')
  const [shift, setShift] = useState<StoreShift | null | undefined>(undefined)
  const [totals, setTotals] = useState<ShiftTotals | null>(null)
  useEffect(() => {
    if (!allowed) return
    let live = true
    getOpenShift()
      .then(async (s) => {
        if (!live) return
        setShift(s ?? null)
        const t = s ? await shiftTotals(s) : null
        if (live) setTotals(t)
      })
      .catch(() => { if (live) setShift(undefined) })
    return () => { live = false }
  }, [allowed])
  return { shift, totals }
}

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })

/** Dashboard strip: open with the drawer's expected cash, or a prompt to open the store. */
export function StoreStatusBar() {
  const { shift, totals } = useStoreShift()
  if (shift === undefined) return null
  return shift ? (
    <Link to="/store" className="flex min-h-14 items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-2.5 active:bg-emerald-50">
      <span className="size-2.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-slate-900">Store open since {time(shift.started_at)}</span>
        <span className="block truncate text-xs text-slate-600">
          {totals ? <>Expected in drawer <b className="tabular-nums">{formatPeso(totals.expected_cash_cents)}</b></> : `Opened by ${shift.user_name}`}
        </span>
      </span>
      <span className="shrink-0 text-sm font-semibold text-emerald-700">View</span>
      <Icon className="h-5 w-5 shrink-0 text-emerald-600">{I.chevron}</Icon>
    </Link>
  ) : (
    <Link to="/store" className="flex min-h-14 items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 active:bg-amber-100">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-amber-600 shadow-sm"><Icon className="h-5 w-5">{I.store}</Icon></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-slate-900">Store is closed</span>
        <span className="block truncate text-xs text-amber-800">Open the store to start taking payments.</span>
      </span>
      <span className="shrink-0 text-sm font-semibold text-amber-800">Open Store</span>
      <Icon className="h-5 w-5 shrink-0 text-amber-600">{I.chevron}</Icon>
    </Link>
  )
}

/**
 * Where money is taken or given back: while the store is closed this says why the action is blocked
 * (the database refuses it too); renders nothing when it's open.
 */
export function StoreClosedNotice({ action = 'take payments' }: { action?: string }) {
  const { shift } = useStoreShift()
  if (shift !== null) return null
  return (
    <p role="status" className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-amber-600">{I.info}</Icon>
      <span>
        The store is closed. Open the store to {action}, so the money is counted in the drawer.{' '}
        <Link to="/store" className="font-semibold underline">Open Store</Link>
      </span>
    </p>
  )
}
