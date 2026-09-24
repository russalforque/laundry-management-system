import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PaymentBadge, StatusBadge } from '../components/Badges'
import { inputCls, primaryBtn } from '../components/ui'
import { listOrders } from '../db/orderQueries'
import { formatDateTime, formatPeso } from '../lib/money'
import { STATUS_FLOW, STATUS_LABEL } from '../lib/orders'
import type { OrderRow, OrderStatus, PaymentStatus } from '../types'

export default function Orders() {
  const [text, setText] = useState('')
  const [status, setStatus] = useState<OrderStatus | ''>('')
  const [pay, setPay] = useState<PaymentStatus | ''>('')
  const [date, setDate] = useState('')
  const [rows, setRows] = useState<OrderRow[]>([])

  const load = useCallback(
    () => listOrders({ text, status, paymentStatus: pay, date }).then(setRows),
    [text, status, pay, date],
  )
  useEffect(() => { load() }, [load])

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-slate-900">Orders</h1>
        <Link to="/orders/new" className={primaryBtn}>+ New Laundry Order</Link>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        <input className={`${inputCls} col-span-2 md:col-span-4`} type="search" placeholder="Search order number or customer" value={text} onChange={(e) => setText(e.target.value)} />
        <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as OrderStatus | '')} aria-label="Order status">
          <option value="">All statuses</option>
          {[...STATUS_FLOW, 'cancelled' as const].map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <select className={inputCls} value={pay} onChange={(e) => setPay(e.target.value as PaymentStatus | '')} aria-label="Payment status">
          <option value="">All payments</option>
          <option value="unpaid">Unpaid</option>
          <option value="partial">Partial</option>
          <option value="paid">Paid</option>
        </select>
        <input className={`${inputCls} col-span-2`} type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date received" />
      </div>

      <ul className="divide-y divide-slate-100 rounded-xl bg-white shadow-sm">
        {rows.map((o) => (
          <li key={o.id}>
            <Link to={`/orders/${o.id}`} className="flex items-center justify-between gap-3 p-4 active:bg-slate-50">
              <div className="min-w-0">
                <div className="font-semibold">{o.order_number}</div>
                <div className="truncate text-sm text-slate-600">{o.customer_name}</div>
                <div className="text-xs text-slate-400">{formatDateTime(o.received_at)}</div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <div className="font-semibold">{formatPeso(o.total_cents)}</div>
                <StatusBadge status={o.status} />
                <PaymentBadge status={o.payment_status} />
              </div>
            </Link>
          </li>
        ))}
        {rows.length === 0 && <li className="p-6 text-center text-slate-500">No orders found.</li>}
      </ul>
    </div>
  )
}
