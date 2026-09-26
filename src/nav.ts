import type { Permission } from './lib/permissions'

export interface NavItem {
  to: string
  label: string
  icon: string
  /** Needed to open the route; omitted = every signed-in employee. */
  perm?: Permission
  /** Needed to list it in the menus, when stricter than `perm` (the route is open to more roles than the menu lists it for). */
  menu?: Permission
}

export const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: '🏠' },
  { to: '/orders', label: 'Orders', icon: '🧺', perm: 'orders.manage' },
  { to: '/customers', label: 'Customers', icon: '👥', perm: 'customers.manage' },
  { to: '/machines', label: 'Machines', icon: '🌀', perm: 'machines.operate' },
  { to: '/services', label: 'Services', icon: '🏷️', perm: 'services.manage' },
  { to: '/reports', label: 'Reports', icon: '📊', perm: 'reports.view' },
  { to: '/payments', label: 'Payment History', icon: '💵', perm: 'payments.collect' },
  { to: '/store', label: 'Store Shift', icon: '🏪', perm: 'store.operate' },
  { to: '/printer', label: 'Printer', icon: '🖨️', perm: 'printer.use' },
  { to: '/users', label: 'Users', icon: '🔑', perm: 'users.manage' },
  { to: '/settings', label: 'Settings', icon: '⚙️', perm: 'settings.manage' },
]
