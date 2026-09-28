import { useState, type ReactNode } from 'react'
import { I, Icon, serviceIcon } from '../Icons'
import type { ServiceUsage } from '../../db/reports'
import { formatPeso } from '../../lib/money'
import { formatNumber } from '../../lib/number'
import { PROCESSING, STATUS_LABEL } from '../../lib/orders'
import { longDate, niceCeil, plural, REPORT_TITLE, seriesOf, shortDate, sum, unitOf, type ReportView } from '../../lib/reportData'
import type { OrderStatus } from '../../types'

/** Report figures and charts shared by the phone and tablet / desktop Reports pages (hooks/useReports.ts). */

export const card = 'min-w-0 rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.05)]'

/** Single-hue ramp for ranked rows: darkest = biggest share. */
const TONES = [
  { icon: 'bg-blue-600 text-white', bar: 'bg-blue-600' },
  { icon: 'bg-blue-100 text-blue-700', bar: 'bg-blue-500' },
  { icon: 'bg-blue-100 text-blue-600', bar: 'bg-blue-400' },
  { icon: 'bg-blue-50 text-blue-500', bar: 'bg-blue-300' },
  { icon: 'bg-slate-100 text-slate-500', bar: 'bg-slate-400' },
]

export const STATUS_TONE: Record<OrderStatus, string> = {
  received: 'bg-slate-400', [PROCESSING]: 'bg-blue-400',
  ready: 'bg-blue-600', released: 'bg-emerald-500', cancelled: 'bg-red-400',
}

export const REPORT_CATEGORIES: { id: ReportView; title: string; tab: string; text: string; icon: ReactNode }[] = [
  { id: 'sales', title: REPORT_TITLE.sales, tab: 'Sales', text: 'Order value, collections and balances by day', icon: I.chart },
  { id: 'orders', title: REPORT_TITLE.orders, tab: 'Orders', text: 'Order volume and status', icon: I.report },
  { id: 'customers', title: REPORT_TITLE.customers, tab: 'Customers', text: 'Top customers and balances due', icon: I.user },
  { id: 'services', title: REPORT_TITLE.services, tab: 'Services', text: 'Most used services and their order value', icon: I.shirt },
]

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      {action}
    </div>
  )
}

export function EmptyState({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-400">
        <Icon className="h-6 w-6">{icon}</Icon>
      </span>
      <p className="mt-3 text-sm font-semibold text-slate-900">No orders in this period</p>
      <p className="mt-1 max-w-xs text-sm text-slate-500">{text}</p>
    </div>
  )
}

/**
 * Change vs the previous period as a signed pill: arrow + text carry direction, colour says good/bad
 * (so it never relies on colour alone). `lowerIsBetter` flips the colour (e.g. turnaround time).
 */
export function Trend({ now, prev, lowerIsBetter }: { now: number | null; prev: number | null; lowerIsBetter?: boolean }) {
  if (now === null || !prev) return <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">New</span>
  const pct = Math.round(((now - prev) / prev) * 100)
  if (pct === 0) return <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">No change</span>
  const good = lowerIsBetter ? pct < 0 : pct > 0
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${good ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
      <Icon className="h-3.5 w-3.5">{pct > 0 ? I.up : I.down}</Icon>
      {pct > 0 ? '+' : '−'}{Math.abs(pct)}%
    </span>
  )
}

/** 2px line + 10% wash, with the latest point marked; decorative, the number beside it is the data. */
export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const W = 300
  const H = 56
  const max = Math.max(...values, 1)
  const pts = values.map((v, i) => [(i / (values.length - 1)) * W, H - 4 - (v / max) * (H - 8)] as const)
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const [lx, ly] = pts.at(-1)!
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden className="h-14 w-full overflow-visible">
      <path d={`${line} L${W},${H} L0,${H} Z`} className="fill-blue-600/10" />
      <path d={line} fill="none" className="stroke-blue-600" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={lx} cy={ly} r={4} className="fill-blue-600 stroke-white" strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/** The one headline number per view, its change and (optionally) its trend line. */
export function HeroFigure({ label, value, trend, note, spark }: { label: string; value: string; trend?: ReactNode; note: string; spark?: number[] }) {
  return (
    <section className={`${card} overflow-hidden`}>
      <div className="p-4 sm:p-5">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <p className="mt-1 truncate text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">{value}</p>
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500">{trend}<span>{note}</span></p>
      </div>
      {spark && spark.some((v) => v > 0) && <div className="px-4 pb-3 sm:px-5"><Sparkline values={spark} /></div>}
    </section>
  )
}

/** Compact secondary figure (the hero carries the headline). */
export function MiniStat({ label, value, trend }: { label: string; value: string; trend: ReactNode }) {
  return (
    <div className={`${card} flex min-w-0 flex-col p-3`}>
      <span className="text-xs font-medium leading-tight text-slate-500">{label}</span>
      <span className="mt-1 truncate text-lg font-bold tabular-nums text-slate-900">{value}</span>
      <span className="mt-1">{trend}</span>
    </div>
  )
}

export function BarChart({ from, to, values, format, unit, label }: {
  from: string; to: string; values: Map<string, number>; format: (v: number) => string; unit: (v: number) => string; label: string
}) {
  const [sel, setSel] = useState<number | null>(null)
  const series = seriesOf(from, to, values)
  const top = niceCeil(Math.max(...series.map((p) => p.value)))
  const labelEvery = Math.ceil(series.length / 6)
  const picked = sel !== null ? series[sel] : null
  const total = sum(series, (p) => p.value)
  const peak = series.reduce((m, p, i) => (p.value > series[m]!.value ? i : m), 0)

  return (
    <figure className={`${card} p-4`} aria-label={label}>
      {/* Readout: the tapped bar, else the period's peak — the tooltip that works on touch */}
      <figcaption className="mb-4 flex min-h-10 items-end justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-xs text-slate-500">
            {picked ? (picked.dates.length > 1 ? `${shortDate(picked.dates[0]!)} – ${shortDate(picked.dates.at(-1)!)}` : longDate(picked.dates[0]!)) : 'Busiest'}
          </span>
          <span className="block truncate text-lg font-bold tabular-nums text-slate-900">
            {picked ? unit(picked.value) : total ? `${unit(series[peak]!.value)} · ${series[peak]!.label}` : '—'}
          </span>
        </span>
        <span className="shrink-0 text-xs text-slate-400">{picked ? 'Tap again to clear' : 'Tap a bar'}</span>
      </figcaption>
      <div className="flex gap-2" onMouseLeave={() => setSel(null)}>
        <div className="flex h-44 w-11 shrink-0 flex-col justify-between text-right text-[11px] tabular-nums text-slate-400 sm:h-52" aria-hidden>
          {[1, 0.5, 0].map((f, i) => (
            <span key={f} className={i === 0 ? '-translate-y-1.5' : i === 2 ? 'translate-y-1.5' : ''}>{format(top * f)}</span>
          ))}
        </div>
        <div className="relative h-44 min-w-0 flex-1 sm:h-52">
          <div className="absolute inset-0 flex flex-col justify-between" aria-hidden>
            {[0, 1, 2].map((i) => <div key={i} className={`border-t ${i === 2 ? 'border-slate-300' : 'border-slate-100'}`} />)}
          </div>
          {/* Full-height buttons are the hit targets; the bar inside stays thin (≤24px) */}
          <div className="absolute inset-0 flex items-end gap-0.5">
            {series.map((p, i) => (
              <button
                key={p.label + i}
                type="button"
                aria-label={`${p.label}: ${unit(p.value)}`}
                aria-pressed={sel === i}
                onClick={() => setSel(sel === i ? null : i)}
                onMouseEnter={() => setSel(i)}
                onFocus={() => setSel(i)}
                className="flex h-full min-w-0 flex-1 items-end justify-center rounded-md outline-none focus-visible:bg-blue-50"
              >
                <span
                  className={`w-full max-w-6 rounded-t transition-colors ${sel === null || sel === i ? 'bg-blue-600' : 'bg-blue-200'}`}
                  style={{ height: `${(p.value / top) * 100}%`, minHeight: p.value ? 2 : 0 }}
                />
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="ml-13 mt-2 flex gap-0.5 text-[11px] text-slate-500" aria-hidden>
        {series.map((p, i) => (
          <span key={p.label + i} className="flex min-w-0 flex-1 justify-center overflow-visible whitespace-nowrap">
            {(series.length - 1 - i) % labelEvery === 0 ? p.label : ''}
          </span>
        ))}
      </div>
    </figure>
  )
}

export function ServiceList({ rows, limit, showQty }: { rows: ServiceUsage[]; limit?: number; showQty?: boolean }) {
  const total = sum(rows, (s) => s.revenue_cents)
  if (rows.length === 0) return <div className={card}><EmptyState icon={I.shirt} text="Service sales will appear here once orders are recorded." /></div>
  return (
    <ol className={`${card} divide-y divide-slate-100`}>
      {rows.slice(0, limit).map((s, i) => {
        const tone = TONES[Math.min(i, TONES.length - 1)]!
        const pct = total ? Math.round((s.revenue_cents / total) * 100) : 0
        return (
          <li key={s.service_name + s.pricing_method} className="flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
            <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${tone.icon}`}>
              <Icon className="h-5 w-5">{serviceIcon(s.service_name)}</Icon>
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate font-semibold text-slate-900">{s.service_name}</span>
                <span className="shrink-0 font-bold tabular-nums text-slate-900">{formatPeso(s.revenue_cents)}</span>
              </div>
              <div className="truncate text-xs text-slate-500">
                {showQty && <>{formatNumber(s.quantity)}{s.pricing_method === 'fixed' ? '×' : ` ${unitOf(s)}`} · </>}
                {plural(s.orders, 'order')}
              </div>
              <div className="mt-2 flex items-center gap-3">
                <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${pct}%` }} />
                </div>
                <span className="w-9 text-right text-xs tabular-nums text-slate-500">{pct}%</span>
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export function Insight({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick} className="flex w-full items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-3 text-left transition hover:bg-blue-50 active:bg-blue-50 sm:p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-blue-600 shadow-sm">
        <Icon className="h-5 w-5">{I.bulb}</Icon>
      </span>
      <span className="min-w-0 flex-1 text-sm leading-snug text-slate-700">{children}</span>
      {onClick && <Icon className="h-5 w-5 shrink-0 text-slate-400">{I.chevron}</Icon>}
    </button>
  )
}

/** Orders per status as labelled bars (share of all orders in the period). */
export function StatusBreakdown({ rows }: { rows: { status: OrderStatus; orders: number }[] }) {
  const all = sum(rows, (s) => s.orders)
  if (all === 0) return <div className={card}><EmptyState icon={I.orders} text="Orders received in this period will appear here." /></div>
  return (
    <ul className={`${card} divide-y divide-slate-100`}>
      {rows.map((s) => {
        const pct = Math.round((s.orders / all) * 100)
        return (
          <li key={s.status} className="p-3 sm:p-4">
            <div className="flex items-center gap-2 text-sm">
              <span className={`h-2.5 w-2.5 rounded-full ${STATUS_TONE[s.status]}`} aria-hidden />
              <span className="flex-1 font-semibold text-slate-900">{STATUS_LABEL[s.status]}</span>
              <span className="font-bold tabular-nums text-slate-900">{s.orders}</span>
              <span className="w-10 text-right text-xs tabular-nums text-slate-500">{pct}%</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${STATUS_TONE[s.status]}`} style={{ width: `${pct}%` }} /></div>
          </li>
        )
      })}
    </ul>
  )
}

export const REPORT_FOOTNOTE = 'Order value is the total of orders taken (by order date), paid or not; cancelled orders are excluded. Collected, Cash and GCash are money actually received (by payment date, including balances paid on older orders), minus refunds given.'
export const TURNAROUND_FOOTNOTE = 'Turnaround = average days from received to completed (picked up). Cancelled orders are excluded.'
