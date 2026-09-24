import type { Customer, CustomerOrder, CustomerStats } from '../types'
import { query, queryOne, run, transaction } from './client'

export interface CustomerInput {
  fullName: string
  contact: string
  address: string
  notes: string
}

function clean(i: CustomerInput): CustomerInput {
  const c = { fullName: i.fullName.trim(), contact: i.contact.trim(), address: i.address.trim(), notes: i.notes.trim() }
  if (!c.fullName) throw new Error('Customer name is required.')
  if (c.contact && !/^[0-9+()\-\s]{5,20}$/.test(c.contact)) throw new Error('Contact number looks invalid.')
  return c
}

export function searchCustomers(text = '', limit = 200) {
  const like = `%${text.trim()}%`
  return query<Customer>(
    `SELECT * FROM customers
     WHERE full_name LIKE ? OR contact LIKE ? OR customer_code LIKE ?
     ORDER BY full_name COLLATE NOCASE LIMIT ?`,
    [like, like, like, limit],
  )
}

export const getCustomer = (id: number) => queryOne<Customer>('SELECT * FROM customers WHERE id = ?', [id])

export async function createCustomer(input: CustomerInput): Promise<number> {
  const c = clean(input)
  return transaction(async (tx) => {
    // Temporary unique code, replaced by the id-based code once the id is known.
    const tmp = `TMP-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const { lastId } = await tx.run('INSERT INTO customers (customer_code, full_name, contact, address, notes) VALUES (?,?,?,?,?)', [
      tmp, c.fullName, c.contact, c.address, c.notes,
    ])
    await tx.run('UPDATE customers SET customer_code = ? WHERE id = ?', [`C-${String(lastId).padStart(5, '0')}`, lastId])
    return lastId
  })
}

export async function updateCustomer(id: number, input: CustomerInput) {
  const c = clean(input)
  await run(
    "UPDATE customers SET full_name=?, contact=?, address=?, notes=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?",
    [c.fullName, c.contact, c.address, c.notes, id],
  )
}

/** Customers with any order (even cancelled) are kept for record integrity. */
export async function deleteCustomer(id: number) {
  const r = await queryOne<{ n: number }>('SELECT COUNT(*) AS n FROM orders WHERE customer_id = ?', [id])
  if (r?.n) throw new Error('This customer has orders and cannot be deleted.')
  await run('DELETE FROM customers WHERE id = ?', [id])
}

export async function getCustomerStats(id: number): Promise<CustomerStats> {
  const r = await queryOne<CustomerStats>(
    `SELECT COUNT(*) AS total_orders,
            COALESCE(SUM(total_cents), 0) AS total_spent_cents,
            COALESCE(SUM(total_cents - paid_cents), 0) AS outstanding_cents
     FROM orders WHERE customer_id = ? AND status <> 'cancelled'`,
    [id],
  )
  return r ?? { total_orders: 0, total_spent_cents: 0, outstanding_cents: 0 }
}

export const getCustomerOrders = (id: number) =>
  query<CustomerOrder>(
    `SELECT id, order_number, received_at, status, payment_status, total_cents, paid_cents
     FROM orders WHERE customer_id = ? ORDER BY received_at DESC`,
    [id],
  )
