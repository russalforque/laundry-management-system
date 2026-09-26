import { AppHeader } from '../components/AppHeader'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Chip } from '../components/Chip'
import { Select } from '../components/Controls'
import { I, Icon } from '../components/Icons'
import { card, EmptyCard, field } from '../components/Manage'
import { fieldCls } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { listPayments, type PaymentHistoryRow } from '../db/payments'
import { formatPeso } from '../lib/money'
import { METHOD_LABEL } from '../lib/orders'
import type { PaymentMethod } from '../types'

/** Matches the default `limit` of listPayments; when hit, older payments are not shown. */
const LIMIT = 300

type MethodFilter = 'all' | PaymentMethod
const METHODS: PaymentMethod[] = ['cash', 'gcash', 'other']
const METHOD_DOT: Record<PaymentMethod, string> = { cash: 'bg-emerald-500', gcash: 'bg-blue-500', other: 'bg-slate-400' }
/** Icon + tint per method, so the method reads without relying on colour alone. */
const METHOD_BADGE: Record<PaymentMethod, { icon: ReactNode; cls: string }> = {
  cash: { icon: I.peso, cls: 'bg-emerald-50 text-emerald-600' },
  gcash: { icon: I.phone, cls: 'bg-blue-50 text-blue-600' },
  other: { icon: I.wallet, cls: 'bg-slate-100 text-slate-500' },
}

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** Local YYYY-MM-DD, `offset` days from today (the format listPayments' `date` expects). */
function ymd(offset = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** "Today", "Yesterday" or the full date, for the day group headers. */
function dayLabel(iso: string) {
  const d = new Date(iso).toDateString()
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  if (d === new Date().toDateString()) return 'Today'
  if (d === yesterday.toDateString()) return 'Yesterday'
  return new Date(iso).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

/** Label for the picked `date` filter ('' = every date). */
function periodLabel(date: string) {
  if (!date) return 'All dates'
  if (date === ymd()) return 'Today'
  if (date === ymd(-1)) return 'Yesterday'
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Today / Yesterday / All dates presets plus a chip that opens the phone's own date picker. */
function DateChips({ date, onChange }: { date: string; onChange: (d: string) => void }) {
  const today = ymd()
  const yesterday = ymd(-1)
  const custom = !!date && date !== today && date !== yesterday
  return (
    <div role="tablist" aria-label="Date paid" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none md:mx-0 md:px-0">
      <Chip active={date === today} onClick={() => onChange(today)}>Today</Chip>
      <Chip active={date === yesterday} onClick={() => onChange(yesterday)}>Yesterday</Chip>
      <Chip active={!date} onClick={() => onChange('')}>All dates</Chip>
      {/* The transparent native input covers the chip, so a tap anywhere opens the picker. */}
      <label
        className={`relative inline-flex min-h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 text-sm font-medium transition-colors ${
          custom ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30' : 'border border-slate-200 bg-white text-slate-600 active:bg-slate-50'
        }`}
      >
        <Icon className="h-4 w-4">{I.calendar}</Icon>
        {custom ? periodLabel(date) : 'Pick date'}
        <input
          type="date" aria-label="Pick a date" max={today} value={custom ? date : ''}
          onChange={(e) => onChange(e.target.value)}
          className="picker-input absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
    </div>
  )
}

/**
 * Total for the period plus one tile per method. The tiles double as the method filter:
 * tap to show only that method, tap again to show all.
 */
function Summary({ rows, period, method, onMethod }: {
  rows: PaymentHistoryRow[]; period: string; method: MethodFilter; onMethod: (m: MethodFilter) => void
}) {
  const total = rows.reduce((n, p) => n + p.amount_cents, 0)
  const by = METHODS.map((m) => {
    const list = rows.filter((p) => p.method === m)
    return { m, count: list.length, cents: list.reduce((n, p) => n + p.amount_cents, 0) }
  })
  return (
    <section aria-label="Payments summary" className={`${card} overflow-hidden`}>
      <div className="p-4 sm:p-5">
        <p className="flex items-center gap-2 text-sm font-medium text-slate-500">
          <Icon className="h-4 w-4 text-slate-400">{I.wallet}</Icon>Collected · {period}
        </p>
        <p className="mt-1 truncate text-4xl font-bold tabular-nums tracking-tight text-slate-900">{formatPeso(total)}</p>
        <p className="mt-1 text-sm text-slate-500">{plural(rows.length, 'payment')}</p>
        {total > 0 && (
          <div className="mt-4 flex h-2 gap-0.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
            {by.map(({ m, cents }) => cents > 0 && <span key={m} className={`${METHOD_DOT[m]} rounded-full`} style={{ width: `${(cents / total) * 100}%` }} />)}
          </div>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2 border-t border-slate-100 bg-slate-50/60 p-2">
        {by.map(({ m, count, cents }) => {
          const on = method === m
          return (
            <button
              key={m}
              type="button"
              aria-pressed={on}
              aria-label={`${METHOD_LABEL[m]}: ${formatPeso(cents)}, ${plural(count, 'payment')}. ${on ? 'Show all methods' : `Show ${METHOD_LABEL[m]} only`}`}
              onClick={() => onMethod(on ? 'all' : m)}
              className={`min-h-16 min-w-0 rounded-xl px-3 py-2 text-left transition-colors ${
                on ? 'bg-white ring-2 ring-blue-500' : 'active:bg-white'
              }`}
            >
              <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                <span className={`size-2 shrink-0 rounded-full ${METHOD_DOT[m]}`} />
                <span className="truncate">{METHOD_LABEL[m]}</span>
                {on && <Icon className="ml-auto h-3.5 w-3.5 shrink-0 text-blue-600">{I.tick}</Icon>}
              </span>
              <span className="mt-0.5 block truncate font-semibold tabular-nums text-slate-900">{formatPeso(cents)}</span>
              <span className="block text-xs tabular-nums text-slate-400">{plural(count, 'payment')}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

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

/** Payments received: Staff see the ones they collected, admins and managers see everyone's. */
export default function Payments() {
  const { can } = useAuth()
  const all = can('payments.viewAll')
  const [date, setDate] = useState('')
  const [rows, setRows] = useState<PaymentHistoryRow[] | null>(null)
  const [error, setError] = useState(false)
  const [search, setSearch] = useState('')
  const [method, setMethod] = useState<MethodFilter>('all')
  const [employee, setEmployee] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const load = useCallback(() => {
    setRows(null)
    setError(false)
    listPayments({ date: date || undefined })
      .then(setRows)
      .catch((e) => { console.error(e); setRows([]); setError(true) })
  }, [date])
  useEffect(load, [load])

  // Employee names come from the loaded payments, so managers can filter without access to the user list.
  const employees = useMemo(() => [...new Set((rows ?? []).map((p) => p.user_name))].sort(), [rows])

  // Search and employee narrow the list first; the summary tiles are taken from that, so they stay honest.
  const base = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (rows ?? []).filter((p) =>
      (!employee || p.user_name === employee) &&
      (!q || `${p.order_number} ${p.customer_name} ${p.reference}`.toLowerCase().includes(q)))
  }, [rows, search, employee])
  const shown = useMemo(() => (method === 'all' ? base : base.filter((p) => p.method === method)), [base, method])
  const shownTotal = useMemo(() => shown.reduce((n, p) => n + p.amount_cents, 0), [shown])

  // Rows arrive newest first, so consecutive grouping keeps the days in order.
  const days = useMemo(() => {
    const out: { key: string; label: string; rows: PaymentHistoryRow[]; total: number }[] = []
    for (const p of shown) {
      const key = new Date(p.paid_at).toDateString()
      let g = out[out.length - 1]
      if (!g || g.key !== key) out.push((g = { key, label: dayLabel(p.paid_at), rows: [], total: 0 }))
      g.rows.push(p)
      g.total += p.amount_cents
    }
    return out
  }, [shown])

  const filtered = !!date || !!search.trim() || method !== 'all' || !!employee
  const clear = () => { setDate(''); setSearch(''); setMethod('all'); setEmployee('') }
  // What narrows the list beyond the date chips, spelled out above the results.
  const narrowing = [method !== 'all' && METHOD_LABEL[method], employee && `by ${employee}`, search.trim() && `“${search.trim()}”`].filter(Boolean).join(' · ')

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-6">
      <div className="md:hidden"><AppHeader /></div>
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Payment History</h1>
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
          <label className={`${card} block p-3 text-xs font-medium text-slate-500`}>
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
          <EmptyCard icon={I.wallet} title="Couldn't load payments" text="Check the app and try again." />
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
          <Summary rows={base} period={periodLabel(date)} method={method} onMethod={setMethod} />

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
                <h2 className="sticky top-0 z-10 -mx-4 flex items-baseline justify-between gap-3 bg-slate-100/95 px-5 py-2 backdrop-blur md:-mx-6 md:px-7">
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
