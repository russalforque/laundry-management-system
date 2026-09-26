import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ROLE_LABEL } from '../db/users'
import type { Permission } from '../lib/permissions'
import { NAV, type NavItem } from '../nav'
import { AppHeader } from './AppHeader'
import { BrandName, LogoTile } from './AuthScreen'
import { I, Icon } from './Icons'
import { Sheet } from './Sheet'

const OWN_HEADER = ['/store', '/', '/account', '/orders', '/orders/new', '/customers', '/machines', '/reports', '/users', '/services', '/settings', '/payments', '/printer']
const hasOwnHeader = (path: string) => OWN_HEADER.includes(path) || /^\/(customers|orders)\/\d+$/.test(path)

/**
 * Phone tab bar: Home | Orders | New order | Machines | More. Everything else lives in the More sheet.
 * `match` decides which pages light a tab up (e.g. an order's page keeps Orders active, New Order does not).
 */
const TABS: { to: string; label: string; icon: ReactNode; match: (path: string) => boolean }[] = [
  { to: '/', label: 'Home', icon: I.home, match: (p) => p === '/' },
  { to: '/orders', label: 'Orders', icon: I.orders, match: (p) => p === '/orders' || /^\/orders\/\d+/.test(p) },
  { to: '/machines', label: 'Machines', icon: I.washer, match: (p) => p.startsWith('/machines') },
]
/** Access comes from NAV (`to` of the guarded route) or `perm`, so the sheet never shows a page the user can't open. */
const MORE: { to: string; label: string; icon: ReactNode; group: 'Daily work' | 'Business' | 'Account'; anchor?: string; perm?: Permission }[] = [
  { to: '/customers', label: 'Customers', icon: I.users, group: 'Daily work' },
  { to: '/store', label: 'Store shift', icon: I.store, group: 'Daily work' },
  { to: '/payments', label: 'Payments', icon: I.wallet, group: 'Daily work' },
  { to: '/printer', label: 'Printer', icon: I.printer, group: 'Daily work' },
  { to: '/services', label: 'Services', icon: I.shirt, group: 'Business' },
  { to: '/reports', label: 'Reports', icon: I.chart, group: 'Business' },
  { to: '/users', label: 'Users', icon: I.shield, group: 'Business' },
  { to: '/settings', label: 'Settings', icon: I.gear, group: 'Business' },
  { to: '/settings', label: 'Backup', icon: I.cloud, group: 'Business', anchor: 'backup', perm: 'backup.manage' },
  { to: '/account', label: 'My profile', icon: I.user, group: 'Account' },
]
const GROUPS = ['Daily work', 'Business', 'Account'] as const

/** Sidebar (tablet/desktop): the same grouping as the phone's More sheet, with real icons. */
const SIDEBAR_GROUPS: { title: string; paths: string[] }[] = [
  { title: 'Daily work', paths: ['/', '/orders', '/customers', '/machines', '/store', '/payments', '/printer'] },
  { title: 'Business', paths: ['/services', '/reports', '/users', '/settings'] },
]
const NAV_ICON: Record<string, ReactNode> = {
  '/': I.home, '/orders': I.orders, '/customers': I.users, '/machines': I.washer, '/payments': I.wallet, '/store': I.store,
  '/printer': I.printer, '/services': I.shirt, '/reports': I.chart, '/users': I.shield, '/settings': I.gear,
}

/** Any page under `to` (a customer's page keeps Customers, and so More, lit). */
const under = (path: string, to: string) => path === to || path.startsWith(`${to}/`)

/** Material-style tab: the active one gets a tinted pill behind its icon and a bold label. */
function TabInner({ icon, label, active }: { icon: ReactNode; label: string; active: boolean }) {
  return (
    <>
      <span className={`grid h-8 w-14 place-items-center rounded-full transition-colors duration-200 ${active ? 'bg-blue-100 text-blue-700' : 'text-slate-500'}`}>
        <Icon className={`h-6 w-6 ${active ? 'fill-blue-200/60' : ''}`}>{icon}</Icon>
      </span>
      <span className={`text-[11px] leading-none ${active ? 'font-bold text-blue-700' : 'font-medium text-slate-500'}`}>{label}</span>
    </>
  )
}

const tabCls = 'flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl transition active:scale-95'

/**
 * True while an on-screen keyboard is likely up (a text field has focus), so the tab bar can step
 * aside and give the form its room; save bars pinned at the bottom then sit right above the keyboard.
 */
function useTyping() {
  const [typing, setTyping] = useState(false)
  useEffect(() => {
    const isText = (el: EventTarget | null) =>
      el instanceof HTMLTextAreaElement ||
      (el instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit', 'range', 'color', 'file', 'date', 'time', 'month', 'datetime-local'].includes(el.type))
    const onIn = (e: FocusEvent) => setTyping(isText(e.target))
    const onOut = () => setTyping(false)
    document.addEventListener('focusin', onIn)
    document.addEventListener('focusout', onOut)
    return () => { document.removeEventListener('focusin', onIn); document.removeEventListener('focusout', onOut) }
  }, [])
  return typing
}

function Tab({ t, active }: { t: (typeof TABS)[number]; active: boolean }) {
  return (
    <NavLink to={t.to} end={t.to === '/'} aria-current={active ? 'page' : undefined} className={tabCls}>
      <TabInner icon={t.icon} label={t.label} active={active} />
    </NavLink>
  )
}

export default function Layout() {
  const { user, logout, switchUser, can } = useAuth()
  const { pathname, state } = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  // <main> is the scroll container shared by every page; start each new page at the top,
  // or at the section a More-sheet shortcut points to.
  const anchor = (state as { anchor?: string } | null)?.anchor
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0)
    if (anchor) requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth' }))
  }, [pathname, anchor])
  const listed = (n: NavItem) => { const p = n.menu ?? n.perm; return !p || can(p) }
  const items = NAV.filter(listed)
  const allowed = (to: string) => { const n = NAV.find((x) => x.to === to); return !n || listed(n) }
  const more = MORE.filter((m) => allowed(m.to) && (!m.perm || can(m.perm)))
  // Tabs follow permissions too, so a role never sees a tab that bounces it back home.
  const tabs = TABS.filter((t) => allowed(t.to))
  const canNewOrder = can('orders.manage')
  const moreActive = moreOpen || (!tabs.some((t) => t.match(pathname)) && pathname !== '/orders/new' && more.some((m) => under(pathname, m.to)))
  const typing = useTyping()
  // Put New order in the middle whatever tabs this role has.
  const half = Math.ceil(tabs.length / 2)

  // Sidebar sections; a page counts as active for any page under it (an order's page keeps Orders lit).
  const groups = SIDEBAR_GROUPS.map((g) => ({ ...g, items: items.filter((n) => g.paths.includes(n.to)) })).filter((g) => g.items.length)
  const sideActive = (to: string) => (to === '/' ? pathname === '/' : to === '/orders' ? TABS[1]!.match(pathname) : under(pathname, to))
  const initials = (user?.full_name ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('')

  return (
    <div className="flex h-screen flex-col bg-slate-100 md:flex-row">
      {/* Sidebar: tablet / desktop */}
      <aside aria-label="Main" className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="flex items-center gap-2.5 px-5 pb-3 pt-5">
          <LogoTile size="header" />
          <span className="min-w-0">
            <span className="block truncate text-lg font-bold leading-tight text-slate-900"><BrandName /></span>
            <span className="block truncate text-xs text-slate-500">Laundry Management</span>
          </span>
        </div>

        {/* The main job, always one click away (phones have it in the tab bar) */}
        {canNewOrder && (
          <div className="px-3 pb-2">
            <NavLink
              to="/orders/new"
              className={({ isActive }) =>
                `flex min-h-11 items-center justify-center gap-2 rounded-xl font-semibold shadow-sm transition active:scale-[0.98] ${
                  isActive ? 'bg-blue-700 text-white' : 'bg-blue-600 text-white shadow-blue-600/30 hover:bg-blue-700'
                }`}
            >
              <Icon className="h-5 w-5">{I.plus}</Icon>New order
            </NavLink>
          </div>
        )}

        <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          {groups.map((g) => (
            <div key={g.title} className="pt-3">
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{g.title}</p>
              <ul className="space-y-0.5">
                {g.items.map((n) => {
                  const on = sideActive(n.to)
                  return (
                    <li key={n.to}>
                      <NavLink
                        to={n.to}
                        aria-current={on ? 'page' : undefined}
                        className={`relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition-colors ${
                          on ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-100 active:bg-slate-100'
                        }`}
                      >
                        {on && <span aria-hidden className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-blue-600" />}
                        <Icon className={`h-5 w-5 shrink-0 ${on ? 'text-blue-600' : 'text-slate-400'}`}>{NAV_ICON[n.to] ?? I.more}</Icon>
                        <span className="truncate">{n.to === '/payments' ? 'Payments' : n.label}</span>
                      </NavLink>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Who is signed in, with the account actions beside it */}
        <div className="border-t border-slate-200 p-3">
          <div className={`flex items-center gap-1 rounded-xl p-1 ${under(pathname, '/account') ? 'bg-blue-50' : ''}`}>
            <NavLink to="/account" className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg px-2 hover:bg-slate-100 active:bg-slate-100">
              <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-blue-600 text-xs font-bold text-white">{initials}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-slate-900">{user?.full_name}</span>
                <span className="block truncate text-xs text-slate-500">{user && ROLE_LABEL[user.role]}</span>
              </span>
            </NavLink>
            <button type="button" onClick={switchUser} aria-label="Switch user" title="Switch user" className="grid size-11 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800">
              <Icon className="h-5 w-5">{I.users}</Icon>
            </button>
            <button type="button" onClick={logout} aria-label="Log out" title="Log out" className="grid size-11 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600">
              <Icon className="h-5 w-5">{I.logout}</Icon>
            </button>
          </div>
        </div>
      </aside>

      {/* Top bar: phone, only for pages that don't draw their own header; same header as the rest */}
      {!hasOwnHeader(pathname) && (
        <div className="shrink-0 bg-slate-100 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] md:hidden">
          <AppHeader />
        </div>
      )}

      <main ref={mainRef} className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
        <Outlet />
      </main>

      {/* Bottom nav: phone. Steps aside while typing so forms keep the room above the keyboard. */}
      <nav
        aria-label="Main"
        className={`relative z-10 shrink-0 border-t border-slate-200/70 bg-white/95 px-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-4px_20px_rgba(15,23,42,0.06)] backdrop-blur md:hidden ${typing ? 'hidden' : ''}`}
      >
        <div className="flex items-end">
          {tabs.slice(0, half).map((t) => <Tab key={t.to} t={t} active={t.match(pathname)} />)}
          {canNewOrder && (
            <NavLink to="/orders/new" className="group flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl">
              {({ isActive }) => (
                <>
                  <span className={`-mt-6 grid size-14 place-items-center rounded-2xl text-white shadow-lg ring-4 ring-white transition group-active:scale-95 ${
                    isActive ? 'bg-blue-700 shadow-blue-700/40' : 'bg-blue-600 shadow-blue-600/35'
                  }`}>
                    <Icon className="h-7 w-7">{I.plus}</Icon>
                  </span>
                  <span className={`text-[11px] leading-none ${isActive ? 'font-bold text-blue-700' : 'font-semibold text-slate-700'}`}>New order</span>
                </>
              )}
            </NavLink>
          )}
          {tabs.slice(half).map((t) => <Tab key={t.to} t={t} active={t.match(pathname)} />)}
          <button type="button" onClick={() => setMoreOpen(true)} aria-haspopup="dialog" aria-expanded={moreOpen} aria-current={moreActive && !moreOpen ? 'page' : undefined} className={tabCls}>
            <TabInner icon={I.more} label="More" active={moreActive} />
          </button>
        </div>
      </nav>

      {moreOpen && (
        <Sheet label="More" onClose={() => setMoreOpen(false)}>
          {/* Who is signed in, with the account actions right there */}
          <div className="mb-4 flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-blue-600 text-sm font-bold text-white">
              {(user?.full_name ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('')}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-slate-900">{user?.full_name}</span>
              <span className="block text-xs text-slate-500">{user && ROLE_LABEL[user.role]}</span>
            </span>
            <button
              type="button"
              onClick={() => { setMoreOpen(false); switchUser() }}
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-white px-3 text-sm font-semibold text-blue-600 shadow-sm ring-1 ring-slate-200 active:bg-blue-50"
            >
              <Icon className="h-4 w-4">{I.users}</Icon>Switch
            </button>
          </div>

          {GROUPS.map((g) => {
            const list = more.filter((m) => m.group === g)
            if (!list.length) return null
            return (
              <section key={g} className="mb-4">
                <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{g}</h3>
                {/* Icon grid: one glance, one tap, no scrolling on most phones */}
                <ul className="grid grid-cols-3 gap-2">
                  {list.map((m) => {
                    const here = !m.anchor && under(pathname, m.to)
                    return (
                      <li key={m.label}>
                        <NavLink
                          to={m.to}
                          state={m.anchor ? { anchor: m.anchor } : undefined}
                          onClick={() => setMoreOpen(false)}
                          aria-current={here ? 'page' : undefined}
                          className={`flex min-h-22 flex-col items-center justify-center gap-2 rounded-2xl border px-1 py-3 text-center text-[13px] font-medium transition active:scale-[0.97] ${
                            here ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200/80 bg-white text-slate-800 active:bg-slate-50'
                          }`}
                        >
                          <span className={`grid size-10 place-items-center rounded-xl ${here ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-600'}`}>
                            <Icon className="h-5 w-5">{m.icon}</Icon>
                          </span>
                          <span className="w-full truncate px-1">{m.label}</span>
                        </NavLink>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}

          <button
            type="button"
            onClick={() => { setMoreOpen(false); logout() }}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl text-base font-semibold text-red-600 active:bg-red-50"
          >
            <Icon className="h-5 w-5">{I.logout}</Icon>Log out
          </button>
        </Sheet>
      )}
    </div>
  )
}
