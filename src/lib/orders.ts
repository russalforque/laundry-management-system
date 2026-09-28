import type { PaymentStatus, PricingMethod } from '../types'

/** Line amount in centavos. Fixed-price services are always quantity 1. */
export function lineAmount(method: PricingMethod, unitCents: number, quantity: number): number {
  return Math.round(unitCents * (method === 'fixed' ? 1 : quantity))
}

/** The one place payment status is derived, so balances can never disagree with it. */
export function paymentStatus(totalCents: number, paidCents: number): PaymentStatus {
  if (paidCents >= totalCents) return 'paid'
  return paidCents > 0 ? 'partial' : 'unpaid'
}

/** Receipt wording: an unpaid receipt must never read like proof of payment. */
export const RECEIPT_PAY_LABEL: Record<PaymentStatus, string> = {
  unpaid: 'UNPAID / PAY LATER',
  partial: 'PARTIAL',
  paid: 'PAID',
}
export const NOT_PROOF_OF_PAYMENT = 'NOT PROOF OF PAYMENT - balance due on pickup'

export const METHOD_LABEL: Record<string, string> = { cash: 'Cash', gcash: 'GCash', other: 'Other' }

/** Largest loads / kg / pieces on one order line; anything above is treated as a typo. */
export const MAX_QUANTITY = 9999

/** Validates a quantity for a pricing method; returns the normalized value or null. */
export function normalizeQuantity(method: PricingMethod, value: number): number | null {
  if (!Number.isFinite(value) || value <= 0 || value > MAX_QUANTITY) return null
  if (method === 'fixed') return 1
  if (method === 'per_piece') return Number.isInteger(value) ? value : null
  const kg = Math.round(value * 100) / 100 // kg: up to 2 decimals
  return kg > 0 ? kg : null // e.g. 0.001 kg rounds to 0
}

import type { OrderRow, OrderStatus } from '../types'

/**
 * Processing: the laundry is being washed, dried and folded. Staff run the machines and folding by hand, so the app
 * doesn't track which. Stored as 'washing' (see OrderStatus); use this constant, never the literal.
 */
export const PROCESSING = 'washing' as const satisfies OrderStatus

/** Received → Processing → Ready for Pickup → Completed ('released'). Cancelled can happen from any open status. */
export const STATUS_FLOW: OrderStatus[] = ['received', PROCESSING, 'ready', 'released']

export const STATUS_LABEL: Record<OrderStatus, string> = {
  received: 'Received',
  [PROCESSING]: 'Processing',
  ready: 'Ready for Pickup',
  released: 'Completed',
  cancelled: 'Cancelled',
}

export const isFinal = (s: OrderStatus) => s === 'released' || s === 'cancelled'

/** What the Orders list says to do next with an order: an action to take, or nothing (final). */
export interface NextAction {
  label: string
  kind: 'act' | 'done' | 'none'
}

/** The one next step for a list row. Mirrors the order's Next Step (components/order/NextStepCard.tsx), which has the buttons. */
export function nextAction(o: Pick<OrderRow, 'status' | 'balance_cents'>): NextAction {
  switch (o.status) {
    case 'received': return { label: 'Start Processing', kind: 'act' }
    case PROCESSING: return { label: 'Mark Ready for Pickup', kind: 'act' }
    case 'ready': return { label: o.balance_cents > 0 ? 'Collect balance · Hand over' : 'Hand over', kind: 'act' }
    case 'released': return { label: 'Completed', kind: 'done' }
    default: return { label: 'Cancelled', kind: 'none' }
  }
}

/** Every allowed workflow move, one step forward at a time. Any open order can be cancelled. */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  received: [PROCESSING, 'cancelled'],
  [PROCESSING]: ['ready', 'cancelled'],
  ready: ['released', 'cancelled'],
  released: [],
  cancelled: [],
}

export const canChangeStatus = (from: OrderStatus, to: OrderStatus) => TRANSITIONS[from].includes(to)

/**
 * Receipt QR codes hold the order number and nothing else (no customer details), e.g. "L-0125".
 * Normalizes scanned or typed text to an order number; null when it can't be one (someone else's QR code).
 * A bare tag number is accepted when typed: "125" and "L-125" both mean L-0125.
 */
export function parseOrderCode(raw: string): string | null {
  const s = raw.trim().toUpperCase()
  const tag = /^(?:L-)?(\d{1,9})$/.exec(s)
  if (tag) return `L-${tag[1].padStart(4, '0')}`
  return /^ORD-\d{8}-\d{1,6}$/.test(s) ? s : null // numbers from before L- tags
}
