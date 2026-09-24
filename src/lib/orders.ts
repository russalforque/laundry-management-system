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

/** Validates a quantity for a pricing method; returns the normalized value or null. */
export function normalizeQuantity(method: PricingMethod, value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) return null
  if (method === 'fixed') return 1
  if (method === 'per_piece') return Number.isInteger(value) ? value : null
  return Math.round(value * 100) / 100 // kg: up to 2 decimals
}

import type { OrderStatus } from '../types'

export const STATUS_FLOW: OrderStatus[] = ['received', 'washing', 'drying', 'folding', 'ready', 'released']

export const STATUS_LABEL: Record<OrderStatus, string> = {
  received: 'Received',
  washing: 'Washing',
  drying: 'Drying',
  folding: 'Folding',
  ready: 'Ready for Pickup',
  released: 'Released',
  cancelled: 'Cancelled',
}

export const isFinal = (s: OrderStatus) => s === 'released' || s === 'cancelled'

/** Next step in the workflow, or null when the order is finished. */
export function nextStatus(s: OrderStatus): OrderStatus | null {
  if (isFinal(s)) return null
  return STATUS_FLOW[STATUS_FLOW.indexOf(s) + 1] ?? null
}

/** Open orders can move to any workflow step (fixes mistakes) or be cancelled; final orders are locked. */
export const canChangeStatus = (from: OrderStatus, to: OrderStatus) => !isFinal(from) && from !== to
