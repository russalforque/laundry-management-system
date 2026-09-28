import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { PaymentBadge, StatusBadge } from '../../components/Badges'
import { card, Notifications, ReadyRow, SalesOverview } from '../../components/dashboard/DashboardParts'
import { btnPrimary } from '../../components/desktop-tablet/ui'
import { I, Icon } from '../../components/Icons'
import { when } from '../../components/OrderCard'
import { ScanQrButton } from '../../components/ScanOrder'
import { StoreStatusBar } from '../../components/StoreStatus'
import { useAuth } from '../../context/AuthContext'
import type { DashboardStats } from '../../db/dashboard'
import type { OrderListRow } from '../../db/orderQueries'
import { plural, tilePeso, useDashboard } from '../../hooks/useDashboard'
import { formatPeso } from '../../lib/money'
import { PROCESSING, STATUS_LABEL } from '../../lib/orders'
import type { OrderRow, OrderStatus } from '../../types'

/** Header buttons: white, lifted, 48px tall. */
const headerBtn = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200/70 bg-white px-5 text-sm font-semibold text-slate-800 shadow-[0_2px_8px_rgba(15,23,42,0.06)] hover:bg-slate-50 active:bg-slate-100'

/** Card title row inside a card. */
function CardHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <h2 className="truncate text-lg font-bold text-slate-900">{title}</h2>
      {action}
    </div>
  )
}

function ViewAll({ to }: { to: string }) {
  return (
    <Link to={to} className="-mr-2 inline-flex min-h-11 shrink-0 items-center gap-0.5 rounded-lg px-2 text-sm font-semibold text-blue-600 hover:bg-blue-50">
      View all<Icon className="h-4 w-4">{I.chevron}</Icon>
    </Link>
  )
}

/** One linked headline figure: icon tile, label, value and a line of context. The lead figure is solid blue. */
function KpiLink({ label, value, sub, to, icon, alert, lead }: { label: string; value: string; sub?: string; to: string; icon: ReactNode; alert?: boolean; lead?: boolean }) {
  return (
    <Link
      to={to}
      className={`group relative flex min-w-0 gap-4 overflow-hidden rounded-2xl p-5 transition ${
        lead ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25 hover:bg-blue-700' : `${card} hover:border-blue-200 hover:shadow-md`
      }`}
    >
      {lead && (
        // Decorative rising bars in the corner of the lead card
        <span aria-hidden className="pointer-events-none absolute bottom-0 right-5 flex items-end gap-1.5 opacity-25">
          {[18, 28, 22, 38, 52].map((h, i) => <span key={i} className="w-2.5 rounded-t-md bg-white" style={{ height: h }} />)}
        </span>
      )}
      <span className={`grid size-12 shrink-0 place-items-center rounded-xl ${lead ? 'bg-white/20 text-white' : 'bg-blue-50 text-blue-600'}`}>
        <Icon className="h-6 w-6">{icon}</Icon>
      </span>
      <span className="relative flex min-w-0 flex-1 flex-col">
        <span className="flex items-center justify-between gap-2">
          <span className={`flex min-w-0 items-center gap-1.5 truncate text-sm font-medium ${lead ? 'text-blue-50' : 'text-slate-600'}`}>
            {alert && <span className="size-2 shrink-0 rounded-full bg-amber-400" aria-hidden />}
            {label}
          </span>
          <span className={`grid size-7 shrink-0 place-items-center rounded-full transition-transform group-hover:translate-x-0.5 ${lead ? 'bg-white/20 text-white' : 'bg-slate-50 text-slate-400'}`}>
            <Icon className="h-4 w-4">{I.chevron}</Icon>
          </span>
        </span>
        <span className={`mt-1.5 truncate text-3xl font-bold tracking-tight tabular-nums ${lead ? 'text-white' : 'text-slate-900'}`}>{value}</span>
        {sub && <span className={`mt-1.5 truncate text-sm ${lead ? 'text-blue-100' : 'text-slate-500'}`}>{sub}</span>}
      </span>
    </Link>
  )
}

/** Active workflow stages, each with its own tint so the tiles and the bar below read together. */
const FLOW: { status: Exclude<OrderStatus, 'released' | 'cancelled'>; key: 'received' | 'processing' | 'ready'; icon: ReactNode; tile: string; badge: string; bar: string }[] = [
  { status: 'received', key: 'received', icon: I.orders, tile: 'bg-blue-50/60 hover:bg-blue-50', badge: 'bg-white text-blue-600', bar: 'bg-blue-300' },
  { status: PROCESSING, key: 'processing', icon: I.basket, tile: 'bg-blue-50/60 hover:bg-blue-50', badge: 'bg-white text-blue-600', bar: 'bg-blue-600' },
  { status: 'ready', key: 'ready', icon: I.shirt, tile: 'bg-emerald-50/70 hover:bg-emerald-50', badge: 'bg-white text-emerald-600', bar: 'bg-emerald-500' },
]

/** Orders in the shop as a left-to-right workflow: a tile per stage over one proportional bar. */
function Pipeline({ s }: { s: DashboardStats }) {
  const active = FLOW.reduce((n, f) => n + s[f.key], 0)
  return (
    <section className={`${card} p-5`}>
      <CardHeader title="In the shop" action={<span className="text-sm tabular-nums text-slate-500">{active} active</span>} />
      <ol className="mt-3 grid grid-cols-3 gap-3">
        {FLOW.map((f) => {
          const n = s[f.key]
          return (
            <li key={f.status} className="min-w-0">
              <Link
                to={`/orders?status=${f.status}`}
                aria-label={`${STATUS_LABEL[f.status]}: ${plural(n, 'order')}`}
                className={`flex h-full flex-col rounded-2xl p-4 transition active:scale-[0.98] ${f.tile}`}
              >
                <span className={`grid size-11 place-items-center rounded-full shadow-sm ${f.badge}`}>
                  <Icon className="h-6 w-6">{f.icon}</Icon>
                </span>
                <span className={`mt-4 text-3xl font-bold tabular-nums ${n ? 'text-slate-900' : 'text-slate-400'}`}>{n}</span>
                <span className="mt-0.5 truncate text-sm text-slate-600">{f.status === 'ready' ? 'Ready for Pickup' : STATUS_LABEL[f.status]}</span>
              </Link>
            </li>
          )
        })}
      </ol>
      <div className="mt-5 flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
        {active > 0 && FLOW.map((f) => s[f.key] > 0 && <span key={f.key} className={f.bar} style={{ width: `${(s[f.key] / active) * 100}%` }} />)}
      </div>
    </section>
  )
}

/** The counter's to-do list, earliest pickup (so overdue) first. */
function ReadyForPickup({ s, ready }: { s: DashboardStats; ready: OrderRow[] }) {
  const shown = ready.slice(0, 4)
  return (
    <section className={`${card} flex flex-col p-5`}>
      <CardHeader title="Ready for pickup" action={<ViewAll to="/orders?status=ready" />} />
      <div className="mt-3 flex flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200/70">
        {shown.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-8 text-center">
            <span className="relative grid size-24 place-items-center rounded-full bg-blue-50 text-blue-600">
              <Icon className="h-12 w-12">{I.basket}</Icon>
              <span aria-hidden className="absolute -right-1 top-2 text-lg text-blue-500">✦</span>
              <span aria-hidden className="absolute -left-2 bottom-4 text-xs text-blue-400">✦</span>
            </span>
            <p className="mt-4 font-semibold text-slate-900">Nothing waiting for pickup</p>
            <p className="mt-1 text-sm text-slate-500">Orders appear here as soon as they're marked Ready.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {shown.map((o) => <li key={o.id}><ReadyRow o={o} /></li>)}
            {s.ready > shown.length && (
              <li>
                <Link to="/orders?status=ready" className="flex min-h-11 items-center justify-center text-sm font-semibold text-blue-600 hover:bg-blue-50">
                  {s.ready - shown.length} more ready
                </Link>
              </li>
            )}
          </ul>
        )}
      </div>
    </section>
  )
}

const ROW_ICON: Record<OrderStatus, string> = {
  received: 'bg-blue-50 text-blue-600',
  [PROCESSING]: 'bg-blue-50 text-blue-600',
  ready: 'bg-blue-600 text-white',
  released: 'bg-emerald-50 text-emerald-600',
  cancelled: 'bg-slate-100 text-slate-400',
}

/** Latest orders: customer, number and time, status, total. */
function RecentOrders({ rows }: { rows: OrderListRow[] }) {
  const shown = rows.slice(0, 4)
  return (
    <section className={`${card} flex flex-col p-5`}>
      <CardHeader title="Recent orders" action={shown.length > 0 && <ViewAll to="/orders" />} />
      <div className="mt-3 flex flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200/70">
        {shown.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
            <span className="grid size-14 place-items-center rounded-full bg-blue-50 text-blue-500"><Icon className="h-7 w-7">{I.orders}</Icon></span>
            <p className="mt-3 font-semibold text-slate-900">No orders yet</p>
            <p className="mt-1 text-sm text-slate-500">New laundry orders will show up here.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {shown.map((o) => (
              <li key={o.id}>
                <Link to={`/orders/${o.id}`} className="grid min-h-16 grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] items-center gap-3 px-3 py-2.5 hover:bg-slate-50">
                  <span className={`grid size-9 place-items-center rounded-full ${ROW_ICON[o.status]}`}><Icon className="h-5 w-5">{I.basket}</Icon></span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-slate-900">{o.customer_name}</span>
                    <span className="block truncate text-xs text-slate-500">#{o.order_number} · {when(o.received_at)}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <StatusBadge status={o.status} />
                    {o.status !== 'cancelled' && o.payment_status !== 'paid' && <PaymentBadge status={o.payment_status} />}
                  </span>
                  <span className={`w-24 text-right font-bold tabular-nums ${o.status === 'cancelled' ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{formatPeso(o.total_cents)}</span>
                  <Icon className="h-5 w-5 text-slate-300">{I.chevron}</Icon>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

/** Quick action tile body: icon badge, title and one line of context. */
function ActionBody({ icon, title, sub, badge, lead }: { icon: ReactNode; title: string; sub: string; badge: string; lead?: boolean }) {
  return (
    <>
      <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${badge}`}><Icon className="h-5 w-5">{icon}</Icon></span>
      <span className="min-w-0 text-left">
        <span className={`block truncate text-sm font-semibold ${lead ? 'text-white' : 'text-slate-900'}`}>{title}</span>
        <span className={`block truncate text-xs ${lead ? 'text-blue-100' : 'text-slate-500'}`}>{sub}</span>
      </span>
    </>
  )
}

const actionCls = 'flex min-h-16 min-w-0 items-center gap-3 rounded-2xl px-4 py-3 transition active:scale-[0.98]'

/** Shortcuts to the day's common jobs, limited to what this employee may open. */
function QuickActions() {
  const { can } = useAuth()
  const links = [
    { to: '/services', perm: can('services.manage'), icon: I.shirt, title: 'Manage Services', sub: 'View all services', cls: 'bg-amber-50/80 hover:bg-amber-50', badge: 'bg-white text-amber-500' },
    { to: '/customers', perm: can('customers.manage'), icon: I.users, title: 'Manage Customers', sub: 'Customer records', cls: 'bg-emerald-50/80 hover:bg-emerald-50', badge: 'bg-white text-emerald-600' },
    { to: '/reports', perm: can('reports.view'), icon: I.chart, title: 'View Reports', sub: 'Sales and analytics', cls: 'bg-violet-50/80 hover:bg-violet-50', badge: 'bg-white text-violet-600' },
  ].filter((l) => l.perm)
  return (
    <section className={`${card} p-5`}>
      <h2 className="text-lg font-bold text-slate-900">Quick actions</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {can('orders.manage') && (
          <Link to="/orders/new" className={`${actionCls} bg-blue-600 shadow-md shadow-blue-600/25 hover:bg-blue-700`}>
            <ActionBody icon={I.plus} title="New Order" sub="Create a new order" badge="bg-white text-blue-600" lead />
          </Link>
        )}
        {/* Renders nothing for employees who can't manage orders */}
        <ScanQrButton className={`${actionCls} bg-blue-50/70 hover:bg-blue-50`}>
          <ActionBody icon={I.scan} title="Scan QR" sub="For pickup" badge="bg-white text-blue-600" />
        </ScanQrButton>
        {links.map((l) => (
          <Link key={l.to} to={l.to} className={`${actionCls} ${l.cls}`}>
            <ActionBody icon={l.icon} title={l.title} sub={l.sub} badge={l.badge} />
          </Link>
        ))}
      </div>
    </section>
  )
}

/**
 * Tablet / desktop dashboard: greeting and the main actions in one row, today's figures as a KPI row,
 * then the shop floor (workflow + pickups), the business view (recent orders + order value) and quick actions.
 * Same data as the phone dashboard (hooks/useDashboard.ts), arranged for the width.
 */
export default function Dashboard() {
  const { data, failed, retrying, retry, financials, canOrder, reportsTo, todayQs, inProgress, heading } = useDashboard()
  const s = data?.stats
  const kpis = !s ? [] : financials
    ? [
        { label: 'Collected Today', value: formatPeso(s.today_collected_cents), sub: `${tilePeso(s.today_sales_cents)} in ${plural(s.today_orders, 'new order')}`, to: reportsTo, icon: I.database, lead: true },
        { label: 'Orders Today', value: String(s.today_orders), sub: `${inProgress} in progress`, to: todayQs, icon: I.orders },
        { label: 'Completed Today', value: String(s.released_today), sub: `${plural(s.ready, 'order')} ready for pickup`, to: '/orders?status=released', icon: I.check },
        { label: 'Balance Due', value: tilePeso(s.outstanding_cents), sub: `On ${plural(s.unpaid_orders, 'order')} not fully paid`, to: '/orders?payment=due', icon: I.wallet, alert: s.outstanding_cents > 0 },
      ]
    : [
        { label: 'Orders Today', value: String(s.today_orders), sub: `${inProgress} in progress`, to: todayQs, icon: I.orders, lead: true },
        { label: 'Ready for Pickup', value: String(s.ready), sub: 'Waiting for their customer', to: '/orders?status=ready', icon: I.bag },
        { label: 'Completed Today', value: String(s.released_today), sub: 'Picked up today', to: '/orders?status=released', icon: I.check },
        { label: 'Not Fully Paid', value: String(s.unpaid_orders), sub: s.unpaid_orders ? 'Balance to collect at pickup' : 'All orders are fully paid', to: '/orders?payment=due', icon: I.wallet, alert: s.outstanding_cents > 0 },
      ]

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm text-slate-500">{heading.today}</p>
          <h1 className="mt-0.5 truncate text-3xl font-bold tracking-tight text-slate-900">{heading.greeting}</h1>
          <p className={`mt-1 truncate ${heading.urgent ? 'font-semibold text-blue-700' : 'text-slate-500'}`}>
            {heading.urgent ? heading.summary : "Here's what's happening in your shop today."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {data && (
            <Notifications
              s={data.stats}
              ready={data.ready}
              className="relative grid size-12 shrink-0 place-items-center rounded-2xl border border-slate-200/70 bg-white text-slate-700 shadow-[0_2px_8px_rgba(15,23,42,0.06)] hover:bg-slate-50 active:bg-slate-100"
            />
          )}
          <ScanQrButton label="Scan QR for pickup" className={headerBtn} />
          {canOrder && (
            <Link to="/orders/new" className={`${btnPrimary} min-h-12 rounded-2xl px-6 shadow-md`}>
              <Icon className="h-5 w-5">{I.plus}</Icon>New Order
            </Link>
          )}
        </div>
      </div>

      <StoreStatusBar />

      {failed ? (
        <div className={`${card} p-6 text-center`}>
          <p className="font-semibold text-slate-900">Couldn't load the dashboard.</p>
          <p className="mt-1 text-sm text-slate-500">Your orders are safe. Please try again.</p>
          <button onClick={retry} disabled={retrying} className={`${btnPrimary} mt-4`}>
            <Icon className="h-5 w-5">{I.refresh}</Icon>{retrying ? 'Retrying…' : 'Try again'}
          </button>
        </div>
      ) : !data || !s ? (
        <div className="space-y-5" aria-busy="true" aria-label="Loading dashboard">
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-blue-100/50" />)}</div>
          <div className="grid gap-5 lg:grid-cols-2"><div className="h-64 animate-pulse rounded-2xl bg-blue-100/50" /><div className="h-64 animate-pulse rounded-2xl bg-blue-100/50" /></div>
        </div>
      ) : (
        <>
          <section aria-label="Today" className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            {kpis.map((k) => <KpiLink key={k.label} {...k} />)}
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <Pipeline s={s} />
            <ReadyForPickup s={s} ready={data.ready} />
          </div>

          <div className={`grid gap-5 ${financials ? 'xl:grid-cols-2' : ''}`}>
            <RecentOrders rows={data.recent} />
            {financials && <SalesOverview daily={data.daily} compare />}
          </div>

          <QuickActions />
        </>
      )}
    </div>
  )
}
