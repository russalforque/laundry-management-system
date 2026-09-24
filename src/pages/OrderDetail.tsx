import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PaymentBadge, StatusBadge } from '../components/Badges'
import PaymentForm from '../components/PaymentForm'
import { secondaryBtn } from '../components/ui'
import { getOrderDetail, setOrderStatus } from '../db/orderQueries'
import { PRICING_UNIT } from '../db/services'
import { formatDateTime, formatPeso } from '../lib/money'
import { canChangeStatus, isFinal, nextStatus, STATUS_FLOW, STATUS_LABEL } from '../lib/orders'
import type { OrderStatus } from '../types'

type Detail = NonNullable<Awaited<ReturnType<typeof getOrderDetail>>>

export default function OrderDetail() {
  const id = Number(useParams().id)
  const [data, setData] = useState<Detail | null | undefined>(undefined)
  const [error, setError] = useState('')
  const [paying, setPaying] = useState(false)

  const load = useCallback(async () => setData(await getOrderDetail(id)), [id])
  useEffect(() => { load() }, [load])

  if (data === undefined) return null
  if (data === null) return <p>Order not found. <Link className="underline" to="/orders">Back</Link></p>
  const { order, items, payments } = data
  const balance = order.total_cents - order.paid_cents

  async function change(to: OrderStatus) {
    if (to === 'cancelled' && !confirm('Cancel this order? This cannot be undone.')) return
    if (to === 'released' && balance > 0 && !confirm(`Balance of ${formatPeso(balance)} is unpaid. Release anyway?`)) return
    try {
      await setOrderStatus(id, to)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed.')
    }
    await load()
  }

  const canPay = balance > 0 && order.status !== 'cancelled'
  const next = nextStatus(order.status)
  const row = (label: string, value: string, bold = false) => (
    <div className={`flex justify-between ${bold ? 'text-lg font-bold' : ''}`}><span>{label}</span><span>{value}</span></div>
  )

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link to="/orders" className="text-sm text-sky-700 underline">← Orders</Link>

      <div className="rounded-xl bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold">{order.order_number}</h1>
            <Link to={`/customers/${order.customer_id}`} className="text-sky-700 underline">{order.customer_name}</Link>
            <div className="text-sm text-slate-500">Received {formatDateTime(order.received_at)}</div>
            {order.expected_pickup && <div className="text-sm text-slate-500">Pickup {order.expected_pickup}</div>}
          </div>
          <div className="flex flex-col items-end gap-1"><StatusBadge status={order.status} /><PaymentBadge status={order.payment_status} /></div>
        </div>
        {order.notes && <p className="mt-2 text-sm text-slate-600">📝 {order.notes}</p>}
      </div>

      {/* Status workflow */}
      <div className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold">Status</h2>
        <ol className="flex flex-wrap gap-1.5">
          {STATUS_FLOW.map((s) => {
            const reached = STATUS_FLOW.indexOf(s) <= STATUS_FLOW.indexOf(order.status)
            const cls = order.status === 'cancelled' ? 'bg-slate-100 text-slate-400' : s === order.status ? 'bg-sky-600 text-white' : reached ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-500'
            const clickable = canChangeStatus(order.status, s)
            return (
              <li key={s}>
                <button disabled={!clickable} onClick={() => change(s)} className={`rounded-full px-3 py-2 text-sm font-medium ${cls} ${clickable ? 'active:opacity-70' : ''}`}>
                  {STATUS_LABEL[s]}
                </button>
              </li>
            )
          })}
        </ol>
        {!isFinal(order.status) && (
          <div className="flex gap-2">
            {next && <button onClick={() => change(next)} className="flex-1 rounded-lg bg-sky-600 px-4 py-3 font-semibold text-white active:bg-sky-700">Mark as {STATUS_LABEL[next]} →</button>}
            <button onClick={() => change('cancelled')} className="rounded-lg bg-red-50 px-4 py-3 font-semibold text-red-600 active:bg-red-100">Cancel order</button>
          </div>
        )}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      </div>

      {/* Items */}
      <div className="rounded-xl bg-white p-4 shadow-sm">
        <h2 className="mb-2 font-semibold">Items</h2>
        <ul className="divide-y divide-slate-100">
          {items.map((i) => (
            <li key={i.id} className="flex justify-between gap-2 py-2">
              <div>
                <div className="font-medium">{i.service_name}</div>
                <div className="text-sm text-slate-500">
                  {i.pricing_method === 'fixed' ? formatPeso(i.unit_price_cents) : `${i.quantity} × ${formatPeso(i.unit_price_cents)}${PRICING_UNIT[i.pricing_method]}`}
                </div>
              </div>
              <div className="font-medium">{formatPeso(i.amount_cents)}</div>
            </li>
          ))}
        </ul>
        <div className="mt-2 space-y-1 border-t border-slate-200 pt-2">
          {row('Subtotal', formatPeso(order.subtotal_cents))}
          {order.discount_cents > 0 && row('Discount', `− ${formatPeso(order.discount_cents)}`)}
          {row('Total', formatPeso(order.total_cents), true)}
          {row('Paid', formatPeso(order.paid_cents))}
          {row('Balance', formatPeso(balance), true)}
        </div>
      </div>

      <div className="rounded-xl bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">Payments</h2>
          {canPay && !paying && <button onClick={() => setPaying(true)} className="rounded-lg bg-sky-600 px-4 py-2 font-semibold text-white active:bg-sky-700">+ Add payment</button>}
        </div>
        {canPay && paying && (
          <PaymentForm orderId={id} balanceCents={balance} onSaved={() => { setPaying(false); load() }} />
        )}
        <ul className="divide-y divide-slate-100">
          {payments.map((p) => (
            <li key={p.id} className="flex justify-between gap-2 py-2 text-sm">
              <div>
                <div className="font-medium capitalize">{p.method}{p.reference && ` · ${p.reference}`}</div>
                <div className="text-slate-500">{formatDateTime(p.paid_at)} · {p.user_name}</div>
              </div>
              <div className="font-medium">{formatPeso(p.amount_cents)}</div>
            </li>
          ))}
          {payments.length === 0 && <li className="py-2 text-sm text-slate-500">No payments yet.</li>}
        </ul>
      </div>
      <Link to="/orders" className={`${secondaryBtn} block text-center`}>Back to orders</Link>
    </div>
  )
}
