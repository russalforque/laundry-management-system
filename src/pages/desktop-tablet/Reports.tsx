import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Avatar } from '../../components/Avatar'
import { DateInput } from '../../components/Controls'
import { btnPrimary, btnSecondary, PageHeader, panelCls, SegmentedTabs, table } from '../../components/desktop-tablet/ui'
import { I, Icon, serviceIcon } from '../../components/Icons'
import {
  BarChart, card, EmptyState, Insight, REPORT_CATEGORIES, REPORT_FOOTNOTE, SectionHeader, ServiceList, Sparkline, StatusBreakdown, Trend,
  TURNAROUND_FOOTNOTE,
} from '../../components/reports/ReportParts'
import { fieldCls } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { useReports } from '../../hooks/useReports'
import { formatPeso } from '../../lib/money'
import { formatNumber } from '../../lib/number'
import {
  longDate, plural, REPORT_RANGES, seriesOf, shortDate, shortPeso, sum, unitOf, type ReportData, type ReportView,
} from '../../lib/reportData'

/** Headline figure in a KPI row: label, value, and its change or a note underneath. */
function Kpi({ label, value, sub, spark }: { label: string; value: string; sub?: ReactNode; spark?: number[] }) {
  return (
    <div className={`${panelCls} flex min-h-28 min-w-0 flex-col justify-center p-4`}>
      <span className="truncate text-sm font-medium text-slate-500">{label}</span>
      <span className="mt-1 truncate text-2xl font-bold tabular-nums tracking-tight text-slate-900 xl:text-3xl">{value}</span>
      {sub && <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">{sub}</span>}
      {spark && spark.some((v) => v > 0) && <div className="mt-2"><Sparkline values={spark} /></div>}
    </div>
  )
}

/** A report table: first column text, the rest right-aligned numbers, optional totals row. */
function DataTable({ head, rows, foot, empty = 'No orders in this period. Pick another period above.' }: { head: ReactNode[]; rows: ReactNode[][]; foot?: ReactNode[]; empty?: string }) {
  if (rows.length === 0) return <div className={`${card} p-8 text-center text-sm text-slate-500`}>{empty}</div>
  const cell = (j: number) => `${table.td} whitespace-nowrap ${j ? 'text-right tabular-nums' : ''}`
  return (
    <div className={`${table.wrap} overflow-x-auto`}>
      <table className={table.table}>
        <thead className={table.thead}>
          <tr>{head.map((h, i) => <th key={i} className={`${table.th} ${i ? 'text-right' : ''}`}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
              {r.map((c, j) => <td key={j} className={`${cell(j)} ${j ? 'text-slate-700' : 'font-medium text-slate-900'}`}>{c}</td>)}
            </tr>
          ))}
        </tbody>
        {foot && (
          <tfoot className="border-t border-slate-200 bg-slate-50 font-bold text-slate-900">
            <tr>{foot.map((c, j) => <td key={j} className={cell(j)}>{c}</td>)}</tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

function TopCustomers({ data, limit }: { data: ReportData; limit?: number }) {
  const rows = data.customers.slice(0, limit)
  if (rows.length === 0) return <div className={card}><EmptyState icon={I.user} text="Customers with orders in this period will appear here." /></div>
  return (
    <div className={table.wrap}>
      <table className={table.table}>
        <thead className={table.thead}>
          <tr>
            <th className={`${table.th} w-12 text-center`}>#</th>
            <th className={table.th}>Customer</th>
            <th className={`${table.th} text-right`}>Orders</th>
            <th className={`${table.th} text-right`}>Billed</th>
            <th className={`${table.th} text-right`}>Balance Due</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c, i) => (
            <tr key={c.customer_code} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
              <td className={`${table.td} text-center text-xs font-semibold tabular-nums text-slate-400`}>{i + 1}</td>
              <td className={`${table.td} max-w-0 w-full`}>
                <span className="flex items-center gap-3">
                  <Avatar name={c.full_name} className="size-9 text-xs" />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-slate-900">{c.full_name}</span>
                    <span className="block truncate text-xs text-slate-500">{c.customer_code}</span>
                  </span>
                </span>
              </td>
              <td className={`${table.td} text-right tabular-nums text-slate-700`}>{c.orders}</td>
              <td className={`${table.td} whitespace-nowrap text-right font-semibold tabular-nums text-slate-900`}>{formatPeso(c.spent_cents)}</td>
              <td className={`${table.td} whitespace-nowrap text-right tabular-nums`}>
                {c.outstanding_cents ? <span className="font-semibold text-amber-700">{formatPeso(c.outstanding_cents)}</span> : <span className="text-emerald-700">Paid</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------- views ----------

function Overview({ data, from, to, vs, onView }: { data: ReportData; from: string; to: string; vs: string; onView: (v: ReportView) => void }) {
  const { now, prev, daily, services } = data
  const spark = seriesOf(from, to, new Map(daily.map((r) => [r.date, r.sales_cents]))).map((p) => p.value)
  const note = <span>vs {vs}</span>
  const seeAll = (v: ReportView) => <button type="button" onClick={() => onView(v)} className="-mr-2 min-h-10 rounded-lg px-2 text-sm font-semibold text-blue-600 hover:bg-blue-50">Open report</button>
  return (
    <>
      <section aria-label="Headline figures" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Order value" value={formatPeso(now.revenue_cents)} sub={<><Trend now={now.revenue_cents} prev={prev.revenue_cents} />{note}</>} spark={spark} />
        <Kpi label="Orders" value={now.orders.toLocaleString('en-PH')} sub={<><Trend now={now.orders} prev={prev.orders} />{note}</>} />
        <Kpi label="Items" value={now.items.toLocaleString('en-PH', { maximumFractionDigits: 1 })} sub={<><Trend now={now.items} prev={prev.items} />{note}</>} />
        <Kpi
          label="Turnaround"
          value={now.turnaround_days === null ? '—' : `${now.turnaround_days.toFixed(1)} days`}
          sub={<><Trend now={now.turnaround_days} prev={prev.turnaround_days} lowerIsBetter />{note}</>}
        />
      </section>

      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <section className="min-w-0">
          <SectionHeader title="Order value over time" action={seeAll('sales')} />
          <BarChart label="Order value over time" from={from} to={to} values={new Map(daily.map((d) => [d.date, d.sales_cents]))} format={shortPeso} unit={formatPeso} />
        </section>
        <section className="min-w-0">
          <SectionHeader title="Top services · by order value" action={seeAll('services')} />
          <ServiceList rows={services} limit={5} />
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:items-start">
        <section className="min-w-0">
          <SectionHeader title="Top customers · by amount billed" action={seeAll('customers')} />
          <TopCustomers data={data} limit={8} />
        </section>
        <section className="min-w-0">
          <SectionHeader title="Orders by status" action={seeAll('orders')} />
          <StatusBreakdown rows={data.orders.byStatus} />
        </section>
      </div>
    </>
  )
}

function ReportDetail({ view, data, from, to, vs, onView }: { view: ReportView; data: ReportData; from: string; to: string; vs: string; onView: (v: ReportView) => void }) {
  const { now, prev, daily, orders, services, customers } = data
  const note = <span>vs {vs}</span>

  if (view === 'sales') {
    const top = services[0]
    const totalSvc = sum(services, (s) => s.revenue_cents)
    const collected = sum(daily, (d) => d.collected_cents)
    const cash = sum(daily, (d) => d.cash_cents)
    const outstanding = sum(daily, (d) => d.outstanding_cents)
    const refunded = sum(daily, (d) => d.refunds_cents)
    return (
      <>
        <section aria-label="Sales figures" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Kpi label="Order value" value={formatPeso(now.revenue_cents)} sub={<><Trend now={now.revenue_cents} prev={prev.revenue_cents} />{note}</>} />
          <Kpi label="Collected" value={formatPeso(collected)} sub={`Cash ${shortPeso(cash)} · GCash/other ${shortPeso(collected - cash)}`} />
          <Kpi label="Balance Due" value={formatPeso(outstanding)} sub={<span className={outstanding ? 'font-semibold text-amber-700' : ''}>{outstanding ? 'Still to collect' : 'All fully paid'}</span>} />
          <Kpi label="Refunded" value={formatPeso(refunded)} sub="Given back on cancelled orders" />
        </section>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:items-start">
          <section className="min-w-0">
            <SectionHeader title="Order value over time" />
            <BarChart label="Order value over time" from={from} to={to} values={new Map(daily.map((d) => [d.date, d.sales_cents]))} format={shortPeso} unit={formatPeso} />
          </section>
          <section className="min-w-0 space-y-3">
            <SectionHeader title="Order value by service" />
            {top && totalSvc > 0 && (
              <Insight onClick={() => onView('services')}>
                <b className="font-semibold text-slate-900">{top.service_name}</b> is your top service: {Math.round((top.revenue_cents / totalSvc) * 100)}% of order value this period.
              </Insight>
            )}
            <ServiceList rows={services} limit={5} />
          </section>
        </div>
        <section>
          <SectionHeader title="Daily breakdown" />
          <DataTable
            head={['Date', 'Orders', 'Order value', 'Collected', 'Cash', 'GCash / other', 'Refunds', 'Balance Due']}
            rows={daily.map((d) => [longDate(d.date), d.orders, formatPeso(d.sales_cents), formatPeso(d.collected_cents), formatPeso(d.cash_cents), formatPeso(d.collected_cents - d.cash_cents), formatPeso(d.refunds_cents), formatPeso(d.outstanding_cents)])}
            foot={['Total', sum(daily, (d) => d.orders), formatPeso(sum(daily, (d) => d.sales_cents)), formatPeso(collected), formatPeso(cash), formatPeso(collected - cash), formatPeso(refunded), formatPeso(outstanding)]}
          />
        </section>
      </>
    )
  }

  if (view === 'orders') {
    const all = sum(orders.byStatus, (s) => s.orders)
    const done = orders.byStatus.find((s) => s.status === 'released')?.orders ?? 0
    const cancelled = orders.byStatus.find((s) => s.status === 'cancelled')?.orders ?? 0
    return (
      <>
        <section aria-label="Order figures" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Kpi label="Total orders" value={now.orders.toLocaleString('en-PH')} sub={<><Trend now={now.orders} prev={prev.orders} />{note}<span>· excl. cancelled</span></>} />
          <Kpi label="Completed" value={done.toLocaleString('en-PH')} sub="Picked up by the customer" />
          <Kpi label="Cancelled" value={cancelled.toLocaleString('en-PH')} sub={all ? `${Math.round((cancelled / all) * 100)}% of orders received` : undefined} />
          <Kpi label="Turnaround" value={now.turnaround_days === null ? '—' : `${now.turnaround_days.toFixed(1)} days`} sub={<><Trend now={now.turnaround_days} prev={prev.turnaround_days} lowerIsBetter />{note}</>} />
        </section>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:items-start">
          <section className="min-w-0">
            <SectionHeader title="Orders over time" />
            <BarChart label="Orders over time" from={from} to={to} values={new Map(orders.byDate.map((d) => [d.date, d.orders]))} format={(v) => String(Math.round(v))} unit={(v) => plural(v, 'order')} />
          </section>
          <section className="min-w-0">
            <SectionHeader title="By status" />
            <StatusBreakdown rows={orders.byStatus} />
          </section>
        </div>
        <section>
          <SectionHeader title="Daily orders" />
          <DataTable head={['Date', 'Orders']} rows={orders.byDate.map((d) => [longDate(d.date), d.orders])} foot={['Total', all]} />
        </section>
      </>
    )
  }

  if (view === 'services') {
    const total = sum(services, (s) => s.revenue_cents)
    return (
      <>
        <section aria-label="Service figures" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Kpi label="Service order value" value={formatPeso(total)} sub={`${plural(services.length, 'service')} used this period`} />
          <Kpi label="Top service" value={services[0]?.service_name ?? '—'} sub={services[0] && total ? `${Math.round((services[0].revenue_cents / total) * 100)}% of order value` : undefined} />
        </section>
        <section>
          <SectionHeader title="All services · by order value" />
          <DataTable
            empty="Service sales will appear here once orders are recorded."
            head={['Service', 'Quantity', 'Orders', 'Order value', 'Share']}
            rows={services.map((s) => {
              const pct = total ? Math.round((s.revenue_cents / total) * 100) : 0
              return [
                <span key="n" className="flex items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600"><Icon className="h-5 w-5">{serviceIcon(s.service_name)}</Icon></span>
                  <span className="font-semibold text-slate-900">{s.service_name}</span>
                </span>,
                `${formatNumber(s.quantity)}${s.pricing_method === 'fixed' ? '×' : ` ${unitOf(s)}`}`,
                s.orders,
                <b key="v" className="font-semibold text-slate-900">{formatPeso(s.revenue_cents)}</b>,
                <span key="p" className="inline-flex items-center gap-2">
                  <span className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-blue-600" style={{ width: `${pct}%` }} /></span>
                  <span className="w-9 text-xs">{pct}%</span>
                </span>,
              ]
            })}
            foot={['Total', '', sum(services, (s) => s.orders), formatPeso(total), '100%']}
          />
        </section>
      </>
    )
  }

  const spent = sum(customers, (c) => c.spent_cents)
  const due = sum(customers, (c) => c.outstanding_cents)
  const owing = customers.filter((c) => c.outstanding_cents > 0).length
  return (
    <>
      <section aria-label="Customer figures" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Customers served" value={customers.length.toLocaleString('en-PH')} sub="With orders this period" />
        <Kpi label="Total billed" value={formatPeso(spent)} sub={customers.length ? `Avg ${formatPeso(Math.round(spent / customers.length))} per customer` : undefined} />
        <Kpi label="Balance Due" value={formatPeso(due)} sub={<span className={due ? 'font-semibold text-amber-700' : ''}>{due ? `Across ${plural(owing, 'customer')}` : 'All fully paid'}</span>} />
      </section>
      <section>
        <SectionHeader title="Top customers · by amount billed" />
        <TopCustomers data={data} />
      </section>
    </>
  )
}

/**
 * Reports on tablets and desktops: every report one tab away, the period in a single toolbar, headline
 * figures as a KPI row, charts beside their rankings and full tables below. Same figures, periods and export
 * as the phone page (hooks/useReports.ts).
 */
export default function Reports() {
  const { can } = useAuth()
  const { range, pickRange, from, to, valid, vs, setFrom, setTo, view, setView, data, failed, retry, exporting, exportView, exportViewPdf } = useReports()
  const title = view ? REPORT_CATEGORIES.find((c) => c.id === view)!.title : 'All reports'
  const tabs: { id: ReportView | null; label: string }[] = [{ id: null, label: 'Overview' }, ...REPORT_CATEGORIES.map((c) => ({ id: c.id, label: c.tab }))]

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-6">
      <PageHeader
        title="Reports"
        sub="How the business is doing."
        actions={
          <>
            {can('store.history') && <Link to="/store" className={btnSecondary}><Icon className="h-5 w-5">{I.store}</Icon>Store shifts</Link>}
            {/* What's on screen goes out as a shareable PDF (primary) or a spreadsheet-ready CSV. */}
            <button type="button" onClick={exportView} disabled={!data || !valid || exporting} aria-label={`Export ${title} as CSV`} className={btnSecondary}>
              <Icon className="h-5 w-5">{I.download}</Icon>CSV
            </button>
            <button type="button" onClick={exportViewPdf} disabled={!data || !valid || exporting} aria-label={`Export ${title} as PDF`} className={btnPrimary}>
              <Icon className="h-5 w-5">{I.download}</Icon>{exporting ? 'Exporting…' : `Export ${view ? 'report' : 'all'} (PDF)`}
            </button>
          </>
        }
      />

      <div className={`${panelCls} space-y-3 p-3`}>
        <SegmentedTabs label="Report" options={tabs} value={view} onChange={setView} />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <SegmentedTabs label="Report period" options={REPORT_RANGES.map(([id, label]) => ({ id, label }))} value={range} onChange={pickRange} className="w-full max-w-md" />
          {range === 'custom' && (
            <div className="flex items-center gap-2">
              <label className="w-44"><span className="sr-only">From</span><DateInput className={`${fieldCls} py-2.5`} aria-label="From" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
              <span className="text-sm text-slate-400">to</span>
              <label className="w-44"><span className="sr-only">To</span><DateInput className={`${fieldCls} py-2.5`} aria-label="To" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label>
            </div>
          )}
          <p className="ml-auto flex min-w-0 items-center gap-2 text-sm text-slate-500">
            <Icon className="h-4 w-4 shrink-0 text-slate-400">{I.calendar}</Icon>
            {valid
              ? <span className="min-w-0 truncate"><b className="font-semibold text-slate-800">{shortDate(from)} – {longDate(to)}</b> · compared with {vs}</span>
              : <span className="font-medium text-red-600">From must be on or before To.</span>}
          </p>
        </div>
      </div>

      {!valid ? null : failed ? (
        <div className={`${card} flex flex-col items-center p-8 text-center`}>
          <p className="font-semibold text-slate-900">Couldn't load reports</p>
          <p className="mt-1 text-sm text-slate-500">Please try again. If this keeps happening, close and reopen the app.</p>
          <button type="button" onClick={retry} className={`${btnSecondary} mt-4`}><Icon className="h-5 w-5">{I.refresh}</Icon>Try again</button>
        </div>
      ) : !data ? (
        <div className="space-y-5" aria-busy="true" aria-label="Loading reports">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-200/60" />)}</div>
          <div className="grid gap-5 lg:grid-cols-2"><div className="h-72 animate-pulse rounded-2xl bg-slate-200/60" /><div className="h-72 animate-pulse rounded-2xl bg-slate-200/60" /></div>
        </div>
      ) : view ? (
        <ReportDetail view={view} data={data} from={from} to={to} vs={vs} onView={setView} />
      ) : (
        <Overview data={data} from={from} to={to} vs={vs} onView={setView} />
      )}

      <p className="px-1 text-xs text-slate-400">{view ? REPORT_FOOTNOTE : TURNAROUND_FOOTNOTE}</p>
    </div>
  )
}
