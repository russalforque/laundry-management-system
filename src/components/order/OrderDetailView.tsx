import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { OrderDetailCtl } from '../../hooks/useOrderDetail'
import { formatDateTime, formatPeso, formatPickup, formatStamp } from '../../lib/money'
import { isFinal, METHOD_LABEL, PROCESSING, STATUS_FLOW } from '../../lib/orders'
import { qtyText, TYPE_UNIT, typeOf } from '../../lib/pricing'
import type { OrderItemRow, OrderStatus } from '../../types'
import { Avatar } from '../Avatar'
import { PaymentBadge, StatusBadge } from '../Badges'
import { I, Icon, serviceIcon } from '../Icons'
import { EmptyCard } from '../Manage'
import { when } from '../OrderCard'
import { FloatingToast } from '../Toast'
import { BasketTagButton, loaded, NextStep, OrderDetailSheets, ReceiptButton, ScanBanner } from './OrderDetailParts'
import { panel, solid, StepTrack, type Detail, type StepState } from './shared'

/**
 * Order Details on phones (pages/mobile/MobileOrderDetails.tsx); tablets and desktops have their own workspace layout
 * (pages/desktop-tablet/OrderDetails.tsx) built from the pieces exported here. Read top to bottom by importance:
 *   header     order number, status and payment once, customer; secondary actions in the More menu
 *   next step  the single large action (or the final state: picked up / cancelled)
 *   progress   Received → Processing → Ready → Completed, with Print Receipt / Print Basket Tag
 *   items      one line each, tap to edit; totals once
 *   payment    what's paid and owed, payments and refunds
 *   customer   contact, pickup date, notes
 *   history    who moved the order on, and when
 * Everything runs through hooks/useOrderDetail.ts, and the database re-checks every change.
 */

/** Short labels so all four steps fit side by side on a phone. */
const PROGRESS_LABEL: Partial<Record<OrderStatus, string>> = { received: 'Received', [PROCESSING]: 'Processing', ready: 'Ready', released: 'Completed' }

/** Received → Processing → Ready → Completed as StepTrack steps. */
export function orderProgress(status: OrderStatus) {
  const idx = STATUS_FLOW.indexOf(status)
  return STATUS_FLOW.map((s, i) => {
    const state: StepState = i < idx || status === 'released' ? 'done' : i === idx ? 'current' : 'todo'
    return { label: PROGRESS_LABEL[s]!, state }
  })
}

/** A contact that looks like a phone number, normalized for a tel: link; null otherwise. */
export const phoneOf = (contact: string | null | undefined) => {
  const digits = contact?.replace(/[\s()-]/g, '') ?? ''
  return /^\+?\d{7,15}$/.test(digits) ? digits : null
}

/** Expected pickup ("YYYY-MM-DD" or "YYYY-MM-DD HH:MM") as the moment it's due; a date alone is due by end of day. */
export const pickupDue = (value: string) => {
  const [date, t] = value.split(' ')
  const d = new Date(`${date}T${t || '23:59'}`)
  return Number.isNaN(d.getTime()) ? null : d
}

const textBtn = 'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-blue-700 hover:bg-blue-50 active:bg-blue-50 disabled:opacity-50'

/** A section card with a small heading and an optional action on the right. */
function Card({ title, action, children, className = '' }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={`${panel} p-4 sm:p-5 ${className}`}>
      <div className="-mt-1 mb-2 flex min-h-11 items-center justify-between gap-2">
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        {action && <div className="-mr-2 flex flex-wrap justify-end">{action}</div>}
      </div>
      {children}
    </section>
  )
}

function SumRow({ label, children, strong }: { label: ReactNode; children: ReactNode; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${strong ? 'pt-1 text-base font-bold text-slate-900' : 'text-sm text-slate-600'}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{children}</dd>
    </div>
  )
}

export default function OrderDetailView({ o }: { o: OrderDetailCtl }) {
  const l = loaded(o)
  const header = (title: ReactNode, sub?: ReactNode, badges?: ReactNode, menu?: ReactNode) => (
    <header className="sticky -top-4 z-20 -mx-4 -mt-4 flex items-start gap-2 bg-blue-50/95 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur">
      <button type="button" onClick={o.back} aria-label="Back to orders" className="-ml-2 grid size-11 shrink-0 place-items-center rounded-full text-slate-900 hover:bg-blue-100 active:bg-blue-100">
        <Icon className="h-6 w-6">{I.back}</Icon>
      </button>
      <div className="min-w-0 flex-1 pt-1">
        <h1 className="truncate text-xl font-bold tracking-tight text-slate-900">{title}</h1>
        {(badges || sub) && (
          // Status and payment once, next to who it's for; wraps cleanly on a phone.
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            {badges}
            {sub && <span className="min-w-0 text-sm text-slate-500">{sub}</span>}
          </div>
        )}
      </div>
      {menu}
    </header>
  )

  if (!l) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        {header('Order Details')}
        {o.data === null ? (
          <div className={panel}><EmptyCard icon={I.orders} title="Order not found" text="It may have been removed or the link is wrong." /></div>
        ) : o.loadError ? (
          <div className={panel}>
            <EmptyCard icon={I.info} title="Couldn't load this order" text={o.loadError} />
            <div className="px-6 pb-8 text-center">
              <button type="button" onClick={o.load} className={solid}><Icon className="h-5 w-5">{I.refresh}</Icon>Try again</button>
            </div>
          </div>
        ) : (
          <div aria-busy="true" aria-label="Loading order" className="animate-pulse space-y-4 motion-reduce:animate-none">
            <div className="h-44 rounded-3xl bg-white/70" />
            <div className="h-20 rounded-3xl bg-white/70" />
            <div className="h-40 rounded-3xl bg-white/70" />
          </div>
        )}
      </div>
    )
  }

  const { order } = l.data
  const { locked } = l.flags
  const cancelled = order.status === 'cancelled'

  const main = (
    <>
      <ScanBanner o={o} />
      <FinalState o={o} />
      <NextStep o={o} />
      {!cancelled && (
        <div className={`${panel} px-3 pb-2 pt-3`}>
          <StepTrack steps={orderProgress(order.status)} label="Order progress" size="sm" />
          {/* Receipt and basket tag, one tap away at every stage. */}
          <div className="mt-1 flex border-t border-slate-100 pt-1">
            <ReceiptButton o={o} className={`${textBtn} flex-1 justify-center`} />
            <BasketTagButton o={o} className={`${textBtn} flex-1 justify-center`} />
          </div>
        </div>
      )}
      <ItemsCard o={o} data={l.data} editable={!locked} />
      <PaymentCard o={o} data={l.data} />
    </>
  )
  const side = (
    <>
      <CustomerCard o={o} data={l.data} />
      <TimelineCard data={l.data} />
    </>
  )

  return (
    <div className="mx-auto max-w-2xl pb-4">
      {header(
        `Order #${order.order_number}`,
        <>{order.customer_name} · Received {when(order.received_at)}</>,
        <>
          <StatusBadge status={order.status} />
          {!cancelled && <PaymentBadge status={order.payment_status} />}
        </>,
        <MoreMenu o={o} customerId={order.customer_id} canCancel={!locked} />,
      )}

      <div className="mt-3 space-y-4">{main}{side}</div>

      <FloatingToast msg={o.msg} onDismiss={() => o.setMsg(null)} />
      <OrderDetailSheets o={o} />
    </div>
  )
}

/** Secondary and destructive actions, out of the way of the next step: View Customer, Print Receipt / Basket Tag, Cancel Order. */
function MoreMenu({ o, customerId, canCancel }: { o: OrderDetailCtl; customerId: number; canCancel: boolean }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])
  const item = 'flex min-h-12 w-full items-center gap-3 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-50'
  return (
    <div className="relative -mr-2 shrink-0">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-label="More actions" aria-haspopup="menu" aria-expanded={open} className="grid size-11 place-items-center rounded-full text-slate-900 hover:bg-blue-100 active:bg-blue-100">
        <Icon className="h-6 w-6">{I.more}</Icon>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute right-0 top-12 z-20 w-56 origin-top-right animate-menu-in overflow-hidden rounded-2xl border border-slate-200 bg-white py-1 shadow-lg">
            <Link role="menuitem" to={`/customers/${customerId}`} className={item}><Icon className="h-5 w-5 text-slate-500">{I.user}</Icon>View Customer</Link>
            <button role="menuitem" type="button" onClick={() => { setOpen(false); o.printReceipt() }} disabled={!!o.printing} className={item}>
              <Icon className="h-5 w-5 text-slate-500">{I.printer}</Icon>Print Receipt
            </button>
            {loaded(o)?.flags.canTag && (
              <button role="menuitem" type="button" onClick={() => { setOpen(false); o.printTag() }} disabled={!!o.printing} className={item}>
                <Icon className="h-5 w-5 text-slate-500">{I.basket}</Icon>Print Basket Tag
              </button>
            )}
            {canCancel && (
              <button role="menuitem" type="button" onClick={() => { setOpen(false); o.cancelOrder() }} className="flex min-h-12 w-full items-center gap-3 border-t border-slate-100 px-4 text-sm font-medium text-red-600 hover:bg-red-50 active:bg-red-50">
                <Icon className="h-5 w-5">{I.x}</Icon>Cancel Order
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/** Completed or cancelled: the order's final word, with the one thing left to do (print, refund). */
export function FinalState({ o }: { o: OrderDetailCtl }) {
  const l = loaded(o)
  if (!l) return null
  const { order } = l.data
  if (l.flags.pickedUp) {
    return (
      <section role="status" className="rounded-3xl border-2 border-emerald-200 bg-emerald-50 p-4 sm:p-5">
        <div className="flex items-center gap-3.5">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-emerald-600 text-white"><Icon className="h-6 w-6">{I.bag}</Icon></span>
          <div className="min-w-0">
            <p className="text-xl font-bold leading-tight text-emerald-900">Completed · Laundry picked up</p>
            <p className="mt-0.5 text-sm text-emerald-800">
              {order.released_at ? formatDateTime(order.released_at) : 'Released'}{order.released_by_name ? ` by ${order.released_by_name}` : ''}
            </p>
          </div>
        </div>
        {o.scanned && <p className="mt-3 font-semibold text-red-700">Already released. Do not hand it over again.</p>}
        <ReceiptButton o={o} className={`${solid} mt-4 min-h-13 w-full text-base`} label="Reprint Receipt" />
      </section>
    )
  }
  if (order.status !== 'cancelled') return null
  const refundable = l.flags.refundable
  return (
    <section role="status" className="rounded-3xl border-2 border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex items-center gap-3.5">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-slate-200 text-slate-600"><Icon className="h-6 w-6">{I.x}</Icon></span>
        <div className="min-w-0">
          <p className="text-xl font-bold leading-tight text-slate-900">Order cancelled</p>
          <p className="mt-0.5 text-sm text-slate-500">
            {refundable > 0 ? `${formatPeso(refundable)} was paid and hasn't been refunded yet.` : 'Nothing left to do. Its details can no longer change.'}
          </p>
        </div>
      </div>
      {l.flags.canRefund && (
        <button type="button" onClick={() => o.setRefunding({ skipPin: false })} disabled={o.busy} className={`${solid} mt-4 min-h-13 w-full text-base`}>
          <Icon className="h-5 w-5">{I.wallet}</Icon>Refund {formatPeso(refundable)}
        </button>
      )}
    </section>
  )
}

/** "2 loads (14.5 kg) · ₱90/load", "1 pc · ₱20/pc", "Flat rate". */
function lineDetail(i: OrderItemRow) {
  const t = typeOf(i)
  if (t === 'fixed') return 'Flat rate'
  return `${qtyText(t, i.quantity)}${i.weight_kg ? ` (${i.weight_kg} kg)` : ''} · ${formatPeso(i.unit_price_cents)}${TYPE_UNIT[t]}`
}

/** Every line on the order (tap one to change or remove it), add service / add-on, and the totals. */
function ItemsCard({ o, data, editable }: { o: OrderDetailCtl; data: Detail; editable: boolean }) {
  const { order, items } = data
  const n = items.length
  return (
    <Card
      title={`Items · ${n}`}
      action={editable && (
        <>
          <button type="button" onClick={() => o.setEdit({ kind: 'add' })} disabled={o.busy} className={textBtn}><Icon className="h-4 w-4">{I.plus}</Icon>Service</button>
          <button type="button" onClick={() => o.setEdit({ kind: 'add', addons: true })} disabled={o.busy} className={textBtn}><Icon className="h-4 w-4">{I.plus}</Icon>Add-on</button>
        </>
      )}
    >
      <ul className="-mx-2 divide-y divide-slate-100">
        {items.map((i) => {
          const allIncluded = i.included_qty >= i.quantity && !i.amount_cents
          const body = (
            <>
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600"><Icon className="h-5 w-5">{serviceIcon(i.service_name)}</Icon></span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold leading-snug text-slate-900">{i.service_name}</span>
                <span className="block text-sm text-slate-500">{lineDetail(i)}</span>
                {i.included_qty > 0 && !allIncluded && <span className="block text-xs font-medium text-emerald-700">{i.included_qty} included</span>}
                {i.note && <span className="block text-xs text-slate-400">{i.note}</span>}
              </span>
              <span className={`shrink-0 font-semibold tabular-nums ${allIncluded ? 'text-sm text-emerald-700' : 'text-slate-900'}`}>{allIncluded ? 'Included' : formatPeso(i.amount_cents)}</span>
              {editable && <Icon className="h-5 w-5 shrink-0 text-slate-300">{I.chevron}</Icon>}
            </>
          )
          return (
            <li key={i.id}>
              {editable ? (
                <button type="button" onClick={() => o.setEdit({ kind: 'item', line: i })} aria-label={`Change ${i.service_name}`} className="flex min-h-16 w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left hover:bg-slate-50 active:bg-slate-50">{body}</button>
              ) : <div className="flex items-center gap-3 px-2 py-2.5">{body}</div>}
            </li>
          )
        })}
      </ul>
      <dl className="mt-2 space-y-1.5 border-t border-slate-100 pt-3">
        {order.discount_cents > 0 && (
          <>
            <SumRow label="Subtotal">{formatPeso(order.subtotal_cents)}</SumRow>
            <SumRow label="Discount">−{formatPeso(order.discount_cents)}</SumRow>
          </>
        )}
        <SumRow label="Total" strong>{formatPeso(order.total_cents)}</SumRow>
      </dl>
    </Card>
  )
}

export const methodIcon = (m: string) => (m === 'cash' ? I.wallet : m === 'gcash' ? I.phone : I.peso)

/** Paid and owed, each payment and refund. Collecting is offered here unless it's already the next step. */
function PaymentCard({ o, data }: { o: OrderDetailCtl; data: Detail }) {
  const { order, payments, refunds } = data
  const l = loaded(o)!
  const { balance, canPay } = l.flags
  const cancelled = order.status === 'cancelled'
  return (
    <Card
      title="Payment"
      action={canPay && order.status !== 'ready' && (
        <button type="button" onClick={() => o.setPaying(true)} disabled={o.busy} className={textBtn}><Icon className="h-4 w-4">{I.wallet}</Icon>Collect {formatPeso(balance)}</button>
      )}
    >
      <dl className="space-y-1.5">
        <SumRow label="Total">{formatPeso(order.total_cents)}</SumRow>
        <SumRow label="Paid">{formatPeso(order.paid_cents)}</SumRow>
        {cancelled ? (
          order.refunded_cents > 0 && <SumRow label="Refunded">{formatPeso(order.refunded_cents)}</SumRow>
        ) : (
          <SumRow label={balance > 0 ? 'Balance due' : 'Balance'} strong><span className={balance > 0 ? 'text-red-700' : ''}>{formatPeso(balance)}</span></SumRow>
        )}
      </dl>
      {(payments.length > 0 || refunds.length > 0) && (
        <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3">
          {payments.map((p) => (
            <li key={`p${p.id}`} className="flex items-center gap-3 py-1.5 text-sm">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><Icon className="h-5 w-5">{methodIcon(p.method)}</Icon></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-slate-900">{METHOD_LABEL[p.method] ?? p.method}{p.reference && <span className="font-normal text-slate-500"> · Ref. {p.reference}</span>}</span>
                <span className="block truncate text-xs text-slate-500">{when(p.paid_at)}{p.user_name ? ` · ${p.user_name}` : ''}</span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums text-slate-900">{formatPeso(p.amount_cents)}</span>
            </li>
          ))}
          {refunds.map((r) => (
            <li key={`r${r.id}`} className="flex items-center gap-3 py-1.5 text-sm">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-red-50 text-red-600"><Icon className="h-5 w-5">{I.wallet}</Icon></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-slate-900">Refund · {METHOD_LABEL[r.method] ?? r.method}{r.reason && <span className="font-normal text-slate-500"> · {r.reason}</span>}</span>
                <span className="block truncate text-xs text-slate-500">{when(r.refunded_at)} · {r.user_name}</span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums text-red-700">−{formatPeso(r.amount_cents)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/** Who it's for and the practical details: call, pickup date, notes for staff. */
function CustomerCard({ o, data }: { o: OrderDetailCtl; data: Detail }) {
  const { order } = data
  const locked = isFinal(order.status)
  const phone = phoneOf(order.customer_contact)
  const due = order.expected_pickup ? pickupDue(order.expected_pickup) : null
  // Late only matters while the shop still owes the work; once Ready, the wait is on the customer.
  const late = !!due && !locked && order.status !== 'ready' && due.getTime() < Date.now()
  const row = 'flex min-h-14 items-center gap-3 border-t border-slate-100 py-2'
  return (
    <section aria-label="Customer" className={`${panel} px-4 pb-2 pt-3 sm:px-5`}>
      <div className="flex items-center gap-3 pb-3">
        <Link to={`/customers/${order.customer_id}`} className="-m-1.5 flex min-w-0 flex-1 items-center gap-3 rounded-2xl p-1.5 hover:bg-slate-50 active:bg-slate-50">
          <Avatar name={order.customer_name} tone="bg-blue-600 text-white" className="size-12 text-base" />
          <span className="min-w-0">
            <span className="block truncate font-bold text-slate-900">{order.customer_name}</span>
            <span className="block truncate text-sm tabular-nums text-slate-500">{order.customer_contact || 'No contact number'}</span>
          </span>
        </Link>
        {phone && (
          <a href={`tel:${phone}`} aria-label={`Call ${order.customer_name}`} className="grid size-11 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 active:bg-blue-100">
            <Icon className="h-5 w-5">{I.phone}</Icon>
          </a>
        )}
      </div>
      <div className={row}>
        <Icon className={`h-5 w-5 shrink-0 ${late ? 'text-amber-600' : 'text-slate-400'}`}>{I.calendar}</Icon>
        <span className="min-w-0 flex-1">
          <span className={`block text-xs ${late ? 'font-semibold text-amber-700' : 'text-slate-500'}`}>{late ? 'Pickup · Overdue' : 'Pickup'}</span>
          <span className="block truncate text-sm font-semibold text-slate-900">{order.expected_pickup ? formatPickup(order.expected_pickup) : 'Not scheduled'}</span>
        </span>
        {!locked && <button type="button" onClick={() => o.setEdit({ kind: 'due' })} className={textBtn}>{order.expected_pickup ? 'Change' : 'Set'}</button>}
      </div>
      <div className={row}>
        <Icon className={`h-5 w-5 shrink-0 ${order.notes ? 'text-amber-500' : 'text-slate-400'}`}>{I.note}</Icon>
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-slate-500">Notes</span>
          <span className={`block whitespace-pre-wrap wrap-break-word text-sm ${order.notes ? 'font-medium text-slate-900' : 'text-slate-400'}`}>{order.notes || 'None'}</span>
        </span>
        {!locked && <button type="button" onClick={() => o.setEdit({ kind: 'note' })} className={textBtn}>{order.notes ? 'Edit' : 'Add'}</button>}
      </div>
    </section>
  )
}

export interface TimelineEvent { at: string; label: string; detail?: string; tone?: 'done' }

const byName = (name: string | null | undefined) => (name ? `by ${name}` : undefined)

/** Who moved the order on and when, oldest first: Received → Processing → Ready for Pickup → Completed. */
export function timelineEvents({ order }: Detail) {
  const events: TimelineEvent[] = [{ at: order.received_at, label: 'Received', detail: byName(order.created_by_name) }]
  if (order.processing_at) events.push({ at: order.processing_at, label: 'Processing started', detail: byName(order.processing_by_name) })
  if (order.ready_at) events.push({ at: order.ready_at, label: 'Ready for pickup', detail: byName(order.ready_by_name) })
  if (order.released_at) events.push({ at: order.released_at, label: 'Completed · picked up', detail: byName(order.released_by_name), tone: 'done' })
  events.sort((x, y) => x.at.localeCompare(y.at))
  return events
}

/** The events as a dotted rail, green once picked up. */
export function Timeline({ events }: { events: TimelineEvent[] }) {
  return (
    <ol className="relative space-y-3 pl-5 before:absolute before:bottom-2 before:left-1.25 before:top-2 before:w-0.5 before:bg-slate-100">
      {events.map((e, i) => (
        <li key={i} className="relative">
          <span aria-hidden className={`absolute -left-5 top-1.5 size-3 rounded-full ring-4 ring-white ${e.tone === 'done' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
          <p className="flex items-baseline justify-between gap-2 text-sm">
            <span className="min-w-0 font-semibold text-slate-900">{e.label}</span>
            <span className="shrink-0 text-xs tabular-nums text-slate-500">{formatStamp(e.at)}</span>
          </p>
          {e.detail && <p className="truncate text-xs text-slate-500">{e.detail}</p>}
        </li>
      ))}
    </ol>
  )
}

function TimelineCard({ data }: { data: Detail }) {
  return <Card title="History"><Timeline events={timelineEvents(data)} /></Card>
}
