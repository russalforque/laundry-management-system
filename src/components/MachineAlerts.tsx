import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { cycleDone, listOpenCycles, machineEvents } from '../db/machines'
import { doneText, onAlertTap, syncMachineAlerts, type Cycle } from '../lib/machineAlerts'
import { I, Icon } from './Icons'

/**
 * Mounted once while someone is signed in. Keeps device notifications in step with the machines (at sign-in, on every
 * machine change and each return to the foreground) and, while the app is open, shows "Laundry Finished" the moment a
 * cycle's time is up. Cycles that were already done when the app opened are not announced again: the device
 * notification covered those.
 */
export function MachineAlerts() {
  const navigate = useNavigate()
  const [alerts, setAlerts] = useState<Cycle[]>([])
  const running = useRef(new Set<number>()) // cycles seen running; announced once they finish
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    let alive = true
    let cycles: Cycle[] = []

    const check = () => {
      clearTimeout(timer.current)
      const now = Date.now()
      const finished = cycles.filter((c) => running.current.has(c.id) && cycleDone(c.expected_end_at, now))
      if (finished.length) {
        finished.forEach((c) => running.current.delete(c.id))
        setAlerts((a) => [...a.filter((x) => !finished.some((f) => f.id === x.id)), ...finished])
        navigator.vibrate?.([200, 100, 200])
      }
      const next = Math.min(...cycles.filter((c) => running.current.has(c.id)).map((c) => Date.parse(c.expected_end_at!)))
      if (Number.isFinite(next)) timer.current = setTimeout(check, Math.max(250, next - now + 250))
    }

    const load = async () => {
      try {
        cycles = await listOpenCycles()
      } catch {
        return
      }
      if (!alive) return
      const now = Date.now()
      const open = new Set(cycles.map((c) => c.id))
      for (const id of running.current) if (!open.has(id)) running.current.delete(id) // unloaded or moved
      for (const c of cycles) if (!cycleDone(c.expected_end_at, now)) running.current.add(c.id)
      setAlerts((a) => a.filter((x) => open.has(x.id))) // drop banners for machines already unloaded
      check()
    }

    const refresh = () => { load(); syncMachineAlerts() }
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    refresh()
    machineEvents.addEventListener('change', refresh)
    document.addEventListener('visibilitychange', onVisible)
    const offTap = onAlertTap((orderId) => navigate(`/orders/${orderId}?step=3`))
    return () => {
      alive = false
      clearTimeout(timer.current)
      machineEvents.removeEventListener('change', refresh)
      document.removeEventListener('visibilitychange', onVisible)
      offTap()
    }
  }, [navigate])

  if (!alerts.length) return null
  const dismiss = (id: number) => setAlerts((a) => a.filter((x) => x.id !== id))
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex flex-col items-center gap-2 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
      {alerts.slice(-3).map((c) => (
        <div
          key={c.id}
          role="alert"
          className="pointer-events-auto flex w-full max-w-md animate-toast-in items-center gap-3 rounded-2xl border border-blue-100 bg-white p-3 shadow-lg shadow-blue-900/10"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600">
            <Icon className="h-6 w-6">{I.bell}</Icon>
          </span>
          <Link to={`/orders/${c.order_id}?step=3`} onClick={() => dismiss(c.id)} className="min-w-0 flex-1 py-0.5">
            <span className="block text-[15px] font-bold text-slate-900">Laundry Finished</span>
            <span className="block text-sm leading-snug text-slate-600">{doneText(c)}</span>
            <span className="mt-0.5 block text-xs font-semibold text-blue-600">Open to unload</span>
          </Link>
          <button type="button" onClick={() => dismiss(c.id)} aria-label="Dismiss" className="grid size-11 shrink-0 place-items-center rounded-xl text-slate-400 active:bg-slate-100">
            <Icon className="h-5 w-5">{I.x}</Icon>
          </button>
        </div>
      ))}
    </div>
  )
}
