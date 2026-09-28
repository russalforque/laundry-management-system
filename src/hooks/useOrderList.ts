import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { countOrdersByStatus, listOrders, type OrderListRow } from '../db/orderQueries'
import { isFinal, PROCESSING, STATUS_FLOW, STATUS_LABEL } from '../lib/orders'
import type { OrderStatus, PaymentStatus } from '../types'

export const ORDER_LIMIT = 300
/** Status filter options, in workflow order. */
export const ORDER_STATUSES: OrderStatus[] = [...STATUS_FLOW, 'cancelled']

/** A status tab: one status, or '' for all. */
export type StatusFilter = OrderStatus | ''
export const statusFilterLabel = (s: Exclude<StatusFilter, ''>) => STATUS_LABEL[s]

export const fmtDate = (ymd: string) => new Date(`${ymd}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })

export type PayFilter = PaymentStatus | 'due' | ''
export const PAY_LABEL: Record<Exclude<PayFilter, ''>, string> = { due: 'Balance due', unpaid: 'Unpaid', partial: 'Partial', paid: 'Paid' }

/** "Today", "Yesterday" or "Wed, Sep 24" for the day headers. */
export function dayLabel(iso: string) {
  const d = new Date(iso)
  const y = new Date()
  y.setDate(y.getDate() - 1)
  if (d.toDateString() === new Date().toDateString()) return 'Today'
  if (d.toDateString() === y.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', ...(d.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }) })
}

/**
 * The Orders list: search, status / payment / date filters (seeded from the URL, e.g. dashboard links
 * such as /orders?payment=due), the matching orders and per-status counts. Shared by the phone list and
 * the tablet / desktop table (pages/mobile/MobileOrders.tsx, pages/desktop-tablet/Orders.tsx).
 */
export function useOrderList() {
  const [params] = useSearchParams()
  // ?q= comes from the scanner's type-in fallback (customer name or order number).
  const [text, setText] = useState(params.get('q') ?? '')
  const q = params.get('q')
  const [seenQ, setSeenQ] = useState(q)
  if (q !== seenQ) { setSeenQ(q); if (q !== null) setText(q) } // a new ?q= while already on this page
  // Links from before Processing replaced Washing / Drying (?status=drying) open the Processing tab.
  const [status, setStatus] = useState<StatusFilter>(() => {
    const s = params.get('status')
    return s === 'drying' ? PROCESSING : ((s as StatusFilter | null) ?? '')
  })
  const [pay, setPay] = useState<PayFilter>((params.get('payment') as PayFilter | null) ?? '')
  const [date, setDate] = useState(params.get('date') ?? '')
  const [rows, setRows] = useState<OrderListRow[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [counts, setCounts] = useState<Partial<Record<OrderStatus, number>> | null>(null)
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick((t) => t + 1), [])
  // An active status tab is a work queue: oldest first, the order the laundry is processed in.
  const queue = !!status && !isFinal(status)

  // Catch up on return to the app (orders may have moved on another screen).
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') reload() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [reload])
  useEffect(() => {
    let live = true
    listOrders({ text, status, paymentStatus: pay, date }, ORDER_LIMIT, queue ? 'queue' : 'newest')
      .then((r) => { if (live) { setRows(r); setLoadError(false) } })
      .catch(() => { if (live) setLoadError(true) })
    return () => { live = false }
  }, [text, status, pay, date, queue, tick])
  // Chip counts follow search, payment and date, so each chip says what tapping it will show.
  useEffect(() => {
    let live = true
    countOrdersByStatus({ text, paymentStatus: pay, date }).then((c) => { if (live) setCounts(c) }).catch(() => { if (live) setCounts(null) })
    return () => { live = false }
  }, [text, pay, date, tick])

  const extraFilters = (pay ? 1 : 0) + (date ? 1 : 0)
  const filtered = !!(text.trim() || status || extraFilters)
  const allCount = counts ? Object.values(counts).reduce((a, n) => a + (n ?? 0), 0) : null
  const clearAll = () => { setText(''); setStatus(''); setPay(''); setDate('') }

  // Newest first, so consecutive grouping keeps the days in order.
  const days = useMemo(() => {
    const out: { key: string; label: string; rows: OrderListRow[] }[] = []
    for (const o of rows ?? []) {
      const key = new Date(o.received_at).toDateString()
      let g = out[out.length - 1]
      if (!g || g.key !== key) out.push((g = { key, label: dayLabel(o.received_at), rows: [] }))
      g.rows.push(o)
    }
    return out
  }, [rows])

  return { text, setText, status, setStatus, pay, setPay, date, setDate, rows, loadError, counts, allCount, extraFilters, filtered, clearAll, days, queue, reload }
}

export type OrderList = ReturnType<typeof useOrderList>
