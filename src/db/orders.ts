import { formatPeso } from '../lib/money'
import { isFinal, normalizeQuantity, paymentStatus } from '../lib/orders'
import { requirePermission } from '../lib/permissions'
import { parseMaxKg, priceCart, typeOf, type CartItem, type PricedLine } from '../lib/pricing'
import type { Inclusion, OrderItemRow, OrderStatus, PaymentMethod, Service } from '../types'
import { transaction, type Tx } from './client'
import { WALK_IN_CODE } from './customers'
import { checkTendered } from './payments'
import { OPEN_SHIFT_ID, requireOpenStore } from './shifts'

export interface NewOrderInput {
  customerId: number
  /** Loads / kg / pieces as entered; add-ons included by a package are added and discounted here, not by the UI. */
  items: CartItem[]
  discountCents: number
  expectedPickup: string | null // YYYY-MM-DD
  notes: string
  /** null = Pay Later: the order starts UNPAID with the full total as balance due. */
  payment: { amountCents: number; method: PaymentMethod; reference: string; tenderedCents?: number | null } | null
}

async function insertItems(tx: Tx, orderId: number, lines: PricedLine[]) {
  for (const l of lines) {
    await tx.run(
      `INSERT INTO order_items (order_id, service_id, service_name, pricing_method, pricing_type, unit_price_cents, quantity,
                                weight_kg, included_qty, note, amount_cents)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [orderId, l.service.id, l.service.name, l.service.pricing_method, l.service.pricing_type, l.service.price_cents, l.quantity,
        l.weightKg, l.includedQty, l.note, l.amountCents],
    )
  }
}

/** Laundry tag numbers: L-0001, L-0002 … (older orders keep their ORD-YYYYMMDD-#### numbers). */
const TAG_PREFIX = 'L-'

/**
 * Creates order, items and the optional first payment atomically.
 * Prices are read from the database here, never trusted from the UI. created_by is the signed-in employee, never passed in.
 */
export async function createOrder(input: NewOrderInput): Promise<{ id: number; orderNumber: string }> {
  const userId = requirePermission('orders.manage').id
  if (!input.items.length) throw new Error('Add at least one service.')
  if (!Number.isInteger(input.discountCents) || input.discountCents < 0) throw new Error('Invalid discount.')
  if (input.expectedPickup !== null && !/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/.test(input.expectedPickup)) throw new Error('Invalid pickup date.')

  return transaction(async (tx) => {
    const [customer] = await tx.query<{ customer_code: string }>('SELECT customer_code FROM customers WHERE id = ?', [input.customerId])
    // Every order belongs to a real customer; the old shared walk-in record only keeps past walk-in orders.
    if (!customer || customer.customer_code === WALK_IN_CODE) throw new Error('Select a customer, or add a new one.')

    const services = await tx.query<Service>('SELECT * FROM services WHERE active = 1')
    const inclusions = await tx.query<Inclusion>('SELECT service_id, included_id, quantity FROM service_inclusions')
    const [maxRow] = await tx.query<{ value: string }>("SELECT value FROM settings WHERE key = 'load_max_kg'")
    const items: CartItem[] = []
    for (const it of input.items) {
      const svc = services.find((s) => s.id === it.serviceId)
      if (!svc) throw new Error('A selected service is no longer available.')
      if (items.some((x) => x.serviceId === svc.id)) throw new Error(`${svc.name} is listed twice.`)
      const qty = normalizeQuantity(svc.pricing_method, it.quantity)
      if (qty === null) throw new Error(`Invalid quantity for ${svc.name}.`)
      const w = it.weightKg
      if (w != null && !(Number.isFinite(w) && w > 0 && w < 10000)) throw new Error(`Invalid weight for ${svc.name}.`)
      items.push({ serviceId: svc.id, quantity: qty, weightKg: w == null ? null : Math.round(w * 100) / 100 })
    }
    const lines = priceCart(services, inclusions, items, parseMaxKg(maxRow?.value))
    const subtotal = lines.reduce((a, l) => a + l.amountCents, 0)

    if (input.discountCents > subtotal) throw new Error('Discount cannot exceed the subtotal.')
    const total = subtotal - input.discountCents
    const paid = input.payment?.amountCents ?? 0
    if (!Number.isInteger(paid) || paid < 0) throw new Error('Invalid payment amount.')
    if (paid > total) throw new Error('Payment cannot exceed the order total.')
    const tendered = input.payment ? checkTendered(input.payment.method, paid, input.payment.tenderedCents) : null
    // Pay Later orders can be taken while closed (no money moves); money must land in an open shift's drawer.
    if (paid > 0) await requireOpenStore(tx)

    const now = new Date()
    const [{ n }] = await tx.query<{ n: number | null }>(
      "SELECT MAX(CAST(substr(order_number, 3) AS INTEGER)) AS n FROM orders WHERE order_number GLOB 'L-[0-9]*'",
    )
    const orderNumber = `${TAG_PREFIX}${String((n ?? 0) + 1).padStart(4, '0')}`
    const iso = now.toISOString()

    const { lastId: orderId } = await tx.run(
      `INSERT INTO orders (order_number, customer_id, received_at, expected_pickup, subtotal_cents, discount_cents,
                           total_cents, paid_cents, balance_cents, payment_status, notes, created_by, shift_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,${OPEN_SHIFT_ID})`,
      [orderNumber, input.customerId, iso, input.expectedPickup, subtotal, input.discountCents, total, paid, total - paid,
        paymentStatus(total, paid), input.notes.trim(), userId],
    )
    await insertItems(tx, orderId, lines)
    if (input.payment && paid > 0) {
      await tx.run(
        // The first payment belongs to the open store shift, like every payment (see db/shifts.ts).
        `INSERT INTO payments (order_id, amount_cents, method, paid_at, user_id, reference, tendered_cents, shift_id) VALUES (?,?,?,?,?,?,?,${OPEN_SHIFT_ID})`,
        [orderId, paid, input.payment.method, iso, userId, input.payment.reference.trim(), tendered],
      )
    }
    return { id: orderId, orderNumber }
  })
}

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')"

/** Completed and cancelled orders are history: their details can no longer change. */
async function openOrder(tx: Tx, id: number) {
  const [o] = await tx.query<{ status: OrderStatus; discount_cents: number; paid_cents: number }>(
    'SELECT status, discount_cents, paid_cents FROM orders WHERE id = ?', [id],
  )
  if (!o) throw new Error('Order not found.')
  if (o.status === 'released') throw new Error('This order is already completed and can no longer be changed.')
  if (isFinal(o.status)) throw new Error('This order was cancelled and can no longer be changed.')
  return o
}

/** Expected pickup ("YYYY-MM-DD" or "YYYY-MM-DD HH:MM", local), or null to clear it. */
export async function setOrderPickup(id: number, expectedPickup: string | null) {
  requirePermission('orders.manage')
  if (expectedPickup !== null && !/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/.test(expectedPickup)) throw new Error('Invalid pickup date.')
  return transaction(async (tx) => {
    await openOrder(tx, id)
    await tx.run(`UPDATE orders SET expected_pickup = ?, updated_at = ${NOW} WHERE id = ?`, [expectedPickup, id])
  })
}

export async function setOrderNotes(id: number, notes: string) {
  requirePermission('orders.manage')
  if (notes.length > 1000) throw new Error('Notes are too long (1,000 characters max).')
  return transaction(async (tx) => {
    await openOrder(tx, id)
    await tx.run(`UPDATE orders SET notes = ?, updated_at = ${NOW} WHERE id = ?`, [notes.trim(), id])
  })
}

/**
 * Sets how much of one service or add-on an open order has (0 removes it), then re-prices the whole order
 * with priceCart, the routine New Order uses, so package/service inclusions stay right.
 * Lines already on the order keep the name, price and pricing they were sold at; only a newly added item
 * takes today's price. The discount is kept, and the total may never drop below what's already paid.
 */
export async function setOrderItemQuantity(orderId: number, serviceId: number, quantity: number) {
  requirePermission('orders.manage')
  return transaction(async (tx) => {
    const order = await openOrder(tx, orderId)
    const saved = await tx.query<OrderItemRow>('SELECT * FROM order_items WHERE order_id = ? ORDER BY id', [orderId])
    const inclusions = await tx.query<Inclusion>('SELECT service_id, included_id, quantity FROM service_inclusions')
    const [maxRow] = await tx.query<{ value: string }>("SELECT value FROM settings WHERE key = 'load_max_kg'")
    const services = (await tx.query<Service>('SELECT * FROM services')).map((s) => {
      const l = saved.find((x) => x.service_id === s.id)
      return l ? { ...s, name: l.service_name, price_cents: l.unit_price_cents, pricing_method: l.pricing_method, pricing_type: typeOf(l) } : s
    })
    const byId = new Map(services.map((s) => [s.id, s]))

    // The order as New Order's cart. Add-on lines that exist only because something includes them are
    // left for priceCart to add back (or drop, when what included them is gone).
    const cart: CartItem[] = saved
      .filter((l) => !(byId.get(l.service_id)?.is_addon && l.quantity <= l.included_qty))
      .map((l) => ({ serviceId: l.service_id, quantity: l.quantity, weightKg: l.weight_kg }))

    const svc = byId.get(serviceId)
    if (!svc) throw new Error('This service no longer exists.')
    const idx = cart.findIndex((c) => c.serviceId === serviceId)
    if (quantity === 0) {
      if (idx < 0) throw new Error(`${svc.name} is included with this order and can't be removed on its own.`)
      cart.splice(idx, 1)
    } else {
      if (idx < 0 && !svc.active) throw new Error(`${svc.name} is no longer available.`)
      const qty = normalizeQuantity(svc.pricing_method, quantity)
      if (qty === null) throw new Error(`Invalid quantity for ${svc.name}.`)
      if (idx < 0) cart.push({ serviceId, quantity: qty, weightKg: null })
      // A new quantity makes the weight entered at drop-off stale.
      else if (cart[idx]!.quantity !== qty) cart[idx] = { serviceId, quantity: qty, weightKg: null }
    }
    if (!cart.length) throw new Error('An order needs at least one item. Cancel the order instead.')

    const lines = priceCart(services, inclusions, cart, parseMaxKg(maxRow?.value))
    const subtotal = lines.reduce((a, l) => a + l.amountCents, 0)
    if (order.discount_cents > subtotal) throw new Error(`The subtotal can't go below the ${formatPeso(order.discount_cents)} discount.`)
    const total = subtotal - order.discount_cents
    if (total < order.paid_cents) {
      throw new Error(`The new total (${formatPeso(total)}) would be less than the ${formatPeso(order.paid_cents)} already paid.`)
    }

    await tx.run('DELETE FROM order_items WHERE order_id = ?', [orderId])
    await insertItems(tx, orderId, lines)
    await tx.run(
      `UPDATE orders SET subtotal_cents = ?, total_cents = ?, balance_cents = ?, payment_status = ?, updated_at = ${NOW} WHERE id = ?`,
      [subtotal, total, total - order.paid_cents, paymentStatus(total, order.paid_cents), orderId],
    )
  })
}
