import { Capacitor, registerPlugin } from '@capacitor/core'
import { getOrderDetail, getPaymentReceipt } from '../db/orderQueries'
import { getSettings, setSetting } from '../db/settings'
import { listServices } from '../db/services'
import { getShiftDetail } from '../db/shifts'
import type { PaymentStatus } from '../types'
import { basketTag, encodeEscPos, logoBitmap, orderReceipt, paymentReceipt, receiptConfig, sampleOrder, shiftReport, testPage, type ReceiptConfig } from './receipt'

/**
 * Native side: android/app/src/main/java/com/sellix/laundry/ThermalPrinterPlugin.java
 * `silent` calls never show permission / Bluetooth-on prompts (used for background auto-connect).
 */
interface ThermalPrinterPlugin {
  listPaired(opts?: { silent?: boolean }): Promise<{ devices: PairedDevice[] }>
  discover(opts?: { timeout?: number }): Promise<{ devices: PairedDevice[] }>
  pair(opts: { address: string }): Promise<void>
  connect(opts: { address: string; silent?: boolean }): Promise<void>
  disconnect(): Promise<void>
  status(): Promise<{ connected: boolean; address: string | null }>
  print(opts: { address: string; data: string }): Promise<void>
}
export interface PairedDevice { name: string; address: string; isPrinter: boolean; paired: boolean }

const ThermalPrinter = registerPlugin<ThermalPrinterPlugin>('ThermalPrinter')

export const PRINTER_ADDRESS = 'printer_address'
export const PRINTER_NAME = 'printer_name'
/** '0' turns off connecting to the saved printer in the background; anything else (or unset) = on. */
export const PRINTER_AUTO_CONNECT = 'printer_auto_connect'

/** Bluetooth printing only exists in the Android app; the browser build falls back to window.print(). */
export const canBluetoothPrint = () => Capacitor.getPlatform() === 'android'

export class NoPrinterError extends Error {
  constructor() { super('No receipt printer found. Turn the printer on, then connect it on the Printer page.') }
}

export const listPairedDevices = async (silent = false) => (await ThermalPrinter.listPaired({ silent })).devices
export const discoverDevices = async () => (await ThermalPrinter.discover({ timeout: 12000 })).devices
export const pairDevice = (address: string) => ThermalPrinter.pair({ address })
export const connectPrinter = (address: string) => ThermalPrinter.connect({ address })
export const printerStatus = () => ThermalPrinter.status()

export async function savePrinter(d: Pick<PairedDevice, 'address' | 'name'> | null) {
  await setSetting(PRINTER_ADDRESS, d?.address ?? '')
  await setSetting(PRINTER_NAME, d?.name ?? '')
  if (!d) await ThermalPrinter.disconnect().catch(() => {})
}

/** How likely a device is the receipt printer: POS-58xx/80xx names first, then anything printer-like. */
export const printerScore = (d: PairedDevice) => (/pos[-_ ]?(58|80)\d\d|58\d\d/i.test(d.name) ? 2 : d.isPrinter ? 1 : 0)

/** Picks the best-looking paired printer and saves it; null when nothing paired looks like a printer. */
export async function autoSelectPrinter(silent = false): Promise<PairedDevice | null> {
  const best = (await listPairedDevices(silent))
    .filter((d) => printerScore(d) > 0)
    .sort((a, b) => printerScore(b) - printerScore(a) || a.name.localeCompare(b.name))[0]
  if (best) await savePrinter(best)
  return best ?? null
}

/** Saved printer, or one picked automatically from the paired devices the first time. */
async function printerAddress() {
  const saved = (await getSettings())[PRINTER_ADDRESS]
  if (saved) return saved
  const auto = await autoSelectPrinter().catch(() => null)
  if (!auto) throw new NoPrinterError()
  return auto.address
}

/** Sends to the printer; the native side reuses the open connection or reconnects on its own. */
async function send(data: string) {
  await ThermalPrinter.print({ address: await printerAddress(), data })
}

/**
 * Background, prompt-free: selects a paired printer if none is saved and opens the connection, so the
 * first receipt prints instantly. Called at login and whenever the app comes back to the foreground.
 */
export async function autoConnectPrinter() {
  if (!canBluetoothPrint()) return
  try {
    const s = await getSettings()
    if (s[PRINTER_AUTO_CONNECT] === '0') return
    const address = s[PRINTER_ADDRESS] || (await autoSelectPrinter(true))?.address
    if (address) await ThermalPrinter.connect({ address, silent: true })
  } catch {
    // Printer off / out of range / no permission yet: printing will retry and explain.
  }
}

/** A broken logo shouldn't stop a receipt from printing. */
const safeLogo = (c: ReceiptConfig) => logoBitmap(c.receipt_logo, c.receipt_paper).catch(() => null)

export async function printPaymentReceipt(orderId: number, paymentId: number) {
  const [detail, settings] = await Promise.all([getPaymentReceipt(orderId, paymentId), getSettings()])
  if (!detail) throw new Error('Payment not found.')
  const c = receiptConfig(settings)
  await send(encodeEscPos(paymentReceipt(detail, c, await safeLogo(c))))
}

export async function printOrderReceipt(orderId: number) {
  const [detail, settings] = await Promise.all([getOrderDetail(orderId), getSettings()])
  if (!detail) throw new Error('Order not found.')
  const c = receiptConfig(settings)
  await send(encodeEscPos(orderReceipt(detail, c, await safeLogo(c))))
}

/** The order's basket tag (see basketTag); null when the order doesn't exist. Add-ons are told apart by their service. */
export async function loadBasketTag(orderId: number) {
  const [detail, settings, services] = await Promise.all([getOrderDetail(orderId), getSettings(), listServices()])
  if (!detail) return null
  return basketTag(detail, receiptConfig(settings), new Set(services.filter((s) => s.is_addon).map((s) => s.id)))
}

/** Basket tag for the laundry basket (Order Details); the customer receipt is untouched. */
export async function printBasketTag(orderId: number) {
  const doc = await loadBasketTag(orderId)
  if (!doc) throw new Error('Order not found.')
  await send(encodeEscPos(doc))
}

/** Store shift summary (Store Shift screen, at closing or from the history). */
export async function printShiftReport(shiftId: number) {
  const [detail, settings] = await Promise.all([getShiftDetail(shiftId), getSettings()])
  if (!detail) throw new Error('Store shift not found.')
  await send(encodeEscPos(shiftReport(detail, receiptConfig(settings))))
}

/** Prints the sample order with receipt settings that may not be saved yet (Settings › Receipt). */
export async function printSampleReceipt(c: ReceiptConfig, status: PaymentStatus) {
  await send(encodeEscPos(orderReceipt(sampleOrder(status), c, await safeLogo(c))))
}

export async function printTestPage(address: string) {
  const c = receiptConfig(await getSettings())
  await ThermalPrinter.print({ address, data: encodeEscPos(testPage(c)) })
}

// ── Cash drawer ──────────────────────────────────────────────────────
/** '0' stops the drawer opening by itself after a cash payment; anything else (or unset) = on. */
export const CASH_DRAWER_AUTO = 'cash_drawer_auto'

/**
 * The drawer is wired to the printer's RJ11/RJ12 kick port, so it opens with the ESC/POS pulse
 * `ESC p m t1 t2` sent through the same printer connection. t1 = 25 (50 ms on), t2 = 250 (500 ms off).
 * Pin 2 (m = 0) is the usual wiring; pin 5 (m = 1) is pulsed too for drawers wired the other way.
 */
const DRAWER_KICK = btoa(String.fromCharCode(0x1b, 0x70, 0, 25, 250, 0x1b, 0x70, 1, 25, 250))
/** Taps within this window after a successful kick are ignored, so the drawer isn't fired twice. */
const DRAWER_COOLDOWN_MS = 2000
let drawerJob: Promise<void> | null = null
let drawerOpenedAt = 0

/** Opens the cash drawer through the receipt printer. Repeated taps share one command. */
export function openCashDrawer(): Promise<void> {
  if (!canBluetoothPrint()) return Promise.reject(new Error('The cash drawer opens through the Bluetooth receipt printer in the Android app.'))
  if (drawerJob) return drawerJob
  if (Date.now() - drawerOpenedAt < DRAWER_COOLDOWN_MS) return Promise.resolve()
  drawerJob = send(DRAWER_KICK)
    .then(() => { drawerOpenedAt = Date.now() })
    .finally(() => { drawerJob = null })
  return drawerJob
}

/**
 * After a payment is saved: opens the drawer for cash only, when the setting is on.
 * Never throws, since the payment is already recorded. Returns null when nothing was attempted.
 */
export async function autoOpenCashDrawer(method: string): Promise<{ ok: boolean; msg: string } | null> {
  if (method !== 'cash' || !canBluetoothPrint()) return null
  try {
    if ((await getSettings())[CASH_DRAWER_AUTO] === '0') return null
    await openCashDrawer()
    return { ok: true, msg: 'Cash drawer opened.' }
  } catch (e) {
    return { ok: false, msg: `Payment saved, but the cash drawer did not open. ${e instanceof Error ? e.message : ''}`.trim() }
  }
}
