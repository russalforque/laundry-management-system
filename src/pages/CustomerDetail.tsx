import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
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

const sinceDate = (iso: string) => new Date(iso).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' })

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

/** Details row: icon, label and value, or an "Add" prompt when the field is empty. */
function DetailRow({ icon, label, value, empty, onAdd }: { icon: ReactNode; label: string; value: string; empty: string; onAdd: () => void }) {
  return (
    <li className="flex min-h-16 items-center gap-3 px-4 py-3">
      <Icon className="h-5 w-5 shrink-0 text-slate-400">{icon}</Icon>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium text-slate-500">{label}</span>
        <span className={`block wrap-break-word text-[15px] ${value ? 'text-slate-900' : 'text-slate-400'}`}>{value || empty}</span>
      </span>
      {!value && (
        <button type="button" onClick={onAdd} className="-mr-2 min-h-11 shrink-0 rounded-xl px-3 text-sm font-semibold text-blue-600 active:bg-blue-50">Add</button>
      )}
    </li>
  )
}

/** One column of the stats band in the profile card. */
function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0 px-2 py-3 text-center">
      <div className="truncate text-lg font-bold tabular-nums text-slate-900">{value}</div>
      <div className="truncate text-xs text-slate-500">{label}</div>
    </div>
  )
}

/**
 * Contact action tile (Call, Text, Map). With a link it acts; without one it becomes a dashed
 * "Add …" prompt that opens the edit sheet, so the row keeps its shape either way.
 */
function ActionTile({ href, icon, label, addLabel, onAdd }: { href: string | null; icon: ReactNode; label: string; addLabel: string; onAdd: () => void }) {
  const cls = 'flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-xs font-semibold transition-colors'
  return href ? (
    <a href={href} className={`${cls} bg-blue-50 text-blue-700 active:bg-blue-100`}>
      <Icon className="h-5 w-5">{icon}</Icon>{label}
    </a>
  ) : (
    <button type="button" onClick={onAdd} className={`${cls} border border-dashed border-slate-300 text-slate-500 active:bg-slate-50`}>
      <Icon className="h-5 w-5">{I.plus}</Icon>{addLabel}
    </button>
  )
}

/** A tappable row in the "Needs attention" card. */
function AttentionRow({ icon, tone, title, detail, trailing, onClick }: {
  icon: ReactNode; tone: string; title: string; detail: string; trailing?: ReactNode; onClick: () => void
}) {
  return (
    <li>
      <button type="button" onClick={onClick} className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left active:bg-slate-50">
        <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${tone}`}><Icon className="h-5 w-5">{icon}</Icon></span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-slate-900">{title}</span>
          <span className="block text-xs text-slate-500">{detail}</span>
        </span>
        {trailing}
        <Icon className="-mr-1 h-5 w-5 shrink-0 text-slate-300">{I.chevron}</Icon>
      </button>
    </li>
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
  const ordersRef = useRef<HTMLElement>(null)

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
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
    }
  }

  const header = (
    <header className="flex items-center gap-2">
      <button type="button" onClick={goBack} aria-label="Back" className="-ml-2 grid size-11 place-items-center rounded-full text-slate-800 active:bg-slate-200">
        <Icon className="h-6 w-6">{I.back}</Icon>
      </button>
      <h1 className="min-w-0 flex-1 truncate text-lg font-semibold text-slate-900">Customer</h1>
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
              <div role="menu" className="absolute right-0 origin-top-right animate-menu-in top-12 z-30 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
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
          <div className="space-y-4 motion-safe:animate-pulse" aria-busy="true" aria-label="Loading customer">
            {/* Mirrors the loaded layout so nothing jumps when data arrives */}
            <div className={`${card} p-5`}>
              <div className="mx-auto size-20 rounded-full bg-slate-200/70" />
              <div className="mx-auto mt-3 h-6 w-40 rounded-lg bg-slate-200/70" />
              <div className="mx-auto mt-2 h-4 w-28 rounded-lg bg-slate-200/70" />
              <div className="mt-5 grid grid-cols-3 gap-2">
                {[0, 1, 2].map((i) => <div key={i} className="h-16 rounded-xl bg-slate-200/70" />)}
              </div>
            </div>
            <div className="h-24 rounded-2xl bg-slate-200/60" />
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
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-slate-100 text-slate-400"><Icon className="h-7 w-7">{I.user}</Icon></span>
          <p className="mt-3 font-semibold text-slate-900">Customer not found</p>
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
  const owed = stats?.outstanding_cents ?? 0
  const filtered = filter === 'open' ? orders.filter(isOpen) : filter === 'unpaid' ? orders.filter(isUnpaid) : orders
  const shown = showAll ? filtered : filtered.slice(0, RECENT)
  const edit = () => setEditing(true)
  const pickFilter = (f: OrderFilter) => { setFilter(f); setShowAll(false) }
  /** From the attention card: filter the list, then bring it into view. */
  const jumpTo = (f: OrderFilter) => {
    pickFilter(f)
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ordersRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' })
  }

  const FILTERS: { id: OrderFilter; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: orders.length },
    { id: 'open', label: 'In shop', count: openCount },
    { id: 'unpaid', label: 'Balance due', count: unpaidCount },
  ]
  const emptyText: Record<OrderFilter, string> = {
    all: 'No orders yet. Tap New Order to start one.',
    open: 'Nothing in the shop for this customer right now.',
    unpaid: 'All orders are fully paid.',
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {header}

      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">{error}</p>}

      {/* Profile: who they are, one-tap ways to reach them, and their history at a glance */}
      <section aria-label="Profile" className={`${card} overflow-hidden`}>
        <div className="px-4 pb-4 pt-6 text-center sm:px-6">
          <Avatar name={customer.full_name} className="mx-auto size-20 text-2xl ring-4 ring-white shadow-sm" />
          <h2 className="mt-3 wrap-break-word text-2xl font-bold leading-tight tracking-tight text-slate-900">{customer.full_name}</h2>
          <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-slate-500">
            {!walkIn && <ActiveBadge active={active} />}
            <span className="font-medium tabular-nums text-slate-600">{customer.customer_code}</span>
            <span aria-hidden className="text-slate-300">•</span>
            <span>Since {sinceDate(customer.created_at)}</span>
          </div>
          {walkIn && <p className="mt-2 text-sm text-slate-500">Past walk-in orders (no longer used for new orders)</p>}

          {!walkIn && (
            <div className="mt-5 grid grid-cols-3 gap-2">
              <ActionTile href={phone && `tel:${phone}`} icon={I.phone} label="Call" addLabel="Add phone" onAdd={edit} />
              <ActionTile href={phone && `sms:${phone}`} icon={I.message} label="Text" addLabel="Add phone" onAdd={edit} />
              <ActionTile
                href={customer.address ? `geo:0,0?q=${encodeURIComponent(customer.address)}` : null}
                icon={I.pin} label="Map" addLabel="Add address" onAdd={edit}
              />
            </div>
          )}
        </div>

        {stats && (
          <div className="grid grid-cols-3 divide-x divide-slate-100 border-t border-slate-100 bg-slate-50/60">
            <Stat value={String(stats.total_orders)} label="Orders" />
            <Stat value={formatPesoShort(stats.total_spent_cents)} label="Total billed" />
            <Stat value={lastVisit(stats.last_order_at)} label="Last order" />
          </div>
        )}
      </section>

      {/* What the counter needs to act on now: pickups waiting and money owed */}
      {(readyCount > 0 || owed > 0) && (
        <section aria-label="Needs attention" className="space-y-2">
          <SectionTitle title="Needs attention" />
          <ul className={`${card} divide-y divide-slate-100 overflow-hidden`}>
            {readyCount > 0 && (
              <AttentionRow
                icon={I.bag} tone="bg-blue-600 text-white"
                title="Ready for pickup"
                detail={`${readyCount} ${readyCount === 1 ? 'order is' : 'orders are'} waiting`}
                onClick={() => jumpTo('open')}
              />
            )}
            {owed > 0 && (
              <AttentionRow
                icon={I.wallet} tone="bg-amber-50 text-amber-600"
                title="Balance due"
                detail={`On ${unpaidCount} ${unpaidCount === 1 ? 'order' : 'orders'}`}
                trailing={<span className="shrink-0 text-base font-bold tabular-nums text-amber-700">{formatPeso(owed)}</span>}
                onClick={() => jumpTo('unpaid')}
              />
            )}
          </ul>
        </section>
      )}

      {/* Care notes: seen before anyone handles the laundry */}
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

      {/* Orders: what staff usually look a customer up for */}
      <section ref={ordersRef} aria-label="Orders" className="scroll-mt-4 space-y-3">
        <SectionTitle title="Orders" />
        {orders.length > 0 && (
          <div role="tablist" aria-label="Filter orders" className="grid grid-cols-3 gap-1 rounded-xl bg-slate-200/60 p-1">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={filter === f.id}
                onClick={() => pickFilter(f.id)}
                className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-medium transition-colors ${
                  filter === f.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 active:bg-white/60'
                }`}
              >
                <span className="truncate">{f.label}</span>
                <span className={`rounded-full px-1.5 text-xs tabular-nums ${filter === f.id ? 'bg-blue-600 text-white' : 'bg-slate-300/60 text-slate-600'}`}>{f.count}</span>
              </button>
            ))}
          </div>
        )}
        {filtered.length === 0 ? (
          <div className={`${card} px-6 py-8 text-center`}>
            <span className="mx-auto grid size-12 place-items-center rounded-full bg-slate-100 text-slate-400"><Icon className="h-6 w-6">{I.orders}</Icon></span>
            <p className="mt-3 text-sm text-slate-500">{emptyText[filter]}</p>
          </div>
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
        <section aria-label="Details" className="space-y-2">
          <SectionTitle title="Details" />
          <ul className={`${card} divide-y divide-slate-100 overflow-hidden`}>
            <DetailRow icon={I.phone} label="Mobile" value={customer.contact} empty="No phone number" onAdd={edit} />
            <DetailRow icon={I.pin} label="Address" value={customer.address} empty="No address saved" onAdd={edit} />
            {/* Filled notes are shown up top; empty ones get a gentle prompt here */}
            {!customer.notes && <DetailRow icon={I.note} label="Care notes" value="" empty='e.g. "No fabric softener"' onAdd={edit} />}
          </ul>
        </section>
      )}

      {/* Primary action, pinned above the phone nav. The legacy walk-in record only keeps past orders. */}
      {!walkIn && <div className="sticky bottom-0 z-10 -mx-4 -mb-4 border-t border-slate-200/70 bg-white/95 px-4 pb-4 pt-3 shadow-[0_-4px_20px_rgba(15,23,42,0.06)] backdrop-blur md:bottom-4 md:mx-0 md:mb-0 md:rounded-2xl md:border md:pb-3">
        <Link
          to={`/orders/new?customer=${customer.id}`}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-base font-semibold text-white shadow-lg shadow-blue-600/25 transition active:bg-blue-700"
        >
          <Icon className="h-5 w-5">{I.plus}</Icon>New Order for {customer.full_name.split(' ')[0]}
        </Link>
      </div>}

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
