import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { BrandName, LogoTile } from '../components/AuthScreen'
import { Avatar } from '../components/Avatar'
import { I, Icon } from '../components/Icons'
import { useAuth } from '../context/AuthContext'
import { ROLE_LABEL } from '../db/users'
import { useScreen } from '../hooks/useScreen'
import type { NavItem } from '../nav'
import { isOrdersPath, under, useNavAccess } from './navigation'

/**
 * Sidebar / rail sections: the day's work first, in the order staff reach for it, then the back-office
 * pages.
 */
const SIDEBAR_GROUPS: { title: string; paths: string[] }[] = [
  { title: 'Operations', paths: ['/', '/orders', '/customers', '/payments', '/store'] },
  { title: 'Management', paths: ['/reports', '/services', '/users', '/printer', '/settings'] },
]
const NAV_ICON: Record<string, ReactNode> = {
  '/': I.home, '/orders': I.orders, '/customers': I.users, '/payments': I.wallet, '/store': I.store,
  '/printer': I.printer, '/services': I.shirt, '/reports': I.chart, '/users': I.shield, '/settings': I.gear,
}
/** Sidebar-toggle glyph: a panel with its left column marked. */
const PANEL_ICON = <><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><path d="M9.5 4.5v15" /></>
const UPDOWN_ICON = <path d="m8 9.5 4-4 4 4M8 14.5l4 4 4-4" />

/** Keyboard focus ring, shared by every control here; hidden for mouse and touch. */
const FOCUS = 'outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white'

/** Remembered on this device, so a desktop that prefers the rail keeps it across restarts. */
const COLLAPSED_KEY = 'nav.sidebarCollapsed'

function useCollapsed() {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSED_KEY) === '1' } catch { return false }
  })
  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    try { localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0') } catch { /* storage unavailable */ }
  }
  return [collapsed, toggle] as const
}

/**
 * Tablet / desktop navigation (768px and up), beside <main> in layouts/AppShell.tsx: the full sidebar on
 * desktop (collapsible to the rail), a navigation rail on tablets so a portrait tablet keeps its content
 * width. No bottom tab bar here.
 */
export function DesktopTabletSidebar() {
  const { items, can } = useNavAccess()
  const { pathname } = useLocation()
  const screen = useScreen()
  const [collapsed, toggleCollapsed] = useCollapsed()
  const desktop = screen === 'desktop'

  // Sidebar sections; a page counts as active for any page under it (an order's page keeps Orders lit).
  const groups = SIDEBAR_GROUPS.map((g) => ({
    title: g.title,
    items: g.paths.map((to) => items.find((n) => n.to === to)).filter((n): n is NavItem => !!n),
  })).filter((g) => g.items.length)
  const active = (to: string) => (to === '/' ? pathname === '/' : to === '/orders' ? isOrdersPath(pathname) : under(pathname, to))

  return (
    <Sidebar
      rail={!desktop || collapsed}
      onToggle={desktop ? toggleCollapsed : undefined}
      groups={groups}
      active={active}
      onAccount={under(pathname, '/account')}
      newOrder={can('orders.manage') ? pathname === '/orders/new' : null}
    />
  )
}

/**
 * Full sidebar: a 16rem column with labels beside the icons. Rail: 6rem, short labels under the icons.
 * Top to bottom in both: brand, the page sections, then the collapse toggle (desktop only) and the
 * signed-in employee, whose menu holds My Account, Switch user and Log out.
 */
function Sidebar({ rail, onToggle, groups, active, onAccount, newOrder }: {
  rail: boolean
  /** Whether New Order is open; null hides the button (roles that can't take orders). */
  newOrder: boolean | null
  /** Desktop only: collapse to / expand from the rail. */
  onToggle?: () => void
  groups: { title: string; items: NavItem[] }[]
  active: (to: string) => boolean
  onAccount: boolean
}) {
  const { user, logout, switchUser } = useAuth()
  const [menu, setMenu] = useState(false)
  const accountBtn = useRef<HTMLButtonElement>(null)
  const name = user?.full_name ?? ''
  const role = user ? ROLE_LABEL[user.role] : ''

  return (
    <aside
      aria-label="Main"
      className={`relative flex shrink-0 flex-col border-r border-slate-200 bg-white pt-[max(0.75rem,env(safe-area-inset-top))] ${rail ? 'w-24 items-center' : 'w-64'}`}
    >
      {/* Brand */}
      {rail ? (
        <div className="pb-2 pt-1" title="Laundry Management"><LogoTile size="header" /></div>
      ) : (
        <div className="flex items-center gap-3 px-5 pb-4 pt-2">
          <LogoTile size="header" />
          <span className="min-w-0">
            <span className="block truncate text-lg font-bold leading-tight tracking-tight text-slate-900"><BrandName /></span>
            <span className="block truncate text-xs text-slate-500">Laundry Management</span>
          </span>
        </div>
      )}

      {/* The counter's most common task, one tap from every page */}
      {newOrder !== null && (
        <div className={rail ? 'pb-2' : 'w-full px-3 pb-1'}>
          <NavLink
            to="/orders/new"
            title="New Order"
            aria-current={newOrder ? 'page' : undefined}
            className={`${FOCUS} flex items-center justify-center rounded-xl font-semibold text-white shadow-sm shadow-blue-600/30 ${
              newOrder ? 'bg-blue-700' : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-700'
            } ${rail ? 'h-12 w-16 flex-col text-[11px] leading-tight' : 'min-h-12 w-full gap-2 text-[15px]'}`}
          >
            <Icon className="h-5 w-5">{I.plus}</Icon>{rail ? 'New' : 'New Order'}
          </NavLink>
        </div>
      )}

      {/* Pages */}
      <nav className={`min-h-0 w-full flex-1 overflow-y-auto overscroll-contain ${rail ? 'pb-2' : 'px-3 pb-3'}`}>
        {groups.map((g, gi) =>
          rail ? (
            <ul key={g.title} aria-label={g.title} className={`flex w-full flex-col items-center ${gi ? 'mt-2 border-t border-slate-100 pt-2' : 'pt-1'}`}>
              {g.items.map((n) => <RailLink key={n.to} item={n} on={active(n.to)} />)}
            </ul>
          ) : (
            <section key={g.title} aria-labelledby={`nav-${g.title}`} className="pt-4">
              <h2 id={`nav-${g.title}`} className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{g.title}</h2>
              <ul className="space-y-0.5">
                {g.items.map((n) => <SidebarLink key={n.to} item={n} on={active(n.to)} />)}
              </ul>
            </section>
          ),
        )}
      </nav>

      {/* Footer: collapse toggle (desktop) and the signed-in employee */}
      <div className={`w-full border-t border-slate-200 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 ${rail ? 'flex flex-col items-center gap-2' : 'space-y-1 px-3'}`}>
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            aria-label={rail ? 'Expand sidebar' : 'Collapse sidebar'}
            title={rail ? 'Expand sidebar' : 'Collapse sidebar'}
            className={`${FOCUS} flex items-center gap-3 rounded-xl text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 ${
              rail ? 'size-11 justify-center' : 'min-h-10 w-full px-3'
            }`}
          >
            <Icon className={`h-5 w-5 shrink-0 ${rail ? '-scale-x-100' : ''}`}>{PANEL_ICON}</Icon>
            {!rail && 'Collapse'}
          </button>
        )}

        <div className="relative w-full">
          <button
            ref={accountBtn}
            type="button"
            onClick={() => setMenu((m) => !m)}
            aria-label={`Account: ${user?.full_name ?? ''}, ${role}`}
            aria-haspopup="menu"
            aria-expanded={menu}
            className={rail
              ? `${FOCUS} mx-auto grid size-11 place-items-center rounded-full ring-4 transition ${
                onAccount || menu ? 'ring-blue-100' : 'ring-transparent hover:ring-blue-50'}`
              : `${FOCUS} flex min-h-14 w-full items-center gap-3 rounded-xl px-2 text-left transition-colors ${
                onAccount || menu ? 'bg-blue-50' : 'hover:bg-slate-100'}`}
          >
            {rail ? (
              <Avatar name={name} photo={user?.photo} tone={onAccount || menu ? 'bg-blue-700 text-white' : 'bg-blue-600 text-white'} className="size-11 text-sm" />
            ) : (
              <>
                <Avatar name={name} photo={user?.photo} tone="bg-blue-600 text-white" className="size-9 text-xs" />
                <span aria-hidden className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900">{user?.full_name}</span>
                  <span className="block truncate text-xs text-slate-500">{role}</span>
                </span>
                <Icon className="h-4 w-4 shrink-0 text-slate-400">{UPDOWN_ICON}</Icon>
              </>
            )}
          </button>
          {menu && (
            <AccountMenu
              placement={rail ? 'right' : 'above'}
              showUser={rail}
              trigger={accountBtn}
              onClose={() => setMenu(false)}
              onSwitch={switchUser}
              onLogout={logout}
            />
          )}
        </div>
      </div>
    </aside>
  )
}

/** Full sidebar entry: icon and label in a row, a bar and tint marking the current page. */
function SidebarLink({ item, on }: { item: NavItem; on: boolean }) {
  return (
    <li>
      <NavLink
        to={item.to}
        aria-current={on ? 'page' : undefined}
        className={`${FOCUS} relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] transition-colors ${
          on ? 'bg-blue-50 font-semibold text-blue-700' : 'font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-100'
        }`}
      >
        {on && <span aria-hidden className="absolute inset-y-2.5 left-0 w-1 rounded-r-full bg-blue-600" />}
        <Icon className={`h-5 w-5 shrink-0 ${on ? 'text-blue-600' : 'text-slate-400'}`}>{NAV_ICON[item.to] ?? I.menu}</Icon>
        <span className="truncate">{item.label}</span>
      </NavLink>
    </li>
  )
}

/** Rail entry: icon in a pill with a short label under it (Material-style navigation rail). */
function RailLink({ item, on }: { item: NavItem; on: boolean }) {
  return (
    <li>
      <NavLink
        to={item.to}
        title={item.label}
        aria-current={on ? 'page' : undefined}
        className={`${FOCUS} group flex min-h-12 w-20 flex-col items-center justify-center gap-1 rounded-xl py-0.5 text-center`}
      >
        <span className={`grid h-8 w-14 place-items-center rounded-full transition-colors ${
          on ? 'bg-blue-100 text-blue-700' : 'text-slate-500 group-hover:bg-slate-100 group-hover:text-slate-800'}`}
        >
          <Icon className="h-5 w-5">{NAV_ICON[item.to] ?? I.menu}</Icon>
        </span>
        <span className={`w-full truncate px-0.5 text-[11px] leading-tight ${on ? 'font-bold text-blue-700' : 'font-medium text-slate-600'}`}>{item.label}</span>
      </NavLink>
    </li>
  )
}

/**
 * Account menu: My Account, Switch user, Log out (set apart, in red). Opens beside the rail avatar or
 * above the sidebar account card. Keyboard: focus moves to the first item, arrows / Home / End move
 * between items, Escape or Tab closes it and Escape returns focus to the account button.
 */
function AccountMenu({ placement, showUser, trigger, onClose, onSwitch, onLogout }: {
  placement: 'right' | 'above'
  /** The rail has no name on screen, so the menu starts with who is signed in. */
  showUser: boolean
  trigger: RefObject<HTMLButtonElement | null>
  onClose: () => void
  onSwitch: () => void
  onLogout: () => void
}) {
  const { user } = useAuth()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const items = () => [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    items()[0]?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); trigger.current?.focus(); return }
      if (e.key === 'Tab') { onClose(); return }
      const list = items()
      const i = list.indexOf(document.activeElement as HTMLElement)
      const to = e.key === 'ArrowDown' ? (i + 1) % list.length
        : e.key === 'ArrowUp' ? (i - 1 + list.length) % list.length
          : e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : -1
      if (to >= 0) { e.preventDefault(); list[to]?.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, trigger])

  const item = 'flex min-h-11 w-full items-center gap-3 px-4 text-sm outline-none transition-colors'
  const pos = placement === 'right'
    ? 'bottom-0 left-full ml-3 w-60 origin-bottom-left'
    : 'bottom-full left-0 right-0 mb-2 origin-bottom'
  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} aria-hidden />
      <div ref={ref} role="menu" aria-label="Account" className={`absolute z-40 animate-menu-in overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg shadow-slate-900/10 ${pos}`}>
        {showUser && (
          <div className="border-b border-slate-100 px-4 py-3">
            <div className="truncate text-sm font-semibold text-slate-900">{user?.full_name}</div>
            <div className="text-xs text-slate-500">{user && ROLE_LABEL[user.role]}</div>
          </div>
        )}
        <NavLink role="menuitem" to="/account" onClick={onClose} className={`${item} text-slate-700 hover:bg-slate-50 focus-visible:bg-slate-100`}>
          <Icon className="h-5 w-5 text-slate-400">{I.user}</Icon>My Account
        </NavLink>
        <button role="menuitem" type="button" onClick={onSwitch} className={`${item} text-slate-700 hover:bg-slate-50 focus-visible:bg-slate-100`}>
          <Icon className="h-5 w-5 text-slate-400">{I.users}</Icon>Switch user
        </button>
        <div role="separator" className="my-1 border-t border-slate-100" />
        <button role="menuitem" type="button" onClick={onLogout} className={`${item} font-medium text-red-600 hover:bg-red-50 focus-visible:bg-red-50`}>
          <Icon className="h-5 w-5">{I.logout}</Icon>Log out
        </button>
      </div>
    </>
  )
}
