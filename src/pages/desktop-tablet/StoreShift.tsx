import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ActionBar, bigPrimary, bigSecondary, column, fullBleed, quietBtn, Section, StateMessage } from '../../components/desktop-tablet/orderParts'
import { I, Icon } from '../../components/Icons'
import { Sheet } from '../../components/Sheet'
import { day, ErrorNote, LaterNote, PesoField, plural, PrintButton, ResultBadge, ResultPanel, Row, since, StatusPill, time } from '../../components/store/StoreParts'
import { cashResult, type ShiftTotals, type StoreShift as Shift } from '../../db/shifts'
import {
  shiftTabs, useCloseStoreForm, useOpenStoreForm, useShiftDetail, useStoreShiftPage, type ShiftDetail, type ShiftTab,
} from '../../hooks/useStoreShiftPage'
import { formatPeso } from '../../lib/money'
import { METHOD_LABEL, STATUS_LABEL } from '../../lib/orders'

const RESULT_TONE = { balanced: 'text-emerald-700', over: 'text-amber-700', short: 'text-red-700' } as const
const surface = 'rounded-2xl bg-white px-7 py-6 shadow-[0_1px_3px_rgba(15,23,42,0.05)]'
const skeleton = 'animate-pulse rounded-2xl bg-slate-200/60 motion-reduce:animate-none'
const signedDiff = (d: number) => (d === 0 ? formatPeso(0) : `${d > 0 ? '+' : '−'}${formatPeso(Math.abs(d))}`)

/**
 * Store Shift on tablets (landscape first) and desktops: one column, one task at a time, the task's action pinned to the
 * bottom. Closed → count the opening cash and Open Store. Open → the live drawer and the shift so far, Close Store at the
 * bottom. Closing → step 1 what the drawer should hold, step 2 the count, then a confirmation (closing can't be undone).
 * Shift history below the day's task; a shift opens as its report. Same flows and figures as the phone page
 * (hooks/useStoreShiftPage.ts).
 */
export default function StoreShift() {
  const { history, open, totals, rows, view, setView, error, now, load, lastClosed, startClose, afterClose, home } = useStoreShiftPage()
  const report = (id: number) => setView({ kind: 'detail', id })

  if (view.kind === 'detail') return <ShiftReport id={view.id} onBack={home} />
  if (view.kind === 'closed') return <Page key="closed"><ClosedResult id={view.id} onReport={() => report(view.id)} onDone={home} /></Page>
  if (open === undefined) {
    return (
      <Page key="loading">
        <Title />
        <div className="space-y-4" aria-busy="true" aria-label="Loading store shift">
          <div className={`h-20 ${skeleton}`} />
          <div className={`h-72 ${skeleton}`} />
        </div>
      </Page>
    )
  }
  if (open && totals && view.kind === 'close') {
    return <CloseCount key="close" shift={open} totals={totals} onCancel={home} onClosed={() => afterClose(open.id)} />
  }

  const historyList = history && <HistoryList rows={rows} onOpen={report} />
  if (!open || !totals) return <OpenStore key="open-form" error={error} lastClosed={lastClosed} onOpened={load} onReport={report} history={historyList} />

  return (
    <Page
      key="open"
      bar={
        <ActionBar>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-slate-500">Cash in drawer now</p>
            <p className="text-3xl font-bold tabular-nums tracking-tight text-slate-900">{formatPeso(totals.expected_cash_cents)}</p>
          </div>
          <button type="button" onClick={() => report(open.id)} className={`${bigSecondary} shrink-0`}><Icon className="h-5 w-5">{I.receipt}</Icon>Transactions</button>
          <button type="button" onClick={startClose} className={`${bigPrimary} w-72 shrink-0 text-lg`}><Icon className="h-6 w-6">{I.lock}</Icon>Close Store</button>
        </ActionBar>
      }
    >
      <Title />
      {error && <ErrorNote>{error}</ErrorNote>}
      <StatusLine
        open
        text={<>Opened {time(open.started_at)} by <b className="font-semibold text-slate-800">{open.user_name}</b> · open for <b className="font-semibold text-slate-800">{since(open.started_at, null, now)}</b></>}
      />
      <div className={surface}>
        <Section title="Cash in drawer" hint="What the drawer should hold right now. Updates as payments come in.">
          <Drawer t={totals} />
        </Section>
        <Section title="This shift so far">
          <Activity t={totals} />
          <div className="mt-4 empty:hidden"><LaterNote t={totals} /></div>
        </Section>
      </div>
      {historyList}
    </Page>
  )
}

// ---------- frame & building blocks ----------

/** A page that fills <main>: its own scroll area in the reading column, and an optional bar pinned under it. */
function Page({ children, bar }: { children: ReactNode; bar?: ReactNode }) {
  return (
    <div className={fullBleed}>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-10 pt-6">
        <div className={`${column} space-y-5`}>{children}</div>
      </div>
      {bar}
    </div>
  )
}

const Title = () => (
  <header>
    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Store Shift</h1>
    <p className="mt-0.5 text-[15px] text-slate-500">Open the store, track the drawer, and count it at closing.</p>
  </header>
)

/** Open or closed, said once, plainly. */
function StatusLine({ open, text }: { open: boolean; text: ReactNode }) {
  return (
    <div className={`flex items-center gap-4 rounded-2xl px-5 py-4 ${open ? 'bg-emerald-50' : 'bg-white shadow-[0_1px_3px_rgba(15,23,42,0.05)]'}`}>
      <span className={`grid size-12 shrink-0 place-items-center rounded-xl ${open ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
        <Icon className="h-6 w-6">{open ? I.store : I.lock}</Icon>
      </span>
      <div className="min-w-0">
        <p className={`text-lg font-semibold ${open ? 'text-emerald-900' : 'text-slate-900'}`}>{open ? 'Store is open' : 'Store is closed'}</p>
        <p className={`text-[15px] ${open ? 'text-emerald-800' : 'text-slate-500'}`}>{text}</p>
      </div>
    </div>
  )
}

/** The drawer figure, then how it adds up, top to bottom like a receipt. */
function Drawer({ t, big = true }: { t: ShiftTotals; big?: boolean }) {
  const line = (sign: string, label: string, hint: string, value: number) => (
    <div className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-baseline gap-x-2 py-3">
      <span className="text-lg font-bold text-slate-400" aria-hidden>{sign}</span>
      <dt className="min-w-0 text-[15px] text-slate-700">{label}<span className="block text-sm text-slate-400">{hint}</span></dt>
      <dd className="text-lg font-semibold tabular-nums text-slate-900">{sign === '−' && value > 0 ? '−' : ''}{formatPeso(value)}</dd>
    </div>
  )
  return (
    <>
      {big && <p className="text-5xl font-bold tabular-nums tracking-tight text-slate-900">{formatPeso(t.expected_cash_cents)}</p>}
      <dl className={`${big ? 'mt-4' : ''} divide-y divide-slate-100 rounded-xl bg-slate-50 px-5`}>
        {line('', 'Opening cash', 'Starting money for change, not sales', t.opening_cents)}
        {line('+', 'Cash payments', 'Change given back is not included', t.cash_cents)}
        {line('−', 'Cash refunds', 'Cash given back on cancelled orders', t.outflow_cents)}
      </dl>
    </>
  )
}

function Figure({ label, value, note, tone = 'text-slate-900' }: { label: string; value: string; note?: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className={`truncate text-2xl font-bold tabular-nums tracking-tight ${tone}`}>{value}</dd>
      {note && <dd className="truncate text-sm text-slate-500">{note}</dd>}
    </div>
  )
}

function Activity({ t }: { t: ShiftTotals }) {
  return (
    <dl className="grid grid-cols-3 gap-x-6 gap-y-5">
      <Figure label="Total payments" value={formatPeso(t.payments_cents)} note={plural(t.payments_count, 'payment')} />
      <Figure label="Cash" value={formatPeso(t.cash_cents)} note="Goes into the drawer" />
      <Figure label="GCash / non-cash" value={formatPeso(t.noncash_cents)} note="Not in the drawer" />
      <Figure label="Orders taken" value={String(t.orders_count)} note={t.cancelled_count ? `${t.cancelled_count} cancelled` : 'None cancelled'} />
      <Figure label="Picked up" value={String(t.released_count)} note="Orders completed" />
      <Figure
        label="Refunded"
        value={t.refunds_cents ? `−${formatPeso(t.refunds_cents)}` : formatPeso(0)}
        note={t.refunds_count ? plural(t.refunds_count, 'refund') : 'No refunds'}
        tone={t.refunds_cents ? 'text-red-700' : 'text-slate-900'}
      />
    </dl>
  )
}

// ---------- store closed: open it ----------

function OpenStore({ error, lastClosed, onOpened, onReport, history }: {
  error: string; lastClosed?: Shift; onOpened: () => void; onReport: (id: number) => void; history: ReactNode
}) {
  const { cash, setCash, err, busy, quick, submit, typed } = useOpenStoreForm(lastClosed, onOpened)
  const counted = lastClosed?.actual_cash_cents != null && lastClosed.difference_cents != null
  return (
    <Page
      bar={
        <ActionBar above={err && <div className="mb-3"><ErrorNote>{err}</ErrorNote></div>}>
          <p className="min-w-0 flex-1 text-[15px] text-slate-500">Count the drawer, enter the total, then open the store.</p>
          <button type="submit" form="open-store" disabled={busy} className={`${bigPrimary} w-80 shrink-0 text-lg`}>
            <Icon className="h-6 w-6">{I.store}</Icon>{busy ? 'Opening…' : typed != null ? `Open Store · ${formatPeso(typed)}` : 'Open Store'}
          </button>
        </ActionBar>
      }
    >
      <Title />
      {error && <ErrorNote>{error}</ErrorNote>}
      <StatusLine open={false} text={lastClosed?.ended_at ? `Last closed ${day(lastClosed.ended_at)}, ${time(lastClosed.ended_at)}. Open the store to start taking payments.` : 'Open the store to start taking payments.'} />

      <form id="open-store" onSubmit={submit} className={surface}>
        <Section title="Opening cash" hint="Count every bill and coin in the drawer before the first customer.">
          <div className="max-w-xl">
            <PesoField label="Cash in the drawer now" value={cash} onChange={setCash} hint="This is change money for the day. It is not counted as sales." quick={quick} />
          </div>
        </Section>

        {lastClosed && (
          <Section
            title="Last shift"
            hint={`${day(lastClosed.started_at)} · ${time(lastClosed.started_at)}–${lastClosed.ended_at ? time(lastClosed.ended_at) : 'now'}`}
            action={<button type="button" onClick={() => onReport(lastClosed.id)} className={quietBtn}>View report<Icon className="h-4 w-4">{I.next}</Icon></button>}
          >
            <div className="flex flex-wrap items-center gap-x-10 gap-y-3">
              <dl className="flex gap-10">
                <Figure label="Expected cash" value={formatPeso(lastClosed.expected_cash_cents ?? 0)} />
                <Figure label="Counted at closing" value={counted ? formatPeso(lastClosed.actual_cash_cents!) : 'Not counted'} />
              </dl>
              {counted && <ResultBadge diff={lastClosed.difference_cents!} big />}
            </div>
          </Section>
        )}
      </form>

      <ol className="grid grid-cols-3 gap-4 text-sm">
        {[
          ['Count the drawer', 'Enter the starting cash and open the store.'],
          ['Take orders and payments', 'The expected drawer cash updates by itself.'],
          ['Close at the end of the day', 'Count again to see if the drawer is balanced.'],
        ].map(([t, x], i) => (
          <li key={t} className="flex gap-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-full border border-slate-300 text-xs font-bold text-slate-500">{i + 1}</span>
            <span className="min-w-0"><b className="block font-semibold text-slate-800">{t}</b><span className="text-slate-500">{x}</span></span>
          </li>
        ))}
      </ol>

      {history}
    </Page>
  )
}

// ---------- closing the store ----------

/** Step 1 what the drawer should hold, step 2 the physical count; then a confirmation, since closing can't be undone. */
function CloseCount({ shift, totals, onCancel, onClosed }: { shift: Shift; totals: ShiftTotals; onCancel: () => void; onClosed: () => void }) {
  const { count, setCount, err, busy, reviewing, setReviewing, actual, diff, review, confirmClose } = useCloseStoreForm(shift, totals, onClosed)
  return (
    <Page
      bar={
        <ActionBar above={err && <div className="mb-3"><ErrorNote>{err}</ErrorNote></div>}>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-slate-500">{diff === null ? 'Expected in drawer' : 'Difference'}</p>
            <p className={`text-3xl font-bold tabular-nums tracking-tight ${diff === null ? 'text-slate-900' : RESULT_TONE[cashResult(diff)]}`}>
              {diff === null ? formatPeso(totals.expected_cash_cents) : signedDiff(diff)}
            </p>
          </div>
          <button type="button" onClick={onCancel} disabled={busy} className={`${bigSecondary} shrink-0`}>Cancel</button>
          <button type="button" onClick={review} disabled={busy || actual === null} className={`${bigPrimary} w-80 shrink-0 text-lg`}>
            <Icon className="h-6 w-6">{I.lock}</Icon>{actual === null ? 'Enter the counted cash' : 'Review & Close Store'}
          </button>
        </ActionBar>
      }
    >
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Close the store</h1>
        <p className="mt-0.5 text-[15px] text-slate-500">Opened {time(shift.started_at)} by {shift.user_name} · {since(shift.started_at, null)}</p>
      </header>
      <div className={surface}>
        <Section title={<StepTitle n={1}>Expected in drawer</StepTitle>} hint="What the drawer should hold. Check it against your count.">
          <Drawer t={totals} />
        </Section>
        <Section title={<StepTitle n={2}>Count the drawer</StepTitle>} hint="Count every bill and coin, then enter the total.">
          <div className="max-w-md"><PesoField label="Actual cash counted" value={count} onChange={setCount} autoFocus /></div>
          <div className="mt-4">
            {diff !== null
              ? <ResultPanel diff={diff} />
              : <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-[15px] text-slate-500">Balanced, over or short shows here as you type.</p>}
          </div>
        </Section>
      </div>

      {reviewing && actual !== null && diff !== null && (
        <Sheet label="Close the store?" onClose={() => !busy && setReviewing(false)}>
          <div className="space-y-4">
            <dl className="divide-y divide-slate-100 rounded-2xl bg-slate-50 px-4">
              <Row label="Expected cash" value={formatPeso(totals.expected_cash_cents)} />
              <Row label="Counted cash" value={formatPeso(actual)} strong />
            </dl>
            <ResultPanel diff={diff} />
            <p className="text-sm text-slate-500">Closing saves this shift's totals and can't be undone. Payments can't be taken until the store is opened again.</p>
            <div className="grid gap-2">
              <button type="button" onClick={confirmClose} disabled={busy} className={`${bigPrimary} w-full`}>
                <Icon className="h-5 w-5">{I.lock}</Icon>{busy ? 'Closing…' : 'Close Store'}
              </button>
              <button type="button" onClick={() => setReviewing(false)} disabled={busy} className="min-h-12 w-full rounded-xl font-semibold text-blue-700 hover:bg-blue-50">Keep counting</button>
            </div>
          </div>
        </Sheet>
      )}
    </Page>
  )
}

const StepTitle = ({ n, children }: { n: number; children: ReactNode }) => (
  <span className="flex items-center gap-3">
    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-blue-600 text-sm font-bold text-white" aria-hidden>{n}</span>
    <span><span className="sr-only">Step {n}: </span>{children}</span>
  </span>
)

/** Right after closing: expected, counted and the difference, the result in words, then print / report / done. */
function ClosedResult({ id, onReport, onDone }: { id: number; onReport: () => void; onDone: () => void }) {
  const d = useShiftDetail(id)
  const diff = d?.shift.difference_cents ?? 0
  return (
    <div className="mx-auto max-w-2xl space-y-5 pt-4">
      <div className="flex flex-col items-center text-center">
        <span className="grid size-16 animate-pop-in place-items-center rounded-full bg-emerald-600 text-white motion-reduce:animate-none"><Icon className="h-8 w-8">{I.check}</Icon></span>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900" role="status">Store closed</h1>
        <p className="text-[15px] text-slate-500">This shift's totals are saved.</p>
      </div>
      {d === undefined ? <div className={`h-40 ${skeleton}`} /> : d && (
        <div className={`${surface} space-y-5`}>
          <dl className="grid grid-cols-3 gap-6">
            <Figure label="Expected" value={formatPeso(d.shift.expected_cash_cents ?? 0)} />
            <Figure label="Counted" value={formatPeso(d.shift.actual_cash_cents ?? 0)} />
            <Figure label="Difference" value={signedDiff(diff)} tone={RESULT_TONE[cashResult(diff)]} />
          </dl>
          <ResultPanel diff={diff} />
        </div>
      )}
      <div className="grid gap-3">
        <button type="button" onClick={onDone} className={`${bigPrimary} w-full`}>Done</button>
        {/* Print renders nothing where there is no receipt printer; the report button then takes the full width. */}
        <div className="flex gap-3 *:flex-1">
          <PrintButton shiftId={id} className={`${bigSecondary} w-full`} />
          <button type="button" onClick={onReport} className={`${bigSecondary} w-full`}><Icon className="h-5 w-5">{I.report}</Icon>View shift report</button>
        </div>
      </div>
    </div>
  )
}

// ---------- history ----------

function HistoryList({ rows, onOpen }: { rows: Shift[] | null; onOpen: (id: number) => void }) {
  return (
    <section aria-labelledby="shift-history" className="space-y-3 pt-3">
      <div className="flex items-end justify-between gap-3 border-b border-slate-200 pb-2">
        <div>
          <h2 id="shift-history" className="text-lg font-semibold text-slate-900">Shift history</h2>
          <p className="text-sm text-slate-500">Tap a shift to see its full report.</p>
        </div>
        {rows && rows.length > 0 && <span className="text-sm text-slate-500">{plural(rows.length, 'shift')}</span>}
      </div>
      {rows === null ? <div className={`h-48 ${skeleton}`} aria-busy="true" /> : rows.length === 0 ? (
        <div className="rounded-2xl bg-white">
          <StateMessage icon={I.calendar} title="No store shifts yet" text="Each day you open and close the store appears here." />
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200/70 bg-white">
          {rows.map((s) => {
            const active = s.status === 'active'
            const counted = s.actual_cash_cents != null && s.difference_cents != null
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onOpen(s.id)}
                  className={`grid min-h-18 w-full grid-cols-[minmax(0,1fr)_9rem_8rem_8rem_1.25rem] items-center gap-x-5 px-5 py-3 text-left hover:bg-slate-50 active:bg-slate-100 ${active ? 'bg-emerald-50/50' : ''}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-base font-semibold text-slate-900">{day(s.started_at)}</span>
                    <span className="block truncate text-sm tabular-nums text-slate-500">{time(s.started_at)} – {s.ended_at ? time(s.ended_at) : 'now'} · {since(s.started_at, s.ended_at)} · {s.user_name}</span>
                  </span>
                  <span className="text-sm">
                    <span className="block tabular-nums text-slate-700">{active || s.cash_cents == null ? '—' : formatPeso(s.cash_cents + (s.noncash_cents ?? 0))}</span>
                    <span className="block text-slate-500">{active || s.orders_count == null ? 'In progress' : plural(s.orders_count, 'order')}</span>
                  </span>
                  <span className="text-right">
                    <span className="block text-base font-semibold tabular-nums text-slate-900">{counted ? formatPeso(s.actual_cash_cents!) : '—'}</span>
                    <span className="block text-xs text-slate-500">counted</span>
                  </span>
                  <span className="flex justify-end">
                    {active ? <StatusPill open /> : counted ? <ResultBadge diff={s.difference_cents!} big /> : <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-500">Not counted</span>}
                  </span>
                  <Icon className="h-5 w-5 text-slate-300">{I.chevron}</Icon>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

// ---------- shift report ----------

const TAB_LABEL: Record<ShiftTab, string> = { payments: 'Payments', orders: 'Orders', refunds: 'Refunds', events: 'Drawer & voids' }

/** A report row: time · what (with a detail line) · a middle fact · amount; opens the order when there is one. */
function TxRow({ to, at, title, detail, mid, amount, amountTone = 'text-slate-900' }: {
  to?: string; at: string; title: ReactNode; detail?: ReactNode; mid?: ReactNode; amount?: ReactNode; amountTone?: string
}) {
  const body = (
    <>
      <span className="text-sm tabular-nums text-slate-500">{time(at)}</span>
      <span className="min-w-0">
        <span className="block truncate font-semibold text-slate-900">{title}</span>
        {detail && <span className="block truncate text-sm text-slate-500">{detail}</span>}
      </span>
      <span className="min-w-0 truncate text-sm text-slate-600">{mid}</span>
      <span className={`text-right text-base font-bold tabular-nums ${amountTone}`}>{amount}</span>
      {to ? <Icon className="h-5 w-5 text-slate-300">{I.chevron}</Icon> : <span />}
    </>
  )
  const cls = 'grid min-h-16 grid-cols-[4.5rem_minmax(0,1fr)_10rem_7.5rem_1.25rem] items-center gap-x-4 px-5 py-3'
  return <li>{to ? <Link to={to} className={`${cls} hover:bg-slate-50 active:bg-slate-100`}>{body}</Link> : <div className={cls}>{body}</div>}</li>
}

function ShiftReport({ id, onBack }: { id: number; onBack: () => void }) {
  const d = useShiftDetail(id)
  const [tab, setTab] = useState<ShiftTab>('payments')
  const back = (
    <button type="button" onClick={onBack} className="-ml-3 inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-[15px] font-semibold text-slate-600 hover:bg-slate-200/60 active:bg-slate-200">
      <Icon className="h-5 w-5">{I.back}</Icon>Store Shift
    </button>
  )

  if (d === undefined) {
    return <Page>{back}<div className="space-y-4" aria-busy="true" aria-label="Loading shift report"><div className={`h-24 ${skeleton}`} /><div className={`h-72 ${skeleton}`} /></div></Page>
  }
  if (d === null) {
    return (
      <Page>
        {back}
        <div className="rounded-2xl bg-white">
          <StateMessage icon={I.report} title="Shift report not found" text="This store shift may have been removed. Go back and pick another shift." action={<button type="button" onClick={onBack} className={bigSecondary}>Back to Store Shift</button>} />
        </div>
      </Page>
    )
  }

  const { shift: s, totals: t } = d
  const isOpen = !s.ended_at
  const counted = s.actual_cash_cents != null && s.difference_cents != null
  const tabs = shiftTabs(d)

  return (
    <Page>
      {back}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">{day(s.started_at)}</h1>
            <StatusPill open={isOpen} />
          </div>
          <p className="mt-0.5 text-[15px] text-slate-500">
            {time(s.started_at)} – {s.ended_at ? time(s.ended_at) : 'now'} ({since(s.started_at, s.ended_at)}) · Opened by {s.user_name}{s.ended_at ? ` · Closed by ${s.closed_by_name ?? '—'}` : ''}
          </p>
        </div>
        <div className="w-60"><PrintButton shiftId={s.id} className={`${bigSecondary} min-h-12 w-full`} /></div>
      </header>

      <div className={surface}>
        {/* The drawer, first */}
        <dl className="grid grid-cols-4 gap-6 pb-6">
          <Figure label="Expected cash" value={formatPeso(t.expected_cash_cents)} note={isOpen ? 'Live' : 'Drawer should hold'} />
          <Figure label="Counted cash" value={counted ? formatPeso(s.actual_cash_cents!) : '—'} note={counted ? 'At closing' : isOpen ? 'At closing' : 'Not counted'} />
          <Figure
            label="Drawer result"
            value={counted ? (s.difference_cents === 0 ? 'Balanced' : signedDiff(s.difference_cents!)) : '—'}
            note={counted ? (s.difference_cents === 0 ? 'Matches expected' : s.difference_cents! > 0 ? 'Over' : 'Short') : 'After the count'}
            tone={counted ? RESULT_TONE[cashResult(s.difference_cents!)] : 'text-slate-900'}
          />
          <Figure label="Total payments" value={formatPeso(t.payments_cents)} note={`${plural(t.payments_count, 'payment')} · ${plural(t.orders_count, 'order')}`} />
        </dl>
        {counted && <div className="pb-6"><ResultPanel diff={s.difference_cents!} /></div>}
        <Section title="How the drawer adds up"><Drawer t={t} big={false} /></Section>
        <Section title="Shift activity">
          <Activity t={t} />
          <div className="mt-4 empty:hidden"><LaterNote t={t} /></div>
        </Section>
      </div>

      {/* Transactions */}
      <section aria-label="Transactions" className="space-y-3 pt-2">
        <div role="tablist" aria-label="Shift transactions" className="flex gap-1 overflow-x-auto border-b border-slate-200 scrollbar-none">
          {tabs.map((x) => {
            const on = tab === x.id
            return (
              <button
                key={x.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setTab(x.id)}
                className={`-mb-px inline-flex min-h-12 shrink-0 items-center gap-2 border-b-[3px] px-4 text-[15px] transition-colors ${
                  on ? 'border-blue-600 font-semibold text-blue-700' : 'border-transparent font-medium text-slate-600 hover:text-slate-900'
                }`}
              >
                {TAB_LABEL[x.id]}
                <span className={`min-w-6 rounded-full px-1.5 py-0.5 text-center text-xs font-semibold tabular-nums ${on ? 'bg-blue-600 text-white' : 'bg-slate-200/70 text-slate-600'}`}>{d[x.id].length}</span>
              </button>
            )
          })}
        </div>
        <Transactions d={d} tab={tab} />
      </section>
    </Page>
  )
}

function Transactions({ d, tab }: { d: ShiftDetail; tab: ShiftTab }) {
  const list = (children: ReactNode) => <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200/70 bg-white">{children}</ul>
  const empty = (text: string) => <p className="rounded-2xl bg-white px-6 py-10 text-center text-[15px] text-slate-500">{text}</p>

  if (tab === 'payments') {
    return d.payments.length === 0 ? empty('No payments in this shift.') : list(d.payments.map((p) => {
      const change = p.tendered_cents != null && p.tendered_cents > p.amount_cents ? `Change ${formatPeso(p.tendered_cents - p.amount_cents)}` : ''
      const later = !!p.collected_later // 0 / 1 from SQLite
      return (
        <TxRow
          key={p.id}
          to={`/orders/${p.order_id}`}
          at={p.paid_at}
          title={<>#{p.order_number} · {p.customer_name}</>}
          detail={(later || change) ? <>{later && <span className="font-semibold text-blue-700">Balance payment</span>}{later && change ? ' · ' : ''}{change}</> : null}
          mid={<>{METHOD_LABEL[p.method]} · {p.user_name}</>}
          amount={formatPeso(p.amount_cents)}
        />
      )
    }))
  }
  if (tab === 'orders') {
    return d.orders.length === 0 ? empty('No orders taken in this shift.') : list(d.orders.map((o) => {
      const due = o.total_cents - o.paid_cents
      const cancelled = o.status === 'cancelled'
      return (
        <TxRow
          key={o.id}
          to={`/orders/${o.id}`}
          at={o.received_at}
          title={<>#{o.order_number} · {o.customer_name}</>}
          detail={cancelled ? 'Cancelled' : due <= 0 ? <span className="font-medium text-emerald-700">Paid</span> : <span className="font-medium text-amber-700">{formatPeso(due)} due</span>}
          mid={STATUS_LABEL[o.status]}
          amount={formatPeso(o.total_cents)}
          amountTone={cancelled ? 'text-slate-400 line-through' : 'text-slate-900'}
        />
      )
    }))
  }
  if (tab === 'refunds') {
    return list(d.refunds.map((r) => (
      <TxRow
        key={r.id}
        to={`/orders/${r.order_id}`}
        at={r.refunded_at}
        title={<>#{r.order_number} · {r.customer_name}</>}
        detail={r.reason}
        mid={<>{METHOD_LABEL[r.method]} · {r.user_name}</>}
        amount={`−${formatPeso(r.amount_cents)}`}
        amountTone="text-red-700"
      />
    )))
  }
  return list(d.events.map((e) => (
    <TxRow
      key={e.id}
      at={e.at}
      title={
        <span className="flex items-center gap-2">
          <Icon className={`h-4 w-4 shrink-0 ${e.kind === 'order_cancelled' ? 'text-red-500' : 'text-blue-600'}`}>{e.kind === 'order_cancelled' ? I.x : I.register}</Icon>
          {e.kind === 'order_cancelled' ? `Order #${e.order_number ?? '?'} cancelled` : 'Cash drawer opened by hand'}
        </span>
      }
      detail={e.detail}
      mid={e.user_name ?? '—'}
    />
  )))
}
