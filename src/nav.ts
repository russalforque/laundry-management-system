import type { Role } from './types'

export interface NavItem {
  to: string
  label: string
  icon: string
  roles?: Role[] // omitted = everyone; admin always allowed
}

export const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: '🏠' },
  { to: '/orders', label: 'Orders', icon: '🧺' },
  { to: '/customers', label: 'Customers', icon: '👥' },
  { to: '/services', label: 'Services', icon: '🏷️', roles: ['manager'] },
  { to: '/reports', label: 'Reports', icon: '📊', roles: ['manager'] },
  { to: '/users', label: 'Users', icon: '🔑', roles: [] },
  { to: '/settings', label: 'Settings', icon: '⚙️', roles: [] },
]
