import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { I, Icon } from '../components/Icons'
import { OrderCard } from '../components/OrderCard'
import { useAdminPin } from '../components/AdminPin'
import { Sheet } from '../components/Sheet'
import { deleteCustomer, getCustomer, getCustomerStats, isActiveCustomer, updateCustomer, WALK_IN_CODE } from '../db/customers'
import { listOrders, type OrderListRow } from '../db/orderQueries'
import { formatPeso, formatPesoShort } from '../lib/money'
import { isFinal } from '../lib/orders'
import type { Customer, CustomerStats } from '../types'
import { ActiveBadge, CustomerForm } from './Customers'

const RECENT = 3
const card = 'rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.05)]'

const sinceDate = (iso: string) => new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })

/** "Today", "Yesterday", "5 days ago", "3 wks ago", then a date. */
function lastVisit(iso: string | null) {
  if (!iso) return 'None yet'
  const d = new Date(iso)
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((start(new Date()) - start(d)) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 14) return `${days} days ago`
  if (days < 60) return `${Math.floor(days / 7)} wks ago`
  return d.toLocaleDateString('en-PH', { month: 'short', year: 'numeric' })
}

/** Digits (and a leading +) for tel:/sms: links, or null when there's no usable number. */
const dialable = (contact: string) => {
  const n = contact.replace(/[^\d+]/g, '')
  return n.replace(/\D/g, '').length >= 7 ? n : null
}

/** Order list filters: what's still in the shop, and what still needs paying. */
type OrderFilter = 'all' | 'open' | 'unpaid'
const isOpen = (o: OrderListRow) => !isFinal(o.status)
const isUnpaid = (o: OrderListRow) => o.status !== 'cancelled' && o.payment_status !== 'paid'

function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center gap-3 px-1">
      <h2 className="flex-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      {action}
    </div>
  )
}

/** Contact row: icon, value, and a one-tap action (call, map) or an "Add" prompt when empty. */
function ContactRow({ icon, label, value, empty, href, actionLabel, actionIcon, onAdd }: {
  icon: ReactNode; label: string; value: string; empty: string; href?: string | null; actionLabel?: string; actionIcon?: ReactNode; onAdd: () => void
}) {
  return (
    <li className="flex min-h-16 items-center gap-3 px-4 py-2">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500"><Icon className="h-5 w-5">{icon}</Icon></span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-slate-500">{label}</span>
        <span className={`block wrap-break-word text-[15px] ${value ? 'text-slate-900' : 'text-slate-400'}`}>{value || empty}</span>
      </span>
      {value && href ? (
        <a href={href} aria-label={`${actionLabel}: ${value}`} className="grid size-11 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-600 active:bg-blue-100">
          <Icon className="h-5 w-5">{actionIcon}</Icon>
        </a>
      ) : !value ? (
        <button type="button" onClick={onAdd} className="-mr-2 min-h-11 shrink-0 rounded-xl px-3 text-sm font-semibold text-blue-600 active:bg-blue-50">Add</button>
      ) : null}
    </li>
  )
}

function Stat({ value, label, tone = 'text-slate-900' }: { value: string; label: string; tone?: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-white px-3 py-2.5 text-center shadow-sm">
      <div className={`truncate text-lg font-bold tabular-nums ${tone}`}>{value}</div>
      <div className="truncate text-xs text-slate-500">{label}</div>
    </div>
  )
}

/** Round quick-action button under the profile (Call, Text, …). */
function QuickAction({ href, icon, label }: { href: string; icon: ReactNode; label: string }) {
  return (
    <a href={href} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-white px-3 text-sm font-semibold text-blue-700 shadow-sm active:bg-blue-100">
      <Icon className="h-5 w-5">{icon}</Icon>{label}
    </a>
  )
}

export default function CustomerDetail() {
  const id = Number(useParams().id)
  const navigate = useNavigate()
  const [customer, setCustomer] = useState<Customer | null | undefined>(undefined)
  const [stats, setStats] = useState<CustomerStats | null>(null)
  const [orders, setOrders] = useState<OrderListRow[]>([])
  const [filter, setFilter] = useState<OrderFilter>('all')
  const [showAll, setShowAll] = useState(false)
  const [editing, setEditing] = useState(false)
  const [menu, setMenu] = useState(false)
  const { approve, sheet } = useAdminPin()
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState('')

  const load = useCallback(async () => {
    try {
      const [c, s, o] = await Promise.all([getCustomer(id), getCustomerStats(id), listOrders({ customerId: id })])
      setCustomer(c ?? null)
      setStats(s)
      setOrders(o)
      setLoadError('')
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load this customer.')
    }
  }, [id])
  useEffect(() => { load() }, [load])

  // Close the overflow menu with Escape, like the sheets do.
  useEffect(() => {
    if (!menu) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [menu])

  function goBack() {
    // react-router keeps the history index in state; fall back to the list when opened directly.
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1)
    else navigate('/customers')
  }

  // Customers with any order (even cancelled) are kept for the records, so don't offer a delete that will fail.
  const walkIn = customer?.customer_code === WALK_IN_CODE
  const canDelete = !!customer && !walkIn && orders.length === 0

  async function remove() {
    setError('')
    // Null-safe: React Compiler memoizes on customer?.full_name, which is read before the loading guard below.
    if (!customer || !(await approve(`Delete ${customer.full_name}? This cannot be undone.`))) return
    try {
      await deleteCustomer(id)
      navigate('/customers', { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed.')
    }
  }

  const header = (
    <header className="flex items-center gap-2">
      <button type="button" onClick={goBack} aria-label="Back" className="-ml-2 grid size-11 place-items-center rounded-full text-slate-800 active:bg-slate-200">
        <Icon className="h-6 w-6">{I.back}</Icon>
      </button>
      <h1 className="min-w-0 flex-1 truncate text-2xl font-bold tracking-tight text-slate-900">Customer</h1>
      {customer && !walkIn && (
        <button type="button" onClick={() => setEditing(true)} className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-blue-600 active:bg-blue-50">
          <Icon className="h-4 w-4">{I.pencil}</Icon>Edit
        </button>
      )}
      {customer && !walkIn && (
        <div className="relative">
          <button type="button" onClick={() => setMenu((m) => !m)} aria-label="More actions" aria-haspopup="menu" aria-expanded={menu} className="-mr-2 grid size-11 place-items-center rounded-full text-slate-700 active:bg-slate-200">
            <Icon className="h-6 w-6">{I.more}</Icon>
          </button>
          {menu && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setMenu(false)} aria-hidden />
              <div role="menu" className="absolute right-0 top-12 z-30 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                <button role="menuitem" onClick={() => { setMenu(false); setEditing(true) }} className="flex min-h-12 w-full items-center gap-3 px-4 text-sm text-slate-700 active:bg-slate-50">
                  <Icon className="h-5 w-5 text-slate-500">{I.pencil}</Icon>Edit customer
                </button>
                {canDelete ? (
                  <button role="menuitem" onClick={() => { setMenu(false); remove() }} className="flex min-h-12 w-full items-center gap-3 border-t border-slate-100 px-4 text-sm font-medium text-red-600 active:bg-red-50">
                    <Icon className="h-5 w-5">{I.trash}</Icon>Delete customer
                  </button>
                ) : (
                  <div role="menuitem" aria-disabled="true" className="flex items-start gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-400">
                    <Icon className="mt-0.5 h-5 w-5">{I.trash}</Icon>
                    <span>Delete customer<span className="block text-xs">Customers with orders are kept for your records.</span></span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </header>
  )

  if (customer === undefined) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        {header}
        {loadError ? (
          <div className={`${card} px-6 py-10 text-center`}>
            <p className="font-semibold text-slate-900">Couldn't load this customer</p>
            <p className="mt-1 text-sm text-slate-500">{loadError}</p>
            <button type="button" onClick={load} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 font-semibold text-white active:bg-blue-700">
              <Icon className="h-5 w-5">{I.refresh}</Icon>Try again
            </button>
          </div>
        ) : (
          <div className="space-y-4" aria-busy="true" aria-label="Loading customer">
            <div className="h-56 animate-pulse rounded-2xl bg-slate-200/60 motion-reduce:animate-none" />
            <div className="h-32 animate-pulse rounded-2xl bg-slate-200/60 motion-reduce:animate-none" />
          </div>
        )}
      </div>
    )
  }
  if (customer === null) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        {header}
        <div className={`${card} px-6 py-10 text-center`}>
          <p className="font-semibold text-slate-900">Customer not found</p>
          <p className="mt-1 text-sm text-slate-500">They may have been deleted, or the link is wrong.</p>
          <Link to="/customers" className="mt-3 inline-flex min-h-11 items-center font-semibold text-blue-700">Back to customers</Link>
        </div>
      </div>
    )
  }

  const active = isActiveCustomer(stats?.last_order_at ?? customer.created_at)
  const phone = dialable(customer.contact)
  const openCount = orders.filter(isOpen).length
  const unpaidCount = orders.filter(isUnpaid).length
  const readyCount = orders.filter((o) => o.status === 'ready').length
  const filtered = filter === 'open' ? orders.filter(isOpen) : filter === 'unpaid' ? orders.filter(isUnpaid) : orders
  const shown = showAll ? filtered : filtered.slice(0, RECENT)
  const edit = () => setEditing(true)
  const pickFilter = (f: OrderFilter) => { setFilter(f); setShowAll(false) }

  const FILTERS: { id: OrderFilter; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: orders.length },
    { id: 'open', label: 'In shop', count: openCount },
    { id: 'unpaid', label: 'Unpaid', count: unpaidCount },
  ]
  const emptyText: Record<OrderFilter, string> = {
    all: 'No orders yet. Tap New Order to start one.',
    open: 'Nothing in the shop for this customer right now.',
    unpaid: 'All orders are fully paid.',
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {header}

      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">{error}</p>}

      {/* Profile: who they are, how to reach them, and where they stand */}
      <section className="rounded-2xl bg-blue-50 p-4 sm:p-5">
        <div className="flex items-center gap-4">
          <Avatar name={customer.full_name} tone="bg-white text-blue-600" className="size-18 text-2xl ring-4 ring-blue-100" />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h2 className="min-w-0 wrap-break-word text-xl font-bold leading-tight text-slate-900">{customer.full_name}</h2>
              {!walkIn && <ActiveBadge active={active} />}
            </div>
            <p className="mt-1 truncate text-sm text-slate-600">
              {walkIn ? 'Shared record for walk-in orders' : customer.contact || <span className="text-slate-400">No phone number</span>}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">{customer.customer_code} · Since {sinceDate(customer.created_at)}</p>
          </div>
        </div>

        {phone && !walkIn && (
          <div className="mt-4 flex gap-2">
            <QuickAction href={`tel:${phone}`} icon={I.phone} label="Call" />
            <QuickAction href={`sms:${phone}`} icon={I.message} label="Text" />
          </div>
        )}

        {stats && (
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Stat value={String(stats.total_orders)} label="Orders" />
            <Stat value={formatPesoShort(stats.total_spent_cents)} label="Total billed" />
            <Stat value={lastVisit(stats.last_order_at)} label="Last order" />
          </div>
        )}

        {stats && stats.outstanding_cents > 0 && (
          <button
            type="button"
            onClick={() => pickFilter('unpaid')}
            className="mt-3 flex w-full items-center gap-3 rounded-xl bg-white px-3 py-2.5 text-left text-sm shadow-sm active:bg-amber-50"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-amber-50 text-amber-600"><Icon className="h-5 w-5">{I.wallet}</Icon></span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-slate-900">Balance due</span>
              <span className="block text-xs text-slate-500">On {unpaidCount} {unpaidCount === 1 ? 'order' : 'orders'} · tap to see them</span>
            </span>
            <span className="text-base font-bold tabular-nums text-amber-700">{formatPeso(stats.outstanding_cents)}</span>
          </button>
        )}
      </section>

      {/* Care notes right under the profile: seen before anyone handles the laundry */}
      {!walkIn && customer.notes && (
        <button type="button" onClick={edit} className="flex w-full items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left active:bg-amber-100">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-amber-600 shadow-sm"><Icon className="h-5 w-5">{I.note}</Icon></span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold uppercase tracking-wide text-amber-700">Care notes</span>
            <span className="mt-0.5 block whitespace-pre-line text-[15px] text-amber-950">{customer.notes}</span>
          </span>
          <Icon className="mt-1 h-4 w-4 shrink-0 text-amber-500">{I.pencil}</Icon>
          <span className="sr-only">Edit notes</span>
        </button>
      )}

      {/* Orders — first after the profile, since that's what staff usually look up a customer for */}
      <section className="space-y-3">
        <SectionTitle title="Orders" />
        {readyCount > 0 && (
          <button
            type="button"
            onClick={() => pickFilter('open')}
            className="flex w-full items-center gap-3 rounded-xl bg-blue-600 px-4 py-3 text-left text-sm font-semibold text-white shadow-sm shadow-blue-600/30 active:bg-blue-700"
          >
            <Icon className="h-5 w-5 shrink-0">{I.bag}</Icon>
            <span className="flex-1">{readyCount === 1 ? '1 order is' : `${readyCount} orders are`} ready for pickup</span>
            <Icon className="h-5 w-5 shrink-0 opacity-70">{I.chevron}</Icon>
          </button>
        )}
        {orders.length > 0 && (
          <div role="tablist" aria-label="Filter orders" className="flex gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={filter === f.id}
                onClick={() => pickFilter(f.id)}
                className={`inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors ${
                  filter === f.id ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30' : 'border border-slate-200 bg-white text-slate-600 active:bg-slate-50'
                }`}
              >
                {f.label}
                <span className={`rounded-full px-1.5 text-xs tabular-nums ${filter === f.id ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>{f.count}</span>
              </button>
            ))}
          </div>
        )}
        {filtered.length === 0 ? (
          <div className={`${card} px-6 py-8 text-center text-sm text-slate-500`}>{emptyText[filter]}</div>
        ) : (
          <>
            <ul className="space-y-3">
              {shown.map((o) => <li key={o.id}><OrderCard o={o} showCustomer={false} /></li>)}
            </ul>
            {filtered.length > RECENT && (
              <button type="button" onClick={() => setShowAll((v) => !v)} className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl text-sm font-semibold text-blue-600 active:bg-blue-50">
                {showAll ? 'Show less' : `Show all ${filtered.length} orders`}
                <Icon className={`h-4 w-4 transition-transform ${showAll ? 'rotate-180' : ''}`}>{I.chevronDown}</Icon>
              </button>
            )}
          </>
        )}
      </section>

      {!walkIn && (
        <section className="space-y-3">
          <SectionTitle title="Contact details" />
          <ul className={`${card} divide-y divide-slate-100 overflow-hidden`}>
            {/* A saved number already has Call / Text in the profile; only prompt when it's missing */}
            {!customer.contact && <ContactRow icon={I.phone} label="Mobile" value="" empty="No phone number" onAdd={edit} />}
            <ContactRow
              icon={I.pin} label="Address" value={customer.address} empty="No address saved"
              href={customer.address ? `geo:0,0?q=${encodeURIComponent(customer.address)}` : null} actionLabel="Open in maps" actionIcon={I.pin} onAdd={edit}
            />
            {/* Empty notes get a gentle prompt here; filled ones are shown up top */}
            {!customer.notes && (
              <ContactRow icon={I.note} label="Care notes" value="" empty='e.g. "No fabric softener"' onAdd={edit} />
            )}
          </ul>
        </section>
      )}

      {/* Primary action, pinned above the phone nav */}
      <div className="sticky bottom-0 z-10 -mx-4 -mb-4 border-t border-slate-200/70 bg-white/95 px-4 pb-4 pt-3 shadow-[0_-4px_20px_rgba(15,23,42,0.06)] backdrop-blur md:bottom-4 md:mx-0 md:mb-0 md:rounded-2xl md:border md:pb-3">
        <Link
          to={`/orders/new?customer=${customer.id}`}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-base font-semibold text-white shadow-lg shadow-blue-600/25 transition active:bg-blue-700"
        >
          <Icon className="h-5 w-5">{I.plus}</Icon>New Order{walkIn ? '' : ` for ${customer.full_name.split(' ')[0]}`}
        </Link>
      </div>

      {editing && (
        <Sheet label="Edit customer" onClose={() => setEditing(false)}>
          <CustomerForm
            initial={{ fullName: customer.full_name, contact: customer.contact, address: customer.address, notes: customer.notes }}
            submitLabel="Save changes"
            onCancel={() => setEditing(false)}
            onSubmit={async (c) => { await updateCustomer(id, c); setEditing(false); await load() }}
          />
        </Sheet>
      )}
      {sheet}
    </div>
  )
}
