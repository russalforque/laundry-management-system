import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ROLE_LABEL } from '../db/users'
import { BrandName, LogoTile } from './AuthScreen'
import { I, Icon } from './Icons'

/** Round white icon button used in the header (account, notifications). */
export const headerBtn = 'relative grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white text-slate-800 shadow-[0_2px_10px_color-mix(in_oklab,var(--color-blue-600)_10%,transparent)] transition active:scale-95 active:bg-blue-50'

/**
 * Phone-style brand header with the account menu (Layout hides its own top bar on these pages).
 * `actions` renders extra header buttons (e.g. notifications) before the account button.
 */
export function AppHeader({ actions }: { actions?: ReactNode }) {
  const { user, logout, switchUser } = useAuth()
  const [menu, setMenu] = useState(false)
  return (
    <header className="flex items-center gap-3">
      <LogoTile size="header" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xl font-bold leading-tight tracking-tight text-slate-900">
          <BrandName />
        </div>
        <div className="truncate text-xs text-slate-500">Laundry Management System</div>
      </div>
      {actions}
      <div className="relative">
        <button onClick={() => setMenu((m) => !m)} aria-label="Account menu" aria-expanded={menu} className={headerBtn}>
          <Icon className="h-6 w-6">{I.user}</Icon>
        </button>
        {menu && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setMenu(false)} aria-hidden />
            <div role="menu" className="absolute right-0 top-14 z-30 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
              <div className="border-b border-slate-100 px-4 py-3">
                <div className="truncate text-sm font-semibold text-slate-900">{user?.full_name}</div>
                <div className="text-xs text-slate-500">{user && ROLE_LABEL[user.role]}</div>
              </div>
              <Link role="menuitem" to="/account" className="flex min-h-11 items-center gap-3 px-4 text-sm text-slate-700 active:bg-slate-50">
                <Icon>{I.user}</Icon>My account
              </Link>
              <button role="menuitem" onClick={switchUser} className="flex min-h-11 w-full items-center gap-3 px-4 text-sm text-slate-700 active:bg-slate-50">
                <Icon>{I.users}</Icon>Switch user
              </button>
              <button role="menuitem" onClick={logout} className="flex min-h-11 w-full items-center gap-3 px-4 text-sm font-medium text-red-600 active:bg-red-50">
                <Icon>{I.logout}</Icon>Log out
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  )
}
