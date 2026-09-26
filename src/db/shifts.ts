import { requirePermission } from '../lib/permissions'
import type { OrderStatus, PaymentMethod } from '../types'
import { query, queryOne, run, transaction, type Tx } from './client'

/**
 * The daily store shift: one shared device and one shared cash drawer, so at most ONE shift is open
 * (enforced by the ux_shift_store_open index). This is not attendance: whoever is signed in can open it,
 * anyone can close it. Orders and payments are tagged with the open shift when they are saved
 * (orders.shift_id, payments.shift_id); totals are always derived from those payment rows, never copied,
 * and frozen into the shift row on close so history never changes.
 *
 * Stored status is 'active' / 'closed' (the column predates this feature); shown as OPEN / CLOSED.
 */

/** Subquery for the open shift's id (NULL when the store is closed), for use inside INSERT/UPDATE. */
export const OPEN_SHIFT_ID = "(SELECT id FROM shifts WHERE status = 'active')"

/**
 * Money only moves while the store is open, so every payment and refund lands in a shift's drawer count.
 * Call inside the transaction that records the money.
 */
export async function requireOpenStore(tx: Pick<Tx, 'query'>, action = 'taking payments') {
  const [open] = await tx.query<{ id: number }>("SELECT id FROM shifts WHERE status = 'active'")
  if (!open) throw new Error(`The store is closed. Open the store before ${action}.`)
  return open.id
}

export interface StoreShift {
  id: number
  user_id: number
  user_name: string
  started_at: string
  ended_at: string | null
  status: 'active' | 'closed'
  opening_cash_cents: number | null
  orders_count: number | null
  cash_cents: number | null
  noncash_cents: number | null
  expected_cash_cents: number | null
  actual_cash_cents: number | null
  difference_cents: number | null
  closed_by: number | null
  closed_by_name: string | null
  /** Cash refunds frozen at closing (NULL on shifts closed before refunds existed). */
  cash_out_cents: number | null
}

/** Money and counts for one shift, computed from its payments and orders. */
export interface ShiftTotals {
  opening_cents: number
  /** Cash applied to balances (change handed back is never included). */
  cash_cents: number
  /** GCash and other non-cash methods: counted as payments, never as drawer cash. */
  noncash_cents: number
  /** Cash refunded out of the drawer (refunds on cancelled orders). */
  outflow_cents: number
  /** All refunds in the shift, cash and non-cash. */
  refunds_cents: number
  refunds_count: number
  expected_cash_cents: number
  payments_count: number
  payments_cents: number
  /** Part of payments_cents that settles orders taken outside this shift (e.g. yesterday's Pay Later). */
  collected_later_cents: number
  /** Orders taken during the shift (cancelled ones excluded). */
  orders_count: number
  released_count: number
  cancelled_count: number
}

export type CashResult = 'balanced' | 'over' | 'short'
export const cashResult = (difference: number): CashResult => (difference === 0 ? 'balanced' : difference > 0 ? 'over' : 'short')

export function getOpenShift() {
  requirePermission('store.operate', 'store.history')
  return queryOne<StoreShift>("SELECT * FROM shifts WHERE status = 'active'")
}

async function totalsIn(tx: Pick<Tx, 'query'>, s: Pick<StoreShift, 'id' | 'opening_cash_cents'>): Promise<ShiftTotals> {
  const [p] = await tx.query<{ cash: number; noncash: number; n: number; later: number }>(
    `SELECT COALESCE(SUM(CASE WHEN p.method = 'cash' THEN p.amount_cents END), 0) AS cash,
            COALESCE(SUM(CASE WHEN p.method <> 'cash' THEN p.amount_cents END), 0) AS noncash,
            COUNT(*) AS n,
            COALESCE(SUM(CASE WHEN COALESCE(o.shift_id, -1) <> p.shift_id THEN p.amount_cents END), 0) AS later
     FROM payments p JOIN orders o ON o.id = p.order_id WHERE p.shift_id = ?`,
    [s.id],
  )
  const [o] = await tx.query<{ taken: number; released: number; cancelled: number }>(
    `SELECT
       (SELECT COUNT(*) FROM orders WHERE shift_id = ? AND status <> 'cancelled') AS taken,
       (SELECT COUNT(*) FROM orders WHERE released_shift_id = ?) AS released,
       (SELECT COUNT(*) FROM shift_events WHERE shift_id = ? AND kind = 'order_cancelled') AS cancelled`,
    [s.id, s.id, s.id],
  )
  const [r] = await tx.query<{ cash: number; total: number; n: number }>(
    `SELECT COALESCE(SUM(CASE WHEN method = 'cash' THEN amount_cents END), 0) AS cash,
            COALESCE(SUM(amount_cents), 0) AS total, COUNT(*) AS n
     FROM refunds WHERE shift_id = ?`,
    [s.id],
  )
  const opening = s.opening_cash_cents ?? 0
  const outflow = r!.cash
  return {
    opening_cents: opening,
    cash_cents: p!.cash,
    noncash_cents: p!.noncash,
    outflow_cents: outflow,
    refunds_cents: r!.total,
    refunds_count: r!.n,
    expected_cash_cents: opening + p!.cash - outflow,
    payments_count: p!.n,
    payments_cents: p!.cash + p!.noncash,
    collected_later_cents: p!.later,
    orders_count: o!.taken,
    released_count: o!.released,
    cancelled_count: o!.cancelled,
  }
}

export function shiftTotals(s: Pick<StoreShift, 'id' | 'opening_cash_cents'>) {
  requirePermission('store.operate', 'store.history')
  return totalsIn({ query }, s)
}

/** Opens the store with the starting drawer money (not revenue). Refuses if a shift is already open. */
export async function openStore(openingCashCents: number): Promise<number> {
  const me = requirePermission('store.operate')
  if (!Number.isInteger(openingCashCents) || openingCashCents < 0) throw new Error('Enter the opening cash (0 or more).')
  return transaction(async (tx) => {
    const [open] = await tx.query<{ id: number }>("SELECT id FROM shifts WHERE status = 'active'")
    if (open) throw new Error('The store is already open. Close the current shift first.')
    const { lastId } = await tx.run(
      "INSERT INTO shifts (user_id, user_name, started_at, status, opening_cash_cents) VALUES (?,?,?,'active',?)",
      [me.id, me.full_name, new Date().toISOString(), openingCashCents],
    )
    return lastId
  })
}

/**
 * Closes the open shift with the counted drawer. `shiftId` must still be the open one, so a stale screen
 * or a double tap can't close twice. Freezes the totals; orders and payments are never touched.
 */
export async function closeStore(shiftId: number, actualCashCents: number) {
  const me = requirePermission('store.operate')
  if (!Number.isInteger(actualCashCents) || actualCashCents < 0) throw new Error('Enter the cash you counted (0 or more).')
  return transaction(async (tx) => {
    const [s] = await tx.query<StoreShift>('SELECT * FROM shifts WHERE id = ?', [shiftId])
    if (!s) throw new Error('Store shift not found.')
    if (s.status !== 'active') throw new Error('This store shift is already closed.')
    const t = await totalsIn(tx, s)
    const difference = actualCashCents - t.expected_cash_cents
    await tx.run(
      `UPDATE shifts SET status = 'closed', ended_at = ?, orders_count = ?, cash_cents = ?, noncash_cents = ?,
         expected_cash_cents = ?, actual_cash_cents = ?, difference_cents = ?, closed_by = ?, closed_by_name = ?, cash_out_cents = ?
       WHERE id = ? AND status = 'active'`,
      [new Date().toISOString(), t.orders_count, t.cash_cents, t.noncash_cents, t.expected_cash_cents, actualCashCents, difference, me.id, me.full_name, t.outflow_cents, shiftId],
    )
    return { difference, result: cashResult(difference) }
  })
}

/** Past (and the current) store shifts, newest first. */
export function listShifts(limit = 100) {
  requirePermission('store.history')
  return query<StoreShift>('SELECT * FROM shifts ORDER BY started_at DESC, id DESC LIMIT ?', [limit])
}

export interface ShiftPayment {
  id: number
  order_id: number
  order_number: string
  customer_name: string
  amount_cents: number
  tendered_cents: number | null
  method: PaymentMethod
  reference: string
  paid_at: string
  user_name: string
  /** True when the order was taken in an earlier shift (a Pay Later / partial balance collected now). */
  collected_later: number
}

export interface ShiftEvent { id: number; kind: 'drawer_open' | 'order_cancelled'; at: string; detail: string; user_name: string | null; order_number: string | null }

export interface ShiftRefund { id: number; order_id: number; order_number: string; customer_name: string; amount_cents: number; method: PaymentMethod; reason: string; refunded_at: string; user_name: string }

export interface ShiftOrder { id: number; order_number: string; customer_name: string; total_cents: number; paid_cents: number; status: OrderStatus; received_at: string }

/** One shift with its transaction breakdown. The open shift's totals are live; a closed one uses its frozen figures. */
export async function getShiftDetail(id: number) {
  requirePermission('store.history', 'store.operate')
  const s = await queryOne<StoreShift>('SELECT * FROM shifts WHERE id = ?', [id])
  if (!s) return null
  const [totals, payments, orders, events, refunds] = await Promise.all([
    totalsIn({ query }, s),
    query<ShiftPayment>(
      `SELECT p.id, p.order_id, o.order_number, c.full_name AS customer_name, p.amount_cents, p.tendered_cents, p.method, p.reference,
              p.paid_at, u.full_name AS user_name, (COALESCE(o.shift_id, -1) <> p.shift_id) AS collected_later
       FROM payments p JOIN orders o ON o.id = p.order_id JOIN customers c ON c.id = o.customer_id JOIN users u ON u.id = p.user_id
       WHERE p.shift_id = ? ORDER BY p.paid_at DESC, p.id DESC`,
      [id],
    ),
    query<ShiftOrder>(
      `SELECT o.id, o.order_number, c.full_name AS customer_name, o.total_cents, o.paid_cents, o.status, o.received_at
       FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.shift_id = ? ORDER BY o.received_at DESC`,
      [id],
    ),
    query<ShiftEvent>(
      `SELECT e.id, e.kind, e.at, e.detail, u.full_name AS user_name, o.order_number
       FROM shift_events e LEFT JOIN users u ON u.id = e.user_id LEFT JOIN orders o ON o.id = e.order_id
       WHERE e.shift_id = ? ORDER BY e.at DESC`,
      [id],
    ),
    query<ShiftRefund>(
      `SELECT r.id, r.order_id, o.order_number, c.full_name AS customer_name, r.amount_cents, r.method, r.reason, r.refunded_at,
              u.full_name AS user_name
       FROM refunds r JOIN orders o ON o.id = r.order_id JOIN customers c ON c.id = o.customer_id JOIN users u ON u.id = r.user_id
       WHERE r.shift_id = ? ORDER BY r.refunded_at DESC, r.id DESC`,
      [id],
    ),
  ])
  // Closed shifts report what was recorded at closing, so later edits can never rewrite history.
  let frozen = totals
  if (s.status === 'closed' && s.expected_cash_cents != null) {
    const cash = s.cash_cents ?? totals.cash_cents
    const noncash = s.noncash_cents ?? totals.noncash_cents
    frozen = {
      ...totals, cash_cents: cash, noncash_cents: noncash, payments_cents: cash + noncash, outflow_cents: s.cash_out_cents ?? 0,
      expected_cash_cents: s.expected_cash_cents, orders_count: s.orders_count ?? totals.orders_count,
    }
  }
  return { shift: s, totals: frozen, payments, orders, events, refunds }
}

/**
 * Notes a drawer-affecting event (manual drawer open, cancelled order) on the open shift, for the audit trail.
 * Does nothing while the store is closed. Never throws: the action it records has already happened.
 */
export async function recordShiftEvent(kind: ShiftEvent['kind'], userId: number | null, orderId: number | null = null, detail = '', tx?: Pick<Tx, 'run'>) {
  try {
    const sql = `INSERT INTO shift_events (shift_id, user_id, kind, order_id, detail, at)
                 SELECT id, ?, ?, ?, ?, ? FROM shifts WHERE status = 'active'`
    const args = [userId, kind, orderId, detail, new Date().toISOString()]
    if (tx) await tx.run(sql, args)
    else await run(sql, args)
  } catch (e) {
    console.error('Could not record shift event', e)
  }
}
