import { saveFile } from '../db/backup'
import type { CustomerSpend, DailySales, orderReport, ReportSummary, ServiceUsage } from '../db/reports'
import { STATUS_LABEL } from './orders'
import { tablesPdf, type PdfTable } from './pdf'
import { TYPE_UNIT, typeOf } from './pricing'

/** Report periods, series and CSV / PDF export: the Reports pages' shared, UI-free logic. */

export type ReportRange = '7d' | '30d' | '3m' | 'custom'
/** [id, chip label, "compared with …" wording]. */
export const REPORT_RANGES: [ReportRange, string, string][] = [
  ['7d', '7 days', 'previous 7 days'],
  ['30d', '30 days', 'previous 30 days'],
  ['3m', '3 months', 'previous 3 months'],
  ['custom', 'Custom', 'previous period'],
]
export type ReportView = 'sales' | 'orders' | 'customers' | 'services'

export interface ReportData {
  now: ReportSummary
  prev: ReportSummary
  daily: DailySales[]
  orders: Awaited<ReturnType<typeof orderReport>>
  services: ServiceUsage[]
  customers: CustomerSpend[]
}

const pad = (n: number) => String(n).padStart(2, '0')
export const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const parseYmd = (s: string) => new Date(`${s}T00:00:00`)
export const addDays = (s: string, n: number) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return localDate(d) }
export const dayCount = (from: string, to: string) => Math.round((parseYmd(to).getTime() - parseYmd(from).getTime()) / 86_400_000) + 1
export const shortDate = (s: string) => parseYmd(s).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
export const longDate = (s: string) => parseYmd(s).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
export const sum = <T,>(rows: T[], f: (r: T) => number) => rows.reduce((a, r) => a + f(r), 0)
export const plural = (n: number, w: string) => `${n.toLocaleString('en-PH')} ${w}${n === 1 ? '' : 's'}`

const wholePeso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 })
const compactPeso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', notation: 'compact', maximumFractionDigits: 1 })
/** ₱6,480 on tiles and axes; ₱125.4K once it would crowd a small tile. */
export const shortPeso = (cents: number) => (cents >= 10_000_000 ? compactPeso : wholePeso).format(cents / 100)

export function presetRange(range: Exclude<ReportRange, 'custom'>): [string, string] {
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
export function niceCeil(v: number) {
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
export const seriesOf = (from: string, to: string, values: Map<string, number>) =>
  buckets(from, to).map((b) => ({ ...b, value: sum(b.dates, (d) => values.get(d) ?? 0) }))

export const unitOf = (s: ServiceUsage) => (s.pricing_method === 'fixed' ? '×' : TYPE_UNIT[typeOf(s)].slice(1))

export const REPORT_TITLE: Record<ReportView, string> = {
  sales: 'Sales Report', orders: 'Orders Report', customers: 'Customer Report', services: 'Service Report',
}

const money = (cents: number) => (cents / 100).toFixed(2)
const csv = (rows: (string | number)[][]) =>
  rows.map((r) => r.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(',')).join('\n')

const SECTIONS: Record<ReportView, (d: ReportData) => (string | number)[][]> = {
  sales: (d) => [
    ['Date', 'Orders', 'Order value (order date)', 'Collected net of refunds (payment date)', 'Cash', 'GCash / non-cash', 'Refunds', 'Balance due'],
    ...d.daily.map((r) => [r.date, r.orders, money(r.sales_cents), money(r.collected_cents), money(r.cash_cents), money(r.collected_cents - r.cash_cents), money(r.refunds_cents), money(r.outstanding_cents)]),
  ],
  orders: (d) => [['Status', 'Orders'], ...d.orders.byStatus.map((s) => [STATUS_LABEL[s.status], s.orders]), [], ['Date', 'Orders'], ...d.orders.byDate.map((r) => [r.date, r.orders])],
  services: (d) => [['Service', 'Unit', 'Quantity', 'Orders', 'Order value'], ...d.services.map((s) => [s.service_name, unitOf(s), s.quantity, s.orders, money(s.revenue_cents)])],
  customers: (d) => [['Customer', 'Code', 'Orders', 'Billed', 'Balance due'], ...d.customers.map((c) => [c.full_name, c.customer_code, c.orders, money(c.spent_cents), money(c.outstanding_cents)])],
}

/** One report, or every report one after another, as a CSV the user saves or shares. */
export function exportCsv(d: ReportData, from: string, to: string, view?: ReportView) {
  const rows = view
    ? SECTIONS[view](d)
    : (Object.keys(SECTIONS) as ReportView[]).flatMap((v) => [[REPORT_TITLE[v].toUpperCase()], ...SECTIONS[v](d), []])
  return saveFile(`sellix-${view ?? 'reports'}-${from}_to_${to}.csv`, csv([[`Period: ${from} to ${to}`], [], ...rows]), 'text/csv', 'Save or send report')
}

const PDF_HEADER: Record<string, string> = {
  'Order value (order date)': 'Order value',
  'Collected net of refunds (payment date)': 'Collected',
  'GCash / non-cash': 'GCash/other',
}

/** A section's rows as separate tables: CSV sections separate their tables with an empty row. */
function tablesOf(rows: (string | number)[][]) {
  const out: (string | number)[][][] = [[]]
  for (const r of rows) {
    if (r.length) out[out.length - 1]!.push(r)
    else out.push([])
  }
  return out.filter((t) => t.length)
}

/** One report, or all of them after a period summary, as a printable PDF the user saves or shares. Same figures as the CSV. */
export function exportPdf(d: ReportData, from: string, to: string, view?: ReportView) {
  const views = view ? [view] : (Object.keys(SECTIONS) as ReportView[])
  const turnaround = (s: ReportSummary) => (s.turnaround_days === null ? '-' : s.turnaround_days.toFixed(1))
  const summary: PdfTable[] = view ? [] : [{
    title: 'Summary',
    rows: [
      ['Measure', 'This period', 'Previous period'],
      ['Order value', money(d.now.revenue_cents), money(d.prev.revenue_cents)],
      ['Orders', d.now.orders, d.prev.orders],
      ['Items', d.now.items, d.prev.items],
      ['Turnaround (days)', turnaround(d.now), turnaround(d.prev)],
    ],
  }]
  // The CSV's long column names explain their dates; a printed page needs them short enough to read in full.
  const short = (rows: (string | number)[][]) => [rows[0]!.map((h) => PDF_HEADER[String(h)] ?? h), ...rows.slice(1)]
  const tables = [
    ...summary,
    ...views.flatMap((v) => tablesOf(SECTIONS[v](d)).map((rows, i) => ({ title: i ? '' : REPORT_TITLE[v], rows: short(rows) }))),
  ]
  const title = view ? REPORT_TITLE[view] : 'Business Reports'
  const pdf = tablesPdf(title, `${longDate(from)} to ${longDate(to)}  -  Amounts in PHP`, tables)
  return saveFile(`sellix-${view ?? 'reports'}-${from}_to_${to}.pdf`, pdf, 'application/pdf', 'Save or send report')
}
