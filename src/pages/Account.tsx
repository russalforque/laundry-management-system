import { useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { inputCls } from '../components/ui'
import { changePassword } from '../db/users'

export default function Account() {
  const { user } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (next !== confirm) return setMsg({ ok: false, text: 'New passwords do not match.' })
    try {
      await changePassword(user!.id, current, next)
      setCurrent(''); setNext(''); setConfirm('')
      setMsg({ ok: true, text: 'Password changed.' })
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Failed.' })
    }
  }

  return (
    <div className="max-w-md">
      <h1 className="text-2xl font-bold text-slate-900">My Account</h1>
      <p className="mb-4 text-slate-500">{user?.full_name} · {user?.username} · <span className="capitalize">{user?.role}</span></p>
      <form onSubmit={submit} className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold">Change password</h2>
        <input className={inputCls} type="password" placeholder="Current password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        <input className={inputCls} type="password" placeholder="New password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required />
        <input className={inputCls} type="password" placeholder="Confirm new password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        {msg && <p role="alert" className={msg.ok ? 'text-sm text-green-600' : 'text-sm text-red-600'}>{msg.text}</p>}
        <button className="w-full rounded-lg bg-sky-600 py-3 font-semibold text-white active:bg-sky-700">Update password</button>
      </form>
    </div>
  )
}
