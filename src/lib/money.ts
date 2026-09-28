import { formatNumberInput, stripGrouping } from './number'
/** Money is stored as integer centavos; only convert at the UI edge. */
const fmt = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })

export const formatPeso = (cents: number) => fmt.format(cents / 100)

const whole = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 })
/** "₱40" for whole pesos, "₱40.50" otherwise; for compact list and price-tag display. */
export const formatPesoShort = (cents: number) => (cents % 100 ? formatPeso(cents) : whole.format(cents / 100))

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })

/** "2:30 PM". */
export const formatTime = (iso: string) => new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })

/** Time alone for today, "Sep 20, 2:30 PM" otherwise (order history). */
export const formatStamp = (iso: string) => {
  const d = new Date(iso)
  return d.toDateString() === new Date().toDateString()
    ? formatTime(iso)
    : d.toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/** Expected pickup is stored as local "YYYY-MM-DD" or "YYYY-MM-DD HH:MM" (not UTC); shows the time only when set. */
export function formatPickup(value: string) {
  const [date, time] = value.split(' ')
  const d = new Date(`${date}T${time || '00:00'}`)
  const day = d.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })
  return time ? `${day}, ${d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}` : day
}

/**
 * Parses a peso string like "35", "35.50" or "1,250.50" (commas and ₱ are ignored) to centavos; returns null if invalid or negative.
 * Capped at 9 whole-peso digits so centavos stay exact integers (no float precision loss).
 */
export function parsePesoToCents(input: string): number | null {
  const t = stripGrouping(input)
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(t)) return null
  const [pesos, cents = ''] = t.split('.')
  return Number(pesos) * 100 + Number(cents.padEnd(2, '0')) // digit arithmetic, never float multiplication
}

/**
 * Cash received against an amount due. Only the part that settles the balance is recorded as payment;
 * anything above it is change handed back, never revenue.
 */
export function cashTender(dueCents: number, receivedCents: number) {
  const applied = Math.min(receivedCents, Math.max(dueCents, 0))
  return { applied, change: receivedCents - applied, remaining: Math.max(dueCents - applied, 0) }
}

/** Pre-fills a money field, formatted like the field shows it: 125000 → "1,250.00". */
export const centsToInput = (cents: number) => formatNumberInput((cents / 100).toFixed(2))
