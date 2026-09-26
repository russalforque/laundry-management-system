import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AppHeader } from '../components/AppHeader'
import { I, Icon } from '../components/Icons'
import { BackHeader, FilterTabs, primary } from '../components/Manage'
import { NumberInput } from '../components/NumberInput'
import { Sheet } from '../components/Sheet'
import { useAuth } from '../context/AuthContext'
import {
  cashResult, closeStore, getOpenShift, getShiftDetail, listShifts, openStore, shiftTotals,
  type CashResult, type ShiftTotals, type StoreShift,
} from '../db/shifts'
import { formatPeso, formatPesoShort, parsePesoToCents } from '../lib/money'
import { formatNumberInput } from '../lib/number'
import { METHOD_LABEL, STATUS_LABEL } from '../lib/orders'
import { canBluetoothPrint, printShiftReport } from '../lib/printer'

type Detail = NonNullable<Awaited<ReturnType<typeof getShiftDetail>>>

/** Store shift pages use a blue-and-white look: white cards with a light blue edge on a light blue page. */
const card = 'min-w-0 rounded-2xl border border-blue-100 bg-white shadow-sm shadow-blue-900/5'

const RESULT: Record<CashResult, { label: string; cls: string; panel: string; icon: ReactNode; text: (d: string) => string }> = {
  balanced: { label: 'Balanced', cls: 'bg-emerald-50 text-emerald-700', panel: 'border-emerald-200 bg-emerald-50 text-emerald-800', icon: I.check, text: () => 'The drawer matches the expected cash.' },
  over: { label: 'Over', cls: 'bg-amber-50 text-amber-800', panel: 'border-amber-200 bg-amber-50 text-amber-900', icon: I.up, text: (d) => `The drawer has ${d} more than expected.` },
  short: { label: 'Short', cls: 'bg-red-50 text-red-700', panel: 'border-red-200 bg-red-50 text-red-800', icon: I.down, text: (d) => `The drawer is ${d} less than expected.` },
}

/** Sticky bottom action bar; sits above the phone bottom nav and bleeds to the page edges. */
const actionBar = 'sticky bottom-0 z-10 -mx-4 -mb-4 border-t border-blue-100 bg-white/95 px-4 pb-4 pt-3 shadow-[0_-4px_20px_rgba(15,23,42,0.06)] backdrop-blur md:bottom-4 md:mx-0 md:mb-0 md:rounded-2xl md:border md:pb-3'
const sectionTitle = 'mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-blue-700'
const HISTORY_PAGE = 10
const QUICK_FLOATS = [0, 500, 1000, 2000]

const signed = (c: number) => `${c > 0 ? '+' : c < 0 ? '−' : ''}${formatPeso(Math.abs(c))}`
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
const day = (iso: string) => new Date(iso).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
/** "3h 25m" between `iso` and `end` (or `now`). */
function since(iso: string, end?: string | null, now = Date.now()) {
  const m = Math.max(0, Math.round(((end ? new Date(end).getTime() : now) - new Date(iso).getTime()) / 60_000))
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`
}
const centsToInput = (c: number) => formatNumberInput((c / 100).toFixed(2)).replace(/\.00$/, '')

// ---------- shared pieces ----------

/** Balanced / Over / Short with its sign: text and icon, never colour alone. */
function ResultBadge({ diff, big }: { diff: number; big?: boolean }) {
  const r = RESULT[cashResult(diff)]
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full font-semibold ${r.cls} ${big ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs'}`}>
      <Icon className={big ? 'h-4 w-4' : 'h-3.5 w-3.5'}>{r.icon}</Icon>{r.label}{diff !== 0 && <span className="tabular-nums"> {signed(diff)}</span>}
    </span>
  )
}

/** Large drawer-count result: label, signed difference and a plain-language sentence. */
function ResultPanel({ diff }: { diff: number }) {
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

function StatusPill({ open }: { open: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${open ? 'bg-blue-600 text-white' : 'border border-blue-200 bg-white text-slate-600'}`}>
      <span className={`size-2 rounded-full ${open ? 'animate-pulse bg-white motion-reduce:animate-none' : 'bg-slate-400'}`} aria-hidden />
      {open ? 'Open' : 'Closed'}
    </span>
  )
}

const Row = ({ label, value, strong, hint }: { label: ReactNode; value: ReactNode; strong?: boolean; hint?: string }) => (
  <div className={`flex items-baseline justify-between gap-3 py-2.5 ${strong ? 'text-base font-bold text-slate-900' : 'text-sm text-slate-600'}`}>
    <dt>{label}{hint && <span className="block text-xs font-normal text-slate-400">{hint}</span>}</dt>
    <dd className="shrink-0 tabular-nums">{value}</dd>
  </div>
)

/** The cash math, in the order the drawer is counted: start + cash in − cash out = expected. */
function CashSummary({ t }: { t: ShiftTotals }) {
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
function CashEquation({ t }: { t: ShiftTotals }) {
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
function LaterNote({ t }: { t: ShiftTotals }) {
  if (t.collected_later_cents <= 0) return null
  return (
    <p className="flex items-start gap-2 rounded-xl bg-blue-50 px-3 py-2.5 text-sm text-blue-900">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-blue-600">{I.info}</Icon>
      <span>Includes <b className="tabular-nums">{formatPeso(t.collected_later_cents)}</b> in balances paid on older orders.</span>
    </p>
  )
}

function StatTiles({ t }: { t: ShiftTotals }) {
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
    <div className="grid grid-cols-2 gap-2.5">
      {tile(I.phone, 'bg-blue-50 text-blue-600', 'GCash / non-cash', formatPeso(t.noncash_cents), 'Not in the drawer')}
      {tile(I.wallet, 'bg-blue-50 text-blue-600', 'Total payments', formatPeso(t.payments_cents), `${t.payments_count} payment${t.payments_count === 1 ? '' : 's'}${t.refunds_cents ? ` · ${formatPeso(t.refunds_cents)} refunded` : ''}`)}
      {tile(I.orders, 'bg-blue-50 text-blue-600', 'Orders taken', String(t.orders_count), t.cancelled_count ? `${t.cancelled_count} cancelled` : 'This shift')}
      {tile(I.bag, 'bg-blue-50 text-blue-600', 'Completed', String(t.released_count), 'Picked up')}
    </div>
  )
}

function PesoField({ label, value, onChange, autoFocus, hint, quick }: {
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
        <div className="-mx-4 mt-2.5 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
          {quick.map((q) => {
            const active = parsePesoToCents(value) === q.cents && value.trim() !== ''
            return (
              <button
                key={q.label}
                type="button"
                onClick={() => onChange(centsToInput(q.cents))}
                aria-pressed={active}
                className={`min-h-10 shrink-0 whitespace-nowrap rounded-full border px-4 text-sm font-semibold tabular-nums transition-colors ${
                  active ? 'border-blue-600 bg-blue-600 text-white' : 'border-blue-200 bg-white text-blue-700 active:bg-blue-50'
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

function PrintButton({ shiftId, solid }: { shiftId: number; solid?: boolean }) {
  const [state, setState] = useState<{ busy?: boolean; msg?: string; ok?: boolean }>({})
  if (!canBluetoothPrint()) return null
  async function print() {
    setState({ busy: true })
    try { await printShiftReport(shiftId); setState({ ok: true, msg: 'Report printed.' }) } catch (e) { setState({ ok: false, msg: e instanceof Error ? e.message : 'Could not print.' }) }
  }
  return (
    <div className="space-y-2">
      <button type="button" onClick={print} disabled={state.busy} className={solid ? `${primary} min-h-13 w-full text-base` : 'inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white font-semibold text-blue-600 active:bg-blue-50 disabled:opacity-60'}>
        <Icon className="h-5 w-5">{I.printer}</Icon>{state.busy ? 'Printing…' : 'Print shift report'}
      </button>
      {state.msg && <p role="status" className={`text-center text-sm font-medium ${state.ok ? 'text-emerald-700' : 'text-red-600'}`}>{state.msg}</p>}
    </div>
  )
}

function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 px-3.5 py-3 text-sm font-medium text-red-700">
      <Icon className="mt-0.5 h-4 w-4 shrink-0">{I.info}</Icon>{children}
    </p>
  )
}

// ---------- open / close ----------

function OpenStoreCard({ lastClosed, onOpened }: { lastClosed?: StoreShift; onOpened: () => void }) {
  const [cash, setCash] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false) // state updates are async; this blocks a double tap in the same frame
  const lastCount = lastClosed?.actual_cash_cents ?? null
  const quick = [
    ...(lastCount != null && lastCount > 0 ? [{ label: `Last count ${formatPesoShort(lastCount)}`, cents: lastCount }] : []),
    ...QUICK_FLOATS.filter((c) => c * 100 !== lastCount).map((c) => ({ label: formatPesoShort(c * 100), cents: c * 100 })),
  ]

  async function submit(e: FormEvent) {
    e.preventDefault()
    const cents = cash.trim() === '' ? null : parsePesoToCents(cash)
    if (cents === null) return setErr('Enter the cash in the drawer now (0 if empty).')
    if (submitting.current) return
    submitting.current = true
    setBusy(true)
    setErr('')
    try { await openStore(cents); onOpened() } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Could not open the store. Please try again.')
      submitting.current = false
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <section className={`${card} overflow-hidden`}>
        <div className="flex items-center gap-3 p-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-600"><Icon className="h-6 w-6">{I.store}</Icon></span>
          <span className="min-w-0 flex-1">
            <StatusPill open={false} />
            <span className="mt-1 block truncate text-sm text-slate-500">
              {lastClosed?.ended_at ? `Last closed ${day(lastClosed.ended_at)}, ${time(lastClosed.ended_at)}` : 'Open the store to start taking payments.'}
            </span>
          </span>
        </div>
        <div className="space-y-4 border-t border-blue-100/70 p-4">
          <PesoField
            label="Opening cash"
            value={cash}
            onChange={(v) => { setCash(v); setErr('') }}
            hint="Count the starting money in the drawer (for change). It is not counted as sales."
            quick={quick}
          />
          {err && <ErrorNote>{err}</ErrorNote>}
        </div>
      </section>
      <div className={actionBar}>
        <button disabled={busy} className={`${primary} min-h-13 w-full text-base`}>
          <Icon className="h-5 w-5">{I.store}</Icon>{busy ? 'Opening…' : cash.trim() && parsePesoToCents(cash) !== null ? `Open Store with ${formatPeso(parsePesoToCents(cash)!)}` : 'Open Store'}
        </button>
      </div>
    </form>
  )
}

function CloseStore({ shift, totals, onCancel, onClosed }: { shift: StoreShift; totals: ShiftTotals; onCancel: () => void; onClosed: () => void }) {
  const [count, setCount] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const closing = useRef(false) // blocks a double tap closing twice
  const actual = count.trim() === '' ? null : parsePesoToCents(count)
  const diff = actual === null ? null : actual - totals.expected_cash_cents

  function review() {
    if (actual === null) return setErr('Count the cash in the drawer and enter the total.')
    setErr('')
    setReviewing(true)
  }

  async function confirmClose() {
    if (actual === null || closing.current) return
    closing.current = true
    setBusy(true)
    setErr('')
    try { await closeStore(shift.id, actual); onClosed() } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not close the store.')
      closing.current = false
      setBusy(false)
      setReviewing(false)
    }
  }

  return (
    <div className="space-y-4">
      <BackHeader title="Close Store" onBack={onCancel} />

      {/* Step 1: what the drawer should hold */}
      <section className={`${card} p-4`}>
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Step 1 · Expected in drawer</p>
        <p className="mt-1 text-4xl font-bold tracking-tight tabular-nums text-slate-900">{formatPeso(totals.expected_cash_cents)}</p>
        <p className="mt-0.5 text-sm text-slate-500">Open since {time(shift.started_at)} · {since(shift.started_at)}</p>
        <details className="group mt-3 rounded-xl bg-blue-50/70 px-3">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-semibold text-blue-700 [&::-webkit-details-marker]:hidden">
            How this is calculated
            <Icon className="h-5 w-5 text-blue-500 transition-transform group-open:rotate-180">{I.chevronDown}</Icon>
          </summary>
          <div className="pb-1"><CashSummary t={totals} /></div>
        </details>
      </section>

      {/* Step 2: the physical count */}
      <section className={`${card} space-y-3 p-4`}>
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Step 2 · Count the drawer</p>
        <PesoField label="Actual cash counted" value={count} onChange={(v) => { setCount(v); setErr('') }} autoFocus hint="Count every bill and coin in the drawer now." />
        {diff !== null && <ResultPanel diff={diff} />}
        {err && <ErrorNote>{err}</ErrorNote>}
      </section>

      <section>
        <h2 className={sectionTitle}>Shift summary</h2>
        <div className="space-y-2.5">
          <StatTiles t={totals} />
          <LaterNote t={totals} />
        </div>
      </section>

      <div className={actionBar}>
        <button type="button" onClick={review} disabled={busy || actual === null} className="flex min-h-13 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-base font-semibold text-white shadow-sm shadow-blue-600/30 active:bg-blue-700 disabled:opacity-40">
          <Icon className="h-5 w-5">{I.lock}</Icon>{actual === null ? 'Enter the counted cash' : 'Review & Close Store'}
        </button>
      </div>

      {reviewing && actual !== null && diff !== null && (
        <Sheet label="Close the store?" onClose={() => !busy && setReviewing(false)}>
          <div className="space-y-4">
            <dl className="divide-y divide-blue-100/70 rounded-2xl bg-blue-50/70 px-4">
              <Row label="Expected cash" value={formatPeso(totals.expected_cash_cents)} />
              <Row label="Counted cash" value={formatPeso(actual)} strong />
            </dl>
            <ResultPanel diff={diff} />
            <p className="text-sm text-slate-500">Closing saves this shift's totals. Payments can't be taken until the store is opened again.</p>
            <div className="grid gap-2">
              <button type="button" onClick={confirmClose} disabled={busy} className="flex min-h-13 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-base font-semibold text-white shadow-sm shadow-blue-600/30 active:bg-blue-700 disabled:opacity-60">
                <Icon className="h-5 w-5">{I.lock}</Icon>{busy ? 'Closing…' : 'Close Store'}
              </button>
              <button type="button" onClick={() => setReviewing(false)} disabled={busy} className="min-h-12 w-full rounded-xl font-semibold text-blue-700 active:bg-blue-50">
                Keep counting
              </button>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  )
}

// ---------- history & detail ----------

type DetailTab = 'payments' | 'orders' | 'refunds' | 'events'

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** Label + value line inside a report card; `tone` colours the value only, the label always says what it is. */
const Line = ({ label, value, hint, tone = 'text-slate-900' }: { label: string; value: string; hint?: string; tone?: string }) => (
  <div className="flex items-baseline justify-between gap-3 py-2.5">
    <dt className="min-w-0 text-sm text-slate-600">{label}{hint && <span className="block text-xs text-slate-400">{hint}</span>}</dt>
    <dd className={`shrink-0 text-sm font-semibold tabular-nums ${tone}`}>{value}</dd>
  </div>
)

/** Tappable transaction row: icon, who/what on the left, amount with its qualifier on the right. */
function TxRow({ to, icon, iconCls, title, meta, amount, amountCls = 'text-slate-900', sub }: {
  to: string; icon?: ReactNode; iconCls?: string; title: string; meta: ReactNode; amount: string; amountCls?: string; sub?: ReactNode
}) {
  return (
    <li>
      <Link to={to} className="flex min-h-16 items-center gap-3 px-4 py-3 active:bg-blue-50">
        {icon && <span className={`grid size-10 shrink-0 place-items-center rounded-full ${iconCls}`}><Icon className="h-5 w-5">{icon}</Icon></span>}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-slate-900">{title}</span>
          <span className="mt-0.5 block truncate text-xs text-slate-500">{meta}</span>
        </span>
        <span className="shrink-0 text-right">
          <span className={`block font-bold tabular-nums ${amountCls}`}>{amount}</span>
          {sub && <span className="mt-0.5 block text-xs text-slate-500">{sub}</span>}
        </span>
      </Link>
    </li>
  )
}

const listCls = `${card} divide-y divide-blue-100/70 overflow-hidden`

function ShiftDetailView({ id, onBack }: { id: number; onBack: () => void }) {
  const [d, setD] = useState<Detail | null | undefined>(undefined)
  const [tab, setTab] = useState<DetailTab>('payments')
  useEffect(() => { getShiftDetail(id).then(setD).catch(() => setD(null)) }, [id])
  if (d === undefined) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading shift report">
        <BackHeader title="Shift report" onBack={onBack} />
        <div className="h-64 animate-pulse rounded-2xl bg-blue-100/70" />
        <div className="h-44 animate-pulse rounded-2xl bg-blue-100/70" />
        <div className="h-52 animate-pulse rounded-2xl bg-blue-100/70" />
      </div>
    )
  }
  if (d === null) {
    return (
      <div className="space-y-4">
        <BackHeader title="Shift report" onBack={onBack} />
        <div className={`${card} flex flex-col items-center px-6 py-8 text-center`}>
          <span className="grid size-12 place-items-center rounded-full bg-blue-50 text-blue-500"><Icon className="h-6 w-6">{I.report}</Icon></span>
          <p className="mt-3 text-sm font-semibold text-slate-900">Shift report not found</p>
          <p className="mt-1 text-sm text-slate-500">This store shift may have been removed. Go back and pick another shift.</p>
        </div>
      </div>
    )
  }
  const { shift: s, totals: t, payments, orders, events, refunds } = d
  const isOpen = !s.ended_at
  const counted = s.actual_cash_cents != null && s.difference_cents != null
  const canPrint = canBluetoothPrint()
  const tabs: { id: DetailTab; label: string }[] = [
    { id: 'payments', label: `Payments · ${payments.length}` },
    { id: 'orders', label: `Orders · ${orders.length}` },
    ...(refunds.length > 0 ? [{ id: 'refunds' as const, label: `Refunds · ${refunds.length}` }] : []),
    ...(events.length > 0 ? [{ id: 'events' as const, label: `Drawer & voids · ${events.length}` }] : []),
  ]
  const countCell = (label: string, value: number) => (
    <div className="min-w-0 px-2 py-3">
      <p className="text-xl font-bold tabular-nums text-slate-900">{value}</p>
      <p className="truncate text-xs font-medium text-slate-500">{label}</p>
    </div>
  )

  return (
    <div className="space-y-5">
      <BackHeader title="Shift report" onBack={onBack} />

      {/* Summary: when, who, and the drawer outcome, so the answer is on screen without scrolling */}
      <section className={`${card} overflow-hidden`} aria-label="Shift summary">
        <div className="p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-semibold text-slate-500">{day(s.started_at)}</p>
            <StatusPill open={isOpen} />
          </div>
          <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
            {time(s.started_at)} – {s.ended_at ? time(s.ended_at) : 'now'}
            <span className="ml-2 text-sm font-medium text-slate-500">{since(s.started_at, s.ended_at)}</span>
          </p>
          <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-slate-500">
            <Icon className="h-4 w-4 shrink-0">{I.user}</Icon>
            <span className="truncate">Opened by {s.user_name}{s.ended_at && ` · Closed by ${s.closed_by_name ?? '—'}`}</span>
          </p>
        </div>

        <div className="space-y-3 border-t border-blue-100/70 p-4">
          {counted ? (
            <>
              <dl className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-blue-50/70 p-3">
                  <dt className="text-xs font-medium text-slate-500">Expected cash</dt>
                  <dd className="mt-0.5 truncate text-xl font-bold tabular-nums text-slate-900">{formatPeso(t.expected_cash_cents)}</dd>
                </div>
                <div className="rounded-xl bg-blue-50/70 p-3">
                  <dt className="text-xs font-medium text-slate-500">Counted cash</dt>
                  <dd className="mt-0.5 truncate text-xl font-bold tabular-nums text-slate-900">{formatPeso(s.actual_cash_cents!)}</dd>
                </div>
              </dl>
              <ResultPanel diff={s.difference_cents!} />
            </>
          ) : (
            <div>
              <p className="text-sm font-medium text-slate-500">Expected cash in drawer</p>
              <p className="text-3xl font-bold tracking-tight tabular-nums text-slate-900">{formatPeso(t.expected_cash_cents)}</p>
              <p className="mt-1 text-sm text-slate-500">
                {isOpen ? 'Live — updates as payments and refunds are recorded.' : 'The drawer was not counted when this shift closed.'}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Where the expected figure comes from */}
      <section>
        <h2 className={sectionTitle}>Cash drawer</h2>
        <div className={`${card} px-4 py-1`}><CashSummary t={t} /></div>
      </section>

      {/* Money taken and work done */}
      <section>
        <h2 className={sectionTitle}>Payments received</h2>
        <div className={`${card} overflow-hidden`}>
          <div className="p-4 pb-1">
            <p className="text-sm font-medium text-slate-500">Total payments</p>
            <p className="text-2xl font-bold tracking-tight tabular-nums text-slate-900">{formatPeso(t.payments_cents)}</p>
            <p className="text-xs text-slate-500">{plural(t.payments_count, 'payment')}</p>
            <dl className="mt-2 divide-y divide-blue-100/70 border-t border-blue-100/70">
              <Line label="Cash" hint="Goes into the drawer" value={formatPeso(t.cash_cents)} />
              <Line label="GCash / non-cash" hint="Not in the drawer" value={formatPeso(t.noncash_cents)} />
              {t.refunds_cents > 0 && <Line label="Refunded" hint={plural(t.refunds_count, 'refund')} value={`− ${formatPeso(t.refunds_cents)}`} tone="text-red-700" />}
            </dl>
          </div>
          {t.collected_later_cents > 0 && <div className="px-4 pb-3"><LaterNote t={t} /></div>}
          <div className="grid grid-cols-3 divide-x divide-blue-100/70 border-t border-blue-100/70 text-center">
            {countCell('Orders taken', t.orders_count)}
            {countCell('Completed', t.released_count)}
            {countCell('Cancelled', t.cancelled_count)}
          </div>
        </div>
      </section>

      {/* Transactions, one list at a time */}
      <section className="space-y-3">
        <h2 className={sectionTitle}>Transactions</h2>
        <FilterTabs options={tabs} value={tab} onChange={setTab} label="Shift transactions" />

        {tab === 'payments' && (payments.length === 0 ? <EmptyList text="No payments in this shift." /> : (
          <ul className={listCls}>
            {payments.map((p) => (
              <TxRow
                key={p.id}
                to={`/orders/${p.order_id}`}
                icon={p.method === 'cash' ? I.peso : I.phone}
                iconCls={p.method === 'cash' ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-600'}
                title={`#${p.order_number} · ${p.customer_name}`}
                meta={<>
                  {time(p.paid_at)} · {p.user_name}
                  {p.tendered_cents != null && p.tendered_cents > p.amount_cents ? ` · change ${formatPeso(p.tendered_cents - p.amount_cents)}` : ''}
                </>}
                amount={formatPeso(p.amount_cents)}
                sub={<>{METHOD_LABEL[p.method]}{p.collected_later ? <span className="font-semibold text-blue-700"> · Balance payment</span> : null}</>}
              />
            ))}
          </ul>
        ))}

        {tab === 'orders' && (orders.length === 0 ? <EmptyList text="No orders taken in this shift." /> : (
          <ul className={listCls}>
            {orders.map((o) => {
              const due = o.total_cents - o.paid_cents
              const cancelled = o.status === 'cancelled'
              return (
                <TxRow
                  key={o.id}
                  to={`/orders/${o.id}`}
                  title={`#${o.order_number} · ${o.customer_name}`}
                  meta={`${time(o.received_at)} · ${STATUS_LABEL[o.status]}`}
                  amount={formatPeso(o.total_cents)}
                  amountCls={cancelled ? 'text-slate-400 line-through' : 'text-slate-900'}
                  sub={cancelled ? 'Cancelled' : due <= 0 ? 'Paid' : <span className="font-semibold text-amber-700">{formatPeso(due)} due</span>}
                />
              )
            })}
          </ul>
        ))}

        {tab === 'refunds' && (
          <ul className={listCls}>
            {refunds.map((r) => (
              <TxRow
                key={r.id}
                to={`/orders/${r.order_id}`}
                icon={r.method === 'cash' ? I.peso : I.phone}
                iconCls="bg-red-50 text-red-600"
                title={`#${r.order_number} · ${r.customer_name}`}
                meta={`${time(r.refunded_at)} · ${r.user_name}${r.reason ? ` · ${r.reason}` : ''}`}
                amount={`−${formatPeso(r.amount_cents)}`}
                amountCls="text-red-700"
                sub={METHOD_LABEL[r.method]}
              />
            ))}
          </ul>
        )}

        {tab === 'events' && (
          <ul className={listCls}>
            {events.map((e) => (
              <li key={e.id} className="flex min-h-16 items-center gap-3 px-4 py-3">
                <span className={`grid size-10 shrink-0 place-items-center rounded-full ${e.kind === 'order_cancelled' ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-600'}`}>
                  <Icon className="h-5 w-5">{e.kind === 'order_cancelled' ? I.x : I.register}</Icon>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-slate-900">{e.kind === 'order_cancelled' ? `Order #${e.order_number ?? '?'} cancelled` : 'Cash drawer opened by hand'}</span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500">{time(e.at)}{e.user_name ? ` · ${e.user_name}` : ''}{e.detail ? ` · ${e.detail}` : ''}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {canPrint ? <div className={actionBar}><PrintButton shiftId={s.id} solid /></div> : <div className="h-2" />}
    </div>
  )
}

const EmptyList = ({ text }: { text: string }) => <p className={`${card} p-6 text-center text-sm text-slate-500`}>{text}</p>

function History({ rows, onOpen }: { rows: StoreShift[] | null; onOpen: (id: number) => void }) {
  const [shown, setShown] = useState(HISTORY_PAGE)
  return (
    <section>
      <h2 className={sectionTitle}>Shift history</h2>
      {rows === null ? <div className="h-40 animate-pulse rounded-2xl bg-blue-100/70" aria-busy="true" /> : rows.length === 0 ? (
        <div className={`${card} flex flex-col items-center px-6 py-8 text-center`}>
          <span className="grid size-12 place-items-center rounded-full bg-blue-50 text-blue-500"><Icon className="h-6 w-6">{I.calendar}</Icon></span>
          <p className="mt-3 text-sm font-semibold text-slate-900">No store shifts yet</p>
          <p className="mt-1 text-sm text-slate-500">Each day you open and close the store appears here.</p>
        </div>
      ) : (
        <>
          <ul className={`${card} divide-y divide-blue-100/70 overflow-hidden`}>
            {rows.slice(0, shown).map((s) => {
              const d = new Date(s.started_at)
              const counted = s.actual_cash_cents != null && s.difference_cents != null
              return (
                <li key={s.id}>
                  <button type="button" onClick={() => onOpen(s.id)} className="flex min-h-18 w-full items-center gap-3 px-4 py-3 text-left active:bg-blue-50">
                    <span className="grid w-12 shrink-0 place-items-center rounded-xl bg-blue-50 py-1.5 leading-none text-blue-700">
                      <span className="text-[10px] font-semibold uppercase tracking-wide">{d.toLocaleDateString('en-PH', { month: 'short' })}</span>
                      <span className="mt-0.5 text-lg font-bold tabular-nums">{d.getDate()}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-slate-900">
                        {d.toLocaleDateString('en-PH', { weekday: 'long' })}
                        <span className="font-normal text-slate-500"> · {time(s.started_at)}–{s.ended_at ? time(s.ended_at) : 'now'}</span>
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        {s.status === 'active'
                          ? `Opened by ${s.user_name}`
                          : `Expected ${formatPeso(s.expected_cash_cents ?? 0)} · Counted ${counted ? formatPeso(s.actual_cash_cents!) : '—'}`}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      {s.status === 'active' ? <StatusPill open /> : counted ? <ResultBadge diff={s.difference_cents!} /> : <span className="rounded-full border border-blue-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-500">Not counted</span>}
                      <Icon className="h-5 w-5 text-blue-300">{I.chevron}</Icon>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          {rows.length > shown && (
            <button type="button" onClick={() => setShown((n) => n + HISTORY_PAGE)} className="mt-2 min-h-12 w-full rounded-xl text-sm font-semibold text-blue-700 active:bg-blue-50">
              Show older shifts ({rows.length - shown} more)
            </button>
          )}
        </>
      )}
    </section>
  )
}

// ---------- page ----------

/** Store Shift: open the store with the drawer float, watch the day's cash, close with a drawer count. */
export default function Store() {
  const { can } = useAuth()
  const history = can('store.history')
  const [open, setOpen] = useState<StoreShift | null | undefined>(undefined)
  const [totals, setTotals] = useState<ShiftTotals | null>(null)
  const [rows, setRows] = useState<StoreShift[] | null>(null)
  const [view, setView] = useState<{ kind: 'home' } | { kind: 'close' } | { kind: 'detail'; id: number } | { kind: 'closed'; id: number }>({ kind: 'home' })
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(async () => {
    try {
      const s = (await getOpenShift()) ?? null
      setOpen(s)
      setTotals(s ? await shiftTotals(s) : null)
      if (history) setRows(await listShifts())
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the store shift.')
      setOpen(null)
    }
  }, [history])
  useEffect(() => { load() }, [load])
  useEffect(() => { document.querySelector('main')?.scrollTo(0, 0) }, [view])

  // Keep the "open for" time and the drawer figures fresh while the page stays up.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    const onVisible = () => { if (document.visibilityState === 'visible') { setNow(Date.now()); load() } }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible) }
  }, [load])

  if (view.kind === 'detail') return <div className="mx-auto max-w-2xl"><ShiftDetailView id={view.id} onBack={() => setView({ kind: 'home' })} /></div>
  if (view.kind === 'close' && open && totals) {
    return (
      <div className="mx-auto max-w-2xl">
        <CloseStore shift={open} totals={totals} onCancel={() => setView({ kind: 'home' })} onClosed={async () => { const id = open.id; await load(); setView({ kind: 'closed', id }) }} />
      </div>
    )
  }

  const lastClosed = rows?.find((r) => r.status === 'closed')

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-4">
      <div className="md:hidden"><AppHeader /></div>
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Store Shift</h1>
        <p className="mt-0.5 text-sm text-slate-500">Open the store, track the drawer, count it at closing.</p>
      </header>

      {error && <ErrorNote>{error}</ErrorNote>}

      {view.kind === 'closed' && <ClosedResult id={view.id} onDone={() => setView({ kind: 'home' })} />}

      {open === undefined ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading store shift">
          <div className="h-56 animate-pulse rounded-2xl bg-blue-100/70" />
          <div className="grid grid-cols-2 gap-2.5">{[0, 1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-blue-100/70" />)}</div>
        </div>
      ) : open === null ? (
        view.kind !== 'closed' && <OpenStoreCard lastClosed={lastClosed} onOpened={load} />
      ) : totals && (
        <>
          {/* Open shift: status, the live expected drawer, and a way into the transactions */}
          <section className={`${card} overflow-hidden`}>
            <div className="flex items-center justify-between gap-3 px-4 pt-4">
              <StatusPill open />
              <span className="truncate text-xs text-slate-500">Since {time(open.started_at)} · {open.user_name}</span>
            </div>
            <div className="space-y-3 p-4 pt-3">
              <div>
                <p className="text-sm font-medium text-slate-500">Expected cash in drawer</p>
                <p className="text-4xl font-bold tracking-tight tabular-nums text-slate-900">{formatPeso(totals.expected_cash_cents)}</p>
                <p className="mt-0.5 flex items-center gap-1 text-sm text-slate-500">
                  <Icon className="h-4 w-4">{I.clock}</Icon>Open for {since(open.started_at, null, now)}
                </p>
              </div>
              <CashEquation t={totals} />
            </div>
            <button type="button" onClick={() => setView({ kind: 'detail', id: open.id })} className="flex min-h-14 w-full items-center gap-3 border-t border-blue-100/70 px-4 text-left active:bg-blue-50">
              <Icon className="h-5 w-5 text-blue-600">{I.receipt}</Icon>
              <span className="flex-1 font-semibold text-slate-900">View transactions</span>
              <span className="text-sm text-slate-500">{totals.payments_count} paid · {totals.orders_count} orders</span>
              <Icon className="h-5 w-5 text-blue-400">{I.chevron}</Icon>
            </button>
          </section>

          <StatTiles t={totals} />
          <LaterNote t={totals} />

          <div className={actionBar}>
            <button type="button" onClick={async () => { await load(); setView({ kind: 'close' }) }} className="flex min-h-13 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-base font-semibold text-white shadow-sm shadow-blue-600/30 active:bg-blue-700">
              <Icon className="h-5 w-5">{I.lock}</Icon>Close Store
            </button>
          </div>
        </>
      )}

      {history && <History rows={rows} onOpen={(id) => setView({ kind: 'detail', id })} />}
    </div>
  )
}

/** Shown right after closing: the drawer result and a printout. */
function ClosedResult({ id, onDone }: { id: number; onDone: () => void }) {
  const [d, setD] = useState<Detail | null>(null)
  useEffect(() => { getShiftDetail(id).then(setD).catch(() => setD(null)) }, [id])
  return (
    <section className={`${card} space-y-4 p-4 sm:p-5`}>
      <div className="flex items-center gap-3">
        <span className="grid size-12 shrink-0 animate-pop-in place-items-center rounded-2xl bg-blue-600 text-white motion-reduce:animate-none"><Icon className="h-6 w-6">{I.lock}</Icon></span>
        <span className="min-w-0">
          <span className="block text-lg font-bold text-slate-900">Store closed</span>
          {d && <span className="block truncate text-sm text-slate-500">Expected {formatPeso(d.shift.expected_cash_cents ?? 0)} · Counted {formatPeso(d.shift.actual_cash_cents ?? 0)}</span>}
        </span>
      </div>
      {d && <ResultPanel diff={d.shift.difference_cents ?? 0} />}
      <PrintButton shiftId={id} />
      <button type="button" onClick={onDone} className="min-h-12 w-full rounded-xl text-sm font-semibold text-blue-700 active:bg-blue-50">Done</button>
    </section>
  )
}
