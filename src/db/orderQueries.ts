import { canChangeStatus } from '../lib/orders'
import type { OrderItemRow, OrderRow, OrderStatus, PaymentRow, PaymentStatus } from '../types'
import { query, queryOne, transaction } from './client'

const SELECT = `SELECT o.*, c.full_name AS customer_name FROM orders o JOIN customers c ON c.id = o.customer_id`

export interface OrderFilters {
  text?: string
  status?: OrderStatus | ''
  paymentStatus?: PaymentStatus | ''
  date?: string // YYYY-MM-DD, local day
}

export function listOrders(f: OrderFilters = {}, limit = 300) {
  const where: string[] = []
  const params: unknown[] = []
  if (f.text?.trim()) {
    where.push('(o.order_number LIKE ? OR c.full_name LIKE ?)')
    params.push(`%${f.text.trim()}%`, `%${f.text.trim()}%`)
  }
  if (f.status) { where.push('o.status = ?'); params.push(f.status) }
  if (f.paymentStatus) { where.push('o.payment_status = ?'); params.push(f.paymentStatus) }
  if (f.date) {
    // received_at is stored in UTC; compare against the local day's UTC bounds.
    const start = new Date(`${f.date}T00:00:00`)
    const end = new Date(start)
    end.setDate(end.getDate() + 1)
    where.push('o.received_at >= ? AND o.received_at < ?')
    params.push(start.toISOString(), end.toISOString())
  }
  return query<OrderRow>(
    `${SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY o.received_at DESC LIMIT ?`,
    [...params, limit],
  )
}

export async function getOrderDetail(id: number) {
  const order = await queryOne<OrderRow>(`${SELECT} WHERE o.id = ?`, [id])
  if (!order) return null
  const items = await query<OrderItemRow>('SELECT * FROM order_items WHERE order_id = ? ORDER BY id', [id])
  const payments = await query<PaymentRow>(
    `SELECT p.*, u.full_name AS user_name FROM payments p JOIN users u ON u.id = p.user_id
     WHERE p.order_id = ? ORDER BY p.paid_at, p.id`,
    [id],
  )
  return { order, items, payments }
}

/** Validates the transition against the current stored status, so stale screens can't corrupt it. */
export function setOrderStatus(id: number, to: OrderStatus) {
  return transaction(async (tx) => {
    const [row] = await tx.query<{ status: OrderStatus }>('SELECT status FROM orders WHERE id = ?', [id])
    if (!row) throw new Error('Order not found.')
    if (!canChangeStatus(row.status, to)) throw new Error('This order can no longer change to that status.')
    await tx.run("UPDATE orders SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?", [to, id])
  })
}
