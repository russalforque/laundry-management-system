import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AppHeader } from '../../components/AppHeader'
import { I, Icon } from '../../components/Icons'
import { BackHeader, FilterTabs, primary } from '../../components/Manage'
import { Sheet } from '../../components/Sheet'
import {
  card, CashEquation, CashSummary, day, EmptyList, ErrorNote, LaterNote, Line, PesoField, plural, PrintButton, ResultBadge, ResultPanel, Row,
  sectionTitle, since, StatTiles, StatusPill, time,
} from '../../components/store/StoreParts'
import type { ShiftTotals, StoreShift } from '../../db/shifts'
import {
  shiftTabs, useCloseStoreForm, useOpenStoreForm, useShiftDetail, useStoreShiftPage, type ShiftTab,
} from '../../hooks/useStoreShiftPage'
import { formatPeso } from '../../lib/money'
import { METHOD_LABEL, STATUS_LABEL } from '../../lib/orders'
import { canBluetoothPrint } from '../../lib/printer'

/** Sticky bottom action bar; sits above the phone bottom nav and bleeds to the page edges. */
const actionBar = 'sticky bottom-0 z-10 -mx-4 -mb-4 border-t border-blue-100 bg-white/95 px-4 pb-4 pt-3 shadow-[0_-4px_20px_rgba(15,23,42,0.06)] backdrop-blur'
const HISTORY_PAGE = 10

// ---------- open / close ----------

function OpenStoreCard({ lastClosed, onOpened }: { lastClosed?: StoreShift; onOpened: () => void }) {
  const { cash, setCash, err, busy, quick, submit, typed } = useOpenStoreForm(lastClosed, onOpened)
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
            onChange={setCash}
            hint="Count the starting money in the drawer (for change). It is not counted as sales."
            quick={quick}
          />
          {err && <ErrorNote>{err}</ErrorNote>}
        </div>
      </section>
      <div className={actionBar}>
        <button disabled={busy} className={`${primary} min-h-13 w-full text-base`}>
          <Icon className="h-5 w-5">{I.store}</Icon>{busy ? 'Opening…' : typed != null ? `Open Store with ${formatPeso(typed)}` : 'Open Store'}
        </button>
      </div>
    </form>
  )
}

function CloseStore({ shift, totals, onCancel, onClosed }: { shift: StoreShift; totals: ShiftTotals; onCancel: () => void; onClosed: () => void }) {
  const { count, setCount, err, busy, reviewing, setReviewing, actual, diff, review, confirmClose } = useCloseStoreForm(shift, totals, onClosed)

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
        <PesoField label="Actual cash counted" value={count} onChange={setCount} autoFocus hint="Count every bill and coin in the drawer now." />
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
  const d = useShiftDetail(id)
  const [tab, setTab] = useState<ShiftTab>('payments')
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
        <FilterTabs options={shiftTabs(d)} value={tab} onChange={setTab} label="Shift transactions" />

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

/** Shown right after closing: the drawer result and a printout. */
function ClosedResult({ id, onDone }: { id: number; onDone: () => void }) {
  const d = useShiftDetail(id)
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

// ---------- page ----------

/** Phone Store Shift: open the store with the drawer float, watch the day's cash, close with a drawer count. */
export default function MobileStoreShift() {
  const { history, open, totals, rows, view, setView, error, now, load, lastClosed, startClose, afterClose, home } = useStoreShiftPage()

  if (view.kind === 'detail') return <div className="mx-auto max-w-2xl"><ShiftDetailView id={view.id} onBack={home} /></div>
  if (view.kind === 'close' && open && totals) {
    return (
      <div className="mx-auto max-w-2xl">
        <CloseStore shift={open} totals={totals} onCancel={home} onClosed={() => afterClose(open.id)} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-4">
      <AppHeader />
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Store Shift</h1>
        <p className="mt-0.5 text-sm text-slate-500">Open the store, track the drawer, count it at closing.</p>
      </header>

      {error && <ErrorNote>{error}</ErrorNote>}

      {view.kind === 'closed' && <ClosedResult id={view.id} onDone={home} />}

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
            <button type="button" onClick={startClose} className="flex min-h-13 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-base font-semibold text-white shadow-sm shadow-blue-600/30 active:bg-blue-700">
              <Icon className="h-5 w-5">{I.lock}</Icon>Close Store
            </button>
          </div>
        </>
      )}

      {history && <History rows={rows} onOpen={(id) => setView({ kind: 'detail', id })} />}
    </div>
  )
}
