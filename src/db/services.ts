import type { PricingMethod, Service } from '../types'
import { query, run } from './client'

export const PRICING_LABEL: Record<PricingMethod, string> = {
  per_kg: 'Per KG',
  per_piece: 'Per Piece',
  fixed: 'Fixed Price',
}
export const PRICING_UNIT: Record<PricingMethod, string> = { per_kg: '/kg', per_piece: '/pc', fixed: '' }

export interface ServiceInput {
  name: string
  description: string
  pricingMethod: PricingMethod
  priceCents: number
  active: boolean
}

function validate(i: ServiceInput) {
  if (!i.name.trim()) throw new Error('Service name is required.')
  if (!(i.pricingMethod in PRICING_LABEL)) throw new Error('Invalid pricing method.')
  if (!Number.isInteger(i.priceCents) || i.priceCents < 0) throw new Error('Price must be zero or more.')
}

export const listServices = (activeOnly = false) =>
  query<Service>(`SELECT * FROM services ${activeOnly ? 'WHERE active = 1' : ''} ORDER BY name COLLATE NOCASE`)

async function guardDuplicate<T>(fn: () => Promise<T>) {
  try {
    return await fn()
  } catch {
    throw new Error('A service with this name already exists.')
  }
}

export async function createService(i: ServiceInput) {
  validate(i)
  await guardDuplicate(() =>
    run('INSERT INTO services (name, description, pricing_method, price_cents, active) VALUES (?,?,?,?,?)', [
      i.name.trim(), i.description.trim(), i.pricingMethod, i.priceCents, i.active ? 1 : 0,
    ]),
  )
}

/** Price changes never touch existing orders: order_items snapshot name and price. */
export async function updateService(id: number, i: ServiceInput) {
  validate(i)
  await guardDuplicate(() =>
    run(
      "UPDATE services SET name=?, description=?, pricing_method=?, price_cents=?, active=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?",
      [i.name.trim(), i.description.trim(), i.pricingMethod, i.priceCents, i.active ? 1 : 0, id],
    ),
  )
}
