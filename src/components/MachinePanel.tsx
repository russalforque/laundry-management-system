import { useEffect, useState } from 'react'
import { getOrderMachines, listMachines, MACHINE_TYPE_LABEL, machineStatus } from '../db/machines'
import type { Machine, MachineStatus, MachineType, OrderStatus } from '../types'
import { I, Icon } from './Icons'
import { card } from './Manage'
import { Sheet } from './Sheet'

export type OrderMachines = Awaited<ReturnType<typeof getOrderMachines>>

export const MACHINE_TONE: Record<MachineStatus, { tile: string; badge: string }> = {
  available: { tile: 'bg-emerald-50 text-emerald-600', badge: 'bg-emerald-50 text-emerald-700' },
  in_use: { tile: 'bg-blue-600 text-white', badge: 'bg-blue-50 text-blue-700' },
  out_of_service: { tile: 'bg-slate-100 text-slate-400', badge: 'bg-red-50 text-red-600' },
}

export const time = (iso: string) => new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })

/** Bottom sheet listing only the Available machines of one type. */
export function MachinePicker({ type, title, onPick, onClose }: {
  type: MachineType
  title: string
  onPick: (m: Machine) => Promise<void>
  onClose: () => void
}) {
  const [rows, setRows] = useState<Machine[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const refresh = () => listMachines(type).then((r) => setRows(r.filter((m) => machineStatus(m) === 'available')))
  useEffect(() => { refresh().catch(() => setRows([])) }, [type]) // eslint-disable-line react-hooks/exhaustive-deps

  async function pick(m: Machine) {
    if (busy) return
    setBusy(true)
    try {
      await onPick(m)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed.')
      refresh() // it may have just been taken
      setBusy(false)
    }
  }

  const noun = MACHINE_TYPE_LABEL[type].toLowerCase()
  return (
    <Sheet label={title} onClose={onClose}>
      {error && <p role="alert" className="mb-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</p>}
      {rows === null ? (
        <div className="grid grid-cols-3 gap-2.5">{[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100" />)}</div>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">No available {noun}s right now. Finish a {noun} cycle or ask an admin to add one on the Machines page.</p>
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-500">Available {noun}s</p>
          <div className="grid grid-cols-3 gap-2.5">
            {rows.map((m) => (
              <button
                key={m.id}
                type="button"
                disabled={busy}
                onClick={() => pick(m)}
                className="flex min-h-24 flex-col items-center justify-center gap-1 rounded-2xl border border-slate-200 bg-white p-2 text-center transition active:bg-blue-50 disabled:opacity-60"
              >
                <span className="text-xl font-bold tabular-nums text-slate-900">{m.code}</span>
                {m.notes && <span className="line-clamp-1 text-[11px] text-slate-500">{m.notes}</span>}
              </button>
            ))}
          </div>
        </>
      )}
      <button type="button" onClick={onClose} className="mt-5 min-h-13 w-full rounded-2xl border border-blue-200 bg-white font-semibold text-blue-600 active:bg-blue-50">
        Cancel
      </button>
    </Sheet>
  )
}

/** Machine the order is in (or why it's in none), Change Machine, and the order's machine history. */
export function MachinePanel({ machines, status, onChangeMachine }: {
  machines: OrderMachines
  status: OrderStatus
  onChangeMachine: (type: MachineType) => void
}) {
  const { current, history } = machines
  const past = history.filter((a) => a.ended_at)
  if (!current && past.length === 0 && status !== 'received') return null

  let idle = 'Not in a machine yet — tap Start Washing.'
  if (status === 'washing') idle = 'Washing done — move it to a dryer, or mark it ready if no drying is needed.'
  else if (status !== 'received') idle = 'No machine assigned.'

  return (
    <section>
      <h3 className="mb-2.5 text-base font-semibold text-slate-900">Machine</h3>
      <div className={`${card} space-y-3 p-4`}>
        <div className="flex items-center gap-4">
          <span className={`grid size-14 shrink-0 place-items-center rounded-2xl ${current ? MACHINE_TONE.in_use.tile : 'bg-slate-100 text-slate-400'}`}>
            {current ? <span className="text-lg font-bold tabular-nums">{current.machine_code}</span> : <Icon className="h-7 w-7">{I.washer}</Icon>}
          </span>
          <div className="min-w-0 flex-1">
            {current ? (
              <>
                <p className="font-semibold text-slate-900">{MACHINE_TYPE_LABEL[current.machine_type]} {current.machine_code} · In Use</p>
                <p className="text-sm text-slate-500">{current.machine_type === 'washer' ? 'Washing' : 'Drying'} since {time(current.started_at)}</p>
              </>
            ) : (
              <p className="text-sm text-slate-600">{idle}</p>
            )}
          </div>
          {current && (
            <button
              type="button"
              onClick={() => onChangeMachine(current.machine_type)}
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-blue-200 bg-white px-3 text-sm font-semibold text-blue-600 active:bg-blue-50"
            >
              <Icon className="h-4 w-4">{I.refresh}</Icon>Change
            </button>
          )}
        </div>
        {past.length > 0 && (
          <ul className="space-y-1 border-t border-slate-100 pt-3 text-xs text-slate-500">
            {past.map((a) => (
              <li key={a.id} className="flex justify-between gap-2">
                <span><b className="font-semibold text-slate-700">{a.machine_code}</b> · {MACHINE_TYPE_LABEL[a.machine_type]}{a.end_reason === 'changed' ? ' (changed)' : ''}</span>
                <span className="tabular-nums">{time(a.started_at)} – {time(a.ended_at!)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
