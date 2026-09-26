import { STATUS_LABEL } from '../lib/orders'
import type { OrderStatus, PaymentStatus } from '../types'

const STATUS_CLS: Record<OrderStatus, string> = {
  received: 'bg-slate-100 text-slate-600',
  washing: 'bg-blue-50 text-blue-700',
  drying: 'bg-blue-100 text-blue-800',
  ready: 'bg-blue-600 text-white',
  released: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-red-50 text-red-600',
}

const PAY_CLS: Record<PaymentStatus, string> = {
  unpaid: 'bg-red-100 text-red-700',
  partial: 'bg-amber-100 text-amber-800',
  paid: 'bg-emerald-100 text-emerald-800',
}

const base = 'inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold'

export const StatusBadge = ({ status }: { status: OrderStatus }) => (
  <span className={`${base} ${STATUS_CLS[status]}`}>{STATUS_LABEL[status]}</span>
)

export const PaymentBadge = ({ status }: { status: PaymentStatus }) => (
  <span className={`${base} capitalize ${PAY_CLS[status]}`}>{status}</span>
)
