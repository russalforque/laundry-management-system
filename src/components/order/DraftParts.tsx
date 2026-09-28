import type { InputHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { createCustomer, getCustomer } from '../../db/customers'
import { priceUnit } from '../../db/services'
import { type OrderDraft, type Line, type PayOption, isPicked, PAY_OPTION_LABEL, pickupLabel, todayYmd, daysFromNow } from '../../hooks/useOrderDraft'
import { centsToInput, formatPeso, parsePesoToCents } from '../../lib/money'
import { parseNumber } from '../../lib/number'
import { MAX_QUANTITY, paymentStatus } from '../../lib/orders'
import { includesText, loadsFor, maxKgOf, qtyText, TYPE_UNIT, type PricedLine } from '../../lib/pricing'
import { canBluetoothPrint } from '../../lib/printer'
import { CustomerForm, emptyCustomer } from '../customers/CustomerForm'
import type { Customer, PaymentMethod, Service } from '../../types'
import { PaymentBadge, StatusBadge } from '../Badges'
import { CashDrawerControl } from '../CashDrawer'
import { DateInput, Segmented, Toggle } from '../Controls'
import { I, Icon } from '../Icons'
import { NumberInput } from '../NumberInput'
import { ServiceArt } from '../ServiceArt'
import { Sheet } from '../Sheet'
import { StoreClosedNotice } from '../StoreStatus'
import { fieldCls as field } from '../ui'

/**
 * New Order building blocks shared by the phone and tablet/desktop wizards (components/order/NewOrderSteps.tsx).
 * Each takes the draft from hooks/useOrderDraft.ts, so both layouts price, validate and place orders the same way.
 */

export const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'gcash', label: 'GCash' },
  { value: 'other', label: 'Other' },
]

const NOTES_MAX = 200

export const card = 'rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.05)]'
export const primary = 'flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-4 text-base font-semibold text-white shadow-lg shadow-blue-600/25 transition active:bg-blue-700 disabled:bg-blue-300 disabled:shadow-none'
export const iconBtn = 'grid size-11 shrink-0 place-items-center rounded-full text-slate-800 active:bg-slate-200 disabled:text-slate-300'

/** "2 loads (14.5 kg) × ₱175/load" for a cart line. */
export function lineDetail({ service: s, p }: Line) {
  if (!p) return ''
  const t = s.pricing_type
  if (t === 'fixed') return 'Flat rate'
  return `${qtyText(t, p.quantity)}${p.weightKg ? ` (${p.weightKg} kg)` : ''} × ${formatPeso(s.price_cents)}${TYPE_UNIT[t]}`
}

/** "1 included · 1 charged", "Included", or '' when nothing is included. */
export function includedText(p: PricedLine | null) {
  if (!p || !(p.includedQty > 0)) return ''
  if (p.chargedQty <= 0) return 'Included'
  return `${p.includedQty} included · ${p.chargedQty} charged`
}

export const PersonTile = () => (
  <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">
    <Icon className="h-6 w-6">{I.user}</Icon>
  </span>
)

/** Tap-to-fill amounts for cash: exact, then the next round bills above the total. */
export function quickCash(totalCents: number) {
  if (totalCents <= 0) return []
  const out = [totalCents]
  for (const bill of [50, 100, 500, 1000]) {
    const v = Math.ceil(totalCents / (bill * 100)) * bill * 100
    if (v > totalCents && !out.includes(v)) out.push(v)
  }
  return out.slice(0, 4)
}

/** − qty + control. Weight accepts decimals by typing; fixed-price services never show it. */
function Stepper({ service, value, onChange, min = 0, ...props }: { service: Service; value: string; onChange: (v: string) => void; min?: number } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'min'>) {
  const cur = parseNumber(value) ?? 0
  const step = (delta: number) => {
    const next = Math.max(0, Math.round((cur + delta) * 100) / 100)
    onChange(next ? String(next) : '')
  }
  const btn = 'grid size-11 place-items-center rounded-lg text-blue-600 active:bg-blue-50 disabled:text-slate-300'
  return (
    <div className="flex shrink-0 items-center rounded-xl border border-slate-200 bg-white">
      <button type="button" aria-label={`Less ${service.name}`} onClick={() => step(-1)} disabled={cur <= Math.max(min, 0)} className={btn}>
        <Icon className="h-4 w-4">{I.minus}</Icon>
      </button>
      <NumberInput
        {...props}
        className="w-11 bg-transparent text-center font-semibold tabular-nums text-slate-900 outline-none"
        decimals={service.pricing_method === 'per_kg' ? 2 : 0}
        maxInt={String(MAX_QUANTITY).length}
        placeholder="0"
        value={value}
        onChange={onChange}
      />
      <button type="button" aria-label={`More ${service.name}`} onClick={() => step(1)} className={btn}>
        <Icon className="h-4 w-4">{I.plus}</Icon>
      </button>
    </div>
  )
}

/** Input with a fixed ₱ prefix so the unit is always visible. */
export function PesoInput({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <div className="relative mt-1">
      <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-slate-500">₱</span>
      <NumberInput autoFocus={autoFocus} value={value} onChange={onChange} placeholder="0.00" className={`${field} pl-9`} />
    </div>
  )
}

export function ToggleRow({ icon, title, hint, on, onChange, disabled }: { icon: ReactNode; title: string; hint: string; on: boolean; onChange: (on: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-3 p-4">
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-600">
        <Icon className="h-5 w-5">{icon}</Icon>
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        <div className="text-xs text-slate-500">{hint}</div>
      </div>
      <Toggle label={title} on={on && !disabled} onChange={onChange} disabled={disabled} />
    </div>
  )
}

export const SumRow = ({ label, value, className = 'text-slate-600' }: { label: ReactNode; value: ReactNode; className?: string }) => (
  <div className={`flex items-center justify-between gap-2 ${className}`}>
    <dt>{label}</dt>
    <dd className="tabular-nums">{value}</dd>
  </div>
)

// ── Customer ──────────────────────────────────────────────────────

/** Selectable customer list (radio group); keeps the selected customer in view even when the list doesn't include them. */
export function CustomerChoices({ matches, customer, search, onPick, listCls = 'space-y-2' }: {
  matches: Customer[] | null
  customer: Customer | null
  search: string
  onPick: (c: Customer) => void
  listCls?: string
}) {
  if (matches === null) {
    return (
      <div className="space-y-2" aria-busy="true">
        {[0, 1, 2].map((i) => <div key={i} className="h-17 animate-pulse rounded-2xl bg-slate-200/60" />)}
      </div>
    )
  }
  if (matches.length === 0) return <p className="px-2 py-6 text-center text-sm text-slate-500">{search ? `No customer matches “${search}”.` : 'No customers yet.'}</p>
  return (
    <ul role="radiogroup" aria-label="Customer" className={listCls}>
      {(customer && !search && !matches.some((m) => m.id === customer.id) ? [customer, ...matches] : matches).map((c) => {
        const sel = customer?.id === c.id
        return (
          <li key={c.id}>
            <button
              type="button"
              role="radio"
              aria-checked={sel}
              onClick={() => onPick(c)}
              className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors ${
                sel ? 'border-blue-500 bg-blue-50/60 ring-1 ring-blue-500' : 'border-slate-200/80 bg-white hover:bg-slate-50 active:bg-slate-50'
              }`}
            >
              <PersonTile />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-slate-900">{c.full_name}</span>
                <span className="block truncate text-sm text-slate-500">{c.contact || c.customer_code}</span>
              </span>
              <span aria-hidden className={`grid size-6 shrink-0 place-items-center rounded-full border-2 ${sel ? 'border-blue-600' : 'border-slate-300'}`}>
                {sel && <span className="size-3 rounded-full bg-blue-600" />}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export function CustomerSearchInput({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400">{I.search}</Icon>
      <input
        className={`${field} pl-12`}
        type="search"
        enterKeyHint="search"
        aria-label="Search customer by name or phone number"
        placeholder="Search name or phone number…"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

export function AddCustomerButton({ onClick, className = 'min-h-13 w-full' }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-2 rounded-2xl border border-dashed border-blue-300 bg-white font-semibold text-blue-700 hover:bg-blue-50 active:bg-blue-50 ${className}`}
    >
      <Icon className="h-5 w-5">{I.plus}</Icon>
      Add New Customer
    </button>
  )
}

/** "Add New Customer" sheet. A search that looks like a phone number prefills the phone instead of the name. */
export function NewCustomerSheet({ search, onClose, onCreated }: { search: string; onClose: () => void; onCreated: (c: Customer) => void }) {
  const searchIsPhone = /^[\d+()\-\s]+$/.test(search.trim()) && search.replace(/\D/g, '').length >= 3
  return (
    <Sheet label="New customer" onClose={onClose}>
      <CustomerForm
        initial={{ ...emptyCustomer, ...(searchIsPhone ? { contact: search.trim() } : { fullName: search.trim() }) }}
        submitLabel="Save & continue"
        onCancel={onClose}
        onSubmit={async (c) => {
          const created = await getCustomer(await createCustomer(c))
          if (!created) throw new Error('Customer was saved but could not be loaded. Search for them below.')
          onCreated(created)
        }}
      />
    </Sheet>
  )
}

/** Whose order this is, with a way to change it. */
export function CustomerRow({ customer, onChange }: { customer: Customer; onChange: () => void }) {
  return (
    <div className={`${card} flex items-center gap-3 p-3`}>
      <PersonTile />
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-slate-500">Customer</span>
        <span className="block truncate font-semibold text-slate-900">{customer.full_name}{customer.contact && <span className="font-normal text-slate-500"> · {customer.contact}</span>}</span>
      </span>
      <button type="button" onClick={onChange} className="-mr-1 min-h-11 shrink-0 rounded-xl px-3 text-sm font-semibold text-blue-700 hover:bg-blue-50 active:bg-blue-50">Change</button>
    </div>
  )
}

// ── Services & add-ons ────────────────────────────────────────────

/**
 * − qty + for one line, in the pick lists and on Summary. An add-on a package already includes starts at the
 * included quantity and can't go below it, so + adds one extra, charged piece.
 */
export function LineStepper({ d, service: s }: { d: OrderDraft; service: Service }) {
  const p = d.lineOf(s.id)?.p ?? null
  const userPicked = isPicked(d.qty[s.id])
  const t = s.pricing_type
  return (
    <Stepper
      service={s}
      aria-label={`${s.name} ${t === 'per_kg' ? 'weight in kg' : t === 'per_load' ? 'loads' : 'quantity'}`}
      aria-invalid={userPicked && !p}
      min={s.is_addon && p ? Math.ceil(p.includedQty) : 0}
      value={p && (s.is_addon || !userPicked) ? String(p.quantity) : d.qty[s.id] ?? ''}
      onChange={(v) => d.setQty(s.id, v)}
    />
  )
}

/** Fixed-price items have no quantity: one tap adds, another removes. Items a package adds show as Included. */
export function AddToggle({ d, service: s }: { d: OrderDraft; service: Service }) {
  const on = !!d.lineOf(s.id)
  const included = on && !isPicked(d.qty[s.id])
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={included ? `${s.name} included` : on ? `Remove ${s.name}` : `Add ${s.name}`}
      disabled={included}
      onClick={() => (on ? d.removeLine(s) : d.addOne(s))}
      className={`inline-flex min-h-11 min-w-24 shrink-0 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-semibold transition-colors disabled:bg-emerald-50 disabled:text-emerald-700 ${
        on ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30 active:bg-blue-700' : 'border border-blue-200 bg-white text-blue-700 hover:bg-blue-50 active:bg-blue-50'
      }`}
    >
      <Icon className="h-4 w-4">{on ? I.tick : I.plus}</Icon>
      {included ? 'Included' : on ? 'Added' : 'Add'}
    </button>
  )
}

/**
 * Services (packages first) or add-ons as touch-friendly rows: name, price and unit, and a − qty + control
 * (fixed-price items: Add). Selected rows are outlined in blue.
 */
export function PickList({ d, kind, listCls = 'space-y-2.5' }: { d: OrderDraft; kind: 'services' | 'addons'; listCls?: string }) {
  const list = d.services
    .filter((s) => (kind === 'addons' ? !!s.is_addon : !s.is_addon))
    .sort((a, b) => b.is_package - a.is_package)
  const byId = new Map(d.services.map((s) => [s.id, s]))
  if (!list.length) {
    return (
      <p className={`${card} p-6 text-center text-sm text-slate-500`}>
        {kind === 'addons' ? 'No add-ons are set up. Continue to the summary.' : 'No active services. Ask a manager to add services first.'}
      </p>
    )
  }
  return (
    <ul className={listCls}>
      {list.map((s) => {
        const line = d.lineOf(s.id)
        const incl = includedText(line?.p ?? null)
        const note = s.is_package ? includesText(s, byId, d.inclusions) : s.description
        const fixed = s.pricing_type === 'fixed'
        const included = !!line && !isPicked(d.qty[s.id])
        // Tapping anywhere on the card does what its button does: + one more, or Add / remove for fixed-price items.
        // The controls stay the keyboard path; they stop their own taps so one tap never counts twice.
        const tap = fixed ? (included ? undefined : () => (line ? d.removeLine(s) : d.addOne(s))) : () => d.addOne(s)
        return (
          <li
            key={s.id}
            onClick={tap}
            className={`flex items-center gap-3 rounded-2xl border p-3 transition-colors select-none ${tap ? 'cursor-pointer' : ''} ${
              line ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-500 active:bg-blue-50' : 'border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.05)] hover:bg-slate-50 active:bg-slate-50'
            }`}
          >
            <ServiceArt name={s.name} image={s.image} className="size-13 shrink-0 rounded-xl max-[379px]:hidden" iconCls="h-7 w-7" />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 font-semibold leading-snug text-slate-900">{s.name}</p>
              <p className="text-sm text-slate-500">
                <b className="font-semibold text-slate-900">{formatPeso(s.price_cents)}</b>{priceUnit(s.pricing_type)}
                {s.max_kg != null && ` · max ${s.max_kg} kg`}
              </p>
              {incl ? <p className="text-xs font-semibold text-emerald-700">{incl}</p> : note && <p className="line-clamp-1 text-xs text-slate-500">{note}</p>}
            </div>
            <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
              {fixed ? <AddToggle d={d} service={s} /> : <LineStepper d={d} service={s} />}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

// ── Summary ───────────────────────────────────────────────────────

/** One order line on Summary: quantity stepper, weight for per-load services, amount, what a package includes, remove. */
export function CartLine({ d, line }: { d: OrderDraft; line: Line }) {
  const { service: s, p } = line
  const t = s.pricing_type
  const userPicked = isPicked(d.qty[s.id])
  const maxKg = maxKgOf(s, d.defaultMaxKg)
  const w = d.weightOf(s)
  const needLoads = t === 'per_load' && w && maxKg ? loadsFor(w, maxKg) : 0
  const incl = includedText(p)
  return (
    <li className={`${card} flex gap-3 p-3`}>
      <ServiceArt name={s.name} image={s.image} className="size-14 shrink-0 rounded-xl max-[379px]:hidden" iconCls="h-7 w-7" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold text-slate-900">{s.name}</div>
            <div className="text-xs text-slate-500">{p ? lineDetail(line) : d.qty[s.id]}</div>
            {p?.note && <div className="mt-0.5 text-xs text-slate-500">{p.note}</div>}
            {incl && <div className="mt-0.5 text-xs font-semibold text-emerald-700">{incl}</div>}
          </div>
          {userPicked && (
            <button
              type="button"
              aria-label={`Remove ${s.name}`}
              onClick={() => d.removeLine(s)}
              className="-mr-1.5 -mt-1.5 grid size-10 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-red-50 hover:text-red-500 active:bg-red-50 active:text-red-500"
            >
              <Icon className="h-5 w-5">{I.trash}</Icon>
            </button>
          )}
        </div>
        {t === 'per_load' && (
          <label className="mt-2 flex items-center gap-2 text-xs text-slate-500">
            Weight
            <span className="relative">
              <NumberInput
                className="h-11 w-24 rounded-xl border border-slate-200 bg-white pl-3 pr-8 text-sm font-semibold tabular-nums text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                maxInt={4}
                placeholder="0"
                aria-label={`${s.name} weight in kg`}
                aria-invalid={w === undefined}
                value={d.weight[s.id] ?? ''}
                onChange={(v) => d.setWeight(s, v)}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">kg</span>
            </span>
            {maxKg ? <span>max {maxKg} kg / load</span> : null}
          </label>
        )}
        <div className="mt-2 flex items-center justify-between gap-2">
          {t === 'fixed' ? <span /> : <LineStepper d={d} service={s} />}
          <span className={`text-lg font-bold tabular-nums ${p && p.includedQty > 0 && !p.amountCents ? 'text-emerald-700' : 'text-slate-900'}`}>
            {p && p.includedQty > 0 && !p.amountCents ? 'Included' : formatPeso(p?.amountCents ?? 0)}
          </span>
        </div>
        {!p && (
          <p className="mt-1 text-xs font-medium text-red-600">
            Enter a valid {t === 'per_kg' ? 'weight' : 'whole number'}.
          </p>
        )}
        {w === undefined && <p className="mt-1 text-xs font-medium text-red-600">Enter a valid weight.</p>}
        {p && needLoads > p.quantity && (
          <p className="mt-1 text-xs font-medium text-amber-700">{w} kg needs {needLoads} loads at {maxKg} kg per load.</p>
        )}
      </div>
    </li>
  )
}

/** Subtotal, package savings, discount (opens the discount sheet) and total. */
export function CartTotals({ d, onDiscount, className = `${card} space-y-2 p-4 text-sm` }: { d: OrderDraft; onDiscount: () => void; className?: string }) {
  const { discountCents } = d
  return (
    <dl className={className}>
      <SumRow label="Subtotal" value={formatPeso(d.subtotal)} />
      {d.includedValue > 0 && (
        <p className="text-xs text-emerald-700">{formatPeso(d.includedValue)} of items included in packages — not charged.</p>
      )}
      <button type="button" onClick={onDiscount} className="-mx-2 flex min-h-10 w-[calc(100%+1rem)] items-center justify-between rounded-lg px-2 text-slate-600 hover:bg-slate-50 active:bg-slate-50">
        <span>Discount</span>
        <span className="flex items-center gap-1 tabular-nums">
          {discountCents === null ? <span className="text-red-600">Invalid</span> : (discountCents > 0 ? `−${formatPeso(discountCents)}` : formatPeso(0))}
          <Icon className="h-4 w-4 text-slate-400">{I.chevron}</Icon>
        </span>
      </button>
      <SumRow
        label="Total"
        value={formatPeso(d.shownTotal)}
        className="border-t border-slate-100 pt-3 text-xl font-bold text-slate-900"
      />
    </dl>
  )
}

/** Discount amount; can't exceed the subtotal. `draft` is non-null while open. */
export function DiscountSheet({ d, draft, setDraft }: { d: OrderDraft; draft: string; setDraft: (v: string | null) => void }) {
  const c = draft.trim() ? parsePesoToCents(draft) : 0
  const msg = c === null ? 'Enter a valid amount.' : c > d.subtotal ? `Cannot exceed the subtotal (${formatPeso(d.subtotal)}).` : ''
  return (
    <Sheet label="Discount" onClose={() => setDraft(null)}>
      <form
        className="space-y-4"
        onSubmit={(e) => { e.preventDefault(); d.setDiscount(draft); setDraft(null) }}
      >
        <label className="block text-sm font-medium text-slate-600">
          Discount amount
          <PesoInput autoFocus value={draft} onChange={setDraft} />
        </label>
        {msg && <p role="alert" className="text-sm font-medium text-red-600">{msg}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={() => { d.setDiscount(''); setDraft(null) }} className="min-h-12 flex-1 rounded-xl bg-slate-100 font-semibold text-slate-700 active:bg-slate-200">
            No discount
          </button>
          <button disabled={!!msg} className="min-h-12 flex-1 rounded-xl bg-blue-600 font-semibold text-white active:bg-blue-700 disabled:bg-blue-300">
            Apply
          </button>
        </div>
      </form>
    </Sheet>
  )
}

// ── Payment & pickup ──────────────────────────────────────────────

const PAY_OPTIONS: { value: PayOption; hint: string }[] = [
  { value: 'full', hint: 'Pays the whole total now' },
  { value: 'partial', hint: 'Pays part now, the rest later' },
  { value: 'later', hint: 'Pays nothing now' },
]

/** Full / Partial / Pay Later, the method, and the amount (cash: with quick amounts). */
export function PaymentSection({ d, className = `${card} space-y-4 p-4` }: { d: OrderDraft; className?: string }) {
  const { payOpt, method, paid, shownTotal, isCash } = d
  const methodLabel = METHODS.find((m) => m.value === method)!.label
  const showAmount = payOpt === 'partial' || (payOpt === 'full' && isCash)
  const quick = payOpt === 'full' && isCash ? quickCash(shownTotal) : []
  return (
    <section className={className}>
      <h2 id="pay-option" className="font-semibold text-slate-900">How is the customer paying?</h2>
      <div role="radiogroup" aria-labelledby="pay-option" className="grid gap-2 @lg:grid-cols-3">
        {PAY_OPTIONS.map((o) => {
          const on = payOpt === o.value
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => d.choosePayOption(o.value)}
              className={`flex min-h-16 items-center gap-3 rounded-2xl border p-3 text-left transition-colors ${
                on ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-slate-200 bg-white hover:bg-slate-50 active:bg-slate-50'
              }`}
            >
              <span aria-hidden className={`grid size-6 shrink-0 place-items-center rounded-full border-2 ${on ? 'border-blue-600' : 'border-slate-300'}`}>
                {on && <span className="size-3 rounded-full bg-blue-600" />}
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-slate-900">{PAY_OPTION_LABEL[o.value]}</span>
                <span className="block text-xs text-slate-500">{o.hint}</span>
              </span>
            </button>
          )
        })}
      </div>

      {payOpt === 'later' ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          Saved as <b>Unpaid</b>. The <b>{formatPeso(shownTotal)}</b> balance is collected at pickup.
        </p>
      ) : (
        <>
          <StoreClosedNotice action="take payment (or choose Pay Later)" />
          <div>
            <p className="mb-1.5 text-sm font-medium text-slate-600">Payment method</p>
            <Segmented label="Payment method" value={method} onChange={(v) => { d.setMethod(v); if (v === 'cash') d.setReference('') }} options={METHODS} />
          </div>
          {showAmount && (
            <label className="block text-sm font-medium text-slate-600">
              {payOpt === 'partial' ? 'Amount paid now' : 'Amount received'}
              <PesoInput value={paid} onChange={d.setPaid} />
            </label>
          )}
          {quick.length > 0 && (
            // One tap for the usual amounts: exact, or the bill the customer hands over.
            <div role="group" aria-label="Quick amounts" className="flex flex-wrap gap-2">
              {quick.map((c, i) => {
                const on = paid.trim() !== '' && parsePesoToCents(paid) === c
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={on}
                    onClick={() => d.setPaid(centsToInput(c))}
                    className={`min-h-11 rounded-full px-4 text-sm font-semibold tabular-nums transition-colors ${
                      on ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-50'
                    }`}
                  >
                    {i === 0 ? `Exact ${formatPeso(c)}` : formatPeso(c)}
                  </button>
                )
              })}
            </div>
          )}
          {payOpt === 'full' && !isCash && (
            <p className="rounded-xl bg-blue-50 px-3 py-2.5 text-sm text-blue-900">Collect exactly <b>{formatPeso(shownTotal)}</b> by {methodLabel}.</p>
          )}
          {!isCash && (
            <label className="block text-sm font-medium text-slate-600">
              Reference no. <span className="font-normal text-slate-400">(optional)</span>
              <input className={`${field} mt-1`} inputMode="text" autoCapitalize="characters" placeholder={method === 'gcash' ? 'GCash reference' : 'Reference'} value={d.reference} onChange={(e) => d.setReference(e.target.value)} />
            </label>
          )}
        </>
      )}
    </section>
  )
}

/** Total, Amount Paid, Balance and (cash, full payment) Change, updated as the amount is typed. */
export function PaymentBreakdown({ d, className = `${card} p-4` }: { d: OrderDraft; className?: string }) {
  const paid = d.paidCents ?? 0
  const showChange = d.payOpt === 'full' && d.isCash
  return (
    <section aria-label="Payment summary" aria-live="polite" className={className}>
      <dl className="space-y-2 text-[15px]">
        <SumRow label="Total" value={formatPeso(d.shownTotal)} className="font-semibold text-slate-900" />
        {showChange && <SumRow label="Amount received" value={d.receivedCents === null ? '—' : formatPeso(d.receivedCents)} />}
        <SumRow label="Amount paid" value={formatPeso(paid)} />
        <SumRow
          label={<span className="flex items-center gap-2">Balance <PaymentBadge status={paymentStatus(d.shownTotal, paid)} /></span>}
          value={formatPeso(d.balance)}
          className={d.balance > 0 ? 'font-semibold text-amber-700' : 'text-slate-600'}
        />
      </dl>
      {showChange && (
        <div className={`mt-3 flex items-baseline justify-between gap-3 rounded-xl px-4 py-3 ${d.change > 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-50 text-slate-500'}`}>
          <span className="font-semibold">Change</span>
          <span className="text-3xl font-bold tabular-nums">{formatPeso(d.change)}</span>
        </div>
      )}
    </section>
  )
}

export function PickupSection({ d, className = `${card} space-y-3 p-4` }: { d: OrderDraft; className?: string }) {
  return (
    <section className={className}>
      <h2 className="font-semibold text-slate-900">Pickup <span className="font-normal text-slate-500">(optional)</span></h2>
      <Segmented
        label="Pickup schedule"
        value={d.schedule}
        onChange={(v) => {
          d.setSchedule(v)
          if (v === 'later' && !d.pickupDate) d.setPickupDate(daysFromNow(1))
        }}
        options={[{ value: 'asap', label: 'ASAP' }, { value: 'later', label: 'Schedule Later' }]}
      />
      {d.schedule === 'later' ? (
        <div className="grid grid-cols-[1.35fr_1fr] gap-2">
          <DateInput className={field} aria-label="Pickup date" min={todayYmd()} value={d.pickupDate} onChange={(e) => d.setPickupDate(e.target.value)} />
          <DateInput className={field} type="time" aria-label="Pickup time (optional)" value={d.pickupTime} onChange={(e) => d.setPickupTime(e.target.value)} />
        </div>
      ) : (
        <p className="text-xs text-slate-500">Customer picks up as soon as the order is ready.</p>
      )}
    </section>
  )
}

export function NotesSection({ d, className = `${card} space-y-2 p-4` }: { d: OrderDraft; className?: string }) {
  return (
    <section className={className}>
      <label htmlFor="notes" className="font-semibold text-slate-900">Notes <span className="font-normal text-slate-500">(optional)</span></label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-4 top-3.5 h-5 w-5 text-slate-400">{I.note}</Icon>
        <textarea
          id="notes"
          className={`${field} resize-none pl-12`}
          rows={2}
          maxLength={NOTES_MAX}
          placeholder="e.g. special instructions…"
          value={d.notes}
          onChange={(e) => d.setNotes(e.target.value)}
        />
      </div>
      <p className="text-right text-xs tabular-nums text-slate-400">{d.notes.length}/{NOTES_MAX}</p>
    </section>
  )
}

/** Print receipt / text the customer, right after placing. */
export function AfterSection({ d, className = `${card} divide-y divide-slate-100` }: { d: OrderDraft; className?: string }) {
  return (
    <section className={className}>
      <h2 className="sr-only">After placing</h2>
      <ToggleRow icon={I.printer} title="Print receipt" hint="Right after the order is placed" on={d.printOn} onChange={d.setPrintOn} />
      <ToggleRow
        icon={I.message}
        title="Text the customer"
        hint={d.canSms ? 'Opens SMS with the order details filled in' : 'No mobile number on file'}
        on={d.smsOn}
        onChange={d.setSmsOn}
        disabled={!d.canSms}
      />
    </section>
  )
}

// ── Order created ─────────────────────────────────────────────────

/**
 * After Create Order: the order number, customer, total and status (Received), the change to hand over, print
 * progress with a one-tap retry, then View Order or Create Another Order.
 */
export function DoneView({ d, onRestart, progress }: { d: OrderDraft; onRestart: () => void; progress?: ReactNode }) {
  const { done, customer, change, receivedCents, paidCents, shownTotal, printing } = d
  if (!done) return null
  const status = paymentStatus(shownTotal, paidCents ?? 0)
  const link = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold text-blue-700 hover:bg-blue-50 active:bg-blue-50 disabled:opacity-60'
  return (
    <div className="mx-auto flex max-w-md flex-col space-y-4 pb-4 pt-2">
      {progress}
      {/* Confirmation: unmistakable at arm's length */}
      <div className="flex flex-col items-center pt-2 text-center">
        <span className="grid size-20 animate-pop-in place-items-center rounded-full bg-emerald-100 ring-8 ring-emerald-50" aria-hidden>
          <span className="grid size-14 place-items-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30">
            <Icon className="h-8 w-8">{I.tick}</Icon>
          </span>
        </span>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900" role="status">Order Created</h1>
        <p className="mt-1 text-3xl font-bold tracking-wide text-blue-700">#{done.orderNumber}</p>
      </div>

      {/* The one number the cashier must hand over */}
      {change > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-emerald-600 px-4 py-3 text-white shadow-lg shadow-emerald-600/20">
          <span>
            <span className="block text-sm font-semibold">Change</span>
            <span className="block text-xs text-emerald-100">Amount received {formatPeso(receivedCents ?? 0)}</span>
          </span>
          <span className="text-3xl font-bold tabular-nums">{formatPeso(change)}</span>
        </div>
      )}

      <dl className={`${card} space-y-2.5 p-4 text-[15px]`}>
        <SumRow label="Customer" value={<span className="font-semibold text-slate-900">{customer?.full_name}</span>} />
        <SumRow label="Total" value={<span className="font-bold text-slate-900">{formatPeso(shownTotal)}</span>} />
        <SumRow label="Status" value={<StatusBadge status="received" />} />
        <SumRow label="Payment" value={<span className="flex items-center gap-2">{d.balance > 0 && <span className="text-amber-700">{formatPeso(d.balance)} due</span>}<PaymentBadge status={status} /></span>} />
        <SumRow label="Pickup" value={d.expectedPickup ? pickupLabel(d.pickupDate, d.pickupTime) : 'ASAP'} />
      </dl>

      {/* Print progress stays visible; it runs by itself right after creating */}
      {printing && (
        <p
          role="status"
          className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-medium ${
            printing.state === 'error' ? 'bg-red-50 text-red-700' : printing.state === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'
          }`}
        >
          <Icon className={`mt-px h-5 w-5 shrink-0 ${printing.state === 'busy' ? 'animate-pulse' : ''}`}>{printing.state === 'ok' ? I.check : printing.state === 'error' ? I.info : I.printer}</Icon>
          <span className="min-w-0 flex-1">
            {printing.state === 'busy' ? 'Printing receipt…' : printing.state === 'ok' ? 'Receipt printed.' : printing.msg}
            {printing.noPrinter && <Link to="/printer" className="mt-1 block font-semibold underline">Set up printer</Link>}
          </span>
        </p>
      )}
      {/* The order is saved either way; a failed receipt gets a big retry, not a small link. */}
      {printing?.state === 'error' && (
        <button type="button" onClick={() => d.printReceipt(done.id)} className={primary}>
          <Icon className="h-5 w-5">{I.printer}</Icon>Retry Print Receipt
        </button>
      )}
      {done.cash && <CashDrawerControl status={d.drawer} />}

      <div className="space-y-2 pt-2">
        <Link to={`/orders/${done.id}`} replace className={printing?.state === 'error' ? 'flex min-h-13 w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white font-semibold text-blue-700 hover:bg-blue-50 active:bg-blue-50' : primary}>
          <Icon className="h-5 w-5">{I.receipt}</Icon>View Order
        </Link>
        <button type="button" onClick={onRestart} className="flex min-h-13 w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white font-semibold text-blue-700 hover:bg-blue-50 active:bg-blue-50">
          <Icon className="h-5 w-5">{I.plus}</Icon>Create Another Order
        </button>
        <div className="flex flex-wrap items-center justify-center gap-1 pt-1">
          {canBluetoothPrint() ? (
            printing?.state !== 'error' && <button type="button" onClick={() => d.printReceipt(done.id)} disabled={printing?.state === 'busy'} className={link}>
              <Icon className="h-4 w-4">{I.printer}</Icon>{printing ? 'Print again' : 'Print receipt'}
            </button>
          ) : (
            <Link to={`/orders/${done.id}/receipt`} className={link}><Icon className="h-4 w-4">{I.printer}</Icon>Print receipt</Link>
          )}
          {done.sms && <a href={done.sms} className={link}><Icon className="h-4 w-4">{I.message}</Icon>Text customer</a>}
        </div>
      </div>
    </div>
  )
}
