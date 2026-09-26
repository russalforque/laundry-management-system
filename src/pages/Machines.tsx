import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AppHeader } from '../components/AppHeader'
import { Toggle } from '../components/Controls'
import { I, Icon } from '../components/Icons'
import { MACHINE_TONE, time } from '../components/MachinePanel'
import { card, EmptyCard, Field, field, FilterTabs, primary } from '../components/Manage'
import { Sheet } from '../components/Sheet'
import { fabPos } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import {
  createMachine, deleteMachine, listMachines, MACHINE_PREFIX, MACHINE_STATUS_LABEL, MACHINE_TYPE_LABEL, machineStatus, nextMachineCode, updateMachine,
} from '../db/machines'
import type { Machine, MachineType } from '../types'

const TABS: { id: MachineType; label: string }[] = [
  { id: 'washer', label: 'Washers' },
  { id: 'dryer', label: 'Dryers' },
]

interface Form {
  id?: number
  type: MachineType
  code: string
  notes: string
  outOfService: boolean
  inUse: boolean
}

function MachineCard({ m, onEdit }: { m: Machine; onEdit?: () => void }) {
  const st = machineStatus(m)
  const tone = MACHINE_TONE[st]
  const body = (
    <>
      <span className={`grid size-14 shrink-0 place-items-center rounded-2xl text-lg font-bold tabular-nums ${tone.tile}`}>{m.code}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="font-bold text-slate-900">{m.code}</span>
          <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone.badge}`}>{MACHINE_STATUS_LABEL[st]}</span>
        </span>
        {m.order_id ? (
          <>
            <span className="mt-0.5 block truncate text-sm font-medium text-slate-700">#{m.order_number} · {m.customer_name}</span>
            <span className="block text-xs text-slate-500">Since {time(m.started_at!)}</span>
          </>
        ) : (
          <span className="mt-0.5 block truncate text-sm text-slate-500">{m.notes || (st === 'available' ? 'Ready for the next load' : 'Not available for orders')}</span>
        )}
      </span>
    </>
  )
  return (
    <div className={`${card} flex items-center gap-2 p-3 sm:p-4 ${st === 'out_of_service' ? 'opacity-75' : ''}`}>
      {m.order_id ? (
        <Link to={`/orders/${m.order_id}`} className="-m-1 flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1 active:bg-slate-50">
          {body}
          <Icon className="h-5 w-5 text-slate-400">{I.chevron}</Icon>
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{body}</div>
      )}
      {onEdit && (
        <button type="button" onClick={onEdit} aria-label={`Edit ${m.code}`} className="-mr-1 grid size-11 shrink-0 place-items-center rounded-full text-slate-500 active:bg-slate-100">
          <Icon className="h-5 w-5">{I.pencil}</Icon>
        </button>
      )}
    </div>
  )
}

function MachineForm({ initial, onDone, onClose }: { initial: Form; onDone: () => void; onClose: () => void }) {
  const [form, setForm] = useState(initial)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))
  const label = MACHINE_TYPE_LABEL[form.type]

  async function act(fn: () => Promise<unknown>) {
    setBusy(true)
    try {
      await fn()
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed.')
      setBusy(false)
    }
  }

  function save(e: FormEvent) {
    e.preventDefault()
    act(() => (form.id ? updateMachine(form.id, form) : createMachine(form.type, form)))
  }

  function remove() {
    if (!confirm(`Delete ${form.code}? Past orders keep their machine history.`)) return
    act(() => deleteMachine(form.id!))
  }

  return (
    <Sheet label={form.id ? `Edit ${initial.code}` : `Add ${label}`} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Machine Number" icon={I.washer} required>
          <input
            className={`${field} uppercase`}
            value={form.code}
            onChange={(e) => set('code', e.target.value)}
            placeholder={`${MACHINE_PREFIX[form.type]}01`}
            disabled={form.inUse}
            required
          />
        </Field>
        <Field label="Notes" icon={I.note}>
          <input className={field} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="e.g. 8 kg front-load (optional)" />
        </Field>
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 p-3">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-slate-800">Out of Service</span>
            <span className="block text-xs text-slate-500">{form.inUse ? 'Finish or move the order in this machine first.' : 'Hide it from staff when assigning orders.'}</span>
          </span>
          <Toggle on={form.outOfService} onChange={(v) => set('outOfService', v)} label="Out of Service" disabled={form.inUse} />
        </div>
        {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">{error}</p>}
        <button disabled={busy} className={`${primary} min-h-13 w-full rounded-2xl text-base`}>{busy ? 'Saving…' : `Save ${label}`}</button>
        {form.id && (
          <button
            type="button"
            onClick={remove}
            disabled={busy || form.inUse}
            className="flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 font-semibold text-red-600 active:bg-red-100 disabled:opacity-50"
          >
            <Icon className="h-5 w-5">{I.trash}</Icon>Delete {label}
          </button>
        )}
      </form>
    </Sheet>
  )
}

export default function Machines() {
  const { can } = useAuth()
  const isAdmin = can('machines.configure')
  const [tab, setTab] = useState<MachineType>('washer')
  const [rows, setRows] = useState<Machine[] | null>(null)
  const [form, setForm] = useState<Form | null>(null)

  const load = useCallback(() => listMachines().then(setRows), [])
  useEffect(() => { load() }, [load])

  const list = (rows ?? []).filter((m) => m.type === tab)
  const count = (s: ReturnType<typeof machineStatus>) => list.filter((m) => machineStatus(m) === s).length
  const tabs = TABS.map((t) => ({ ...t, label: `${t.label} (${(rows ?? []).filter((m) => m.type === t.id).length})` }))

  const edit = (m: Machine) =>
    setForm({ id: m.id, type: m.type, code: m.code, notes: m.notes, outOfService: !!m.out_of_service, inUse: !!m.order_id })
  const add = async () => setForm({ type: tab, code: await nextMachineCode(tab), notes: '', outOfService: false, inUse: false })

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-28">
      <div className="md:hidden"><AppHeader /></div>

      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Machines</h1>
        <p className="mt-1 text-sm text-slate-500">
          {rows ? `${count('available')} available · ${count('in_use')} in use · ${count('out_of_service')} out of service` : 'Washers and dryers at a glance'}
        </p>
      </div>

      <FilterTabs options={tabs} value={tab} onChange={setTab} label="Machine type" />

      {rows === null ? (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-22 animate-pulse rounded-2xl bg-slate-200/60" />)}</div>
      ) : list.length === 0 ? (
        <div className={card}>
          <EmptyCard icon={I.washer} title={`No ${TABS.find((t) => t.id === tab)!.label.toLowerCase()} yet`} text={isAdmin ? 'Tap + to add one.' : 'Ask an admin to add machines.'} />
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {list.map((m) => <li key={m.id}><MachineCard m={m} onEdit={isAdmin ? () => edit(m) : undefined} /></li>)}
        </ul>
      )}

      {isAdmin && (
        <button
          type="button"
          onClick={add}
          aria-label={`Add ${MACHINE_TYPE_LABEL[tab]}`}
          className={`${fabPos} grid size-14 place-items-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-600/30 transition active:scale-95 active:bg-blue-700`}
        >
          <Icon className="h-7 w-7">{I.plus}</Icon>
        </button>
      )}

      {form && (
        <MachineForm
          key={form.id ?? `new-${form.type}`}
          initial={form}
          onClose={() => setForm(null)}
          onDone={() => { setForm(null); load() }}
        />
      )}
    </div>
  )
}
