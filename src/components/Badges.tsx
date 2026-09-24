import { STATUS_LABEL } from '../lib/orders'
import type { OrderStatus, PaymentStatus } from '../types'

const STATUS_CLS: Record<OrderStatus, string> = {
  received: 'bg-slate-200 text-slate-700',
  washing: 'bg-sky-100 text-sky-800',
  drying: 'bg-amber-100 text-amber-800',
  folding: 'bg-violet-100 text-violet-800',
  ready: 'bg-emerald-100 text-emerald-800',
  released: 'bg-green-600 text-white',
  cancelled: 'bg-red-100 text-red-700',
}

const PAY_CLS: Record<PaymentStatus, string> = {
  unpaid: 'bg-red-100 text-red-700',
  partial: 'bg-amber-100 text-amber-800',
  paid: 'bg-green-100 text-green-800',
}

const base = 'inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold'

export const StatusBadge = ({ status }: { status: OrderStatus }) => (
  <span className={`${base} ${STATUS_CLS[status]}`}>{STATUS_LABEL[status]}</span>
)

export const PaymentBadge = ({ status }: { status: PaymentStatus }) => (
  <span className={`${base} capitalize ${PAY_CLS[status]}`}>{status}</span>
)
