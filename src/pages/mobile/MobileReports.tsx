import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AppHeader } from '../../components/AppHeader'
import { Avatar } from '../../components/Avatar'
import { Chip } from '../../components/Chip'
import { DateInput } from '../../components/Controls'
import { I, Icon } from '../../components/Icons'
import {
  BarChart, card, EmptyState, HeroFigure, Insight, MiniStat, REPORT_CATEGORIES as CATEGORIES, REPORT_FOOTNOTE, SectionHeader, ServiceList,
  StatusBreakdown, Trend, TURNAROUND_FOOTNOTE,
} from '../../components/reports/ReportParts'
import { fieldCls } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { useReports } from '../../hooks/useReports'
import { formatPeso } from '../../lib/money'
import {
  longDate, plural, REPORT_RANGES as RANGES, seriesOf, shortDate, shortPeso, sum, type ReportData, type ReportRange, type ReportView,
} from '../../lib/reportData'

/**
 * Table rows as card lines (first column as the title, the rest as label/value pairs), so nothing scrolls
 * sideways on a phone. `foot` is the totals row.
 */
function DataTable({ head, rows, foot }: { head: string[]; rows: ReactNode[][]; foot?: ReactNode[] }) {
  if (rows.length === 0) return <div className={`${card} p-6 text-center text-sm text-slate-500`}>No orders in this period. Pick another period above.</div>
  const pairs = (r: ReactNode[]) => r.slice(1).map((c, j) => ({ label: head[j + 1]!, value: c }))
  const mobileRow = (r: ReactNode[], total = false) => {
    const [first, ...rest] = pairs(r)
    return (
      <div className={`px-4 py-3 ${total ? 'bg-slate-50' : ''}`}>
        <div className="flex items-baseline justify-between gap-3">
          <span className={`min-w-0 truncate ${total ? 'font-bold text-slate-900' : 'font-semibold text-slate-900'}`}>{r[0]}</span>
          {head.length === 2 && <span className="shrink-0 font-bold tabular-nums text-slate-900">{first!.value}</span>}
        </div>
        {head.length > 2 && (
          <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            {[first!, ...rest].map((p) => (
              <div key={p.label} className="flex justify-between gap-2">
                <dt className="text-slate-500">{p.label}</dt>
                <dd className={`tabular-nums ${total ? 'font-bold text-slate-900' : 'font-medium text-slate-800'}`}>{p.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    )
  }
  return (
    <ul className={`${card} divide-y divide-slate-100 overflow-hidden`}>
      {rows.map((r, i) => <li key={i}>{mobileRow(r)}</li>)}
      {foot && <li>{mobileRow(foot, true)}</li>}
    </ul>
  )
}

/** Preset chips, custom dates, and the period spelled out once. */
function PeriodPicker({ range, onRange, from, to, valid, vs, setFrom, setTo }: {
  range: ReportRange; onRange: (r: ReportRange) => void; from: string; to: string; valid: boolean; vs: string; setFrom: (v: string) => void; setTo: (v: string) => void
}) {
  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="Report period" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none">
        {RANGES.map(([id, label]) => <Chip key={id} active={range === id} onClick={() => onRange(id)}>{label}</Chip>)}
      </div>
      {range === 'custom' && (
        <div className="grid grid-cols-2 gap-3">
          <label className="min-w-0 text-sm font-medium text-slate-600">From<span className="mt-1 block"><DateInput className={fieldCls} value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></span></label>
          <label className="min-w-0 text-sm font-medium text-slate-600">To<span className="mt-1 block"><DateInput className={fieldCls} value={to} min={from} onChange={(e) => setTo(e.target.value)} /></span></label>
        </div>
      )}
      <p className="flex items-center gap-2 px-1 text-sm text-slate-500">
        <Icon className="h-4 w-4 shrink-0 text-slate-400">{I.calendar}</Icon>
        {valid
          ? <span className="min-w-0 truncate"><b className="font-semibold text-slate-800">{shortDate(from)} – {longDate(to)}</b> · compared with {vs}</span>
          : <span className="font-medium text-red-600">From must be on or before To.</span>}
      </p>
    </div>
  )
}

function Skeleton() {
  const block = 'animate-pulse rounded-2xl bg-slate-200/60'
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading reports">
      <div className={`${block} h-44`} />
      <div className="grid grid-cols-3 gap-2">{[0, 1, 2].map((i) => <div key={i} className={`${block} h-24`} />)}</div>
      <div className={`${block} h-64`} />
    </div>
  )
}

// ---------- detail views ----------

function ReportDetail({ view, data, from, to, vs, onView }: { view: ReportView; data: ReportData; from: string; to: string; vs: string; onView: (v: ReportView) => void }) {
  const { now, prev, daily, orders, services, customers } = data
  const note = `vs ${vs}`

  if (view === 'sales') {
    const top = services[0]
    const totalSvc = sum(services, (s) => s.revenue_cents)
    const collected = sum(daily, (d) => d.collected_cents)
    const cash = sum(daily, (d) => d.cash_cents)
    const outstanding = sum(daily, (d) => d.outstanding_cents)
    const refunded = sum(daily, (d) => d.refunds_cents)
    return (
      <>
        <HeroFigure label="Order value" value={formatPeso(now.revenue_cents)} trend={<Trend now={now.revenue_cents} prev={prev.revenue_cents} />} note={note} />
        <div className="grid grid-cols-2 gap-2">
          <MiniStat label="Collected" value={shortPeso(collected)} trend={<span className="block text-xs text-slate-500">Cash {shortPeso(cash)} · GCash/other {shortPeso(collected - cash)}{refunded ? ` · ${shortPeso(refunded)} refunded` : ''}</span>} />
          <MiniStat label="Balance Due" value={shortPeso(outstanding)} trend={<span className={`text-xs ${outstanding ? 'font-semibold text-amber-700' : 'text-slate-500'}`}>{outstanding ? 'Still to collect' : 'All fully paid'}</span>} />
        </div>
        <section>
          <SectionHeader title="Order value over time" />
          <BarChart label="Order value over time" from={from} to={to} values={new Map(daily.map((d) => [d.date, d.sales_cents]))} format={shortPeso} unit={formatPeso} />
        </section>
        {top && totalSvc > 0 && (
          <Insight onClick={() => onView('services')}>
            <b className="font-semibold text-slate-900">{top.service_name}</b> is your top service: {Math.round((top.revenue_cents / totalSvc) * 100)}% of order value this period.
          </Insight>
        )}
        <section>
          <SectionHeader
            title="Order value by service"
            action={services.length > 5 && <button onClick={() => onView('services')} className="-mr-2 min-h-11 rounded-lg px-2 text-sm font-semibold text-blue-600 active:bg-blue-50">See all {services.length}</button>}
          />
          <ServiceList rows={services} limit={5} />
        </section>
        <section>
          <SectionHeader title="Daily breakdown" />
          <DataTable
            head={['Date', 'Orders', 'Order value', 'Collected', 'Balance Due']}
            rows={daily.map((d) => [longDate(d.date), d.orders, formatPeso(d.sales_cents), formatPeso(d.collected_cents), formatPeso(d.outstanding_cents)])}
            foot={['Total', sum(daily, (d) => d.orders), formatPeso(sum(daily, (d) => d.sales_cents)), formatPeso(collected), formatPeso(outstanding)]}
          />
        </section>
      </>
    )
  }

  if (view === 'orders') {
    const all = sum(orders.byStatus, (s) => s.orders)
    return (
      <>
        <HeroFigure label="Total orders" value={now.orders.toLocaleString('en-PH')} trend={<Trend now={now.orders} prev={prev.orders} />} note={`${note} · excl. cancelled`} />
        <section>
          <SectionHeader title="Orders over time" />
          <BarChart label="Orders over time" from={from} to={to} values={new Map(orders.byDate.map((d) => [d.date, d.orders]))} format={(v) => String(Math.round(v))} unit={(v) => plural(v, 'order')} />
        </section>
        <section>
          <SectionHeader title="By status" />
          <StatusBreakdown rows={orders.byStatus} />
        </section>
        <section>
          <SectionHeader title="Daily orders" />
          <DataTable head={['Date', 'Orders']} rows={orders.byDate.map((d) => [longDate(d.date), d.orders])} foot={['Total', all]} />
        </section>
      </>
    )
  }

  if (view === 'services') {
    return (
      <>
        <HeroFigure label="Service order value" value={formatPeso(sum(services, (s) => s.revenue_cents))} note={`${plural(services.length, 'service')} used this period`} />
        <section>
          <SectionHeader title="All services · by order value" />
          <ServiceList rows={services} showQty />
        </section>
      </>
    )
  }

  const spent = sum(customers, (c) => c.spent_cents)
  const due = sum(customers, (c) => c.outstanding_cents)
  const owing = customers.filter((c) => c.outstanding_cents > 0).length
  return (
    <>
      <HeroFigure label="Customers served" value={customers.length.toLocaleString('en-PH')} note={`${formatPeso(spent)} total billed`} />
      {due > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-100 bg-amber-50 p-3 text-sm text-amber-800">
          <Icon className="h-5 w-5 shrink-0">{I.info}</Icon>
          <span><b className="font-semibold">{formatPeso(due)}</b> Balance Due across {plural(owing, 'customer')}.</span>
        </div>
      )}
      <section>
        <SectionHeader title="Top customers · by amount billed" />
        {customers.length === 0 ? <div className={card}><EmptyState icon={I.user} text="Customers with orders in this period will appear here." /></div> : (
          <ol className={`${card} divide-y divide-slate-100`}>
            {customers.map((c, i) => (
              <li key={c.customer_code} className="flex items-center gap-3 p-3 sm:p-4">
                <span className="w-5 shrink-0 text-center text-xs font-semibold tabular-nums text-slate-400">{i + 1}</span>
                <Avatar name={c.full_name} className="size-11 text-sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-slate-900">{c.full_name}</div>
                  <div className="truncate text-xs text-slate-500">{c.customer_code} · {plural(c.orders, 'order')}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-bold tabular-nums text-slate-900">{formatPeso(c.spent_cents)}</div>
                  <div className={`text-xs font-medium tabular-nums ${c.outstanding_cents ? 'text-amber-700' : 'text-emerald-700'}`}>
                    {c.outstanding_cents ? `${formatPeso(c.outstanding_cents)} due` : 'Paid'}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  )
}

// ---------- page ----------

/** Phone Reports: the period, the headline figures and a list of detailed reports, each opened on its own screen. */
export default function MobileReports() {
  const { can } = useAuth()
  const { range, pickRange, from, to, valid, vs, setFrom, setTo, view, setView, data, failed, retry, exporting, exportView } = useReports()

  const exportBtn = (
    <button
      type="button"
      onClick={exportView}
      disabled={!data || !valid || exporting}
      aria-label={view ? `Export ${CATEGORIES.find((c) => c.id === view)!.title} as CSV` : 'Export all reports as CSV'}
      className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm active:bg-slate-50 disabled:opacity-50"
    >
      <Icon className="h-4 w-4">{I.download}</Icon>{exporting ? 'Exporting…' : 'CSV'}
    </button>
  )

  const period = <PeriodPicker range={range} onRange={pickRange} from={from} to={to} valid={valid} vs={vs} setFrom={setFrom} setTo={setTo} />

  const body = !valid
    ? null
    : failed
      ? (
        <div className={`${card} flex flex-col items-center p-6 text-center`}>
          <p className="font-semibold text-slate-900">Couldn't load reports</p>
          <p className="mt-1 text-sm text-slate-500">Please try again. If this keeps happening, close and reopen the app.</p>
          <button type="button" onClick={retry} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl px-5 font-semibold text-blue-700 active:bg-blue-50">
            <Icon className="h-5 w-5">{I.refresh}</Icon>Try again
          </button>
        </div>
      )
      : !data ? <Skeleton /> : null

  if (view) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 pb-4">
        <header className="flex items-center gap-2">
          <button onClick={() => setView(null)} aria-label="Back to reports overview" className="-ml-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-slate-800 active:bg-slate-200">
            <Icon className="h-6 w-6">{I.back}</Icon>
          </button>
          <h1 className="min-w-0 flex-1 truncate text-2xl font-bold text-slate-900">Reports</h1>
          {exportBtn}
        </header>

        {/* Switch report without going back */}
        <div role="tablist" aria-label="Report" className="grid grid-cols-4 gap-1 rounded-xl bg-slate-200/60 p-1">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={view === c.id}
              onClick={() => setView(c.id)}
              className={`min-h-11 truncate rounded-lg px-1 text-[13px] font-semibold transition-colors ${view === c.id ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 active:bg-white/60'}`}
            >
              {c.tab}
            </button>
          ))}
        </div>

        {period}

        {body ?? (data && valid && <ReportDetail view={view} data={data} from={from} to={to} vs={vs} onView={setView} />)}
        <p className="px-1 text-xs text-slate-400">{REPORT_FOOTNOTE}</p>
      </div>
    )
  }

  const d = data
  const salesSpark = d ? seriesOf(from, to, new Map(d.daily.map((r) => [r.date, r.sales_cents]))).map((p) => p.value) : []
  // What each report leads with, shown on its row so the overview answers questions without a tap.
  const preview: Record<ReportView, string> = d ? {
    sales: shortPeso(d.now.revenue_cents),
    orders: d.now.orders.toLocaleString('en-PH'),
    customers: d.customers.length.toLocaleString('en-PH'),
    services: d.services[0]?.service_name ?? '—',
  } : { sales: '', orders: '', customers: '', services: '' }

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-4">
      <AppHeader />

      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Reports</h1>
          <p className="mt-1 text-sm text-slate-500">How the business is doing.</p>
        </div>
        {exportBtn}
      </div>

      {period}

      {body ?? (d && valid && (
        <>
          <HeroFigure
            label="Order value"
            value={formatPeso(d.now.revenue_cents)}
            trend={<Trend now={d.now.revenue_cents} prev={d.prev.revenue_cents} />}
            note={`vs ${vs}`}
            spark={salesSpark}
          />
          <div className="grid grid-cols-3 gap-2">
            <MiniStat label="Orders" value={d.now.orders.toLocaleString('en-PH')} trend={<Trend now={d.now.orders} prev={d.prev.orders} />} />
            <MiniStat label="Items" value={d.now.items.toLocaleString('en-PH', { maximumFractionDigits: 1 })} trend={<Trend now={d.now.items} prev={d.prev.items} />} />
            <MiniStat
              label="Turnaround"
              value={d.now.turnaround_days === null ? '—' : `${d.now.turnaround_days.toFixed(1)}d`}
              trend={<Trend now={d.now.turnaround_days} prev={d.prev.turnaround_days} lowerIsBetter />}
            />
          </div>
        </>
      ))}

      <section>
        <SectionHeader title="Detailed reports" />
        <ul className={`${card} divide-y divide-slate-100 overflow-hidden`}>
          {CATEGORIES.map((c) => (
            <li key={c.id}>
              <button onClick={() => setView(c.id)} className="flex min-h-18 w-full items-center gap-3.5 px-4 py-3 text-left transition active:bg-slate-50">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">
                  <Icon className="h-5 w-5">{c.icon}</Icon>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-slate-900">{c.title}</span>
                  <span className="block truncate text-sm text-slate-500">{c.text}</span>
                </span>
                {preview[c.id] && <span className="max-w-24 shrink-0 truncate text-right text-sm font-bold tabular-nums text-slate-900">{preview[c.id]}</span>}
                <Icon className="h-5 w-5 shrink-0 text-slate-400">{I.chevron}</Icon>
              </button>
            </li>
          ))}
        </ul>
      </section>
      {can('store.history') && (
        <Link to="/store" className={`${card} flex min-h-16 items-center gap-3.5 px-4 py-3 active:bg-slate-50`}>
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600"><Icon className="h-5 w-5">{I.store}</Icon></span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-slate-900">Store shifts</span>
            <span className="block truncate text-sm text-slate-500">Opening cash, drawer counts, over / short</span>
          </span>
          <Icon className="h-5 w-5 shrink-0 text-slate-400">{I.chevron}</Icon>
        </Link>
      )}
      <p className="px-1 text-xs text-slate-400">{TURNAROUND_FOOTNOTE}</p>
    </div>
  )
}
