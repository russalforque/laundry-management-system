import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { secondaryBtn } from '../components/ui'
import { deleteCustomer, getCustomer, getCustomerOrders, getCustomerStats, updateCustomer } from '../db/customers'
import { formatDateTime, formatPeso } from '../lib/money'
import type { Customer, CustomerOrder, CustomerStats } from '../types'
import { CustomerForm } from './Customers'

export default function CustomerDetail() {
  const id = Number(useParams().id)
  const nav = useNavigate()
  const [customer, setCustomer] = useState<Customer | null | undefined>(undefined)
  const [stats, setStats] = useState<CustomerStats | null>(null)
  const [orders, setOrders] = useState<CustomerOrder[]>([])
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setCustomer((await getCustomer(id)) ?? null)
    setStats(await getCustomerStats(id))
    setOrders(await getCustomerOrders(id))
  }, [id])
  useEffect(() => { load() }, [load])

  if (customer === undefined) return null
  if (customer === null) return <p>Customer not found. <Link className="underline" to="/customers">Back</Link></p>

  async function remove() {
    if (!confirm(`Delete ${customer!.full_name}?`)) return
    try {
      await deleteCustomer(id)
      nav('/customers', { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed.')
    }
  }

  const card = (label: string, value: string | number) => (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  )

  return (
    <div className="max-w-3xl space-y-4">
      <Link to="/customers" className="text-sm text-sky-700 underline">← Customers</Link>

      {editing ? (
        <CustomerForm
          initial={{ fullName: customer.full_name, contact: customer.contact, address: customer.address, notes: customer.notes }}
          submitLabel="Save changes"
          onCancel={() => setEditing(false)}
          onSubmit={async (c) => { await updateCustomer(id, c); setEditing(false); await load() }}
        />
      ) : (
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h1 className="text-2xl font-bold">{customer.full_name}</h1>
              <div className="text-sm text-slate-400">{customer.customer_code} · Since {formatDateTime(customer.created_at)}</div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditing(true)} className={secondaryBtn}>Edit</button>
              <button onClick={remove} className="rounded-lg bg-red-50 px-4 py-3 font-semibold text-red-600 active:bg-red-100">Delete</button>
            </div>
          </div>
          <dl className="mt-3 space-y-1 text-slate-700">
            <div>📞 {customer.contact || '—'}</div>
            <div>📍 {customer.address || '—'}</div>
            {customer.notes && <div>📝 {customer.notes}</div>}
          </dl>
          {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {card('Total orders', stats.total_orders)}
          {card('Total spending', formatPeso(stats.total_spent_cents))}
          {card('Outstanding balance', formatPeso(stats.outstanding_cents))}
        </div>
      )}

      <h2 className="font-semibold">Order history</h2>
      <ul className="divide-y divide-slate-100 rounded-xl bg-white shadow-sm">
        {orders.map((o) => (
          <li key={o.id} className="flex items-center justify-between gap-3 p-4">
            <div>
              <div className="font-medium">{o.order_number}</div>
              <div className="text-sm text-slate-500">{formatDateTime(o.received_at)}</div>
            </div>
            <div className="text-right">
              <div className="font-medium">{formatPeso(o.total_cents)}</div>
              <div className="text-xs capitalize text-slate-500">{o.status} · {o.payment_status}</div>
            </div>
          </li>
        ))}
        {orders.length === 0 && <li className="p-6 text-center text-slate-500">No orders yet.</li>}
      </ul>
    </div>
  )
}
