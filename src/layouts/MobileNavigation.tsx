import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { AppHeader } from '../components/AppHeader'
import { Avatar } from '../components/Avatar'
import { I, Icon } from '../components/Icons'
import { Sheet } from '../components/Sheet'
import { useAuth } from '../context/AuthContext'
import { ROLE_LABEL } from '../db/users'
import type { Permission } from '../lib/permissions'
import { isOrdersPath, under, useNavAccess } from './navigation'

/** Phone shell: pages that draw their own header (AppHeader, back header) skip the shell's top bar. */
const OWN_HEADER = ['/store', '/', '/account', '/account/pin', '/orders', '/orders/new', '/customers', '/reports', '/users', '/services', '/settings', '/payments', '/printer']
const hasOwnHeader = (path: string) => OWN_HEADER.includes(path) || /^\/(customers|orders)\/\d+$/.test(path)

/**
 * Phone tab bar: Home | Orders | New order | Customers | More. Everything else lives in the More sheet.
 * `match` decides which pages light a tab up (e.g. an order's page keeps Orders active, New Order does not).
 */
const TABS: { to: string; label: string; icon: ReactNode; match: (path: string) => boolean }[] = [
  { to: '/', label: 'Dashboard', icon: I.home, match: (p) => p === '/' },
  { to: '/orders', label: 'Orders', icon: I.orders, match: isOrdersPath },
  { to: '/customers', label: 'Customers', icon: I.users, match: (p) => p.startsWith('/customers') },
]
/** Access comes from NAV (`to` of the guarded route) or `perm`, so the sheet never shows a page the user can't open. */
const MORE: { to: string; label: string; icon: ReactNode; group: 'Daily work' | 'Business' | 'Account'; anchor?: string; perm?: Permission }[] = [
  { to: '/store', label: 'Store Shift', icon: I.store, group: 'Daily work' },
  { to: '/payments', label: 'Payments', icon: I.wallet, group: 'Daily work' },
  { to: '/printer', label: 'Printer', icon: I.printer, group: 'Daily work' },
  { to: '/services', label: 'Services', icon: I.shirt, group: 'Business' },
  { to: '/reports', label: 'Reports', icon: I.chart, group: 'Business' },
  { to: '/users', label: 'Users', icon: I.shield, group: 'Business' },
  { to: '/settings', label: 'Settings', icon: I.gear, group: 'Business' },
  { to: '/settings', label: 'Backup', icon: I.cloud, group: 'Business', anchor: 'backup', perm: 'backup.manage' },
  { to: '/account', label: 'My Account', icon: I.user, group: 'Account' },
]
const GROUPS = ['Daily work', 'Business', 'Account'] as const

/** Material-style tab: the active one gets a tinted pill behind its icon and a bold label. */
function TabInner({ icon, label, active }: { icon: ReactNode; label: string; active: boolean }) {
  return (
    <>
      <span className={`grid h-8 w-14 place-items-center rounded-full transition-colors duration-200 ${active ? 'bg-blue-100 text-blue-700' : 'text-slate-500'}`}>
        <Icon className={`h-6 w-6 ${active ? 'fill-blue-200/60' : ''}`}>{icon}</Icon>
      </span>
      <span className={`text-[11px] leading-none transition-colors ${active ? 'font-bold text-blue-700' : 'font-medium text-slate-500'}`}>{label}</span>
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
    let back: number | undefined
    // The tab bar comes back only after the tap that ended typing has finished: showing it moves pinned buttons
    // up, and a button (Save, Create Order) moving out from under the finger mid-tap would miss the tap.
    // Tapping a button focuses it, so a non-text focusin waits the same way.
    const onOut = () => { clearTimeout(back); back = window.setTimeout(() => setTyping(false), 300) }
    const onIn = (e: FocusEvent) => {
      clearTimeout(back)
      if (isText(e.target)) setTyping(true)
      else onOut()
    }
    document.addEventListener('focusin', onIn)
    document.addEventListener('focusout', onOut)
    return () => { clearTimeout(back); document.removeEventListener('focusin', onIn); document.removeEventListener('focusout', onOut) }
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

/** Phone top bar, only for pages that don't draw their own header (layouts/AppShell.tsx puts it above <main>). */
export function MobileTopBar() {
  const { pathname } = useLocation()
  if (hasOwnHeader(pathname)) return null
  return (
    <div className="shrink-0 bg-slate-100 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <AppHeader />
    </div>
  )
}

/**
 * Phone navigation (below 768px): bottom tab bar with New order in the middle, and the More sheet for the
 * rest of the app. Steps aside while typing so forms keep the room above the keyboard.
 */
export function MobileTabBar() {
  const { user, logout, switchUser } = useAuth()
  const { allowed, can } = useNavAccess()
  const { pathname } = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  const more = MORE.filter((m) => allowed(m.to) && (!m.perm || can(m.perm)))
  // Tabs follow permissions too, so a role never sees a tab that bounces it back home.
  const tabs = TABS.filter((t) => allowed(t.to))
  const canNewOrder = can('orders.manage')
  const moreActive = moreOpen || (!tabs.some((t) => t.match(pathname)) && pathname !== '/orders/new' && more.some((m) => under(pathname, m.to)))
  const typing = useTyping()
  // Put New order in the middle whatever tabs this role has.
  const half = Math.ceil(tabs.length / 2)

  return (
    <>
      <nav
        aria-label="Main"
        className={`relative z-10 shrink-0 border-t border-slate-200/70 bg-white/95 px-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-4px_20px_rgba(15,23,42,0.06)] backdrop-blur ${typing ? 'hidden' : ''}`}
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
            <TabInner icon={I.menu} label="More" active={moreActive} />
          </button>
        </div>
      </nav>

      {moreOpen && (
        <Sheet label="More" onClose={() => setMoreOpen(false)}>
          {/* Who is signed in, with the account actions right there */}
          <div className="mb-4 flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
            <Avatar name={user?.full_name ?? ''} photo={user?.photo} tone="bg-blue-600 text-white" className="size-11 text-sm" />
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
    </>
  )
}
