import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useAdminPin } from '../components/AdminPin'
import { useAuth } from '../context/AuthContext'
import { createUser, listUsers, updateUser, userActivity, type UserActivity } from '../db/users'
import { STAFF_ROLE } from '../lib/permissions'
import type { Role, User } from '../types'

/**
 * Staff accounts: the list with search / role filter / sort, the add-edit form and one user's details, each
 * change approved with an admin PIN. Shared by pages/mobile/MobileUsers.tsx and pages/desktop-tablet/Users.tsx.
 */

export interface UserFormValues {
  id?: number
  username: string
  fullName: string
  role: Role
  active: boolean
  pin: string
}

export type UserFilter = 'all' | Role | 'inactive'

export const blankUser: UserFormValues = { username: '', fullName: '', role: STAFF_ROLE, active: true, pin: '' }
export const toUserForm = (u: User): UserFormValues => ({ id: u.id, username: u.username, fullName: u.full_name, role: u.role, active: !!u.active, pin: '' })

export function useUserList() {
  const [users, setUsers] = useState<User[] | null>(null)
  const [text, setText] = useState('')
  const [filter, setFilter] = useState<UserFilter>('all')
  const [newest, setNewest] = useState(false)

  const load = useCallback(() => listUsers().then(setUsers).catch(console.error), [])
  useEffect(() => { load() }, [load])

  const q = text.trim().toLowerCase()
  const rows = (users ?? [])
    .filter((u) => (filter === 'all' ? true : filter === 'inactive' ? !u.active : u.role === filter))
    .filter((u) => !q || `${u.full_name} ${u.username} ${u.role}`.toLowerCase().includes(q))
  if (newest) rows.sort((a, b) => b.created_at.localeCompare(a.created_at))

  return { users, load, text, setText, filter, setFilter, newest, setNewest, rows }
}

export function useUserForm(initial: UserFormValues, onSaved: (id?: number) => void) {
  const [form, setForm] = useState(initial)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showPin, setShowPin] = useState(false)
  const { approve, sheet } = useAdminPin()
  const set = <K extends keyof UserFormValues>(k: K, v: UserFormValues[K]) => setForm((f) => ({ ...f, [k]: v }))
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

  return { form, set, error, busy, showPin, setShowPin, editing, save, sheet }
}
export type UserFormCtl = ReturnType<typeof useUserForm>

export function useUserDetail(u: User, onChanged: () => Promise<unknown>) {
  const { user: me } = useAuth()
  const [activity, setActivity] = useState<UserActivity[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const { approve, sheet } = useAdminPin()

  useEffect(() => { userActivity(u.id).then(setActivity).catch(() => setActivity([])) }, [u.id])

  async function toggleActive() {
    const ask = u.active ? `Deactivate ${u.full_name}? They will no longer be able to log in.` : `Reactivate ${u.full_name}?`
    if (!(await approve(ask))) return
    setBusy(true)
    try {
      await updateUser(u.id, { ...toUserForm(u), active: !u.active })
      setError('')
      await onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return { activity, error, busy, isMe: me?.id === u.id, toggleActive, sheet }
}
