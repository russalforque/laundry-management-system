import { paymentStatus } from '../lib/orders'
import { requireAdminApproval, requirePermission, sessionCan } from '../lib/permissions'
import type { OrderStatus, PaymentMethod } from '../types'
import { query, transaction } from './client'
import { ORDER_CUSTOMER_NAME } from './customers'
import { OPEN_SHIFT_ID, requireOpenStore } from './shifts'

export const METHODS: PaymentMethod[] = ['cash', 'gcash', 'other']
/** Longest payment reference / refund reason. */
export const MAX_NOTE = 500

export interface PaymentInput {
  orderId: number
  amountCents: number
  method: PaymentMethod
  reference: string
  /** Cash handed over (cash only); must cover amountCents. The excess is change and is not recorded as payment. */
  tenderedCents?: number | null
  /** Amount already paid as shown on the staff's screen; a mismatch means a duplicate or stale submission. */
  expectedPaidCents?: number
}

/** Validates cash tendered for a payment; returns the value to store (NULL unless cash). */
export function checkTendered(method: PaymentMethod, amountCents: number, tenderedCents: number | null | undefined): number | null {
  if (method !== 'cash' || tenderedCents == null) return null
  if (!Number.isInteger(tenderedCents) || tenderedCents < amountCents) throw new Error('Amount Received cannot be less than the Amount Paid.')
  return tenderedCents
}

/**
 * Records a payment and recomputes paid/balance/status from the payments table itself,
 * so orders.paid_cents can never drift from the payment records. Returns the new payment id.
 * The receiving employee is the signed-in one, never passed in.
 */
export async function addPayment(input: PaymentInput): Promise<number> {
  const userId = requirePermission('payments.collect').id
  return transaction(async (tx) => {
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new Error('Enter a payment amount above zero.')
    if (!METHODS.includes(input.method)) throw new Error('Invalid payment method.')
    if (input.reference.length > MAX_NOTE) throw new Error('The reference is too long (500 characters max).')
    const [order] = await tx.query<{ total_cents: number; status: OrderStatus }>(
      'SELECT total_cents, status FROM orders WHERE id = ?',
      [input.orderId],
    )
    if (!order) throw new Error('Order not found.')
    if (order.status === 'cancelled') throw new Error('Cannot add a payment to a cancelled order.')

    const [{ paid }] = await tx.query<{ paid: number }>('SELECT COALESCE(SUM(amount_cents),0) AS paid FROM payments WHERE order_id = ?', [input.orderId])
    if (input.expectedPaidCents !== undefined && input.expectedPaidCents !== paid)
      throw new Error('This order was just updated (payment may already be recorded). Check the payment history before trying again.')
    const balance = order.total_cents - paid
    if (balance <= 0) throw new Error('This order is already fully paid.')
    if (input.amountCents > balance) throw new Error('Payment is more than the Balance Due.')
    const tendered = checkTendered(input.method, input.amountCents, input.tenderedCents)
    await requireOpenStore(tx)

    // Counted in the store shift that is open when the money is received (a Pay Later balance paid today counts today).
    const { lastId } = await tx.run(`INSERT INTO payments (order_id, amount_cents, method, paid_at, user_id, reference, tendered_cents, shift_id) VALUES (?,?,?,?,?,?,?,${OPEN_SHIFT_ID})`, [
      input.orderId, input.amountCents, input.method, new Date().toISOString(), userId, input.reference.trim(), tendered,
    ])
    const newPaid = paid + input.amountCents
    await tx.run(
      "UPDATE orders SET paid_cents = ?, balance_cents = ?, payment_status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
      [newPaid, order.total_cents - newPaid, paymentStatus(order.total_cents, newPaid), input.orderId],
    )
    return lastId
  })
}

export interface RefundInput {
  orderId: number
  amountCents: number
  method: PaymentMethod
  reason: string
  /** Amount already refunded as shown on the staff's screen; a mismatch means a duplicate or stale submission. */
  expectedRefundedCents?: number
}

/**
 * Gives back money received on a CANCELLED order (the UI asks for an admin PIN first, like the cancel itself).
 * Payments are never edited: the refund is its own row in the open store shift, so a cash refund comes out of
 * that shift's expected drawer cash and a GCash refund out of its non-cash total. Returns the refund id.
 */
export async function refundOrder(input: RefundInput): Promise<number> {
  const userId = requirePermission('payments.collect').id
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new Error('Enter a refund amount above zero.')
  if (!METHODS.includes(input.method)) throw new Error('Invalid refund method.')
  if (!input.reason.trim()) throw new Error('Enter a reason for the refund.')
  if (input.reason.length > MAX_NOTE) throw new Error('The reason is too long (500 characters max).')
  requireAdminApproval(`refund:${input.orderId}`)
  return transaction(async (tx) => {
    await requireOpenStore(tx, 'giving refunds')
    const [order] = await tx.query<{ status: OrderStatus }>('SELECT status FROM orders WHERE id = ?', [input.orderId])
    if (!order) throw new Error('Order not found.')
    if (order.status !== 'cancelled') throw new Error('Only cancelled orders can be refunded. Cancel the order first.')

    const [{ paid, refunded }] = await tx.query<{ paid: number; refunded: number }>(
      `SELECT (SELECT COALESCE(SUM(amount_cents),0) FROM payments WHERE order_id = ?) AS paid,
              (SELECT COALESCE(SUM(amount_cents),0) FROM refunds WHERE order_id = ?) AS refunded`,
      [input.orderId, input.orderId],
    )
    if (input.expectedRefundedCents !== undefined && input.expectedRefundedCents !== refunded)
      throw new Error('This order was just updated (a refund may already be recorded). Check the order before trying again.')
    const refundable = paid - refunded
    if (refundable <= 0) throw new Error('Nothing left to refund on this order.')
    if (input.amountCents > refundable) throw new Error('Refund is more than the amount paid.')

    const { lastId } = await tx.run(
      `INSERT INTO refunds (order_id, amount_cents, method, reason, refunded_at, user_id, shift_id) VALUES (?,?,?,?,?,?,${OPEN_SHIFT_ID})`,
      [input.orderId, input.amountCents, input.method, input.reason.trim(), new Date().toISOString(), userId],
    )
    await tx.run(
      "UPDATE orders SET refunded_cents = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
      [refunded + input.amountCents, input.orderId],
    )
    return lastId
  })
}

export interface PaymentHistoryRow {
  id: number
  order_id: number
  order_number: string
  customer_name: string
  amount_cents: number
  method: PaymentMethod
  paid_at: string
  reference: string
  user_name: string
}

/**
 * Payments received, newest first. Employees without payments.viewAll only ever get the ones
 * they received themselves, whatever `userId` asks for.
 */
export async function listPayments(f: { userId?: number; date?: string } = {}, limit = 300) {
  const me = requirePermission('payments.collect', 'payments.viewAll')
  const userId = sessionCan('payments.viewAll') ? f.userId : me.id
  const where: string[] = []
  const params: unknown[] = []
  if (userId) { where.push('p.user_id = ?'); params.push(userId) }
  if (f.date) {
    // paid_at is UTC; compare against the local day's bounds.
    const start = new Date(`${f.date}T00:00:00`)
    const end = new Date(start)
    end.setDate(end.getDate() + 1)
    where.push('p.paid_at >= ? AND p.paid_at < ?')
    params.push(start.toISOString(), end.toISOString())
  }
  return query<PaymentHistoryRow>(
    `SELECT p.id, p.order_id, o.order_number, ${ORDER_CUSTOMER_NAME} AS customer_name, p.amount_cents, p.method, p.paid_at, p.reference,
            u.full_name AS user_name
     FROM payments p JOIN orders o ON o.id = p.order_id JOIN customers c ON c.id = o.customer_id JOIN users u ON u.id = p.user_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY p.paid_at DESC, p.id DESC LIMIT ?`,
    [...params, limit],
  )
}
