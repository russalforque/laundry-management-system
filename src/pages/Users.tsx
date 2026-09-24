import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { createUser, listUsers, updateUser } from '../db/users'
import type { Role, User } from '../types'
import { inputCls } from '../components/ui'

interface Form {
  id?: number
  username: string
  fullName: string
  role: Role
  active: boolean
  password: string
}

const blank: Form = { username: '', fullName: '', role: 'cashier', active: true, password: '' }

export default function Users() {
  const [users, setUsers] = useState<User[]>([])
  const [form, setForm] = useState<Form | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(() => listUsers().then(setUsers), [])
  useEffect(() => { load() }, [load])

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!form) return
    try {
      if (form.id) await updateUser(form.id, { ...form, newPassword: form.password || undefined })
      else await createUser(form)
      setForm(null); setError('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed.')
    }
  }

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => f && { ...f, [k]: v })

  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Users</h1>
        <button onClick={() => { setForm(blank); setError('') }} className="rounded-lg bg-sky-600 px-4 py-3 font-semibold text-white active:bg-sky-700">+ Add user</button>
      </div>

      {form && (
        <form onSubmit={save} className="mb-4 space-y-3 rounded-xl bg-white p-4 shadow-sm">
          <h2 className="font-semibold">{form.id ? 'Edit user' : 'New user'}</h2>
          <input className={inputCls} placeholder="Full name" value={form.fullName} onChange={(e) => set('fullName', e.target.value)} required />
          <input className={inputCls} placeholder="Username" autoCapitalize="none" value={form.username} onChange={(e) => set('username', e.target.value)} required />
          <select className={inputCls} value={form.role} onChange={(e) => set('role', e.target.value as Role)}>
            <option value="admin">Admin</option>
            <option value="manager">Manager</option>
            <option value="cashier">Cashier</option>
          </select>
          <input className={inputCls} type="password" autoComplete="new-password" placeholder={form.id ? 'New password (leave blank to keep)' : 'Password'} value={form.password} onChange={(e) => set('password', e.target.value)} required={!form.id} />
          {form.id && (
            <label className="flex items-center gap-2">
              <input type="checkbox" className="h-5 w-5" checked={form.active} onChange={(e) => set('active', e.target.checked)} /> Active
            </label>
          )}
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button className="flex-1 rounded-lg bg-sky-600 py-3 font-semibold text-white active:bg-sky-700">Save</button>
            <button type="button" onClick={() => setForm(null)} className="flex-1 rounded-lg bg-slate-200 py-3 font-semibold active:bg-slate-300">Cancel</button>
          </div>
        </form>
      )}

      <ul className="divide-y divide-slate-100 rounded-xl bg-white shadow-sm">
        {users.map((u) => (
          <li key={u.id} className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <div className="truncate font-medium">{u.full_name} {!u.active && <span className="text-xs text-slate-400">(disabled)</span>}</div>
              <div className="text-sm capitalize text-slate-500">{u.username} · {u.role}</div>
            </div>
            <button onClick={() => { setForm({ id: u.id, username: u.username, fullName: u.full_name, role: u.role, active: !!u.active, password: '' }); setError('') }} className="rounded-lg bg-slate-100 px-4 py-2 font-medium active:bg-slate-200">Edit</button>
          </li>
        ))}
      </ul>
    </div>
  )
}
