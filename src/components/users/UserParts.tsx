import { Link } from 'react-router-dom'
import { Avatar } from '../Avatar'
import { Select } from '../Controls'
import { I, Icon } from '../Icons'
import { card, EmptyCard, Field, field, Section } from '../Manage'
import { ROLE_LABEL, type UserActivity } from '../../db/users'
import type { UserFilter, UserFormCtl } from '../../hooks/useUsers'
import { formatPeso } from '../../lib/money'
import { hasPermission, STAFF_ROLE, type Permission } from '../../lib/permissions'
import type { Role } from '../../types'

/** User management pieces shared by the phone and tablet / desktop Users pages (hooks/useUsers.ts). */

export const ROLES: { id: Role; label: string; badge: string; text: string }[] = [
  { id: 'admin', label: ROLE_LABEL.admin, badge: 'bg-blue-600 text-white', text: 'Full access to all features and settings.' },
  { id: 'manager', label: ROLE_LABEL.manager, badge: 'bg-blue-100 text-blue-700', text: 'Runs daily operations, services and reports.' },
  { id: STAFF_ROLE, label: ROLE_LABEL[STAFF_ROLE], badge: 'bg-slate-100 text-slate-700', text: 'Daily laundry operations: orders, payments and customers.' },
]
export const roleInfo = (r: Role) => ROLES.find((x) => x.id === r)!

/** Summary of lib/permissions.ts, which the routes and the database enforce. */
const PERMISSIONS: [string, Permission][] = [
  ['Manage Orders', 'orders.manage'],
  ['Collect Payments', 'payments.collect'],
  ['Manage Customers', 'customers.manage'],
  ['Printer', 'printer.use'],
  ['Manage Services', 'services.manage'],
  ['View Reports', 'reports.view'],
  ['Manage Users', 'users.manage'],
  ['System Settings', 'settings.manage'],
  ['Backup & Restore', 'backup.manage'],
]

export const USER_FILTERS: { id: UserFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  ...ROLES.map((r) => ({ id: r.id as UserFilter, label: r.label })),
  { id: 'inactive', label: 'Inactive' },
]

export const joined = (iso: string) => new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
export const stamp = (iso: string) => `${joined(iso)} • ${new Date(iso).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}`

export const RoleBadge = ({ role }: { role: Role }) => (
  <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${roleInfo(role).badge}`}>{roleInfo(role).label}</span>
)

export function Permissions({ role }: { role: Role }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {PERMISSIONS.filter(([, perm]) => hasPermission(role, perm)).map(([p]) => (
        <li key={p} className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-blue-50 px-3 text-xs font-medium text-blue-700">
          <span className="grid size-4 place-items-center rounded-full bg-blue-600 text-white">
            <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m6 12.5 4 4 8-9" /></svg>
          </span>
          {p}
        </li>
      ))}
    </ul>
  )
}

/** The add / edit form's sections (profile, account, role), without page chrome. */
export function UserFormSections({ uf, columns }: { uf: UserFormCtl; columns?: boolean }) {
  const { form, set, editing, showPin, setShowPin } = uf
  return (
    <div className={`grid gap-4 ${columns ? 'lg:grid-cols-2 lg:items-start' : ''}`}>
      <div className="min-w-0 space-y-4">
        <Section title="Profile Information">
          <div className="flex items-center gap-4">
            {form.fullName.trim()
              ? <Avatar name={form.fullName} className="size-20 text-2xl" />
              : <span className="grid size-20 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-400"><Icon className="h-8 w-8">{I.user}</Icon></span>}
            <div className="min-w-0 text-sm">
              <div className="font-semibold text-blue-600">Profile Avatar</div>
              <div className="text-slate-500">Initials, or the photo each employee adds in My Account.</div>
            </div>
          </div>
          <Field label="Full Name" icon={I.pencil} required>
            <input className={field} placeholder="Enter full name" value={form.fullName} onChange={(e) => set('fullName', e.target.value)} required autoFocus={!editing} />
          </Field>
        </Section>

        <Section title="Account Information">
          <Field label="Username" icon={I.user} required>
            <input className={field} placeholder="Enter username" autoCapitalize="none" autoComplete="off" value={form.username} onChange={(e) => set('username', e.target.value)} required />
          </Field>
          <label className="block">
            <span className="text-sm font-semibold text-slate-800">{editing ? 'Reset PIN' : 'Login PIN'}{!editing && <span className="text-red-500"> *</span>}</span>
            <span className="relative mt-1.5 block">
              <Icon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500">{I.lock}</Icon>
              <input
                className={`${field} pr-12`}
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                pattern="\d{4,6}"
                maxLength={6}
                autoComplete="off"
                placeholder={editing ? 'Leave blank to keep current' : 'Enter 4–6 digits'}
                value={form.pin}
                onChange={(e) => set('pin', e.target.value.replace(/\D/g, ''))}
                required={!editing}
              />
              <button type="button" onClick={() => setShowPin((v) => !v)} aria-label={showPin ? 'Hide PIN' : 'Show PIN'} className="absolute right-1 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 active:bg-slate-100">
                <Icon className="h-5 w-5">{showPin ? I.eyeOff : I.eye}</Icon>
              </button>
            </span>
            <span className="mt-1 block text-xs text-slate-400">4–6 digits.{editing && ' Setting a new PIN also unlocks a locked account.'}</span>
          </label>
        </Section>
      </div>

      <Section title="Role & Permissions">
        <Field label="User Role" icon={I.user} required>
          <Select className={field} value={form.role} onChange={(e) => set('role', e.target.value as Role)}>
            {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </Select>
        </Field>
        <div className="flex gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-sm text-slate-600">
          <Icon className="mt-0.5 h-5 w-5 text-blue-600">{I.info}</Icon>
          <span>Permissions are set based on the selected role. {roleInfo(form.role).text}</span>
        </div>
        <Permissions role={form.role} />
        {editing && (
          <label className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-slate-200 px-4">
            <span className="text-sm font-semibold text-slate-800">Account active</span>
            <input type="checkbox" className="h-5 w-5 accent-blue-600" checked={form.active} onChange={(e) => set('active', e.target.checked)} />
          </label>
        )}
      </Section>
    </div>
  )
}

/** Orders recorded by a user, newest first. */
export function ActivityList({ activity }: { activity: UserActivity[] | null }) {
  return (
    <div className={card}>
      {activity === null ? (
        <div className="h-40 animate-pulse rounded-2xl bg-slate-100" aria-busy="true" />
      ) : activity.length === 0 ? (
        <EmptyCard icon={I.report} title="No activity yet" text="Orders recorded by this user will appear here." />
      ) : (
        <ul className="divide-y divide-slate-100">
          {activity.map((a) => (
            <li key={a.id}>
              <Link to={`/orders/${a.id}`} className="flex items-center gap-3 p-3 transition hover:bg-slate-50 active:bg-slate-50 sm:p-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-600"><Icon className="h-5 w-5">{I.receipt}</Icon></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-slate-900">Created order #{a.order_number}</span>
                  <span className="block truncate text-sm text-slate-500">{a.customer_name} • {formatPeso(a.total_cents)}</span>
                  <span className="block text-xs text-slate-400">{stamp(a.created_at)}</span>
                </span>
                <Icon className="h-5 w-5 text-slate-400">{I.chevron}</Icon>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
