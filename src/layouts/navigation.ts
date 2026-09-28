import { useEffect, type RefObject } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { NAV, type NavItem } from '../nav'

/**
 * Navigation rules shared by the phone and tablet / desktop navigation (layouts/MobileNavigation.tsx,
 * layouts/DesktopTabletNavigation.tsx) and the app frame (layouts/AppShell.tsx):
 * which pages a role may see in its menus, and how the shared <main> scroll container behaves.
 */

/** Any page under `to` (a customer's page keeps Customers lit). */
export const under = (path: string, to: string) => path === to || path.startsWith(`${to}/`)

/** An order's page (not New Order) keeps Orders lit. */
export const isOrdersPath = (p: string) => p === '/orders' || /^\/orders\/\d+/.test(p)

/** Menu entries this role may see: `menu` (when stricter) or `perm` from nav.ts. */
export function useNavAccess() {
  const { can } = useAuth()
  const listed = (n: NavItem) => { const p = n.menu ?? n.perm; return !p || can(p) }
  const items = NAV.filter(listed)
  /** Routes not in NAV (e.g. /account) are open to everyone signed in. */
  const allowed = (to: string) => { const n = NAV.find((x) => x.to === to); return !n || listed(n) }
  return { items, allowed, can }
}

/**
 * <main> is the scroll container shared by every page; start each new page at the top, or at the
 * section a menu shortcut points to (navigation state `{ anchor }`).
 */
export function useMainScroll(mainRef: RefObject<HTMLElement | null>) {
  const { pathname, state } = useLocation()
  const anchor = (state as { anchor?: string } | null)?.anchor
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0)
    if (anchor) requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth' }))
  }, [pathname, anchor, mainRef])
}

/** Store Shift and an order's page use the light blue page background. */
export const blueBackground = (pathname: string) => under(pathname, '/store') || /^\/orders\/\d+$/.test(pathname)
