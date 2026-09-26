import { useEffect, useState } from 'react'
import { getOrderMachines, listMachines, MACHINE_TYPE_LABEL, machineName, machineStatus } from '../db/machines'
import type { Machine, MachineStatus, MachineType } from '../types'
import { I, Icon } from './Icons'
import { Sheet } from './Sheet'

export type OrderMachines = Awaited<ReturnType<typeof getOrderMachines>>

export const MACHINE_TONE: Record<MachineStatus, { tile: string; badge: string }> = {
  available: { tile: 'bg-emerald-50 text-emerald-600', badge: 'bg-emerald-50 text-emerald-700' },
  in_use: { tile: 'bg-blue-600 text-white', badge: 'bg-blue-50 text-blue-700' },
  done: { tile: 'bg-amber-50 text-amber-600', badge: 'bg-amber-50 text-amber-800' },
  out_of_service: { tile: 'bg-slate-100 text-slate-400', badge: 'bg-red-50 text-red-600' },
}

export const time = (iso: string) => new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })

/**
 * Bottom sheet listing only the Available machines of one type: pick one, then Start Machine. The machine's preset
 * cycle length sets the timer; staff never enter a duration.
 */
export function MachinePicker({ type, title, onPick, onClose }: {
  type: MachineType
  title: string
  onPick: (m: Machine) => Promise<void>
  onClose: () => void
}) {
  const [rows, setRows] = useState<Machine[] | null>(null)
  const [picked, setPicked] = useState<Machine | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const refresh = () => listMachines(type).then((r) => {
    const free = r.filter((m) => machineStatus(m) === 'available')
    setRows(free)
    setPicked((p) => (p && free.find((m) => m.id === p.id)) ?? (free.length === 1 ? free[0] : null))
  })
  useEffect(() => { refresh().catch(() => setRows([])) }, [type]) // eslint-disable-line react-hooks/exhaustive-deps

  async function start() {
    if (busy || !picked) return
    setBusy(true)
    try {
      await onPick(picked)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
      refresh() // it may have just been taken
      setBusy(false)
    }
  }

  const noun = MACHINE_TYPE_LABEL[type].toLowerCase()
  const endsAt = picked ? time(new Date(Date.now() + picked.cycle_minutes * 60_000).toISOString()) : ''
  return (
    <Sheet label={title} onClose={onClose}>
      {error && <p role="alert" className="mb-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</p>}
      {rows === null ? (
        <div className="grid grid-cols-3 gap-2.5">{[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100" />)}</div>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">No available {noun}s right now. Unload a finished {noun} or ask an admin to add one on the Machines page.</p>
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-500">Select an available {noun}</p>
          <div role="radiogroup" aria-label={`Available ${noun}s`} className="grid grid-cols-3 gap-2.5">
            {rows.map((m) => {
              const on = picked?.id === m.id
              return (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={busy}
                  onClick={() => { setPicked(m); setError('') }}
                  className={`relative flex min-h-24 flex-col items-center justify-center gap-1 rounded-2xl border p-2 text-center transition disabled:opacity-60 ${
                    on ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-200' : 'border-slate-200 bg-white active:bg-blue-50'
                  }`}
                >
                  {on && <Icon className="absolute right-2 top-2 h-4 w-4 text-blue-600">{I.check}</Icon>}
                  <span className="text-xl font-bold tabular-nums text-slate-900">{m.code}</span>
                  <span className={`flex items-center gap-1 text-xs font-semibold tabular-nums ${on ? 'text-blue-700' : 'text-slate-500'}`}>
                    <Icon className="h-3.5 w-3.5">{I.clock}</Icon>{m.cycle_minutes} min
                  </span>
                  {m.notes && <span className="line-clamp-1 text-[11px] text-slate-500">{m.notes}</span>}
                </button>
              )
            })}
          </div>
          <button
            type="button"
            onClick={start}
            disabled={busy || !picked}
            className="mt-5 flex min-h-14 w-full flex-col items-center justify-center rounded-2xl bg-blue-600 px-4 font-semibold text-white shadow-sm shadow-blue-600/30 active:bg-blue-700 disabled:bg-blue-300 disabled:shadow-none"
          >
            <span className="flex items-center gap-2 text-base"><Icon className="h-5 w-5">{I.flash}</Icon>{busy ? 'Starting…' : picked ? `Start ${machineName(picked.code, picked.type)}` : 'Start Machine'}</span>
            {picked && !busy && <span className="text-xs font-medium text-blue-100">{picked.cycle_minutes} min · done at {endsAt}</span>}
          </button>
        </>
      )}
      <button type="button" onClick={onClose} className="mt-3 min-h-13 w-full rounded-2xl border border-blue-200 bg-white font-semibold text-blue-600 active:bg-blue-50">
        Cancel
      </button>
    </Sheet>
  )
}
