import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { DrawerMsg } from '../components/CashDrawer'
import { useStoreShift } from '../components/StoreStatus'
import { getCustomer, recentCustomers, searchCustomers, WALK_IN_CODE } from '../db/customers'
import { createOrder } from '../db/orders'
import { listInclusions, listServices } from '../db/services'
import { getSettings } from '../db/settings'
import { formatPeso, parsePesoToCents } from '../lib/money'
import { parseNumber, stripGrouping } from '../lib/number'
import { normalizeQuantity } from '../lib/orders'
import { loadsFor, maxKgOf, parseMaxKg, priceCart, type CartItem, type PricedLine } from '../lib/pricing'
import { autoOpenCashDrawer, canBluetoothPrint, NoPrinterError, printOrderReceipt } from '../lib/printer'
import type { Customer, Inclusion, PaymentMethod, Service } from '../types'

/**
 * Everything a new order is made of — customer, services, add-ons, pricing, payment, pickup — and the one routine
 * that places it. Shared by the phone and tablet/desktop New Order wizards (hooks/useOrderWizard.ts): they differ
 * only in layout, never in pricing or validation.
 */

/** Full = the whole total now; Partial = part now, the rest stays as balance; Later = nothing now (Unpaid). */
export type PayOption = 'full' | 'partial' | 'later'
export const PAY_OPTION_LABEL: Record<PayOption, string> = { full: 'Full Payment', partial: 'Partial Payment', later: 'Pay Later' }

/** A cart row: a priced line, or a picked service whose quantity is invalid (priced null, flagged). */
export interface Line {
  service: Service
  p: PricedLine | null
}

/** A service counts as picked once it has a non-zero quantity (invalid text still counts, so it gets flagged). */
export const isPicked = (qty: string | undefined) => !!qty?.trim() && parseNumber(qty) !== 0

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const daysFromNow = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d) }
export const todayYmd = () => ymd(new Date())

export function pickupLabel(date: string, time: string) {
  const d = new Date(`${date}T${time || '00:00'}`)
  const day = d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
  return time ? `${day}, ${d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}` : day
}

export type OrderDraft = ReturnType<typeof useOrderDraft>

export function useOrderDraft(preset: number) {
  const navigate = useNavigate()
  const [services, setServices] = useState<Service[]>([])
  const [inclusions, setInclusions] = useState<Inclusion[]>([])
  const [defaultMaxKg, setDefaultMaxKg] = useState<number | null>(null)
  const [weight, setWeightMap] = useState<Record<number, string>>({}) // per-load services: kg entered
  const [customer, setCustomer] = useState<Customer | null>(null)
  // Opened from a customer's page: that customer is still loading, so the wizard waits before asking for one.
  const [presetPending, setPresetPending] = useState(!!preset)
  const [qty, setQtyMap] = useState<Record<number, string>>({})
  const [discount, setDiscount] = useState('')
  const [schedule, setSchedule] = useState<'asap' | 'later'>('asap')
  const [pickupDate, setPickupDate] = useState('')
  const [pickupTime, setPickupTime] = useState('')
  const [notes, setNotes] = useState('')
  const [payOpt, setPayOpt] = useState<PayOption>('full')
  const [paid, setPaid] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [reference, setReference] = useState('')
  const [smsOn, setSmsOn] = useState(true)
  const [printOn, setPrintOn] = useState(true)
  const [businessName, setBusinessName] = useState('')
  const [busy, setBusy] = useState(false)
  const placing = useRef(false) // blocks a double tap creating two orders
  const storeClosed = useStoreShift().shift === null // money can't be taken until the store is opened
  const [done, setDone] = useState<{ id: number; orderNumber: string; sms: string | null; cash: boolean } | null>(null)
  const [drawer, setDrawer] = useState<DrawerMsg>(null)
  const [printing, setPrinting] = useState<{ state: 'busy' | 'ok' | 'error'; msg?: string; noPrinter?: boolean } | null>(null)

  useEffect(() => {
    // Opened from a customer's page: start with that customer selected.
    // The legacy walk-in record can't take new orders, so it is never preselected.
    if (preset) {
      getCustomer(preset)
        .then((c) => c && c.customer_code !== WALK_IN_CODE && setCustomer(c))
        .catch(console.error) // staff just pick the customer instead
        .finally(() => setPresetPending(false))
    }
    listServices(true).then(setServices).catch(console.error)
    listInclusions().then(setInclusions).catch(console.error)
    getSettings().then((s) => {
      setBusinessName(s.business_name || 'Sellix Laundry')
      setDefaultMaxKg(parseMaxKg(s.load_max_kg))
      // A default turnaround means orders are normally scheduled; preselect that date.
      if (!/^\d+$/.test(s.default_pickup_days ?? '')) return
      setPickupDate(daysFromNow(Number(s.default_pickup_days)))
      setSchedule('later')
    }).catch(console.error)
  }, [preset])

  // Derived money, all in centavos. Priced by the same routine createOrder uses, which re-validates on save.
  const picked = services.filter((s) => isPicked(qty[s.id]))
  // parseNumber, not parseFloat(): "2abc" must be rejected, not read as 2; "1,000" is 1000.
  const quantityOf = (s: Service) => normalizeQuantity(s.pricing_method, parseNumber(qty[s.id]) ?? NaN)
  /** Weight for a per-load line: a number, null when blank, undefined when invalid. */
  const weightOf = (s: Service): number | null | undefined => {
    const w = stripGrouping(weight[s.id] ?? '')
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
  /** Laundry services and packages (the Services step) vs add-ons (the Add-ons step), including ones a package adds. */
  const serviceLines = lines.filter((l) => !l.service.is_addon)
  const addonLines = lines.filter((l) => l.service.is_addon)
  const itemCount = `${lines.length} item${lines.length === 1 ? '' : 's'}`
  const subtotal = lines.reduce((a, l) => a + (l.p?.amountCents ?? 0), 0)
  /** What the package-covered quantities would have cost on their own (shown, never charged). */
  const includedValue = lines.reduce((a, { service: s, p }) =>
    a + (p && p.includedQty > 0 ? Math.round(s.price_cents * (s.pricing_type === 'fixed' ? 1 : p.includedQty)) : 0), 0)
  const discountCents = discount.trim() ? parsePesoToCents(discount) : 0
  const total = subtotal - (discountCents ?? 0)
  const shownTotal = Math.max(total, 0)
  // `paid` is what staff type: cash received for Full Payment, the amount paid now for Partial.
  // Cash above the total is change handed back, so only the total is ever recorded as payment.
  const isCash = method === 'cash'
  const enteredCents = !paid.trim() ? 0 : parsePesoToCents(paid)
  let paidCents: number | null
  let receivedCents: number | null = null // cash handed over (tendered); cash payments only
  if (payOpt === 'later') paidCents = 0
  else if (payOpt === 'partial') {
    paidCents = enteredCents
    if (isCash) receivedCents = enteredCents
  } else if (!isCash) paidCents = shownTotal // GCash / other: exactly the total
  else {
    receivedCents = enteredCents
    paidCents = receivedCents === null ? null : Math.min(receivedCents, shownTotal)
  }
  const change = payOpt === 'full' && isCash && receivedCents !== null ? Math.max(receivedCents - shownTotal, 0) : 0
  const balance = Math.max(total - (paidCents ?? 0), 0)
  const expectedPickup = schedule === 'later' && pickupDate ? (pickupTime ? `${pickupDate} ${pickupTime}` : pickupDate) : null
  const canSms = !!customer?.contact

  const setQty = (id: number, v: string) => setQtyMap((m) => ({ ...m, [id]: v }))

  /** Entering a weight counts the loads (e.g. 8 kg max: 8.1 kg = 2); staff can still change the loads after. */
  function setWeight(s: Service, v: string) {
    setWeightMap((m) => ({ ...m, [s.id]: v }))
    const raw = stripGrouping(v)
    const n = Number(raw)
    if (/^\d+(\.\d{1,2})?$/.test(raw) && n > 0) setQty(s.id, String(loadsFor(n, maxKgOf(s, defaultMaxKg))))
  }

  function addOne(s: Service) {
    // Included add-ons start from what the package already covers, so a tap adds one extra (charged) piece.
    const cur = lineOf(s.id)?.p?.quantity ?? (parseNumber(qty[s.id]) ?? 0)
    if (s.pricing_method === 'fixed') return setQty(s.id, '1')
    setQty(s.id, String(Math.round((cur + 1) * 100) / 100))
  }

  function removeLine(s: Service) {
    setQty(s.id, '')
    setWeightMap((m) => ({ ...m, [s.id]: '' }))
  }

  /** Switching how the customer pays starts the amount fresh; Pay Later never carries an amount. */
  function choosePayOption(v: PayOption) {
    setPayOpt(v)
    setPaid('')
  }

  /** The first invalid quantity or weight among these lines, as a message; null when all are valid. */
  function linesError(ls: Line[]): string | null {
    const bad = ls.find((l) => !l.p)
    if (bad) {
      const t = bad.service.pricing_type
      return `Enter a valid ${t === 'per_kg' ? 'weight' : t === 'per_load' ? 'whole number of loads' : 'whole number'} for ${bad.service.name}.`
    }
    const badWeight = ls.find((l) => isPicked(qty[l.service.id]) && weightOf(l.service) === undefined)
    return badWeight ? `Enter a valid weight for ${badWeight.service.name}.` : null
  }

  // Each wizard step's check; null = the step is complete. placeOrder runs them all again before saving.
  const customerError = () => (customer ? null : 'Select a customer, or add a new one.')
  /** At least one laundry service (or package) picked by staff; add-ons alone are not an order. */
  const servicesError = () => (picked.some((s) => !s.is_addon) ? linesError(serviceLines) : 'Select at least one service.')
  const addonsError = () => linesError(addonLines)
  function discountError(): string | null {
    if (discountCents === null) return 'Enter a valid discount amount, e.g. 50.'
    if (discountCents > subtotal) return 'Discount cannot exceed the subtotal.'
    return null
  }
  function pickupError(): string | null {
    if (schedule === 'later' && !pickupDate) return 'Choose a pickup date, or switch to ASAP.'
    if (schedule === 'later' && pickupDate < daysFromNow(0)) return 'Pickup date cannot be in the past.'
    return null
  }
  /** Everything before payment: services, add-ons, discount and pickup. */
  const summaryError = (): string | null => servicesError() ?? addonsError() ?? discountError() ?? pickupError()
  function paymentError(): string | null {
    if (payOpt === 'later') return null
    if (paidCents === null) return 'Enter a valid amount, e.g. 500 or 500.50.'
    if (storeClosed && (paidCents > 0 || payOpt === 'partial')) return 'The store is closed. Open the store to take payment, or choose Pay Later.'
    if (payOpt === 'partial') {
      if (total <= 0) return 'Nothing to pay on this order. Choose Full Payment.'
      if (paidCents <= 0) return 'Enter the amount paid now.'
      if (paidCents >= total) return 'That covers the whole total. Choose Full Payment instead.'
      return null
    }
    if (isCash && (receivedCents ?? 0) < total) {
      return !paid.trim() ? 'Enter the amount received.' : 'Amount received is less than the total. Choose Partial Payment to leave a balance.'
    }
    return null
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

  /**
   * Saves the order as Received, records the payment, then prints the receipt. Every step is
   * re-checked first, and the database re-prices and re-validates everything again inside one transaction.
   */
  async function placeOrder(fail: (msg: string) => void) {
    const err = customerError() ?? summaryError() ?? paymentError()
    if (err || !customer) return fail(err ?? 'Select a customer.')
    if (placing.current) return
    placing.current = true
    setBusy(true)
    try {
      const res = await createOrder({
        customerId: customer.id, items: cartItems, discountCents: discountCents ?? 0, expectedPickup, notes,
        payment: (paidCents ?? 0) > 0 ? { amountCents: paidCents!, method, reference, tenderedCents: isCash ? receivedCents : null } : null,
      })
      const sms = smsLink(res.orderNumber)
      const cash = (paidCents ?? 0) > 0 && method === 'cash'
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

  return {
    services, inclusions, defaultMaxKg,
    customer, setCustomer, presetPending,
    qty, setQty, weight, setWeight, weightOf, addOne, removeLine,
    picked, lines, serviceLines, addonLines, lineOf, itemCount, subtotal, includedValue,
    discount, setDiscount, discountCents, total, shownTotal,
    payOpt, choosePayOption, paid, setPaid, method, setMethod, reference, setReference,
    receivedCents, isCash, change, paidCents, balance, storeClosed,
    schedule, setSchedule, pickupDate, setPickupDate, pickupTime, setPickupTime, expectedPickup,
    notes, setNotes, smsOn, setSmsOn, printOn, setPrintOn, canSms,
    busy,
    done, drawer, printing, printReceipt,
    customerError, servicesError, addonsError, discountError, pickupError, summaryError, paymentError, placeOrder,
  }
}

/**
 * Customer picker for the order, loaded only while `enabled`: the most recent customers until something is typed,
 * then matches by name or phone. The legacy walk-in record is never offered.
 */
export function useCustomerSearch(enabled: boolean) {
  const [search, setSearch] = useState('')
  const [matches, setMatches] = useState<Customer[] | null>(null)
  const recent = !search.trim()
  useEffect(() => {
    if (!enabled) return
    let live = true
    const load = recent ? recentCustomers(12) : searchCustomers(search, 50)
    load
      .then((r) => live && setMatches(r.filter((c) => c.customer_code !== WALK_IN_CODE)))
      .catch(() => live && setMatches([]))
    return () => { live = false } // a slower earlier search must not overwrite a newer one
  }, [search, recent, enabled])
  return { search, setSearch, matches, recent }
}
