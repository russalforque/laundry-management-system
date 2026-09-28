import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { getDashboardStats, getReadyForPickup, type DashboardStats } from '../db/dashboard'
import { listOrders, type OrderListRow } from '../db/orderQueries'
import { dailySales, type DailySales } from '../db/reports'
import { sessionCan } from '../lib/permissions'
import type { OrderRow } from '../types'

/**
 * Dashboard data and wording, shared by the phone dashboard (pages/mobile/MobileDashboard.tsx) and the
 * tablet / desktop dashboard (pages/desktop-tablet/Dashboard.tsx).
 */

export interface DashboardData {
  stats: DashboardStats
  daily: Map<string, DailySales>
  recent: OrderListRow[]
  ready: OrderRow[]
}

const pad = (n: number) => String(n).padStart(2, '0')
/** Local YYYY-MM-DD, matching the reports module's `date(col, 'localtime')`. */
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }
/** Parses "YYYY-MM-DD" (a trailing " HH:MM", as on scheduled pickups, is ignored). */
export const parseYmd = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00`)
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

const compactPeso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', notation: 'compact', maximumFractionDigits: 1 })
const wholePeso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 })
/** Short peso for small stat tiles: ₱1,680 or ₱125.4K. */
export const tilePeso = (cents: number) => (cents >= 10_000_000 ? compactPeso : wholePeso).format(cents / 100)
/** Axis peso: ₱1,000 below ₱10k, ₱25K above. */
export const axisPeso = (cents: number) => (cents >= 1_000_000 ? compactPeso : wholePeso).format(cents / 100)
export const shortDate = (d: Date) => d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
/** "Pickup today", "Pickup Sep 30" or, once the day has passed, "Overdue · Sep 20". */
export const pickupNote = (expected: string | null) => {
  if (!expected) return null
  const d = parseYmd(expected)
  const today = startOfToday().getTime()
  if (d.getTime() < today) return { text: `Overdue · ${shortDate(d)}`, overdue: true }
  return { text: d.getTime() === today ? 'Pickup today' : `Pickup ${shortDate(d)}`, overdue: false }
}
const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning,' : h < 18 ? 'Good afternoon,' : 'Good evening,'
}

/** Recent orders fetched; phones show the first RECENT_PHONE of them. */
export const RECENT_WIDE = 8
export const RECENT_PHONE = 4

async function loadDashboard(): Promise<DashboardData> {
  // Cover "last 30 days" and "this month", plus the period before each (for the trend), with one query.
  const today = startOfToday()
  const from = new Date(today)
  from.setDate(today.getDate() - 59)
  const prevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  if (prevMonth < from) from.setTime(prevMonth.getTime())
  const [stats, daily, recent, ready] = await Promise.all([
    getDashboardStats(),
    // Sales history is a business figure: staff dashboards skip it.
    sessionCan('dashboard.financials') ? dailySales(ymd(from), ymd(today)) : Promise.resolve([]),
    listOrders({}, RECENT_WIDE),
    getReadyForPickup(20),
  ])
  return { stats, daily: new Map(daily.map((d) => [d.date, d])), recent, ready }
}

/** Loads the dashboard, refreshes it whenever the app returns to the foreground, and words the greeting. */
export function useDashboard() {
  const { user, can } = useAuth()
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState(false)
  const [retrying, setRetrying] = useState(false)

  const fetchData = () =>
    loadDashboard()
      .then((r) => { setData(r); setError(false) })
      .catch((e) => { console.error('Dashboard load failed', e); setError(true) })

  useEffect(() => {
    fetchData()
    // Refresh when the app returns to the foreground so the numbers never go stale.
    const onVisible = () => { if (document.visibilityState === 'visible') fetchData() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  function retry() {
    setRetrying(true)
    fetchData().finally(() => setRetrying(false))
  }

  const s = data?.stats
  const inProgress = s ? s.received + s.processing : 0
  // One concrete line instead of a generic welcome: what's waiting on the counter right now.
  const summary = !s ? null
    : s.ready > 0 ? `${plural(s.ready, 'order')} ready for pickup`
    : inProgress > 0 ? `${inProgress} in progress`
    : 'No orders in the shop'

  return {
    data,
    /** Load failed and there is nothing to show yet. */
    failed: error && !data,
    retrying,
    retry,
    financials: can('dashboard.financials'),
    canOrder: can('orders.manage'),
    /** Where the "collected today" figure links to. */
    reportsTo: can('reports.view') ? '/reports' : `/orders?date=${ymd(new Date())}`,
    todayQs: `/orders?date=${ymd(new Date())}`,
    inProgress,
    heading: {
      today: new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' }),
      greeting: `${greeting()} ${(user?.full_name ?? '').split(' ')[0] || 'there'}`,
      summary,
      /** The summary is highlighted while orders wait for pickup. */
      urgent: !!s && s.ready > 0,
    },
  }
}
