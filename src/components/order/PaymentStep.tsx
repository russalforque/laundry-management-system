import { formatDateTime, formatPeso } from '../../lib/money'
import { METHOD_LABEL } from '../../lib/orders'
import type { PaymentStatus } from '../../types'
import { I, Icon } from '../Icons'
import { panel, PanelHead, solid, type Detail } from './shared'

const PAY_BADGE: Record<PaymentStatus, { cls: string; label: string }> = {
  paid: { cls: 'bg-emerald-50 text-emerald-700', label: 'Fully Paid' },
  partial: { cls: 'bg-amber-50 text-amber-800', label: 'Partially Paid' },
  unpaid: { cls: 'bg-red-50 text-red-700', label: 'Unpaid' },
}

const methodIcon = (m: string) => (m === 'cash' ? I.wallet : m === 'gcash' ? I.phone : I.peso)

export function PaymentStep({ data, busy, onCollect, onRefund }: {
  data: Detail
  busy: boolean
  /** Opens the existing Collect Payment sheet; null when nothing is owed. */
  onCollect: (() => void) | null
  /** Opens the refund sheet on a cancelled order with money still held; null otherwise. */
  onRefund: (() => void) | null
}) {
  const { order, payments, refunds } = data
  const balance = order.total_cents - order.paid_cents
  const cancelled = order.status === 'cancelled'
  const badge = PAY_BADGE[order.payment_status]
  const refundable = order.paid_cents - order.refunded_cents

  return (
    <div className="space-y-5">
      <section className={`${panel} space-y-4 p-4 sm:p-5`}>
        <PanelHead
          title="Payment Summary"
          action={cancelled
            ? <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-600">Cancelled</span>
            : <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${badge.cls}`}>
                {order.payment_status === 'paid' && <Icon className="h-4 w-4">{I.check}</Icon>}{badge.label}
              </span>}
        />
        <dl className="divide-y divide-slate-100 rounded-2xl border border-slate-200/80 px-4 text-[15px]">
          <div className="flex items-center justify-between gap-3 py-3"><dt className="text-slate-600">Total Amount</dt><dd className="font-bold tabular-nums text-slate-900">{formatPeso(order.total_cents)}</dd></div>
          <div className="flex items-center justify-between gap-3 py-3"><dt className="text-slate-600">Amount Paid</dt><dd className="font-bold tabular-nums text-slate-900">{formatPeso(order.paid_cents)}</dd></div>
          {cancelled ? (
            <>
              <div className="flex items-center justify-between gap-3 py-3"><dt className="text-slate-600">Refunded</dt><dd className="font-bold tabular-nums text-slate-900">{formatPeso(order.refunded_cents)}</dd></div>
              <div className="flex items-center justify-between gap-3 py-3"><dt className="text-slate-600">To refund</dt><dd className={`font-bold tabular-nums ${refundable > 0 ? 'text-red-700' : 'text-slate-900'}`}>{formatPeso(refundable)}</dd></div>
            </>
          ) : (
            <div className="flex items-center justify-between gap-3 py-3">
              <dt className={balance > 0 ? 'font-semibold text-slate-900' : 'text-slate-600'}>Balance</dt>
              <dd className={`font-bold tabular-nums ${balance > 0 ? 'text-lg text-red-700' : 'text-slate-900'}`}>{formatPeso(balance)}</dd>
            </div>
          )}
        </dl>

        {onCollect && (
          <button type="button" onClick={onCollect} disabled={busy} className={`${solid} w-full text-base`}>
            <Icon className="h-5 w-5">{I.wallet}</Icon>Collect {formatPeso(balance)}
          </button>
        )}
        {onRefund && (
          <button type="button" onClick={onRefund} disabled={busy} className={`${solid} w-full text-base`}>
            <Icon className="h-5 w-5">{I.wallet}</Icon>Refund {formatPeso(refundable)}
          </button>
        )}
      </section>

      <section aria-labelledby="od-payments">
        <h2 id="od-payments" className="px-1 font-semibold text-slate-900">Payments Received ({payments.length})</h2>
        {payments.length ? (
          <ul className="mt-2.5 space-y-2.5">
            {payments.map((p) => (
              <li key={p.id} className={`${panel} flex items-center gap-3 p-3.5`}>
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
                  <Icon className="h-6 w-6">{methodIcon(p.method)}</Icon>
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate font-semibold text-slate-900">{METHOD_LABEL[p.method] ?? p.method}</span>
                    <span className="shrink-0 font-bold tabular-nums text-slate-900">{formatPeso(p.amount_cents)}</span>
                  </div>
                  <p className="truncate text-xs text-slate-500">{formatDateTime(p.paid_at)}</p>
                  {p.user_name && <p className="truncate text-xs text-slate-500">Received by {p.user_name}</p>}
                  {p.reference && <p className="truncate text-xs text-slate-500">Ref. {p.reference}</p>}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className={`${panel} mt-2.5 px-4 py-6 text-center text-sm text-slate-500`}>
            {onCollect ? 'No payments yet. Collect the balance before the laundry is released.' : 'No payments recorded.'}
          </p>
        )}
      </section>

      {refunds.length > 0 && (
        <section aria-labelledby="od-refunds">
          <h2 id="od-refunds" className="px-1 font-semibold text-slate-900">Refunds ({refunds.length})</h2>
          <ul className="mt-2.5 space-y-2.5">
            {refunds.map((r) => (
              <li key={r.id} className={`${panel} flex items-center gap-3 p-3.5`}>
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-red-50 text-red-600"><Icon className="h-6 w-6">{I.wallet}</Icon></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">{METHOD_LABEL[r.method] ?? r.method}{r.reason && <span className="font-normal text-slate-500"> · {r.reason}</span>}</p>
                  <p className="truncate text-xs text-slate-500">{formatDateTime(r.refunded_at)} · {r.user_name}</p>
                </div>
                <span className="shrink-0 font-semibold tabular-nums text-red-700">− {formatPeso(r.amount_cents)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
