import type { Role, User } from '../types'

/**
 * What a signed-in employee may do. Pages, navigation and the db layer all check these, never a role
 * name, so a new role is only a new entry in ROLE_PERMISSIONS.
 */
export type Permission =
  | 'orders.manage' // New Order / POS, order status, receipts
  | 'payments.collect' // collect balances (Pay Later / partial)
  | 'payments.viewAll' // every employee's payment history (otherwise own only)
  | 'customers.manage'
  | 'machines.operate' // put orders in / take them out of machines
  | 'machines.configure' // add, edit, delete machines
  | 'printer.use' // connect/pair the receipt printer, test print
  | 'cashDrawer.open' // open the drawer by hand without an admin PIN
  | 'dashboard.financials' // sales and collections on the dashboard
  | 'reports.view'
  | 'services.manage' // services, packages, add-ons and prices
  | 'users.manage' // employees, roles and PINs
  | 'settings.manage' // business info, branding, receipt layout, system settings
  | 'backup.manage'
  | 'store.operate' // open / close the shared store shift and count the drawer
  | 'store.history' // past store shifts and their cash counts (admin)

/** Daily laundry operations only. */
const STAFF: Permission[] = ['orders.manage', 'payments.collect', 'customers.manage', 'machines.operate', 'printer.use', 'store.operate']

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[] | 'all'> = {
  admin: 'all',
  manager: [...STAFF, 'payments.viewAll', 'cashDrawer.open', 'dashboard.financials', 'reports.view', 'services.manage'],
  // Stored as 'cashier' (the users.role CHECK constraint predates this); shown everywhere as Staff.
  cashier: STAFF,
}

/** The Staff role: every regular employee account. */
export const STAFF_ROLE: Role = 'cashier'

export function hasPermission(role: Role | undefined, p: Permission) {
  const granted = role && ROLE_PERMISSIONS[role]
  return granted === 'all' || !!granted?.includes(p)
}

// ---------- session (enforced by the db layer) ----------

let current: User | null = null

/** Set by AuthContext at sign-in and sign-out. The db layer reads it, so the UI can't pass another employee's id. */
export const setSessionUser = (u: User | null) => { current = u }

export const sessionCan = (p: Permission) => hasPermission(current?.role, p)

/** The signed-in employee; throws when no one is signed in. */
export function sessionUser(): User {
  if (!current) throw new Error('Sign in to continue.')
  return current
}

/** Throws unless the signed-in employee has at least one of `ps`. Returns that employee. */
export function requirePermission(...ps: Permission[]): User {
  const u = sessionUser()
  if (!ps.some((p) => hasPermission(u.role, p))) throw new Error('You do not have permission to do this.')
  return u
}
