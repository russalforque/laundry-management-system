import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAdminPin } from '../components/AdminPin'
import type { DrawerMsg } from '../components/CashDrawer'
import type { Detail } from '../components/order/shared'
import type { ScannedState } from '../components/ScanOrder'
import { useAutoDismiss, type Msg } from '../components/Toast'
import { useAuth } from '../context/AuthContext'
import { getOrderDetail, setOrderStatus } from '../db/orderQueries'
import { listServices } from '../db/services'
import { formatDateTime, formatPeso } from '../lib/money'
import { isFinal, PROCESSING, STATUS_LABEL } from '../lib/orders'
import { canBluetoothPrint, printBasketTag, printOrderReceipt } from '../lib/printer'
import type { OrderItemRow, Service } from '../types'

/** Open edit sheet; 'add' lists services and packages, or add-ons with `addons`. */
export type EditSheet = { kind: 'due' } | { kind: 'note' } | { kind: 'add'; addons?: boolean } | { kind: 'item'; line: OrderItemRow } | null

/**
 * One order and everything that can be done to it: loading, the one-at-a-time action runner, status moves
 * (Start Processing, Mark Ready, Complete), add-ons, payment, refund, cancel, receipt and basket tag printing, plus which
 * sheet is open. Shared by the phone wizard
 * (pages/mobile/MobileOrderDetails.tsx) and the tablet / desktop workspace (pages/desktop-tablet/OrderDetails.tsx);
 * the sheets themselves are components/order/OrderDetailParts.tsx. Every change goes through the db layer,
 * which re-checks it against the stored order.
 */
/** What's being printed from the order: the customer receipt or the basket tag. */
export type PrintJob = 'receipt' | 'tag'

/** Router state for opening an order's page straight into a task. */
export interface OrderOpenState { addItem?: boolean }

export function useOrderDetail(id: number) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const openState = useLocation().state as (ScannedState & OrderOpenState) | null
  // Opened by Scan QR: say up front whether this laundry can be handed over.
  const scanned = !!openState?.scanned
  const [data, setData] = useState<Detail | null | undefined>(undefined)
  const [services, setServices] = useState<Service[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [msg, setMsg] = useState<Msg>(null)
  const [busy, setBusy] = useState(false)
  const running = useRef(false) // blocks a double tap running the same action twice
  const [edit, setEdit] = useState<EditSheet>(null)
  const [paying, setPaying] = useState(false)
  // Refund sheet; skipPin when it follows straight on from an admin-approved cancellation.
  const [refunding, setRefunding] = useState<{ skipPin: boolean } | null>(null)
  const [confirming, setConfirming] = useState(false) // "Complete order?" sheet
  const [paidId, setPaidId] = useState<number | null>(null) // payment just collected; offers its receipt
  const [drawer, setDrawer] = useState<DrawerMsg>(null) // cash drawer result for that payment
  const [printing, setPrinting] = useState<PrintJob | null>(null) // receipt or basket tag on its way to the printer
  const printJob = useRef(false) // blocks a double tap printing twice
  const { approve, sheet: pinSheet } = useAdminPin()
  useAutoDismiss(msg, () => setMsg(null))

  const load = useCallback(async () => {
    try {
      setData(await getOrderDetail(id))
      setLoadError('')
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load this order.')
    }
  }, [id])
  useEffect(() => {
    load()
    // Catch up on return to the app (the order may have moved on another screen).
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])
  useEffect(() => { listServices(true).then(setServices).catch(() => setServices([])) }, [])

  const order = data?.order
  // Opened from "Add item" elsewhere: show the add sheet once, as soon as the order is known to be editable.
  const addOnOpen = useRef(!!openState?.addItem)
  useEffect(() => {
    if (!order || !addOnOpen.current) return
    addOnOpen.current = false
    if (!isFinal(order.status)) setEdit({ kind: 'add' })
  }, [order])
  const balance = order ? order.total_cents - order.paid_cents : 0
  const refundable = order ? order.paid_cents - order.refunded_cents : 0

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

  /**
   * Cancels after admin approval. When money was taken it goes straight on to the refund, already approved
   * by the same PIN; resolves true in that case so the page can bring the payment section into view.
   */
  async function cancelOrder() {
    const reason = refundable > 0
      ? `Cancel this order? This cannot be undone. ${formatPeso(refundable)} was paid; you can refund it next.`
      : 'Cancel this order? This cannot be undone.'
    if (!(await approve(reason))) return false
    if ((await run(() => setOrderStatus(id, 'cancelled', user!.id), 'Order cancelled.')) && refundable > 0) {
      setRefunding({ skipPin: true })
      return true
    }
    return false
  }

  const startProcessing = () => run(() => setOrderStatus(id, PROCESSING), 'Processing started.')
  const markReady = () => run(() => setOrderStatus(id, 'ready'), 'Marked Ready for Pickup.')

  /**
   * Receipt or basket tag: straight to the Bluetooth printer on Android, the print preview elsewhere. Only prints, so
   * it runs beside the order actions instead of through `run`; printer problems show in the toast like any error.
   */
  async function print(job: PrintJob) {
    if (!canBluetoothPrint()) return navigate(`/orders/${id}/receipt${job === 'tag' ? '?tag=1' : ''}`)
    if (printJob.current) return
    printJob.current = true
    setPrinting(job)
    const what = job === 'tag' ? 'Basket tag' : 'Receipt'
    try {
      await (job === 'tag' ? printBasketTag(id) : printOrderReceipt(id))
      setMsg({ ok: true, text: `${what} printed.` })
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : `Could not print the ${what.toLowerCase()}.` })
    } finally {
      printJob.current = false
      setPrinting(null)
    }
  }

  /** Release is the only way to Completed and always needs this confirmation; the database re-checks the balance. */
  function release() {
    setConfirming(false)
    run(async () => {
      await setOrderStatus(id, 'released', user!.id)
      if (scanned) navigate(`/orders/${id}`, { replace: true }) // drop the scan notice; the order is now done
    }, 'Order completed. Laundry released.')
  }

  // Derived state, once the order is loaded.
  const status = order?.status
  const flags = order ? {
    balance,
    refundable,
    locked: isFinal(order.status),
    pickedUp: status === 'released',
    // A basket tag only helps while the laundry is still in the shop being worked on.
    canTag: !isFinal(order.status),
    canPay: balance > 0 && status !== 'cancelled',
    canRefund: status === 'cancelled' && refundable > 0,
    // Why Complete Order can't run yet, in words; never a silent no-op.
    blocker: status === 'released' ? null
      : status === 'cancelled' ? 'This order was cancelled and can’t be completed.'
      : status !== 'ready' ? `Not ready yet (${STATUS_LABEL[order.status]}). An order can be completed once it’s marked Ready for Pickup.`
      : balance > 0 ? `Collect the ${formatPeso(balance)} balance before completing the order.`
      : null,
    // After a scan: can this laundry be handed over? Final and in-progress orders must not be released.
    scanNotice: !scanned ? null
      : status === 'released' ? { tone: 'bg-red-50 text-red-700', text: `Already completed${order.released_at ? ` on ${formatDateTime(order.released_at)}` : ''}${order.released_by_name ? ` by ${order.released_by_name}` : ''}. This laundry was released — do not hand it over again.` }
      : status === 'cancelled' ? { tone: 'bg-red-50 text-red-700', text: 'This order was cancelled. Do not release any laundry for it.' }
      : status !== 'ready' ? { tone: 'bg-amber-50 text-amber-800', text: `Not ready for pickup (${STATUS_LABEL[order.status]}). The laundry can't be released yet.` }
      : { tone: 'bg-emerald-50 text-emerald-700', text: balance > 0 ? `Order found. Collect ${formatPeso(balance)} before releasing the laundry.` : 'Order found. Fully paid — ready to release.' },
  } : null

  return {
    id, scanned, data, services, loadError, load,
    msg, setMsg, busy, run, saveThen,
    edit, setEdit, paying, setPaying, refunding, setRefunding,
    confirming, setConfirming, paidId, setPaidId, drawer, setDrawer,
    approve, pinSheet,
    cancelOrder, startProcessing, markReady, release,
    printing, printReceipt: () => print('receipt'), printTag: () => print('tag'),
    flags,
    back: () => navigate('/orders'),
  }
}

export type OrderDetailCtl = ReturnType<typeof useOrderDetail>
