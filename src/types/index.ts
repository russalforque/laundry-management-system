export type Role = 'admin' | 'manager' | 'cashier'

export interface Customer {
  id: number
  customer_code: string
  full_name: string
  contact: string
  address: string
  notes: string
  created_at: string
}

export interface CustomerStats {
  total_orders: number
  total_spent_cents: number
  outstanding_cents: number
  last_order_at: string | null
}

export interface User {
  id: number
  username: string
  full_name: string
  role: Role
  active: number
  created_at: string
}

/** Calculation class: per_kg = decimal weight, per_piece = whole units, fixed = always 1. */
export type PricingMethod = 'per_kg' | 'per_piece' | 'fixed'
/** What staff pick and see; each maps to one PricingMethod (lib/pricing.ts). */
export type PricingType = 'per_load' | 'per_kg' | 'per_item' | 'per_quantity' | 'fixed'

export interface Service {
  id: number
  name: string
  description: string
  pricing_method: PricingMethod
  pricing_type: PricingType
  price_cents: number
  active: number
  image: string | null
  /** 1 = add-on (detergent, fabric conditioner…) listed separately on New Order. */
  is_addon: number
  /** 1 = package bundling services and add-ons (e.g. Wash + Dry + Fold). */
  is_package: number
  /** Max kg per load for this service; null = the load_max_kg setting. */
  max_kg: number | null
}

/** Service or add-on bundled into a package/service, `quantity` per load (or per unit). */
export interface Inclusion {
  service_id: number
  included_id: number
  quantity: number
}

export type PaymentStatus = 'unpaid' | 'partial' | 'paid'
export type PaymentMethod = 'cash' | 'gcash' | 'other'
/** Workflow status only — payment (PaymentStatus) and machines (MachineStatus) are tracked separately. 'released' = Completed. */
export type OrderStatus = 'received' | 'washing' | 'drying' | 'ready' | 'released' | 'cancelled'

export interface OrderRow {
  id: number
  order_number: string
  customer_id: number
  customer_name: string
  received_at: string
  expected_pickup: string | null
  subtotal_cents: number
  discount_cents: number
  total_cents: number
  paid_cents: number
  balance_cents: number
  /** Money given back on a cancelled order (never more than paid_cents). */
  refunded_cents: number
  payment_status: PaymentStatus
  status: OrderStatus
  notes: string
  /** Past walk-in orders only: name/phone given at the counter ('' otherwise; new orders never set them). */
  guest_name: string
  guest_contact: string
}

export type MachineType = 'washer' | 'dryer'
/** Available → In Use (timer running) → Done (timer over, laundry still inside) → Available after Mark as Unloaded. out_of_service = Inactive. */
export type MachineStatus = 'available' | 'in_use' | 'done' | 'out_of_service'

export interface Machine {
  id: number
  code: string
  type: MachineType
  notes: string
  out_of_service: number
  /** Preset cycle length used every time this machine is started. */
  cycle_minutes: number
  /** Open assignment, if any (joined in by listMachines). */
  order_id: number | null
  order_number: string | null
  customer_name: string | null
  started_at: string | null
  duration_minutes: number | null
  expected_end_at: string | null
}

export interface MachineAssignment {
  id: number
  machine_id: number | null
  machine_code: string
  machine_type: MachineType
  order_id: number
  started_at: string
  ended_at: string | null
  end_reason: 'finished' | 'changed' | 'status' | null
  /** Timer snapshot taken at start; null on assignments made before machine timers. */
  duration_minutes: number | null
  expected_end_at: string | null
  user_name: string | null
}

export interface OrderItemRow {
  id: number
  service_id: number
  service_name: string
  pricing_method: PricingMethod
  /** null on orders made before pricing types existed. */
  pricing_type: PricingType | null
  unit_price_cents: number
  quantity: number
  /** Weight entered for per-load lines. */
  weight_kg: number | null
  /** Part of `quantity` included free by a package/service in the same order. */
  included_qty: number
  /** e.g. "Includes Wash, Dry, Fold, 1 Detergent/load". */
  note: string
  amount_cents: number
}

export interface PaymentRow {
  id: number
  order_id: number
  amount_cents: number
  method: PaymentMethod
  paid_at: string
  reference: string
  /** Cash handed over (cash payments only); change given = tendered_cents - amount_cents. */
  tendered_cents: number | null
  user_name: string
}

export interface RefundRow {
  id: number
  order_id: number
  amount_cents: number
  method: PaymentMethod
  reason: string
  refunded_at: string
  user_name: string
}
