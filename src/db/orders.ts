import { lineAmount, normalizeQuantity, paymentStatus } from '../lib/orders'
import type { PaymentMethod, Service } from '../types'
import { transaction } from './client'

export interface NewOrderInput {
  customerId: number
  items: { serviceId: number; quantity: number }[]
  discountCents: number
  expectedPickup: string | null // YYYY-MM-DD
  notes: string
  payment: { amountCents: number; method: PaymentMethod; reference: string } | null
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0')

function dayPrefix(d: Date) {
  return `ORD-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-`
}

/**
 * Creates order, items and the optional first payment atomically.
 * Prices are read from the database here, never trusted from the UI.
 */
export async function createOrder(input: NewOrderInput, userId: number): Promise<{ id: number; orderNumber: string }> {
  if (!input.items.length) throw new Error('Add at least one service.')
  if (!Number.isInteger(input.discountCents) || input.discountCents < 0) throw new Error('Invalid discount.')

  return transaction(async (tx) => {
    const [customer] = await tx.query('SELECT id FROM customers WHERE id = ?', [input.customerId])
    if (!customer) throw new Error('Select a customer.')

    const lines = []
    let subtotal = 0
    for (const it of input.items) {
      const [svc] = await tx.query<Service>('SELECT * FROM services WHERE id = ? AND active = 1', [it.serviceId])
      if (!svc) throw new Error('A selected service is no longer available.')
      const qty = normalizeQuantity(svc.pricing_method, it.quantity)
      if (qty === null) throw new Error(`Invalid quantity for ${svc.name}.`)
      const amount = lineAmount(svc.pricing_method, svc.price_cents, qty)
      subtotal += amount
      lines.push({ svc, qty, amount })
    }

    if (input.discountCents > subtotal) throw new Error('Discount cannot exceed the subtotal.')
    const total = subtotal - input.discountCents
    const paid = input.payment?.amountCents ?? 0
    if (!Number.isInteger(paid) || paid < 0) throw new Error('Invalid payment amount.')
    if (paid > total) throw new Error('Payment cannot exceed the order total.')

    const now = new Date()
    const prefix = dayPrefix(now)
    const [{ n }] = await tx.query<{ n: number }>('SELECT COUNT(*) AS n FROM orders WHERE order_number LIKE ?', [`${prefix}%`])
    const orderNumber = `${prefix}${pad(n + 1, 4)}`
    const iso = now.toISOString()

    const { lastId: orderId } = await tx.run(
      `INSERT INTO orders (order_number, customer_id, received_at, expected_pickup, subtotal_cents, discount_cents,
                           total_cents, paid_cents, payment_status, notes, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [orderNumber, input.customerId, iso, input.expectedPickup, subtotal, input.discountCents, total, paid,
        paymentStatus(total, paid), input.notes.trim(), userId],
    )
    for (const l of lines) {
      await tx.run(
        `INSERT INTO order_items (order_id, service_id, service_name, pricing_method, unit_price_cents, quantity, amount_cents)
         VALUES (?,?,?,?,?,?,?)`,
        [orderId, l.svc.id, l.svc.name, l.svc.pricing_method, l.svc.price_cents, l.qty, l.amount],
      )
    }
    if (input.payment && paid > 0) {
      await tx.run(
        'INSERT INTO payments (order_id, amount_cents, method, paid_at, user_id, reference) VALUES (?,?,?,?,?,?)',
        [orderId, paid, input.payment.method, iso, userId, input.payment.reference.trim()],
      )
    }
    return { id: orderId, orderNumber }
  })
}
