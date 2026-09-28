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
const STAFF: Permission[] = ['orders.manage', 'payments.collect', 'customers.manage', 'printer.use', 'store.operate']

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
export const setSessionUser = (u: User | null) => {
  current = u
  approval = null // an approval never carries over to the next employee
}

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

// ---------- admin approval (admin PIN), enforced by the db layer ----------
// Voids, refunds and customer deletes need an admin: an admin signed in, or an admin PIN entered just before
// (components/AdminPin.tsx). Checked here, not only in the UI, so no screen can skip the PIN.

const APPROVAL_MS = 2 * 60_000
/** scope null = any one sensitive action; a scope (e.g. "refund:12") = that action only, until it expires. */
let approval: { until: number; scope: string | null } | null = null

/** Called once an admin PIN is verified. */
export function grantAdminApproval(scope: string | null = null, ms = APPROVAL_MS) {
  approval = { until: Date.now() + ms, scope }
}

/**
 * Throws unless the signed-in employee is an admin or an admin PIN approved this action. A general approval is
 * used up here; a scoped one lasts until it expires (so a refund can be retried after a typo).
 */
export function requireAdminApproval(scope: string): User {
  const u = sessionUser()
  if (u.role === 'admin') return u
  const a = approval
  if (!a || a.until < Date.now() || (a.scope !== null && a.scope !== scope)) throw new Error('An admin PIN is needed to do this.')
  if (a.scope === null) approval = null
  return u
}
