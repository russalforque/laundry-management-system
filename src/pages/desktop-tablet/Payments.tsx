import { Link } from 'react-router-dom'
import { Select } from '../../components/Controls'
import { bigPrimary, bigSecondary, StateMessage } from '../../components/desktop-tablet/orderParts'
import { I, Icon } from '../../components/Icons'
import { METHOD_BADGE } from '../../components/payments/PaymentParts'
import type { PaymentHistoryRow } from '../../db/payments'
import { METHODS, PAYMENT_LIMIT, paymentTime, periodLabel, plural, usePaymentList, ymd, type MethodFilter } from '../../hooks/usePaymentList'
import { formatPeso } from '../../lib/money'
import { METHOD_LABEL } from '../../lib/orders'
import type { PaymentMethod } from '../../types'

/** What each method means for the shop's money, said in plain words under its total. */
const METHOD_NOTE: Record<PaymentMethod, string> = {
  cash: 'In the cash drawer',
  gcash: 'Sent to the shop GCash',
  other: 'Any other method',
}
const METHOD_BAR: Record<PaymentMethod, string> = { cash: 'bg-emerald-500', gcash: 'bg-blue-500', other: 'bg-slate-400' }
const sum = (rows: PaymentHistoryRow[]) => rows.reduce((n, p) => n + p.amount_cents, 0)

const field = 'min-h-14 w-full rounded-xl border border-slate-200 bg-white text-base text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'

/**
 * Payments on tablets (landscape first) and desktops, read top to bottom: when (date tabs) → search and who →
 * how much came in and how (the method figures double as the method filter) → every payment, grouped by day, each
 * opening its order. Payments are taken on orders; this page is for checking them. Same data and filters as the
 * phone page (hooks/usePaymentList.ts).
 */
export default function Payments() {
  const {
    all, date, setDate, rows, error, load, search, setSearch, method, setMethod, employee, setEmployee,
    employees, base, shown, shownTotal, days, filtered, clear, narrowing,
  } = usePaymentList()
  const period = periodLabel(date)

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-6">
      {/* ── Header ─────────────────────────────────────────── */}
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Payments</h1>
        <p className="mt-0.5 text-[15px] text-slate-500">
          {all ? 'Money received from customers, by every employee.' : 'Money you received from customers.'} Tap a payment to open its order.
        </p>
      </header>

      {/* ── When ───────────────────────────────────────────── */}
      <DateTabs date={date} onChange={setDate} />

      {/* ── What and who ───────────────────────────────────── */}
      <div className="flex gap-3">
        <div className="relative min-w-0 flex-1">
          <Icon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400">{I.search}</Icon>
          <input
            type="search"
            enterKeyHint="search"
            aria-label="Search payments"
            placeholder="Search order #, customer or reference"
            className={`${field} pl-12 pr-12`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-2 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full text-slate-400 hover:bg-slate-100">
              <Icon className="h-5 w-5">{I.x}</Icon>
            </button>
          )}
        </div>
        {all && (
          <div className="w-64 shrink-0">
            <Select className={`${field} px-4`} aria-label="Received by" value={employee} onChange={(e) => setEmployee(e.target.value)}>
              <option value="">Received by: everyone</option>
              {employees.map((n) => <option key={n} value={n}>Received by: {n}</option>)}
            </Select>
          </div>
        )}
      </div>

      {/* ── How much, and how ──────────────────────────────── */}
      {rows && !error && base.length > 0 && <Summary rows={base} period={period} method={method} onMethod={setMethod} />}

      {/* ── Every payment ──────────────────────────────────── */}
      <section aria-label="Payments list" className="space-y-4">
        {rows !== null && !error && shown.length > 0 && (
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-slate-200 pb-2" aria-live="polite">
            <h2 className="text-lg font-semibold text-slate-900">
              {plural(shown.length, 'payment')} <span className="ml-1 tabular-nums text-slate-500">{formatPeso(shownTotal)}</span>
            </h2>
            <p className="flex min-w-0 items-center gap-2 text-[15px] text-slate-500">
              <span className="truncate">{period}{narrowing && <> · {narrowing}</>}</span>
              {filtered && <button type="button" onClick={clear} className="-my-2 inline-flex min-h-11 shrink-0 items-center rounded-xl px-3 font-semibold text-blue-700 hover:bg-blue-50">Clear filters</button>}
            </p>
          </div>
        )}

        {error ? (
          <div className="rounded-2xl bg-white">
            <StateMessage
              icon={I.info}
              title="Couldn't load payments"
              text="Something went wrong reading the payments. Try again; if it keeps happening, close and reopen the app."
              action={<button type="button" onClick={load} className={bigPrimary}><Icon className="h-5 w-5">{I.refresh}</Icon>Try again</button>}
            />
          </div>
        ) : rows === null ? (
          <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white" aria-busy="true" aria-label="Loading payments">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-6 px-5 py-4 motion-safe:animate-pulse">
                <div className="h-4 w-16 rounded bg-slate-100" />
                <div className="flex-1 space-y-2"><div className="h-4 w-48 rounded bg-slate-200" /><div className="h-3 w-28 rounded bg-slate-100" /></div>
                <div className="h-7 w-20 rounded-full bg-slate-100" />
                <div className="h-5 w-20 rounded bg-slate-200" />
              </div>
            ))}
          </div>
        ) : shown.length === 0 ? (
          <div className="rounded-2xl bg-white">
            {filtered ? (
              <StateMessage
                icon={I.search}
                title="No matching payments"
                text={`Nothing for ${period.toLowerCase()}${narrowing ? ` · ${narrowing}` : ''}. Try another date, method or search.`}
                action={<button type="button" onClick={clear} className={bigSecondary}>Show all payments</button>}
              />
            ) : (
              <StateMessage
                icon={I.wallet}
                title="No payments yet"
                text={all ? 'Payments appear here as soon as employees collect them on orders.' : 'Payments you collect on orders appear here.'}
              />
            )}
          </div>
        ) : (
          <>
            {days.map((g) => (
              <div key={g.key}>
                <h3 className="flex items-baseline justify-between gap-3 px-1 pb-2">
                  <span className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                    <Icon className="h-4 w-4 text-slate-400">{I.calendar}</Icon>{g.label}
                    <span className="font-normal text-slate-400">· {plural(g.rows.length, 'payment')}</span>
                  </span>
                  <span className="text-sm text-slate-500">Day total <b className="ml-1 text-base font-bold tabular-nums text-slate-900">{formatPeso(g.total)}</b></span>
                </h3>
                <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200/70 bg-white">
                  {g.rows.map((p) => <PaymentRowLink key={p.id} p={p} showBy={all} />)}
                </ul>
              </div>
            ))}
            {rows.length >= PAYMENT_LIMIT && !date && (
              <p className="flex items-center justify-center gap-2 px-4 py-2 text-center text-sm text-slate-500">
                <Icon className="h-4 w-4 text-slate-400">{I.info}</Icon>Showing the latest {PAYMENT_LIMIT} payments. Pick a date to see older ones.
              </p>
            )}
          </>
        )}
      </section>
    </div>
  )
}

/** Today / Yesterday / All dates as tabs, and Pick date opening the device's own date picker. */
function DateTabs({ date, onChange }: { date: string; onChange: (d: string) => void }) {
  const today = ymd()
  const yesterday = ymd(-1)
  const custom = !!date && date !== today && date !== yesterday
  const tab = (on: boolean) =>
    `-mb-px inline-flex min-h-12 shrink-0 items-center gap-2 whitespace-nowrap border-b-[3px] px-5 text-[15px] transition-colors ${
      on ? 'border-blue-600 font-semibold text-blue-700' : 'border-transparent font-medium text-slate-600 hover:text-slate-900'
    }`
  return (
    <div role="tablist" aria-label="Date paid" className="flex gap-1 border-b border-slate-200">
      <button type="button" role="tab" aria-selected={date === today} onClick={() => onChange(today)} className={tab(date === today)}>Today</button>
      <button type="button" role="tab" aria-selected={date === yesterday} onClick={() => onChange(yesterday)} className={tab(date === yesterday)}>Yesterday</button>
      <button type="button" role="tab" aria-selected={!date} onClick={() => onChange('')} className={tab(!date)}>All dates</button>
      {/* The transparent native input covers the tab, so a tap anywhere opens the picker. */}
      <label className={`relative cursor-pointer ${tab(custom)}`}>
        <Icon className="h-5 w-5">{I.calendar}</Icon>
        {custom ? periodLabel(date) : 'Pick a date'}
        <input
          type="date"
          aria-label="Pick a date"
          max={today}
          value={custom ? date : ''}
          onChange={(e) => onChange(e.target.value)}
          className="picker-input absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
    </div>
  )
}

/**
 * The period's total, then its split by method. The method figures are the method filter: tap one to see only those
 * payments, again for all. Totals come from the search / employee results before the method filter, so the three
 * always add up to the big number.
 */
function Summary({ rows, period, method, onMethod }: { rows: PaymentHistoryRow[]; period: string; method: MethodFilter; onMethod: (m: MethodFilter) => void }) {
  const total = sum(rows)
  const by = METHODS.map((m) => {
    const list = rows.filter((p) => p.method === m)
    return { m, count: list.length, cents: sum(list) }
  })
  return (
    <section aria-label="Payments summary" className="rounded-2xl bg-white px-6 py-5 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
        <div className="min-w-0">
          <p className="text-[15px] text-slate-500">Collected · {period}</p>
          <p className="text-4xl font-bold tabular-nums tracking-tight text-slate-900">{formatPeso(total)}</p>
          <p className="text-sm text-slate-500">from {plural(rows.length, 'payment')}</p>
        </div>

        <div role="group" aria-label="Filter by payment method" className="grid min-w-0 flex-1 grid-cols-3 gap-2">
          {by.map(({ m, count, cents }) => {
            const on = method === m
            const badge = METHOD_BADGE[m]
            return (
              <button
                key={m}
                type="button"
                aria-pressed={on}
                onClick={() => onMethod(on ? 'all' : m)}
                className={`flex min-h-20 min-w-0 flex-col justify-center rounded-xl px-4 py-2.5 text-left transition-colors ${
                  on ? 'bg-blue-50 ring-2 ring-blue-500' : method !== 'all' ? 'opacity-60 hover:bg-slate-50 hover:opacity-100' : 'hover:bg-slate-50'
                }`}
              >
                <span className="flex items-center gap-2 text-[15px] font-semibold text-slate-700">
                  <span className={`grid size-7 shrink-0 place-items-center rounded-lg ${badge.cls}`} aria-hidden><Icon className="h-4 w-4">{badge.icon}</Icon></span>
                  <span className="truncate">{METHOD_LABEL[m]}</span>
                  {on && <Icon className="ml-auto h-4 w-4 shrink-0 text-blue-600">{I.tick}</Icon>}
                </span>
                <span className="mt-1 truncate text-xl font-bold tabular-nums text-slate-900">{formatPeso(cents)}</span>
                <span className="truncate text-xs text-slate-500">{plural(count, 'payment')}<span className="hidden xl:inline"> · {METHOD_NOTE[m]}</span></span>
              </button>
            )
          })}
        </div>
      </div>

      {total > 0 && (
        <div className="mt-4 flex h-2 gap-0.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
          {by.map(({ m, cents }) => cents > 0 && <span key={m} className={METHOD_BAR[m]} style={{ width: `${(cents / total) * 100}%` }} />)}
        </div>
      )}
      <p className="mt-2 text-sm text-slate-500">
        {method === 'all' ? 'Tap a method to show only its payments.' : <>Showing <b className="text-slate-700">{METHOD_LABEL[method]}</b> only. Tap it again to show every method.</>}
      </p>
    </section>
  )
}

/** One payment: when · who paid, for which order (and its reference) · how · who received it · how much. Opens the order. */
function PaymentRowLink({ p, showBy }: { p: PaymentHistoryRow; showBy: boolean }) {
  const badge = METHOD_BADGE[p.method]
  return (
    <li>
      <Link
        to={`/orders/${p.order_id}`}
        className={`grid min-h-18 items-center gap-x-5 px-5 py-3 outline-none transition-colors hover:bg-slate-50 focus-visible:bg-blue-50 active:bg-slate-100 ${
          showBy ? 'grid-cols-[5rem_minmax(0,1fr)_7.5rem_8rem_1.25rem] lg:grid-cols-[5rem_minmax(0,1fr)_7.5rem_9rem_8rem_1.25rem]' : 'grid-cols-[5rem_minmax(0,1fr)_7.5rem_8rem_1.25rem]'
        }`}
      >
        <span className="text-sm tabular-nums text-slate-500">{paymentTime(p.paid_at)}</span>
        <span className="min-w-0">
          <span className="block truncate text-base font-semibold text-slate-900">{p.customer_name}</span>
          <span className="block truncate text-sm text-slate-500">
            <span className="font-medium tabular-nums text-slate-600">#{p.order_number}</span>
            {p.reference && <> · Ref. <span className="font-mono text-[13px]">{p.reference}</span></>}
            {showBy && <span className="lg:hidden"> · {p.user_name}</span>}
          </span>
        </span>
        <span className={`inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-full py-1 pl-2 pr-3 text-sm font-semibold ${badge.cls}`}>
          <Icon className="h-4 w-4">{badge.icon}</Icon>{METHOD_LABEL[p.method]}
        </span>
        {showBy && <span className="hidden truncate text-sm text-slate-600 lg:block">{p.user_name}</span>}
        <span className="text-right text-lg font-bold tabular-nums text-slate-900">{formatPeso(p.amount_cents)}</span>
        <Icon className="h-5 w-5 text-slate-300">{I.chevron}</Icon>
      </Link>
    </li>
  )
}
