import { sessionCan } from '../lib/permissions'
import type { OrderRow } from '../types'
import { query, queryOne } from './client'
import { ORDER_CUSTOMER_NAME } from './customers'

export interface DashboardStats {
  today_orders: number
  today_sales_cents: number
  /** Money actually received today (any order) minus refunds given today, as opposed to the value of orders taken today. */
  today_collected_cents: number
  received: number
  washing: number
  drying: number
  ready: number
  released_today: number
  unpaid_orders: number
  outstanding_cents: number
}

/** Local-day bounds as UTC ISO strings (timestamps are stored in UTC). */
export function todayBounds() {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return [start.toISOString(), end.toISOString()] as const
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const [s, e] = todayBounds()
  const r = await queryOne<DashboardStats>(
    `SELECT
       COALESCE(SUM(CASE WHEN status <> 'cancelled' AND received_at >= ? AND received_at < ? THEN 1 END), 0) AS today_orders,
       COALESCE(SUM(CASE WHEN status <> 'cancelled' AND received_at >= ? AND received_at < ? THEN total_cents END), 0) AS today_sales_cents,
       COALESCE(SUM(status = 'received'), 0) AS received,
       COALESCE(SUM(status = 'washing'), 0) AS washing,
       COALESCE(SUM(status = 'drying'), 0) AS drying,
       COALESCE(SUM(status = 'ready'), 0) AS ready,
       COALESCE(SUM(status = 'released' AND COALESCE(released_at, updated_at) >= ? AND COALESCE(released_at, updated_at) < ?), 0) AS released_today,
       COALESCE(SUM(status <> 'cancelled' AND payment_status <> 'paid'), 0) AS unpaid_orders,
       COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN total_cents - paid_cents END), 0) AS outstanding_cents,
       (SELECT COALESCE(SUM(amount_cents), 0) FROM payments WHERE paid_at >= ? AND paid_at < ?)
         - (SELECT COALESCE(SUM(amount_cents), 0) FROM refunds WHERE refunded_at >= ? AND refunded_at < ?) AS today_collected_cents
     FROM orders`,
    [s, e, s, e, s, e, s, e, s, e],
  )
  // Sales and collections are business figures; staff get the operational counts only.
  if (!sessionCan('dashboard.financials')) return { ...r!, today_sales_cents: 0, today_collected_cents: 0 }
  return r!
}

/** Orders waiting to be claimed, earliest pickup first. */
export function getReadyForPickup(limit = 6) {
  return query<OrderRow>(
    `SELECT o.*, ${ORDER_CUSTOMER_NAME} AS customer_name
     FROM orders o JOIN customers c ON c.id = o.customer_id
     WHERE o.status = 'ready'
     ORDER BY COALESCE(o.expected_pickup, date(o.received_at, 'localtime')) ASC, o.received_at ASC LIMIT ?`,
    [limit],
  )
}
