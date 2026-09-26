import { requirePermission } from '../lib/permissions'
import type { OrderStatus, PricingMethod, PricingType } from '../types'
import { query, queryOne } from './client'

/** Inclusive local dates (YYYY-MM-DD) to UTC ISO bounds; timestamps are stored in UTC. */
function bounds(from: string, to: string): [string, string] {
  requirePermission('reports.view', 'dashboard.financials')
  const start = new Date(`${from}T00:00:00`)
  const end = new Date(`${to}T00:00:00`)
  end.setDate(end.getDate() + 1)
  return [start.toISOString(), end.toISOString()]
}

const DAY = (col: string) => `date(${col}, 'localtime')`

export interface DailySales {
  date: string
  orders: number
  sales_cents: number
  /** Payments received on the date (by payment date, whatever day the order was taken), minus refunds given that day. */
  collected_cents: number
  /** The cash part of collected_cents (net of cash refunds); the rest is GCash / non-cash. */
  cash_cents: number
  /** Refunds given on the date (already taken out of collected_cents). */
  refunds_cents: number
  outstanding_cents: number
}

export async function dailySales(from: string, to: string): Promise<DailySales[]> {
  const [s, e] = bounds(from, to)
  const orders = await query<{ date: string; orders: number; sales_cents: number; outstanding_cents: number }>(
    `SELECT ${DAY('received_at')} AS date, COUNT(*) AS orders, SUM(total_cents) AS sales_cents,
            SUM(total_cents - paid_cents) AS outstanding_cents
     FROM orders WHERE status <> 'cancelled' AND received_at >= ? AND received_at < ? GROUP BY date`,
    [s, e],
  )
  const pays = await query<{ date: string; collected_cents: number; cash_cents: number }>(
    `SELECT ${DAY('paid_at')} AS date, SUM(amount_cents) AS collected_cents,
            COALESCE(SUM(CASE WHEN method = 'cash' THEN amount_cents END), 0) AS cash_cents
     FROM payments WHERE paid_at >= ? AND paid_at < ? GROUP BY date`,
    [s, e],
  )
  const refunds = await query<{ date: string; refunds_cents: number; cash_cents: number }>(
    `SELECT ${DAY('refunded_at')} AS date, SUM(amount_cents) AS refunds_cents,
            COALESCE(SUM(CASE WHEN method = 'cash' THEN amount_cents END), 0) AS cash_cents
     FROM refunds WHERE refunded_at >= ? AND refunded_at < ? GROUP BY date`,
    [s, e],
  )
  const map = new Map<string, DailySales>()
  const row = (date: string) => {
    if (!map.has(date)) map.set(date, { date, orders: 0, sales_cents: 0, collected_cents: 0, cash_cents: 0, refunds_cents: 0, outstanding_cents: 0 })
    return map.get(date)!
  }
  orders.forEach((o) => Object.assign(row(o.date), o))
  pays.forEach((p) => Object.assign(row(p.date), p))
  refunds.forEach((r) => {
    const d = row(r.date)
    d.refunds_cents = r.refunds_cents
    d.collected_cents -= r.refunds_cents
    d.cash_cents -= r.cash_cents
  })
  return [...map.values()].sort((a, b) => b.date.localeCompare(a.date))
}

export async function orderReport(from: string, to: string) {
  const [s, e] = bounds(from, to)
  const byDate = await query<{ date: string; orders: number }>(
    `SELECT ${DAY('received_at')} AS date, COUNT(*) AS orders FROM orders
     WHERE received_at >= ? AND received_at < ? GROUP BY date ORDER BY date DESC`,
    [s, e],
  )
  const byStatus = await query<{ status: OrderStatus; orders: number }>(
    `SELECT status, COUNT(*) AS orders FROM orders WHERE received_at >= ? AND received_at < ? GROUP BY status`,
    [s, e],
  )
  return { byDate, byStatus }
}

export interface ServiceUsage {
  service_name: string
  pricing_method: PricingMethod
  pricing_type: PricingType | null
  quantity: number
  orders: number
  revenue_cents: number
}

export function serviceReport(from: string, to: string) {
  const [s, e] = bounds(from, to)
  return query<ServiceUsage>(
    `SELECT i.service_name, i.pricing_method, MAX(i.pricing_type) AS pricing_type, SUM(i.quantity) AS quantity,
            COUNT(DISTINCT i.order_id) AS orders, SUM(i.amount_cents) AS revenue_cents
     FROM order_items i JOIN orders o ON o.id = i.order_id
     WHERE o.status <> 'cancelled' AND o.received_at >= ? AND o.received_at < ?
     GROUP BY i.service_id, i.service_name, i.pricing_method ORDER BY revenue_cents DESC`,
    [s, e],
  )
}

export interface CustomerSpend {
  full_name: string
  customer_code: string
  orders: number
  spent_cents: number
  outstanding_cents: number
}

export function customerReport(from: string, to: string) {
  const [s, e] = bounds(from, to)
  return query<CustomerSpend>(
    `SELECT c.full_name, c.customer_code, COUNT(*) AS orders, SUM(o.total_cents) AS spent_cents,
            SUM(o.total_cents - o.paid_cents) AS outstanding_cents
     FROM orders o JOIN customers c ON c.id = o.customer_id
     WHERE o.status <> 'cancelled' AND o.received_at >= ? AND o.received_at < ?
     GROUP BY c.id ORDER BY spent_cents DESC`,
    [s, e],
  )
}

export interface ReportSummary {
  orders: number
  revenue_cents: number
  /** Pieces for per-piece/fixed lines; each per-kg line counts as one load. */
  items: number
  /** Mean days from received to released (released orders only); null when none. */
  turnaround_days: number | null
}

export async function reportSummary(from: string, to: string): Promise<ReportSummary> {
  const [s, e] = bounds(from, to)
  const o = await queryOne<Omit<ReportSummary, 'items'>>(
    `SELECT COUNT(*) AS orders, COALESCE(SUM(total_cents), 0) AS revenue_cents,
            AVG(CASE WHEN status = 'released' THEN julianday(COALESCE(released_at, updated_at)) - julianday(received_at) END) AS turnaround_days
     FROM orders WHERE status <> 'cancelled' AND received_at >= ? AND received_at < ?`,
    [s, e],
  )
  const i = await queryOne<{ items: number }>(
    `SELECT COALESCE(SUM(CASE WHEN i.pricing_method = 'per_kg' THEN 1 ELSE i.quantity END), 0) AS items
     FROM order_items i JOIN orders o ON o.id = i.order_id
     WHERE o.status <> 'cancelled' AND o.received_at >= ? AND o.received_at < ?`,
    [s, e],
  )
  return { orders: o?.orders ?? 0, revenue_cents: o?.revenue_cents ?? 0, turnaround_days: o?.turnaround_days ?? null, items: i?.items ?? 0 }
}
