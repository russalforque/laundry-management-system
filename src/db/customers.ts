import { requirePermission } from '../lib/permissions'
import type { Customer, CustomerStats } from '../types'
import { query, queryOne, run, transaction } from './client'

export interface CustomerInput {
  fullName: string
  contact: string
  address: string
  notes: string
}

export const isValidContact = (contact: string) => /^[0-9+()\-\s]{5,20}$/.test(contact)

function clean(i: CustomerInput): CustomerInput {
  const c = { fullName: i.fullName.trim(), contact: i.contact.trim(), address: i.address.trim(), notes: i.notes.trim() }
  if (!c.fullName) throw new Error('Customer name is required.')
  if (c.contact && !isValidContact(c.contact)) throw new Error('Contact number looks invalid.')
  return c
}

/** Contact with spaces, dashes, brackets and + removed, so "0917-123 4567" matches a typed "09171234567". */
const CONTACT_DIGITS = "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(contact, ' ', ''), '-', ''), '(', ''), ')', ''), '+', '')"

/** Search by name, phone number (any formatting; 0917… also finds +63 917…) or customer code. */
export function searchCustomers(text = '', limit = 200) {
  const like = `%${text.trim()}%`
  // Drop the local "0" / country "63" prefix so either way of writing a PH mobile number matches.
  const digits = text.replace(/\D/g, '').replace(/^(63|0)/, '')
  return query<Customer>(
    `SELECT * FROM customers
     WHERE full_name LIKE ? OR contact LIKE ? OR customer_code LIKE ? ${digits.length >= 3 ? `OR ${CONTACT_DIGITS} LIKE ?` : ''}
     ORDER BY full_name COLLATE NOCASE LIMIT ?`,
    [like, like, like, ...(digits.length >= 3 ? [`%${digits}%`] : []), limit],
  )
}

export const getCustomer = (id: number) => queryOne<Customer>('SELECT * FROM customers WHERE id = ?', [id])

/**
 * Code of the legacy shared record that past walk-in orders are filed under. Walk-in is no longer offered:
 * the record is kept (read-only) for those orders' history, and new orders can't be placed on it.
 */
export const WALK_IN_CODE = 'WALK-IN'

/** An order's customer as shown: the name/phone saved on a past walk-in order, else the customer record's. Needs aliases o and c. */
export const ORDER_CUSTOMER_NAME = "COALESCE(NULLIF(o.guest_name, ''), c.full_name)"
export const ORDER_CUSTOMER_CONTACT = "COALESCE(NULLIF(o.guest_contact, ''), c.contact)"

export async function createCustomer(input: CustomerInput): Promise<number> {
  requirePermission('customers.manage')
  const c = clean(input)
  return transaction(async (tx) => {
    // Temporary unique code, replaced by the id-based code once the id is known.
    const tmp = `TMP-${Date.now()}-${Math.random().toString(36).slice(2)}`
    await tx.run('INSERT INTO customers (customer_code, full_name, contact, address, notes) VALUES (?,?,?,?,?)', [
      tmp, c.fullName, c.contact, c.address, c.notes,
    ])
    // Look the row up by its unique temporary code: the plugin's lastId is not reliable on every platform.
    const [row] = await tx.query<{ id: number }>('SELECT id FROM customers WHERE customer_code = ?', [tmp])
    if (!row) throw new Error('Could not save the customer.')
    await tx.run('UPDATE customers SET customer_code = ? WHERE id = ?', [`C-${String(row.id).padStart(5, '0')}`, row.id])
    return row.id
  })
}

export async function updateCustomer(id: number, input: CustomerInput) {
  requirePermission('customers.manage')
  const c = clean(input)
  await run(
    "UPDATE customers SET full_name=?, contact=?, address=?, notes=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?",
    [c.fullName, c.contact, c.address, c.notes, id],
  )
}

/** Customers with any order (even cancelled) are kept for record integrity. */
export async function deleteCustomer(id: number) {
  requirePermission('customers.manage')
  const r = await queryOne<{ n: number }>('SELECT COUNT(*) AS n FROM orders WHERE customer_id = ?', [id])
  if (r?.n) throw new Error('This customer has orders and cannot be deleted.')
  await run('DELETE FROM customers WHERE id = ?', [id])
}

export async function getCustomerStats(id: number): Promise<CustomerStats> {
  const r = await queryOne<CustomerStats>(
    `SELECT COUNT(*) AS total_orders,
            COALESCE(SUM(total_cents), 0) AS total_spent_cents,
            COALESCE(SUM(total_cents - paid_cents), 0) AS outstanding_cents,
            MAX(received_at) AS last_order_at
     FROM orders WHERE customer_id = ? AND status <> 'cancelled'`,
    [id],
  )
  return r ?? { total_orders: 0, total_spent_cents: 0, outstanding_cents: 0, last_order_at: null }
}

/** A customer is active if they ordered, or were added, within this many days. */
export const ACTIVE_DAYS = 90
const activeCutoff = () => new Date(Date.now() - ACTIVE_DAYS * 86_400_000).toISOString()
/** Timestamps are UTC ISO strings, so they compare correctly as text. */
export const isActiveCustomer = (lastActivity: string) => lastActivity >= activeCutoff()

export interface CustomerListRow extends Customer, Omit<CustomerStats, 'last_order_at'> {
  /** Latest non-cancelled order, or the sign-up date if none. */
  last_activity: string
}
export type CustomerActivity = '' | 'active' | 'inactive'
export type CustomerSort = 'name' | 'recent' | 'spent'

const SORT_SQL: Record<CustomerSort, string> = {
  name: 'c.full_name COLLATE NOCASE',
  recent: 'last_activity DESC',
  spent: 'total_spent_cents DESC, c.full_name COLLATE NOCASE',
}

/** Customers with their order totals, for the customer list. */
export function listCustomers(text = '', activity: CustomerActivity = '', sort: CustomerSort = 'name', limit = 300) {
  const like = `%${text.trim()}%`
  const having = activity ? `HAVING last_activity ${activity === 'active' ? '>=' : '<'} ?` : ''
  return query<CustomerListRow>(
    `SELECT c.*,
            COUNT(o.id) AS total_orders,
            COALESCE(SUM(o.total_cents), 0) AS total_spent_cents,
            COALESCE(SUM(o.total_cents - o.paid_cents), 0) AS outstanding_cents,
            COALESCE(MAX(o.received_at), c.created_at) AS last_activity
     FROM customers c LEFT JOIN orders o ON o.customer_id = c.id AND o.status <> 'cancelled'
     WHERE c.full_name LIKE ? OR c.contact LIKE ? OR c.customer_code LIKE ?
     GROUP BY c.id ${having}
     ORDER BY ${SORT_SQL[sort]} LIMIT ?`,
    [like, like, like, ...(activity ? [activeCutoff()] : []), limit],
  )
}
