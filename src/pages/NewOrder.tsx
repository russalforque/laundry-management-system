import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { inputCls, primaryBtn, secondaryBtn } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { createCustomer, getCustomer, searchCustomers } from '../db/customers'
import { createOrder } from '../db/orders'
import { listServices, PRICING_UNIT } from '../db/services'
import { formatPeso, parsePesoToCents } from '../lib/money'
import { lineAmount, normalizeQuantity, paymentStatus } from '../lib/orders'
import type { Customer, PaymentMethod, Service } from '../types'
import { CustomerForm, emptyCustomer } from './Customers'

interface Line {
  service: Service
  qty: string
}

const qtyLabel = (s: Service) => (s.pricing_method === 'per_kg' ? 'KG' : s.pricing_method === 'per_piece' ? 'Pieces' : '')

export default function NewOrder() {
  const { user } = useAuth()
  const [services, setServices] = useState<Service[]>([])
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [search, setSearch] = useState('')
  const [matches, setMatches] = useState<Customer[]>([])
  const [addingCustomer, setAddingCustomer] = useState(false)
  const [lines, setLines] = useState<Line[]>([])
  const [discount, setDiscount] = useState('')
  const [paid, setPaid] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [reference, setReference] = useState('')
  const [pickup, setPickup] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ id: number; orderNumber: string } | null>(null)

  useEffect(() => { listServices(true).then(setServices) }, [])
  useEffect(() => {
    if (customer) return
    searchCustomers(search, 8).then(setMatches)
  }, [search, customer])

  // Derived money, all in centavos. The database re-validates on save.
  const amounts = lines.map((l) => {
    const q = normalizeQuantity(l.service.pricing_method, parseFloat(l.qty))
    return q === null ? 0 : lineAmount(l.service.pricing_method, l.service.price_cents, q)
  })
  const subtotal = amounts.reduce((a, b) => a + b, 0)
  const discountCents = discount.trim() ? parsePesoToCents(discount) : 0
  const paidCents = paid.trim() ? parsePesoToCents(paid) : 0
  const total = subtotal - (discountCents ?? 0)
  const balance = total - (paidCents ?? 0)

  function addService(s: Service) {
    setLines((ls) => (ls.some((l) => l.service.id === s.id) ? ls : [...ls, { service: s, qty: s.pricing_method === 'fixed' ? '1' : '' }]))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!customer) return setError('Select a customer.')
    if (!lines.length) return setError('Add at least one service.')
    const items = []
    for (const l of lines) {
      const q = normalizeQuantity(l.service.pricing_method, parseFloat(l.qty))
      if (q === null) return setError(`Enter a valid ${l.service.pricing_method === 'per_piece' ? 'whole number of pieces' : 'weight'} for ${l.service.name}.`)
      items.push({ serviceId: l.service.id, quantity: q })
    }
    if (discountCents === null) return setError('Invalid discount.')
    if (discountCents > subtotal) return setError('Discount cannot exceed the subtotal.')
    if (paidCents === null) return setError('Invalid amount paid.')
    if (paidCents > total) return setError('Amount paid cannot exceed the total.')

    setBusy(true)
    try {
      setDone(await createOrder({
        customerId: customer.id, items, discountCents, expectedPickup: pickup || null, notes,
        payment: paidCents > 0 ? { amountCents: paidCents, method, reference } : null,
      }, user!.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save order.')
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="max-w-md space-y-3 rounded-xl bg-white p-6 text-center shadow-sm">
        <div className="text-4xl">✅</div>
        <h1 className="text-xl font-bold">Order saved</h1>
        <p className="text-2xl font-bold text-sky-700">{done.orderNumber}</p>
        <div className="flex gap-2 pt-2">
          <Link to="/orders" className={`${secondaryBtn} flex-1`}>Orders</Link>
          <a href="#/orders/new" onClick={() => location.reload()} className={`${primaryBtn} flex-1`}>New order</a>
        </div>
      </div>
    )
  }

  const card = 'space-y-3 rounded-xl bg-white p-4 shadow-sm'
  const minDate = new Date().toISOString().slice(0, 10)

  return (
    <form onSubmit={submit} className="mx-auto max-w-3xl space-y-4 pb-24">
      <h1 className="text-2xl font-bold text-slate-900">New Laundry Order</h1>

      {/* 1. Customer */}
      <section className={card}>
        <h2 className="font-semibold">1. Customer</h2>
        {customer ? (
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="font-medium">{customer.full_name}</div>
              <div className="text-sm text-slate-500">{customer.contact || customer.customer_code}</div>
            </div>
            <button type="button" onClick={() => { setCustomer(null); setSearch('') }} className={secondaryBtn}>Change</button>
          </div>
        ) : addingCustomer ? (
          <CustomerForm
            initial={emptyCustomer}
            submitLabel="Save & select"
            onCancel={() => setAddingCustomer(false)}
            onSubmit={async (c) => {
              const id = await createCustomer(c)
              setCustomer((await getCustomer(id)) ?? null)
              setAddingCustomer(false)
            }}
          />
        ) : (
          <>
            <input className={inputCls} type="search" placeholder="Search customer name or contact" value={search} onChange={(e) => setSearch(e.target.value)} />
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {matches.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => setCustomer(c)} className="flex w-full justify-between gap-2 p-3 text-left active:bg-slate-50">
                    <span className="truncate font-medium">{c.full_name}</span>
                    <span className="truncate text-sm text-slate-500">{c.contact}</span>
                  </button>
                </li>
              ))}
              {matches.length === 0 && <li className="p-3 text-sm text-slate-500">No match.</li>}
            </ul>
            <button type="button" onClick={() => setAddingCustomer(true)} className="font-medium text-sky-700 underline">+ New customer</button>
          </>
        )}
      </section>

      {/* 2. Services */}
      <section className={card}>
        <h2 className="font-semibold">2. Services</h2>
        {services.length === 0 && <p className="text-sm text-slate-500">No active services. Ask a manager to add services first.</p>}
        <div className="flex flex-wrap gap-2">
          {services.map((s) => {
            const on = lines.some((l) => l.service.id === s.id)
            return (
              <button key={s.id} type="button" onClick={() => addService(s)} disabled={on}
                className={`rounded-full border px-4 py-2 text-sm font-medium ${on ? 'border-sky-600 bg-sky-50 text-sky-700' : 'border-slate-300 active:bg-slate-100'}`}>
                {s.name} · {formatPeso(s.price_cents)}{PRICING_UNIT[s.pricing_method]}
              </button>
            )
          })}
        </div>
        {lines.map((l, i) => (
          <div key={l.service.id} className="flex items-center gap-2 border-t border-slate-100 pt-3">
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{l.service.name}</div>
              <div className="text-sm text-slate-500">{formatPeso(l.service.price_cents)}{PRICING_UNIT[l.service.pricing_method]}</div>
            </div>
            {l.service.pricing_method !== 'fixed' && (
              <input className={`${inputCls} !w-24 text-right`} inputMode="decimal" placeholder={qtyLabel(l.service)} aria-label={`${l.service.name} ${qtyLabel(l.service)}`}
                value={l.qty} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} />
            )}
            <div className="w-24 text-right font-semibold">{formatPeso(amounts[i])}</div>
            <button type="button" aria-label={`Remove ${l.service.name}`} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="px-2 text-xl text-red-500">×</button>
          </div>
        ))}
      </section>

      {/* 3. Payment */}
      <section className={card}>
        <h2 className="font-semibold">3. Payment</h2>
        <div className="grid grid-cols-2 gap-3">
          <input className={inputCls} inputMode="decimal" placeholder="Discount (₱)" value={discount} onChange={(e) => setDiscount(e.target.value)} />
          <input className={inputCls} inputMode="decimal" placeholder="Amount paid (₱)" value={paid} onChange={(e) => setPaid(e.target.value)} />
        </div>
        {(paidCents ?? 0) > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              <option value="cash">Cash</option>
              <option value="gcash">GCash</option>
              <option value="other">Other</option>
            </select>
            <input className={inputCls} placeholder="Reference (optional)" value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
        )}
        <label className="block text-sm text-slate-500">
          Expected pickup date
          <input className={`${inputCls} mt-1`} type="date" min={minDate} value={pickup} onChange={(e) => setPickup(e.target.value)} />
        </label>
        <textarea className={inputCls} rows={2} placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </section>

      {/* Sticky summary */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white p-3 md:left-60">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="min-w-0 flex-1 text-sm">
            <div>Total <b className="text-lg">{formatPeso(Math.max(total, 0))}</b></div>
            <div className="truncate text-slate-500">
              Balance {formatPeso(Math.max(balance, 0))} · <span className="capitalize">{paymentStatus(Math.max(total, 0), paidCents ?? 0)}</span>
            </div>
          </div>
          <button disabled={busy} className={primaryBtn}>{busy ? 'Saving…' : 'Save order'}</button>
        </div>
        {error && <p role="alert" className="mx-auto mt-1 max-w-3xl text-sm text-red-600">{error}</p>}
      </div>
    </form>
  )
}
