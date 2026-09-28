import { Link } from 'react-router-dom'
import { AppHeader } from '../../components/AppHeader'
import { card, EmptyState, Notifications, Pipeline, ReadyForPickup, SalesOverview, SectionHeader, ViewAll } from '../../components/dashboard/DashboardParts'
import { I, Icon } from '../../components/Icons'
import { OrderCard } from '../../components/OrderCard'
import { ScanQrButton } from '../../components/ScanOrder'
import { StoreStatusBar } from '../../components/StoreStatus'
import type { DashboardStats } from '../../db/dashboard'
import type { OrderListRow } from '../../db/orderQueries'
import { plural, RECENT_PHONE, tilePeso, useDashboard, ymd } from '../../hooks/useDashboard'
import { formatPeso } from '../../lib/money'

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

/** Phone dashboard: brand header, greeting, today's hero, pickup scan, workflow, pickups and recent orders stacked. */
export default function MobileDashboard() {
  const { data, failed, retrying, retry, financials, reportsTo, heading } = useDashboard()
  const s = data?.stats

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-6">
      <AppHeader actions={data && <Notifications s={data.stats} ready={data.ready} />} />

      {/* One line of greeting, one line of what matters right now */}
      <div className="min-w-0 px-1">
        <p className="truncate text-sm text-slate-500">{heading.today}</p>
        <h1 className="mt-0.5 truncate text-2xl font-bold tracking-tight text-slate-900">{heading.greeting}</h1>
        {heading.summary && (
          <p className={`mt-1 truncate text-sm font-semibold ${heading.urgent ? 'text-blue-700' : 'text-slate-600'}`}>{heading.summary}</p>
        )}
      </div>

      {/* Store shift: open/closed and what the drawer should hold. Closed blocks payments, so it sits up top. */}
      <StoreStatusBar />

      {failed ? (
        <div className={`${card} p-6 text-center`}>
          <p className="font-semibold text-slate-900">Couldn't load the dashboard.</p>
          <p className="mt-1 text-sm text-slate-500">Your orders are safe. Please try again.</p>
          <button onClick={retry} disabled={retrying} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white active:bg-blue-700 disabled:opacity-60">
            <Icon className="h-5 w-5">{I.refresh}</Icon>{retrying ? 'Retrying…' : 'Try again'}
          </button>
        </div>
      ) : !data || !s ? (
        <Skeleton />
      ) : (
        <>
          <div className="space-y-3">
            <TodayHero s={s} financials={financials} reportsTo={reportsTo} />
            {/* Pickup starts here: scan the claim stub to open the order. New order lives in the tab bar. */}
            <ScanQrButton
              label="Scan QR for pickup"
              className="flex min-h-14 w-full items-center justify-center gap-2.5 rounded-2xl border border-blue-200 bg-white px-5 text-base font-semibold text-blue-700 shadow-[0_1px_3px_rgba(15,23,42,0.05)] transition active:scale-[0.99] active:bg-blue-50"
            />
          </div>
          <Pipeline s={s} />
          <ReadyForPickup s={s} ready={data.ready} />
          <RecentOrders rows={data.recent.slice(0, RECENT_PHONE)} />
          {financials && <SalesOverview daily={data.daily} />}
        </>
      )}
    </div>
  )
}
