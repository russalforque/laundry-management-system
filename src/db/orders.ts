import { normalizeQuantity, paymentStatus } from '../lib/orders'
import { requirePermission } from '../lib/permissions'
import { parseMaxKg, priceCart, type CartItem } from '../lib/pricing'
import type { Inclusion, PaymentMethod, Service } from '../types'
import { transaction } from './client'
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
    const [customer] = await tx.query('SELECT id FROM customers WHERE id = ?', [input.customerId])
    if (!customer) throw new Error('Select a customer.')

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
    for (const l of lines) {
      await tx.run(
        `INSERT INTO order_items (order_id, service_id, service_name, pricing_method, pricing_type, unit_price_cents, quantity,
                                  weight_kg, included_qty, note, amount_cents)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [orderId, l.service.id, l.service.name, l.service.pricing_method, l.service.pricing_type, l.service.price_cents, l.quantity,
          l.weightKg, l.includedQty, l.note, l.amountCents],
      )
    }
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
