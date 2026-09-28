import { useEffect, useState } from 'react'
import { AppHeader } from '../../components/AppHeader'
import { Avatar } from '../../components/Avatar'
import { I, Icon } from '../../components/Icons'
import {
  ActiveToggleButton, BackHeader, card, EditButton, EmptyCard, FilterTabs, primary, SearchRow, StatusBadge,
} from '../../components/Manage'
import { fabPos } from '../../components/ui'
import { ActivityList, joined, Permissions, RoleBadge, roleInfo, stamp, USER_FILTERS as FILTERS, UserFormSections } from '../../components/users/UserParts'
import { blankUser, toUserForm, useUserDetail, useUserForm, useUserList, type UserFormValues } from '../../hooks/useUsers'
import type { User } from '../../types'

type View = { kind: 'list' } | { kind: 'form'; form: UserFormValues; back: View } | { kind: 'detail'; id: number }

function UserCard({ u, onOpen }: { u: User; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className={`${card} flex w-full items-center gap-3 p-3 text-left transition active:bg-slate-50 sm:gap-4 sm:p-4`}>
      <Avatar name={u.full_name} photo={u.photo} className={`size-14 text-lg ${u.active ? '' : 'opacity-60'}`} />
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

function UserForm({ initial, onSaved, onCancel }: { initial: UserFormValues; onSaved: (id?: number) => void; onCancel: () => void }) {
  const uf = useUserForm(initial, onSaved)
  return (
    <form onSubmit={uf.save} className="space-y-4">
      <BackHeader title={uf.editing ? 'Edit User' : 'Add User'} onBack={onCancel} />
      <UserFormSections uf={uf} />
      {uf.error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">{uf.error}</p>}
      <div className="flex gap-2">
        {uf.editing && <button type="button" onClick={onCancel} className="min-h-12 flex-1 rounded-full bg-slate-100 font-semibold text-slate-700 active:bg-slate-200">Cancel</button>}
        <button disabled={uf.busy} className={`${primary} min-h-12 flex-1 rounded-full text-base`}>
          {uf.busy ? 'Saving…' : uf.editing ? 'Save Changes' : 'Create User'}
        </button>
      </div>
      {uf.sheet}
    </form>
  )
}

function UserDetail({ u, onBack, onEdit, onChanged }: { u: User; onBack: () => void; onEdit: () => void; onChanged: () => Promise<unknown> }) {
  const { activity, error, busy, isMe, toggleActive, sheet } = useUserDetail(u, onChanged)
  const role = roleInfo(u.role)

  return (
    <div className="space-y-5">
      <BackHeader title="User Details" onBack={onBack} action={<EditButton onClick={onEdit} />} />

      <section className={`${card} p-4 sm:p-5`}>
        <div className="flex items-start gap-4">
          <Avatar name={u.full_name} photo={u.photo} className={`size-20 text-2xl ${u.active ? '' : 'opacity-60'}`} />
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

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><Icon className="h-6 w-6">{I.report}</Icon>Activity Log</h2>
        <ActivityList activity={activity} />
      </section>

      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">{error}</p>}
      <ActiveToggleButton active={!!u.active} noun="User" onClick={toggleActive} disabled={busy || isMe} title={isMe ? "You can't deactivate your own account" : undefined} />
      {isMe && <p className="-mt-3 text-center text-xs text-slate-400">You can't deactivate your own account.</p>}
      {sheet}
    </div>
  )
}

/** Phone Users: search, role tabs and user cards; details and the form each open on their own screen. */
export default function MobileUsers() {
  const { users, load, text, setText, filter, setFilter, newest, setNewest, rows } = useUserList()
  const [view, setView] = useState<View>({ kind: 'list' })

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
        <UserDetail u={u} onBack={() => setView({ kind: 'list' })} onEdit={() => setView({ kind: 'form', form: toUserForm(u), back: view })} onChanged={load} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-28">
      <AppHeader />

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
        <div className="grid gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-200/60" />)}</div>
      ) : rows.length === 0 ? (
        <div className={card}><EmptyCard icon={I.user} title="No users found" text="Try a different search or filter." /></div>
      ) : (
        <ul className="grid gap-3">
          {rows.map((u) => <li key={u.id}><UserCard u={u} onOpen={() => setView({ kind: 'detail', id: u.id })} /></li>)}
        </ul>
      )}

      <button
        type="button"
        onClick={() => setView({ kind: 'form', form: blankUser, back: { kind: 'list' } })}
        aria-label="Add User"
        className={`${fabPos} grid size-14 place-items-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-600/30 transition active:scale-95 active:bg-blue-700`}
      >
        <Icon className="h-7 w-7">{I.plus}</Icon>
      </button>
    </div>
  )
}
