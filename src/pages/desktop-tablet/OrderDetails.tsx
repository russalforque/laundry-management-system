import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Avatar } from '../../components/Avatar'
import { I, Icon, serviceIcon } from '../../components/Icons'
import { when } from '../../components/OrderCard'
import { ActionBar, bigPrimary, bigSecondary, column, fullBleed, quietBtn, Section, StateMessage } from '../../components/desktop-tablet/orderParts'
import { btnDanger, Owed, StatusPill } from '../../components/desktop-tablet/ui'
import { nextStepModel, type NextStepModel } from '../../components/order/NextStepCard'
import { BasketTagButton, loaded, nextStepProps, OrderDetailSheets, ReceiptButton, ScanBanner } from '../../components/order/OrderDetailParts'
import { FinalState, methodIcon, orderProgress, phoneOf, pickupDue, Timeline, timelineEvents } from '../../components/order/OrderDetailView'
import { StepTrack, type Detail } from '../../components/order/shared'
import { FloatingToast } from '../../components/Toast'
import { useOrderDetail, type OrderDetailCtl } from '../../hooks/useOrderDetail'
import { formatPeso, formatPickup } from '../../lib/money'
import { isFinal, METHOD_LABEL } from '../../lib/orders'
import { qtyText, TYPE_UNIT, typeOf } from '../../lib/pricing'
import type { OrderItemRow } from '../../types'

/**
 * Order Details on tablets (landscape first) and desktops: one column, read top to bottom by what matters now.
 *   header     #L-0015 · status · what's owed, and whose order it is
 *   body       services & add-ons → total → payment → status → pickup → notes → history
 *   bar        the one next step, pinned to the bottom (Start Processing, Mark Ready for Pickup, Collect Balance, Complete Order)
 * Cancel Order sits apart at the very end. Everything runs through hooks/useOrderDetail.ts, the same as the phone page,
 * and the database re-checks every change.
 */
export default function OrderDetails() {
  const o = useOrderDetail(Number(useParams().id))
  const l = loaded(o)
  const back = (
    <button type="button" onClick={o.back} className="-ml-3 inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-[15px] font-semibold text-slate-600 hover:bg-slate-200/60 active:bg-slate-200">
      <Icon className="h-5 w-5">{I.back}</Icon>Orders
    </button>
  )

  if (!l) {
    return (
      <div className={`${column} space-y-4`}>
        {back}
        <div className="rounded-2xl bg-white">
          {o.data === null ? (
            <StateMessage icon={I.orders} title="Order not found" text="It may have been removed, or the link is wrong. Find it from the order list instead." action={<Link to="/orders" className={bigSecondary}>Back to orders</Link>} />
          ) : o.loadError ? (
            <StateMessage icon={I.info} title="Couldn't load this order" text={o.loadError} action={<button type="button" onClick={o.load} className={bigPrimary}><Icon className="h-5 w-5">{I.refresh}</Icon>Try again</button>} />
          ) : (
            <div className="space-y-5 p-6 motion-safe:animate-pulse" aria-busy="true" aria-label="Loading order">
              <div className="h-10 w-64 rounded-lg bg-slate-200" />
              <div className="h-5 w-80 rounded bg-slate-100" />
              <div className="h-40 rounded-xl bg-slate-100" />
              <div className="h-24 rounded-xl bg-slate-100" />
            </div>
          )}
        </div>
      </div>
    )
  }

  const { order } = l.data
  const { locked, balance } = l.flags
  const props = nextStepProps(o)!
  const model = nextStepModel(props)
  const cancelled = order.status === 'cancelled'
  const phone = phoneOf(order.customer_contact)

  return (
    <div className={fullBleed}>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-10 pt-5">
        <div className={column}>
          {back}

          {/* ── Top: which order, where it is, whose it is ─────── */}
          <header className="mt-2 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-4xl font-bold tracking-tight text-slate-900 tabular-nums">#{order.order_number}</h1>
                <StatusPill status={order.status} />
                <Owed status={order.status} pay={order.payment_status} balance={balance} />
              </div>
              <p className="mt-1 text-[15px] text-slate-500">Received {when(order.received_at)}{order.created_by_name ? ` by ${order.created_by_name}` : ''}</p>
              {/* Receipt and basket tag, one tap away at every stage */}
              <div className="-ml-3 mt-2 flex flex-wrap gap-1">
                <ReceiptButton o={o} className={quietBtn} />
                <BasketTagButton o={o} className={quietBtn} />
              </div>
            </div>
            <div className="flex min-w-0 items-center gap-3">
              <Link to={`/customers/${order.customer_id}`} className="-m-2 flex min-w-0 items-center gap-3 rounded-2xl p-2 hover:bg-slate-200/50 active:bg-slate-200">
                <Avatar name={order.customer_name} tone="bg-blue-600 text-white" className="size-12 text-base" />
                <span className="min-w-0">
                  <span className="block truncate text-lg font-semibold text-slate-900">{order.customer_name}</span>
                  <span className="block truncate text-sm tabular-nums text-slate-500">{order.customer_contact || 'No contact number'}</span>
                </span>
              </Link>
              {phone && (
                <a href={`tel:${phone}`} className={`${bigSecondary} min-h-12 px-4 text-sm`}><Icon className="h-5 w-5">{I.phone}</Icon>Call</a>
              )}
            </div>
          </header>

          <div className="mt-5 space-y-4 empty:hidden">
            <ScanBanner o={o} />
            <FinalState o={o} />
          </div>

          {/* ── Body: one surface, sections by importance ───────── */}
          <div className="mt-5 rounded-2xl bg-white px-7 py-6 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
            <ItemsSection o={o} data={l.data} editable={!locked} />
            <PaymentSection o={o} data={l.data} />
            {!cancelled && (
              <Section title="Status">
                <StepTrack steps={orderProgress(order.status)} label="Order progress" />
                {model && <StatusNow m={model} />}
              </Section>
            )}
            <PickupSection o={o} data={l.data} />
            <NotesSection o={o} data={l.data} />
            <Section title="History" className="text-slate-600">
              <Timeline events={timelineEvents(l.data)} />
            </Section>
          </div>

          {/* ── Destructive, rare: apart from everything else ──── */}
          {!locked && (
            <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 pt-6">
              <p className="min-w-0 text-sm text-slate-500">Cancelling needs an admin PIN and can't be undone. Any payment can be refunded next.</p>
              <button type="button" onClick={o.cancelOrder} disabled={o.busy} className={`${btnDanger} min-h-12 px-5`}>
                <Icon className="h-5 w-5">{I.x}</Icon>Cancel Order
              </button>
            </div>
          )}

          <FloatingToast msg={o.msg} onDismiss={() => o.setMsg(null)} />
        </div>
      </div>

      {model && <NextActionBar m={model} busy={o.busy} />}
      <OrderDetailSheets o={o} />
    </div>
  )
}

/** "2 loads (14.5 kg) · ₱90/load", "3 pcs · ₱20/pc", "Flat rate". */
function lineDetail(i: OrderItemRow) {
  const t = typeOf(i)
  if (t === 'fixed') return 'Flat rate'
  return `${qtyText(t, i.quantity)}${i.weight_kg ? ` (${i.weight_kg} kg)` : ''} · ${formatPeso(i.unit_price_cents)}${TYPE_UNIT[t]}`
}

/** Services, then add-ons, each line tappable to change or remove until the order is final; the total closes it. */
function ItemsSection({ o, data, editable }: { o: OrderDetailCtl; data: Detail; editable: boolean }) {
  const { order, items } = data
  const addonIds = new Set((o.services ?? []).filter((s) => s.is_addon).map((s) => s.id))
  const groups = [
    { label: 'Services', rows: items.filter((i) => !addonIds.has(i.service_id)) },
    { label: 'Add-ons', rows: items.filter((i) => addonIds.has(i.service_id)) },
  ].filter((g) => g.rows.length)
  return (
    <Section
      title="Services & add-ons"
      action={editable && (
        <>
          <button type="button" onClick={() => o.setEdit({ kind: 'add' })} disabled={o.busy} className={quietBtn}><Icon className="h-4 w-4">{I.plus}</Icon>Service</button>
          <button type="button" onClick={() => o.setEdit({ kind: 'add', addons: true })} disabled={o.busy} className={quietBtn}><Icon className="h-4 w-4">{I.plus}</Icon>Add-on</button>
        </>
      )}
    >
      {items.length === 0 ? (
        <p className="rounded-xl bg-slate-50 px-4 py-5 text-center text-[15px] text-slate-500">No services yet. Tap <b>+ Service</b> to price this order.</p>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.label}>
              {groups.length > 1 && <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{g.label}</h3>}
              <ul className="-mx-3 divide-y divide-slate-100">
                {g.rows.map((i) => <ItemRow key={i.id} i={i} onEdit={editable ? () => o.setEdit({ kind: 'item', line: i }) : undefined} />)}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* Total: the number the customer asks about */}
      <dl className="mt-4 space-y-1.5 border-t border-slate-200 pt-4">
        {order.discount_cents > 0 && (
          <>
            <div className="flex justify-between text-[15px] text-slate-500"><dt>Subtotal</dt><dd className="tabular-nums">{formatPeso(order.subtotal_cents)}</dd></div>
            <div className="flex justify-between text-[15px] text-slate-500"><dt>Discount</dt><dd className="tabular-nums text-emerald-700">−{formatPeso(order.discount_cents)}</dd></div>
          </>
        )}
        <div className="flex items-baseline justify-between">
          <dt className="text-lg font-semibold text-slate-900">Total</dt>
          <dd className="text-3xl font-bold tabular-nums tracking-tight text-slate-900">{formatPeso(order.total_cents)}</dd>
        </div>
      </dl>
    </Section>
  )
}

function ItemRow({ i, onEdit }: { i: OrderItemRow; onEdit?: () => void }) {
  const allIncluded = i.included_qty >= i.quantity && !i.amount_cents
  const body = (
    <>
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600"><Icon className="h-5 w-5">{serviceIcon(i.service_name)}</Icon></span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-slate-900">{i.service_name}</span>
        <span className="block text-sm text-slate-500">{lineDetail(i)}</span>
        {i.included_qty > 0 && !allIncluded && <span className="block text-xs font-medium text-emerald-700">{i.included_qty} included</span>}
        {i.note && <span className="block text-xs text-slate-400">{i.note}</span>}
      </span>
      <span className={`shrink-0 text-base font-semibold tabular-nums ${allIncluded ? 'text-emerald-700' : 'text-slate-900'}`}>{allIncluded ? 'Included' : formatPeso(i.amount_cents)}</span>
      {onEdit && <Icon className="h-5 w-5 shrink-0 text-slate-300">{I.chevron}</Icon>}
    </>
  )
  return (
    <li>
      {onEdit ? (
        <button type="button" onClick={onEdit} aria-label={`Change ${i.service_name}`} className="flex min-h-16 w-full items-center gap-4 rounded-xl px-3 py-2.5 text-left hover:bg-slate-50 active:bg-slate-100">{body}</button>
      ) : (
        <div className="flex min-h-16 items-center gap-4 px-3 py-2.5">{body}</div>
      )}
    </li>
  )
}

function Figure({ label, value, tone = 'text-slate-900' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className={`mt-0.5 truncate text-2xl font-bold tabular-nums ${tone}`}>{value}</dd>
    </div>
  )
}

/** Paid and owed first, then each payment and refund. Collecting is offered here unless it's already the next step. */
function PaymentSection({ o, data }: { o: OrderDetailCtl; data: Detail }) {
  const { order, payments, refunds } = data
  const { balance, canPay } = loaded(o)!.flags
  const cancelled = order.status === 'cancelled'
  const rows = [
    ...payments.map((p) => ({ key: `p${p.id}`, at: p.paid_at, refund: false, method: p.method, detail: p.reference ? `Ref. ${p.reference}` : '', by: p.user_name, amount: p.amount_cents })),
    ...refunds.map((r) => ({ key: `r${r.id}`, at: r.refunded_at, refund: true, method: r.method, detail: r.reason ?? '', by: r.user_name, amount: r.amount_cents })),
  ].sort((a, b) => a.at.localeCompare(b.at))
  const collectHere = canPay && order.status !== 'ready' // on a Ready order, collecting is the bar's action
  return (
    <Section title="Payment">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-slate-50 px-5 py-4">
        <dl className="grid min-w-0 flex-1 grid-cols-2 gap-6 sm:max-w-md">
          <Figure label="Paid" value={formatPeso(order.paid_cents)} tone={order.paid_cents > 0 ? 'text-emerald-700' : 'text-slate-900'} />
          {cancelled
            ? <Figure label="Refunded" value={formatPeso(order.refunded_cents)} />
            : <Figure label={balance > 0 ? 'Balance due' : 'Balance'} value={formatPeso(balance)} tone={balance > 0 ? 'text-red-700' : 'text-slate-900'} />}
        </dl>
        {collectHere ? (
          <button type="button" onClick={() => o.setPaying(true)} disabled={o.busy} className={`${bigSecondary} min-h-12 border-blue-200 text-blue-700`}>
            <Icon className="h-5 w-5">{I.wallet}</Icon>Collect {formatPeso(balance)}
          </button>
        ) : !cancelled && balance <= 0 && (
          <span className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-emerald-700"><Icon className="h-5 w-5">{I.check}</Icon>Fully paid</span>
        )}
      </div>
      {!cancelled && balance > 0 && order.status !== 'ready' && (
        <p className="mt-2 px-1 text-sm text-slate-500">The balance can be collected now or when the customer picks up.</p>
      )}
      {rows.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-100">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center gap-4 py-3">
              <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${r.refund ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}><Icon className="h-5 w-5">{r.refund ? I.wallet : methodIcon(r.method)}</Icon></span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-slate-900">{r.refund ? 'Refund · ' : ''}{METHOD_LABEL[r.method] ?? r.method}{r.detail && <span className="font-normal text-slate-500"> · {r.detail}</span>}</span>
                <span className="block text-sm text-slate-500">{when(r.at)}{r.by ? ` · ${r.by}` : ''}</span>
              </span>
              <span className={`shrink-0 font-semibold tabular-nums ${r.refund ? 'text-red-700' : 'text-slate-900'}`}>{r.refund ? '−' : ''}{formatPeso(r.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

/** What's happening now, in words, under the progress track; the button itself is in the bar. */
function StatusNow({ m }: { m: NextStepModel }) {
  const tone = m.tone === 'done' ? 'text-emerald-800' : 'text-slate-900'
  return (
    <div className="mt-5">
      <p className={`text-lg font-semibold ${tone}`}>{m.heading}</p>
      <p className={`mt-0.5 text-[15px] ${m.next.disabled ? 'font-medium text-amber-800' : 'text-slate-500'}`}>{m.next.hint}</p>
    </div>
  )
}

function DetailRow({ icon, label, value, tone, action }: { icon: ReactNode; label: ReactNode; value: ReactNode; tone?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start gap-4">
      <span className={`mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl ${tone ?? 'bg-slate-100 text-slate-500'}`}><Icon className="h-5 w-5">{icon}</Icon></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-slate-500">{label}</p>
        <div className="text-base text-slate-900">{value}</div>
      </div>
      {action}
    </div>
  )
}

function PickupSection({ o, data }: { o: OrderDetailCtl; data: Detail }) {
  const { order } = data
  const locked = isFinal(order.status)
  const due = order.expected_pickup ? pickupDue(order.expected_pickup) : null
  // Late only matters while the shop still owes the work; once Ready, the wait is on the customer.
  const late = !!due && !locked && order.status !== 'ready' && due.getTime() < Date.now()
  return (
    <Section title="Pickup">
      <DetailRow
        icon={I.calendar}
        tone={late ? 'bg-amber-100 text-amber-700' : undefined}
        label={late ? <span className="font-semibold text-amber-800">Expected pickup · Overdue</span> : 'Expected pickup'}
        value={order.expected_pickup ? <b className="font-semibold">{formatPickup(order.expected_pickup)}</b> : <span className="text-slate-500">As soon as it's ready</span>}
        action={!locked && <button type="button" onClick={() => o.setEdit({ kind: 'due' })} className={quietBtn}>{order.expected_pickup ? 'Change' : 'Set date'}</button>}
      />
    </Section>
  )
}

function NotesSection({ o, data }: { o: OrderDetailCtl; data: Detail }) {
  const { order } = data
  const locked = isFinal(order.status)
  if (locked && !order.notes) return null
  return (
    <Section title="Notes">
      <DetailRow
        icon={I.note}
        tone={order.notes ? 'bg-amber-50 text-amber-600' : undefined}
        label="Special instructions"
        value={order.notes ? <span className="whitespace-pre-wrap wrap-break-word">{order.notes}</span> : <span className="text-slate-500">None</span>}
        action={!locked && <button type="button" onClick={() => o.setEdit({ kind: 'note' })} className={quietBtn}>{order.notes ? 'Edit' : 'Add note'}</button>}
      />
    </Section>
  )
}

/** The one next step, always in reach: what's happening on the left, the button on the right. */
function NextActionBar({ m, busy }: { m: NextStepModel; busy: boolean }) {
  const { next } = m
  const label = <><Icon className="h-6 w-6">{next.icon}</Icon>{busy ? 'Saving…' : next.label}</>
  return (
    <ActionBar>
      <div className="min-w-0 flex-1">
        <p className={`text-xs font-semibold uppercase tracking-wide ${m.tone === 'done' ? 'text-emerald-700' : 'text-blue-600'}`}>Next step</p>
        <p className="truncate text-lg font-semibold text-slate-900">{m.heading}</p>
        {next.disabled && <p className="truncate text-sm font-medium text-amber-800">{next.hint}</p>}
      </div>
      <button type="button" onClick={next.onClick} disabled={busy || next.disabled} className={`${bigPrimary} w-80 shrink-0 text-lg`}>{label}</button>
    </ActionBar>
  )
}
