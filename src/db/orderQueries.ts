import { canChangeStatus, paymentStatus } from '../lib/orders'
import { requirePermission } from '../lib/permissions'
import type { OrderItemRow, OrderRow, OrderStatus, PaymentRow, PaymentStatus, RefundRow } from '../types'
import { query, queryOne, transaction } from './client'
import { hasOpenMachine, syncMachineWithStatus } from './machines'
import { OPEN_SHIFT_ID, recordShiftEvent } from './shifts'

export interface OrderFilters {
  text?: string
  status?: OrderStatus | ''
  /** 'due' = unpaid or partial on an order that isn't cancelled (money still to collect). */
  paymentStatus?: PaymentStatus | 'due' | ''
  date?: string // YYYY-MM-DD, local day
  customerId?: number
}

export interface OrderListRow extends OrderRow {
  /** e.g. "2 × T-shirt, 3.5 kg Wash & Fold, Comforter" */
  items: string | null
  /** Machine the order is in right now, e.g. "W03". */
  machine_code: string | null
}

const MACHINE_NOW = `(SELECT a.machine_code FROM machine_assignments a WHERE a.order_id = o.id AND a.ended_at IS NULL) AS machine_code`

/** Readable quantity + name per line: loads as "2 loads", pieces as "2 ×", weight as "3.5 kg", fixed-price as the name alone. */
const ITEMS_SUMMARY = `(SELECT GROUP_CONCAT(
    CASE WHEN i.pricing_type = 'per_load'
      THEN CAST(i.quantity AS INTEGER) || (CASE WHEN i.quantity = 1 THEN ' load ' ELSE ' loads ' END) || i.service_name
    ELSE CASE i.pricing_method
      WHEN 'per_piece' THEN CAST(i.quantity AS INTEGER) || ' × ' || i.service_name
      WHEN 'per_kg' THEN rtrim(rtrim(printf('%.2f', i.quantity), '0'), '.') || ' kg ' || i.service_name
      ELSE i.service_name
    END END, ', ') FROM order_items i WHERE i.order_id = o.id) AS items`

export function listOrders(f: OrderFilters = {}, limit = 300) {
  const { where, params } = orderWhere(f)
  return query<OrderListRow>(
    `SELECT o.*, c.full_name AS customer_name, ${ITEMS_SUMMARY}, ${MACHINE_NOW} FROM orders o JOIN customers c ON c.id = o.customer_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY o.received_at DESC LIMIT ?`,
    [...params, limit],
  )
}

/** Orders per status under the same filters (status itself ignored), for the filter chip counts. */
export async function countOrdersByStatus(f: Omit<OrderFilters, 'status'> = {}) {
  const { where, params } = orderWhere(f)
  const rows = await query<{ status: OrderStatus; n: number }>(
    `SELECT o.status, COUNT(*) AS n FROM orders o JOIN customers c ON c.id = o.customer_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''} GROUP BY o.status`,
    params,
  )
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Partial<Record<OrderStatus, number>>
}

function orderWhere(f: OrderFilters) {
  const where: string[] = []
  const params: unknown[] = []
  if (f.text?.trim()) {
    const like = `%${f.text.trim()}%`
    where.push('(o.order_number LIKE ? OR c.full_name LIKE ? OR c.contact LIKE ?)')
    params.push(like, like, like)
  }
  if (f.customerId) { where.push('o.customer_id = ?'); params.push(f.customerId) }
  if (f.status) { where.push('o.status = ?'); params.push(f.status) }
  if (f.paymentStatus === 'due') where.push("o.payment_status <> 'paid' AND o.status <> 'cancelled'")
  else if (f.paymentStatus) { where.push('o.payment_status = ?'); params.push(f.paymentStatus) }
  if (f.date) {
    // received_at is stored in UTC; compare against the local day's UTC bounds.
    const start = new Date(`${f.date}T00:00:00`)
    const end = new Date(start)
    end.setDate(end.getDate() + 1)
    where.push('o.received_at >= ? AND o.received_at < ?')
    params.push(start.toISOString(), end.toISOString())
  }
  return { where, params }
}

export async function getOrderDetail(id: number) {
  const order = await queryOne<OrderRow & {
    customer_contact: string; created_by: number; created_by_name: string | null; released_at: string | null; released_by_name: string | null
  }>(
    `SELECT o.*, c.full_name AS customer_name, c.contact AS customer_contact, u.full_name AS created_by_name, r.full_name AS released_by_name
     FROM orders o JOIN customers c ON c.id = o.customer_id LEFT JOIN users u ON u.id = o.created_by LEFT JOIN users r ON r.id = o.released_by
     WHERE o.id = ?`,
    [id],
  )
  if (!order) return null
  const items = await query<OrderItemRow>('SELECT * FROM order_items WHERE order_id = ? ORDER BY id', [id])
  const payments = await query<PaymentRow>(
    `SELECT p.*, u.full_name AS user_name FROM payments p JOIN users u ON u.id = p.user_id
     WHERE p.order_id = ? ORDER BY p.paid_at, p.id`,
    [id],
  )
  const refunds = await query<RefundRow>(
    `SELECT r.*, u.full_name AS user_name FROM refunds r JOIN users u ON u.id = r.user_id
     WHERE r.order_id = ? ORDER BY r.refunded_at, r.id`,
    [id],
  )
  return { order, items, payments, refunds }
}

/**
 * One payment with the order state as it was right after that payment,
 * so reprinting an older payment receipt still shows the balance at that time.
 */
export async function getPaymentReceipt(orderId: number, paymentId: number) {
  const detail = await getOrderDetail(orderId)
  const payment = detail?.payments.find((p) => p.id === paymentId)
  if (!detail || !payment) return null
  const idx = detail.payments.indexOf(payment)
  const paidAfter = detail.payments.slice(0, idx + 1).reduce((a, p) => a + p.amount_cents, 0)
  const total = detail.order.total_cents
  return {
    order: detail.order,
    payment,
    previousBalanceCents: total - (paidAfter - payment.amount_cents),
    paidAfterCents: paidAfter,
    balanceAfterCents: total - paidAfter,
    statusAfter: paymentStatus(total, paidAfter),
  }
}

/**
 * Mark Ready (washed, no drying), Complete Order and Cancel. Machine moves (washing/drying) go through
 * db/machines.ts. Validates against the stored state, so stale screens and double taps can't corrupt it.
 */
export async function setOrderStatus(id: number, to: OrderStatus, userId?: number) {
  const me = requirePermission('orders.manage')
  return transaction(async (tx) => {
    // A cancellation is a void and a release hands over the laundry: both are recorded against a signed-in employee.
    if ((to === 'cancelled' || to === 'released') && !userId) throw new Error(to === 'cancelled' ? 'Sign in to cancel orders.' : 'Sign in to release laundry.')
    const [row] = await tx.query<{ status: OrderStatus; balance_cents: number }>('SELECT status, total_cents - paid_cents AS balance_cents FROM orders WHERE id = ?', [id])
    if (!row) throw new Error('Order not found.')
    if (row.status === 'released') throw new Error('This order is already completed. The laundry was released.')
    if (row.status === 'cancelled') throw new Error('This order was cancelled and can no longer be changed.')
    if (!canChangeStatus(row.status, to) || to === 'washing' || to === 'drying') throw new Error('This order can no longer change to that status.')
    if (to === 'ready' && (await hasOpenMachine(tx, id))) throw new Error('Finish the machine cycle first.')
    if (to === 'released' && row.balance_cents > 0) throw new Error('Collect the remaining balance before releasing the laundry.')
    if (to === 'released') {
      // Recorded against the signed-in employee, never the id passed in.
      await tx.run(
        `UPDATE orders SET status = 'released', released_at = ?, released_by = ?, released_shift_id = ${OPEN_SHIFT_ID},
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
        [new Date().toISOString(), me.id, id],
      )
    } else {
      await tx.run("UPDATE orders SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?", [to, id])
      // A void is part of the store shift's audit trail; its payments stay as recorded (there are no refunds).
      if (to === 'cancelled') await recordShiftEvent('order_cancelled', me.id, id, '', tx)
    }
    await syncMachineWithStatus(tx, id, to)
  })
}

/** Scan / type-in lookup: the order with exactly this number (see parseOrderCode), or null. */
export async function findOrderByNumber(orderNumber: string) {
  requirePermission('orders.manage')
  return (await queryOne<{ id: number }>('SELECT id FROM orders WHERE order_number = ?', [orderNumber])) ?? null
}
