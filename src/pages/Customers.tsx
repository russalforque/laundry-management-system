import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AppHeader } from '../components/AppHeader'
import { Avatar } from '../components/Avatar'
import { Chip } from '../components/Chip'
import { I, Icon } from '../components/Icons'
import { Sheet } from '../components/Sheet'
import { fabPos, fieldCls } from '../components/ui'
import {
  ACTIVE_DAYS, createCustomer, isActiveCustomer, listCustomers,
  type CustomerActivity, type CustomerInput, type CustomerListRow, type CustomerSort,
} from '../db/customers'
import { formatPesoShort } from '../lib/money'

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
  const set = (k: keyof CustomerInput, v: string) => setF((x) => ({ ...x, [k]: v }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await onSubmit(f)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed.')
      setBusy(false)
    }
  }

  const label = 'block text-sm font-medium text-slate-600'
  return (
    <form onSubmit={submit} className="space-y-3">
      <label className={label}>
        Full name
        <input className={`${fieldCls} mt-1`} placeholder="e.g. Maria Santos" value={f.fullName} onChange={(e) => set('fullName', e.target.value)} required autoFocus />
      </label>
      <label className={label}>
        Phone number
        <input className={`${fieldCls} mt-1`} placeholder="e.g. 0917 123 4567" inputMode="tel" value={f.contact} onChange={(e) => set('contact', e.target.value)} />
      </label>
      <label className={label}>
        Address
        <input className={`${fieldCls} mt-1`} placeholder="Street, city" value={f.address} onChange={(e) => set('address', e.target.value)} />
      </label>
      <label className={label}>
        Notes
        <textarea className={`${fieldCls} mt-1 resize-none`} placeholder="Preferences, reminders…" rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} />
      </label>
      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel} className="min-h-12 flex-1 rounded-full bg-slate-100 font-semibold text-slate-700 active:bg-slate-200">
          Cancel
        </button>
        <button disabled={busy} className="min-h-12 flex-1 rounded-full bg-blue-600 font-semibold text-white active:bg-blue-700 disabled:opacity-60">
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

const ACTIVITY: { id: CustomerActivity; label: string }[] = [
  { id: '', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'inactive', label: 'Inactive' },
]
const SORTS: { id: CustomerSort; label: string }[] = [
  { id: 'name', label: 'Name A–Z' },
  { id: 'recent', label: 'Recent activity' },
  { id: 'spent', label: 'Top spenders' },
]

function CustomerCard({ c }: { c: CustomerListRow }) {
  const active = isActiveCustomer(c.last_activity)
  return (
    <Link
      to={`/customers/${c.id}`}
      className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-[0_1px_3px_rgba(15,23,42,0.05)] transition active:bg-slate-50 sm:gap-4 sm:p-4"
    >
      <Avatar name={c.full_name} className={`size-14 text-lg ${active ? '' : 'opacity-60'}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-bold text-slate-900">{c.full_name}</span>
          <ActiveBadge active={active} />
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-500">
          <Icon className="h-4 w-4 text-slate-400">{I.phone}</Icon>
          <span className="truncate">{c.contact || 'No phone number'}</span>
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
          <Icon className="h-3.5 w-3.5 text-slate-400">{I.calendar}</Icon>
          <span className="truncate">
            {c.total_orders} {c.total_orders === 1 ? 'Order' : 'Orders'}
            <span className="mx-1.5 text-slate-300">•</span>
            <b className="font-semibold text-slate-700">{formatPesoShort(c.total_spent_cents)}</b> Total Spent
          </span>
          {c.outstanding_cents > 0 && (
            <span className="ml-auto shrink-0 font-semibold text-red-600">{formatPesoShort(c.outstanding_cents)} due</span>
          )}
        </div>
      </div>
      <Icon className="h-5 w-5 text-slate-400">{I.chevron}</Icon>
    </Link>
  )
}

export default function Customers() {
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [activity, setActivity] = useState<CustomerActivity>('')
  const [sort, setSort] = useState<CustomerSort>('name')
  const [showSort, setShowSort] = useState(false)
  const [rows, setRows] = useState<CustomerListRow[] | null>(null)
  const [adding, setAdding] = useState(false)

  const load = useCallback(() => listCustomers(text, activity, sort).then(setRows), [text, activity, sort])
  useEffect(() => { load() }, [load])

  const filtered = !!(text || activity)

  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-28">
      <div className="md:hidden"><AppHeader /></div>

      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Customers</h1>
        <p className="mt-1 text-sm text-slate-500">Manage your customers and their laundry history.</p>
      </div>

      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Icon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400">{I.search}</Icon>
            <input
              className={`${fieldCls} pl-12`}
              type="search"
              enterKeyHint="search"
              aria-label="Search customers"
              placeholder="Search by name, phone number…"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={() => setShowSort((v) => !v)}
            aria-label="Sort customers"
            aria-expanded={showSort}
            className={`relative grid w-13 shrink-0 place-items-center rounded-xl border transition-colors ${
              showSort ? 'border-blue-200 bg-blue-50 text-blue-600' : 'border-slate-200 bg-white text-slate-600 active:bg-slate-50'
            }`}
          >
            <Icon className="h-5 w-5">{I.sliders}</Icon>
            {sort !== 'name' && <span className="absolute -right-1 -top-1 size-3 rounded-full border-2 border-slate-100 bg-blue-600" />}
          </button>
        </div>

        {showSort && (
          <div role="radiogroup" aria-label="Sort by" className="grid grid-cols-3 gap-1 rounded-xl bg-white p-1 ring-1 ring-slate-200/80">
            {SORTS.map((s) => (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={sort === s.id}
                onClick={() => setSort(s.id)}
                className={`min-h-10 rounded-lg px-1 text-xs font-semibold sm:text-sm ${sort === s.id ? 'bg-blue-50 text-blue-700' : 'text-slate-500 active:bg-slate-50'}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        <div role="tablist" aria-label="Customer activity" className="flex gap-2">
          {ACTIVITY.map((a) => (
            <Chip key={a.id} active={activity === a.id} onClick={() => setActivity(a.id)}>{a.label}</Chip>
          ))}
        </div>
      </div>

      {rows === null ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading customers">
          {[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-200/60" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-slate-200/80 bg-white px-6 py-12 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-blue-50 text-blue-500">
            <Icon className="h-7 w-7">{I.userPlus}</Icon>
          </span>
          <p className="mt-3 font-semibold text-slate-900">{filtered ? 'No matching customers' : 'No customers yet'}</p>
          <p className="mt-1 text-sm text-slate-500">{filtered ? 'Try a different search or filter.' : 'Add your first customer to start taking orders.'}</p>
        </div>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {rows.map((c) => <li key={c.id} className="min-w-0"><CustomerCard c={c} /></li>)}
        </ul>
      )}

      <button
        type="button"
        onClick={() => setAdding(true)}
        aria-label="Add customer"
        className={`${fabPos} grid size-14 place-items-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-600/30 transition active:scale-95 active:bg-blue-700`}
      >
        <Icon className="h-7 w-7">{I.plus}</Icon>
      </button>

      {adding && (
        <Sheet label="New customer" onClose={() => setAdding(false)}>
          <CustomerForm
            initial={{ ...emptyCustomer, fullName: text }}
            submitLabel="Save customer"
            onCancel={() => setAdding(false)}
            onSubmit={async (c) => navigate(`/customers/${await createCustomer(c)}`)}
          />
        </Sheet>
      )}
    </div>
  )
}
