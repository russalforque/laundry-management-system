import { useState } from 'react'
import { cycleDone, MACHINE_TYPE_LABEL, machineName } from '../../db/machines'
import type { MachineAssignment, MachineType, OrderStatus } from '../../types'
import { I, Icon } from '../Icons'
import { time, type OrderMachines } from '../MachinePanel'
import { CycleTimer, useNow } from '../MachineTimer'
import { InfoNote, outline, panel, PanelHead, soft, solid } from './shared'

const END_REASON: Record<NonNullable<MachineAssignment['end_reason']>, string> = {
  finished: 'Unloaded',
  changed: 'Moved to another machine',
  status: 'Ended by a status change',
}

const PROCESS: Record<MachineType, string> = { washer: 'Wash', dryer: 'Dry' }

const minutes = (a: MachineAssignment) => {
  const m = Math.round((new Date(a.ended_at!).getTime() - new Date(a.started_at).getTime()) / 60000)
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`
}

/** The machine the order is in now: big countdown while it runs, Done once the preset time is up. */
function LiveCycle({ a, now }: { a: MachineAssignment; now: number }) {
  const done = cycleDone(a.expected_end_at, now)
  return (
    <div className={`rounded-3xl border p-4 transition-colors ${done ? 'border-amber-200 bg-amber-50/60' : 'border-blue-200 bg-blue-50/50'}`}>
      <div className="flex items-center gap-3">
        <span className={`grid size-12 shrink-0 place-items-center rounded-2xl ${done ? 'bg-amber-500 text-white' : 'bg-blue-600 text-white'}`}>
          <Icon className="h-7 w-7">{done ? I.bell : I.washer}</Icon>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-lg font-bold text-slate-900">{machineName(a.machine_code, a.machine_type)}</span>
          <span className="block text-sm text-slate-500">
            {PROCESS[a.machine_type]}{a.duration_minutes ? ` · ${a.duration_minutes} min cycle` : ''} · started {time(a.started_at)}
          </span>
        </span>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${done ? 'bg-amber-100 text-amber-800' : 'bg-blue-600 text-white'}`}>
          {done ? 'Done' : 'In Use'}
        </span>
      </div>
      <div className="mt-4" aria-live="polite">
        <CycleTimer cycle={a} now={now} />
      </div>
    </div>
  )
}

/** One machine the order used: code, type, start and end time; details on tap. */
function MachineCard({ a }: { a: MachineAssignment }) {
  const [open, setOpen] = useState(false)
  return (
    <li className={`${panel} overflow-hidden`}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-h-18 w-full items-center gap-3.5 p-3.5 text-left active:bg-slate-50">
        <span className="grid size-13 shrink-0 place-items-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600">
          <Icon className="h-7 w-7">{I.washer}</Icon>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-slate-900">{a.machine_code} - {MACHINE_TYPE_LABEL[a.machine_type]}</span>
          <span className="block text-sm tabular-nums text-slate-500">{time(a.started_at)} – {time(a.ended_at!)}</span>
        </span>
        <Icon className={`h-5 w-5 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}>{I.chevronDown}</Icon>
      </button>
      {open && (
        <dl className="animate-reveal space-y-1.5 border-t border-slate-100 bg-slate-50/60 px-4 py-3 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-slate-500">Started</dt><dd className="text-right text-slate-900">{new Date(a.started_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}</dd></div>
          {a.user_name && <div className="flex justify-between gap-3"><dt className="text-slate-500">Assigned by</dt><dd className="truncate text-right text-slate-900">{a.user_name}</dd></div>}
          {a.duration_minutes != null && <div className="flex justify-between gap-3"><dt className="text-slate-500">Preset cycle</dt><dd className="text-slate-900">{a.duration_minutes} min</dd></div>}
          <div className="flex justify-between gap-3"><dt className="text-slate-500">In machine</dt><dd className="text-slate-900">{minutes(a)}</dd></div>
          {a.end_reason && <div className="flex justify-between gap-3"><dt className="text-slate-500">Ended</dt><dd className="text-right text-slate-900">{END_REASON[a.end_reason]}</dd></div>}
        </dl>
      )}
    </li>
  )
}

export function MachinesStep({ machines, status, busy, onAssign, onUnload, onMarkReady }: {
  machines: OrderMachines
  status: OrderStatus
  busy: boolean
  onAssign: (type: MachineType, title: string) => void
  onUnload: () => void
  onMarkReady: () => void
}) {
  const now = useNow()
  const { current, history } = machines
  const past = history.filter((a) => a.ended_at)
  const washed = status === 'washing' && !current
  const done = !!current && cycleDone(current.expected_end_at, now)

  // What the machine button does right now; the database re-checks every move.
  const assign: { type: MachineType; label: string; title: string; icon: typeof I.plus } | null =
    status === 'received' ? { type: 'washer', label: 'Start Washer', title: 'Start Washing', icon: I.plus }
    : washed ? { type: 'dryer', label: 'Start Dryer', title: 'Move to Dryer', icon: I.plus }
    : current && !done ? { type: current.machine_type, label: `Change ${MACHINE_TYPE_LABEL[current.machine_type]}`, title: `Change ${MACHINE_TYPE_LABEL[current.machine_type]}`, icon: I.refresh }
    : null

  const empty = status === 'received' ? 'Not in a machine yet. Start a washer — its preset timer runs automatically.'
    : status === 'cancelled' ? 'This order was cancelled before it used a machine.'
    : 'No machines were recorded for this order.'

  return (
    <section className={`${panel} space-y-4 p-4 sm:p-5`}>
      <PanelHead title="Machine Assignment" sub="Select a machine and start. Its preset timer runs automatically." />

      {current && <LiveCycle a={current} now={now} />}

      {done && (
        <button type="button" onClick={onUnload} disabled={busy} className={`${solid} min-h-13 w-full text-base`}>
          <Icon className="h-5 w-5">{I.check}</Icon>{busy ? 'Saving…' : 'Mark as Unloaded'}
        </button>
      )}

      {washed && <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Washing done — move it to a dryer, or mark it ready if no drying is needed.</p>}

      {assign && (
        <button type="button" onClick={() => onAssign(assign.type, assign.title)} disabled={busy} className={current ? outline : `${soft} w-full`}>
          <Icon className="h-5 w-5">{assign.icon}</Icon>{assign.label}
        </button>
      )}

      {washed && (
        <button type="button" onClick={onMarkReady} disabled={busy} className="min-h-11 w-full rounded-2xl text-sm font-semibold text-blue-600 active:bg-blue-50 disabled:opacity-50">
          No drying needed? Mark Ready
        </button>
      )}

      {past.length ? (
        <div className="space-y-2">
          {current && <p className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Earlier</p>}
          <ul className="space-y-3">{past.map((a) => <MachineCard key={a.id} a={a} />)}</ul>
        </div>
      ) : !current && (
        <p className="flex items-center gap-3 rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">
          <Icon className="h-6 w-6 shrink-0 text-slate-300">{I.washer}</Icon>{empty}
        </p>
      )}

      <InfoNote>{current && !done ? 'You’ll get a “Laundry Finished” alert when the timer ends, even if the app is closed.' : 'Machine times are recorded automatically.'}</InfoNote>
    </section>
  )
}
