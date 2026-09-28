import { useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { DateInput, Select } from '../../components/Controls'
import { I, Icon } from '../../components/Icons'
import { NextActionTag } from '../../components/OrderCard'
import { ScanQrButton } from '../../components/ScanOrder'
import { bigPrimary, StateMessage } from '../../components/desktop-tablet/orderParts'
import { btnSecondary, Owed, StatusPill } from '../../components/desktop-tablet/ui'
import type { OrderListRow } from '../../db/orderQueries'
import { ORDER_LIMIT, PAY_LABEL, statusFilterLabel, useOrderList, type PayFilter, type StatusFilter } from '../../hooks/useOrderList'
import { useNavAccess } from '../../layouts/navigation'
import { formatPeso, formatTime } from '../../lib/money'
import { nextAction, PROCESSING } from '../../lib/orders'

/** The tabs, in the order laundry moves through the shop. */
const TABS: Exclude<StatusFilter, ''>[] = ['received', PROCESSING, 'ready', 'released', 'cancelled']

const field = 'min-h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-[15px] text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'

/**
 * Orders on tablets (landscape first) and desktops: one full-width list built for scanning. Each row reads left to
 * right as who and what → where it is and what's next → when → how much and what's owed, and opens the order.
 * Search, status tabs and filters come from hooks/useOrderList.ts, the same as the phone list.
 */
export default function Orders() {
  const list = useOrderList()
  const { text, setText, status, setStatus, pay, setPay, date, setDate, rows, loadError, counts, allCount, extraFilters, filtered, clearAll, days, queue, reload } = list
  const { can } = useNavAccess()
  const [params] = useSearchParams()
  const [filtersOpen, setFiltersOpen] = useState(extraFilters > 0)

  // Older links selected an order in a side pane (?id=); orders open on their own page now.
  const legacyId = Number(params.get('id'))
  if (legacyId) return <Navigate to={`/orders/${legacyId}`} replace />

  const tabCount = (s: Exclude<StatusFilter, ''>) => (counts ? counts[s] ?? 0 : null)
  const newOrder = can('orders.manage') && (
    <Link to="/orders/new" className={bigPrimary}><Icon className="h-5 w-5">{I.plus}</Icon>New Order</Link>
  )

  return (
    <div className="mx-auto flex h-full min-h-0 max-w-6xl flex-col gap-5">
      {/* ── Header: where you are, and the two ways in ─────────── */}
      <header className="flex shrink-0 items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Orders</h1>
          <p className="mt-0.5 truncate text-[15px] text-slate-500" aria-live="polite">
            {rows === null ? 'Loading orders…'
              : `${rows.length >= ORDER_LIMIT ? `Latest ${ORDER_LIMIT}` : rows.length} ${filtered ? 'matching ' : ''}order${rows.length === 1 ? '' : 's'}${queue ? ' · oldest first, the order to work in' : ''}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <ScanQrButton label="Scan QR" className={`${btnSecondary} min-h-14 px-5 text-base`} />
          {newOrder}
        </div>
      </header>

      {/* ── Search and filters ─────────────────────────────── */}
      <div className="shrink-0 space-y-3">
        <div className="flex gap-3">
          <div className="relative min-w-0 flex-1">
            <Icon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400">{I.search}</Icon>
            <input
              className={`${field} min-h-14 pl-12 pr-12 text-base`}
              type="search"
              enterKeyHint="search"
              aria-label="Search orders"
              placeholder="Search customer, phone or order #"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            {text && (
              <button type="button" onClick={() => setText('')} aria-label="Clear search" className="absolute right-2 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full text-slate-400 hover:bg-slate-100">
                <Icon className="h-5 w-5">{I.x}</Icon>
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            aria-controls="order-filters"
            className={`inline-flex min-h-14 shrink-0 items-center gap-2 rounded-xl border px-5 text-base font-semibold transition-colors ${
              filtersOpen || extraFilters ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Icon className="h-5 w-5">{I.sliders}</Icon>Filter
            {extraFilters > 0 && <span className="grid size-6 place-items-center rounded-full bg-blue-600 text-xs font-bold text-white">{extraFilters}</span>}
          </button>
        </div>

        {filtersOpen && (
          <div id="order-filters" className="flex animate-reveal flex-wrap items-end gap-3 motion-reduce:animate-none">
            <label className="w-60 text-sm font-medium text-slate-600">
              Payment
              <Select className={`${field} mt-1`} value={pay} onChange={(e) => setPay(e.target.value as PayFilter)}>
                <option value="">All payments</option>
                {(Object.keys(PAY_LABEL) as Exclude<PayFilter, ''>[]).map((k) => <option key={k} value={k}>{PAY_LABEL[k]}</option>)}
              </Select>
            </label>
            <label className="w-60 text-sm font-medium text-slate-600">
              Date received
              <DateInput className={`${field} mt-1`} value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            {extraFilters > 0 && (
              <button type="button" onClick={() => { setPay(''); setDate('') }} className="min-h-12 rounded-xl px-4 text-sm font-semibold text-blue-700 hover:bg-blue-50">
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* Status tabs: what tapping each will show, with its count */}
        <div role="tablist" aria-label="Order status" className="flex gap-1 overflow-x-auto border-b border-slate-200 scrollbar-none">
          <Tab active={!status} onClick={() => setStatus('')} label="All" count={allCount} />
          {TABS.map((s) => (
            <Tab key={s} active={status === s} onClick={() => setStatus(s)} label={s === 'ready' ? 'Ready' : statusFilterLabel(s)} count={tabCount(s)} />
          ))}
        </div>
      </div>

      {/* ── The list ───────────────────────────────────────── */}
      <section aria-label="Order list" className="-mx-2 min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-4">
        {loadError && rows === null ? (
          <StateMessage
            icon={I.info}
            title="Couldn't load orders"
            text="Something went wrong reading the order list. Check the device, then try again."
            action={<button type="button" onClick={reload} className={bigPrimary}><Icon className="h-5 w-5">{I.refresh}</Icon>Try again</button>}
          />
        ) : rows === null ? (
          <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white" aria-busy="true" aria-label="Loading orders">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-6 px-5 py-4 motion-safe:animate-pulse">
                <div className="flex-1 space-y-2"><div className="h-4 w-48 rounded bg-slate-200" /><div className="h-3 w-72 rounded bg-slate-100" /></div>
                <div className="h-7 w-28 rounded-full bg-slate-100" />
                <div className="h-5 w-20 rounded bg-slate-200" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          filtered ? (
            <StateMessage
              icon={I.search}
              title={text.trim() ? `No orders match “${text.trim()}”` : 'No orders here'}
              text={text.trim() ? 'Check the spelling, or search by phone number or order number (e.g. 125).' : 'Nothing matches this status and filter. Try another tab or clear the filters.'}
              action={<button type="button" onClick={() => { clearAll(); setFiltersOpen(false) }} className={`${btnSecondary} min-h-12 px-5 text-base`}>Show all orders</button>}
            />
          ) : (
            <StateMessage icon={I.orders} title="No orders yet" text="New orders appear here as soon as they're taken." action={newOrder || undefined} />
          )
        ) : (
          <>
            <ul aria-label="Orders" className="space-y-5">
              {days.map((g) => (
                <li key={g.key}>
                  <h2 className="sticky top-0 z-10 bg-slate-100/95 px-1 pb-2 pt-1 text-sm font-semibold text-slate-600 backdrop-blur">
                    {g.label} <span className="font-normal text-slate-400">· {g.rows.length} order{g.rows.length === 1 ? '' : 's'}</span>
                  </h2>
                  <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200/70 bg-white">
                    {g.rows.map((o) => <OrderRowLink key={o.id} o={o} />)}
                  </ul>
                </li>
              ))}
            </ul>
            {rows.length >= ORDER_LIMIT && (
              <p className="px-4 py-4 text-center text-sm text-slate-500">Showing the latest {ORDER_LIMIT}. Search or pick a date to find older orders.</p>
            )}
          </>
        )}
      </section>
    </div>
  )
}

/** Underlined tab: 48px tall, the count beside the label. */
function Tab({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number | null }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`-mb-px inline-flex min-h-12 shrink-0 items-center gap-2 whitespace-nowrap border-b-[3px] px-4 text-[15px] transition-colors ${
        active ? 'border-blue-600 font-semibold text-blue-700' : 'border-transparent font-medium text-slate-600 hover:text-slate-900'
      }`}
    >
      {label}
      {count != null && (
        <span className={`min-w-6 rounded-full px-1.5 py-0.5 text-center text-xs font-semibold tabular-nums ${active ? 'bg-blue-600 text-white' : 'bg-slate-200/70 text-slate-600'}`}>{count}</span>
      )}
    </button>
  )
}

/**
 * One order, one row, four columns: customer and what's in it · status and the next step ·
 * time received · total and what's owed. The whole row opens the order.
 */
function OrderRowLink({ o }: { o: OrderListRow }) {
  const cancelled = o.status === 'cancelled'
  const next = nextAction(o)
  return (
    <li>
      <Link
        to={`/orders/${o.id}`}
        className="grid min-h-20 grid-cols-[minmax(0,1fr)_12rem_7.5rem_1.25rem] items-center gap-x-5 px-5 py-3.5 outline-none transition-colors hover:bg-slate-50 focus-visible:bg-blue-50 active:bg-slate-100 lg:grid-cols-[minmax(0,1fr)_13rem_5.5rem_8rem_1.25rem]"
      >
        {/* Who and what */}
        <span className="min-w-0">
          <span className={`block truncate text-base font-semibold ${cancelled ? 'text-slate-500 line-through decoration-slate-300' : 'text-slate-900'}`}>{o.customer_name}</span>
          <span className="mt-0.5 block truncate text-sm text-slate-500">
            <span className="font-semibold tabular-nums text-slate-700">#{o.order_number}</span>
            {o.items ? ` · ${o.items}` : ' · No items'}
            <span className="lg:hidden"> · {formatTime(o.received_at)}</span>
          </span>
        </span>

        {/* Where it is, and what's next */}
        <span className="flex min-w-0 flex-col items-start gap-1">
          <StatusPill status={o.status} />
          {next.kind !== 'done' && <NextActionTag a={next} className="max-w-full" />}
        </span>

        {/* When */}
        <span className="hidden text-sm tabular-nums text-slate-500 lg:block">{formatTime(o.received_at)}</span>

        {/* How much, and what's owed */}
        <span className="flex flex-col items-end gap-1">
          <span className={`text-base font-bold tabular-nums ${cancelled ? 'text-slate-400' : 'text-slate-900'}`}>{formatPeso(o.total_cents)}</span>
          <Owed status={o.status} pay={o.payment_status} balance={o.balance_cents} />
        </span>

        <Icon className="h-5 w-5 text-slate-300">{I.chevron}</Icon>
      </Link>
    </li>
  )
}
