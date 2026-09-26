import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { OrderListRow } from '../db/orderQueries'
import { formatPeso, formatPesoShort } from '../lib/money'
import type { OrderStatus } from '../types'
import { StatusBadge } from './Badges'
import { I, Icon } from './Icons'

/** Icon per stage, so the tile says where the order is before the badge is read. */
const TILE: Record<OrderStatus, { icon: ReactNode; cls: string }> = {
  received: { icon: I.orders, cls: 'bg-slate-100 text-slate-500' },
  washing: { icon: I.washer, cls: 'bg-blue-50 text-blue-600' },
  drying: { icon: I.washer, cls: 'bg-blue-100 text-blue-700' },
  ready: { icon: I.bag, cls: 'bg-blue-600 text-white' },
  released: { icon: I.check, cls: 'bg-emerald-50 text-emerald-600' },
  cancelled: { icon: I.x, cls: 'bg-slate-100 text-slate-400' },
}

/** "Today, 2:30 PM", "Yesterday, 9:05 AM" or "Sep 20, 2:30 PM" (year only when it differs). */
export function when(iso: string) {
  const d = new Date(iso)
  const t = d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
  const today = new Date()
  const yest = new Date()
  yest.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return `Today, ${t}`
  if (d.toDateString() === yest.toDateString()) return `Yesterday, ${t}`
  return `${d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', ...(d.getFullYear() === today.getFullYear() ? {} : { year: 'numeric' }) })}, ${t}`
}

/**
 * Order summary card: who, how much, where it is, and what is still owed. `showCustomer={false}` for
 * lists already scoped to one customer (leads with the items instead).
 */
export function OrderCard({ o, showCustomer = true }: { o: OrderListRow; showCustomer?: boolean }) {
  const tile = TILE[o.status]
  const title = showCustomer ? o.customer_name : o.items || `Order #${o.order_number}`
  const cancelled = o.status === 'cancelled'

  return (
    <Link
      to={`/orders/${o.id}`}
      className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-[0_1px_3px_rgba(15,23,42,0.05)] transition active:bg-slate-50 sm:p-4"
    >
      <span className={`grid size-11 shrink-0 place-items-center self-start rounded-xl ${tile.cls}`} aria-hidden>
        <Icon className="h-5 w-5">{tile.icon}</Icon>
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className={`min-w-0 truncate font-semibold ${cancelled ? 'text-slate-500 line-through decoration-slate-300' : 'text-slate-900'}`}>{title}</span>
          <span className={`shrink-0 font-bold tabular-nums ${cancelled ? 'text-slate-400' : 'text-slate-900'}`}>{formatPeso(o.total_cents)}</span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2 text-xs">
          <span className="min-w-0 truncate text-slate-500">
            <span className="font-medium text-slate-700">#{o.order_number}</span> · {when(o.received_at)}
          </span>
          {/* Money owed is the question at the counter: say how much, not just "partial". */}
          {!cancelled && (
            o.payment_status === 'paid'
              ? <span className="shrink-0 font-semibold text-emerald-700">Paid</span>
              : <span className={`shrink-0 rounded-full px-2 py-0.5 font-semibold tabular-nums ${o.payment_status === 'unpaid' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}>
                  {formatPesoShort(o.balance_cents)} due
                </span>
          )}
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <StatusBadge status={o.status} />
          {o.machine_code && (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold tabular-nums text-slate-700">
              <Icon className="h-3.5 w-3.5">{I.washer}</Icon>{o.machine_code}
            </span>
          )}
          {showCustomer && o.items && <span className="min-w-0 truncate text-xs text-slate-400">{o.items}</span>}
        </div>
      </div>
      <Icon className="-mr-1 h-5 w-5 shrink-0 text-slate-300">{I.chevron}</Icon>
    </Link>
  )
}
