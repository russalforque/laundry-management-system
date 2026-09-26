import { useRef, useState } from 'react'
import { priceUnit } from '../../db/services'
import { formatPeso, formatPesoShort } from '../../lib/money'
import { MAX_QUANTITY, normalizeQuantity } from '../../lib/orders'
import { METHOD_OF, TYPE_LABEL, TYPE_UNIT, typeOf } from '../../lib/pricing'
import type { OrderItemRow, PricingType, Service } from '../../types'
import { parseNumber } from '../../lib/number'
import { DateInput } from '../Controls'
import { I, Icon } from '../Icons'
import { NumberInput } from '../NumberInput'
import { ServiceArt } from '../ServiceArt'
import { Sheet } from '../Sheet'
import { fieldCls } from '../ui'
import { outline, solid } from './shared'

/**
 * Sheet-local save: one at a time (a double tap in the same frame is ignored), its error shown inside the
 * sheet where the tap happened. Resolves true when saved.
 */
function useSave() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  async function save(fn: () => Promise<unknown>) {
    if (lock.current) return false
    lock.current = true
    setBusy(true)
    setError('')
    try {
      await fn()
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
      return false
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return { busy, error, setError, save }
}

const ErrorLine = ({ text }: { text: string }) =>
  text ? <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700"><Icon className="mt-px h-4 w-4">{I.info}</Icon><span className="min-w-0 flex-1">{text}</span></p> : null

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Pickup due date (and optional time); the same rules as New Order: never in the past. */
export function DueDateSheet({ value, onSave, onClose }: {
  value: string | null
  onSave: (v: string | null) => Promise<unknown>
  onClose: () => void
}) {
  const [d0, t0 = ''] = value?.split(' ') ?? []
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const [date, setDate] = useState(d0 ?? ymd(tomorrow))
  const [time, setTime] = useState(t0)
  const { busy, error, setError, save } = useSave()
  const today = ymd(new Date())

  async function submit() {
    if (!date) return setError('Choose a pickup date.')
    if (date < today) return setError('Pickup date cannot be in the past.')
    if (await save(() => onSave(time ? `${date} ${time}` : date))) onClose()
  }

  return (
    <Sheet label={value ? 'Change pickup date' : 'Set due date'} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="block min-w-0">
            <span className="text-sm font-semibold text-slate-800">Date</span>
            <DateInput className={`${fieldCls} mt-1.5`} min={today} value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="block min-w-0">
            <span className="text-sm font-semibold text-slate-800">Time <span className="font-normal text-slate-500">(optional)</span></span>
            <DateInput className={`${fieldCls} mt-1.5`} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
        </div>
        <ErrorLine text={error} />
        <button type="button" onClick={submit} disabled={busy} className={`${solid} w-full text-base`}>{busy ? 'Saving…' : 'Save due date'}</button>
        {value && (
          <button type="button" onClick={async () => { if (await save(() => onSave(null))) onClose() }} disabled={busy} className={outline}>
            Remove due date
          </button>
        )}
      </div>
    </Sheet>
  )
}

export function NoteSheet({ value, onSave, onClose }: { value: string; onSave: (v: string) => Promise<unknown>; onClose: () => void }) {
  const [text, setText] = useState(value)
  const { busy, error, save } = useSave()
  return (
    <Sheet label={value ? 'Edit note' : 'Add note'} onClose={onClose}>
      <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); if (await save(() => onSave(text))) onClose() }}>
        <label className="block">
          <span className="sr-only">Note</span>
          <textarea
            autoFocus
            rows={4}
            maxLength={1000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. Separate whites, no fabric conditioner"
            className={`${fieldCls} resize-none`}
          />
        </label>
        <ErrorLine text={error} />
        <button type="submit" disabled={busy || text.trim() === value.trim()} className={`${solid} w-full text-base`}>{busy ? 'Saving…' : 'Save note'}</button>
      </form>
    </Sheet>
  )
}

/** What a quantity is counted in, for the input label. */
const UNIT_WORD: Record<PricingType, string> = { per_load: 'Loads', per_kg: 'Weight (kg)', per_item: 'Items', per_quantity: 'Pieces', fixed: '' }

/**
 * Quantity for one service on the order: new (from Add More) or already there (Edit), with Remove.
 * The preview is price × quantity; package inclusions are applied when it's saved.
 */
function QuantityForm({ name, type, priceCents, line, onSave, onRemove, onClose }: {
  name: string
  type: PricingType
  priceCents: number
  line?: OrderItemRow
  onSave: (qty: number) => Promise<unknown>
  onRemove?: () => Promise<unknown>
  onClose: () => void
}) {
  const method = METHOD_OF[type]
  const [qty, setQty] = useState(String(line?.quantity ?? 1))
  const [confirmRemove, setConfirmRemove] = useState(false)
  const { busy, error, setError, save } = useSave()
  const typed = parseNumber(qty) // "1,200" → 1200
  const n = normalizeQuantity(method, typed ?? NaN)
  const whole = method === 'per_piece'

  async function submit() {
    if (type !== 'fixed' && n === null) return setError(whole ? 'Enter a whole number above zero.' : 'Enter a weight above zero.')
    if (await save(() => onSave(type === 'fixed' ? 1 : n!))) onClose()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-blue-50/70 px-4 py-3">
        <div className="min-w-0">
          <p className="wrap-break-word font-semibold text-slate-900">{name}</p>
          <p className="text-sm text-slate-500">{TYPE_LABEL[type]} · {formatPesoShort(priceCents)}{TYPE_UNIT[type]}</p>
        </div>
        {type !== 'fixed' && n !== null && <p className="shrink-0 text-lg font-bold tabular-nums text-slate-900">{formatPeso(Math.round(priceCents * n))}</p>}
      </div>

      {type === 'fixed' ? (
        <p className="px-1 text-sm text-slate-600">Flat rate — added once.</p>
      ) : (
        <label className="block">
          <span className="text-sm font-semibold text-slate-800">{UNIT_WORD[type]}</span>
          <div className="mt-1.5 flex items-stretch gap-2">
            {whole && (
              <button type="button" aria-label="Decrease quantity" onClick={() => setQty(String(Math.max(1, (typed ?? 1) - 1)))} className="grid w-13 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 active:bg-slate-50">
                <Icon className="h-5 w-5">{I.minus}</Icon>
              </button>
            )}
            <NumberInput
              decimals={whole ? 0 : 2}
              maxInt={String(MAX_QUANTITY).length}
              value={qty}
              onChange={setQty}
              aria-invalid={n === null}
              className={`${fieldCls} text-center text-lg font-semibold tabular-nums`}
            />
            {whole && (
              <button type="button" aria-label="Increase quantity" onClick={() => setQty(String(Math.min(MAX_QUANTITY, (typed ?? 0) + 1)))} className="grid w-13 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 active:bg-slate-50">
                <Icon className="h-5 w-5">{I.plus}</Icon>
              </button>
            )}
          </div>
        </label>
      )}
      {line && line.included_qty > 0 && <p className="px-1 text-xs text-slate-500">Part of this is included by a package or service; only the rest is charged.</p>}

      <ErrorLine text={error} />
      <button type="button" onClick={submit} disabled={busy || (!!line && (type === 'fixed' || n === line.quantity))} className={`${solid} w-full text-base`}>
        {busy ? 'Saving…' : line ? 'Update quantity' : 'Add to order'}
      </button>
      {onRemove && (
        confirmRemove ? (
          <div className="space-y-2 rounded-2xl bg-red-50 p-3">
            <p className="text-sm text-red-800">Remove {name} from this order? The total is recalculated.</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setConfirmRemove(false)} className="min-h-12 rounded-xl bg-white font-semibold text-slate-700 active:bg-slate-50">Keep</button>
              <button type="button" disabled={busy} onClick={async () => { if (await save(onRemove)) onClose() }} className="min-h-12 rounded-xl bg-red-600 font-semibold text-white active:bg-red-700 disabled:opacity-60">Remove</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmRemove(true)} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl font-semibold text-red-600 active:bg-red-50">
            <Icon className="h-5 w-5">{I.trash}</Icon>Remove from order
          </button>
        )
      )}
    </div>
  )
}

/** Edit a line already on the order; it keeps the price it was sold at. */
export function ItemSheet({ line, onSave, onClose }: { line: OrderItemRow; onSave: (qty: number) => Promise<unknown>; onClose: () => void }) {
  return (
    <Sheet label="Edit service" onClose={onClose}>
      <QuantityForm
        name={line.service_name}
        type={typeOf(line)}
        priceCents={line.unit_price_cents}
        line={line}
        onSave={onSave}
        onRemove={line.quantity > line.included_qty ? () => onSave(0) : undefined}
        onClose={onClose}
      />
    </Sheet>
  )
}

/** Add More: pick an active service or package, then its quantity. One already on the order is edited instead. */
export function AddServiceSheet({ services, items, onSave, onClose }: {
  services: Service[] | null
  items: OrderItemRow[]
  onSave: (s: Service, qty: number) => Promise<unknown>
  onClose: () => void
}) {
  const [picked, setPicked] = useState<Service | null>(null)
  const list = services?.filter((s) => !s.is_addon) ?? []
  const lineOf = (s: Service) => items.find((i) => i.service_id === s.id)

  if (picked) {
    const line = lineOf(picked)
    return (
      <Sheet label={line ? 'Edit service' : 'Add service'} onClose={onClose}>
        <button type="button" onClick={() => setPicked(null)} className="-mt-1 mb-3 inline-flex min-h-11 items-center gap-1.5 rounded-xl text-sm font-semibold text-blue-600">
          <Icon className="h-4 w-4">{I.back}</Icon>All services
        </button>
        <QuantityForm
          name={line?.service_name ?? picked.name}
          type={line ? typeOf(line) : picked.pricing_type}
          priceCents={line?.unit_price_cents ?? picked.price_cents}
          line={line}
          onSave={(q) => onSave(picked, q)}
          onRemove={line && line.quantity > line.included_qty ? () => onSave(picked, 0) : undefined}
          onClose={onClose}
        />
      </Sheet>
    )
  }

  return (
    <Sheet label="Add service" onClose={onClose}>
      {services === null ? (
        <div className="space-y-2.5">{[0, 1, 2].map((i) => <div key={i} className="h-18 animate-pulse rounded-2xl bg-slate-100" />)}</div>
      ) : list.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">No active services. An admin can add them on the Services page.</p>
      ) : (
        <ul className="space-y-2.5">
          {list.map((s) => {
            const on = !!lineOf(s)
            return (
              <li key={s.id}>
                <button type="button" onClick={() => setPicked(s)} className={`flex min-h-18 w-full items-center gap-3 rounded-2xl border p-2.5 text-left active:bg-blue-50 ${on ? 'border-blue-300 bg-blue-50/50' : 'border-slate-200 bg-white'}`}>
                  <ServiceArt name={s.name} image={s.image} className="size-13 shrink-0 rounded-xl" iconCls="h-7 w-7" />
                  <span className="min-w-0 flex-1">
                    <span className="block wrap-break-word font-semibold leading-snug text-slate-900">{s.name}</span>
                    <span className="block text-sm tabular-nums text-slate-500">{formatPesoShort(s.price_cents)}{priceUnit(s.pricing_type)}{s.is_package ? ' · Package' : ''}</span>
                  </span>
                  {on ? <span className="shrink-0 rounded-full bg-blue-600 px-2.5 py-0.5 text-xs font-semibold text-white">On order</span>
                    : <Icon className="h-5 w-5 shrink-0 text-slate-400">{I.chevron}</Icon>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Sheet>
  )
}
