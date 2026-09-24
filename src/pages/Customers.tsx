import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { inputCls, primaryBtn, secondaryBtn } from '../components/ui'
import { createCustomer, searchCustomers, type CustomerInput } from '../db/customers'
import type { Customer } from '../types'

export function CustomerForm({
  initial, submitLabel, onSubmit, onCancel,
}: {
  initial: CustomerInput
  submitLabel: string
  onSubmit: (c: CustomerInput) => Promise<void>
  onCancel: () => void
}) {
  const [f, setF] = useState(initial)
  const [error, setError] = useState('')
  const set = (k: keyof CustomerInput, v: string) => setF((x) => ({ ...x, [k]: v }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    try {
      await onSubmit(f)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed.')
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
      <input className={inputCls} placeholder="Full name" value={f.fullName} onChange={(e) => set('fullName', e.target.value)} required autoFocus />
      <input className={inputCls} placeholder="Contact number" inputMode="tel" value={f.contact} onChange={(e) => set('contact', e.target.value)} />
      <input className={inputCls} placeholder="Address" value={f.address} onChange={(e) => set('address', e.target.value)} />
      <textarea className={inputCls} placeholder="Notes" rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} />
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button className={`${primaryBtn} flex-1`}>{submitLabel}</button>
        <button type="button" onClick={onCancel} className={`${secondaryBtn} flex-1`}>Cancel</button>
      </div>
    </form>
  )
}

export const emptyCustomer: CustomerInput = { fullName: '', contact: '', address: '', notes: '' }

export default function Customers() {
  const [text, setText] = useState('')
  const [rows, setRows] = useState<Customer[]>([])
  const [adding, setAdding] = useState(false)

  const load = useCallback(() => searchCustomers(text).then(setRows), [text])
  useEffect(() => { load() }, [load])

  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-slate-900">Customers</h1>
        <button onClick={() => setAdding(true)} className={primaryBtn}>+ Add customer</button>
      </div>

      {adding && (
        <div className="mb-4">
          <CustomerForm
            initial={emptyCustomer}
            submitLabel="Save customer"
            onCancel={() => setAdding(false)}
            onSubmit={async (c) => { await createCustomer(c); setAdding(false); await load() }}
          />
        </div>
      )}

      <input className={`${inputCls} mb-3`} type="search" placeholder="Search name, contact or ID" value={text} onChange={(e) => setText(e.target.value)} />

      <ul className="divide-y divide-slate-100 rounded-xl bg-white shadow-sm">
        {rows.map((c) => (
          <li key={c.id}>
            <Link to={`/customers/${c.id}`} className="flex items-center justify-between gap-3 p-4 active:bg-slate-50">
              <div className="min-w-0">
                <div className="truncate font-medium">{c.full_name}</div>
                <div className="truncate text-sm text-slate-500">{c.contact || 'No contact'}</div>
              </div>
              <span className="text-xs text-slate-400">{c.customer_code}</span>
            </Link>
          </li>
        ))}
        {rows.length === 0 && <li className="p-6 text-center text-slate-500">No customers found.</li>}
      </ul>
    </div>
  )
}
