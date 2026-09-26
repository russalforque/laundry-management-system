import { useEffect, useState } from 'react'
import { cycleDone } from '../db/machines'
import { time } from './MachinePanel'

/**
 * Current time for countdowns. The interval only repaints: remaining time is always expected_end_at - now, so a
 * throttled or paused timer (background, sleep) never drifts, and coming back to the app catches up at once.
 */
export function useNow(everyMs = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const id = setInterval(tick, everyMs)
    const onVisible = () => { if (document.visibilityState === 'visible') tick() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible) }
  }, [everyMs])
  return now
}

/** 2279s → "37:59", 3912s → "1:05:12". Rounds up, so a running cycle never reads 0:00. */
export function formatRemaining(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(s / 3600)
  const mm = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`
}

/** Spoken form for screen readers: "37 minutes remaining". */
const spoken = (ms: number) => {
  const m = Math.ceil(ms / 60_000)
  return m <= 1 ? 'Less than a minute remaining' : `${m} minutes remaining`
}

export interface Cycle {
  started_at: string
  expected_end_at: string | null
}

/**
 * Large countdown, progress and "Done at 3:42 PM" for a running cycle; a Done notice once time is up.
 * `size` sm fits a machine tile, lg the order's machine card.
 */
export function CycleTimer({ cycle, now, size = 'lg' }: { cycle: Cycle; now: number; size?: 'sm' | 'lg' }) {
  const end = cycle.expected_end_at
  if (cycleDone(end, now)) {
    return (
      <p className={`font-semibold text-amber-700 ${size === 'lg' ? 'text-base' : 'text-sm'}`}>
        Cycle finished{end ? ` at ${time(end)}` : ''} — ready to unload
      </p>
    )
  }
  const start = Date.parse(cycle.started_at)
  const stop = Date.parse(end!)
  const left = stop - now
  const pct = Math.min(100, Math.max(0, ((now - start) / (stop - start)) * 100))
  return (
    <div>
      <p className="flex items-baseline gap-1.5">
        <span
          role="timer"
          aria-label={spoken(left)}
          className={`font-bold leading-none tracking-tight tabular-nums text-blue-700 ${size === 'lg' ? 'text-5xl' : 'text-3xl'}`}
        >
          {formatRemaining(left)}
        </span>
        <span className="text-sm font-medium text-slate-500">remaining</span>
      </p>
      <div
        role="progressbar"
        aria-label="Cycle progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        className={`overflow-hidden rounded-full bg-blue-100 ${size === 'lg' ? 'mt-3 h-2' : 'mt-2.5 h-1.5'}`}
      >
        <div className="h-full rounded-full bg-blue-600 transition-[width] duration-1000 ease-linear motion-reduce:transition-none" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1.5 text-xs tabular-nums text-slate-500">Done at {time(end!)}</p>
    </div>
  )
}
