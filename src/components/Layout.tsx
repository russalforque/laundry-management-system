import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { NAV } from '../nav'

export default function Layout() {
  const { user, logout, can } = useAuth()
  const items = NAV.filter((n) => !n.roles || can(...n.roles))

  const link = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-lg px-3 py-3 text-base font-medium ${
      isActive ? 'bg-sky-600 text-white' : 'text-slate-700 active:bg-slate-200 hover:bg-slate-200'
    }`

  return (
    <div className="flex h-screen flex-col bg-slate-100 md:flex-row">
      {/* Sidebar: tablet / desktop */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white p-3 md:flex">
        <div className="px-3 pb-4 pt-2 text-xl font-bold text-slate-900">Sellix Laundry</div>
        <nav className="flex flex-1 flex-col gap-1">
          {items.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className={link}>
              <span aria-hidden>{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-200 pt-3">
          <NavLink to="/account" className={link}>
            <span aria-hidden>👤</span>
            <span className="min-w-0 truncate">
              {user?.full_name}
              <span className="block text-xs font-normal capitalize opacity-70">{user?.role}</span>
            </span>
          </NavLink>
          <button onClick={logout} className="mt-1 w-full rounded-lg px-3 py-3 text-left font-medium text-red-600 active:bg-red-50 hover:bg-red-50">
            Log out
          </button>
        </div>
      </aside>

      {/* Top bar: phone */}
      <header className="flex items-center justify-between bg-white px-4 py-3 shadow-sm md:hidden">
        <span className="text-lg font-bold text-slate-900">Sellix Laundry</span>
        <div className="flex items-center gap-3 text-sm">
          <NavLink to="/account" className="text-slate-600 underline">{user?.full_name}</NavLink>
          <button onClick={logout} className="font-medium text-red-600">Log out</button>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
        <Outlet />
      </main>

      {/* Bottom nav: phone */}
      <nav className="flex overflow-x-auto border-t border-slate-200 bg-white md:hidden">
        {items.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === '/'}
            className={({ isActive }) =>
              `flex min-w-[4.5rem] flex-1 flex-col items-center gap-0.5 py-2 text-xs ${isActive ? 'font-semibold text-sky-600' : 'text-slate-500'}`
            }
          >
            <span className="text-xl" aria-hidden>{n.icon}</span>
            {n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
