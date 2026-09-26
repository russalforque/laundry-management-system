import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AppHeader } from '../components/AppHeader'
import { I, Icon } from '../components/Icons'
import { BackHeader, card, FilterTabs, primary } from '../components/Manage'
import { Sheet } from '../components/Sheet'
import { useAuth } from '../context/AuthContext'
import {
  cashResult, closeStore, getOpenShift, getShiftDetail, listShifts, openStore, shiftTotals,
  type CashResult, type ShiftTotals, type StoreShift,
} from '../db/shifts'
import { formatPeso, formatPesoShort, parsePesoToCents } from '../lib/money'
import { METHOD_LABEL, STATUS_LABEL } from '../lib/orders'
import { canBluetoothPrint, printShiftReport } from '../lib/printer'

type Detail = NonNullable<Awaited<ReturnType<typeof getShiftDetail>>>

const RESULT: Record<CashResult, { label: string; cls: string; panel: string; icon: ReactNode; text: (d: string) => string }> = {
  balanced: { label: 'Balanced', cls: 'bg-emerald-50 text-emerald-700', panel: 'border-emerald-200 bg-emerald-50 text-emerald-800', icon: I.check, text: () => 'The drawer matches the expected cash.' },
  over: { label: 'Over', cls: 'bg-amber-50 text-amber-800', panel: 'border-amber-200 bg-amber-50 text-amber-900', icon: I.up, text: (d) => `The drawer has ${d} more than expected.` },
  short: { label: 'Short', cls: 'bg-red-50 text-red-700', panel: 'border-red-200 bg-red-50 text-red-800', icon: I.down, text: (d) => `The drawer is ${d} less than expected.` },
}

/** Sticky bottom action bar; sits above the phone bottom nav and bleeds to the page edges. */
const actionBar = 'sticky bottom-0 z-10 -mx-4 -mb-4 border-t border-slate-200/70 bg-white/95 px-4 pb-4 pt-3 shadow-[0_-4px_20px_rgba(15,23,42,0.06)] backdrop-blur md:bottom-4 md:mx-0 md:mb-0 md:rounded-2xl md:border md:pb-3'
const sectionTitle = 'mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500'
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
const centsToInput = (c: number) => (c / 100).toFixed(2).replace(/\.00$/, '')

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
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${open ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
      <span className={`size-2 rounded-full ${open ? 'animate-pulse bg-emerald-500 motion-reduce:animate-none' : 'bg-slate-400'}`} aria-hidden />
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
    <dl className="divide-y divide-slate-100">
      <Row label="Opening cash" value={formatPeso(t.opening_cents)} hint="Starting drawer money, not sales" />
      <Row label="Cash received" value={`+ ${formatPeso(t.cash_cents)}`} hint="Change given back is not included" />
      <Row label="Cash refunds" value={`− ${formatPeso(t.outflow_cents)}`} hint="Cash given back on cancelled orders" />
      <Row label="Expected cash in drawer" value={formatPeso(t.expected_cash_cents)} strong />
    </dl>
  )
}

/** Compact "opening + cash in − out" strip under a big expected-cash figure. */
function CashEquation({ t }: { t: ShiftTotals }) {
  const cell = (label: string, value: string) => (
    <div className="min-w-0 px-2 py-2.5">
      <p className="truncate text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="truncate text-sm font-bold tabular-nums text-slate-900">{value}</p>
    </div>
  )
  return (
    <div className="grid grid-cols-3 divide-x divide-slate-200 rounded-xl bg-slate-50 text-center">
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
      {tile(I.wallet, 'bg-violet-50 text-violet-600', 'Total payments', formatPeso(t.payments_cents), `${t.payments_count} payment${t.payments_count === 1 ? '' : 's'}`)}
      {tile(I.orders, 'bg-amber-50 text-amber-600', 'Orders taken', String(t.orders_count), t.cancelled_count ? `${t.cancelled_count} cancelled` : 'This shift')}
      {tile(I.bag, 'bg-emerald-50 text-emerald-600', 'Released', String(t.released_count), 'Picked up')}
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
          <input
            inputMode="decimal"
            enterKeyHint="done"
            placeholder="0.00"
            autoComplete="off"
            autoFocus={autoFocus}
            value={value}
            aria-invalid={invalid}
            onChange={(e) => onChange(e.target.value)}
            onFocus={(e) => e.currentTarget.scrollIntoView({ block: 'center', behavior: 'smooth' })}
            className={`h-16 w-full rounded-2xl border-[1.5px] bg-white pl-11 pr-4 text-3xl font-bold tabular-nums text-slate-900 outline-none placeholder:text-slate-300 focus:ring-4 ${
              invalid ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : 'border-slate-200 focus:border-blue-600 focus:ring-blue-100'
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
                  active ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-700 active:bg-slate-100'
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

function PrintButton({ shiftId }: { shiftId: number }) {
  const [state, setState] = useState<{ busy?: boolean; msg?: string; ok?: boolean }>({})
  if (!canBluetoothPrint()) return null
  async function print() {
    setState({ busy: true })
    try { await printShiftReport(shiftId); setState({ ok: true, msg: 'Report printed.' }) } catch (e) { setState({ ok: false, msg: e instanceof Error ? e.message : 'Could not print.' }) }
  }
  return (
    <div className="space-y-2">
      <button type="button" onClick={print} disabled={state.busy} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white font-semibold text-blue-600 active:bg-blue-50 disabled:opacity-60">
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
      setErr(e2 instanceof Error ? e2.message : 'Could not open the store.')
      submitting.current = false
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <section className={`${card} overflow-hidden`}>
        <div className="flex items-center gap-3 p-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-500"><Icon className="h-6 w-6">{I.store}</Icon></span>
          <span className="min-w-0 flex-1">
            <StatusPill open={false} />
            <span className="mt-1 block truncate text-sm text-slate-500">
              {lastClosed?.ended_at ? `Last closed ${day(lastClosed.ended_at)}, ${time(lastClosed.ended_at)}` : 'Orders are not tied to a shift until you open.'}
            </span>
          </span>
        </div>
        <div className="space-y-4 border-t border-slate-100 p-4">
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
          <Icon className="h-5 w-5">{I.store}</Icon>{busy ? 'Opening…' : cash.trim() && parsePesoToCents(cash) !== null ? `Open store with ${formatPeso(parsePesoToCents(cash)!)}` : 'Open store'}
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
      <BackHeader title="Close store" onBack={onCancel} />

      {/* Step 1: what the drawer should hold */}
      <section className={`${card} p-4`}>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step 1 · Expected in drawer</p>
        <p className="mt-1 text-4xl font-bold tracking-tight tabular-nums text-slate-900">{formatPeso(totals.expected_cash_cents)}</p>
        <p className="mt-0.5 text-sm text-slate-500">Open since {time(shift.started_at)} · {since(shift.started_at)}</p>
        <details className="group mt-3 rounded-xl bg-slate-50 px-3">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-semibold text-slate-700 [&::-webkit-details-marker]:hidden">
            How this is calculated
            <Icon className="h-5 w-5 text-slate-400 transition-transform group-open:rotate-180">{I.chevronDown}</Icon>
          </summary>
          <div className="pb-1"><CashSummary t={totals} /></div>
        </details>
      </section>

      {/* Step 2: the physical count */}
      <section className={`${card} space-y-3 p-4`}>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step 2 · Count the drawer</p>
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
        <button type="button" onClick={review} disabled={busy || actual === null} className="flex min-h-13 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-base font-semibold text-white active:bg-slate-800 disabled:opacity-40">
          <Icon className="h-5 w-5">{I.lock}</Icon>{actual === null ? 'Enter the counted cash' : 'Review & close store'}
        </button>
      </div>

      {reviewing && actual !== null && diff !== null && (
        <Sheet label="Close the store?" onClose={() => !busy && setReviewing(false)}>
          <div className="space-y-4">
            <dl className="divide-y divide-slate-100 rounded-2xl bg-slate-50 px-4">
              <Row label="Expected cash" value={formatPeso(totals.expected_cash_cents)} />
              <Row label="Counted cash" value={formatPeso(actual)} strong />
            </dl>
            <ResultPanel diff={diff} />
            <p className="text-sm text-slate-500">Closing freezes this shift's totals. New orders won't be tied to a shift until the store is opened again.</p>
            <div className="grid gap-2">
              <button type="button" onClick={confirmClose} disabled={busy} className="flex min-h-13 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-base font-semibold text-white active:bg-slate-800 disabled:opacity-60">
                <Icon className="h-5 w-5">{I.lock}</Icon>{busy ? 'Closing…' : 'Close store'}
              </button>
              <button type="button" onClick={() => setReviewing(false)} disabled={busy} className="min-h-12 w-full rounded-xl font-semibold text-slate-700 active:bg-slate-100">
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

function ShiftDetailView({ id, onBack }: { id: number; onBack: () => void }) {
  const [d, setD] = useState<Detail | null | undefined>(undefined)
  const [tab, setTab] = useState<DetailTab>('payments')
  useEffect(() => { getShiftDetail(id).then(setD).catch(() => setD(null)) }, [id])
  if (d === undefined) {
    return (
      <div className="space-y-4" aria-busy="true">
        <BackHeader title="Shift report" onBack={onBack} />
        <div className="h-28 animate-pulse rounded-2xl bg-slate-200/60" />
        <div className="h-56 animate-pulse rounded-2xl bg-slate-200/60" />
      </div>
    )
  }
  if (d === null) {
    return (
      <div className="space-y-4">
        <BackHeader title="Shift report" onBack={onBack} />
        <p className={`${card} p-6 text-center text-sm text-slate-500`}>This store shift could not be found.</p>
      </div>
    )
  }
  const { shift: s, totals: t, payments, orders, events, refunds } = d
  const tabs: { id: DetailTab; label: string }[] = [
    { id: 'payments', label: `Payments · ${payments.length}` },
    { id: 'orders', label: `Orders · ${orders.length}` },
    ...(refunds.length > 0 ? [{ id: 'refunds' as const, label: `Refunds · ${refunds.length}` }] : []),
    ...(events.length > 0 ? [{ id: 'events' as const, label: `Drawer & voids · ${events.length}` }] : []),
  ]

  return (
    <div className="space-y-4 pb-2">
      <BackHeader title="Shift report" onBack={onBack} />

      {/* Who and when */}
      <section className={`${card} p-4`}>
        <div className="flex items-center justify-between gap-2">
          <p className="truncate font-bold text-slate-900">{day(s.started_at)}</p>
          <StatusPill open={!s.ended_at} />
        </div>
        <ol className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <li className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Opened</p>
            <p className="font-semibold tabular-nums text-slate-900">{time(s.started_at)}</p>
            <p className="truncate text-xs text-slate-500">by {s.user_name}</p>
          </li>
          <li className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs text-slate-500">{s.ended_at ? 'Closed' : 'Open for'}</p>
            <p className="font-semibold tabular-nums text-slate-900">{s.ended_at ? time(s.ended_at) : since(s.started_at)}</p>
            <p className="truncate text-xs text-slate-500">{s.ended_at ? `by ${s.closed_by_name ?? '—'} · ${since(s.started_at, s.ended_at)}` : 'Still open'}</p>
          </li>
        </ol>
      </section>

      {/* Cash reconciliation */}
      <section className={`${card} p-4`}>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cash drawer</h2>
        <CashSummary t={t} />
        {s.actual_cash_cents != null && s.difference_cents != null && (
          <div className="space-y-3 border-t border-slate-200 pt-1">
            <dl><Row label="Actual cash counted" value={formatPeso(s.actual_cash_cents)} strong /></dl>
            <ResultPanel diff={s.difference_cents} />
          </div>
        )}
      </section>

      <StatTiles t={t} />
      <LaterNote t={t} />
      <PrintButton shiftId={s.id} />

      {/* Transactions, one list at a time */}
      <section className="space-y-3">
        <FilterTabs options={tabs} value={tab} onChange={setTab} label="Shift transactions" />

        {tab === 'payments' && (payments.length === 0 ? <EmptyList text="No payments in this shift." /> : (
          <ul className={`${card} divide-y divide-slate-100 overflow-hidden`}>
            {payments.map((p) => (
              <li key={p.id}>
                <Link to={`/orders/${p.order_id}`} className="flex min-h-16 items-center gap-3 px-4 py-2.5 active:bg-slate-50">
                  <span className={`grid size-10 shrink-0 place-items-center rounded-full ${p.method === 'cash' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
                    <Icon className="h-5 w-5">{p.method === 'cash' ? I.peso : I.phone}</Icon>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-slate-900">#{p.order_number} · {p.customer_name}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {time(p.paid_at)} · {METHOD_LABEL[p.method]} · {p.user_name}{p.collected_later ? ' · balance collected' : ''}
                      {p.tendered_cents != null && p.tendered_cents > p.amount_cents ? ` · change ${formatPeso(p.tendered_cents - p.amount_cents)}` : ''}
                    </span>
                  </span>
                  <span className="shrink-0 font-bold tabular-nums text-slate-900">{formatPeso(p.amount_cents)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ))}

        {tab === 'orders' && (orders.length === 0 ? <EmptyList text="No orders taken in this shift." /> : (
          <ul className={`${card} divide-y divide-slate-100 overflow-hidden`}>
            {orders.map((o) => {
              const due = o.total_cents - o.paid_cents
              return (
                <li key={o.id}>
                  <Link to={`/orders/${o.id}`} className="flex min-h-16 items-center gap-3 px-4 py-2.5 active:bg-slate-50">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-slate-900">#{o.order_number} · {o.customer_name}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {time(o.received_at)} · {STATUS_LABEL[o.status]} · {due <= 0 ? 'Paid' : <span className="font-semibold text-amber-700">{formatPeso(due)} due</span>}
                      </span>
                    </span>
                    <span className={`shrink-0 font-bold tabular-nums ${o.status === 'cancelled' ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{formatPeso(o.total_cents)}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        ))}

        {tab === 'refunds' && (
          <ul className={`${card} divide-y divide-slate-100 overflow-hidden`}>
            {refunds.map((r) => (
              <li key={r.id}>
                <Link to={`/orders/${r.order_id}`} className="flex min-h-16 items-center gap-3 px-4 py-2.5 active:bg-slate-50">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-red-50 text-red-600">
                    <Icon className="h-5 w-5">{r.method === 'cash' ? I.peso : I.phone}</Icon>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-slate-900">#{r.order_number} · {r.customer_name}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {time(r.refunded_at)} · {METHOD_LABEL[r.method]} · {r.user_name}{r.reason ? ` · ${r.reason}` : ''}
                    </span>
                  </span>
                  <span className="shrink-0 font-bold tabular-nums text-red-700">−{formatPeso(r.amount_cents)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {tab === 'events' && (
          <ul className={`${card} divide-y divide-slate-100 overflow-hidden`}>
            {events.map((e) => (
              <li key={e.id} className="flex min-h-14 items-center gap-3 px-4 py-3 text-sm">
                <span className={`grid size-10 shrink-0 place-items-center rounded-full ${e.kind === 'order_cancelled' ? 'bg-red-50 text-red-500' : 'bg-slate-100 text-slate-500'}`}>
                  <Icon className="h-5 w-5">{e.kind === 'order_cancelled' ? I.x : I.register}</Icon>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-slate-900">{e.kind === 'order_cancelled' ? `Order #${e.order_number ?? '?'} cancelled` : 'Cash drawer opened by hand'}</span>
                  <span className="block truncate text-xs text-slate-500">{time(e.at)}{e.user_name ? ` · ${e.user_name}` : ''}{e.detail ? ` · ${e.detail}` : ''}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

const EmptyList = ({ text }: { text: string }) => <p className={`${card} p-6 text-center text-sm text-slate-500`}>{text}</p>

function History({ rows, onOpen }: { rows: StoreShift[] | null; onOpen: (id: number) => void }) {
  const [shown, setShown] = useState(HISTORY_PAGE)
  return (
    <section>
      <h2 className={sectionTitle}>Shift history</h2>
      {rows === null ? <div className="h-40 animate-pulse rounded-2xl bg-slate-200/60" aria-busy="true" /> : rows.length === 0 ? (
        <div className={`${card} flex flex-col items-center px-6 py-8 text-center`}>
          <span className="grid size-12 place-items-center rounded-full bg-slate-100 text-slate-400"><Icon className="h-6 w-6">{I.calendar}</Icon></span>
          <p className="mt-3 text-sm font-semibold text-slate-900">No store shifts yet</p>
          <p className="mt-1 text-sm text-slate-500">Each day you open and close the store appears here.</p>
        </div>
      ) : (
        <>
          <ul className={`${card} divide-y divide-slate-100 overflow-hidden`}>
            {rows.slice(0, shown).map((s) => {
              const d = new Date(s.started_at)
              const counted = s.actual_cash_cents != null && s.difference_cents != null
              return (
                <li key={s.id}>
                  <button type="button" onClick={() => onOpen(s.id)} className="flex min-h-18 w-full items-center gap-3 px-4 py-3 text-left active:bg-slate-50">
                    <span className="grid w-12 shrink-0 place-items-center rounded-xl bg-slate-100 py-1.5 leading-none text-slate-700">
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
                      {s.status === 'active' ? <StatusPill open /> : counted ? <ResultBadge diff={s.difference_cents!} /> : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">Not counted</span>}
                      <Icon className="h-5 w-5 text-slate-300">{I.chevron}</Icon>
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
          <div className="h-56 animate-pulse rounded-2xl bg-slate-200/60" />
          <div className="grid grid-cols-2 gap-2.5">{[0, 1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-200/60" />)}</div>
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
            <button type="button" onClick={() => setView({ kind: 'detail', id: open.id })} className="flex min-h-14 w-full items-center gap-3 border-t border-slate-100 px-4 text-left active:bg-slate-50">
              <Icon className="h-5 w-5 text-blue-600">{I.receipt}</Icon>
              <span className="flex-1 font-semibold text-slate-900">View transactions</span>
              <span className="text-sm text-slate-500">{totals.payments_count} paid · {totals.orders_count} orders</span>
              <Icon className="h-5 w-5 text-slate-400">{I.chevron}</Icon>
            </button>
          </section>

          <StatTiles t={totals} />
          <LaterNote t={totals} />

          <div className={actionBar}>
            <button type="button" onClick={async () => { await load(); setView({ kind: 'close' }) }} className="flex min-h-13 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-base font-semibold text-white active:bg-slate-800">
              <Icon className="h-5 w-5">{I.lock}</Icon>Close store & count drawer
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
        <span className="grid size-12 shrink-0 animate-pop-in place-items-center rounded-2xl bg-slate-900 text-white motion-reduce:animate-none"><Icon className="h-6 w-6">{I.lock}</Icon></span>
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
