import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { PaymentBadge } from '../components/Badges'
import { I, Icon } from '../components/Icons'
import { EmptyCard } from '../components/Manage'
import PaymentForm from '../components/PaymentForm'
import RefundForm from '../components/RefundForm'
import { CashDrawerControl, type DrawerMsg } from '../components/CashDrawer'
import { useAdminPin } from '../components/AdminPin'
import { MachinePicker, type OrderMachines } from '../components/MachinePanel'
import type { ScannedState } from '../components/ScanOrder'
import { Sheet } from '../components/Sheet'
import { Toast, useAutoDismiss, type Msg } from '../components/Toast'
import { MachinesStep } from '../components/order/MachinesStep'
import { OrderInfoStep } from '../components/order/OrderInfoStep'
import { AddServiceSheet, DueDateSheet, ItemSheet, NoteSheet } from '../components/order/OrderSheets'
import { PaymentStep } from '../components/order/PaymentStep'
import { ServicesStep } from '../components/order/ServicesStep'
import { InfoNote, outline, panel, soft, solid, StepTrack, type Detail } from '../components/order/shared'
import { useAuth } from '../context/AuthContext'
import { assignMachine, getOrderMachines, machineName, unloadMachine } from '../db/machines'
import { getOrderDetail, setOrderStatus } from '../db/orderQueries'
import { setOrderItemQuantity, setOrderNotes, setOrderPickup } from '../db/orders'
import { listServices } from '../db/services'
import { formatDateTime, formatPeso } from '../lib/money'
import { isFinal, METHOD_LABEL, STATUS_FLOW, STATUS_LABEL } from '../lib/orders'
import { autoOpenCashDrawer } from '../lib/printer'
import type { Machine, MachineType, OrderItemRow, Service } from '../types'

const STEPS = ['Order Info', 'Services', 'Machines', 'Payment'] as const

/**
 * Last wizard step per order, kept on this device so leaving for another page and coming back
 * (from Orders, a customer, the dashboard…) reopens the same step. Only the most recent orders are kept.
 */
const STEP_KEY = 'orderDetail.steps'
const KEEP_ORDERS = 50

function readSteps(): [number, number][] {
  try {
    const v = JSON.parse(localStorage.getItem(STEP_KEY) ?? '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

function savedStep(orderId: number): number | null {
  const s = readSteps().find(([id]) => id === orderId)?.[1]
  return typeof s === 'number' && s >= 0 && s < STEPS.length ? s : null
}

function saveStep(orderId: number, step: number) {
  try {
    const rest = readSteps().filter(([id]) => id !== orderId)
    localStorage.setItem(STEP_KEY, JSON.stringify([[orderId, step], ...rest].slice(0, KEEP_ORDERS)))
  } catch {
    // Storage unavailable: the step still lives in the URL for this visit.
  }
}

type EditSheet ={ kind: 'due' } | { kind: 'note' } | { kind: 'add' } | { kind: 'item'; line: OrderItemRow } | null

/**
 * Order Details: view and process one order as a 4-step wizard (Order Info → Services → Machines → Payment).
 * The step lives in the URL (?step=2), so it survives a trip to the receipt and back. Every change goes
 * through the db layer, which re-checks it against the stored order.
 */
export default function OrderDetail() {
  const id = Number(useParams().id)
  const navigate = useNavigate()
  const { user } = useAuth()
  // Opened by Scan QR: say up front whether this laundry can be handed over.
  const scanned = !!(useLocation().state as ScannedState | null)?.scanned
  const [params, setParams] = useSearchParams()
  const [data, setData] = useState<Detail | null | undefined>(undefined)
  const [machines, setMachines] = useState<OrderMachines | null>(null)
  const [services, setServices] = useState<Service[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [msg, setMsg] = useState<Msg>(null)
  const [busy, setBusy] = useState(false)
  const running = useRef(false) // blocks a double tap running the same action twice
  const [edit, setEdit] = useState<EditSheet>(null)
  const [paying, setPaying] = useState(false)
  // Refund sheet; skipPin when it follows straight on from an admin-approved cancellation.
  const [refunding, setRefunding] = useState<{ skipPin: boolean } | null>(null)
  const [picker, setPicker] = useState<{ type: MachineType; title: string } | null>(null)
  const [menu, setMenu] = useState(false)
  const [confirming, setConfirming] = useState(false) // "Complete order?" sheet
  const [paidId, setPaidId] = useState<number | null>(null) // payment just collected; offers its receipt
  const [drawer, setDrawer] = useState<DrawerMsg>(null) // cash drawer result for that payment
  const { approve, sheet } = useAdminPin()
  useAutoDismiss(msg, () => setMsg(null))

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
  useEffect(() => { listServices(true).then(setServices).catch(() => setServices([])) }, [])

  // Close the overflow menu with Escape, like the sheets do.
  useEffect(() => {
    if (!menu) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [menu])

  const fromUrl = Number(params.get('step'))
  const saved = savedStep(id)
  // The URL wins (receipt and back); then a scan of a ready order opens on Payment, where it's settled and
  // released; otherwise the step this order was last left on.
  const stepIdx = fromUrl >= 1 && fromUrl <= STEPS.length ? fromUrl - 1
    : scanned && data?.order.status === 'ready' ? 3
    : saved ?? 0
  const goTo = (i: number) => {
    saveStep(id, i)
    setParams((p) => { p.set('step', String(i + 1)); return p }, { replace: true, state: scanned ? { scanned: true } : undefined })
    setMsg(null)
    document.querySelector('main')?.scrollTo({ top: 0 })
  }

  const back = () => navigate('/orders')

  const header = (title: string, action?: ReactNode, below?: ReactNode) => (
    <header className="sticky -top-4 z-20 -mx-4 -mt-4 md:-top-6 bg-blue-50/95 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur md:-mx-6 md:-mt-6 md:px-6 md:pt-6">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center gap-2">
          <button type="button" onClick={back} aria-label="Back to orders" className="-ml-2 grid size-11 shrink-0 place-items-center rounded-full text-slate-900 active:bg-blue-100">
            <Icon className="h-6 w-6">{I.back}</Icon>
          </button>
          <h1 className="min-w-0 flex-1 truncate text-xl font-bold text-slate-900">{title}</h1>
          {action}
        </div>
        {below && <div className="mt-3">{below}</div>}
      </div>
    </header>
  )

  if (data === undefined || !machines) {
    return (
      <div>
        {header('Order Details')}
        <div className="mx-auto mt-4 max-w-2xl">
          {loadError ? (
            <div className={panel}>
              <EmptyCard icon={I.info} title="Couldn't load this order" text={loadError} />
              <div className="px-6 pb-8 text-center">
                <button type="button" onClick={load} className={solid}><Icon className="h-5 w-5">{I.refresh}</Icon>Try again</button>
              </div>
            </div>
          ) : (
            <div aria-busy="true" aria-label="Loading order" className="animate-pulse space-y-4 motion-reduce:animate-none">
              <div className="h-12 rounded-2xl bg-white/70" />
              <div className="h-48 rounded-3xl bg-white/70" />
              <div className="h-24 rounded-3xl bg-white/70" />
              <div className="h-28 rounded-3xl bg-white/70" />
            </div>
          )}
        </div>
      </div>
    )
  }
  if (data === null)
    return (
      <div>
        {header('Order Details')}
        <div className={`${panel} mx-auto mt-4 max-w-2xl`}><EmptyCard icon={I.orders} title="Order not found" text="It may have been removed or the link is wrong." /></div>
      </div>
    )

  const { order, items, payments } = data
  const balance = order.total_cents - order.paid_cents
  const current = machines.current
  const washed = order.status === 'washing' && !current
  const locked = isFinal(order.status)
  const pickedUp = order.status === 'released'
  const canPay = balance > 0 && order.status !== 'cancelled'
  const refundable = order.paid_cents - order.refunded_cents
  const canRefund = order.status === 'cancelled' && refundable > 0
  // Drying counts as skipped when the order went straight from washing to Ready.
  const driedSkipped = STATUS_FLOW.indexOf(order.status) > STATUS_FLOW.indexOf('drying') && !machines.history.some((a) => a.machine_type === 'dryer')

  /** Runs one action at a time, shows its result, then reloads; the database re-checks every change. */
  async function run(fn: () => Promise<unknown>, ok?: string) {
    if (running.current) return false
    running.current = true
    setBusy(true)
    let done = false
    try {
      await fn()
      setMsg(ok ? { ok: true, text: ok } : null)
      done = true
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Something went wrong. Please try again.' })
    } finally {
      running.current = false
      setBusy(false)
    }
    await load()
    return done
  }

  /** Sheet saves: the sheet shows its own error, so this only reloads after a change. */
  const saveThen = async (fn: () => Promise<unknown>, ok: string) => {
    await fn()
    setMsg({ ok: true, text: ok })
    await load()
  }

  async function cancelOrder() {
    const reason = refundable > 0
      ? `Cancel this order? This cannot be undone. ${formatPeso(refundable)} was paid; you can refund it next.`
      : 'Cancel this order? This cannot be undone.'
    if (!(await approve(reason))) return
    // Money was taken: go straight to the refund, already approved by the same PIN.
    if ((await run(() => setOrderStatus(id, 'cancelled', user!.id), 'Order cancelled.')) && refundable > 0) {
      goTo(3)
      setRefunding({ skipPin: true })
    }
  }

  async function pickMachine(m: Machine) {
    await assignMachine(id, m.id) // errors are shown inside the picker
    setPicker(null)
    setMsg({ ok: true, text: `${machineName(m.code, m.type)} started · ${m.cycle_minutes} min timer.` })
    await load()
  }

  function addon(s: Service, qty: number) {
    const had = items.find((i) => i.service_id === s.id)?.quantity ?? 0
    run(() => setOrderItemQuantity(id, s.id, qty), qty > had ? `${s.name} added.` : `${s.name} updated.`)
  }

  /** Release is the only way to Completed and always needs this confirmation; the database re-checks the balance. */
  function release() {
    setConfirming(false)
    run(async () => {
      await setOrderStatus(id, 'released', user!.id)
      if (scanned) navigate(`/orders/${id}?step=4`, { replace: true }) // drop the scan notice; the order is now done
    }, 'Order completed. Laundry released.')
  }

  // Why Complete Order can't run yet, in words; never a silent no-op.
  const blocker = order.status === 'released' ? null
    : order.status === 'cancelled' ? 'This order was cancelled and can’t be completed.'
    : order.status !== 'ready' ? `Still ${STATUS_LABEL[order.status]}. Finish the machine steps first — an order can be completed once it’s Ready for Pickup.`
    : balance > 0 ? `Collect the ${formatPeso(balance)} balance before completing the order.`
    : null

  // After a scan: can this laundry be handed over? Final and in-progress orders must not be released.
  const scanNotice = !scanned ? null
    : order.status === 'released' ? { tone: 'bg-red-50 text-red-700', text: `Already completed${order.released_at ? ` on ${formatDateTime(order.released_at)}` : ''}${order.released_by_name ? ` by ${order.released_by_name}` : ''}. This laundry was released — do not hand it over again.` }
    : order.status === 'cancelled' ? { tone: 'bg-red-50 text-red-700', text: 'This order was cancelled. Do not release any laundry for it.' }
    : order.status !== 'ready' ? { tone: 'bg-amber-50 text-amber-800', text: `Not ready for pickup — still ${STATUS_LABEL[order.status]}. The laundry can't be released yet.` }
    : { tone: 'bg-emerald-50 text-emerald-700', text: balance > 0 ? `Order found. Collect ${formatPeso(balance)} before releasing the laundry.` : 'Order found. Fully paid — ready to release.' }

  const last = stepIdx === STEPS.length - 1
  const menuItem = 'flex min-h-12 w-full items-center gap-3 px-4 text-sm font-medium text-slate-700 active:bg-slate-50'

  return (
    <div className="flex min-h-full flex-col">
      {header(
        `Order #${order.order_number}`,
        <div className="relative">
          <button type="button" onClick={() => setMenu((m) => !m)} aria-label="More actions" aria-haspopup="menu" aria-expanded={menu} className="-mr-2 grid size-11 place-items-center rounded-full text-slate-900 active:bg-blue-100">
            <Icon className="h-6 w-6">{I.more}</Icon>
          </button>
          {menu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
              <div role="menu" className="absolute right-0 top-12 z-20 w-56 origin-top-right animate-menu-in overflow-hidden rounded-2xl border border-slate-200 bg-white py-1 shadow-lg">
                {/* The order receipt is only offered once the laundry is picked up and the order completed. */}
                {pickedUp && (
                  <Link role="menuitem" to={`/orders/${id}/receipt`} className={menuItem}>
                    <Icon className="h-5 w-5 text-slate-500">{I.printer}</Icon>Print Receipt
                  </Link>
                )}
                <Link role="menuitem" to={`/customers/${order.customer_id}`} className={menuItem}>
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
        </div>,
        <StepTrack
          label="Order steps"
          steps={STEPS.map((label, i) => ({ label, state: i < stepIdx ? 'done' : i === stepIdx ? 'current' : 'todo' }))}
          onSelect={goTo}
        />,
      )}

      <div className="mx-auto mt-3 w-full max-w-2xl flex-1 space-y-4">
        {/* Picked up: said plainly on every step so no one hands the laundry over twice. */}
        {pickedUp && (
          <div role="status" className="flex items-center gap-4 rounded-3xl border border-emerald-200 bg-emerald-50 p-4">
            <span className="grid size-13 shrink-0 place-items-center rounded-2xl bg-emerald-600 text-white">
              <Icon className="h-7 w-7">{I.bag}</Icon>
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-lg font-bold leading-tight text-emerald-900">Laundry Picked Up</p>
              <p className="mt-0.5 text-sm text-emerald-800">
                {order.released_at ? `Released ${formatDateTime(order.released_at)}` : 'This order is completed'}
                {order.released_by_name ? ` by ${order.released_by_name}` : ''}.
              </p>
              {scanned && <p className="mt-1 text-sm font-semibold text-red-700">Do not hand it over again.</p>}
            </div>
          </div>
        )}

        {scanNotice && stepIdx === 0 && !pickedUp && (
          <p role="status" className={`flex items-start gap-2 rounded-2xl px-4 py-3 text-[15px] font-medium ${scanNotice.tone}`}>
            <Icon className="mt-0.5 h-5 w-5">{order.status === 'ready' ? I.check : I.info}</Icon><span className="min-w-0 flex-1">{scanNotice.text}</span>
          </p>
        )}

        {stepIdx === 0 && (
          <OrderInfoStep data={data} driedSkipped={driedSkipped} washed={washed} onSetDue={() => setEdit({ kind: 'due' })} onEditNote={() => setEdit({ kind: 'note' })} />
        )}
        {stepIdx === 1 && (
          <ServicesStep
            data={data}
            services={services}
            editable={!locked}
            busy={busy}
            onAddMore={() => setEdit({ kind: 'add' })}
            onEdit={(line) => setEdit({ kind: 'item', line })}
            onAddon={addon}
          />
        )}
        {stepIdx === 2 && (
          <MachinesStep
            machines={machines}
            status={order.status}
            busy={busy}
            onAssign={(type, title) => setPicker({ type, title })}
            onUnload={() => run(
              () => unloadMachine(id),
              machines.current?.machine_type === 'dryer' ? `${machines.current.machine_code} unloaded. Order is Ready for Pickup.` : `${machines.current?.machine_code ?? 'Washer'} unloaded. Move it to a dryer next.`,
            )}
            onMarkReady={() => run(() => setOrderStatus(id, 'ready'), 'Marked Ready for Pickup.')}
          />
        )}
        {stepIdx === 3 && (
          <PaymentStep
            data={data}
            busy={busy}
            onCollect={canPay ? () => setPaying(true) : null}
            onRefund={canRefund ? () => setRefunding({ skipPin: false }) : null}
          />
        )}
      </div>

      {/* Back / Next, pinned to the bottom; results and "why not yet" sit right above the buttons. */}
      <div className="sticky -bottom-4 z-10 -mx-4 -mb-4 mt-5 md:-bottom-6 border-t border-blue-100 bg-white/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-4px_20px_rgba(37,99,235,0.06)] backdrop-blur md:-mx-6 md:-mb-6 md:px-6">
        <div className="mx-auto max-w-2xl space-y-2.5">
          {msg && <Toast msg={msg} onDismiss={() => setMsg(null)} />}
          {last && blocker && !msg && <InfoNote tone="amber">{blocker}</InfoNote>}
          {/* A completed order is finished: no Back on its last step, only the receipt. */}
          <div className={`grid gap-3 ${last && pickedUp ? 'grid-cols-1' : 'grid-cols-[minmax(0,2fr)_minmax(0,3fr)]'}`}>
            {!(last && pickedUp) && (
              <button type="button" onClick={() => (stepIdx === 0 ? back() : goTo(stepIdx - 1))} className={`${soft} min-h-13 text-base`}>
                <Icon className="h-5 w-5">{I.back}</Icon>Back
              </button>
            )}
            {!last ? (
              <button type="button" onClick={() => goTo(stepIdx + 1)} className={`${solid} min-h-13 text-base`}>
                Next<Icon className="h-5 w-5">{I.next}</Icon>
              </button>
            ) : pickedUp ? (
              <Link to={`/orders/${id}/receipt`} className={`${solid} min-h-13 text-base`}>
                <Icon className="h-5 w-5">{I.printer}</Icon>View Receipt
              </Link>
            ) : (
              <button type="button" onClick={() => setConfirming(true)} disabled={busy || !!blocker} aria-busy={busy} className={`${solid} min-h-13 text-base`}>
                <Icon className="h-5 w-5">{I.check}</Icon>{busy ? 'Saving…' : 'Complete Order'}
              </button>
            )}
          </div>
        </div>
      </div>

      {edit?.kind === 'due' && (
        <DueDateSheet value={order.expected_pickup} onClose={() => setEdit(null)} onSave={(v) => saveThen(() => setOrderPickup(id, v), v ? 'Pickup date saved.' : 'Pickup date removed.')} />
      )}
      {edit?.kind === 'note' && (
        <NoteSheet value={order.notes} onClose={() => setEdit(null)} onSave={(v) => saveThen(() => setOrderNotes(id, v), 'Note saved.')} />
      )}
      {edit?.kind === 'add' && (
        <AddServiceSheet
          services={services}
          items={items}
          onClose={() => setEdit(null)}
          onSave={(s, q) => saveThen(() => setOrderItemQuantity(id, s.id, q), q ? `${s.name} saved. Total updated.` : `${s.name} removed.`)}
        />
      )}
      {edit?.kind === 'item' && (
        <ItemSheet
          line={edit.line}
          onClose={() => setEdit(null)}
          onSave={(q) => saveThen(() => setOrderItemQuantity(id, edit.line.service_id, q), q ? `${edit.line.service_name} updated.` : `${edit.line.service_name} removed.`)}
        />
      )}

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
              setMsg({ ok: true, text: 'Refund recorded.' })
              load()
              // Cash goes back out of the drawer; a drawer problem only shows a message.
              autoOpenCashDrawer(method).then((r) => r && !r.ok && setMsg({ ok: false, text: `Refund recorded. ${r.msg.replace(/^Payment saved, but /, '')}` }))
            }}
          />
        </Sheet>
      )}

      {confirming && (
        <Sheet label="Complete order?" onClose={() => setConfirming(false)}>
          <div className="space-y-5">
            <div className="flex items-center gap-4 rounded-2xl bg-slate-50 p-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-600"><Icon className="h-6 w-6">{I.bag}</Icon></span>
              <div className="min-w-0 text-[15px]">
                <p className="truncate font-semibold text-slate-900">#{order.order_number} · {order.customer_name}</p>
                <p className="text-slate-500">{items.length} {items.length === 1 ? 'item' : 'items'} · {formatPeso(order.total_cents)} paid</p>
              </div>
            </div>
            <p className="px-1 text-[15px] text-slate-600">Hand the laundry to the customer, then confirm. This completes the order under your name and can't be undone.</p>
            <div className="grid gap-3">
              <button type="button" onClick={release} disabled={busy} className={`${solid} min-h-13 w-full text-base`}>
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
                <Line label="Amount Paid" cls="font-bold text-emerald-600">{formatPeso(p.amount_cents)}</Line>
                <Line label="Method">{METHOD_LABEL[p.method] ?? p.method}</Line>
                {p.tendered_cents != null && <Line label="Amount Received">{formatPeso(p.tendered_cents)}</Line>}
                {p.tendered_cents != null && p.tendered_cents > p.amount_cents && (
                  <Line label="Change" labelCls="font-semibold text-slate-900" cls="text-2xl font-bold text-emerald-700">{formatPeso(p.tendered_cents - p.amount_cents)}</Line>
                )}
                <Line label="Balance Due" cls="font-bold text-slate-900">{formatPeso(order.balance_cents)}</Line>
                <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Payment status</dt><dd><PaymentBadge status={order.payment_status} /></dd></div>
              </dl>
              {p.method === 'cash' && <CashDrawerControl status={drawer} />}
              {order.status === 'ready' && order.balance_cents === 0 && (
                <button type="button" onClick={() => { setPaidId(null); setConfirming(true) }} className={`${solid} min-h-13 w-full text-base`}>
                  <Icon className="h-5 w-5">{I.check}</Icon>Complete Order
                </button>
              )}
              <Link
                to={`/orders/${id}/receipt?payment=${p.id}`}
                className={order.status === 'ready' && order.balance_cents === 0 ? outline : `${solid} min-h-13 w-full text-base`}
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
