import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AppHeader, headerBtn } from '../components/AppHeader'
import { Avatar } from '../components/Avatar'
import { I, Icon } from '../components/Icons'
import { OrderCard } from '../components/OrderCard'
import { ScanQrButton } from '../components/ScanOrder'
import { Sheet } from '../components/Sheet'
import { StoreStatusBar } from '../components/StoreStatus'
import { useAuth } from '../context/AuthContext'
import { getDashboardStats, getReadyForPickup, type DashboardStats } from '../db/dashboard'
import { listOrders, type OrderListRow } from '../db/orderQueries'
import { dailySales, type DailySales } from '../db/reports'
import { formatPeso, formatPesoShort } from '../lib/money'
import { sessionCan } from '../lib/permissions'
import { STATUS_LABEL } from '../lib/orders'
import type { OrderRow, OrderStatus } from '../types'

const card = 'min-w-0 rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.05)]'

/**
 * Active workflow stages, light → dark in workflow order so the shade itself reads as progress;
 * Ready (the stage that needs staff action) gets the strongest color.
 */
const FLOW: { status: Exclude<OrderStatus, 'released' | 'cancelled'>; dot: string }[] = [
  { status: 'received', dot: 'bg-blue-200' },
  { status: 'washing', dot: 'bg-blue-400' },
  { status: 'drying', dot: 'bg-blue-600' },
  { status: 'ready', dot: 'bg-blue-900' },
]

type Range = '7d' | '30d' | 'month'
const RANGES: { id: Range; label: string }[] = [
  { id: '7d', label: '7 Days' },
  { id: '30d', label: '30 Days' },
  { id: 'month', label: 'This Month' },
]

interface Data {
  stats: DashboardStats
  daily: Map<string, DailySales>
  recent: OrderListRow[]
  ready: OrderRow[]
}

// ---------- helpers ----------

const pad = (n: number) => String(n).padStart(2, '0')
/** Local YYYY-MM-DD, matching the reports module's `date(col, 'localtime')`. */
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }
/** Parses "YYYY-MM-DD" (a trailing " HH:MM", as on scheduled pickups, is ignored). */
const parseYmd = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00`)
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

const compactPeso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', notation: 'compact', maximumFractionDigits: 1 })
const wholePeso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 })
/** Short peso for small stat tiles: ₱1,680 or ₱125.4K. */
const tilePeso = (cents: number) => (cents >= 10_000_000 ? compactPeso : wholePeso).format(cents / 100)
/** Axis peso: ₱1,000 below ₱10k, ₱25K above. */
const axisPeso = (cents: number) => (cents >= 1_000_000 ? compactPeso : wholePeso).format(cents / 100)
const shortDate = (d: Date) => d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
/** "Pickup today", "Pickup Sep 30" or, once the day has passed, "Overdue · Sep 20". */
const pickupNote = (expected: string | null) => {
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

/** Rounds up to 1, 2 or 5 × 10ⁿ so axis labels stay readable. */
function niceCeil(v: number) {
  if (v <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  const n = v / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p
}

function rangeDates(range: Range) {
  const end = startOfToday()
  const d = new Date(end)
  if (range === 'month') d.setDate(1)
  else d.setDate(d.getDate() - (range === '7d' ? 6 : 29))
  const out: string[] = []
  for (; d <= end; d.setDate(d.getDate() + 1)) out.push(ymd(d))
  return out
}

async function loadDashboard(): Promise<Data> {
  // Cover both "last 30 days" and "this month" with one query.
  const today = startOfToday()
  const from = new Date(today)
  from.setDate(Math.min(today.getDate() - 29, 1))
  const [stats, daily, recent, ready] = await Promise.all([
    getDashboardStats(),
    // Sales history is a business figure: staff dashboards skip it.
    sessionCan('dashboard.financials') ? dailySales(ymd(from), ymd(today)) : Promise.resolve([]),
    listOrders({}, 4),
    getReadyForPickup(20),
  ])
  return { stats, daily: new Map(daily.map((d) => [d.date, d])), recent, ready }
}

// ---------- building blocks ----------

/**
 * Section title that sits on the page background, above its content, instead of inside a card:
 * one less box per section, and the same rhythm down the whole page.
 */
function SectionHeader({ title, count, action }: { title: string; count?: number; action?: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 px-1">
      <h2 className="flex min-w-0 items-center gap-2 text-base font-bold text-slate-900">
        <span className="truncate">{title}</span>
        {count !== undefined && count > 0 && (
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold tabular-nums text-blue-700">{count}</span>
        )}
      </h2>
      {action}
    </div>
  )
}

function ViewAll({ to, label = 'View all' }: { to: string; label?: string }) {
  return (
    <Link to={to} className="-mr-2 inline-flex min-h-11 shrink-0 items-center gap-0.5 rounded-lg px-2 text-sm font-semibold text-blue-600 active:bg-blue-50">
      {label}<Icon className="h-4 w-4">{I.chevron}</Icon>
    </Link>
  )
}

function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-8 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-blue-50 text-blue-500">
        <Icon className="h-6 w-6">{icon}</Icon>
      </span>
      <p className="mt-3 text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 max-w-xs text-sm text-slate-500">{text}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

// ---------- sections ----------

/** One linked figure along the bottom of the Today hero. */
function HeroStat({ label, value, to, alert }: { label: string; value: string; to: string; alert?: boolean }) {
  return (
    <Link to={to} className="flex min-h-16 min-w-0 flex-col justify-center bg-blue-600 px-3 py-2.5 transition-colors active:bg-blue-700">
      <span className="flex items-center gap-1.5 truncate text-xs font-medium text-blue-100">
        {alert && <span className="size-2 shrink-0 rounded-full bg-amber-300" aria-hidden />}
        {label}
      </span>
      <span className="mt-0.5 truncate text-lg font-bold tabular-nums text-white">{value}</span>
    </Link>
  )
}

/**
 * Today at a glance, as the page's single visual anchor. Roles with financials lead with cash collected
 * (the number that closes the day); staff lead with orders taken, and see counts instead of money.
 */
function TodayHero({ s, financials, reportsTo }: { s: DashboardStats; financials: boolean; reportsTo: string }) {
  const todayQs = `/orders?date=${ymd(new Date())}`
  const due = s.outstanding_cents > 0
  const stats = financials
    ? [
        { label: 'Orders today', value: String(s.today_orders), to: todayQs },
        { label: 'Completed today', value: String(s.released_today), to: '/orders?status=released' },
        { label: 'Balance Due', value: tilePeso(s.outstanding_cents), to: '/orders?payment=due', alert: due },
      ]
    : [
        { label: 'Ready', value: String(s.ready), to: '/orders?status=ready' },
        { label: 'Completed today', value: String(s.released_today), to: '/orders?status=released' },
        { label: 'Not fully paid', value: String(s.unpaid_orders), to: '/orders?payment=due', alert: due },
      ]
  return (
    <section aria-label="Today" className="min-w-0 overflow-hidden rounded-3xl bg-blue-600 text-white shadow-lg shadow-blue-600/25">
      <Link to={financials ? reportsTo : todayQs} className="block px-5 pb-4 pt-5 transition-colors active:bg-blue-700">
        <span className="flex items-center justify-between gap-2 text-sm font-medium text-blue-100">
          {financials ? 'Collected today' : 'Orders taken today'}
          <Icon className="h-5 w-5 text-blue-200">{I.chevron}</Icon>
        </span>
        <span className="mt-1 block truncate text-[clamp(2rem,10vw,2.75rem)] font-bold leading-tight tracking-tight tabular-nums">
          {financials ? formatPeso(s.today_collected_cents) : s.today_orders}
        </span>
        <span className="mt-1 block truncate text-sm text-blue-100">
          {financials
            ? <>{tilePeso(s.today_sales_cents)} in new orders today</>
            : s.unpaid_orders ? `${plural(s.unpaid_orders, 'order')} not fully paid` : 'All orders are fully paid'}
        </span>
      </Link>
      <div className="grid grid-cols-3 gap-px border-t border-white/15 bg-white/15">
        {stats.map((x) => <HeroStat key={x.label} {...x} />)}
      </div>
    </section>
  )
}

/** One order waiting for its customer: who, when it's due, and whether money is still owed. */
function ReadyRow({ o, onClick }: { o: OrderRow; onClick?: () => void }) {
  const pickup = pickupNote(o.expected_pickup)
  return (
    <Link to={`/orders/${o.id}`} onClick={onClick} className="flex min-h-16 items-center gap-3 px-3 py-2.5 active:bg-slate-50">
      <Avatar name={o.customer_name} className="size-10 text-sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-slate-900">{o.customer_name}</span>
        <span className="flex items-center gap-1.5 truncate text-xs text-slate-500">
          #{o.order_number}
          {pickup && <> · <span className={pickup.overdue ? 'font-semibold text-red-600' : ''}>{pickup.text}</span></>}
        </span>
      </span>
      {o.balance_cents > 0 ? (
        <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold tabular-nums text-amber-800">{formatPesoShort(o.balance_cents)} due</span>
      ) : (
        <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Paid</span>
      )}
      <Icon className="h-5 w-5 text-slate-300">{I.chevron}</Icon>
    </Link>
  )
}

/** "₱X to collect from N orders" row, linking to exactly those orders. */
function OutstandingRow({ s, onClick }: { s: DashboardStats; onClick?: () => void }) {
  return (
    <Link to="/orders?payment=due" onClick={onClick} className="flex items-center gap-3 rounded-2xl bg-amber-50 p-3.5 active:bg-amber-100">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-amber-600"><Icon className="h-5 w-5">{I.wallet}</Icon></span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold tabular-nums text-slate-900">Balance Due {formatPeso(s.outstanding_cents)}</span>
        <span className="block text-sm text-slate-600">On {plural(s.unpaid_orders, 'order')} not fully paid</span>
      </span>
      <Icon className="h-5 w-5 text-amber-500">{I.chevron}</Icon>
    </Link>
  )
}

/** The counter's to-do list: orders waiting for their customer, earliest pickup (so overdue) first. */
function ReadyForPickup({ s, ready }: { s: DashboardStats; ready: OrderRow[] }) {
  const shown = ready.slice(0, 4)
  return (
    <section className="min-w-0">
      <SectionHeader title="Ready for pickup" count={s.ready} action={s.ready > shown.length && <ViewAll to="/orders?status=ready" />} />
      <div className={`${card} mt-1 overflow-hidden`}>
        {shown.length === 0 ? (
          <EmptyState icon={I.bag} title="Nothing waiting for pickup" text="Orders appear here as soon as they're marked Ready." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {shown.map((o) => <li key={o.id}><ReadyRow o={o} /></li>)}
          </ul>
        )}
      </div>
    </section>
  )
}

/** Bell with a count when orders await pickup or payment; opens a sheet listing them. */
function Notifications({ s, ready }: { s: DashboardStats; ready: OrderRow[] }) {
  const [open, setOpen] = useState(false)
  const count = s.ready + (s.outstanding_cents > 0 ? 1 : 0)
  const close = () => setOpen(false)
  return (
    <>
      <button onClick={() => setOpen(true)} aria-label={count ? `Notifications, ${plural(count, 'item')} need attention` : 'Notifications'} aria-haspopup="dialog" className={headerBtn}>
        <Icon className="h-6 w-6">{I.bell}</Icon>
        {count > 0 && (
          <span aria-hidden className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white ring-2 ring-white">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>
      {open && (
        <Sheet label="Notifications" onClose={close}>
          {count === 0 ? (
            <EmptyState icon={I.bell} title="You're all caught up" text="Orders ready for pickup and balances due will show up here." />
          ) : (
            <div className="space-y-4">
              {s.outstanding_cents > 0 && <OutstandingRow s={s} onClick={close} />}
              {ready.length > 0 && (
                <section>
                  <h3 className="px-1 pb-2 text-sm font-semibold text-slate-500">Ready for pickup ({s.ready})</h3>
                  <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200/80">
                    {ready.map((o) => <li key={o.id}><ReadyRow o={o} onClick={close} /></li>)}
                  </ul>
                  {s.ready > ready.length && (
                    <Link to="/orders?status=ready" onClick={close} className="mt-2 flex min-h-11 items-center justify-center rounded-xl text-sm font-semibold text-blue-600 active:bg-blue-50">
                      View all {s.ready} ready orders
                    </Link>
                  )}
                </section>
              )}
            </div>
          )}
        </Sheet>
      )}
    </>
  )
}

/**
 * Orders in the shop as a left-to-right workflow: one proportional bar (shade darkening with progress)
 * over a tappable tile per stage, so "where the work is" reads at a glance.
 */
function Pipeline({ s }: { s: DashboardStats }) {
  const active = FLOW.reduce((n, f) => n + s[f.status], 0)
  return (
    <section className="min-w-0">
      <SectionHeader
        title="In the shop"
        action={<span className="text-sm tabular-nums text-slate-500"><b className="font-bold text-slate-900">{active}</b> active</span>}
      />
      <div className={`${card} mt-1 p-3`}>
        <div className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
          {active > 0 && FLOW.map((f) => s[f.status] > 0 && <span key={f.status} className={f.dot} style={{ width: `${(s[f.status] / active) * 100}%` }} />)}
        </div>
        <ol className="mt-3 grid grid-cols-4 gap-2">
          {FLOW.map((f) => {
            const n = s[f.status]
            const ready = f.status === 'ready'
            return (
              <li key={f.status} className="min-w-0">
                <Link
                  to={`/orders?status=${f.status}`}
                  aria-label={`${STATUS_LABEL[f.status]}: ${plural(n, 'order')}`}
                  className={`flex min-h-18 flex-col items-center justify-center rounded-2xl px-1 py-2 transition active:scale-[0.97] ${
                    ready && n ? 'bg-blue-600 text-white active:bg-blue-700' : 'bg-slate-50 active:bg-slate-100'
                  }`}
                >
                  <span className={`text-2xl font-bold tabular-nums ${ready && n ? 'text-white' : n ? 'text-slate-900' : 'text-slate-300'}`}>{n}</span>
                  <span className={`mt-0.5 flex max-w-full items-center gap-1 text-[11px] font-semibold ${ready && n ? 'text-blue-50' : 'text-slate-600'}`}>
                    <span className={`size-2 shrink-0 rounded-full ${f.dot} ${ready && n ? 'ring-1 ring-white' : ''}`} aria-hidden />
                    <span className="truncate">{STATUS_LABEL[f.status]}</span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}

/** Latest orders, drawn with the same card as the Orders page so status and payment read the same everywhere. */
function RecentOrders({ rows }: { rows: OrderListRow[] }) {
  return (
    <section className="min-w-0">
      <SectionHeader title="Recent orders" action={rows.length > 0 && <ViewAll to="/orders" />} />
      {rows.length === 0 ? (
        <div className={`${card} mt-1`}>
          <EmptyState
            icon={I.orders}
            title="No orders yet"
            text="New laundry orders will show up here."
            action={<Link to="/orders/new" className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white active:bg-blue-700"><Icon>{I.plus}</Icon>New Order</Link>}
          />
        </div>
      ) : (
        <ul className="mt-1 grid gap-2.5">
          {rows.map((o) => <li key={o.id} className="min-w-0"><OrderCard o={o} /></li>)}
        </ul>
      )}
    </section>
  )
}

const longDate = (s: string) => parseYmd(s).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })

/**
 * Sales bars with a linked readout. Touch users tap or drag across the bars to scrub
 * day by day; mouse users hover; keyboard users arrow between bars.
 */
function SalesOverview({ daily }: { daily: Map<string, DailySales> }) {
  const [range, setRange] = useState<Range>('7d')
  const [sel, setSel] = useState<number | null>(null)
  const plotRef = useRef<HTMLDivElement>(null)
  /** Active press: where it started, whether that bar was already selected, and whether it moved. */
  const press = useRef<{ i: number; wasSel: boolean; moved: boolean } | null>(null)

  const series = rangeDates(range).map((date) => ({
    date,
    sales: daily.get(date)?.sales_cents ?? 0,
    orders: daily.get(date)?.orders ?? 0,
  }))
  const n = series.length
  const total = series.reduce((sum, p) => sum + p.sales, 0)
  const orders = series.reduce((sum, p) => sum + p.orders, 0)
  // Floor the axis at ₱100 so an empty period still draws a sensible scale.
  const top = niceCeil(Math.max(...series.map((p) => p.sales), 10_000))
  const labelEvery = n <= 7 ? 1 : 7
  const todayKey = ymd(new Date())
  const picked = sel !== null ? series[sel] : null
  // Seven bars fit beside the total; denser ranges get the full card width.
  const sideBySide = range === '7d'

  const idxAt = (clientX: number) => {
    const r = plotRef.current!.getBoundingClientRect()
    return Math.min(n - 1, Math.max(0, Math.floor(((clientX - r.left) / r.width) * n)))
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const cur = sel ?? n - 1
    const next = e.key === 'ArrowLeft' ? cur - 1 : e.key === 'ArrowRight' ? cur + 1 : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : null
    if (e.key === 'Escape') { setSel(null); return }
    if (next === null) return
    e.preventDefault()
    const i = Math.min(n - 1, Math.max(0, next))
    setSel(i)
    plotRef.current?.querySelectorAll('button')[i]?.focus()
  }

  return (
    <section className={`${card} p-4 sm:p-5`}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 className="text-base font-bold text-slate-900">Order value</h2>
        <div role="tablist" aria-label="Order value period" className="flex rounded-xl bg-blue-50/70 p-1">
          {RANGES.map((r) => (
            <button
              key={r.id}
              role="tab"
              aria-selected={range === r.id}
              onClick={() => { setRange(r.id); setSel(null) }}
              className={`min-h-9 whitespace-nowrap rounded-lg px-3 text-xs font-medium transition-colors ${
                range === r.id ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30' : 'text-slate-600 active:bg-blue-100'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className={`mt-4 grid items-center gap-4 ${sideBySide ? 'min-[400px]:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]' : ''}`}>
        {/* Readout: shows the period total, or the day being inspected */}
        <div aria-live="polite" className={`rounded-2xl border p-4 transition-colors ${picked ? 'border-blue-200 bg-blue-50/50' : 'border-slate-200/70'}`}>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span className="truncate">{picked ? longDate(picked.date) : 'Total order value'}</span>
            {picked?.date === todayKey && <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white">Today</span>}
          </div>
          <div className="mt-1 truncate text-[clamp(1.375rem,6.5vw,1.875rem)] font-bold leading-tight tracking-tight tabular-nums text-slate-900">
            {formatPeso(picked ? picked.sales : total)}
          </div>
          <div className="mt-1 truncate text-sm text-slate-600">
            {picked ? (
              <>{plural(picked.orders, 'order')}{total > 0 && <> · {Math.round((picked.sales / total) * 100)}% of period</>}</>
            ) : (
              <>{plural(orders, 'order')} · avg {formatPeso(Math.round(total / n))}/day</>
            )}
          </div>
        </div>

        <div>
          {/* pt-6 reserves room for the value label above a full-height bar */}
          <div className="flex gap-2 pt-6">
            <div className={`flex shrink-0 flex-col justify-between text-right text-[10px] tabular-nums text-slate-500 ${sideBySide ? 'h-28' : 'h-36'}`} aria-hidden>
              <span className="-translate-y-1.5">{axisPeso(top)}</span>
              <span>{axisPeso(top / 2)}</span>
              <span className="translate-y-1.5">₱0</span>
            </div>
            <div
              ref={plotRef}
              role="group"
              aria-label="Daily order value. Use arrow keys to move between days."
              onKeyDown={onKeyDown}
              onPointerDown={(e) => {
                if (e.pointerType === 'mouse' && e.button !== 0) return
                e.preventDefault() // keep taps from focusing a bar (focus is for keyboard)
                const i = idxAt(e.clientX)
                press.current = { i, wasSel: sel === i, moved: false }
                setSel(i)
                e.currentTarget.setPointerCapture(e.pointerId)
              }}
              onPointerMove={(e) => {
                const i = idxAt(e.clientX)
                if (press.current) {
                  if (i !== press.current.i) press.current.moved = true
                  setSel(i)
                } else if (e.pointerType === 'mouse') setSel(i)
              }}
              onPointerUp={(e) => {
                const p = press.current
                press.current = null
                // Tapping the selected bar again returns to the total (hover handles this for mouse).
                if (p && !p.moved && p.wasSel && e.pointerType !== 'mouse') setSel(null)
              }}
              onPointerCancel={() => { press.current = null }}
              onPointerLeave={(e) => { if (e.pointerType === 'mouse' && !press.current) setSel(null) }}
              className={`relative min-w-0 flex-1 cursor-pointer touch-pan-y select-none ${sideBySide ? 'h-28' : 'h-36'}`}
            >
              <div className="absolute inset-0 flex flex-col justify-between" aria-hidden>
                <div className="border-t border-slate-100" />
                <div className="border-t border-slate-100" />
                <div className="border-t border-slate-200" />
              </div>
              <div className="absolute inset-0 flex items-end gap-0.5 sm:gap-1">
                {series.map((p, i) => {
                  const h = (p.sales / top) * 100
                  const isSel = sel === i
                  // Keep edge labels inside the card.
                  const align = i < n / 4 ? 'left-0' : i >= (n * 3) / 4 ? 'right-0' : 'left-1/2 -translate-x-1/2'
                  return (
                    <button
                      key={p.date}
                      type="button"
                      tabIndex={i === (sel ?? n - 1) ? 0 : -1}
                      aria-pressed={isSel}
                      aria-label={`${longDate(p.date)}: ${formatPeso(p.sales)}, ${plural(p.orders, 'order')}`}
                      onFocus={(e) => { if (e.currentTarget.matches(':focus-visible')) setSel(i) }}
                      onClick={(e) => { if (e.detail === 0) setSel(isSel ? null : i) }} // Enter/Space only
                      className="relative flex h-full min-w-0 flex-1 items-end justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-blue-600/40"
                    >
                      {isSel && (
                        <span
                          aria-hidden
                          className={`pointer-events-none absolute z-10 mb-1.5 whitespace-nowrap rounded-md bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white shadow-sm ${align}`}
                          style={{ bottom: `${h}%` }}
                        >
                          {axisPeso(p.sales)}
                        </span>
                      )}
                      <span
                        className={`w-full max-w-6 rounded-t transition-[height,background-color] duration-300 motion-reduce:transition-none ${
                          p.sales === 0 ? 'bg-blue-100'
                            : isSel ? 'bg-blue-700'
                            : sel !== null ? 'bg-blue-200'
                            : p.date === todayKey ? 'bg-blue-600' : 'bg-blue-300'
                        }`}
                        // Zero days keep a stub so they read as "no sales", not missing data.
                        style={{ height: `${h}%`, minHeight: p.sales ? 4 : 2 }}
                      />
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
          <div className="mt-2 flex gap-0.5 text-[11px] text-slate-500 sm:gap-1" aria-hidden>
            {/* Invisible copy of the widest axis label keeps day labels aligned under their bars */}
            <span className="invisible mr-1.5 shrink-0 text-[10px]">{axisPeso(top)}</span>
            {series.map((p, i) => (
              <span
                key={p.date}
                className={`flex min-w-0 flex-1 whitespace-nowrap ${labelEvery > 1 && i === n - 1 ? 'justify-end' : 'justify-center'} ${
                  sel === i ? 'font-semibold text-blue-600' : p.date === todayKey ? 'font-semibold text-slate-800' : ''
                }`}
              >
                {(n - 1 - i) % labelEvery === 0
                  ? n <= 7 ? parseYmd(p.date).toLocaleDateString('en-PH', { weekday: 'short' }) : shortDate(parseYmd(p.date))
                  : ''}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Fixed-height footer: a hint when idle, a way back to the total when inspecting a day */}
      <div className="mt-2 flex h-9 items-center justify-center text-xs">
        {picked ? (
          <button type="button" onClick={() => setSel(null)} className="inline-flex h-9 items-center gap-1 rounded-lg px-3 font-semibold text-blue-600 active:bg-blue-50">
            <Icon className="h-3.5 w-3.5">{I.x}</Icon>Show period total
          </button>
        ) : total === 0 ? (
          <span className="text-slate-400">No orders recorded in this period yet</span>
        ) : (
          <span className="text-slate-400">Tap or slide across the bars to see each day</span>
        )}
      </div>
    </section>
  )
}

function Skeleton() {
  const block = 'animate-pulse bg-blue-100/50'
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading dashboard">
      <div className={`${block} h-44 rounded-3xl`} />
      <div className={`${block} h-14 rounded-2xl`} />
      <div className={`${block} h-36 rounded-2xl`} />
      <div className={`${block} h-64 rounded-2xl`} />
    </div>
  )
}

// ---------- page ----------

export default function Dashboard() {
  const { user, can } = useAuth()
  const financials = can('dashboard.financials')
  const [data, setData] = useState<Data | null>(null)
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

  function handleRetry() {
    setRetrying(true)
    fetchData().finally(() => setRetrying(false))
  }

  const firstName = (user?.full_name ?? '').split(' ')[0] || 'there'
  const s = data?.stats
  const inProgress = s ? s.received + s.washing + s.drying : 0
  const today = new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' })
  // One concrete line instead of a generic welcome: what's waiting on the counter right now.
  const summary = !s ? null
    : s.ready > 0 ? `${plural(s.ready, 'order')} ready for pickup`
    : inProgress > 0 ? `${inProgress} in progress`
    : 'No orders in the shop'

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-6">
      <AppHeader actions={data && <Notifications s={data.stats} ready={data.ready} />} />

      {/* One line of greeting, one line of what matters right now */}
      <div className="min-w-0 px-1">
        <p className="truncate text-sm text-slate-500">{today}</p>
        <h1 className="mt-0.5 truncate text-2xl font-bold tracking-tight text-slate-900">{greeting()} {firstName}</h1>
        {summary && (
          <p className={`mt-1 truncate text-sm font-semibold ${s && s.ready > 0 ? 'text-blue-700' : 'text-slate-600'}`}>{summary}</p>
        )}
      </div>

      {/* Store shift: open/closed and what the drawer should hold. Closed blocks payments, so it sits up top. */}
      <StoreStatusBar />

      {error && !data ? (
        <div className={`${card} p-6 text-center`}>
          <p className="font-semibold text-slate-900">Couldn't load the dashboard.</p>
          <p className="mt-1 text-sm text-slate-500">Your orders are safe. Please try again.</p>
          <button onClick={handleRetry} disabled={retrying} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white active:bg-blue-700 disabled:opacity-60">
            <Icon className="h-5 w-5">{I.refresh}</Icon>{retrying ? 'Retrying…' : 'Try again'}
          </button>
        </div>
      ) : !data || !s ? (
        <Skeleton />
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
            <div className="min-w-0 space-y-3">
              <TodayHero s={s} financials={financials} reportsTo={can('reports.view') ? '/reports' : `/orders?date=${ymd(new Date())}`} />
              {/* Pickup starts here: scan the claim stub to open the order. New order lives in the tab bar. */}
              <ScanQrButton
                label="Scan QR for pickup"
                className="flex min-h-14 w-full items-center justify-center gap-2.5 rounded-2xl border border-blue-200 bg-white px-5 text-base font-semibold text-blue-700 shadow-[0_1px_3px_rgba(15,23,42,0.05)] transition active:scale-[0.99] active:bg-blue-50"
              />
            </div>
            <Pipeline s={s} />
          </div>

          <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
            <ReadyForPickup s={s} ready={data.ready} />
            <RecentOrders rows={data.recent} />
          </div>

          {financials && <SalesOverview daily={data.daily} />}
        </>
      )}
    </div>
  )
}
