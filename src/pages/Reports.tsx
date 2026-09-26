import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AppHeader } from '../components/AppHeader'
import { Avatar } from '../components/Avatar'
import { Chip } from '../components/Chip'
import { DateInput } from '../components/Controls'
import { I, Icon, serviceIcon } from '../components/Icons'
import { fieldCls } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { saveFile } from '../db/backup'
import {
  customerReport, dailySales, orderReport, reportSummary, serviceReport,
  type CustomerSpend, type DailySales, type ReportSummary, type ServiceUsage,
} from '../db/reports'
import { TYPE_UNIT, typeOf } from '../lib/pricing'
import { formatPeso } from '../lib/money'
import { STATUS_LABEL } from '../lib/orders'
import type { OrderStatus } from '../types'

type Range = '7d' | '30d' | '3m' | 'custom'
const RANGES: [Range, string, string][] = [
  ['7d', '7 days', 'previous 7 days'],
  ['30d', '30 days', 'previous 30 days'],
  ['3m', '3 months', 'previous 3 months'],
  ['custom', 'Custom', 'previous period'],
]
type View = 'sales' | 'orders' | 'customers' | 'services'

interface Data {
  now: ReportSummary
  prev: ReportSummary
  daily: DailySales[]
  orders: Awaited<ReturnType<typeof orderReport>>
  services: ServiceUsage[]
  customers: CustomerSpend[]
}

const card = 'min-w-0 rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.05)]'

// ---------- helpers ----------

const pad = (n: number) => String(n).padStart(2, '0')
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parseYmd = (s: string) => new Date(`${s}T00:00:00`)
const addDays = (s: string, n: number) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return localDate(d) }
const dayCount = (from: string, to: string) => Math.round((parseYmd(to).getTime() - parseYmd(from).getTime()) / 86_400_000) + 1
const shortDate = (s: string) => parseYmd(s).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
const longDate = (s: string) => parseYmd(s).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
const sum = <T,>(rows: T[], f: (r: T) => number) => rows.reduce((a, r) => a + f(r), 0)
const plural = (n: number, w: string) => `${n.toLocaleString('en-PH')} ${w}${n === 1 ? '' : 's'}`

const wholePeso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 })
const compactPeso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', notation: 'compact', maximumFractionDigits: 1 })
/** ₱6,480 on tiles and axes; ₱125.4K once it would crowd a small tile. */
const shortPeso = (cents: number) => (cents >= 10_000_000 ? compactPeso : wholePeso).format(cents / 100)

function presetRange(range: Exclude<Range, 'custom'>): [string, string] {
  const to = localDate(new Date())
  if (range === '3m') {
    const d = parseYmd(to)
    d.setMonth(d.getMonth() - 3)
    d.setDate(d.getDate() + 1)
    return [localDate(d), to]
  }
  return [addDays(to, range === '7d' ? -6 : -29), to]
}

/** Rounds up to 1, 2 or 5 × 10ⁿ so axis labels stay readable. */
function niceCeil(v: number) {
  if (v <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  const n = v / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p
}

/** Days for short periods, weeks up to ~6 months, then months — keeps bars tappable. */
function buckets(from: string, to: string) {
  const days: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d)
  if (days.length <= 31) return days.map((d) => ({ label: shortDate(d), dates: [d] }))
  const out: { label: string; dates: string[] }[] = []
  if (days.length <= 186) {
    for (let i = 0; i < days.length; i += 7) out.push({ label: shortDate(days[i]!), dates: days.slice(i, i + 7) })
  } else {
    for (const d of days) {
      const label = parseYmd(d).toLocaleDateString('en-PH', { month: 'short', year: '2-digit' })
      if (out.at(-1)?.label === label) out.at(-1)!.dates.push(d)
      else out.push({ label, dates: [d] })
    }
  }
  return out
}

/** Per-bucket totals for a date → value map. */
const seriesOf = (from: string, to: string, values: Map<string, number>) =>
  buckets(from, to).map((b) => ({ ...b, value: sum(b.dates, (d) => values.get(d) ?? 0) }))

const money = (cents: number) => (cents / 100).toFixed(2)
const csv = (rows: (string | number)[][]) =>
  rows.map((r) => r.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(',')).join('\n')
const unitOf = (s: ServiceUsage) => (s.pricing_method === 'fixed' ? '×' : TYPE_UNIT[typeOf(s)].slice(1))

const SECTIONS: Record<View, (d: Data) => (string | number)[][]> = {
  sales: (d) => [
    ['Date', 'Orders', 'Sales (order date)', 'Collected (payment date)', 'Cash', 'GCash / non-cash', 'Outstanding'],
    ...d.daily.map((r) => [r.date, r.orders, money(r.sales_cents), money(r.collected_cents), money(r.cash_cents), money(r.collected_cents - r.cash_cents), money(r.outstanding_cents)]),
  ],
  orders: (d) => [['Status', 'Orders'], ...d.orders.byStatus.map((s) => [STATUS_LABEL[s.status], s.orders]), [], ['Date', 'Orders'], ...d.orders.byDate.map((r) => [r.date, r.orders])],
  services: (d) => [['Service', 'Unit', 'Quantity', 'Orders', 'Revenue'], ...d.services.map((s) => [s.service_name, unitOf(s), s.quantity, s.orders, money(s.revenue_cents)])],
  customers: (d) => [['Customer', 'Code', 'Orders', 'Spending', 'Balance'], ...d.customers.map((c) => [c.full_name, c.customer_code, c.orders, money(c.spent_cents), money(c.outstanding_cents)])],
}

function exportCsv(d: Data, from: string, to: string, view?: View) {
  const rows = view
    ? SECTIONS[view](d)
    : (Object.keys(SECTIONS) as View[]).flatMap((v) => [[CATEGORIES.find((c) => c.id === v)!.title.toUpperCase()], ...SECTIONS[v](d), []])
  return saveFile(`sellix-${view ?? 'reports'}-${from}_to_${to}.csv`, csv([[`Period: ${from} to ${to}`], [], ...rows]), 'text/csv', 'Save or send report')
}

/** Single-hue ramp for ranked rows: darkest = biggest share. */
const TONES = [
  { icon: 'bg-blue-600 text-white', bar: 'bg-blue-600' },
  { icon: 'bg-blue-100 text-blue-700', bar: 'bg-blue-500' },
  { icon: 'bg-blue-100 text-blue-600', bar: 'bg-blue-400' },
  { icon: 'bg-blue-50 text-blue-500', bar: 'bg-blue-300' },
  { icon: 'bg-slate-100 text-slate-500', bar: 'bg-slate-400' },
]

const STATUS_TONE: Record<OrderStatus, string> = {
  received: 'bg-slate-400', washing: 'bg-blue-300', drying: 'bg-blue-400',
  ready: 'bg-blue-600', released: 'bg-emerald-500', cancelled: 'bg-red-400',
}

const CATEGORIES: { id: View; title: string; tab: string; text: string; icon: ReactNode }[] = [
  { id: 'sales', title: 'Sales Report', tab: 'Sales', text: 'Sales, collections and balances by day', icon: I.chart },
  { id: 'orders', title: 'Orders Report', tab: 'Orders', text: 'Order volume and status', icon: I.report },
  { id: 'customers', title: 'Customer Report', tab: 'Customers', text: 'Top customers and unpaid balances', icon: I.user },
  { id: 'services', title: 'Service Report', tab: 'Services', text: 'Most used services and their revenue', icon: I.shirt },
]

// ---------- building blocks ----------

function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      {action}
    </div>
  )
}

function EmptyState({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-400">
        <Icon className="h-6 w-6">{icon}</Icon>
      </span>
      <p className="mt-3 text-sm font-semibold text-slate-900">No data for this period</p>
      <p className="mt-1 max-w-xs text-sm text-slate-500">{text}</p>
    </div>
  )
}

/**
 * Change vs the previous period as a signed pill: arrow + text carry direction, colour says good/bad
 * (so it never relies on colour alone). `lowerIsBetter` flips the colour (e.g. turnaround time).
 */
function Trend({ now, prev, lowerIsBetter }: { now: number | null; prev: number | null; lowerIsBetter?: boolean }) {
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
function Sparkline({ values }: { values: number[] }) {
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
function HeroFigure({ label, value, trend, note, spark }: { label: string; value: string; trend?: ReactNode; note: string; spark?: number[] }) {
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
function MiniStat({ label, value, trend }: { label: string; value: string; trend: ReactNode }) {
  return (
    <div className={`${card} flex min-w-0 flex-col p-3`}>
      <span className="text-xs font-medium leading-tight text-slate-500">{label}</span>
      <span className="mt-1 truncate text-lg font-bold tabular-nums text-slate-900">{value}</span>
      <span className="mt-1">{trend}</span>
    </div>
  )
}

function BarChart({ from, to, values, format, unit, label }: {
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

function ServiceList({ rows, limit, showQty }: { rows: ServiceUsage[]; limit?: number; showQty?: boolean }) {
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
                {showQty && <>{s.quantity}{s.pricing_method === 'fixed' ? '×' : ` ${unitOf(s)}`} · </>}
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

function Insight({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick} className="flex w-full items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-3 text-left transition active:bg-blue-50 sm:p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-blue-600 shadow-sm">
        <Icon className="h-5 w-5">{I.bulb}</Icon>
      </span>
      <span className="min-w-0 flex-1 text-sm leading-snug text-slate-700">{children}</span>
      {onClick && <Icon className="h-5 w-5 shrink-0 text-slate-400">{I.chevron}</Icon>}
    </button>
  )
}

/**
 * Table on tablets; on phones each row becomes a card line (first column as the title, the rest as
 * label/value pairs), so nothing scrolls sideways. `foot` is the totals row.
 */
function DataTable({ head, rows, foot }: { head: string[]; rows: ReactNode[][]; foot?: ReactNode[] }) {
  if (rows.length === 0) return <div className={`${card} p-6 text-center text-sm text-slate-500`}>No data for this period.</div>
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
    <>
      <ul className={`${card} divide-y divide-slate-100 overflow-hidden md:hidden`}>
        {rows.map((r, i) => <li key={i}>{mobileRow(r)}</li>)}
        {foot && <li>{mobileRow(foot, true)}</li>}
      </ul>
      <div className={`${card} hidden overflow-x-auto md:block`}>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
            <tr className="border-b border-slate-100">{head.map((h, i) => <th key={h} className={`whitespace-nowrap px-4 py-3 font-semibold ${i ? 'text-right' : ''}`}>{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {rows.map((r, i) => (
              <tr key={i}>{r.map((c, j) => <td key={j} className={`whitespace-nowrap px-4 py-3 ${j ? 'text-right tabular-nums' : 'font-medium text-slate-900'}`}>{c}</td>)}</tr>
            ))}
          </tbody>
          {foot && (
            <tfoot className="border-t border-slate-200 bg-slate-50 font-bold text-slate-900">
              <tr>{foot.map((c, j) => <td key={j} className={`whitespace-nowrap px-4 py-3 ${j ? 'text-right tabular-nums' : ''}`}>{c}</td>)}</tr>
            </tfoot>
          )}
        </table>
      </div>
    </>
  )
}

/** One period control for both screens: preset chips, custom dates, and the period spelled out once. */
function PeriodPicker({ range, onRange, from, to, valid, vs, setFrom, setTo }: {
  range: Range; onRange: (r: Range) => void; from: string; to: string; valid: boolean; vs: string; setFrom: (v: string) => void; setTo: (v: string) => void
}) {
  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="Report period" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none md:mx-0 md:px-0">
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

function ReportDetail({ view, data, from, to, vs, onView }: { view: View; data: Data; from: string; to: string; vs: string; onView: (v: View) => void }) {
  const { now, prev, daily, orders, services, customers } = data
  const note = `vs ${vs}`

  if (view === 'sales') {
    const top = services[0]
    const totalSvc = sum(services, (s) => s.revenue_cents)
    const collected = sum(daily, (d) => d.collected_cents)
    const cash = sum(daily, (d) => d.cash_cents)
    const outstanding = sum(daily, (d) => d.outstanding_cents)
    return (
      <>
        <HeroFigure label="Total sales" value={formatPeso(now.revenue_cents)} trend={<Trend now={now.revenue_cents} prev={prev.revenue_cents} />} note={note} />
        <div className="grid grid-cols-2 gap-2">
          <MiniStat label="Collected" value={shortPeso(collected)} trend={<span className="block text-xs text-slate-500">Cash {shortPeso(cash)} · GCash/other {shortPeso(collected - cash)}</span>} />
          <MiniStat label="Unpaid" value={shortPeso(outstanding)} trend={<span className={`text-xs ${outstanding ? 'font-semibold text-amber-700' : 'text-slate-500'}`}>{outstanding ? 'Still to collect' : 'All paid'}</span>} />
        </div>
        <section>
          <SectionHeader title="Sales over time" />
          <BarChart label="Sales over time" from={from} to={to} values={new Map(daily.map((d) => [d.date, d.sales_cents]))} format={shortPeso} unit={formatPeso} />
        </section>
        {top && totalSvc > 0 && (
          <Insight onClick={() => onView('services')}>
            <b className="font-semibold text-slate-900">{top.service_name}</b> is your top service: {Math.round((top.revenue_cents / totalSvc) * 100)}% of sales this period.
          </Insight>
        )}
        <section>
          <SectionHeader
            title="Sales by service"
            action={services.length > 5 && <button onClick={() => onView('services')} className="-mr-2 min-h-11 rounded-lg px-2 text-sm font-semibold text-blue-600 active:bg-blue-50">See all {services.length}</button>}
          />
          <ServiceList rows={services} limit={5} />
        </section>
        <section>
          <SectionHeader title="Daily breakdown" />
          <DataTable
            head={['Date', 'Orders', 'Sales', 'Collected', 'Unpaid']}
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
          {all === 0 ? <div className={card}><EmptyState icon={I.orders} text="Orders received in this period will appear here." /></div> : (
            <ul className={`${card} divide-y divide-slate-100`}>
              {orders.byStatus.map((s) => {
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
          )}
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
        <HeroFigure label="Service revenue" value={formatPeso(sum(services, (s) => s.revenue_cents))} note={`${plural(services.length, 'service')} used this period`} />
        <section>
          <SectionHeader title="All services · by revenue" />
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
      <HeroFigure label="Customers served" value={customers.length.toLocaleString('en-PH')} note={`${formatPeso(spent)} total spending`} />
      {due > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-100 bg-amber-50 p-3 text-sm text-amber-800">
          <Icon className="h-5 w-5 shrink-0">{I.info}</Icon>
          <span><b className="font-semibold">{formatPeso(due)}</b> unpaid across {plural(owing, 'customer')}.</span>
        </div>
      )}
      <section>
        <SectionHeader title="Top customers · by spending" />
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

export default function Reports() {
  const { can } = useAuth()
  const [range, setRange] = useState<Range>('7d')
  const [custom, setCustom] = useState(() => presetRange('7d'))
  const [view, setView] = useState<View | null>(null)
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [attempt, setAttempt] = useState(0)

  const [from, to] = range === 'custom' ? custom : presetRange(range)
  const valid = !!from && !!to && from <= to
  const vs = RANGES.find((r) => r[0] === range)![2]

  useEffect(() => {
    if (!valid) return
    let live = true
    const len = dayCount(from, to)
    const prevTo = addDays(from, -1)
    Promise.all([
      reportSummary(from, to), reportSummary(addDays(prevTo, 1 - len), prevTo),
      dailySales(from, to), orderReport(from, to), serviceReport(from, to), customerReport(from, to),
    ])
      .then(([now, prev, daily, orders, services, customers]) => { if (live) { setData({ now, prev, daily, orders, services, customers }); setError(false) } })
      .catch((e) => { console.error('Reports load failed', e); if (live) setError(true) })
    return () => { live = false }
  }, [from, to, valid, attempt])

  // <main> is the shared scroll container; open each report at the top.
  useEffect(() => { document.querySelector('main')?.scrollTo(0, 0) }, [view])

  const pickRange = (r: Range) => {
    if (r === 'custom' && range !== 'custom') setCustom([from, to])
    setRange(r)
  }
  const setFrom = (v: string) => setCustom([v, to])
  const setTo = (v: string) => setCustom([from, v])

  async function handleExport() {
    if (!data) return
    setExporting(true)
    try { await exportCsv(data, from, to, view ?? undefined) } catch (e) { console.error('Export failed', e) } finally { setExporting(false) }
  }

  const exportBtn = (
    <button
      type="button"
      onClick={handleExport}
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
    : error && !data
      ? (
        <div className={`${card} flex flex-col items-center p-6 text-center`}>
          <p className="font-semibold text-slate-900">Couldn't load reports</p>
          <p className="mt-1 text-sm text-slate-500">Check the app and try again.</p>
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl px-5 font-semibold text-blue-700 active:bg-blue-50">
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
        <p className="px-1 text-xs text-slate-400">Cancelled orders are excluded from sales, service and customer figures. Sales use the order date. Collected, Cash and GCash use the payment date, including balances paid on older orders.</p>
      </div>
    )
  }

  const d = data
  const salesSpark = d ? seriesOf(from, to, new Map(d.daily.map((r) => [r.date, r.sales_cents]))).map((p) => p.value) : []
  // What each report leads with, shown on its row so the overview answers questions without a tap.
  const preview: Record<View, string> = d ? {
    sales: shortPeso(d.now.revenue_cents),
    orders: d.now.orders.toLocaleString('en-PH'),
    customers: d.customers.length.toLocaleString('en-PH'),
    services: d.services[0]?.service_name ?? '—',
  } : { sales: '', orders: '', customers: '', services: '' }

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-4">
      <div className="md:hidden"><AppHeader /></div>

      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Reports</h1>
          <p className="mt-1 text-sm text-slate-500">How the business is doing.</p>
        </div>
        {exportBtn}
      </div>

      {period}

      {body ?? (d && valid && (
        <>
          <HeroFigure
            label="Revenue"
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
      <p className="px-1 text-xs text-slate-400">Turnaround = average days from received to released. Cancelled orders are excluded.</p>
    </div>
  )
}
