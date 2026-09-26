/**
 * Number text for inputs. Fields show thousands separators while typing ("1,000,000.50"); everything that
 * calculates, validates or saves reads the raw number back with parseNumber / parsePesoToCents.
 * Commas and ₱ are display only.
 */

export interface NumberFormat {
  /** Decimal places allowed; 0 = whole numbers only. */
  decimals?: number
  /** Most digits before the decimal point; extra digits typed are ignored. */
  maxInt?: number
}

/** Characters that carry the value: digits and the decimal point. Everything else is formatting. */
export const isSignificant = (ch: string) => (ch >= '0' && ch <= '9') || ch === '.'

/**
 * Cleans typed or pasted text into a well-formed number with commas: digits and one decimal point only,
 * no leading zeros, at most `decimals` decimal places and `maxInt` whole digits. "" stays "".
 * Idempotent, so an already formatted value comes back unchanged.
 */
export function formatNumberInput(raw: string, { decimals = 2, maxInt = 9 }: NumberFormat = {}): string {
  const s = raw.replace(/[^\d.]/g, '')
  const dot = s.indexOf('.')
  let int = (dot < 0 ? s : s.slice(0, dot)).replace(/^0+(?=\d)/, '').slice(0, maxInt)
  let frac = dot < 0 || decimals === 0 ? null : s.slice(dot + 1).replace(/\./g, '').slice(0, decimals)
  if (frac !== null && int === '') int = '0' // ".5" reads as "0.5"
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return frac === null ? grouped : `${grouped}.${frac}`
}

/** Drops thousands separators, spaces and the peso sign, leaving the raw number text. */
export const stripGrouping = (s: string) => s.replace(/[,\s₱]/g, '')

/** "1,250.5" → 1250.5; null for blank or malformed text ("2abc", "1.2.3", "-5"). */
export function parseNumber(s: string | null | undefined): number | null {
  const t = stripGrouping(s ?? '')
  return /^(\d+(\.\d*)?|\.\d+)$/.test(t) ? Number(t) : null
}

const grouped = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 2 })
/** Quantities and weights for display: 1250 → "1,250", 3.5 → "3.5" (no currency, no forced decimals). */
export const formatNumber = (n: number) => grouped.format(n)
