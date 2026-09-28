import { useState, type KeyboardEvent, type ReactNode } from 'react'
import { Avatar } from '../../components/Avatar'
import { Chip } from '../../components/Chip'
import { Select } from '../../components/Controls'
import { btnPrimary, btnSecondary, Drawer, PageHeader, SidePanel, table, useSplit } from '../../components/desktop-tablet/ui'
import { I, Icon } from '../../components/Icons'
import { card, EmptyCard, StatusBadge } from '../../components/Manage'
import { ActivityList, joined, Permissions, RoleBadge, roleInfo, stamp, USER_FILTERS, UserFormSections } from '../../components/users/UserParts'
import { fieldCls } from '../../components/ui'
import { blankUser, toUserForm, useUserDetail, useUserForm, useUserList, type UserFormValues } from '../../hooks/useUsers'
import type { User } from '../../types'

type Panel = { kind: 'none' } | { kind: 'detail'; id: number } | { kind: 'form'; form: UserFormValues; back: Panel }

function DetailPanel({ u, onClose, onEdit, onChanged }: { u: User; onClose: () => void; onEdit: () => void; onChanged: () => Promise<unknown> }) {
  const { activity, error, busy, isMe, toggleActive, sheet } = useUserDetail(u, onChanged)
  const role = roleInfo(u.role)
  return (
    <SidePanel
      title="User details"
      onClose={onClose}
      closeLabel="Close details"
      footer={
        <div className="space-y-2">
          {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={toggleActive}
              disabled={busy || isMe}
              title={isMe ? "You can't deactivate your own account" : undefined}
              className={`${btnSecondary} ${u.active ? 'text-red-600' : 'text-emerald-700'}`}
            >
              <Icon className="h-5 w-5">{u.active ? I.trash : I.check}</Icon>{u.active ? 'Deactivate' : 'Reactivate'}
            </button>
            <button type="button" onClick={onEdit} className={`${btnPrimary} flex-1`}><Icon className="h-5 w-5">{I.pencil}</Icon>Edit user</button>
          </div>
          {isMe && <p className="text-xs text-slate-400">You can't deactivate your own account.</p>}
        </div>
      }
    >
      <section className="flex items-start gap-4">
        <Avatar name={u.full_name} photo={u.photo} className={`size-16 text-xl ${u.active ? '' : 'opacity-60'}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 truncate text-lg font-bold text-slate-900">{u.full_name}</span>
            <RoleBadge role={u.role} />
            <StatusBadge active={!!u.active} />
          </div>
          <p className="mt-0.5 truncate text-sm text-slate-500">@{u.username}</p>
          <p className="mt-1 text-xs text-slate-500">
            Joined {joined(u.created_at)}{activity?.[0] && <> · Last order {stamp(activity[0].created_at)}</>}
          </p>
        </div>
      </section>

      <section className={`${card} space-y-3 p-4`}>
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-full bg-blue-50 text-blue-600"><Icon className="h-5 w-5">{I.crown}</Icon></span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-slate-900">{role.label}</span>
            <span className="block text-sm text-slate-500">{role.text}</span>
          </span>
        </div>
        <Permissions role={u.role} />
      </section>

      <section className="space-y-2">
        <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Activity log</h3>
        <ActivityList activity={activity} />
      </section>
      {sheet}
    </SidePanel>
  )
}

function FormPanel({ initial, wide, onSaved, onCancel }: { initial: UserFormValues; wide: boolean; onSaved: (id?: number) => void; onCancel: () => void }) {
  const uf = useUserForm(initial, onSaved)
  return (
    <SidePanel
      title={uf.editing ? 'Edit user' : 'Add user'}
      onClose={onCancel}
      closeLabel="Cancel"
      onSubmit={uf.save}
      footer={
        <div className="space-y-2">
          {uf.error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">{uf.error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onCancel} className={btnSecondary}>Cancel</button>
            <button disabled={uf.busy} className={`${btnPrimary} px-8`}>{uf.busy ? 'Saving…' : uf.editing ? 'Save changes' : 'Create user'}</button>
          </div>
        </div>
      }
    >
      <UserFormSections uf={uf} columns={wide} />
      {uf.sheet}
    </SidePanel>
  )
}

/**
 * Users on tablets and desktops: staff accounts as a filterable table. On desktop a user's details or form
 * open in a panel beside the table; tablets give the panel the full width. Same accounts, form and PIN
 * approval as the phone page (hooks/useUsers.ts).
 */
export default function Users() {
  const { users, load, text, setText, filter, setFilter, newest, setNewest, rows } = useUserList()
  const [panel, setPanel] = useState<Panel>({ kind: 'none' })
  // Landscape: the user or form beside the table. Portrait tablets: in a drawer over it.
  const split = useSplit()

  const open = (id: number) => setPanel({ kind: 'detail', id })
  const selected = panel.kind === 'detail' ? panel.id : panel.kind === 'form' ? panel.form.id : undefined
  const onRowKey = (e: KeyboardEvent, id: number) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(id) } }

  let side: ReactNode = null
  if (panel.kind === 'form') {
    side = (
      <FormPanel
        key={panel.form.id ?? 'new'}
        initial={panel.form}
        wide={!split}
        onCancel={() => setPanel(panel.back)}
        onSaved={async (id) => { await load(); setPanel(id ? { kind: 'detail', id } : { kind: 'none' }) }}
      />
    )
  } else if (panel.kind === 'detail') {
    const u = users?.find((x) => x.id === panel.id)
    if (u) side = <DetailPanel key={u.id} u={u} onClose={() => setPanel({ kind: 'none' })} onEdit={() => setPanel({ kind: 'form', form: toUserForm(u), back: panel })} onChanged={load} />
  }

  // With a panel open beside it on a landscape tablet, the table drops Joined to keep names readable.
  const joinedCls = split && side ? 'hidden xl:table-cell' : ''
  const list = (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Icon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400">{I.search}</Icon>
          <input className={`${fieldCls} py-2.5 pl-12`} type="search" aria-label="Search users" placeholder="Search by name, username or role…" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <div className="w-44">
          <Select className={`${fieldCls} py-2.5`} aria-label="Sort" value={newest ? 'newest' : 'name'} onChange={(e) => setNewest(e.target.value === 'newest')}>
            <option value="name">Name A–Z</option>
            <option value="newest">Newest first</option>
          </Select>
        </div>
      </div>
      <div role="tablist" aria-label="Filter users" className="flex flex-wrap gap-2">
        {USER_FILTERS.map((f) => <Chip key={f.id} active={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</Chip>)}
      </div>

      {users === null ? (
        <div className={`${table.wrap} space-y-2 p-4`} aria-busy="true">{[0, 1, 2, 3].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100" />)}</div>
      ) : rows.length === 0 ? (
        <div className={card}><EmptyCard icon={I.user} title="No users found" text="Try a different search or filter." /></div>
      ) : (
        <div className={table.wrap}>
          <table className={table.table}>
            <thead className={table.thead}>
              <tr>
                <th className={table.th}>User</th>
                <th className={table.th}>Role</th>
                <th className={`${table.th} ${joinedCls}`}>Joined</th>
                <th className={table.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr
                  key={u.id}
                  tabIndex={0}
                  aria-selected={split ? selected === u.id : undefined}
                  onClick={() => open(u.id)}
                  onKeyDown={(e) => onRowKey(e, u.id)}
                  className={`${split && selected === u.id ? table.rowOn : table.row} outline-none focus-visible:bg-blue-50`}
                >
                  <td className={`${table.td} max-w-0 w-full`}>
                    <span className="flex items-center gap-3">
                      <Avatar name={u.full_name} photo={u.photo} className={`size-9 text-xs ${u.active ? '' : 'opacity-60'}`} />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-slate-900">{u.full_name}</span>
                        <span className="block truncate text-xs text-slate-500">@{u.username}</span>
                      </span>
                    </span>
                  </td>
                  <td className={`${table.td} whitespace-nowrap`}><RoleBadge role={u.role} /></td>
                  <td className={`${table.td} whitespace-nowrap text-slate-600 ${joinedCls}`}>{joined(u.created_at)}</td>
                  <td className={`${table.td} whitespace-nowrap`}><StatusBadge active={!!u.active} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )

  return (
    <div className={`mx-auto max-w-7xl space-y-5 ${split && side ? 'flex h-full flex-col' : 'pb-6'}`}>
      <PageHeader
        title="Users"
        sub="Manage staff accounts and access permissions."
        actions={<button type="button" onClick={() => setPanel({ kind: 'form', form: blankUser, back: panel.kind === 'form' ? { kind: 'none' } : panel })} className={side ? btnSecondary : btnPrimary}><Icon className="h-5 w-5">{I.plus}</Icon>Add user</button>}
      />
      {split && side ? (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_28rem] gap-5">
          <div className="min-h-0 overflow-y-auto overscroll-contain pr-1">{list}</div>
          {side}
        </div>
      ) : list}
      {!split && side && <Drawer label="User" onClose={() => setPanel(panel.kind === 'form' ? panel.back : { kind: 'none' })}>{side}</Drawer>}
    </div>
  )
}
