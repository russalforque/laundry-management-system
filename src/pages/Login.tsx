import { useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await login(username, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.')
      setBusy(false)
    }
  }

  const input = 'w-full rounded-lg border border-slate-300 px-4 py-3 text-base outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-200'

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Sellix Laundry</h1>
          <p className="text-sm text-slate-500">Sign in to continue</p>
        </div>
        <input className={input} placeholder="Username" autoCapitalize="none" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        <input className={input} type="password" placeholder="Password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button disabled={busy} className="w-full rounded-lg bg-sky-600 py-3 font-semibold text-white active:bg-sky-700 disabled:opacity-60">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
