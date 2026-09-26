import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { formatPeso, formatPickup } from '../../lib/money'
import { isFinal, STATUS_FLOW, STATUS_LABEL } from '../../lib/orders'
import type { OrderStatus } from '../../types'
import { Avatar } from '../Avatar'
import { PaymentBadge } from '../Badges'
import { I, Icon } from '../Icons'
import { when } from '../OrderCard'
import { panel, soft, StepTrack, type Detail, type StepState } from './shared'

/** Status card look per status and what staff should know or do next. */
const STATUS_META: Record<OrderStatus, { tile: string; title: string; icon: ReactNode; desc: string }> = {
  received: { tile: 'bg-white text-blue-600 ring-1 ring-blue-200', title: 'text-slate-900', icon: I.clock, desc: 'Waiting for a washer. Assign one in the Machines step.' },
  washing: { tile: 'bg-blue-600 text-white', title: 'text-blue-700', icon: I.washer, desc: 'In the washer. Finish washing in the Machines step when the cycle ends.' },
  drying: { tile: 'bg-blue-600 text-white', title: 'text-blue-700', icon: I.refresh, desc: 'In the dryer. Finish drying in the Machines step when the cycle ends.' },
  ready: { tile: 'bg-blue-600 text-white', title: 'text-blue-700', icon: I.bag, desc: 'Folded and waiting for the customer.' },
  released: { tile: 'bg-emerald-600 text-white', title: 'text-emerald-700', icon: I.check, desc: 'Picked up by the customer.' },
  cancelled: { tile: 'bg-red-600 text-white', title: 'text-red-700', icon: I.x, desc: 'This order was cancelled and can no longer be changed.' },
}

/** Short labels so all five steps fit side by side on a phone. */
const PROGRESS_LABEL: Partial<Record<OrderStatus, string>> = { received: 'Received', washing: 'Washing', drying: 'Drying', ready: 'Ready', released: 'Completed' }

/** A contact that looks like a phone number, normalized for a tel: link; null otherwise. */
const phoneOf = (contact: string | null | undefined) => {
  const digits = contact?.replace(/[\s()-]/g, '') ?? ''
  return /^\+?\d{7,15}$/.test(digits) ? digits : null
}

/** Expected pickup ("YYYY-MM-DD" or "YYYY-MM-DD HH:MM") as the moment it's due; a date alone is due by end of day. */
const pickupDue = (value: string) => {
  const [date, time] = value.split(' ')
  const d = new Date(`${date}T${time || '23:59'}`)
  return Number.isNaN(d.getTime()) ? null : d
}

/** One "when" fact (Received, Pickup due, Picked up) in its own small card. */
function WhenCard({ icon, label, value, by, tone, children }: {
  icon: ReactNode; label: string; value: string; by?: string | null; tone?: 'late' | 'done'; children?: ReactNode
}) {
  const head = tone === 'late' ? 'text-amber-700' : tone === 'done' ? 'text-emerald-700' : 'text-slate-500'
  return (
    <div className={`${panel} flex flex-col p-4 ${tone === 'late' ? 'border-amber-200 bg-amber-50/60' : ''}`}>
      <p className={`flex items-center gap-2 text-sm ${head}`}><Icon className="h-5 w-5">{icon}</Icon><span className="truncate">{label}</span></p>
      <p className="mt-1.5 font-bold tabular-nums text-slate-900">{value}</p>
      {by && <p className="truncate text-sm text-slate-500">by {by}</p>}
      {children}
    </div>
  )
}

export function OrderInfoStep({ data, driedSkipped, washed, onSetDue, onEditNote }: {
  data: Detail
  /** The order went from washing straight to Ready (no dryer). */
  driedSkipped: boolean
  /** Washing finished but not yet in a dryer or marked Ready. */
  washed: boolean
  onSetDue: () => void
  onEditNote: () => void
}) {
  const { order } = data
  const meta = STATUS_META[order.status]
  const locked = isFinal(order.status)
  const balance = order.total_cents - order.paid_cents
  const phone = phoneOf(order.customer_contact)
  const due = order.expected_pickup ? pickupDue(order.expected_pickup) : null
  // Late only matters while the shop still owes the work; once Ready, the wait is on the customer.
  const late = !!due && !locked && order.status !== 'ready' && due.getTime() < Date.now()

  const idx = STATUS_FLOW.indexOf(order.status)
  const progress = STATUS_FLOW.map((s, i) => {
    const state: StepState = s === 'drying' && driedSkipped ? 'skipped'
      : i < idx || order.status === 'released' ? 'done'
      : i === idx ? 'current' : 'todo'
    return { label: state === 'skipped' ? 'Skipped' : PROGRESS_LABEL[s]!, state }
  })

  return (
    <div className="space-y-4">
      {/* Where the order is, whether it's paid, and what happens next */}
      <section role="status" className="rounded-3xl border border-blue-100 bg-linear-to-b from-blue-50 to-white p-4 shadow-[0_2px_10px_rgba(37,99,235,0.06)] sm:p-5">
        <div className="flex items-start gap-3.5">
          <span className={`grid size-14 shrink-0 place-items-center rounded-2xl ${meta.tile}`}>
            <Icon className="h-7 w-7">{meta.icon}</Icon>
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className={`min-w-0 text-xl font-bold leading-tight tracking-tight ${meta.title}`}>{STATUS_LABEL[order.status]}</p>
              {order.status !== 'cancelled' && <PaymentBadge status={order.payment_status} />}
            </div>
            <p className="mt-1 text-[15px] leading-snug text-slate-600">
              {washed ? 'Washing done — move it to a dryer, or mark it ready if no drying is needed.' : meta.desc}
              {order.status === 'ready' && (balance > 0
                ? <> Collect <b className="font-semibold text-slate-900">{formatPeso(balance)}</b> before release.</>
                : ' Fully paid — ready to hand over.')}
            </p>
          </div>
        </div>
        {order.status !== 'cancelled' && (
          <div className="mt-5">
            <StepTrack steps={progress} label="Order progress" size="sm" />
          </div>
        )}
      </section>

      {/* Customer: tap for their profile, or call straight from here */}
      <section className={`${panel} flex items-center gap-2 p-2`}>
        <Link to={`/customers/${order.customer_id}`} className="flex min-h-16 min-w-0 flex-1 items-center gap-3.5 rounded-2xl p-2 active:bg-slate-50">
          <Avatar name={order.customer_name} tone="bg-blue-600 text-white" className="size-14 text-lg" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm text-slate-500">Customer</span>
            <span className="block truncate text-[17px] font-bold text-slate-900">{order.customer_name}</span>
            <span className="block truncate text-sm tabular-nums text-slate-500">{order.customer_contact || 'No contact number'}</span>
          </span>
        </Link>
        {phone && (
          <a href={`tel:${phone}`} aria-label={`Call ${order.customer_name}`} className="mr-2 grid size-12 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-600 active:bg-blue-100">
            <Icon className="h-5 w-5">{I.phone}</Icon>
          </a>
        )}
      </section>

      {/* When and who */}
      <div className="grid grid-cols-2 gap-3">
        <WhenCard icon={I.clock} label="Received" value={when(order.received_at)} by={order.created_by_name} />
        {order.status === 'released' ? (
          <WhenCard icon={I.bag} label="Picked up" value={order.released_at ? when(order.released_at) : '—'} by={order.released_by_name} tone="done" />
        ) : order.status === 'cancelled' ? (
          <WhenCard icon={I.calendar} label="Pickup" value="Cancelled" />
        ) : order.expected_pickup ? (
          <WhenCard icon={I.calendar} label={late ? 'Pickup · Overdue' : 'Pickup due'} value={formatPickup(order.expected_pickup)} tone={late ? 'late' : undefined}>
            <button type="button" onClick={onSetDue} className="-mb-1 mt-auto inline-flex min-h-11 items-center self-start text-sm font-semibold text-blue-600">Change</button>
          </WhenCard>
        ) : (
          <WhenCard icon={I.calendar} label="Pickup due" value="Not scheduled">
            <button type="button" onClick={onSetDue} className={`${soft} mt-2 min-h-11 w-full text-sm`}>Set due date</button>
          </WhenCard>
        )}
      </div>

      {/* Notes are instructions for staff (e.g. "separate whites") */}
      <section className={`${panel} flex items-center gap-3.5 p-4`}>
        <span className={`grid size-12 shrink-0 place-items-center rounded-2xl ${order.notes ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>
          <Icon className="h-6 w-6">{I.note}</Icon>
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-slate-900">Notes</h3>
          <p className={`whitespace-pre-wrap wrap-break-word text-sm ${order.notes ? 'text-slate-700' : 'text-slate-500'}`}>{order.notes || 'No notes added.'}</p>
        </div>
        {!locked && (
          <button type="button" onClick={onEditNote} className="-mr-1 inline-flex min-h-11 shrink-0 items-center rounded-xl px-2 text-sm font-semibold text-blue-600 active:bg-blue-50">
            {order.notes ? 'Edit' : 'Add note'}
          </button>
        )}
      </section>
    </div>
  )
}
