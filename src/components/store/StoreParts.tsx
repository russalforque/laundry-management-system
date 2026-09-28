import { useState, type ReactNode } from 'react'
import { I, Icon } from '../Icons'
import { primary } from '../Manage'
import { NumberInput } from '../NumberInput'
import { cashResult, type CashResult, type ShiftTotals } from '../../db/shifts'
import { formatPeso, parsePesoToCents } from '../../lib/money'
import { formatNumberInput } from '../../lib/number'
import { canBluetoothPrint, printShiftReport } from '../../lib/printer'

/**
 * Store Shift pieces shared by the phone and tablet / desktop Store Shift pages (hooks/useStoreShiftPage.ts).
 * Store shift pages use a blue-and-white look: white cards with a light blue edge on a light blue page.
 */

export const card = 'min-w-0 rounded-2xl border border-blue-100 bg-white shadow-sm shadow-blue-900/5'
export const sectionTitle = 'mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-blue-700'

const RESULT: Record<CashResult, { label: string; cls: string; panel: string; icon: ReactNode; text: (d: string) => string }> = {
  balanced: { label: 'Balanced', cls: 'bg-emerald-50 text-emerald-700', panel: 'border-emerald-200 bg-emerald-50 text-emerald-800', icon: I.check, text: () => 'The drawer matches the expected cash.' },
  over: { label: 'Over', cls: 'bg-amber-50 text-amber-800', panel: 'border-amber-200 bg-amber-50 text-amber-900', icon: I.up, text: (d) => `The drawer has ${d} more than expected.` },
  short: { label: 'Short', cls: 'bg-red-50 text-red-700', panel: 'border-red-200 bg-red-50 text-red-800', icon: I.down, text: (d) => `The drawer is ${d} less than expected.` },
}

export const signed = (c: number) => `${c > 0 ? '+' : c < 0 ? '−' : ''}${formatPeso(Math.abs(c))}`
export const time = (iso: string) => new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
export const day = (iso: string) => new Date(iso).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
/** "3h 25m" between `iso` and `end` (or `now`). */
export function since(iso: string, end?: string | null, now = Date.now()) {
  const m = Math.max(0, Math.round(((end ? new Date(end).getTime() : now) - new Date(iso).getTime()) / 60_000))
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`
}
export const centsToInput = (c: number) => formatNumberInput((c / 100).toFixed(2)).replace(/\.00$/, '')
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** Balanced / Over / Short with its sign: text and icon, never colour alone. */
export function ResultBadge({ diff, big }: { diff: number; big?: boolean }) {
  const r = RESULT[cashResult(diff)]
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full font-semibold ${r.cls} ${big ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs'}`}>
      <Icon className={big ? 'h-4 w-4' : 'h-3.5 w-3.5'}>{r.icon}</Icon>{r.label}{diff !== 0 && <span className="tabular-nums"> {signed(diff)}</span>}
    </span>
  )
}

/** Large drawer-count result: label, signed difference and a plain-language sentence. */
export function ResultPanel({ diff }: { diff: number }) {
  const r = RESULT[cashResult(diff)]
  return (
    <div className={`flex items-center gap-3 rounded-2xl border p-3.5 ${r.panel}`} aria-live="polite">
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white/70"><Icon className="h-6 w-6">{r.icon}</Icon></span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-base font-bold">{r.label}</span>
          <span className="text-xl font-bold tabular-nums">{diff === 0 ? formatPeso(0) : signed(diff)}</span>
        </span>
        <span className="block text-sm opacity-90">{r.text(formatPeso(Math.abs(diff)))}</span>
      </span>
    </div>
  )
}

export function StatusPill({ open }: { open: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${open ? 'bg-blue-600 text-white' : 'border border-blue-200 bg-white text-slate-600'}`}>
      <span className={`size-2 rounded-full ${open ? 'animate-pulse bg-white motion-reduce:animate-none' : 'bg-slate-400'}`} aria-hidden />
      {open ? 'Open' : 'Closed'}
    </span>
  )
}

export const Row = ({ label, value, strong, hint }: { label: ReactNode; value: ReactNode; strong?: boolean; hint?: string }) => (
  <div className={`flex items-baseline justify-between gap-3 py-2.5 ${strong ? 'text-base font-bold text-slate-900' : 'text-sm text-slate-600'}`}>
    <dt>{label}{hint && <span className="block text-xs font-normal text-slate-400">{hint}</span>}</dt>
    <dd className="shrink-0 tabular-nums">{value}</dd>
  </div>
)

/** Label + value line inside a report card; `tone` colours the value only, the label always says what it is. */
export const Line = ({ label, value, hint, tone = 'text-slate-900' }: { label: string; value: string; hint?: string; tone?: string }) => (
  <div className="flex items-baseline justify-between gap-3 py-2.5">
    <dt className="min-w-0 text-sm text-slate-600">{label}{hint && <span className="block text-xs text-slate-400">{hint}</span>}</dt>
    <dd className={`shrink-0 text-sm font-semibold tabular-nums ${tone}`}>{value}</dd>
  </div>
)

/** The cash math, in the order the drawer is counted: start + cash in − cash out = expected. */
export function CashSummary({ t }: { t: ShiftTotals }) {
  return (
    <dl className="divide-y divide-blue-100/70">
      <Row label="Opening cash" value={formatPeso(t.opening_cents)} hint="Starting drawer money, not sales" />
      <Row label="Cash payments" value={`+ ${formatPeso(t.cash_cents)}`} hint="Change given back is not included" />
      <Row label="Cash refunds" value={`− ${formatPeso(t.outflow_cents)}`} hint="Cash given back on cancelled orders" />
      <Row label="Expected cash in drawer" value={formatPeso(t.expected_cash_cents)} strong />
    </dl>
  )
}

/** Compact "opening + cash in − out" strip under a big expected-cash figure. */
export function CashEquation({ t }: { t: ShiftTotals }) {
  const cell = (label: string, value: string) => (
    <div className="min-w-0 px-2 py-2.5">
      <p className="truncate text-[11px] font-medium uppercase tracking-wide text-blue-700">{label}</p>
      <p className="truncate text-sm font-bold tabular-nums text-slate-900">{value}</p>
    </div>
  )
  return (
    <div className="grid grid-cols-3 divide-x divide-blue-100 rounded-xl bg-blue-50/70 text-center">
      {cell('Opening', formatPeso(t.opening_cents))}
      {cell('Cash in', `+${formatPeso(t.cash_cents)}`)}
      {cell('Cash out', `−${formatPeso(t.outflow_cents)}`)}
    </div>
  )
}

/** How much of this shift's money settles orders taken earlier (Pay Later / partial balances). */
export function LaterNote({ t }: { t: ShiftTotals }) {
  if (t.collected_later_cents <= 0) return null
  return (
    <p className="flex items-start gap-2 rounded-xl bg-blue-50 px-3 py-2.5 text-sm text-blue-900">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-blue-600">{I.info}</Icon>
      <span>Includes <b className="tabular-nums">{formatPeso(t.collected_later_cents)}</b> in balances paid on older orders.</span>
    </p>
  )
}

export function StatTiles({ t, className = 'grid grid-cols-2 gap-2.5' }: { t: ShiftTotals; className?: string }) {
  const tile = (icon: ReactNode, tint: string, label: string, value: string, hint: string) => (
    <div className={`${card} flex items-start gap-3 p-3`}>
      <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${tint}`}><Icon className="h-5 w-5">{icon}</Icon></span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium text-slate-500">{label}</span>
        <span className="block truncate text-lg font-bold leading-tight tabular-nums text-slate-900">{value}</span>
        <span className="block truncate text-xs text-slate-500">{hint}</span>
      </span>
    </div>
  )
  return (
    <div className={className}>
      {tile(I.phone, 'bg-blue-50 text-blue-600', 'GCash / non-cash', formatPeso(t.noncash_cents), 'Not in the drawer')}
      {tile(I.wallet, 'bg-blue-50 text-blue-600', 'Total payments', formatPeso(t.payments_cents), `${t.payments_count} payment${t.payments_count === 1 ? '' : 's'}${t.refunds_cents ? ` · ${formatPeso(t.refunds_cents)} refunded` : ''}`)}
      {tile(I.orders, 'bg-blue-50 text-blue-600', 'Orders taken', String(t.orders_count), t.cancelled_count ? `${t.cancelled_count} cancelled` : 'This shift')}
      {tile(I.bag, 'bg-blue-50 text-blue-600', 'Completed', String(t.released_count), 'Picked up')}
    </div>
  )
}

export function PesoField({ label, value, onChange, autoFocus, hint, quick }: {
  label: string; value: string; onChange: (v: string) => void; autoFocus?: boolean; hint?: string
  quick?: { label: string; cents: number }[]
}) {
  const invalid = value.trim() !== '' && parsePesoToCents(value) === null
  return (
    <div>
      <label className="block text-sm font-semibold text-slate-800">
        {label}
        <span className="relative mt-1.5 block">
          <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-xl font-semibold text-slate-400">₱</span>
          <NumberInput
            enterKeyHint="done"
            placeholder="0.00"
            autoFocus={autoFocus}
            value={value}
            aria-invalid={invalid}
            onChange={onChange}
            onFocus={(e) => e.currentTarget.scrollIntoView({ block: 'center', behavior: 'smooth' })}
            className={`h-16 w-full rounded-2xl border-[1.5px] bg-white pl-11 pr-4 text-3xl font-bold tabular-nums text-slate-900 outline-none placeholder:text-slate-300 focus:ring-4 ${
              invalid ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : 'border-blue-200 focus:border-blue-600 focus:ring-blue-100'
            }`}
          />
        </span>
      </label>
      {quick && quick.length > 0 && (
        <div className="-mx-4 mt-2.5 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
          {quick.map((q) => {
            const active = parsePesoToCents(value) === q.cents && value.trim() !== ''
            return (
              <button
                key={q.label}
                type="button"
                onClick={() => onChange(centsToInput(q.cents))}
                aria-pressed={active}
                className={`min-h-10 shrink-0 whitespace-nowrap rounded-full border px-4 text-sm font-semibold tabular-nums transition-colors ${
                  active ? 'border-blue-600 bg-blue-600 text-white' : 'border-blue-200 bg-white text-blue-700 hover:bg-blue-50 active:bg-blue-50'
                }`}
              >
                {q.label}
              </button>
            )
          })}
        </div>
      )}
      {invalid
        ? <p className="mt-1.5 text-sm font-medium text-red-600">Enter a valid amount, like 4650 or 4650.50.</p>
        : hint && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

/** Prints the shift report on the Bluetooth receipt printer; renders nothing where that isn't available. */
export function PrintButton({ shiftId, solid, className }: { shiftId: number; solid?: boolean; className?: string }) {
  const [state, setState] = useState<{ busy?: boolean; msg?: string; ok?: boolean }>({})
  if (!canBluetoothPrint()) return null
  async function print() {
    setState({ busy: true })
    try { await printShiftReport(shiftId); setState({ ok: true, msg: 'Report printed.' }) } catch (e) { setState({ ok: false, msg: e instanceof Error ? e.message : 'Could not print.' }) }
  }
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={print}
        disabled={state.busy}
        className={className ?? (solid ? `${primary} min-h-13 w-full text-base` : 'inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white font-semibold text-blue-600 hover:bg-blue-50 active:bg-blue-50 disabled:opacity-60')}
      >
        <Icon className="h-5 w-5">{I.printer}</Icon>{state.busy ? 'Printing…' : 'Print shift report'}
      </button>
      {state.msg && <p role="status" className={`text-center text-sm font-medium ${state.ok ? 'text-emerald-700' : 'text-red-600'}`}>{state.msg}</p>}
    </div>
  )
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 px-3.5 py-3 text-sm font-medium text-red-700">
      <Icon className="mt-0.5 h-4 w-4 shrink-0">{I.info}</Icon>{children}
    </p>
  )
}

export const EmptyList = ({ text }: { text: string }) => <p className={`${card} p-6 text-center text-sm text-slate-500`}>{text}</p>
