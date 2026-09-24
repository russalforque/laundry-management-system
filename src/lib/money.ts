/** Money is stored as integer centavos; only convert at the UI edge. */
const fmt = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })

export const formatPeso = (cents: number) => fmt.format(cents / 100)

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })

/** Parses a peso string like "35" or "35.50" to centavos; returns null if invalid or negative. */
export function parsePesoToCents(input: string): number | null {
  const t = input.trim()
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null
  return Math.round(parseFloat(t) * 100)
}

export const centsToInput = (cents: number) => (cents / 100).toFixed(2)
