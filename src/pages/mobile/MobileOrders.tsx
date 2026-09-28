import { useState, type ReactNode } from 'react'
import { AppHeader } from '../../components/AppHeader'
import { Chip } from '../../components/Chip'
import { DateInput, Select } from '../../components/Controls'
import { I, Icon } from '../../components/Icons'
import { OrderCard } from '../../components/OrderCard'
import { ScanQrButton } from '../../components/ScanOrder'
import { fieldCls as field } from '../../components/ui'
import { fmtDate, ORDER_LIMIT as LIMIT, ORDER_STATUSES as STATUSES, PAY_LABEL, statusFilterLabel, useOrderList, type PayFilter as Pay } from '../../hooks/useOrderList'
import { STATUS_LABEL } from '../../lib/orders'

/** Removable chip for a filter set in the filter panel, so it stays visible once the panel is closed. */
function ActiveFilter({ children, onClear }: { children: ReactNode; onClear: () => void }) {
  return (
    <span className="inline-flex min-h-9 items-center gap-1 rounded-full bg-blue-50 pl-3 text-sm font-medium text-blue-800">
      {children}
      <button type="button" onClick={onClear} aria-label={`Remove filter ${typeof children === 'string' ? children : ''}`} className="grid size-9 place-items-center rounded-full active:bg-blue-100">
        <Icon className="h-4 w-4">{I.x}</Icon>
      </button>
    </span>
  )
}

/** Phone Orders: search, status chips and a filter panel over a day-grouped card list (hooks/useOrderList.ts). */
export default function MobileOrders() {
  const { text, setText, status, setStatus, pay, setPay, date, setDate, rows, counts, allCount, extraFilters, filtered, clearAll, days } = useOrderList()
  const [showFilters, setShowFilters] = useState(false)

  const chip = (label: string, n: number | null | undefined) => (n == null ? label : `${label} ${n}`)

  return (
    <div className="mx-auto max-w-4xl space-y-4 pb-6">
      <div className="md:hidden"><AppHeader /></div>

      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Orders</h1>
          <p className="mt-1 text-sm text-slate-500">Each order shows its next step</p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Icon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400">{I.search}</Icon>
            <input
              className={`${field} pl-12 pr-12`}
              type="search"
              enterKeyHint="search"
              aria-label="Search orders"
              placeholder="Name, phone or order #"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            {text && (
              <button type="button" onClick={() => setText('')} aria-label="Clear search" className="absolute right-1 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full text-slate-400 active:bg-slate-100">
                <Icon className="h-5 w-5">{I.x}</Icon>
              </button>
            )}
          </div>
          <ScanQrButton
            iconOnly
            className="grid w-13 shrink-0 place-items-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-600/30 active:bg-blue-700"
          />
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            aria-label={extraFilters ? `More filters, ${extraFilters} on` : 'More filters'}
            aria-expanded={showFilters}
            className={`relative grid w-13 shrink-0 place-items-center rounded-xl border transition-colors ${
              showFilters || extraFilters ? 'border-blue-200 bg-blue-50 text-blue-600' : 'border-slate-200 bg-white text-slate-600 active:bg-slate-50'
            }`}
          >
            <Icon className="h-5 w-5">{I.sliders}</Icon>
            {extraFilters > 0 && (
              <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-blue-600 px-1 text-[11px] font-bold text-white ring-2 ring-slate-100">
                {extraFilters}
              </span>
            )}
          </button>
        </div>

        {showFilters && (
          <div className="grid animate-reveal grid-cols-2 gap-2 rounded-2xl border border-slate-200/80 bg-white p-3">
            <label className="text-xs font-medium text-slate-500">
              Payment
              <span className="mt-1 block">
                <Select className={field} value={pay} onChange={(e) => setPay(e.target.value as Pay)}>
                  <option value="">All payments</option>
                  {(Object.keys(PAY_LABEL) as Exclude<Pay, ''>[]).map((k) => <option key={k} value={k}>{PAY_LABEL[k]}</option>)}
                </Select>
              </span>
            </label>
            <label className="text-xs font-medium text-slate-500">
              Date received
              <span className="mt-1 block">
                <DateInput className={field} value={date} onChange={(e) => setDate(e.target.value)} />
              </span>
            </label>
            <button type="button" onClick={() => setShowFilters(false)} className="col-span-2 min-h-11 rounded-xl bg-slate-100 text-sm font-semibold text-slate-700 active:bg-slate-200">
              Done
            </button>
          </div>
        )}

        <div role="tablist" aria-label="Order status" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none md:mx-0 md:px-0">
          <Chip active={!status} onClick={() => setStatus('')}>{chip('All', allCount)}</Chip>
          {STATUSES.map((s) => (
            <Chip key={s} active={status === s} onClick={() => setStatus(s)}>{chip(s === 'ready' ? 'Ready for Pickup' : STATUS_LABEL[s], counts ? counts[s] ?? 0 : null)}</Chip>
          ))}
        </div>

        {/* Panel filters stay visible (and removable) with the panel closed */}
        {!showFilters && extraFilters > 0 && (
          <div className="flex flex-wrap gap-2">
            {pay && <ActiveFilter onClear={() => setPay('')}>{PAY_LABEL[pay]}</ActiveFilter>}
            {date && <ActiveFilter onClear={() => setDate('')}>{`Received ${fmtDate(date)}`}</ActiveFilter>}
          </div>
        )}
      </div>

      {rows === null ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading orders">
          {[0, 1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-200/60" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-slate-200/80 bg-white px-6 py-12 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-blue-50 text-blue-500">
            <Icon className="h-7 w-7">{filtered ? I.search : I.orders}</Icon>
          </span>
          <p className="mt-3 font-semibold text-slate-900">{filtered ? 'No matching orders' : 'No orders yet'}</p>
          <p className="mt-1 text-sm text-slate-500">
            {filtered ? 'Try a different search, status or filter.' : 'Tap New order below to take the first one.'}
          </p>
          {filtered && (
            <button type="button" onClick={clearAll} className="mt-4 min-h-11 rounded-xl px-5 font-semibold text-blue-700 active:bg-blue-50">Clear all filters</button>
          )}
        </div>
      ) : (
        <>
          <div className="flex min-h-9 items-center justify-between gap-3 px-1" aria-live="polite">
            <p className="text-sm text-slate-500">
              <b className="font-semibold text-slate-900">{rows.length >= LIMIT ? `Latest ${LIMIT}` : rows.length}</b> order{rows.length === 1 ? '' : 's'}
              {status && <> · {statusFilterLabel(status)}</>}
            </p>
            {filtered && (
              <button type="button" onClick={clearAll} className="-mr-2 min-h-11 rounded-lg px-2 text-sm font-semibold text-blue-700 active:bg-blue-50">Clear all</button>
            )}
          </div>
          {days.map((g) => (
            <section key={g.key} aria-label={g.label}>
              {/* Sticks while its day scrolls by */}
              <h2 className="sticky top-0 z-10 -mx-4 flex items-baseline justify-between bg-slate-100/95 px-5 py-2 backdrop-blur md:-mx-6 md:px-7">
                <span className="text-sm font-semibold text-slate-700">{g.label}</span>
                <span className="text-xs tabular-nums text-slate-500">{g.rows.length}</span>
              </h2>
              <ul className="mt-1 grid gap-2.5 lg:grid-cols-2">
                {g.rows.map((o) => <li key={o.id} className="min-w-0"><OrderCard o={o} showNext /></li>)}
              </ul>
            </section>
          ))}
          {rows.length >= LIMIT && (
            <p className="px-1 text-center text-xs text-slate-500">Showing the latest {LIMIT}. Search or pick a date to find older orders.</p>
          )}
        </>
      )}
    </div>
  )
}
