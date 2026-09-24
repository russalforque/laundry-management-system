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
}

export interface CustomerOrder {
  id: number
  order_number: string
  received_at: string
  status: string
  payment_status: string
  total_cents: number
  paid_cents: number
}

export interface User {
  id: number
  username: string
  full_name: string
  role: Role
  active: number
  created_at: string
}

export type PricingMethod = 'per_kg' | 'per_piece' | 'fixed'

export interface Service {
  id: number
  name: string
  description: string
  pricing_method: PricingMethod
  price_cents: number
  active: number
}

export type PaymentStatus = 'unpaid' | 'partial' | 'paid'
export type PaymentMethod = 'cash' | 'gcash' | 'other'
export type OrderStatus = 'received' | 'washing' | 'drying' | 'folding' | 'ready' | 'released' | 'cancelled'

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
  payment_status: PaymentStatus
  status: OrderStatus
  notes: string
}

export interface OrderItemRow {
  id: number
  service_name: string
  pricing_method: PricingMethod
  unit_price_cents: number
  quantity: number
  amount_cents: number
}

export interface PaymentRow {
  id: number
  amount_cents: number
  method: PaymentMethod
  paid_at: string
  reference: string
  user_name: string
}
