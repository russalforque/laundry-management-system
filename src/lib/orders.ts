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

import type { OrderStatus } from '../types'

/** New Order → Received → Washing → Drying → Ready for Pickup → Completed ('released'). */
export const STATUS_FLOW: OrderStatus[] = ['received', 'washing', 'drying', 'ready', 'released']

export const STATUS_LABEL: Record<OrderStatus, string> = {
  received: 'Received',
  washing: 'Washing',
  drying: 'Drying',
  ready: 'Ready for Pickup',
  released: 'Completed',
  cancelled: 'Cancelled',
}

export const isFinal = (s: OrderStatus) => s === 'released' || s === 'cancelled'

/**
 * Every allowed workflow move. Received → Washing and Washing → Drying happen only by putting the
 * order in a machine (db/machines.ts); Washing → Ready skips drying. Any open order can be cancelled.
 */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  received: ['washing', 'cancelled'],
  washing: ['drying', 'ready', 'cancelled'],
  drying: ['ready', 'cancelled'],
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
