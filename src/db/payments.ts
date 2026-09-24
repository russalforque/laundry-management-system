import { paymentStatus } from '../lib/orders'
import type { OrderStatus, PaymentMethod } from '../types'
import { transaction } from './client'

const METHODS: PaymentMethod[] = ['cash', 'gcash', 'other']

export interface PaymentInput {
  orderId: number
  amountCents: number
  method: PaymentMethod
  reference: string
}

/**
 * Records a payment and recomputes paid/status from the payments table itself,
 * so orders.paid_cents can never drift from the payment records.
 */
export function addPayment(input: PaymentInput, userId: number) {
  return transaction(async (tx) => {
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new Error('Enter a payment amount above zero.')
    if (!METHODS.includes(input.method)) throw new Error('Invalid payment method.')

    const [order] = await tx.query<{ total_cents: number; status: OrderStatus }>(
      'SELECT total_cents, status FROM orders WHERE id = ?',
      [input.orderId],
    )
    if (!order) throw new Error('Order not found.')
    if (order.status === 'cancelled') throw new Error('Cannot add a payment to a cancelled order.')

    const [{ paid }] = await tx.query<{ paid: number }>('SELECT COALESCE(SUM(amount_cents),0) AS paid FROM payments WHERE order_id = ?', [input.orderId])
    const balance = order.total_cents - paid
    if (input.amountCents > balance) throw new Error('Payment is more than the remaining balance.')

    await tx.run('INSERT INTO payments (order_id, amount_cents, method, paid_at, user_id, reference) VALUES (?,?,?,?,?,?)', [
      input.orderId, input.amountCents, input.method, new Date().toISOString(), userId, input.reference.trim(),
    ])
    const newPaid = paid + input.amountCents
    await tx.run(
      "UPDATE orders SET paid_cents = ?, payment_status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
      [newPaid, paymentStatus(order.total_cents, newPaid), input.orderId],
    )
  })
}
