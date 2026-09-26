import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AppHeader } from '../components/AppHeader'
import { Avatar } from '../components/Avatar'
import { I, Icon } from '../components/Icons'
import {
  ActiveToggleButton, BackHeader, card, EditButton, EmptyCard, Field, field, FilterTabs, primary, SearchRow, Section, StatusBadge,
} from '../components/Manage'
import { Select } from '../components/Controls'
import { useAuth } from '../context/AuthContext'
import { useAdminPin } from '../components/AdminPin'
import { createUser, listUsers, ROLE_LABEL, updateUser, userActivity, type UserActivity } from '../db/users'
import { formatPeso } from '../lib/money'
import { hasPermission, STAFF_ROLE, type Permission } from '../lib/permissions'
import type { Role, User } from '../types'
import { fabPos } from '../components/ui'

interface Form {
  id?: number
  username: string
  fullName: string
  role: Role
  active: boolean
  pin: string
}

type View = { kind: 'list' } | { kind: 'form'; form: Form; back: View } | { kind: 'detail'; id: number }
type Filter = 'all' | Role | 'inactive'

const blank: Form = { username: '', fullName: '', role: STAFF_ROLE, active: true, pin: '' }
const toForm = (u: User): Form => ({ id: u.id, username: u.username, fullName: u.full_name, role: u.role, active: !!u.active, pin: '' })

const ROLES: { id: Role; label: string; badge: string; text: string }[] = [
  { id: 'admin', label: ROLE_LABEL.admin, badge: 'bg-blue-600 text-white', text: 'Full access to all features and settings.' },
  { id: 'manager', label: ROLE_LABEL.manager, badge: 'bg-blue-100 text-blue-700', text: 'Runs daily operations, services and reports.' },
  { id: STAFF_ROLE, label: ROLE_LABEL[STAFF_ROLE], badge: 'bg-slate-100 text-slate-700', text: 'Daily laundry operations: orders, payments, machines and customers.' },
]
const roleInfo = (r: Role) => ROLES.find((x) => x.id === r)!

/** Summary of lib/permissions.ts, which the routes and the database enforce. */
const PERMISSIONS: [string, Permission][] = [
  ['Manage Orders', 'orders.manage'],
  ['Collect Payments', 'payments.collect'],
  ['Manage Customers', 'customers.manage'],
  ['Operate Machines', 'machines.operate'],
  ['Printer', 'printer.use'],
  ['Configure Machines', 'machines.configure'],
  ['Manage Services', 'services.manage'],
  ['View Reports', 'reports.view'],
  ['Manage Users', 'users.manage'],
  ['System Settings', 'settings.manage'],
  ['Backup & Restore', 'backup.manage'],
]

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  ...ROLES.map((r) => ({ id: r.id as Filter, label: r.label })),
  { id: 'inactive', label: 'Inactive' },
]

const joined = (iso: string) => new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
const stamp = (iso: string) => `${joined(iso)} • ${new Date(iso).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}`

// ---------- building blocks ----------

const RoleBadge = ({ role }: { role: Role }) => (
  <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${roleInfo(role).badge}`}>{roleInfo(role).label}</span>
)

function Permissions({ role }: { role: Role }) {
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

// ---------- views ----------

function UserCard({ u, onOpen }: { u: User; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className={`${card} flex w-full items-center gap-3 p-3 text-left transition active:bg-slate-50 sm:gap-4 sm:p-4`}>
      <Avatar name={u.full_name} className={`size-14 text-lg ${u.active ? '' : 'opacity-60'}`} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-bold text-slate-900">{u.full_name}</span>
          <RoleBadge role={u.role} />
          <StatusBadge active={!!u.active} />
        </span>
        <span className="mt-0.5 block truncate text-sm text-slate-500">@{u.username}</span>
        <span className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
          <Icon className="h-3.5 w-3.5 text-slate-400">{I.calendar}</Icon>
          Joined {joined(u.created_at)}
        </span>
      </span>
      <Icon className="h-5 w-5 text-slate-400">{I.chevron}</Icon>
    </button>
  )
}

function UserForm({ initial, onSaved, onCancel }: { initial: Form; onSaved: (id?: number) => void; onCancel: () => void }) {
  const [form, setForm] = useState(initial)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showPin, setShowPin] = useState(false)
  const { approve, sheet } = useAdminPin()
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))
  const editing = !!form.id

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!(await approve(editing ? `Save changes to ${form.fullName.trim() || 'this user'}?` : 'Create this user account?'))) return
    setBusy(true)
    try {
      if (form.id) await updateUser(form.id, { ...form, newPin: form.pin || undefined })
      else await createUser(form)
      onSaved(form.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <BackHeader title={editing ? 'Edit User' : 'Add User'} onBack={onCancel} />

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <div className="space-y-4">
          <Section title="Profile Information">
            <div className="flex items-center gap-4">
              {form.fullName.trim()
                ? <Avatar name={form.fullName} className="size-20 text-2xl" />
                : <span className="grid size-20 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-400"><Icon className="h-8 w-8">{I.user}</Icon></span>}
              <div className="min-w-0 text-sm">
                <div className="font-semibold text-blue-600">Profile Avatar</div>
                <div className="text-slate-500">Generated from the user's initials.</div>
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
                <button type="button" onClick={() => setShowPin((v) => !v)} aria-label={showPin ? 'Hide PIN' : 'Show PIN'} className="absolute right-1 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-lg text-slate-500 active:bg-slate-100">
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

      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">{error}</p>}
      <div className="flex gap-2">
        {editing && <button type="button" onClick={onCancel} className="min-h-12 flex-1 rounded-full bg-slate-100 font-semibold text-slate-700 active:bg-slate-200 lg:flex-none lg:px-8">Cancel</button>}
        <button disabled={busy} className={`${primary} min-h-12 flex-1 rounded-full text-base lg:flex-none lg:px-10`}>
          {busy ? 'Saving…' : editing ? 'Save Changes' : 'Create User'}
        </button>
      </div>
      {sheet}
    </form>
  )
}

function UserDetail({ u, onBack, onEdit, onChanged }: { u: User; onBack: () => void; onEdit: () => void; onChanged: () => Promise<unknown> }) {
  const { user: me } = useAuth()
  const [activity, setActivity] = useState<UserActivity[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const role = roleInfo(u.role)
  const isMe = me?.id === u.id
  const { approve, sheet } = useAdminPin()

  useEffect(() => { userActivity(u.id).then(setActivity).catch(() => setActivity([])) }, [u.id])

  async function toggleActive() {
    const ask = u.active ? `Deactivate ${u.full_name}? They will no longer be able to log in.` : `Reactivate ${u.full_name}?`
    if (!(await approve(ask))) return
    setBusy(true)
    try {
      await updateUser(u.id, { ...toForm(u), active: !u.active })
      setError('')
      await onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <BackHeader
        title="User Details"
        onBack={onBack}
        action={<EditButton onClick={onEdit} />}
      />

      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <div className="space-y-5">
          <section className={`${card} p-4 sm:p-5`}>
            <div className="flex items-start gap-4">
              <Avatar name={u.full_name} className={`size-20 text-2xl ${u.active ? '' : 'opacity-60'}`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 truncate text-lg font-bold text-slate-900">{u.full_name}</span>
                  <RoleBadge role={u.role} />
                  <span className="ml-auto"><StatusBadge active={!!u.active} /></span>
                </div>
                <div className="mt-1.5 flex items-center gap-2 text-sm text-slate-500">
                  <Icon className="h-4 w-4 text-slate-400">{I.user}</Icon>
                  <span className="truncate">@{u.username}</span>
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-500 sm:text-sm">
              <span className="inline-flex items-center gap-1.5"><Icon className="h-4 w-4 text-slate-400">{I.calendar}</Icon>Joined {joined(u.created_at)}</span>
              {activity?.[0] && <span className="sm:border-l sm:border-slate-200 sm:pl-4">Last order: {stamp(activity[0].created_at)}</span>}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><Icon className="h-6 w-6">{I.user}</Icon>Role &amp; Permissions</h2>
            <div className={`${card} space-y-4 p-4 sm:p-5`}>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-slate-800">Role</span>
                <span className="grid size-9 place-items-center rounded-full bg-blue-50 text-blue-600"><Icon className="h-5 w-5">{I.crown}</Icon></span>
                <span className="min-w-0 flex-1 truncate font-semibold text-slate-900">{role.label}</span>
                <button onClick={onEdit} className="min-h-10 shrink-0 rounded-xl border border-blue-200 px-3 text-sm font-semibold text-blue-600 active:bg-blue-50">Change Role</button>
              </div>
              <p className="text-sm text-slate-500">{role.text}</p>
              <div>
                <div className="mb-2 text-sm font-semibold text-slate-800">Permissions</div>
                <Permissions role={u.role} />
              </div>
            </div>
          </section>
        </div>

        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><Icon className="h-6 w-6">{I.report}</Icon>Activity Log</h2>
          <div className={card}>
            {activity === null ? (
              <div className="h-40 animate-pulse rounded-2xl bg-slate-100" aria-busy="true" />
            ) : activity.length === 0 ? (
              <EmptyCard icon={I.report} title="No activity yet" text="Orders recorded by this user will appear here." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {activity.map((a) => (
                  <li key={a.id}>
                    <Link to={`/orders/${a.id}`} className="flex items-center gap-3 p-3 transition active:bg-slate-50 sm:p-4">
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
        </section>
      </div>

      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">{error}</p>}
      <ActiveToggleButton active={!!u.active} noun="User" onClick={toggleActive} disabled={busy || isMe} title={isMe ? "You can't deactivate your own account" : undefined} />
      {isMe && <p className="-mt-3 text-center text-xs text-slate-400">You can't deactivate your own account.</p>}
      {sheet}
    </div>
  )
}

// ---------- page ----------

export default function Users() {
  const [users, setUsers] = useState<User[] | null>(null)
  const [view, setView] = useState<View>({ kind: 'list' })
  const [text, setText] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [newest, setNewest] = useState(false)

  const load = useCallback(() => listUsers().then(setUsers), [])
  useEffect(() => { load() }, [load])
  // <main> is the shared scroll container; open each view at the top.
  useEffect(() => { document.querySelector('main')?.scrollTo(0, 0) }, [view.kind])

  if (view.kind === 'form') {
    return (
      <div className="mx-auto max-w-5xl pb-4">
        <UserForm
          key={view.form.id ?? 'new'}
          initial={view.form}
          onCancel={() => setView(view.back)}
          onSaved={async (id) => { await load(); setView(id ? { kind: 'detail', id } : { kind: 'list' }) }}
        />
      </div>
    )
  }

  if (view.kind === 'detail') {
    const u = users?.find((x) => x.id === view.id)
    if (!u) return null
    return (
      <div className="mx-auto max-w-5xl pb-4">
        <UserDetail u={u} onBack={() => setView({ kind: 'list' })} onEdit={() => setView({ kind: 'form', form: toForm(u), back: view })} onChanged={load} />
      </div>
    )
  }

  const q = text.trim().toLowerCase()
  const rows = (users ?? [])
    .filter((u) => (filter === 'all' ? true : filter === 'inactive' ? !u.active : u.role === filter))
    .filter((u) => !q || `${u.full_name} ${u.username} ${u.role}`.toLowerCase().includes(q))
  if (newest) rows.sort((a, b) => b.created_at.localeCompare(a.created_at))

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-28">
      <div className="md:hidden"><AppHeader /></div>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Users</h1>
          <p className="mt-1 text-sm text-slate-500">Manage staff accounts and access permissions.</p>
        </div>
      </div>

      <SearchRow
        value={text}
        onChange={setText}
        label="Search users"
        placeholder="Search by name, username or role…"
        toggled={newest}
        onToggle={() => setNewest((v) => !v)}
        toggleLabel={newest ? 'Sorted newest first; sort by name' : 'Sorted by name; sort newest first'}
      />
      <FilterTabs options={FILTERS} value={filter} onChange={setFilter} label="Filter users" />
      {newest && <p className="-mt-2 text-xs text-slate-500">Sorted by newest first</p>}

      {users === null ? (
        <div className="grid gap-3 lg:grid-cols-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-200/60" />)}</div>
      ) : rows.length === 0 ? (
        <div className={card}><EmptyCard icon={I.user} title="No users found" text="Try a different search or filter." /></div>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {rows.map((u) => <li key={u.id}><UserCard u={u} onOpen={() => setView({ kind: 'detail', id: u.id })} /></li>)}
        </ul>
      )}

      <button
        type="button"
        onClick={() => setView({ kind: 'form', form: blank, back: { kind: 'list' } })}
        aria-label="Add User"
        className={`${fabPos} grid size-14 place-items-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-600/30 transition active:scale-95 active:bg-blue-700`}
      >
        <Icon className="h-7 w-7">{I.plus}</Icon>
      </button>
    </div>
  )
}
