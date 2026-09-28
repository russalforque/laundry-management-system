import { useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sheet } from '../Sheet'
import { fieldCls } from '../ui'
import { ACTIVE_DAYS, createCustomer, type CustomerInput } from '../../db/customers'
import type { Customer } from '../../types'

/** Customer pieces shared by the Customers pages, the customer's own page and New Order. */

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
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false) // state updates are async; this blocks a double tap saving the customer twice
  const set = (k: keyof CustomerInput, v: string) => setF((x) => ({ ...x, [k]: v }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (submitting.current) return
    submitting.current = true
    setBusy(true)
    try {
      await onSubmit(f)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      submitting.current = false
      setBusy(false)
    }
  }

  const label = 'block text-sm font-medium text-slate-600'
  return (
    <form onSubmit={submit} className="space-y-3">
      <label className={label}>
        Full name <span className="text-red-500">*</span>
        <input className={`${fieldCls} mt-1`} placeholder="e.g. Maria Santos" value={f.fullName} onChange={(e) => set('fullName', e.target.value)} required autoFocus />
      </label>
      <label className={label}>
        Phone number <span className="font-normal text-slate-400">(optional)</span>
        <input className={`${fieldCls} mt-1`} placeholder="e.g. 0917 123 4567" inputMode="tel" value={f.contact} onChange={(e) => set('contact', e.target.value)} />
      </label>
      <label className={label}>
        Address <span className="font-normal text-slate-400">(optional)</span>
        <input className={`${fieldCls} mt-1`} placeholder="Street, city" value={f.address} onChange={(e) => set('address', e.target.value)} />
      </label>
      <label className={label}>
        Notes <span className="font-normal text-slate-400">(optional)</span>
        <textarea className={`${fieldCls} mt-1 resize-none`} placeholder="Preferences, reminders…" rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} />
      </label>
      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel} className="min-h-12 flex-1 rounded-full bg-slate-100 font-semibold text-slate-700 hover:bg-slate-200 active:bg-slate-200">
          Cancel
        </button>
        <button disabled={busy} className="min-h-12 flex-1 rounded-full bg-blue-600 font-semibold text-white hover:bg-blue-700 active:bg-blue-700 disabled:opacity-60">
          {busy ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  )
}

export const emptyCustomer: CustomerInput = { fullName: '', contact: '', address: '', notes: '' }

export function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span
      title={`${active ? 'Ordered or joined' : 'No orders'} in the last ${ACTIVE_DAYS} days`}
      className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
      }`}
    >
      {active ? 'Active' : 'Inactive'}
    </span>
  )
}

/** "Edit customer" sheet for a customer's page. */
export function EditCustomerSheet({ customer, onSave, onClose }: { customer: Customer; onSave: (c: CustomerInput) => Promise<void>; onClose: () => void }) {
  return (
    <Sheet label="Edit customer" onClose={onClose}>
      <CustomerForm
        initial={{ fullName: customer.full_name, contact: customer.contact, address: customer.address, notes: customer.notes }}
        submitLabel="Save changes"
        onCancel={onClose}
        onSubmit={onSave}
      />
    </Sheet>
  )
}

/** "New customer" sheet: saves, then opens the new customer's page. `name` prefills the search text. */
/** Saves a new customer, then opens them: their page by default, or `onCreated` (tablet master-detail selects them in place). */
export function AddCustomerSheet({ name, onClose, onCreated }: { name: string; onClose: () => void; onCreated?: (id: number) => void }) {
  const navigate = useNavigate()
  return (
    <Sheet label="New customer" onClose={onClose}>
      <CustomerForm
        initial={{ ...emptyCustomer, fullName: name }}
        submitLabel="Save customer"
        onCancel={onClose}
        onSubmit={async (c) => { const id = await createCustomer(c); if (onCreated) onCreated(id); else navigate(`/customers/${id}`) }}
      />
    </Sheet>
  )
}
