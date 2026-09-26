import type { Inclusion, OrderItemRow, PricingMethod, PricingType, Service } from '../types'
import { formatPeso } from './money'

export const TYPE_LABEL: Record<PricingType, string> = {
  per_load: 'Per Load',
  per_kg: 'Per Kg',
  per_item: 'Per Item',
  per_quantity: 'Per Quantity',
  fixed: 'Fixed Price',
}
export const TYPE_UNIT: Record<PricingType, string> = { per_load: '/load', per_kg: '/kg', per_item: '/item', per_quantity: '/pc', fixed: '' }
/** Calculation class stored in pricing_method (per_piece = whole units). */
export const METHOD_OF: Record<PricingType, PricingMethod> = {
  per_load: 'per_piece', per_kg: 'per_kg', per_item: 'per_piece', per_quantity: 'per_piece', fixed: 'fixed',
}
const PER_WORD: Record<PricingType, string> = { per_load: ' per load', per_kg: ' per load', per_item: ' per item', per_quantity: ' each', fixed: '' }

/** Order lines saved before pricing types existed have none; derive it from the calculation class. */
export const typeOf = (x: { pricing_type?: PricingType | null; pricing_method: PricingMethod }): PricingType =>
  x.pricing_type ?? (x.pricing_method === 'per_piece' ? 'per_item' : x.pricing_method)

export const kindOf = (s: Pick<Service, 'is_addon' | 'is_package'>) => (s.is_package ? 'package' : s.is_addon ? 'addon' : 'service')

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** "2 loads", "3.5 kg", "1 item", "3 pcs"; fixed-price lines read "Flat rate". */
export function qtyText(type: PricingType, q: number): string {
  switch (type) {
    case 'per_load': return plural(q, 'load', 'loads')
    case 'per_kg': return `${q} kg`
    case 'per_item': return plural(q, 'item', 'items')
    case 'per_quantity': return plural(q, 'pc', 'pcs')
    default: return 'Flat rate'
  }
}

/** The load_max_kg setting as a number; blank or invalid = no weight rule. */
export const parseMaxKg = (s: string | undefined | null): number | null => {
  const n = Number(s)
  return s?.trim() && Number.isFinite(n) && n > 0 ? n : null
}

export const maxKgOf = (s: Pick<Service, 'max_kg'>, defaultMaxKg: number | null) => s.max_kg ?? defaultMaxKg

/** Loads needed for a weight, e.g. max 8 kg: 1–8 kg = 1 load, 8.1–16 kg = 2. Compared in centi-kg to avoid float drift. */
export function loadsFor(weightKg: number, maxKg: number | null): number {
  if (!(weightKg > 0) || !maxKg || !(maxKg > 0)) return 1
  return Math.max(1, Math.ceil(Math.round(weightKg * 100) / Math.round(maxKg * 100)))
}

export interface CartItem {
  serviceId: number
  /** Already validated for the service's pricing method (loads, kg, pieces; 1 for fixed). */
  quantity: number
  /** Weight entered for a per-load line (informational; staff may adjust the loads). */
  weightKg?: number | null
}

export interface PricedLine {
  service: Service
  /** Total quantity; an included add-on is never less than what its package includes. */
  quantity: number
  weightKg: number | null
  /** Part of quantity covered by a package/service in this cart (charged ₱0). */
  includedQty: number
  chargedQty: number
  amountCents: number
  /** "Includes Wash, Dry, Fold, 1× Detergent per load". */
  note: string
  /** Line exists only because something in the cart includes this add-on. */
  auto: boolean
}

/** Whether `parent` may bundle `child`: packages take services and add-ons, services take add-ons, add-ons take nothing. */
export function canInclude(parent: Pick<Service, 'is_addon' | 'is_package'>, child: Pick<Service, 'is_addon' | 'is_package'>) {
  if (parent.is_addon || child.is_package) return false
  return parent.is_package ? true : !!child.is_addon
}

/** Units a line's inclusions multiply by: loads for weight/load pricing, pieces for per-item, 1 for fixed. */
function coverUnits(type: PricingType, qty: number, maxKg: number | null) {
  if (type === 'fixed') return 1
  if (type === 'per_kg') return loadsFor(qty, maxKg)
  return qty
}

/** Readable "includes" text for a package/service, or '' when it bundles nothing (active items only). */
export function includesText(parent: Service, byId: Map<number, Service>, inclusions: Inclusion[]): string {
  const kids = inclusions
    .filter((i) => i.service_id === parent.id)
    .map((i) => ({ i, child: byId.get(i.included_id) }))
    .filter((x): x is { i: Inclusion; child: Service } => !!x.child && canInclude(parent, x.child))
  const svc = kids.filter((k) => !k.child.is_addon).map((k) => k.child.name)
  const add = kids.filter((k) => k.child.is_addon).map((k) => `${k.i.quantity}× ${k.child.name}`)
  const parts = [svc.join(', '), add.length ? `${add.join(', ')}${PER_WORD[parent.pricing_type]}` : ''].filter(Boolean)
  return parts.length ? `Includes ${parts.join(' + ')}` : ''
}

/**
 * Prices a cart. The one pricing routine for both the POS screen and createOrder, so the preview always
 * matches what is saved. Packages cover their services and add-ons first, then services cover their add-ons
 * (only for units they actually charge, so nothing is included twice). Covered quantity is never charged;
 * an add-on included by something in the cart appears automatically.
 */
export function priceCart(services: Service[], inclusions: Inclusion[], items: CartItem[], defaultMaxKg: number | null): PricedLine[] {
  const byId = new Map(services.map((s) => [s.id, s]))
  const cover = new Map<number, number>()
  const addCover = (parent: Service, units: number) => {
    if (units <= 0) return
    for (const inc of inclusions) {
      if (inc.service_id !== parent.id) continue
      const child = byId.get(inc.included_id)
      if (child && canInclude(parent, child)) cover.set(child.id, (cover.get(child.id) ?? 0) + units * inc.quantity)
    }
  }

  const entered = items.flatMap((it) => {
    const service = byId.get(it.serviceId)
    return service ? [{ service, quantity: it.quantity, weightKg: service.pricing_type === 'per_load' ? it.weightKg ?? null : null, auto: false }] : []
  })
  const maxKg = (s: Service) => maxKgOf(s, defaultMaxKg)

  // 1. Packages cover services and add-ons.
  for (const l of entered) if (l.service.is_package) addCover(l.service, coverUnits(l.service.pricing_type, l.quantity, maxKg(l.service)))

  // 2. Services cover add-ons, but only for the part they charge (a Wash already inside a package adds nothing).
  for (const l of entered) {
    const s = l.service
    if (s.is_package || s.is_addon) continue
    const cov = cover.get(s.id) ?? 0
    const t = s.pricing_type
    const charged = t === 'per_kg' || t === 'fixed' ? (cov > 0 ? 0 : coverUnits(t, l.quantity, maxKg(s))) : Math.max(l.quantity - cov, 0)
    addCover(s, charged)
  }

  // 3. Included add-ons nobody picked yet appear on their own; picked ones never drop below the included amount.
  const all = [...entered]
  for (const id of cover.keys()) {
    const s = byId.get(id)!
    if (s.is_addon && !entered.some((l) => l.service.id === id)) all.push({ service: s, quantity: 0, weightKg: null, auto: true })
  }

  return all.map((l) => {
    const s = l.service
    const cov = cover.get(s.id) ?? 0
    const t = s.pricing_type
    let quantity = l.quantity
    let included = 0
    if (t === 'per_kg' || t === 'fixed') {
      if (t === 'fixed') quantity = 1
      else if (!quantity && cov > 0) quantity = 1
      included = cov > 0 ? quantity : 0
    } else {
      if (s.is_addon) quantity = Math.max(quantity, Math.ceil(cov))
      included = Math.min(quantity, cov)
    }
    const charged = Math.round((quantity - included) * 100) / 100
    return {
      service: s,
      quantity,
      weightKg: l.weightKg,
      includedQty: included,
      chargedQty: charged,
      amountCents: Math.round(s.price_cents * (t === 'fixed' ? (included ? 0 : 1) : charged)),
      note: includesText(s, byId, inclusions),
      auto: l.auto,
    }
  })
}

/**
 * Quantity line for a saved order item: "2 loads (14.5 kg) × ₱175/load · 2 included".
 * `times` is 'x' on thermal receipts, which only print plain characters.
 */
export function itemQtyLine(i: OrderItemRow, times = '×'): string {
  const t = typeOf(i)
  const w = i.weight_kg ? ` (${i.weight_kg} kg)` : ''
  const base = t === 'fixed' ? 'Fixed price' : `${qtyText(t, i.quantity)}${w} ${times} ${formatPeso(i.unit_price_cents)}${TYPE_UNIT[t]}`
  if (!(i.included_qty > 0)) return base
  return `${base} · ${i.included_qty >= i.quantity ? 'included' : `${i.included_qty} included`}`
}
