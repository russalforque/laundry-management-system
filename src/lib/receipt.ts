import qrcode from 'qrcode-generator'
import type { getOrderDetail, getPaymentReceipt } from '../db/orderQueries'
import { itemQtyLine } from './pricing'
import type { Settings } from '../db/settings'
import type { getShiftDetail } from '../db/shifts'
import type { PaymentStatus } from '../types'
import { formatDateTime, formatPeso } from './money'
import { METHOD_LABEL, NOT_PROOF_OF_PAYMENT, RECEIPT_PAY_LABEL, STATUS_LABEL } from './orders'

/**
 * Receipt layout shared by the Bluetooth printer (ESC/POS) and the on-screen preview, so what the
 * preview shows is exactly what prints: same wrapping, alignment and spacing, character for character.
 */

// ── Settings ────────────────────────────────────────────────────────
/** Stored in the `settings` table; toggles are '1' / '0'. Missing keys fall back to these defaults. */
export const RECEIPT_DEFAULTS = {
  business_name: 'Sellix Laundry',
  business_address: '',
  business_contact: '',
  receipt_logo: '', // downscaled JPEG data URL
  receipt_header: '',
  receipt_footer: 'Thank you!',
  receipt_paper: '58' as PaperWidth,
  receipt_show_customer: '1',
  receipt_show_phone: '0',
  receipt_show_order_no: '1',
  receipt_show_datetime: '1',
  receipt_show_items: '1',
  receipt_show_method: '1',
  receipt_show_staff: '1',
  receipt_show_qr: '1', // order number as a QR code, for Scan QR at pickup
}
export type ReceiptConfig = typeof RECEIPT_DEFAULTS
export type ReceiptKey = keyof ReceiptConfig
export const RECEIPT_KEYS = Object.keys(RECEIPT_DEFAULTS) as ReceiptKey[]
/** Business identity is shared with Business Information, so Reset to Default leaves it alone. */
export const RECEIPT_RESET_KEYS = RECEIPT_KEYS.filter((k) => !k.startsWith('business_'))

export function receiptConfig(s: Settings): ReceiptConfig {
  const c = { ...RECEIPT_DEFAULTS }
  for (const k of RECEIPT_KEYS) if (s[k] !== undefined) (c as Record<string, string>)[k] = s[k]
  if (c.receipt_paper !== '80') c.receipt_paper = '58'
  return c
}

const on = (c: ReceiptConfig, k: ReceiptKey) => c[k] === '1'

// ── Paper ───────────────────────────────────────────────────────────
export type PaperWidth = '58' | '80'
/** Font A is 12 dots wide: 384 dots = 32 columns (58 mm), 576 dots = 48 columns (80 mm). */
export const PAPER: Record<PaperWidth, { cols: number; dots: number }> = {
  '58': { cols: 32, dots: 384 },
  '80': { cols: 48, dots: 576 },
}

/** 1 = black. Always the full paper width, so images are centered without relying on printer alignment. */
export interface Bitmap { width: number; height: number; data: Uint8Array }

export type Line =
  | { kind: 'text'; text: string; bold?: boolean; big?: boolean }
  | { kind: 'image'; bitmap: Bitmap }

export interface ReceiptDoc { cols: number; dots: number; lines: Line[] }

/** The printer's built-in code page is ASCII-safe only; map common symbols and strip accents (ñ → n). */
function ascii(s: string) {
  return s
    .replace(/₱/g, 'P').replace(/×/g, 'x').replace(/·/g, '-').replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[\t  -   　]/g, ' ').replace(/[^\x20-\x7e\n]/g, '?')
}

/** Word-wraps to `width` columns; words longer than a line are hard-split. Keeps blank lines. */
function wrap(text: string, width: number): string[] {
  const out: string[] = []
  for (const para of ascii(text).split('\n')) {
    const words = para.split(/\s+/).filter(Boolean).flatMap((w) => w.match(new RegExp(`.{1,${width}}`, 'g'))!)
    let line = ''
    for (const w of words) {
      if (!line) line = w
      else if (line.length + 1 + w.length <= width) line += ` ${w}`
      else { out.push(line); line = w }
    }
    out.push(line)
  }
  return out
}

type Style = { bold?: boolean; big?: boolean }

/** Builds padded fixed-width lines. Double-size text uses half the columns. */
class Layout {
  readonly lines: Line[] = []
  readonly cols: number
  readonly dots: number
  constructor(paper: PaperWidth) { ({ cols: this.cols, dots: this.dots } = PAPER[paper]) }

  private push(text: string, s: Style = {}) { this.lines.push({ kind: 'text', text: text.replace(/\s+$/, ''), ...s }) }
  private width(s: Style) { return s.big ? this.cols / 2 : this.cols }

  left(t: string, s: Style = {}) { for (const l of wrap(t, this.width(s))) this.push(l, s); return this }
  center(t: string, s: Style = {}) {
    const w = this.width(s)
    for (const l of wrap(t, w)) this.push(' '.repeat(Math.floor((w - l.length) / 2)) + l, s)
    return this
  }
  /** Left label, right value. If both don't fit, the label wraps and the value goes right-aligned below. */
  row(l: string, r: string, s: Style = {}) {
    const left = ascii(l), right = ascii(r), w = this.width(s)
    if (left.length + 1 + right.length <= w) {
      this.push(left + ' '.repeat(w - left.length - right.length) + right, s)
    } else {
      this.left(left, s)
      for (const v of wrap(right, w)) this.push(v.padStart(w), s)
    }
    return this
  }
  /** Divider; never two in a row and never at the very top. */
  rule() {
    const last = this.lines.at(-1)
    if (last && !(last.kind === 'text' && /^-+$/.test(last.text))) this.push('-'.repeat(this.cols))
    return this
  }
  blank() { this.push(''); return this }
  image(bitmap: Bitmap | null) { if (bitmap) this.lines.push({ kind: 'image', bitmap }); return this }
  /** Big status stamp; falls back to bold normal size when the label is too long for double width. */
  stamp(label: string) {
    return label.length <= this.cols / 2 ? this.center(label, { bold: true, big: true }) : this.center(`*** ${label} ***`, { bold: true })
  }
  doc(): ReceiptDoc { return { cols: this.cols, dots: this.dots, lines: this.lines } }
}

// ── Bitmaps (logo, QR) ──────────────────────────────────────────────
/** Max logo box, as a share of the paper width / in dots tall. */
const LOGO_W = 0.6, LOGO_H = 160

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not read the logo image.'))
    img.src = src
  })
}

/** Scales the logo to fit, centers it on a paper-width canvas and dithers it to black and white. */
export async function logoBitmap(dataUrl: string, paper: PaperWidth): Promise<Bitmap | null> {
  if (!dataUrl) return null
  const img = await loadImage(dataUrl)
  const { dots } = PAPER[paper]
  const scale = Math.min((dots * LOGO_W) / img.naturalWidth, LOGO_H / img.naturalHeight)
  const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = dots
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, dots, h)
  ctx.drawImage(img, Math.floor((dots - w) / 2), 0, w, h)
  const px = ctx.getImageData(0, 0, dots, h).data
  // Floyd–Steinberg dithering keeps photos and gradients readable on a 1-bit printer.
  const lum = new Float32Array(dots * h)
  for (let i = 0; i < lum.length; i++) lum[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]
  const data = new Uint8Array(dots * h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < dots; x++) {
      const i = y * dots + x
      const black = lum[i] < 128
      data[i] = black ? 1 : 0
      const err = lum[i] - (black ? 0 : 255)
      if (x + 1 < dots) lum[i + 1] += (err * 7) / 16
      if (y + 1 < h) {
        if (x > 0) lum[i + dots - 1] += (err * 3) / 16
        lum[i + dots] += (err * 5) / 16
        if (x + 1 < dots) lum[i + dots + 1] += err / 16
      }
    }
  return { width: dots, height: h, data }
}

/**
 * QR code drawn as dots, so it works on any printer that can print images (no native QR command needed).
 * Sized for phone cameras: about 60% of the paper width and never under 4 dots (0.5 mm) per module, so an
 * order number prints ~18 mm wide on 58 mm paper and ~24 mm on 80 mm.
 */
export function qrBitmap(text: string, paper: PaperWidth): Bitmap {
  const qr = qrcode(0, 'M')
  qr.addData(ascii(text))
  qr.make()
  const n = qr.getModuleCount()
  const { dots } = PAPER[paper]
  const quiet = 4
  const cell = Math.max(4, Math.floor(Math.min(dots * 0.6, 288) / (n + quiet * 2)))
  const size = (n + quiet * 2) * cell
  const x0 = Math.floor((dots - size) / 2) + quiet * cell
  const data = new Uint8Array(dots * size)
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      if (!qr.isDark(r, c)) continue
      for (let dy = 0; dy < cell; dy++) data.fill(1, (quiet * cell + r * cell + dy) * dots + x0 + c * cell, (quiet * cell + r * cell + dy) * dots + x0 + (c + 1) * cell)
    }
  return { width: dots, height: size, data }
}

// ── Receipts ────────────────────────────────────────────────────────
export type OrderReceiptData = NonNullable<Awaited<ReturnType<typeof getOrderDetail>>>
export type PaymentReceiptData = NonNullable<Awaited<ReturnType<typeof getPaymentReceipt>>>

function header(r: Layout, c: ReceiptConfig, logo: Bitmap | null) {
  if (logo) r.image(logo).blank()
  r.center(c.business_name || RECEIPT_DEFAULTS.business_name, { bold: true, big: true })
  if (c.business_address.trim()) r.center(c.business_address)
  if (c.business_contact.trim()) r.center(`Tel: ${c.business_contact}`)
  if (c.receipt_header.trim()) r.blank().center(c.receipt_header)
}

function footer(r: Layout, c: ReceiptConfig, orderNumber: string) {
  if (on(c, 'receipt_show_qr')) r.rule().image(qrBitmap(orderNumber, c.receipt_paper)).center(orderNumber)
  if (c.receipt_footer.trim()) r.rule().center(c.receipt_footer)
  return r.doc()
}

export function orderReceipt({ order, items, payments }: OrderReceiptData, c: ReceiptConfig, logo: Bitmap | null = null): ReceiptDoc {
  const r = new Layout(c.receipt_paper)
  header(r, c, logo)
  r.rule()
  if (on(c, 'receipt_show_order_no')) r.row('Order #', order.order_number, { bold: true })
  if (on(c, 'receipt_show_datetime')) r.row('Date', formatDateTime(order.received_at))
  if (on(c, 'receipt_show_customer')) r.row('Customer', order.customer_name)
  if (on(c, 'receipt_show_phone') && order.customer_contact) r.row('Phone', order.customer_contact)
  if (on(c, 'receipt_show_staff') && order.created_by_name) r.row('Cashier', order.created_by_name)
  r.rule()
  if (on(c, 'receipt_show_items')) {
    for (const i of items) {
      r.left(i.service_name)
      r.row(`  ${itemQtyLine(i, 'x')}`, i.included_qty >= i.quantity && !i.amount_cents ? 'INCL.' : formatPeso(i.amount_cents))
      if (i.note) r.left(`  ${i.note}`)
    }
    r.rule()
  }
  if (on(c, 'receipt_show_items') || order.discount_cents > 0) r.row('Subtotal', formatPeso(order.subtotal_cents))
  if (order.discount_cents > 0) r.row('Discount', `-${formatPeso(order.discount_cents)}`)
  r.row('TOTAL', formatPeso(order.total_cents), { bold: true })
  if (order.paid_cents > 0) r.row('Amount Paid', formatPeso(order.paid_cents))
  // Cash tendered at drop-off (Pay Now); later payments print their own payment receipts.
  const cash = payments.length === 1 ? payments[0] : null
  if (cash?.tendered_cents != null) {
    r.row('Amount Received', formatPeso(cash.tendered_cents))
    r.row('Change', formatPeso(cash.tendered_cents - cash.amount_cents), { bold: true })
  }
  const voided = order.status === 'cancelled'
  if (order.refunded_cents > 0) r.row('Refunded', `-${formatPeso(order.refunded_cents)}`, { bold: true })
  if (order.balance_cents > 0 && !voided) r.row('Balance Due', formatPeso(order.balance_cents), { bold: true })
  if (on(c, 'receipt_show_method') && payments.length) {
    r.row('Paid via', [...new Set(payments.map((p) => METHOD_LABEL[p.method] ?? p.method))].join(', '))
  }
  r.rule()
  r.row('Status', STATUS_LABEL[order.status])
  if (order.expected_pickup) r.row('Pickup', order.expected_pickup)
  if (order.notes) r.left(`Note: ${order.notes}`)
  // A reprint of a cancelled order must never read as a claim ticket or a balance still owed.
  if (voided) r.rule().stamp('CANCELLED - VOID').center('Not valid for pickup')
  else {
    r.rule().stamp(RECEIPT_PAY_LABEL[order.payment_status])
    if (order.payment_status !== 'paid') r.center(NOT_PROOF_OF_PAYMENT)
  }
  return footer(r, c, order.order_number)
}

export function paymentReceipt(d: PaymentReceiptData, c: ReceiptConfig, logo: Bitmap | null = null): ReceiptDoc {
  const { order, payment } = d
  const r = new Layout(c.receipt_paper)
  header(r, c, logo)
  r.blank().center('PAYMENT RECEIPT', { bold: true }).rule()
  if (on(c, 'receipt_show_order_no')) r.row('Order #', order.order_number, { bold: true })
  if (on(c, 'receipt_show_customer')) r.row('Customer', order.customer_name)
  if (on(c, 'receipt_show_phone') && order.customer_contact) r.row('Phone', order.customer_contact)
  if (on(c, 'receipt_show_datetime')) r.row('Date', formatDateTime(payment.paid_at))
  if (on(c, 'receipt_show_staff')) r.row('Received by', payment.user_name)
  r.rule()
  r.row('Order Total', formatPeso(order.total_cents))
  r.row('Previous Balance', formatPeso(d.previousBalanceCents))
  const tendered = payment.tendered_cents
  r.row(tendered != null ? 'AMOUNT PAID' : 'AMOUNT RECEIVED', formatPeso(payment.amount_cents), { bold: true })
  if (on(c, 'receipt_show_method')) {
    r.row('Method', METHOD_LABEL[payment.method] ?? payment.method)
    if (payment.reference) r.row('Reference', payment.reference)
  }
  if (tendered != null) {
    r.row('Amount Received', formatPeso(tendered))
    r.row('Change', formatPeso(tendered - payment.amount_cents), { bold: true })
  }
  r.row('Total Paid', formatPeso(d.paidAfterCents))
  r.row('Remaining Balance', formatPeso(d.balanceAfterCents), { bold: true })
  r.rule().stamp(RECEIPT_PAY_LABEL[d.statusAfter])
  return footer(r, c, order.order_number)
}

/** Store shift summary (opening, collections, drawer count), printed at closing or from the shift history. */
export function shiftReport(d: NonNullable<Awaited<ReturnType<typeof getShiftDetail>>>, c: ReceiptConfig): ReceiptDoc {
  const { shift: s, totals: t } = d
  const r = new Layout(c.receipt_paper)
  r.center(c.business_name, { bold: true })
  r.blank().center('STORE SHIFT REPORT', { bold: true }).rule()
  r.row('Opened', formatDateTime(s.started_at))
  r.row('Opened by', s.user_name)
  if (s.ended_at) {
    r.row('Closed', formatDateTime(s.ended_at))
    r.row('Closed by', s.closed_by_name ?? '-')
  } else r.row('Status', 'OPEN')
  r.rule()
  r.row('Opening Cash', formatPeso(t.opening_cents))
  r.row('Cash Received', formatPeso(t.cash_cents))
  r.row('Cash Refunds', formatPeso(t.outflow_cents))
  r.row('EXPECTED CASH', formatPeso(t.expected_cash_cents), { bold: true })
  r.rule()
  r.row('GCash/Non-cash', formatPeso(t.noncash_cents))
  r.row('Total Payments', formatPeso(t.cash_cents + t.noncash_cents))
  if (t.refunds_cents > 0) r.row('Total Refunds', `-${formatPeso(t.refunds_cents)}`)
  if (t.collected_later_cents > 0) r.row(' incl. older orders', formatPeso(t.collected_later_cents))
  r.row('Orders Taken', String(t.orders_count))
  r.row('Released', String(t.released_count))
  if (s.actual_cash_cents != null && s.difference_cents != null) {
    const diff = s.difference_cents
    r.rule()
    r.row('ACTUAL CASH', formatPeso(s.actual_cash_cents), { bold: true })
    r.row('Difference', `${diff > 0 ? '+' : diff < 0 ? '-' : ''}${formatPeso(Math.abs(diff))}`, { bold: true })
    r.rule().stamp(diff === 0 ? 'BALANCED' : diff > 0 ? 'OVER' : 'SHORT')
  }
  r.blank().center(`Printed ${formatDateTime(new Date().toISOString())}`)
  return r.doc()
}

/** Settings › Printer test page: checks the connection and that a full line fits the chosen paper. */
export function testPage(c: ReceiptConfig): ReceiptDoc {
  const r = new Layout(c.receipt_paper)
  r.center('Printer OK', { bold: true, big: true }).center(c.business_name).center(formatDateTime(new Date().toISOString()))
  return r.rule().left('1234567890'.repeat(5).slice(0, r.cols)).rule().doc()
}

/** Made-up order for the Settings preview and Test Print. */
export function sampleOrder(status: PaymentStatus): OrderReceiptData {
  const total = 32500
  const paid = status === 'paid' ? total : status === 'partial' ? 20000 : 0
  const now = new Date().toISOString()
  return {
    order: {
      id: 0, order_number: 'SL-000123', customer_id: 0, customer_name: 'Juan Dela Cruz', customer_contact: '0917 123 4567',
      created_by: 0, created_by_name: 'Maria Santos', released_at: null, released_by_name: null, received_at: now, expected_pickup: null,
      subtotal_cents: total, discount_cents: 0, total_cents: total, paid_cents: paid, balance_cents: total - paid, refunded_cents: 0,
      payment_status: status, status: 'received', notes: '',
    },
    items: [
      { id: 1, service_name: 'Wash + Dry + Fold', pricing_method: 'per_piece', pricing_type: 'per_load', unit_price_cents: 17500, quantity: 1, weight_kg: 7.5, included_qty: 0, note: 'Includes Wash, Dry, Fold + 1× Detergent, 1× Fabcon per load', amount_cents: 17500 },
      { id: 2, service_name: 'Comforter (Queen)', pricing_method: 'fixed', pricing_type: 'fixed', unit_price_cents: 12000, quantity: 1, weight_kg: null, included_qty: 0, note: '', amount_cents: 12000 },
      { id: 3, service_name: 'Detergent', pricing_method: 'per_piece', pricing_type: 'per_quantity', unit_price_cents: 1500, quantity: 2, weight_kg: null, included_qty: 1, note: '', amount_cents: 1500 },
      { id: 4, service_name: 'Fabcon', pricing_method: 'per_piece', pricing_type: 'per_quantity', unit_price_cents: 1500, quantity: 2, weight_kg: null, included_qty: 1, note: '', amount_cents: 1500 },
    ],
    refunds: [],
    payments: paid ? [{ id: 1, order_id: 0, amount_cents: paid, method: 'cash', paid_at: now, reference: '', tendered_cents: status === 'paid' ? 50000 : paid, user_name: 'Maria Santos' }] : [],
  }
}

// ── ESC/POS ─────────────────────────────────────────────────────────
const ESC = 0x1b
const GS = 0x1d
/** Raster images go out in bands so cheap printers' receive buffers don't overflow. */
const BAND = 128

export function encodeEscPos(doc: ReceiptDoc, feed = 4): string {
  const b: number[] = [ESC, 0x40, ESC, 0x61, 0] // initialize, left align (all alignment is done with spaces)
  for (const line of doc.lines) {
    if (line.kind === 'text') {
      b.push(ESC, 0x45, line.bold ? 1 : 0, GS, 0x21, line.big ? 0x11 : 0)
      for (const ch of line.text) b.push(ch.charCodeAt(0))
      b.push(0x0a)
      continue
    }
    const { width, height, data } = line.bitmap
    const bytesPerRow = Math.ceil(width / 8)
    for (let y0 = 0; y0 < height; y0 += BAND) {
      const rows = Math.min(BAND, height - y0)
      b.push(GS, 0x76, 0x30, 0, bytesPerRow & 0xff, bytesPerRow >> 8, rows & 0xff, rows >> 8)
      for (let y = y0; y < y0 + rows; y++)
        for (let bx = 0; bx < bytesPerRow; bx++) {
          let v = 0
          for (let bit = 0; bit < 8; bit++) {
            const x = bx * 8 + bit
            if (x < width && data[y * width + x]) v |= 0x80 >> bit
          }
          b.push(v)
        }
    }
  }
  b.push(ESC, 0x45, 0, GS, 0x21, 0, ESC, 0x64, feed)
  let s = ''
  for (const x of b) s += String.fromCharCode(x)
  return btoa(s)
}
