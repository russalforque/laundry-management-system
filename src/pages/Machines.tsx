import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AppHeader } from '../components/AppHeader'
import { Toggle } from '../components/Controls'
import { I, Icon } from '../components/Icons'
import { CycleTimer, useNow } from '../components/MachineTimer'
import { card, EmptyCard, Field, field, FilterTabs, primary } from '../components/Manage'
import { NumberInput } from '../components/NumberInput'
import { Sheet } from '../components/Sheet'
import { FloatingToast, type Msg } from '../components/Toast'
import { fabPos } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import {
  createMachine, CYCLE_MAX, CYCLE_MIN, deleteMachine, listMachines, MACHINE_PREFIX, MACHINE_STATUS_LABEL, MACHINE_TYPE_LABEL, machineEvents, machineName,
  machineStatus, nextMachineCode, unloadMachine, updateMachine,
} from '../db/machines'
import { exactAlarmsAllowed, openExactAlarmSettings } from '../lib/machineAlerts'
import { parseNumber } from '../lib/number'
import type { Machine, MachineStatus, MachineType } from '../types'

const TABS: { id: MachineType; label: string }[] = [
  { id: 'washer', label: 'Washers' },
  { id: 'dryer', label: 'Dryers' },
]

/**
 * One look per status, used by the summary filters and the tiles alike. Each pairs color with an icon
 * and a text label, so status never depends on color alone.
 */
const STATUS_UI: Record<MachineStatus, { icon: ReactNode; dot: string; badge: string; count: string; on: string }> = {
  available: {
    icon: I.check,
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-50 text-emerald-700',
    count: 'text-emerald-700',
    on: 'border-emerald-300 bg-emerald-50 ring-2 ring-emerald-200',
  },
  in_use: {
    icon: I.washer,
    dot: 'bg-blue-600',
    badge: 'bg-blue-600 text-white',
    count: 'text-blue-700',
    on: 'border-blue-300 bg-blue-50 ring-2 ring-blue-200',
  },
  done: {
    icon: I.bell,
    dot: 'bg-amber-500',
    badge: 'bg-amber-100 text-amber-800',
    count: 'text-amber-700',
    on: 'border-amber-300 bg-amber-50 ring-2 ring-amber-200',
  },
  out_of_service: {
    icon: I.x,
    dot: 'bg-red-500',
    badge: 'bg-red-50 text-red-700',
    count: 'text-red-700',
    on: 'border-red-300 bg-red-50 ring-2 ring-red-200',
  },
}
const STATUSES: MachineStatus[] = ['available', 'in_use', 'done', 'out_of_service']
const PROCESS: Record<MachineType, string> = { washer: 'Wash', dryer: 'Dry' }
/** Suggested preset for a new machine. */
const DEFAULT_CYCLE: Record<MachineType, number> = { washer: 38, dryer: 40 }

interface Form {
  id?: number
  type: MachineType
  code: string
  notes: string
  outOfService: boolean
  /** Preset cycle length as typed. */
  cycle: string
  inUse: boolean
}

// ---------- summary ----------

/**
 * Status counts that double as filters: the numbers the floor needs ("how many free washers?")
 * and one tap to see just those machines. Tapping the active one shows all again.
 */
function StatusSummary({ counts, value, onChange }: {
  counts: Record<MachineStatus, number>
  value: MachineStatus | null
  onChange: (v: MachineStatus | null) => void
}) {
  return (
    <div role="group" aria-label="Filter by status" className="grid grid-cols-4 gap-2">
      {STATUSES.map((st) => {
        const ui = STATUS_UI[st]
        const on = value === st
        const n = counts[st]
        return (
          <button
            key={st}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? null : st)}
            className={`flex min-h-20 min-w-0 flex-col items-start justify-center rounded-2xl border px-2.5 py-2.5 text-left transition active:scale-[0.98] sm:px-3 ${
              on ? ui.on : 'border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.05)] active:bg-slate-50'
            }`}
          >
            <span className={`text-2xl font-bold tabular-nums ${n ? ui.count : 'text-slate-300'}`}>{n}</span>
            <span className="flex max-w-full items-center gap-1.5 text-xs font-semibold text-slate-600">
              <span className={`size-2 shrink-0 rounded-full ${ui.dot}`} aria-hidden />
              <span className="truncate">{MACHINE_STATUS_LABEL[st]}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ---------- tile ----------

/**
 * One machine as a floor tile: big number first (it matches the label on the machine), then status, then what's
 * inside. In Use shows the live countdown; Done asks staff to unload it. Admins get an edit button in the corner.
 */
function MachineTile({ m, now, onEdit, onUnload }: { m: Machine; now: number; onEdit?: () => void; onUnload?: () => void }) {
  const st = machineStatus(m, now)
  const ui = STATUS_UI[st]
  const loaded = st === 'in_use' || st === 'done'
  const out = st === 'out_of_service'

  const head = (
    <>
      <span className={`block pr-9 text-3xl font-bold leading-none tracking-tight tabular-nums ${out ? 'text-slate-400' : 'text-slate-900'}`}>{m.code}</span>
      <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={`inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${ui.badge}`}>
          <Icon className="h-3.5 w-3.5">{ui.icon}</Icon>
          <span className="truncate">{MACHINE_STATUS_LABEL[st]}</span>
        </span>
        {!loaded && <span className="text-xs font-medium tabular-nums text-slate-500">{m.cycle_minutes} min</span>}
      </span>
    </>
  )

  const shell = `relative flex h-full min-w-0 flex-col rounded-2xl border p-3.5 shadow-[0_1px_3px_rgba(15,23,42,0.05)] transition-colors ${
    st === 'in_use' ? 'border-blue-200 bg-blue-50/60'
    : st === 'done' ? 'border-amber-300 bg-amber-50/70'
    : out ? 'border-dashed border-slate-300 bg-slate-50'
    : 'border-slate-200/80 bg-white'
  }`

  return (
    <div className="relative h-full">
      {loaded ? (
        <div className={shell}>
          <Link
            to={`/orders/${m.order_id}?step=3`}
            aria-label={`${machineName(m.code, m.type)}, ${MACHINE_STATUS_LABEL[st]}: order ${m.order_number} for ${m.customer_name}. Open order`}
            className="-m-1 block min-w-0 rounded-xl p-1 active:bg-black/5"
          >
            {head}
            <span className={`mt-3 block min-w-0 border-t pt-2.5 ${st === 'done' ? 'border-amber-200' : 'border-blue-100'}`}>
              <span className="block truncate text-xs text-slate-500">#{m.order_number} · {PROCESS[m.type]}</span>
              <span className="block truncate text-sm font-semibold text-slate-900">{m.customer_name}</span>
            </span>
          </Link>
          <div className="mt-2.5 flex flex-1 flex-col justify-end">
            <CycleTimer cycle={{ started_at: m.started_at!, expected_end_at: m.expected_end_at }} now={now} size="sm" />
            {st === 'done' && onUnload && (
              <button
                type="button"
                onClick={onUnload}
                className="mt-2.5 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-2 text-sm font-semibold text-white shadow-sm shadow-blue-600/30 active:bg-blue-700"
              >
                <Icon className="h-4 w-4">{I.check}</Icon>Mark as Unloaded
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className={shell}>
          {head}
          <span className="mt-3 line-clamp-2 block text-sm text-slate-500">
            {m.notes || (out ? 'Not available for orders' : 'Empty — can take the next load')}
          </span>
        </div>
      )}
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${m.code}`}
          className="absolute right-1.5 top-1.5 grid size-11 place-items-center rounded-full text-slate-400 active:bg-slate-200/70 active:text-slate-700"
        >
          <Icon className="h-5 w-5">{I.pencil}</Icon>
        </button>
      )}
    </div>
  )
}

// ---------- form ----------

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
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
      setBusy(false)
    }
  }

  function save(e: FormEvent) {
    e.preventDefault()
    const cycleMinutes = parseNumber(form.cycle) ?? 0
    if (!(cycleMinutes >= CYCLE_MIN && cycleMinutes <= CYCLE_MAX)) {
      setError(`Enter a cycle duration from ${CYCLE_MIN} to ${CYCLE_MAX} minutes.`)
      return
    }
    const input = { ...form, cycleMinutes }
    act(() => (form.id ? updateMachine(form.id, input) : createMachine(form.type, input)))
  }

  function remove() {
    if (!confirm(`Delete ${form.code}? Past orders keep their machine history.`)) return
    act(() => deleteMachine(form.id!))
  }

  return (
    <Sheet label={form.id ? `Edit ${initial.code}` : `Add ${label}`} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        {form.inUse && (
          <p role="status" className="flex items-start gap-2 rounded-xl bg-blue-50 px-3 py-2.5 text-sm text-blue-900">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-blue-600">{I.info}</Icon>
            This {label.toLowerCase()} has an order inside. You can edit its notes and cycle duration (used from the next start); unload or move the order to change anything else.
          </p>
        )}
        <Field label="Machine number" icon={I.washer} required>
          <input
            className={`${field} uppercase`}
            value={form.code}
            onChange={(e) => set('code', e.target.value)}
            placeholder={`${MACHINE_PREFIX[form.type]}01`}
            autoCapitalize="characters"
            autoComplete="off"
            enterKeyHint="done"
            disabled={form.inUse}
            required
          />
        </Field>
        <Field label="Default cycle duration" icon={I.clock} required>
          <div className="relative">
            <NumberInput
              className={`${field} pr-20 tabular-nums`}
              value={form.cycle}
              onChange={(v) => set('cycle', v)}
              decimals={0}
              maxInt={3}
              placeholder={String(DEFAULT_CYCLE[form.type])}
              enterKeyHint="done"
              aria-describedby="cycle-help"
              required
            />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-500">minutes</span>
          </div>
          <span id="cycle-help" className="mt-1.5 block text-xs text-slate-500">Starts automatically when staff tap Start — they never enter a time.</span>
        </Field>
        <Field label="Notes" icon={I.note}>
          <input className={field} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="e.g. 8 kg front-load (optional)" enterKeyHint="done" />
        </Field>
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 p-3">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-slate-800">Active</span>
            <span className="block text-xs text-slate-500">{form.inUse ? 'Unload or move the order in this machine first.' : form.outOfService ? 'Inactive: hidden from staff when starting machines.' : 'Staff can start this machine for orders.'}</span>
          </span>
          <Toggle on={!form.outOfService} onChange={(v) => set('outOfService', !v)} label="Active" disabled={form.inUse} />
        </div>
        {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">{error}</p>}
        <button disabled={busy} className={`${primary} min-h-13 w-full rounded-2xl text-base`}>{busy ? 'Saving…' : `Save ${label}`}</button>
        {form.id && (
          <button
            type="button"
            onClick={remove}
            disabled={busy || form.inUse}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl font-semibold text-red-600 active:bg-red-50 disabled:opacity-40"
          >
            <Icon className="h-5 w-5">{I.trash}</Icon>Delete {label}
          </button>
        )}
      </form>
    </Sheet>
  )
}

// ---------- page ----------

export default function Machines() {
  const { can } = useAuth()
  const isAdmin = can('machines.configure')
  const now = useNow()
  const [tab, setTab] = useState<MachineType>('washer')
  const [filter, setFilter] = useState<MachineStatus | null>(null)
  const [rows, setRows] = useState<Machine[] | null>(null)
  const [error, setError] = useState(false)
  const [form, setForm] = useState<Form | null>(null)
  const [msg, setMsg] = useState<Msg>(null)
  const [exact, setExact] = useState<boolean | null>(null)
  const canOperate = can('machines.operate')

  const load = useCallback(
    () => listMachines()
      .then((r) => { setRows(r); setError(false) })
      .catch((e) => { console.error('Machines load failed', e); setError(true) }),
    [],
  )
  useEffect(() => {
    load()
    // Loads start and finish on other screens; refresh when the app comes back to the foreground.
    const onVisible = () => { if (document.visibilityState === 'visible') { load(); exactAlarmsAllowed().then(setExact) } }
    document.addEventListener('visibilitychange', onVisible)
    machineEvents.addEventListener('change', load)
    exactAlarmsAllowed().then(setExact)
    return () => { document.removeEventListener('visibilitychange', onVisible); machineEvents.removeEventListener('change', load) }
  }, [load])

  async function unload(m: Machine) {
    try {
      const type = await unloadMachine(m.order_id!)
      setMsg({ ok: true, text: type === 'dryer' ? `${m.code} is available. Order #${m.order_number} is Ready for Pickup.` : `${m.code} is available. Move order #${m.order_number} to a dryer next.` })
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Something went wrong. Please try again.' })
      load()
    }
  }

  const ofType = (rows ?? []).filter((m) => m.type === tab)
  const counts = { available: 0, in_use: 0, done: 0, out_of_service: 0 } as Record<MachineStatus, number>
  for (const m of ofType) counts[machineStatus(m, now)]++
  const list = filter ? ofType.filter((m) => machineStatus(m, now) === filter) : ofType
  const tabs = TABS.map((t) => ({ ...t, label: `${t.label} (${(rows ?? []).filter((m) => m.type === t.id).length})` }))
  const noun = TABS.find((t) => t.id === tab)!.label.toLowerCase()

  const edit = (m: Machine) =>
    setForm({ id: m.id, type: m.type, code: m.code, notes: m.notes, outOfService: !!m.out_of_service, cycle: String(m.cycle_minutes), inUse: !!m.order_id })
  const add = async () => setForm({ type: tab, code: await nextMachineCode(tab), notes: '', outOfService: false, cycle: String(DEFAULT_CYCLE[tab]), inUse: false })

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-28">
      <div className="md:hidden"><AppHeader /></div>

      <div className="px-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Machines</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          {rows && ofType.length
            ? counts.available ? `${counts.available} of ${ofType.length} ${noun} available right now` : `No ${noun} available right now`
            : 'Washers and dryers at a glance'}
        </p>
      </div>

      {exact === false && counts.in_use > 0 && (
        <button type="button" onClick={() => openExactAlarmSettings().then(() => exactAlarmsAllowed().then(setExact))} className="flex w-full items-start gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-left text-sm text-amber-900 active:bg-amber-100">
          <Icon className="mt-0.5 h-5 w-5 shrink-0 text-amber-600">{I.bell}</Icon>
          <span className="min-w-0 flex-1">Finish alerts may arrive a few minutes late. <span className="font-semibold underline">Allow exact alarms</span> for on-time alerts.</span>
        </button>
      )}

      <FilterTabs options={tabs} value={tab} onChange={(t) => { setTab(t); setFilter(null) }} label="Machine type" />

      {error && !rows ? (
        <div className={`${card} p-6 text-center`}>
          <p className="font-semibold text-slate-900">Couldn't load the machines.</p>
          <p className="mt-1 text-sm text-slate-500">Please try again.</p>
          <button onClick={load} className={`${primary} mt-4`}>
            <Icon className="h-5 w-5">{I.refresh}</Icon>Try again
          </button>
        </div>
      ) : rows === null ? (
        <div className="space-y-4" aria-busy="true" aria-label="Loading machines">
          <div className="grid grid-cols-4 gap-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-200/60" />)}</div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-36 animate-pulse rounded-2xl bg-slate-200/60" />)}</div>
        </div>
      ) : ofType.length === 0 ? (
        <div className={card}>
          <EmptyCard icon={I.washer} title={`No ${noun} yet`} text={isAdmin ? `Tap + to add your first ${MACHINE_TYPE_LABEL[tab].toLowerCase()}.` : 'Ask an admin to add machines.'} />
        </div>
      ) : (
        <>
          <StatusSummary counts={counts} value={filter} onChange={setFilter} />

          {list.length === 0 ? (
            <div className={card}>
              <EmptyCard icon={STATUS_UI[filter!].icon} title={`No ${noun} ${MACHINE_STATUS_LABEL[filter!]}`} text="Tap the filter again to see every machine." />
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4" aria-live="polite">
              {list.map((m) => <li key={m.id} className="min-w-0"><MachineTile m={m} now={now} onEdit={isAdmin ? () => edit(m) : undefined} onUnload={canOperate ? () => unload(m) : undefined} /></li>)}
            </ul>
          )}
        </>
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

      <FloatingToast msg={msg} onDismiss={() => setMsg(null)} />

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
