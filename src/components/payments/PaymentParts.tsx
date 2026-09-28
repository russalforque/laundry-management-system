import type { ReactNode } from 'react'
import { Chip } from '../Chip'
import { I, Icon } from '../Icons'
import { card } from '../Manage'
import type { PaymentHistoryRow } from '../../db/payments'
import { METHODS, periodLabel, plural, ymd, type MethodFilter } from '../../hooks/usePaymentList'
import { formatPeso } from '../../lib/money'
import { METHOD_LABEL } from '../../lib/orders'
import type { PaymentMethod } from '../../types'

/** Payments pieces shared by the phone and tablet / desktop Payments pages (hooks/usePaymentList.ts). */

const METHOD_DOT: Record<PaymentMethod, string> = { cash: 'bg-emerald-500', gcash: 'bg-blue-500', other: 'bg-slate-400' }
/** Icon + tint per method, so the method reads without relying on colour alone. */
export const METHOD_BADGE: Record<PaymentMethod, { icon: ReactNode; cls: string }> = {
  cash: { icon: I.peso, cls: 'bg-emerald-50 text-emerald-600' },
  gcash: { icon: I.phone, cls: 'bg-blue-50 text-blue-600' },
  other: { icon: I.wallet, cls: 'bg-slate-100 text-slate-500' },
}

/** Today / Yesterday / All dates presets plus a chip that opens the device's own date picker. */
export function DateChips({ date, onChange }: { date: string; onChange: (d: string) => void }) {
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
          custom ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 active:bg-slate-50'
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
export function PaymentSummary({ rows, period, method, onMethod }: {
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
                on ? 'bg-white ring-2 ring-blue-500' : 'hover:bg-white active:bg-white'
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
