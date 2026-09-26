import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { PaymentBadge } from '../components/Badges'
import { I, Icon, serviceIcon } from '../components/Icons'
import { BackHeader, card, EmptyCard, primary } from '../components/Manage'
import PaymentForm from '../components/PaymentForm'
import RefundForm from '../components/RefundForm'
import { CashDrawerControl, type DrawerMsg } from '../components/CashDrawer'
import { useAdminPin } from '../components/AdminPin'
import { MachinePanel, MachinePicker, type OrderMachines } from '../components/MachinePanel'
import type { ScannedState } from '../components/ScanOrder'
import { Sheet } from '../components/Sheet'
import { useAuth } from '../context/AuthContext'
import { assignMachine, finishDrying, finishWashing, getOrderMachines } from '../db/machines'
import { getOrderDetail, setOrderStatus } from '../db/orderQueries'
import { itemQtyLine } from '../lib/pricing'
import { formatDateTime, formatPeso, formatPickup } from '../lib/money'
import { isFinal, METHOD_LABEL, STATUS_FLOW, STATUS_LABEL } from '../lib/orders'
import { autoOpenCashDrawer } from '../lib/printer'
import type { Machine, MachineType, OrderStatus } from '../types'

type Detail = NonNullable<Awaited<ReturnType<typeof getOrderDetail>>>

/** Status strip look per status: tone classes, glyph and what staff should know or do next. */
const STATUS_META: Record<OrderStatus, { banner: string; text: string; icon: ReactNode; desc: string }> = {
  received: { banner: 'bg-orange-50', text: 'text-orange-700', icon: I.clock, desc: 'Waiting for a washer. Tap Start Washing when it goes in.' },
  washing: { banner: 'bg-blue-50', text: 'text-blue-700', icon: I.washer, desc: 'In the washer. Tap Finish Washing when the cycle ends.' },
  drying: { banner: 'bg-blue-50', text: 'text-blue-700', icon: I.refresh, desc: 'In the dryer. Tap Finish Drying when the cycle ends.' },
  ready: { banner: 'bg-blue-50', text: 'text-blue-700', icon: I.shirt, desc: 'Folded and waiting for the customer.' },
  released: { banner: 'bg-emerald-50', text: 'text-emerald-700', icon: I.check, desc: 'Picked up by the customer.' },
  cancelled: { banner: 'bg-red-50', text: 'text-red-700', icon: I.x, desc: 'This order was cancelled and can no longer be changed.' },
}

/** Short labels so all five steps fit side by side on a phone. */
const STEP_LABEL: Partial<Record<OrderStatus, string>> = { received: 'Received', washing: 'Washing', drying: 'Drying', ready: 'Ready', released: 'Completed' }

const secondary = 'inline-flex min-h-13 min-w-0 items-center justify-center gap-2 rounded-2xl bg-blue-50 px-3 text-center font-semibold leading-tight text-blue-600 active:bg-blue-100 disabled:opacity-60'
const outline = 'min-h-13 w-full rounded-2xl border border-blue-200 bg-white font-semibold text-blue-600 active:bg-blue-50'

/** A contact that looks like a phone number, normalized for a tel: link; null otherwise. */
const phoneOf = (contact: string | null | undefined) => {
  const digits = contact?.replace(/[\s()-]/g, '') ?? ''
  return /^\+?\d{7,15}$/.test(digits) ? digits : null
}

/** Expected pickup ("YYYY-MM-DD" or "YYYY-MM-DD HH:MM") as the moment it's due; a date alone is due by end of day. */
const pickupDue = (value: string) => {
  const [date, time] = value.split(' ')
  const d = new Date(`${date}T${time || '23:59'}`)
  return Number.isNaN(d.getTime()) ? null : d
}

interface NextAction {
  label: string
  icon: ReactNode
  run: () => void
}

export default function OrderDetail() {
  const id = Number(useParams().id)
  const navigate = useNavigate()
  const { user } = useAuth()
  // Opened by Scan QR: say up front whether this laundry can be handed over.
  const scanned = !!(useLocation().state as ScannedState | null)?.scanned
  const [data, setData] = useState<Detail | null | undefined>(undefined)
  const [machines, setMachines] = useState<OrderMachines | null>(null)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [paying, setPaying] = useState(false)
  // Refund sheet; skipPin when it follows straight on from an admin-approved cancellation.
  const [refunding, setRefunding] = useState<{ skipPin: boolean } | null>(null)
  const [refundDone, setRefundDone] = useState<string | null>(null)
  const [picker, setPicker] = useState<{ type: MachineType; title: string } | null>(null)
  const [menu, setMenu] = useState(false)
  const [confirming, setConfirming] = useState(false) // "Release laundry?" sheet
  const [busy, setBusy] = useState(false)
  const running = useRef(false) // blocks a double tap running the same step twice
  const [paidId, setPaidId] = useState<number | null>(null) // payment just collected; offers its receipt
  const [drawer, setDrawer] = useState<DrawerMsg>(null) // cash drawer result for that payment
  const { approve, sheet } = useAdminPin()

  const load = useCallback(async () => {
    try {
      const [d, m] = await Promise.all([getOrderDetail(id), getOrderMachines(id)])
      setData(d)
      setMachines(m)
      setLoadError('')
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load this order.')
    }
  }, [id])
  useEffect(() => { load() }, [load])

  // Close the overflow menu with Escape, like the sheets do.
  useEffect(() => {
    if (!menu) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [menu])

  const back = () => navigate('/orders')

  if (data === undefined || !machines) {
    return (
      <div className="mx-auto max-w-5xl">
        <BackHeader title="Order Details" onBack={back} />
        {loadError ? (
          <div className={`${card} mt-4`}>
            <EmptyCard icon={I.info} title="Couldn't load this order" text={loadError} />
            <div className="px-6 pb-8 text-center">
              <button type="button" onClick={load} className={primary}><Icon className="h-5 w-5">{I.refresh}</Icon>Try again</button>
            </div>
          </div>
        ) : (
          <div aria-busy="true" aria-label="Loading order" className="mt-4 grid animate-pulse grid-cols-1 gap-5 motion-reduce:animate-none lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="space-y-5">
              <div className="h-44 rounded-2xl bg-slate-200/70" />
              <div className="h-24 rounded-2xl bg-slate-200/70" />
              <div className="h-40 rounded-2xl bg-slate-200/70" />
            </div>
            <div className="h-56 rounded-2xl bg-slate-200/70" />
          </div>
        )}
      </div>
    )
  }
  if (data === null)
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <BackHeader title="Order Details" onBack={back} />
        <div className={card}><EmptyCard icon={I.orders} title="Order not found" text="It may have been removed or the link is wrong." /></div>
      </div>
    )

  const { order, items, payments, refunds } = data
  const balance = order.total_cents - order.paid_cents
  const meta = STATUS_META[order.status]
  const current = machines.current
  const washed = order.status === 'washing' && !current
  const canPay = balance > 0 && order.status !== 'cancelled'
  const refundable = order.paid_cents - order.refunded_cents
  const canRefund = order.status === 'cancelled' && refundable > 0
  const locked = isFinal(order.status)
  const phone = phoneOf(order.customer_contact)

  /** Runs one workflow step at a time, then reloads; the database re-checks every step. */
  async function step(fn: () => Promise<unknown>) {
    if (running.current) return false
    running.current = true
    setBusy(true)
    let ok = false
    try {
      await fn()
      setError('')
      ok = true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed.')
    } finally {
      running.current = false
      setBusy(false)
    }
    await load()
    return ok
  }

  async function cancelOrder() {
    const reason = refundable > 0
      ? `Cancel this order? This cannot be undone. ${formatPeso(refundable)} was paid; you can refund it next.`
      : 'Cancel this order? This cannot be undone.'
    if (!(await approve(reason))) return
    // Money was taken: go straight to the refund, already approved by the same PIN.
    if ((await step(() => setOrderStatus(id, 'cancelled', user!.id))) && refundable > 0) setRefunding({ skipPin: true })
  }

  async function pickMachine(m: Machine) {
    await assignMachine(id, m.id) // errors are shown inside the picker
    setPicker(null)
    setError('')
    await load()
  }

  /** The one prominent button: what staff should do next for this order. */
  let next: NextAction | null = null
  if (order.status === 'received') next = { label: 'Start Washing', icon: I.washer, run: () => setPicker({ type: 'washer', title: 'Start Washing' }) }
  else if (order.status === 'washing' && current) next = { label: 'Finish Washing', icon: I.check, run: () => step(() => finishWashing(id)) }
  else if (washed) next = { label: 'Move to Dryer', icon: I.next, run: () => setPicker({ type: 'dryer', title: 'Move to Dryer' }) }
  else if (order.status === 'drying') next = { label: 'Finish Drying', icon: I.check, run: () => step(() => finishDrying(id)) }
  else if (order.status === 'ready' && balance > 0) next = { label: order.paid_cents > 0 ? 'Collect Remaining Balance' : 'Collect Payment', icon: I.wallet, run: () => setPaying(true) }
  else if (order.status === 'ready') next = { label: 'Release Laundry', icon: I.bag, run: () => setConfirming(true) }

  /** Release is the only way to Completed and always needs this confirmation; the database re-checks the balance. */
  function release() {
    setConfirming(false)
    step(async () => {
      await setOrderStatus(id, 'released', user!.id)
      if (scanned) navigate(`/orders/${id}`, { replace: true }) // drop the scan notice; the order is now done
    })
  }

  // After a scan: can this laundry be handed over? Final and in-progress orders must not be released.
  const scanNotice = !scanned ? null
    : order.status === 'released' ? { tone: 'bg-red-50 text-red-700', text: `Already completed${order.released_at ? ` on ${formatDateTime(order.released_at)}` : ''}${order.released_by_name ? ` by ${order.released_by_name}` : ''}. This laundry was released — do not hand it over again.` }
    : order.status === 'cancelled' ? { tone: 'bg-red-50 text-red-700', text: 'This order was cancelled. Do not release any laundry for it.' }
    : order.status !== 'ready' ? { tone: 'bg-amber-50 text-amber-800', text: `Not ready for pickup — still ${STATUS_LABEL[order.status]}. The laundry can't be released yet.` }
    : { tone: 'bg-emerald-50 text-emerald-700', text: balance > 0 ? `Order found. Collect ${formatPeso(balance)} before releasing the laundry.` : 'Order found. Fully paid — ready to release.' }

  const receiptLink = (
    <Link to={`/orders/${id}/receipt`} className={secondary}>
      <Icon className="h-5 w-5">{I.receipt}</Icon>Receipt
    </Link>
  )
  const side = canPay && next?.label !== 'Collect Payment' ? (
    <button type="button" onClick={() => setPaying(true)} disabled={busy} className={secondary}>
      <Icon className="h-5 w-5">{I.wallet}</Icon>Payment
    </button>
  ) : receiptLink

  // Errors sit right above the buttons that caused them, so they're seen where the tap happened.
  const actions = (
    <div className="space-y-2">
      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          <Icon className="mt-px h-4 w-4">{I.info}</Icon><span className="min-w-0 flex-1">{error}</span>
        </p>
      )}
      {refundDone && (
        <p role="status" className="flex items-start gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <Icon className="mt-px h-4 w-4">{I.check}</Icon><span className="min-w-0 flex-1">{refundDone}</span>
        </p>
      )}
      {washed && (
        <button type="button" onClick={() => step(() => setOrderStatus(id, 'ready'))} disabled={busy} className="min-h-11 w-full rounded-2xl text-sm font-semibold text-blue-600 active:bg-blue-50 disabled:opacity-60">
          No drying needed? Mark Ready
        </button>
      )}
      {next ? (
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3">
          {side}
          <button type="button" onClick={next.run} disabled={busy} aria-busy={busy} className={`${primary} min-h-13 min-w-0 rounded-2xl text-center text-base leading-tight`}>
            <Icon className="h-5 w-5">{next.icon}</Icon>{busy ? 'Saving…' : next.label}
          </button>
        </div>
      ) : canRefund ? (
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3">
          {receiptLink}
          <button type="button" onClick={() => setRefunding({ skipPin: false })} disabled={busy} className={`${primary} min-h-13 min-w-0 rounded-2xl text-center text-base leading-tight`}>
            <Icon className="h-5 w-5">{I.wallet}</Icon>Refund {formatPeso(refundable)}
          </button>
        </div>
      ) : (
        <div className="grid">{canPay ? side : receiptLink}</div>
      )}
    </div>
  )

  // Progress through the workflow; drying counts as skipped when the order went straight to Ready.
  const stepIdx = STATUS_FLOW.indexOf(order.status)
  const driedSkipped = stepIdx > STATUS_FLOW.indexOf('drying') && !machines.history.some((a) => a.machine_type === 'dryer')
  // Late only matters while the shop still owes the work; once Ready, the wait is on the customer.
  const due = order.expected_pickup ? pickupDue(order.expected_pickup) : null
  const late = !!due && !locked && order.status !== 'ready' && due.getTime() < Date.now()
  const moneyTone = order.status === 'cancelled' ? 'bg-slate-100 text-slate-500' : balance > 0 ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'

  return (
    <div className="mx-auto max-w-5xl">
      <BackHeader
        title="Order Details"
        onBack={back}
        action={
          <div className="relative">
            <button type="button" onClick={() => setMenu((m) => !m)} aria-label="More actions" aria-haspopup="menu" aria-expanded={menu} className="-mr-2 grid size-11 place-items-center rounded-full text-slate-800 active:bg-slate-200">
              <Icon className="h-6 w-6">{I.more}</Icon>
            </button>
            {menu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
                <div role="menu" className="absolute right-0 top-12 z-20 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white py-1 shadow-lg">
                  <Link role="menuitem" to={`/orders/${id}/receipt`} className="flex min-h-12 items-center gap-3 px-4 text-sm font-medium text-slate-700 active:bg-slate-50">
                    <Icon className="h-5 w-5 text-slate-500">{I.printer}</Icon>Print Receipt
                  </Link>
                  <Link role="menuitem" to={`/customers/${order.customer_id}`} className="flex min-h-12 items-center gap-3 px-4 text-sm font-medium text-slate-700 active:bg-slate-50">
                    <Icon className="h-5 w-5 text-slate-500">{I.user}</Icon>View Customer
                  </Link>
                  {!locked && (
                    <button role="menuitem" type="button" onClick={() => { setMenu(false); cancelOrder() }} className="flex min-h-12 w-full items-center gap-3 border-t border-slate-100 px-4 text-sm font-medium text-red-600 active:bg-red-50">
                      <Icon className="h-5 w-5">{I.x}</Icon>Cancel Order
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        }
      />

      {scanNotice && (
        <p role="status" className={`mt-4 flex items-start gap-2 rounded-2xl px-4 py-3 text-[15px] font-medium ${scanNotice.tone}`}>
          <Icon className="mt-0.5 h-5 w-5">{order.status === 'ready' ? I.check : I.info}</Icon><span className="min-w-0 flex-1">{scanNotice.text}</span>
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <div className="min-w-0 space-y-5">
          {/* Order header: who it's for, when it's due, progress and what's happening now */}
          <section className={`${card} overflow-hidden`}>
            <div className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="break-all text-2xl font-bold tracking-tight tabular-nums text-slate-900">#{order.order_number}</h2>
                  <p className="mt-0.5 text-sm text-slate-500">
                    Received {formatDateTime(order.received_at)}
                    {order.created_by_name && <> · {order.created_by_name}</>}
                  </p>
                </div>
                <PaymentBadge status={order.payment_status} />
              </div>

              {/* Customer: tap the row for their profile, or call straight from here. */}
              <div className="mt-4 flex items-center gap-2 rounded-2xl bg-slate-50">
                <Link to={`/customers/${order.customer_id}`} className="flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-2xl p-3 active:bg-slate-100">
                  <Avatar name={order.customer_name} className="size-11 text-sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-slate-900">{order.customer_name}</span>
                    <span className="block truncate text-sm text-slate-500">{order.customer_contact || 'No contact number'}</span>
                  </span>
                  <Icon className="h-5 w-5 shrink-0 text-slate-300">{I.chevron}</Icon>
                </Link>
                {phone && (
                  <a href={`tel:${phone}`} aria-label={`Call ${order.customer_name}`} className="mr-3 grid size-12 shrink-0 place-items-center rounded-full bg-emerald-600 text-white shadow-sm shadow-emerald-600/30 active:bg-emerald-700">
                    <Icon className="h-5 w-5">{I.phone}</Icon>
                  </a>
                )}
              </div>

              {order.expected_pickup && !locked && (
                <p className={`mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${late ? 'bg-amber-50 text-amber-900' : 'bg-slate-50 text-slate-700'}`}>
                  <Icon className={`h-4 w-4 shrink-0 ${late ? 'text-amber-600' : 'text-slate-500'}`}>{I.calendar}</Icon>
                  <span className="min-w-0 flex-1">Pickup <b className="font-semibold text-slate-900">{formatPickup(order.expected_pickup)}</b></span>
                  {late && <span className="shrink-0 rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">Overdue</span>}
                </p>
              )}

              {order.status !== 'cancelled' && (
                <ol aria-label="Order progress" className="mt-5 grid grid-cols-5">
                  {STATUS_FLOW.map((s, i) => {
                    const skipped = s === 'drying' && driedSkipped
                    const done = i < stepIdx || order.status === 'released'
                    const now = i === stepIdx && !done
                    return (
                      <li key={s} aria-current={now ? 'step' : undefined} className="relative flex flex-col items-center text-center">
                        {i > 0 && <span aria-hidden className={`absolute right-1/2 top-3.5 h-0.5 w-full ${i <= stepIdx ? 'bg-blue-600' : 'bg-slate-200'}`} />}
                        <span
                          className={`relative grid size-7 place-items-center rounded-full text-xs font-bold ${
                            skipped ? 'border-2 border-dashed border-slate-300 bg-white text-slate-400'
                            : done ? (s === 'released' ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white')
                            : now ? 'bg-blue-600 text-white ring-4 ring-blue-100'
                            : 'border-2 border-slate-200 bg-white text-slate-400'
                          }`}
                        >
                          {skipped ? <Icon className="h-3.5 w-3.5">{I.minus}</Icon> : done ? <Icon className="h-3.5 w-3.5">{I.tick}</Icon> : i + 1}
                        </span>
                        <span className={`mt-1.5 text-[11px] leading-tight ${now ? 'font-bold text-blue-700' : done && !skipped ? 'font-medium text-slate-700' : 'text-slate-400'}`}>
                          {skipped ? 'Skipped' : STEP_LABEL[s]}
                        </span>
                      </li>
                    )
                  })}
                </ol>
              )}
            </div>
            <div role="status" className={`flex items-center gap-3 border-t border-slate-100 px-4 py-3 sm:px-5 ${meta.banner}`}>
              <Icon className={`h-6 w-6 ${meta.text}`}>{meta.icon}</Icon>
              <p className="min-w-0 text-sm text-slate-700">
                <b className={`font-semibold ${meta.text}`}>{STATUS_LABEL[order.status]}</b>
                {' · '}
                {washed ? 'Washing done — move it to a dryer, or mark it ready if no drying is needed.' : meta.desc}
                {order.status === 'released' && order.released_by_name && <> Released by {order.released_by_name}{order.released_at && <> · {formatDateTime(order.released_at)}</>}.</>}
                {order.status === 'ready' && (balance > 0 ? <> Collect <b className="font-semibold text-slate-900">{formatPeso(balance)}</b> before release.</> : ' Fully paid — ready to hand over.')}
              </p>
            </div>
          </section>

          {/* Notes are instructions for staff (e.g. "separate whites"), so they stand out near the top. */}
          {order.notes && (
            <section className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <Icon className="mt-0.5 h-5 w-5 text-amber-600">{I.note}</Icon>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-amber-900">Notes</h3>
                <p className="mt-0.5 whitespace-pre-wrap wrap-break-word text-[15px] text-amber-900/90">{order.notes}</p>
              </div>
            </section>
          )}

          {!locked || machines.history.length > 0 ? (
            <MachinePanel
              machines={machines}
              status={order.status}
              onChangeMachine={(type) => setPicker({ type, title: type === 'washer' ? 'Change Washer' : 'Change Dryer' })}
            />
          ) : null}

          {/* Services, then the bill, read top to bottom like the printed receipt. */}
          <section aria-labelledby="od-services">
            <h3 id="od-services" className="mb-2.5 flex items-baseline gap-2 px-1 text-base font-semibold text-slate-900">
              Services <span className="text-sm font-normal text-slate-500">{items.length} {items.length === 1 ? 'item' : 'items'}</span>
            </h3>
            <div className={`${card} overflow-hidden`}>
              <ul className="divide-y divide-slate-100">
                {items.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 p-4">
                    <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-600">
                      <Icon className="h-6 w-6">{serviceIcon(i.service_name)}</Icon>
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-slate-900">{i.service_name}</div>
                      <div className="mt-0.5 truncate text-sm tabular-nums text-slate-500">{itemQtyLine(i)}</div>
                      {i.note && <div className="mt-0.5 text-xs text-slate-400">{i.note}</div>}
                    </div>
                    <div className="shrink-0 font-bold tabular-nums text-slate-900">
                      {i.included_qty >= i.quantity && !i.amount_cents ? <span className="text-sm font-semibold text-emerald-600">Included</span> : formatPeso(i.amount_cents)}
                    </div>
                  </li>
                ))}
              </ul>
              <dl className="space-y-2 border-t border-dashed border-slate-200 bg-slate-50/70 px-4 py-3 text-[15px]">
                {order.discount_cents > 0 && (
                  <>
                    <Line label="Subtotal">{formatPeso(order.subtotal_cents)}</Line>
                    <Line label="Discount" cls="text-emerald-600">− {formatPeso(order.discount_cents)}</Line>
                  </>
                )}
                <Line label="Total" labelCls="font-semibold text-slate-900" cls="text-lg font-bold text-slate-900">{formatPeso(order.total_cents)}</Line>
              </dl>
            </div>
          </section>
        </div>

        <div className="min-w-0 space-y-5">
          {/* Payment: what's owed first, then each payment with its own receipt. */}
          <section aria-labelledby="od-payments" className={`${card} overflow-hidden`}>
            <div className="p-4 sm:p-5">
              <h3 id="od-payments" className="text-base font-semibold text-slate-900">Payment</h3>
              <dl className="mt-3 space-y-2 text-[15px]">
                <Line label="Total">{formatPeso(order.total_cents)}</Line>
                <Line label="Paid" cls="text-emerald-700">{formatPeso(order.paid_cents)}</Line>
                {order.refunded_cents > 0 && <Line label="Refunded" cls="text-red-700">− {formatPeso(order.refunded_cents)}</Line>}
              </dl>
              <div className={`mt-3 flex items-center justify-between rounded-xl px-4 py-3 ${moneyTone}`}>
                <span className="flex items-center gap-2 font-semibold">
                  <Icon className="h-5 w-5">{balance > 0 ? I.wallet : I.check}</Icon>
                  {order.status === 'cancelled' ? 'Cancelled' : balance > 0 ? 'Balance due' : 'Fully paid'}
                </span>
                <span className="text-xl font-bold tabular-nums">{formatPeso(Math.max(balance, 0))}</span>
              </div>
            </div>
            <div className="border-t border-slate-100 px-4 pb-1 sm:px-5">
              <p className="pt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Payments received</p>
              <ul className="divide-y divide-slate-100">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 py-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-600">
                      <Icon className="h-5 w-5">{p.method === 'cash' ? I.peso : p.method === 'gcash' ? I.phone : I.wallet}</Icon>
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-slate-900">{METHOD_LABEL[p.method] ?? p.method}{p.reference && <span className="font-normal text-slate-500"> · {p.reference}</span>}</div>
                      <div className="truncate text-xs text-slate-500">{formatDateTime(p.paid_at)} · {p.user_name}</div>
                    </div>
                    <div className="shrink-0 font-semibold tabular-nums text-emerald-700">{formatPeso(p.amount_cents)}</div>
                    <Link to={`/orders/${id}/receipt?payment=${p.id}`} aria-label={`Receipt for ${formatPeso(p.amount_cents)} payment`} className="-mr-2 grid size-11 shrink-0 place-items-center rounded-full text-slate-500 active:bg-slate-100">
                      <Icon className="h-5 w-5">{I.receipt}</Icon>
                    </Link>
                  </li>
                ))}
              </ul>
              {refunds.length > 0 && (
                <>
                  <p className="pt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Refunds</p>
                  <ul className="divide-y divide-slate-100">
                    {refunds.map((r) => (
                      <li key={r.id} className="flex items-center gap-3 py-3">
                        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-red-50 text-red-600"><Icon className="h-5 w-5">{I.wallet}</Icon></span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-semibold text-slate-900">{METHOD_LABEL[r.method] ?? r.method}{r.reason && <span className="font-normal text-slate-500"> · {r.reason}</span>}</div>
                          <div className="truncate text-xs text-slate-500">{formatDateTime(r.refunded_at)} · {r.user_name}</div>
                        </div>
                        <div className="shrink-0 font-semibold tabular-nums text-red-700">− {formatPeso(r.amount_cents)}</div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {payments.length === 0 && (
                <p className="pb-3 pt-1 text-sm text-slate-500">{canPay ? 'No payments yet. Pay Later orders are settled at pickup.' : 'No payments recorded.'}</p>
              )}
            </div>
          </section>

          <div className="hidden lg:block">{actions}</div>
        </div>
      </div>

      {/* Sticky action bar: phones and tablets. Negative margins make it meet the edges of <main>. */}
      <div className="sticky bottom-0 z-10 -mx-4 -mb-4 mt-5 rounded-t-3xl border-t border-slate-100 bg-white px-4 pb-4 pt-3 shadow-[0_-4px_20px_rgba(15,23,42,0.06)] md:-mx-6 md:-mb-6 md:px-6 lg:hidden">
        {/* The money that decides the next step, right next to the button that acts on it. */}
        {order.status !== 'cancelled' && (
          <div className="mb-2.5 flex items-baseline justify-between gap-3 px-1 text-sm">
            <span className="min-w-0 truncate text-slate-500">
              Total <b className="font-semibold tabular-nums text-slate-900">{formatPeso(order.total_cents)}</b>
              {order.paid_cents > 0 && balance > 0 && <> · Paid <b className="font-semibold tabular-nums text-slate-900">{formatPeso(order.paid_cents)}</b></>}
            </span>
            {balance > 0
              ? <span className="shrink-0 font-semibold text-red-700">Due <b className="text-base font-bold tabular-nums">{formatPeso(balance)}</b></span>
              : <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-emerald-700"><Icon className="h-4 w-4">{I.check}</Icon>Fully paid</span>}
          </div>
        )}
        {actions}
      </div>

      {picker && <MachinePicker type={picker.type} title={picker.title} onPick={pickMachine} onClose={() => setPicker(null)} />}

      {paying && canPay && (
        <Sheet label="Collect Payment" onClose={() => setPaying(false)}>
          <PaymentForm orderId={id} balanceCents={balance} paidCents={order.paid_cents} onSaved={(pid, method) => {
            setPaying(false); setPaidId(pid); setDrawer(null); load()
            // The payment is saved; a drawer problem only shows a message in the sheet.
            autoOpenCashDrawer(method).then(setDrawer)
          }} />
        </Sheet>
      )}

      {refunding && canRefund && (
        <Sheet label="Refund payment" onClose={() => setRefunding(null)}>
          <RefundForm
            orderId={id}
            refundableCents={refundable}
            refundedCents={order.refunded_cents}
            defaultMethod={payments.at(-1)?.method ?? 'cash'}
            approve={refunding.skipPin ? null : () => approve(`Refund money on order #${order.order_number}?`)}
            onSaved={(method) => {
              setRefunding(null)
              setRefundDone('Refund recorded.')
              load()
              // Cash goes back out of the drawer; a drawer problem only shows a message.
              autoOpenCashDrawer(method).then((r) => r && !r.ok && setRefundDone(`Refund recorded. ${r.msg.replace(/^Payment saved, but /, '')}`))
            }}
          />
        </Sheet>
      )}

      {confirming && (
        <Sheet label="Release laundry?" onClose={() => setConfirming(false)}>
          <div className="space-y-5">
            <div className="flex items-center gap-4 rounded-2xl bg-slate-50 p-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-600"><Icon className="h-6 w-6">{I.bag}</Icon></span>
              <div className="min-w-0 text-[15px]">
                <p className="truncate font-semibold text-slate-900">#{order.order_number} · {order.customer_name}</p>
                <p className="text-slate-500">{items.length} {items.length === 1 ? 'service' : 'services'} · {formatPeso(order.total_cents)} paid</p>
              </div>
            </div>
            <p className="px-1 text-[15px] text-slate-600">Hand the laundry to the customer, then confirm. This completes the order under your name and can't be undone.</p>
            <div className="grid gap-3">
              <button type="button" onClick={release} disabled={busy} className={`${primary} min-h-13 w-full rounded-2xl text-base`}>
                <Icon className="h-5 w-5">{I.check}</Icon>Yes, release laundry
              </button>
              <button type="button" onClick={() => setConfirming(false)} className={outline}>Not yet</button>
            </div>
          </div>
        </Sheet>
      )}

      {paidId && (() => {
        const p = payments.find((x) => x.id === paidId)
        if (!p) return null
        return (
          <Sheet label="Payment Collected" onClose={() => setPaidId(null)}>
            <div className="space-y-4">
              <dl className="space-y-2.5 rounded-2xl bg-slate-50 p-4 text-[15px]">
                {p.tendered_cents != null && <Line label="Amount received">{formatPeso(p.tendered_cents)}</Line>}
                <Line label={p.tendered_cents != null ? 'Amount paid' : 'Amount received'} cls="font-bold text-emerald-600">{formatPeso(p.amount_cents)}</Line>
                <Line label="Method">{METHOD_LABEL[p.method] ?? p.method}</Line>
                {p.tendered_cents != null && p.tendered_cents > p.amount_cents && (
                  <Line label="Change" labelCls="font-semibold text-slate-900" cls="text-2xl font-bold text-emerald-700">{formatPeso(p.tendered_cents - p.amount_cents)}</Line>
                )}
                <Line label="Remaining balance" cls="font-bold text-slate-900">{formatPeso(order.balance_cents)}</Line>
                <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Payment status</dt><dd><PaymentBadge status={order.payment_status} /></dd></div>
              </dl>
              {p.method === 'cash' && <CashDrawerControl status={drawer} />}
              {order.status === 'ready' && order.balance_cents === 0 && (
                <button type="button" onClick={() => { setPaidId(null); setConfirming(true) }} className={`${primary} min-h-13 w-full rounded-2xl text-base`}>
                  <Icon className="h-5 w-5">{I.bag}</Icon>Release Laundry
                </button>
              )}
              <Link
                to={`/orders/${id}/receipt?payment=${p.id}`}
                className={order.status === 'ready' && order.balance_cents === 0
                  ? `${outline} inline-flex items-center justify-center gap-2`
                  : `${primary} min-h-13 w-full rounded-2xl text-base`}
              >
                <Icon className="h-5 w-5">{I.printer}</Icon>Print Payment Receipt
              </Link>
              <button type="button" onClick={() => setPaidId(null)} className="min-h-12 w-full rounded-2xl font-semibold text-slate-600 active:bg-slate-100">
                Done
              </button>
            </div>
          </Sheet>
        )
      })()}
      {sheet}
    </div>
  )
}

function Line({ label, cls = 'text-slate-900', labelCls = 'text-slate-500', children }: { label: string; cls?: string; labelCls?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className={labelCls}>{label}</dt>
      <dd className={`tabular-nums ${cls}`}>{children}</dd>
    </div>
  )
}
