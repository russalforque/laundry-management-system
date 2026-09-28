import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { PaymentBadge } from '../Badges'
import { CashDrawerControl } from '../CashDrawer'
import { I, Icon } from '../Icons'
import PaymentForm from '../PaymentForm'
import RefundForm from '../RefundForm'
import { Sheet } from '../Sheet'
import { setOrderItemQuantity, setOrderNotes, setOrderPickup } from '../../db/orders'
import type { OrderDetailCtl } from '../../hooks/useOrderDetail'
import { formatDateTime, formatPeso } from '../../lib/money'
import { METHOD_LABEL } from '../../lib/orders'
import { autoOpenCashDrawer } from '../../lib/printer'
import { NextStepCard, type NextStepProps } from './NextStepCard'
import { AddServiceSheet, DueDateSheet, ItemSheet, NoteSheet } from './OrderSheets'
import { outline, solid } from './shared'

/**
 * Order pieces shared by Order Details (components/order/OrderDetailView.tsx) and the Orders work pane, all driven by
 * hooks/useOrderDetail.ts: the Next Step card, banners, and every sheet an order can open.
 */

/** The loaded parts of the controller; null while loading or when the order doesn't exist. */
export function loaded(o: OrderDetailCtl) {
  return o.data && o.flags ? { data: o.data, flags: o.flags } : null
}

/** The Next Step inputs wired to this order's actions; null while loading. */
export function nextStepProps(o: OrderDetailCtl): NextStepProps | null {
  const l = loaded(o)
  if (!l) return null
  return {
    order: l.data.order,
    busy: o.busy,
    blocker: l.flags.blocker,
    onStart: o.startProcessing,
    onMarkReady: o.markReady,
    onComplete: () => o.setConfirming(true),
    onCollect: l.flags.canPay ? () => o.setPaying(true) : undefined,
  }
}

/** The order's Next Step card (nothing for completed and cancelled orders), wired to this order's actions. */
export function NextStep({ o }: { o: OrderDetailCtl }) {
  const p = nextStepProps(o)
  return p && <NextStepCard {...p} />
}

/** Print / reprint the customer receipt, at any stage (a cancelled order's reprint is stamped VOID). */
export function ReceiptButton({ o, className, label = 'Print Receipt' }: { o: OrderDetailCtl; className: string; label?: string }) {
  if (!loaded(o)) return null
  return (
    <button type="button" onClick={o.printReceipt} disabled={!!o.printing} className={className}>
      <Icon className="h-5 w-5">{I.printer}</Icon>{o.printing === 'receipt' ? 'Printing receipt…' : label}
    </button>
  )
}

/** Print / reprint the basket tag while the order is in the shop (nothing once it's completed or cancelled). */
export function BasketTagButton({ o, className }: { o: OrderDetailCtl; className: string }) {
  if (!loaded(o)?.flags.canTag) return null
  return (
    <button type="button" onClick={o.printTag} disabled={!!o.printing} className={className}>
      <Icon className="h-5 w-5">{I.basket}</Icon>{o.printing === 'tag' ? 'Printing tag…' : 'Print Basket Tag'}
    </button>
  )
}

/** Picked up: said plainly so no one hands the laundry over twice. */
export function PickedUpBanner({ o }: { o: OrderDetailCtl }) {
  const l = loaded(o)
  if (!l?.flags.pickedUp) return null
  const { order } = l.data
  return (
    <div role="status" className="flex items-center gap-4 rounded-3xl border border-emerald-200 bg-emerald-50 p-4">
      <span className="grid size-13 shrink-0 place-items-center rounded-2xl bg-emerald-600 text-white">
        <Icon className="h-7 w-7">{I.bag}</Icon>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-lg font-bold leading-tight text-emerald-900">Laundry Picked Up</p>
        <p className="mt-0.5 text-sm text-emerald-800">
          {order.released_at ? `Released ${formatDateTime(order.released_at)}` : 'This order is completed'}
          {order.released_by_name ? ` by ${order.released_by_name}` : ''}.
        </p>
        {o.scanned && <p className="mt-1 text-sm font-semibold text-red-700">Do not hand it over again.</p>}
      </div>
    </div>
  )
}

/** After Scan QR: whether this laundry can be handed over. */
export function ScanBanner({ o }: { o: OrderDetailCtl }) {
  const l = loaded(o)
  const notice = l?.flags.scanNotice
  if (!l || !notice || l.flags.pickedUp) return null
  return (
    <p role="status" className={`flex items-start gap-2 rounded-2xl px-4 py-3 text-[15px] font-medium ${notice.tone}`}>
      <Icon className="mt-0.5 h-5 w-5">{l.data.order.status === 'ready' ? I.check : I.info}</Icon><span className="min-w-0 flex-1">{notice.text}</span>
    </p>
  )
}

function Line({ label, cls = 'text-slate-900', labelCls = 'text-slate-500', children }: { label: string; cls?: string; labelCls?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className={labelCls}>{label}</dt>
      <dd className={`tabular-nums ${cls}`}>{children}</dd>
    </div>
  )
}

/**
 * Every sheet an order can open: due date, note, services, collect payment, refund,
 * complete-order confirmation and the payment receipt. Sheets are portaled into <body>, so both layouts
 * render this once.
 */
export function OrderDetailSheets({ o }: { o: OrderDetailCtl }) {
  const l = loaded(o)
  if (!l) return o.pinSheet
  const { id, edit, setEdit, saveThen, services, busy, approve } = o
  const { order, items, payments } = l.data
  const { balance, refundable, canPay, canRefund } = l.flags

  return (
    <>
      {edit?.kind === 'due' && (
        <DueDateSheet value={order.expected_pickup} onClose={() => setEdit(null)} onSave={(v) => saveThen(() => setOrderPickup(id, v), v ? 'Pickup date saved.' : 'Pickup date removed.')} />
      )}
      {edit?.kind === 'note' && (
        <NoteSheet value={order.notes} onClose={() => setEdit(null)} onSave={(v) => saveThen(() => setOrderNotes(id, v), 'Note saved.')} />
      )}
      {edit?.kind === 'add' && (
        <AddServiceSheet
          services={services}
          items={items}
          addons={edit.addons}
          onClose={() => setEdit(null)}
          onSave={(s, q) => saveThen(() => setOrderItemQuantity(id, s.id, q), q ? `${s.name} saved. Total updated.` : `${s.name} removed.`)}
        />
      )}
      {edit?.kind === 'item' && (
        <ItemSheet
          line={edit.line}
          onClose={() => setEdit(null)}
          onSave={(q) => saveThen(() => setOrderItemQuantity(id, edit.line.service_id, q), q ? `${edit.line.service_name} updated.` : `${edit.line.service_name} removed.`)}
        />
      )}

      {o.paying && canPay && (
        <Sheet label="Collect Payment" onClose={() => o.setPaying(false)}>
          <PaymentForm orderId={id} balanceCents={balance} paidCents={order.paid_cents} onSaved={(pid, method) => {
            o.setPaying(false); o.setPaidId(pid); o.setDrawer(null); o.load()
            // The payment is saved; a drawer problem only shows a message in the sheet.
            autoOpenCashDrawer(method).then(o.setDrawer)
          }} />
        </Sheet>
      )}

      {o.refunding && canRefund && (
        <Sheet label="Refund payment" onClose={() => o.setRefunding(null)}>
          <RefundForm
            orderId={id}
            refundableCents={refundable}
            refundedCents={order.refunded_cents}
            defaultMethod={payments.at(-1)?.method ?? 'cash'}
            approve={o.refunding.skipPin ? null : () => approve(`Refund money on order #${order.order_number}?`)}
            onSaved={(method) => {
              o.setRefunding(null)
              o.setMsg({ ok: true, text: 'Refund recorded.' })
              o.load()
              // Cash goes back out of the drawer; a drawer problem only shows a message.
              autoOpenCashDrawer(method).then((r) => r && !r.ok && o.setMsg({ ok: false, text: `Refund recorded. ${r.msg.replace(/^Payment saved, but /, '')}` }))
            }}
          />
        </Sheet>
      )}

      {o.confirming && (
        <Sheet label="Complete order?" onClose={() => o.setConfirming(false)}>
          <div className="space-y-5">
            <div className="flex items-center gap-4 rounded-2xl bg-slate-50 p-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-600"><Icon className="h-6 w-6">{I.bag}</Icon></span>
              <div className="min-w-0 text-[15px]">
                <p className="truncate font-semibold text-slate-900">#{order.order_number} · {order.customer_name}</p>
                <p className="text-slate-500">{items.length} {items.length === 1 ? 'item' : 'items'} · {formatPeso(order.total_cents)} paid</p>
              </div>
            </div>
            <p className="px-1 text-[15px] text-slate-600">Hand the laundry to the customer, then confirm. This completes the order under your name and can't be undone.</p>
            <div className="grid gap-3">
              <button type="button" onClick={o.release} disabled={busy} className={`${solid} min-h-13 w-full text-base`}>
                <Icon className="h-5 w-5">{I.check}</Icon>Yes, release laundry
              </button>
              <button type="button" onClick={() => o.setConfirming(false)} className={outline}>Not yet</button>
            </div>
          </div>
        </Sheet>
      )}

      {o.paidId && (() => {
        const p = payments.find((x) => x.id === o.paidId)
        if (!p) return null
        return (
          <Sheet label="Payment Collected" onClose={() => o.setPaidId(null)}>
            <div className="space-y-4">
              <dl className="space-y-2.5 rounded-2xl bg-slate-50 p-4 text-[15px]">
                <Line label="Amount Paid" cls="font-bold text-emerald-600">{formatPeso(p.amount_cents)}</Line>
                <Line label="Method">{METHOD_LABEL[p.method] ?? p.method}</Line>
                {p.tendered_cents != null && <Line label="Amount Received">{formatPeso(p.tendered_cents)}</Line>}
                {p.tendered_cents != null && p.tendered_cents > p.amount_cents && (
                  <Line label="Change" labelCls="font-semibold text-slate-900" cls="text-2xl font-bold text-emerald-700">{formatPeso(p.tendered_cents - p.amount_cents)}</Line>
                )}
                <Line label="Balance Due" cls="font-bold text-slate-900">{formatPeso(order.balance_cents)}</Line>
                <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Payment status</dt><dd><PaymentBadge status={order.payment_status} /></dd></div>
              </dl>
              {p.method === 'cash' && <CashDrawerControl status={o.drawer} />}
              {order.status === 'ready' && order.balance_cents === 0 && (
                <button type="button" onClick={() => { o.setPaidId(null); o.setConfirming(true) }} className={`${solid} min-h-13 w-full text-base`}>
                  <Icon className="h-5 w-5">{I.check}</Icon>Complete Order
                </button>
              )}
              <Link
                to={`/orders/${id}/receipt?payment=${p.id}`}
                className={order.status === 'ready' && order.balance_cents === 0 ? outline : `${solid} min-h-13 w-full text-base`}
              >
                <Icon className="h-5 w-5">{I.printer}</Icon>Print Payment Receipt
              </Link>
              <button type="button" onClick={() => o.setPaidId(null)} className="min-h-12 w-full rounded-2xl font-semibold text-slate-600 hover:bg-slate-100 active:bg-slate-100">
                Done
              </button>
            </div>
          </Sheet>
        )
      })()}
      {o.pinSheet}
    </>
  )
}
