import { useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { PaymentBadge } from '../components/Badges'
import { Chip } from '../components/Chip'
import { CashChange } from '../components/PaymentForm'
import { CashDrawerControl, type DrawerMsg } from '../components/CashDrawer'
import { DateInput, Segmented, Toggle } from '../components/Controls'
import { I, Icon, serviceIcon } from '../components/Icons'
import { Sheet } from '../components/Sheet'
import { StoreClosedNotice, useStoreShift } from '../components/StoreStatus'
import { fieldCls as field } from '../components/ui'
import { createCustomer, getCustomer, getWalkInCustomer, searchCustomers, WALK_IN_CODE } from '../db/customers'
import { createOrder } from '../db/orders'
import { listInclusions, listServices, priceUnit } from '../db/services'
import { getSettings } from '../db/settings'
import { cashTender, centsToInput, formatPeso, parsePesoToCents } from '../lib/money'
import { normalizeQuantity, paymentStatus } from '../lib/orders'
import { includesText, kindOf, loadsFor, maxKgOf, parseMaxKg, priceCart, qtyText, TYPE_UNIT, type CartItem, type PricedLine } from '../lib/pricing'
import { autoOpenCashDrawer, canBluetoothPrint, NoPrinterError, printOrderReceipt } from '../lib/printer'
import type { Customer, Inclusion, PaymentMethod, Service } from '../types'
import { CustomerForm, emptyCustomer } from './Customers'

/** Wizard steps; kept in the URL (`?step=`) so the Android back button walks back through them. */
type Step = 'customer' | 'services' | 'cart' | 'details'

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'gcash', label: 'GCash' },
  { value: 'other', label: 'Other' },
]

type Group = 'package' | 'service' | 'addon'
const GROUPS: { value: Group; label: string; heading: string }[] = [
  { value: 'package', label: 'Packages', heading: 'Packages' },
  { value: 'service', label: 'Services', heading: 'Services' },
  { value: 'addon', label: 'Add-ons', heading: 'Add-ons' },
]
const NOTES_MAX = 200

/** A cart row: a priced line, or a picked service whose quantity is invalid (priced null, flagged). */
interface Line {
  service: Service
  p: PricedLine | null
}

/** "2 loads (14.5 kg) × ₱175/load" for a cart line. */
function lineDetail({ service: s, p }: Line) {
  if (!p) return ''
  const t = s.pricing_type
  if (t === 'fixed') return 'Flat rate'
  return `${qtyText(t, p.quantity)}${p.weightKg ? ` (${p.weightKg} kg)` : ''} × ${formatPeso(s.price_cents)}${TYPE_UNIT[t]}`
}

/** "1 included · 1 charged", "Included", or '' when nothing is included. */
function includedText(p: PricedLine | null) {
  if (!p || !(p.includedQty > 0)) return ''
  if (p.chargedQty <= 0) return 'Included'
  return `${p.includedQty} included · ${p.chargedQty} charged`
}

const card = 'rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.05)]'
const primary = 'flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-4 text-base font-semibold text-white shadow-lg shadow-blue-600/25 transition active:bg-blue-700 disabled:bg-blue-300 disabled:shadow-none'
const iconBtn = 'grid size-11 shrink-0 place-items-center rounded-full text-slate-800 active:bg-slate-200 disabled:text-slate-300'

/** A service counts as picked once it has a non-zero quantity (invalid text still counts, so it gets flagged). */
const isPicked = (qty: string | undefined) => !!qty?.trim() && parseFloat(qty) !== 0

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const daysFromNow = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d) }

function pickupLabel(date: string, time: string) {
  const d = new Date(`${date}T${time || '00:00'}`)
  const day = d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
  return time ? `${day}, ${d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}` : day
}

/** Service photo: the uploaded image, or a soft blue tile with the service glyph when there is none. */
function ServiceArt({ name, image, className, iconCls }: { name: string; image?: string | null; className: string; iconCls: string }) {
  if (image) return <img src={image} alt="" aria-hidden className={`object-cover ${className}`} />
  return (
    <span aria-hidden className={`grid place-items-center bg-linear-to-br from-blue-50 to-blue-100/70 text-blue-500 ${className}`}>
      <Icon className={iconCls}>{serviceIcon(name)}</Icon>
    </span>
  )
}

const PersonTile = () => (
  <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">
    <Icon className="h-6 w-6">{I.user}</Icon>
  </span>
)

const STEPS: { id: Step; label: string }[] = [
  { id: 'customer', label: 'Customer' },
  { id: 'services', label: 'Services' },
  { id: 'cart', label: 'Cart' },
  { id: 'details', label: 'Payment' },
]

/** Back, title and the step progress; earlier steps can be tapped to jump back. */
function StepHeader({ title, step, onBack, onStep, action }: { title: string; step: Step; onBack: () => void; onStep: (s: Step) => void; action?: ReactNode }) {
  const at = STEPS.findIndex((s) => s.id === step)
  return (
    <header className="space-y-3">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onBack} aria-label="Back" className={`-ml-2 ${iconBtn}`}>
          <Icon className="h-6 w-6">{I.back}</Icon>
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-slate-500">Step {at + 1} of {STEPS.length}</p>
          <h1 className="truncate text-xl font-bold leading-tight tracking-tight text-slate-900">{title}</h1>
        </div>
        {action}
      </div>
      <ol aria-label="Order steps" className="grid grid-cols-4 gap-1.5">
        {STEPS.map((s, i) => {
          const done = i < at
          const bar = <span aria-hidden className={`block h-1.5 rounded-full transition-colors ${i <= at ? 'bg-blue-600' : 'bg-slate-200'}`} />
          const label = (
            <span className={`mt-1.5 flex items-center gap-1 text-[11px] leading-none ${i === at ? 'font-bold text-blue-700' : done ? 'font-medium text-slate-700' : 'font-medium text-slate-400'}`}>
              {done && <Icon className="h-3 w-3 shrink-0 text-blue-600">{I.tick}</Icon>}
              <span className="truncate">{s.label}</span>
            </span>
          )
          return (
            <li key={s.id} aria-current={i === at ? 'step' : undefined} className="min-w-0">
              {done ? (
                <button type="button" onClick={() => onStep(s.id)} aria-label={`Back to ${s.label}`} className="-my-2 block w-full py-2 text-left">{bar}{label}</button>
              ) : <>{bar}{label}</>}
            </li>
          )
        })}
      </ol>
    </header>
  )
}

/**
 * Primary action pinned to the bottom of the scroll area, above the phone nav. `info` sits to the left of
 * the button (item count, total), so the running total is always in view.
 */
function BottomBar({ error, info, children }: { error?: string; info?: ReactNode; children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-4 border-t border-slate-200/70 bg-white/95 px-4 pb-3 pt-3 shadow-[0_-4px_20px_rgba(15,23,42,0.06)] backdrop-blur md:bottom-4 md:mx-0 md:rounded-2xl md:border">
      {error && <p role="alert" className="mb-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">{error}</p>}
      <div className="flex items-center gap-3">
        {info && <div className="min-w-0 shrink-0" aria-live="polite">{info}</div>}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  )
}

/** Label + big number for the bottom bar. */
const BarInfo = ({ label, value }: { label: ReactNode; value: ReactNode }) => (
  <>
    <span className="block text-xs text-slate-500">{label}</span>
    <span className="block text-lg font-bold leading-tight tabular-nums text-slate-900">{value}</span>
  </>
)

/** Tap-to-fill amounts for cash: exact, then the next round bills above the total. */
function quickCash(totalCents: number) {
  if (totalCents <= 0) return []
  const out = [totalCents]
  for (const bill of [50, 100, 500, 1000]) {
    const v = Math.ceil(totalCents / (bill * 100)) * bill * 100
    if (v > totalCents && !out.includes(v)) out.push(v)
  }
  return out.slice(0, 4)
}

const NextLabel = ({ children = 'Next' }: { children?: ReactNode }) => (
  <>{children}<Icon className="h-5 w-5">{I.next}</Icon></>
)

/** − qty + control. Weight accepts decimals by typing; fixed-price services never show it. */
function Stepper({ service, value, onChange, min = 0, ...props }: { service: Service; value: string; onChange: (v: string) => void; min?: number } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'min'>) {
  const cur = parseFloat(value) || 0
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
      <input
        {...props}
        className="w-11 bg-transparent text-center font-semibold tabular-nums text-slate-900 outline-none"
        inputMode={service.pricing_method === 'per_kg' ? 'decimal' : 'numeric'}
        placeholder="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button type="button" aria-label={`More ${service.name}`} onClick={() => step(1)} className={btn}>
        <Icon className="h-4 w-4">{I.plus}</Icon>
      </button>
    </div>
  )
}

/** Input with a fixed ₱ prefix so the unit is always visible. */
function PesoInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative mt-1">
      <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-slate-500">₱</span>
      <input {...props} inputMode="decimal" placeholder="0.00" className={`${field} pl-9`} />
    </div>
  )
}

function ToggleRow({ icon, title, hint, on, onChange, disabled }: { icon: ReactNode; title: string; hint: string; on: boolean; onChange: (on: boolean) => void; disabled?: boolean }) {
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

const SumRow = ({ label, value, className = 'text-slate-600' }: { label: ReactNode; value: ReactNode; className?: string }) => (
  <div className={`flex items-center justify-between gap-2 ${className}`}>
    <dt>{label}</dt>
    <dd className="tabular-nums">{value}</dd>
  </div>
)

export default function NewOrder() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const preset = Number(params.get('customer')) || 0

  const [services, setServices] = useState<Service[]>([])
  const [inclusions, setInclusions] = useState<Inclusion[]>([])
  const [defaultMaxKg, setDefaultMaxKg] = useState<number | null>(null)
  const [weight, setWeightMap] = useState<Record<number, string>>({}) // per-load services: kg entered
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [walkIn, setWalkIn] = useState(false)
  const [search, setSearch] = useState('')
  const [matches, setMatches] = useState<Customer[] | null>(null)
  const [addingCustomer, setAddingCustomer] = useState(false)
  const [svcSearch, setSvcSearch] = useState('')
  const [group, setGroup] = useState<Group | ''>('')
  const [qty, setQtyMap] = useState<Record<number, string>>({})
  const [discount, setDiscount] = useState('')
  const [discountDraft, setDiscountDraft] = useState<string | null>(null) // non-null while the discount sheet is open
  const [schedule, setSchedule] = useState<'asap' | 'later'>('asap')
  const [pickupDate, setPickupDate] = useState('')
  const [pickupTime, setPickupTime] = useState('')
  const [notes, setNotes] = useState('')
  const [payOpt, setPayOpt] = useState<'now' | 'later'>('now')
  const [paid, setPaid] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [reference, setReference] = useState('')
  const [smsOn, setSmsOn] = useState(true)
  const [printOn, setPrintOn] = useState(true)
  const [businessName, setBusinessName] = useState('')
  const [reviewing, setReviewing] = useState(false)
  const [err, setErr] = useState<{ step: Step; msg: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const placing = useRef(false) // blocks a double tap creating two orders
  const storeClosed = useStoreShift().shift === null // money can't be taken until the store is opened
  const [done, setDone] = useState<{ id: number; orderNumber: string; sms: string | null; cash: boolean } | null>(null)
  const [drawer, setDrawer] = useState<DrawerMsg>(null)
  const [printing, setPrinting] = useState<{ state: 'busy' | 'ok' | 'error'; msg?: string; noPrinter?: boolean } | null>(null)

  useEffect(() => {
    // Opened from a customer's page: start with that customer selected.
    if (preset) getCustomer(preset).then((c) => c && setCustomer(c))
    listServices(true).then(setServices)
    listInclusions().then(setInclusions)
    getSettings().then((s) => {
      setBusinessName(s.business_name || 'Sellix Laundry')
      setDefaultMaxKg(parseMaxKg(s.load_max_kg))
      // A default turnaround means orders are normally scheduled; preselect that date.
      if (!/^\d+$/.test(s.default_pickup_days ?? '')) return
      setPickupDate(daysFromNow(Number(s.default_pickup_days)))
      setSchedule('later')
    })
  }, [preset])

  // Derived money, all in centavos. Priced by the same routine createOrder uses, which re-validates on save.
  const picked = services.filter((s) => isPicked(qty[s.id]))
  // Number(), not parseFloat(): "2abc" must be rejected, not read as 2.
  const quantityOf = (s: Service) => normalizeQuantity(s.pricing_method, Number(qty[s.id]!.trim()))
  /** Weight for a per-load line: a number, null when blank, undefined when invalid. */
  const weightOf = (s: Service): number | null | undefined => {
    const w = weight[s.id]?.trim()
    if (s.pricing_type !== 'per_load' || !w) return null
    const n = Number(w)
    return /^\d+(\.\d{1,2})?$/.test(w) && n > 0 ? n : undefined
  }
  const cartItems: CartItem[] = picked
    .filter((s) => quantityOf(s) !== null)
    .map((s) => ({ serviceId: s.id, quantity: quantityOf(s)!, weightKg: weightOf(s) ?? null }))
  const priced = priceCart(services, inclusions, cartItems, defaultMaxKg)
  const lines: Line[] = [
    ...picked.map((s) => ({ service: s, p: priced.find((p) => p.service.id === s.id && !p.auto) ?? null })),
    ...priced.filter((p) => p.auto).map((p) => ({ service: p.service, p })),
  ]
  const lineOf = (id: number) => lines.find((l) => l.service.id === id)
  const itemCount = `${lines.length} item${lines.length === 1 ? '' : 's'}`
  const subtotal = lines.reduce((a, l) => a + (l.p?.amountCents ?? 0), 0)
  /** What the package-covered quantities would have cost on their own (shown, never charged). */
  const includedValue = lines.reduce((a, { service: s, p }) =>
    a + (p && p.includedQty > 0 ? Math.round(s.price_cents * (s.pricing_type === 'fixed' ? 1 : p.includedQty)) : 0), 0)
  const discountCents = discount.trim() ? parsePesoToCents(discount) : 0
  const total = subtotal - (discountCents ?? 0)
  const shownTotal = Math.max(total, 0)
  // `paid` holds the amount received. Cash above the total is change, so only the total is recorded as payment.
  const receivedCents = payOpt === 'later' || !paid.trim() ? 0 : parsePesoToCents(paid)
  const isCash = payOpt === 'now' && method === 'cash'
  const tender = isCash && receivedCents !== null ? cashTender(shownTotal, receivedCents) : null
  const paidCents = tender ? tender.applied : receivedCents
  const balance = Math.max(total - (paidCents ?? 0), 0)
  const expectedPickup = schedule === 'later' && pickupDate ? (pickupTime ? `${pickupDate} ${pickupTime}` : pickupDate) : null
  const isWalkIn = customer?.customer_code === WALK_IN_CODE
  const canSms = !!customer?.contact && !isWalkIn

  // Guard deep links / reloads: later steps need a customer, details needs a cart.
  let step: Step = (params.get('step') as Step | null) ?? (preset ? 'services' : 'customer')
  if (step !== 'customer' && !customer && !preset) step = 'customer'
  if (step === 'details' && !lines.length) step = 'cart'
  const error = err?.step === step ? err.msg : ''
  const fail = (msg: string) => setErr({ step, msg })

  useEffect(() => {
    if (step !== 'customer') return
    searchCustomers(search, 50).then((r) => setMatches(r.filter((c) => c.customer_code !== WALK_IN_CODE)))
  }, [search, step])

  const setQty = (id: number, v: string) => setQtyMap((m) => ({ ...m, [id]: v }))

  /** Entering a weight counts the loads (e.g. 8 kg max: 8.1 kg = 2); staff can still change the loads after. */
  function setWeight(s: Service, v: string) {
    setWeightMap((m) => ({ ...m, [s.id]: v }))
    const n = Number(v)
    if (/^\d+(\.\d{1,2})?$/.test(v.trim()) && n > 0) setQty(s.id, String(loadsFor(n, maxKgOf(s, defaultMaxKg))))
  }

  function goTo(s: Step) {
    setErr(null)
    setParams((p) => { const n = new URLSearchParams(p); n.set('step', s); return n })
  }

  function goBack() {
    // react-router keeps the history index in state; fall back to the list when opened directly.
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1)
    else navigate('/orders')
  }

  function addOne(s: Service) {
    // Included add-ons start from what the package already covers, so a tap adds one extra (charged) piece.
    const cur = lineOf(s.id)?.p?.quantity ?? (parseFloat(qty[s.id] ?? '') || 0)
    if (s.pricing_method === 'fixed') return setQty(s.id, '1')
    setQty(s.id, String(Math.round((cur + 1) * 100) / 100))
  }

  function removeLine(s: Service) {
    setQty(s.id, '')
    setWeightMap((m) => ({ ...m, [s.id]: '' }))
  }

  /** Items for createOrder, or an error message for the first bad line. */
  function orderItems(): CartItem[] | string {
    if (!lines.length) return 'Add at least one service.'
    const bad = lines.find((l) => !l.p)
    if (bad) {
      const t = bad.service.pricing_type
      return `Enter a valid ${t === 'per_kg' ? 'weight' : t === 'per_load' ? 'whole number of loads' : 'whole number'} for ${bad.service.name}.`
    }
    const badWeight = picked.find((s) => weightOf(s) === undefined)
    if (badWeight) return `Enter a valid weight for ${badWeight.name}.`
    return cartItems
  }

  async function customerNext() {
    if (walkIn) {
      try { setCustomer(await getWalkInCustomer()) } catch (e) { return fail(e instanceof Error ? e.message : 'Could not start a walk-in order.') }
    } else if (!customer) return fail('Select a customer, or choose Walk-in.')
    goTo('services')
  }

  function cartNext() {
    const items = orderItems()
    if (typeof items === 'string') return fail(items)
    if (discountCents === null) return fail('Invalid discount.')
    if (discountCents > subtotal) return fail('Discount cannot exceed the subtotal.')
    if (!customer) return fail('Select a customer first.')
    goTo('details')
  }

  function review() {
    if (schedule === 'later' && !pickupDate) return fail('Choose a pickup date, or switch to ASAP.')
    if (schedule === 'later' && pickupDate < daysFromNow(0)) return fail('Pickup date cannot be in the past.')
    if (paidCents === null) return fail('Invalid amount paid.')
    if (storeClosed && (paidCents ?? 0) > 0) return fail('The store is closed. Open the store to take payment, or choose Pay Later.')
    if (paidCents > total) return fail('Amount paid cannot exceed the total.')
    if (payOpt === 'now' && total > 0 && paidCents === 0) return fail('Enter the amount received, or choose Pay Later.')
    setErr(null)
    setReviewing(true)
  }

  function smsLink(orderNumber: string) {
    if (!canSms || !customer) return null
    const body = `Hi ${customer.full_name}, we received your laundry order #${orderNumber}. Total: ${formatPeso(shownTotal)}` +
      `${expectedPickup ? `. Pickup: ${pickupLabel(pickupDate, pickupTime)}` : ''}. Thank you! - ${businessName}`
    return `sms:${customer.contact.replace(/[^\d+]/g, '')}?body=${encodeURIComponent(body)}`
  }

  async function printReceipt(id: number) {
    setPrinting({ state: 'busy' })
    try {
      await printOrderReceipt(id)
      setPrinting({ state: 'ok' })
    } catch (e) {
      setPrinting({ state: 'error', msg: e instanceof Error ? e.message : 'Could not print.', noPrinter: e instanceof NoPrinterError })
    }
  }

  async function placeOrder() {
    const items = orderItems()
    if (typeof items === 'string') return fail(items)
    if (!customer) return fail('Select a customer.')
    if (placing.current) return
    placing.current = true
    setBusy(true)
    try {
      const res = await createOrder({
        customerId: customer.id, items, discountCents: discountCents ?? 0, expectedPickup, notes,
        payment: (paidCents ?? 0) > 0 ? { amountCents: paidCents!, method, reference, tenderedCents: isCash ? receivedCents : null } : null,
      })
      const sms = smsLink(res.orderNumber)
      const cash = (paidCents ?? 0) > 0 && method === 'cash'
      setReviewing(false)
      // In the browser there is no Bluetooth; fall back to the printable receipt page.
      if (printOn && !canBluetoothPrint()) return navigate(`/orders/${res.id}/receipt`, { replace: true })
      setDone({ ...res, sms, cash })
      // Printing runs natively, so it keeps going even while the messaging app is open.
      const printed = printOn ? printReceipt(res.id) : Promise.resolve()
      // Drawer opens once the receipt is sent (even if printing failed). The order is saved,
      // so a drawer problem only shows a message, never fails the payment.
      if (cash) printed.then(() => autoOpenCashDrawer(method)).then(setDrawer)
      // Opens the phone's messaging app with the update prefilled; the app stays where it is.
      if (smsOn && sms) location.href = sms
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Failed to save order.')
      placing.current = false
      setBusy(false)
    }
  }

  if (done) {
    const status = paymentStatus(shownTotal, paidCents ?? 0)
    const tile = 'flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl border border-slate-200/80 bg-white px-2 text-sm font-semibold text-slate-800 shadow-[0_1px_3px_rgba(15,23,42,0.05)] transition active:scale-[0.97] active:bg-slate-50 disabled:opacity-60'
    const tileIcon = (icon: ReactNode) => <span className="grid size-9 place-items-center rounded-xl bg-blue-50 text-blue-600"><Icon className="h-5 w-5">{icon}</Icon></span>
    return (
      <div className="mx-auto flex min-h-full max-w-md flex-col">
        <div className="flex-1 space-y-4 pt-4">
          {/* Confirmation: unmistakable at arm's length */}
          <div className="flex flex-col items-center text-center">
            <span className="grid size-20 animate-pop-in place-items-center rounded-full bg-emerald-100 ring-8 ring-emerald-50" aria-hidden>
              <span className="grid size-14 place-items-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30">
                <Icon className="h-8 w-8">{I.tick}</Icon>
              </span>
            </span>
            <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900" role="status">Order placed</h1>
            <p className="mt-1 text-sm text-slate-500">{customer?.full_name}{isWalkIn ? '' : customer?.contact ? ` · ${customer.contact}` : ''}</p>
          </div>

          {/* The one number the cashier must hand over */}
          {tender && tender.change > 0 && (
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-emerald-600 px-4 py-3 text-white shadow-lg shadow-emerald-600/20">
              <span>
                <span className="block text-sm font-semibold">Give change</span>
                <span className="block text-xs text-emerald-100">Received {formatPeso(receivedCents!)}</span>
              </span>
              <span className="text-3xl font-bold tabular-nums">{formatPeso(tender.change)}</span>
            </div>
          )}

          {/* Receipt-style summary */}
          <section className={`${card} overflow-hidden`}>
            <div className="flex items-center justify-between gap-3 border-b border-dashed border-slate-200 px-4 py-3">
              <span className="text-sm text-slate-500">Order no.</span>
              <span className="text-xl font-bold tracking-wide text-blue-700">#{done.orderNumber}</span>
            </div>
            <dl className="space-y-2 px-4 py-3 text-sm">
              <SumRow label={`Total · ${itemCount}`} value={formatPeso(shownTotal)} className="text-base font-bold text-slate-900" />
              <SumRow label={(paidCents ?? 0) > 0 ? `Paid · ${METHODS.find((m) => m.value === method)!.label}` : 'Paid'} value={formatPeso(paidCents ?? 0)} />
              <SumRow label={<span className="flex items-center gap-2">Balance <PaymentBadge status={status} /></span>} value={formatPeso(balance)} className={balance > 0 ? 'font-semibold text-amber-700' : 'text-slate-600'} />
              <SumRow label="Pickup" value={expectedPickup ? pickupLabel(pickupDate, pickupTime) : 'ASAP'} />
            </dl>
          </section>

          {/* Print progress stays visible; it runs by itself right after placing */}
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
                {printing.noPrinter && <Link to="/settings?view=printer" className="mt-1 block font-semibold underline">Set up printer</Link>}
              </span>
            </p>
          )}

          {/* Follow-up actions, equal weight, one tap each */}
          <div className={`grid gap-2 ${done.sms ? 'grid-cols-3' : 'grid-cols-2'}`}>
            {canBluetoothPrint() ? (
              <button type="button" onClick={() => printReceipt(done.id)} disabled={printing?.state === 'busy'} className={tile}>
                {tileIcon(I.printer)}{printing ? 'Print again' : 'Print'}
              </button>
            ) : (
              <Link to={`/orders/${done.id}/receipt`} className={tile}>{tileIcon(I.printer)}Print</Link>
            )}
            {done.sms && <a href={done.sms} className={tile}>{tileIcon(I.message)}Text</a>}
            <Link to={`/orders/${done.id}`} replace className={tile}>{tileIcon(I.receipt)}View order</Link>
          </div>
          {done.cash && <CashDrawerControl status={drawer} />}
        </div>

        {/* Next customer: the main job after a sale */}
        <div className="sticky bottom-0 z-10 -mx-4 mt-6 border-t border-slate-200/70 bg-white/95 px-4 pb-3 pt-3 shadow-[0_-4px_20px_rgba(15,23,42,0.06)] backdrop-blur md:bottom-4 md:mx-0 md:rounded-2xl md:border">
          <a href="#/orders/new" onClick={() => location.reload()} className={primary}>
            <Icon className="h-5 w-5">{I.plus}</Icon>Start new order
          </a>
          <Link to="/orders" replace className="mt-1 flex min-h-11 items-center justify-center text-sm font-semibold text-slate-600 active:text-slate-900">
            Go to all orders
          </Link>
        </div>
      </div>
    )
  }

  const page = (body: ReactNode, bar: ReactNode, info?: ReactNode) => (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col">
      <div className="flex-1 space-y-4">{body}</div>
      <BottomBar error={error} info={info}>{bar}</BottomBar>
    </div>
  )
  const header = (title: string, action?: ReactNode) => <StepHeader title={title} step={step} onBack={goBack} onStep={goTo} action={action} />
  // Shown on every step after the first, so the cashier always knows whose order this is.
  const customerRow = customer && (
    <div className={`${card} flex items-center gap-3 p-3`}>
      {isWalkIn ? (
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600"><Icon className="h-6 w-6">{I.store}</Icon></span>
      ) : <PersonTile />}
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-slate-500">Customer</span>
        <span className="block truncate font-semibold text-slate-900">{customer.full_name}{!isWalkIn && customer.contact && <span className="font-normal text-slate-500"> · {customer.contact}</span>}</span>
      </span>
      <button type="button" onClick={() => goTo('customer')} className="-mr-1 min-h-11 shrink-0 rounded-xl px-3 text-sm font-semibold text-blue-700 active:bg-blue-50">Change</button>
    </div>
  )

  const cartPill = (
    <button type="button" onClick={() => goTo('cart')} aria-label={`Cart, ${lines.length} item${lines.length === 1 ? '' : 's'}`} className={`relative -mr-2 ${iconBtn}`}>
      <Icon className="h-6 w-6">{I.cart}</Icon>
      {lines.length > 0 && (
        <span
          key={lines.length}
          aria-hidden
          className="absolute right-0 top-0 grid h-5 min-w-5 animate-pop-in place-items-center rounded-full bg-blue-600 px-1 text-[11px] font-bold leading-none text-white ring-2 ring-slate-100"
        >
          {lines.length}
        </span>
      )}
    </button>
  )

  // ── Step 1: customer ─────────────────────────────────────────────
  if (step === 'customer') {
    return (
      <>
        {page(
          <>
            {header('Who is this order for?')}
            <Segmented
              label="Customer type"
              value={walkIn ? 'walkin' : 'select'}
              onChange={(v) => {
                setWalkIn(v === 'walkin')
                if (v === 'select' && isWalkIn) setCustomer(null)
              }}
              options={[{ value: 'select', label: 'Select Customer' }, { value: 'walkin', label: 'Walk-in' }]}
            />

            {walkIn ? (
              <div className={`${card} flex flex-col items-center px-6 py-10 text-center`}>
                <span className="grid size-16 place-items-center rounded-full bg-blue-50 text-blue-600">
                  <Icon className="h-8 w-8">{I.store}</Icon>
                </span>
                <p className="mt-3 font-semibold text-slate-900">Walk-in customer</p>
                <p className="mt-1 text-sm text-slate-500">No customer details needed. The order is filed under “Walk-in Customer”.</p>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Icon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400">{I.search}</Icon>
                  <input
                    className={`${field} pl-12`}
                    type="search"
                    enterKeyHint="search"
                    aria-label="Search customer"
                    placeholder="Search customer…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>

                {matches === null ? (
                  <div className="space-y-2" aria-busy="true">
                    {[0, 1, 2].map((i) => <div key={i} className="h-17 animate-pulse rounded-2xl bg-slate-200/60" />)}
                  </div>
                ) : matches.length === 0 ? (
                  <p className="px-2 py-6 text-center text-sm text-slate-500">{search ? `No customer matches “${search}”.` : 'No customers yet.'}</p>
                ) : (
                  <ul role="radiogroup" aria-label="Customer" className="space-y-2">
                    {/* Keep the selected customer in view (e.g. one just added) even when the list doesn't include them. */}
                    {(customer && !isWalkIn && !search && !matches.some((m) => m.id === customer.id) ? [customer, ...matches] : matches).map((c) => {
                      const sel = customer?.id === c.id
                      return (
                        <li key={c.id}>
                          <button
                            type="button"
                            role="radio"
                            aria-checked={sel}
                            onClick={() => setCustomer(c)}
                            className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors ${
                              sel ? 'border-blue-500 bg-blue-50/60 ring-1 ring-blue-500' : 'border-slate-200/80 bg-white active:bg-slate-50'
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
                )}

                <button
                  type="button"
                  onClick={() => setAddingCustomer(true)}
                  className="flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-blue-300 bg-white font-semibold text-blue-700 active:bg-blue-50"
                >
                  <Icon className="h-5 w-5">{I.plus}</Icon>
                  Add New Customer
                </button>
              </>
            )}
          </>,
          <button type="button" onClick={customerNext} disabled={!walkIn && !customer} className={primary}>
            <NextLabel>
              <span className="min-w-0 truncate">
                {walkIn ? 'Continue as walk-in' : customer && !isWalkIn ? `Continue with ${customer.full_name.split(/\s+/)[0]}` : 'Select a customer'}
              </span>
            </NextLabel>
          </button>,
        )}

        {addingCustomer && (
          <Sheet label="New customer" onClose={() => setAddingCustomer(false)}>
            <CustomerForm
              initial={{ ...emptyCustomer, fullName: search }}
              submitLabel="Save & select"
              onCancel={() => setAddingCustomer(false)}
              onSubmit={async (c) => {
                const created = await getCustomer(await createCustomer(c))
                if (!created) throw new Error('Customer was saved but could not be loaded. Search for them below.')
                setCustomer(created)
                setSearch('')
                setAddingCustomer(false)
              }}
            />
          </Sheet>
        )}
      </>
    )
  }

  // ── Step 2: services ─────────────────────────────────────────────
  if (step === 'services') {
    const groups = GROUPS.filter((g) => services.some((s) => kindOf(s) === g.value))
    const q = svcSearch.trim().toLowerCase()
    const shown = services.filter((s) =>
      (!group || kindOf(s) === group) &&
      (!q || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)))
    const byId = new Map(services.map((s) => [s.id, s]))

    return page(
      <>
        {header('Add services', cartPill)}
        <div className="relative">
          <Icon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400">{I.search}</Icon>
          <input
            className={`${field} pl-12`}
            type="search"
            enterKeyHint="search"
            aria-label="Search services"
            placeholder="Search services…"
            value={svcSearch}
            onChange={(e) => setSvcSearch(e.target.value)}
          />
        </div>
        {groups.length > 1 && (
          <div role="tablist" aria-label="Service type" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none md:mx-0 md:px-0">
            <Chip active={!group} onClick={() => setGroup('')}>All</Chip>
            {groups.map((g) => <Chip key={g.value} active={group === g.value} onClick={() => setGroup(g.value)}>{g.label}</Chip>)}
          </div>
        )}

        {services.length === 0 ? (
          <p className={`${card} p-6 text-center text-sm text-slate-500`}>No active services. Ask a manager to add services first.</p>
        ) : shown.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-slate-500">No service matches “{svcSearch}”.</p>
        ) : (
          // Packages, then services, then add-ons (detergent, fabric conditioner…), each under its own heading.
          GROUPS.map((g) => ({ g, list: shown.filter((s) => kindOf(s) === g.value) })).filter((x) => x.list.length > 0).map(({ g, list }, gi, arr) => (
          <section key={g.value} className="space-y-2">
          {(arr.length > 1 || gi > 0) && (
            <h2 className="px-1 pt-2 text-base font-semibold text-slate-900">
              {g.heading}{g.value === 'addon' && <span className="font-normal text-slate-500"> (optional)</span>}
            </h2>
          )}
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {list.map((s) => {
              const line = lineOf(s.id)
              const picked = !!line
              const maxed = picked && s.pricing_method === 'fixed'
              const incl = line?.p && line.p.includedQty > 0
              const note = s.is_package ? includesText(s, byId, inclusions) : ''
              return (
                <li key={s.id} className="relative">
                  {/* The whole card is the tap target: each tap adds one more (fixed-price services add once). */}
                  <button
                    type="button"
                    aria-pressed={picked}
                    aria-label={maxed ? `${s.name} added` : `Add ${s.name}`}
                    onClick={() => addOne(s)}
                    className={`flex h-full w-full flex-col rounded-2xl border p-2 text-left transition active:scale-[0.97] ${
                      picked
                        ? 'border-blue-500 bg-blue-50 shadow-md shadow-blue-600/15 ring-2 ring-blue-500'
                        : 'border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.05)]'
                    }`}
                  >
                    <span className="relative block w-full">
                      <ServiceArt name={s.name} image={s.image} className="aspect-4/3 w-full rounded-xl" iconCls="h-12 w-12" />
                      {picked && (
                        <span className="absolute right-2 top-2 rounded-full bg-blue-600 px-2 py-0.5 text-xs font-bold text-white">
                          {s.pricing_method === 'fixed' ? (incl ? 'Included' : 'Added') : line.p ? qtyText(s.pricing_type, line.p.quantity) : qty[s.id]}
                          {incl && s.pricing_method !== 'fixed' && ` · ${line.p!.chargedQty ? `${line.p!.includedQty} incl.` : 'incl.'}`}
                        </span>
                      )}
                    </span>
                    <span className="mt-2 flex w-full flex-1 items-end gap-2 px-1 pb-1">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-900">{s.name}</span>
                        <span className="block truncate text-xs text-slate-500">
                          <b className="font-semibold text-slate-800">{formatPeso(s.price_cents)}</b>{priceUnit(s.pricing_type)}
                          {s.max_kg != null && ` · ${s.max_kg} kg`}
                        </span>
                        {note && <span className="mt-0.5 line-clamp-2 text-[11px] leading-tight text-slate-500">{note}</span>}
                      </span>
                      <span
                        aria-hidden
                        className={`grid size-10 shrink-0 place-items-center rounded-full ${maxed ? 'bg-white text-blue-600' : 'bg-blue-600 text-white shadow-md shadow-blue-600/30'}`}
                      >
                        <Icon className="h-5 w-5">{maxed ? I.tick : I.plus}</Icon>
                      </span>
                    </span>
                  </button>
                  {isPicked(qty[s.id]) && (
                    // 44px tap area around a smaller visible chip, clear of the card's own tap target.
                    <button
                      type="button"
                      aria-label={`Remove ${s.name}`}
                      onClick={() => removeLine(s)}
                      className="group absolute left-0 top-0 grid size-11 place-items-center rounded-full"
                    >
                      <span className="grid size-8 place-items-center rounded-full bg-white/95 text-slate-600 shadow ring-1 ring-slate-200 group-active:bg-red-50 group-active:text-red-600">
                        <Icon className="h-4 w-4">{I.x}</Icon>
                      </span>
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
          </section>
          ))
        )}
      </>,
      <button type="button" onClick={() => (customer ? goTo('cart') : goTo('customer'))} disabled={!lines.length} className={primary}>
        <NextLabel>{lines.length ? 'Review cart' : 'Tap a service to add'}</NextLabel>
      </button>,
      lines.length > 0 && <BarInfo label={itemCount} value={formatPeso(subtotal)} />,
    )
  }

  // ── Step 3: cart / order summary ─────────────────────────────────
  if (step === 'cart') {
    return (
      <>
        {page(
          <>
            {header(
              'Review cart',
              <button
                type="button"
                aria-label="Clear cart"
                disabled={!lines.length}
                onClick={() => { if (confirm('Remove all services from this order?')) { setQtyMap({}); setWeightMap({}); setDiscount('') } }}
                className={`-mr-2 ${iconBtn} text-slate-500`}
              >
                <Icon className="h-5 w-5">{I.trash}</Icon>
              </button>,
            )}
            {customerRow}

            {lines.length === 0 ? (
              <div className={`${card} flex flex-col items-center px-6 py-10 text-center`}>
                <span className="grid size-16 place-items-center rounded-full bg-blue-50 text-blue-600"><Icon className="h-8 w-8">{I.cart}</Icon></span>
                <p className="mt-3 font-semibold text-slate-900">Your cart is empty</p>
                <p className="mt-1 text-sm text-slate-500">Add laundry services to this order.</p>
                <button type="button" onClick={() => goTo('services')} className="mt-4 min-h-11 rounded-xl bg-blue-50 px-5 font-semibold text-blue-700 active:bg-blue-100">
                  Browse services
                </button>
              </div>
            ) : (
              <>
                <ul className="space-y-3">
                  {lines.map((line) => {
                    const { service: s, p } = line
                    const t = s.pricing_type
                    const userPicked = isPicked(qty[s.id])
                    const maxKg = maxKgOf(s, defaultMaxKg)
                    const w = weightOf(s)
                    const needLoads = t === 'per_load' && w && maxKg ? loadsFor(w, maxKg) : 0
                    const incl = includedText(p)
                    return (
                    <li key={s.id} className={`${card} flex gap-3 p-3`}>
                      <ServiceArt name={s.name} image={s.image} className="size-18 shrink-0 rounded-xl" iconCls="h-9 w-9" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-semibold text-slate-900">{s.name}</div>
                            <div className="text-xs text-slate-500">{p ? lineDetail(line) : qty[s.id]}</div>
                            <div className="text-sm font-semibold text-slate-700">{formatPeso(s.price_cents)}{priceUnit(t)}</div>
                            {p?.note && <div className="mt-0.5 text-xs text-slate-500">{p.note}</div>}
                            {incl && <div className="mt-0.5 text-xs font-semibold text-emerald-700">{incl}</div>}
                          </div>
                          {userPicked && (
                            <button
                              type="button"
                              aria-label={`Remove ${s.name}`}
                              onClick={() => removeLine(s)}
                              className="-mr-1.5 -mt-1.5 grid size-10 shrink-0 place-items-center rounded-full text-slate-400 active:bg-red-50 active:text-red-500"
                            >
                              <Icon className="h-5 w-5">{I.trash}</Icon>
                            </button>
                          )}
                        </div>
                        {t === 'per_load' && (
                          <label className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                            Weight
                            <span className="relative">
                              <input
                                className="h-11 w-24 rounded-xl border border-slate-200 bg-white pl-3 pr-8 text-sm font-semibold tabular-nums text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                inputMode="decimal"
                                placeholder="0"
                                aria-label={`${s.name} weight in kg`}
                                aria-invalid={w === undefined}
                                value={weight[s.id] ?? ''}
                                onChange={(e) => setWeight(s, e.target.value)}
                              />
                              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">kg</span>
                            </span>
                            {maxKg ? <span>max {maxKg} kg / load</span> : null}
                          </label>
                        )}
                        <div className="mt-2 flex items-center justify-between gap-2">
                          {t === 'fixed' ? <span /> : (
                            <Stepper
                              service={s}
                              aria-label={`${s.name} ${t === 'per_kg' ? 'weight in kg' : t === 'per_load' ? 'loads' : 'quantity'}`}
                              aria-invalid={!p}
                              min={s.is_addon && p ? Math.ceil(p.includedQty) : 0}
                              value={p && (s.is_addon || !userPicked) ? String(p.quantity) : qty[s.id] ?? ''}
                              onChange={(v) => setQty(s.id, v)}
                            />
                          )}
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
                  })}
                </ul>

                <button
                  type="button"
                  onClick={() => goTo('services')}
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-blue-300 bg-white font-semibold text-blue-700 active:bg-blue-50"
                >
                  <Icon className="h-5 w-5">{I.plus}</Icon>Add more services
                </button>

                <dl className={`${card} space-y-2 p-4 text-sm`}>
                  <SumRow label="Subtotal" value={formatPeso(subtotal)} />
                  {includedValue > 0 && (
                    <p className="text-xs text-emerald-700">{formatPeso(includedValue)} of items included in packages — not charged.</p>
                  )}
                  <button type="button" onClick={() => setDiscountDraft(discount)} className="-mx-2 flex min-h-10 w-[calc(100%+1rem)] items-center justify-between rounded-lg px-2 text-slate-600 active:bg-slate-50">
                    <span>Discount</span>
                    <span className="flex items-center gap-1 tabular-nums">
                      {discountCents === null ? <span className="text-red-600">Invalid</span> : (discountCents > 0 ? `−${formatPeso(discountCents)}` : formatPeso(0))}
                      <Icon className="h-4 w-4 text-slate-400">{I.chevron}</Icon>
                    </span>
                  </button>
                  <SumRow
                    label="Total"
                    value={formatPeso(shownTotal)}
                    className="border-t border-slate-100 pt-3 text-xl font-bold text-slate-900"
                  />
                </dl>
              </>
            )}
          </>,
          <button type="button" onClick={cartNext} disabled={!lines.length} className={primary}><NextLabel>Payment</NextLabel></button>,
          lines.length > 0 && <BarInfo label={`Total · ${itemCount}`} value={formatPeso(shownTotal)} />,
        )}

        {discountDraft !== null && (
          <Sheet label="Discount" onClose={() => setDiscountDraft(null)}>
            <form
              className="space-y-4"
              onSubmit={(e) => { e.preventDefault(); setDiscount(discountDraft); setDiscountDraft(null) }}
            >
              <label className="block text-sm font-medium text-slate-600">
                Discount amount
                <PesoInput autoFocus value={discountDraft} onChange={(e) => setDiscountDraft(e.target.value)} />
              </label>
              {(() => {
                const c = discountDraft.trim() ? parsePesoToCents(discountDraft) : 0
                const msg = c === null ? 'Enter a valid amount.' : c > subtotal ? `Cannot exceed the subtotal (${formatPeso(subtotal)}).` : ''
                return (
                  <>
                    {msg && <p role="alert" className="text-sm font-medium text-red-600">{msg}</p>}
                    <div className="flex gap-2">
                      <button type="button" onClick={() => { setDiscount(''); setDiscountDraft(null) }} className="min-h-12 flex-1 rounded-xl bg-slate-100 font-semibold text-slate-700 active:bg-slate-200">
                        No discount
                      </button>
                      <button disabled={!!msg} className="min-h-12 flex-1 rounded-xl bg-blue-600 font-semibold text-white active:bg-blue-700 disabled:bg-blue-300">
                        Apply
                      </button>
                    </div>
                  </>
                )
              })()}
            </form>
          </Sheet>
        )}
      </>
    )
  }

  // ── Step 4: additional details ───────────────────────────────────
  const minDate = ymd(new Date())
  const methodLabel = METHODS.find((m) => m.value === method)!.label
  return (
    <>
      {page(
        <>
          {header('Payment & pickup')}
          {customerRow}

          {/* Payment first: it is the one thing every order needs here. */}
          <section className={`${card} space-y-4 p-4`}>
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-semibold text-slate-900">Payment</h2>
              <span className="text-sm text-slate-500">Total <b className="text-base tabular-nums text-slate-900">{formatPeso(shownTotal)}</b></span>
            </div>
            <Segmented
              label="Payment option"
              value={payOpt}
              onChange={(v) => { setPayOpt(v); if (v === 'later') setPaid('') }}
              options={[{ value: 'now', label: 'Pay now' }, { value: 'later', label: 'Pay later' }]}
            />
            {payOpt === 'now' ? (
              <>
                <StoreClosedNotice action="take payment (or choose Pay Later)" />
                <div>
                  <p className="mb-1.5 text-sm font-medium text-slate-600">Method</p>
                  <Segmented label="Payment method" value={method} onChange={(v) => { setMethod(v); if (v === 'cash') setReference('') }} options={METHODS} />
                </div>
                <label className="block text-sm font-medium text-slate-600">
                  {method === 'cash' ? 'Cash received' : 'Amount paid'}
                  <PesoInput value={paid} onChange={(e) => setPaid(e.target.value)} />
                </label>
                {/* One tap for the usual amounts: exact, or the bill the customer hands over. */}
                <div role="group" aria-label="Quick amounts" className="flex flex-wrap gap-2">
                  {(method === 'cash' ? quickCash(shownTotal) : shownTotal > 0 ? [shownTotal] : []).map((c, i) => {
                    const on = paid.trim() !== '' && parsePesoToCents(paid) === c
                    return (
                      <button
                        key={c}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setPaid(centsToInput(c))}
                        className={`min-h-11 rounded-full px-4 text-sm font-semibold tabular-nums transition-colors ${
                          on ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30' : 'border border-slate-200 bg-white text-slate-700 active:bg-slate-50'
                        }`}
                      >
                        {i === 0 ? `${method === 'cash' ? 'Exact' : 'Full amount'} ${formatPeso(c)}` : formatPeso(c)}
                      </button>
                    )
                  })}
                </div>
                {method === 'cash' && <CashChange dueCents={shownTotal} received={paid} />}
                {method !== 'cash' && (
                  <label className="block text-sm font-medium text-slate-600">
                    Reference no. <span className="font-normal text-slate-400">(optional)</span>
                    <input className={`${field} mt-1`} inputMode="text" autoCapitalize="characters" placeholder={method === 'gcash' ? 'GCash reference' : 'Reference'} value={reference} onChange={(e) => setReference(e.target.value)} />
                  </label>
                )}
                <p className="text-xs text-slate-500">A partial amount leaves the rest as balance due, collected later from the order.</p>
              </>
            ) : (
              <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                Saved as <b>UNPAID</b> with {formatPeso(shownTotal)} balance due. Collect payment later from the order.
              </p>
            )}
          </section>

          <section className={`${card} space-y-3 p-4`}>
            <h2 className="font-semibold text-slate-900">Pickup <span className="font-normal text-slate-500">(optional)</span></h2>
            <Segmented
              label="Pickup schedule"
              value={schedule}
              onChange={(v) => {
                setSchedule(v)
                if (v === 'later' && !pickupDate) setPickupDate(daysFromNow(1))
              }}
              options={[{ value: 'asap', label: 'ASAP' }, { value: 'later', label: 'Schedule Later' }]}
            />
            {schedule === 'later' ? (
              <div className="grid grid-cols-[1.35fr_1fr] gap-2">
                <DateInput className={field} aria-label="Pickup date" min={minDate} value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} />
                <DateInput className={field} type="time" aria-label="Pickup time (optional)" value={pickupTime} onChange={(e) => setPickupTime(e.target.value)} />
              </div>
            ) : (
              <p className="text-xs text-slate-500">Customer picks up as soon as the order is ready.</p>
            )}
          </section>

          <section className={`${card} space-y-2 p-4`}>
            <label htmlFor="notes" className="font-semibold text-slate-900">Notes <span className="font-normal text-slate-500">(Optional)</span></label>
            <div className="relative">
              <Icon className="pointer-events-none absolute left-4 top-3.5 h-5 w-5 text-slate-400">{I.note}</Icon>
              <textarea
                id="notes"
                className={`${field} resize-none pl-12`}
                rows={2}
                maxLength={NOTES_MAX}
                placeholder="e.g. special instructions…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <p className="text-right text-xs tabular-nums text-slate-400">{notes.length}/{NOTES_MAX}</p>
          </section>

          <section className={`${card} divide-y divide-slate-100`}>
            <h2 className="sr-only">After placing</h2>
            <ToggleRow icon={I.printer} title="Print receipt" hint="Right after the order is placed" on={printOn} onChange={setPrintOn} />
            <ToggleRow
              icon={I.message}
              title="Text the customer"
              hint={canSms ? 'Opens SMS with the order details filled in' : 'No mobile number on file'}
              on={smsOn}
              onChange={setSmsOn}
              disabled={!canSms}
            />
          </section>
        </>,
        <button type="button" onClick={review} className={primary}><NextLabel>Review order</NextLabel></button>,
        <BarInfo label="Total" value={formatPeso(shownTotal)} />,
      )}

      {reviewing && (
        <Sheet label="Review Order" onClose={() => !busy && setReviewing(false)}>
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
              <PersonTile />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-slate-900">{customer?.full_name}</span>
                <span className="block truncate text-sm text-slate-500">{isWalkIn ? 'Walk-in' : customer?.contact || customer?.customer_code}</span>
              </span>
            </div>

            <ul className="divide-y divide-slate-100 text-sm">
              {lines.map((l) => (
                <li key={l.service.id} className="flex items-baseline justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-900">{l.service.name}</span>
                    <span className="block text-xs text-slate-500">{lineDetail(l)}</span>
                    {l.p?.note && <span className="block text-xs text-slate-400">{l.p.note}</span>}
                    {includedText(l.p) && <span className="block text-xs font-medium text-emerald-700">{includedText(l.p)}</span>}
                  </span>
                  <span className="shrink-0 tabular-nums text-slate-900">{formatPeso(l.p?.amountCents ?? 0)}</span>
                </li>
              ))}
            </ul>

            <dl className="space-y-2 border-t border-slate-100 pt-3 text-sm">
              <SumRow label="Subtotal" value={formatPeso(subtotal)} />
              {(discountCents ?? 0) > 0 && <SumRow label="Discount" value={`−${formatPeso(discountCents!)}`} />}
              <SumRow label="Total" value={formatPeso(shownTotal)} className="text-lg font-bold text-slate-900" />
              <SumRow label="Payment" value={payOpt === 'later' ? 'Pay Later' : 'Pay Now'} />
              {tender && (receivedCents ?? 0) > 0 && <SumRow label="Amount received" value={formatPeso(receivedCents!)} />}
              <SumRow label={(paidCents ?? 0) > 0 ? `Paid (${methodLabel})` : 'Paid'} value={formatPeso(paidCents ?? 0)} />
              <SumRow
                label={<span className="flex items-center gap-2">Balance <PaymentBadge status={paymentStatus(shownTotal, paidCents ?? 0)} /></span>}
                value={formatPeso(balance)}
              />
              <SumRow label="Pickup" value={expectedPickup ? pickupLabel(pickupDate, pickupTime) : 'ASAP'} />
            </dl>
            {tender && tender.change > 0 && (
              <div className="flex items-baseline justify-between gap-3 rounded-2xl bg-emerald-50 px-4 py-3 text-emerald-800">
                <span className="font-semibold">Change</span>
                <span className="text-3xl font-bold tabular-nums">{formatPeso(tender.change)}</span>
              </div>
            )}
            {notes.trim() && <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">{notes.trim()}</p>}

            {error &&<p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">{error}</p>}
            <button type="button" onClick={placeOrder} disabled={busy} className={primary}>
              <Icon className="h-5 w-5">{I.bag}</Icon>
              {busy ? 'Placing order…' : `Place Order · ${formatPeso(shownTotal)}`}
            </button>
          </div>
        </Sheet>
      )}
    </>
  )
}
