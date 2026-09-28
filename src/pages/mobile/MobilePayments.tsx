import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AppHeader } from '../../components/AppHeader'
import { Select } from '../../components/Controls'
import { I, Icon } from '../../components/Icons'
import { card, EmptyCard, field } from '../../components/Manage'
import { DateChips, METHOD_BADGE, PaymentSummary } from '../../components/payments/PaymentParts'
import { fieldCls } from '../../components/ui'
import type { PaymentHistoryRow } from '../../db/payments'
import { PAYMENT_LIMIT as LIMIT, paymentTime as time, periodLabel, plural, usePaymentList } from '../../hooks/usePaymentList'
import { formatPeso } from '../../lib/money'
import { METHOD_LABEL } from '../../lib/orders'

function PaymentRow({ p, showEmployee }: { p: PaymentHistoryRow; showEmployee: boolean }) {
  const badge = METHOD_BADGE[p.method]
  const meta = [p.reference && `Ref ${p.reference}`, showEmployee && `by ${p.user_name}`].filter(Boolean).join(' · ')
  return (
    <Link to={`/orders/${p.order_id}`} className="flex min-h-18 items-center gap-3 px-4 py-3 active:bg-slate-50">
      <span className={`grid size-10 shrink-0 place-items-center rounded-full ${badge.cls}`} aria-hidden>
        <Icon className="h-5 w-5">{badge.icon}</Icon>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-slate-900">{p.customer_name}</span>
        <span className="mt-0.5 block truncate text-sm tabular-nums text-slate-500">#{p.order_number} · {time(p.paid_at)}</span>
        {meta && <span className="mt-0.5 block truncate text-xs text-slate-400">{meta}</span>}
      </span>
      <span className="shrink-0 text-right">
        <span className="block font-bold tabular-nums text-slate-900">{formatPeso(p.amount_cents)}</span>
        <span className="mt-0.5 block text-xs font-medium text-slate-500">{METHOD_LABEL[p.method]}</span>
      </span>
      <Icon className="-mr-1 h-4 w-4 shrink-0 text-slate-300">{I.chevron}</Icon>
    </Link>
  )
}

function LoadingState() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading payments">
      <div className="h-52 animate-pulse rounded-2xl bg-slate-200/60" />
      <div className={`${card} divide-y divide-slate-100`}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-4">
            <span className="size-10 animate-pulse rounded-full bg-slate-200/70" />
            <span className="flex-1 space-y-2">
              <span className="block h-3.5 w-2/5 animate-pulse rounded bg-slate-200/70" />
              <span className="block h-3 w-1/4 animate-pulse rounded bg-slate-200/60" />
            </span>
            <span className="h-4 w-16 animate-pulse rounded bg-slate-200/70" />
          </div>
        ))}
      </div>
    </div>
  )
}

/** Phone Payments: search, employee filter panel, date chips, the period summary and day-grouped payments. */
export default function MobilePayments() {
  const {
    all, date, setDate, rows, error, load, search, setSearch, method, setMethod, employee, setEmployee,
    employees, base, shown, shownTotal, days, filtered, clear, narrowing,
  } = usePaymentList()
  const [showFilters, setShowFilters] = useState(false)

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-6">
      <AppHeader />
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Payments</h1>
        <p className="mt-1 text-sm text-slate-500">{all ? 'Payments received by every employee' : 'Payments you received'}</p>
      </header>

      {/* Find: search (+ employee filter for admins), then date presets */}
      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Icon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400">{I.search}</Icon>
            <input
              type="search" enterKeyHint="search" aria-label="Search payments" placeholder="Order #, customer or reference"
              className={`${field} pr-12`} value={search} onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-1 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full text-slate-400 active:bg-slate-100">
                <Icon className="h-5 w-5">{I.x}</Icon>
              </button>
            )}
          </div>
          {all && (
            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              aria-label="Filter by employee"
              aria-expanded={showFilters}
              className={`relative grid w-13 shrink-0 place-items-center rounded-xl border transition-colors ${
                showFilters ? 'border-blue-200 bg-blue-50 text-blue-600' : 'border-slate-200 bg-white text-slate-600 active:bg-slate-50'
              }`}
            >
              <Icon className="h-5 w-5">{I.users}</Icon>
              {employee && <span className="absolute -right-1 -top-1 size-3.5 rounded-full border-2 border-slate-100 bg-blue-600" aria-hidden />}
            </button>
          )}
        </div>

        {all && showFilters && (
          <label className={`${card} block animate-reveal p-3 text-xs font-medium text-slate-500`}>
            Received by
            <span className="mt-1 block">
              <Select className={fieldCls} value={employee} onChange={(e) => setEmployee(e.target.value)}>
                <option value="">All employees</option>
                {employees.map((n) => <option key={n} value={n}>{n}</option>)}
              </Select>
            </span>
          </label>
        )}

        <DateChips date={date} onChange={setDate} />
      </div>

      {error ? (
        <div className={`${card} pb-6`}>
          <EmptyCard icon={I.wallet} title="Couldn't load payments" text="Please try again. If this keeps happening, close and reopen the app." />
          <div className="flex justify-center">
            <button type="button" onClick={load} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-5 font-semibold text-blue-700 active:bg-blue-50">
              <Icon className="h-5 w-5">{I.refresh}</Icon>Try again
            </button>
          </div>
        </div>
      ) : rows === null ? (
        <LoadingState />
      ) : base.length === 0 ? (
        <div className={`${card} pb-6`}>
          <EmptyCard
            icon={I.wallet}
            title={filtered ? 'No matching payments' : 'No payments yet'}
            text={filtered ? 'Try another search, date or employee.' : all ? 'Payments appear here once employees collect them.' : 'Payments you collect appear here.'}
          />
          {filtered && (
            <div className="flex justify-center">
              <button type="button" onClick={clear} className="min-h-11 rounded-xl px-5 font-semibold text-blue-700 active:bg-blue-50">Clear filters</button>
            </div>
          )}
        </div>
      ) : (
        <>
          <PaymentSummary rows={base} period={periodLabel(date)} method={method} onMethod={setMethod} />

          {/* Result line: what is listed, and one tap to undo the narrowing */}
          <div className="flex min-h-11 items-center justify-between gap-3 px-1">
            <p className="min-w-0 truncate text-sm text-slate-500" aria-live="polite">
              <b className="font-semibold text-slate-900">{plural(shown.length, 'payment')}</b>
              {narrowing && <> · {narrowing}</>}
              {narrowing && <> · <span className="tabular-nums">{formatPeso(shownTotal)}</span></>}
            </p>
            {filtered && (
              <button type="button" onClick={clear} className="-mr-2 min-h-11 shrink-0 rounded-lg px-3 text-sm font-semibold text-blue-700 active:bg-blue-50">
                Clear all
              </button>
            )}
          </div>

          {shown.length === 0 ? (
            <div className={`${card} pb-6`}>
              <EmptyCard icon={I.wallet} title={`No ${METHOD_LABEL[method]} payments`} text="Tap the method again to see every payment." />
              <div className="flex justify-center">
                <button type="button" onClick={() => setMethod('all')} className="min-h-11 rounded-xl px-5 font-semibold text-blue-700 active:bg-blue-50">Show all methods</button>
              </div>
            </div>
          ) : (
            days.map((g) => (
              <section key={g.key} aria-label={g.label}>
                {/* Sticks to the top while its day scrolls by, so the date stays in view on long lists. */}
                <h2 className="sticky top-0 z-10 -mx-4 flex items-baseline justify-between gap-3 bg-slate-100/95 px-5 py-2 backdrop-blur">
                  <span className="text-sm font-semibold text-slate-700">{g.label}</span>
                  <span className="text-xs tabular-nums text-slate-500">{plural(g.rows.length, 'payment')} · <b className="font-semibold text-slate-900">{formatPeso(g.total)}</b></span>
                </h2>
                <ul className={`${card} mt-1 divide-y divide-slate-100 overflow-hidden`}>
                  {g.rows.map((p) => <li key={p.id}><PaymentRow p={p} showEmployee={all} /></li>)}
                </ul>
              </section>
            ))
          )}

          {rows.length >= LIMIT && !date && (
            <p className="px-1 text-center text-xs text-slate-500">Showing the latest {LIMIT} payments. Pick a date to see older ones.</p>
          )}
        </>
      )}
    </div>
  )
}
