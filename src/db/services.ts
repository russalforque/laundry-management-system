import { canInclude, METHOD_OF, TYPE_LABEL, TYPE_UNIT } from '../lib/pricing'
import { requirePermission } from '../lib/permissions'
import type { Inclusion, OrderStatus, PricingMethod, PricingType, Service } from '../types'
import { query, queryOne, run, transaction } from './client'

/** Labels for the stored calculation class (reports, legacy lines). */
export const PRICING_LABEL: Record<PricingMethod, string> = {
  per_kg: 'Per KG',
  per_piece: 'Per Piece',
  fixed: 'Fixed Price',
}
export const PRICING_UNIT: Record<PricingMethod, string> = { per_kg: '/kg', per_piece: '/pc', fixed: '' }

export interface ServiceInput {
  name: string
  description: string
  pricingType: PricingType
  priceCents: number
  active: boolean
  image: string | null
  /** Add-on (detergent, fabric conditioner…) rather than a main laundry service. */
  isAddon: boolean
  /** Package bundling services and add-ons (e.g. Wash + Dry + Fold). */
  isPackage: boolean
  /** Max kg per load for this item; null = the Settings value. */
  maxKg: number | null
  /** What this item bundles, quantity per load/unit. */
  inclusions: { id: number; quantity: number }[]
}

function validate(i: ServiceInput) {
  if (!i.name.trim()) throw new Error('Name is required.')
  if (!(i.pricingType in TYPE_LABEL)) throw new Error('Invalid pricing type.')
  if (!Number.isInteger(i.priceCents) || i.priceCents < 0) throw new Error('Price must be zero or more.')
  if (i.isAddon && i.isPackage) throw new Error('An item cannot be both a package and an add-on.')
  if (i.maxKg !== null && !(i.maxKg > 0 && i.maxKg <= 1000)) throw new Error('Max weight per load must be more than 0 kg.')
  if (i.isAddon && i.inclusions.length) throw new Error('Add-ons cannot include other items.')
  for (const inc of i.inclusions) {
    if (!Number.isInteger(inc.quantity) || inc.quantity < 1 || inc.quantity > 99) throw new Error('Included quantity must be a whole number from 1 to 99.')
  }
}

export const listServices = (activeOnly = false) =>
  query<Service>(`SELECT * FROM services ${activeOnly ? 'WHERE active = 1' : ''} ORDER BY name COLLATE NOCASE`)

export const listInclusions = () => query<Inclusion>('SELECT service_id, included_id, quantity FROM service_inclusions ORDER BY id')

/** Saves the row and what it includes atomically. Price changes never touch existing orders: order_items snapshot them. */
async function save(id: number | null, i: ServiceInput): Promise<number> {
  requirePermission('services.manage')
  validate(i)
  const self = { is_addon: i.isAddon ? 1 : 0, is_package: i.isPackage ? 1 : 0 }
  return transaction(async (tx) => {
    const [dup] = await tx.query('SELECT id FROM services WHERE name = ? COLLATE NOCASE AND id IS NOT ?', [i.name.trim(), id])
    if (dup) throw new Error('A service with this name already exists.')
    const vals = [i.name.trim(), i.description.trim(), METHOD_OF[i.pricingType], i.pricingType, i.priceCents, i.active ? 1 : 0, i.image,
      self.is_addon, self.is_package, i.maxKg]
    if (id) {
      await tx.run(
        `UPDATE services SET name=?, description=?, pricing_method=?, pricing_type=?, price_cents=?, active=?, image=?, is_addon=?, is_package=?,
         max_kg=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`,
        [...vals, id],
      )
      // If this item changed kind (e.g. became a package), bundles that can no longer hold it drop it.
      const parents = await tx.query<Service>('SELECT s.* FROM services s JOIN service_inclusions i ON i.service_id = s.id WHERE i.included_id = ?', [id])
      for (const p of parents) {
        if (!canInclude(p, self)) await tx.run('DELETE FROM service_inclusions WHERE service_id = ? AND included_id = ?', [p.id, id])
      }
    } else {
      id = (await tx.run(
        'INSERT INTO services (name, description, pricing_method, pricing_type, price_cents, active, image, is_addon, is_package, max_kg) VALUES (?,?,?,?,?,?,?,?,?,?)',
        vals,
      )).lastId
    }
    await tx.run('DELETE FROM service_inclusions WHERE service_id = ?', [id])
    for (const inc of i.inclusions) {
      const [child] = await tx.query<Service>('SELECT * FROM services WHERE id = ?', [inc.id])
      if (!child || child.id === id) continue
      if (!canInclude(self, child)) throw new Error(i.isPackage ? `${child.name} cannot be part of a package.` : `Only add-ons can be included in a service (${child.name}).`)
      await tx.run('INSERT INTO service_inclusions (service_id, included_id, quantity) VALUES (?,?,?)', [id, child.id, inc.quantity])
    }
    return id!
  })
}

export const createService = (i: ServiceInput) => save(null, i)
export const updateService = (id: number, i: ServiceInput) => save(id, i)

export const setServiceActive = async (id: number, active: boolean) => {
  requirePermission('services.manage')
  return run("UPDATE services SET active=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?", [active ? 1 : 0, id])
}

/** Only never-ordered items can be deleted; past orders reference them, so those are deactivated instead. */
export async function deleteService(id: number) {
  requirePermission('services.manage')
  const used = await queryOne<{ n: number }>('SELECT COUNT(*) AS n FROM order_items WHERE service_id = ?', [id])
  if (used?.n) throw new Error('This item is on past orders, so it can’t be deleted. Deactivate it instead.')
  await run('DELETE FROM services WHERE id = ?', [id])
}

/** " / load", " / kg", " flat" — appended to a price. */
export const priceUnit = (t: PricingType) => (t === 'fixed' ? ' flat' : ` ${TYPE_UNIT[t].replace('/', '/ ')}`)

export interface ServiceStats {
  orders: number
  revenue_cents: number
}

export async function serviceStats(serviceId: number): Promise<ServiceStats> {
  requirePermission('services.manage')
  const r = await queryOne<ServiceStats>(
    `SELECT COUNT(DISTINCT i.order_id) AS orders, COALESCE(SUM(i.amount_cents), 0) AS revenue_cents
     FROM order_items i JOIN orders o ON o.id = i.order_id
     WHERE i.service_id = ? AND o.status <> 'cancelled'`,
    [serviceId],
  )
  return r ?? { orders: 0, revenue_cents: 0 }
}

export interface ServiceOrder {
  id: number
  order_number: string
  received_at: string
  status: OrderStatus
  quantity: number
  pricing_method: PricingMethod
  pricing_type: PricingType | null
  amount_cents: number
}

/** Latest orders that include this service, with this service's line on each. */
export const serviceRecentOrders = async (serviceId: number, limit = 5) => {
  requirePermission('services.manage')
  return query<ServiceOrder>(
    `SELECT o.id, o.order_number, o.received_at, o.status,
            SUM(i.quantity) AS quantity, i.pricing_method, i.pricing_type, SUM(i.amount_cents) AS amount_cents
     FROM order_items i JOIN orders o ON o.id = i.order_id
     WHERE i.service_id = ? GROUP BY o.id ORDER BY o.received_at DESC LIMIT ?`,
    [serviceId, limit],
  )
}
