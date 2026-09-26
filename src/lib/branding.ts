import type { Settings } from '../db/settings'

/**
 * Business branding: name, logo and theme colors, stored in the `settings` table.
 * The Tailwind `blue-*` scale is the app's primary color token; a custom primary color replaces
 * that whole scale through CSS variables, so every screen follows it without per-page colors.
 * Semantic colors (emerald / amber / red) are separate scales and never change.
 */
export const BRANDING_DEFAULTS = {
  business_name: 'Sellix Laundry', // shared with Business Information and the receipt header
  brand_logo: '', // downscaled JPEG data URL; empty = bundled app logo
  brand_primary: '', // '#rrggbb'; empty = stock blue
  brand_accent: '', // '#rrggbb'; empty = same as primary
}
export type Branding = typeof BRANDING_DEFAULTS
export const BRANDING_KEYS = Object.keys(BRANDING_DEFAULTS) as (keyof Branding)[]

/** Tailwind blue-600: what the color picker shows while no custom color is set. */
export const DEFAULT_PRIMARY = '#2563eb'

export const isHex = (v: string) => /^#[0-9a-f]{6}$/i.test(v)

export function brandingFrom(s: Settings): Branding {
  const b = { ...BRANDING_DEFAULTS }
  for (const k of BRANDING_KEYS) if (s[k] !== undefined) b[k] = s[k]
  return b
}

export const brandName = (b: Branding) => b.business_name.trim() || BRANDING_DEFAULTS.business_name

// ── Contrast ────────────────────────────────────────────────────────
const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const toHex = (c: number[]) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`

function luminance(c: number[]) {
  const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
/** WCAG contrast ratio against white. */
export const contrastOnWhite = (hex: string) => 1.05 / (luminance(channels(hex)) + 0.05)

/**
 * Darkens a color just enough for white text on it (and it as text on white) to meet WCAG AA (4.5:1).
 * Primary fills buttons with white labels and colors links on the white background, so both must stay readable.
 */
export function readable(hex: string, min = 4.5) {
  let c = channels(hex)
  while (contrastOnWhite(toHex(c)) < min) c = c.map((v) => v * 0.95)
  return toHex(c)
}

// ── Theme variables ─────────────────────────────────────────────────
/** Stock Tailwind blue, used by the preview when the primary color is left at default. */
const STOCK_BLUE: Record<string, string> = {
  50: 'oklch(97% 0.014 254.604)', 100: 'oklch(93.2% 0.032 255.585)', 200: 'oklch(88.2% 0.059 254.128)',
  300: 'oklch(80.9% 0.105 251.813)', 400: 'oklch(70.7% 0.165 254.624)', 500: 'oklch(62.3% 0.214 259.815)',
  600: 'oklch(54.6% 0.245 262.881)', 700: 'oklch(48.8% 0.243 264.376)', 800: 'oklch(42.4% 0.199 265.638)',
  900: 'oklch(37.9% 0.146 265.522)', 950: 'oklch(28.2% 0.091 267.935)',
}
/** Share of the brand color mixed with white (lighter steps) or black (darker steps); 600 is the color itself. */
const TINT: Record<string, number> = { 50: 7, 100: 14, 200: 27, 300: 45, 400: 68, 500: 86 }
const SHADE: Record<string, number> = { 700: 84, 800: 70, 900: 56, 950: 40 }

function scale(hex: string): Record<string, string> {
  const out: Record<string, string> = { 600: hex }
  for (const [k, p] of Object.entries(TINT)) out[k] = `color-mix(in oklab, ${hex} ${p}%, white)`
  for (const [k, p] of Object.entries(SHADE)) out[k] = `color-mix(in oklab, ${hex} ${p}%, black)`
  return out
}

/** The CSS variables for a branding: the primary (blue-*) scale and the accent token. */
export function themeVars(b: Pick<Branding, 'brand_primary' | 'brand_accent'>): Record<string, string> {
  const primary = isHex(b.brand_primary) ? readable(b.brand_primary) : null
  const steps = primary ? scale(primary) : STOCK_BLUE
  const vars = Object.fromEntries(Object.entries(steps).map(([k, v]) => [`--color-blue-${k}`, v]))
  vars['--color-accent'] = isHex(b.brand_accent) ? readable(b.brand_accent) : steps[600]
  return vars
}

const VAR_NAMES = Object.keys(themeVars(BRANDING_DEFAULTS))
const CACHE = 'branding'

/**
 * Applies branding to the whole app. With default colors the variables are removed, so the
 * stock Tailwind blue from the stylesheet is used exactly.
 */
export function applyBranding(b: Branding) {
  const root = document.documentElement.style
  const custom = isHex(b.brand_primary) || isHex(b.brand_accent)
  const vars = themeVars(b)
  for (const k of VAR_NAMES) custom ? root.setProperty(k, vars[k]) : root.removeProperty(k)
  document.title = brandName(b)
  // The database stays the source of truth; this copy only brands the splash screen before it opens.
  try { localStorage.setItem(CACHE, JSON.stringify(b)) } catch { /* storage unavailable */ }
}

export function cachedBranding(): Branding {
  try {
    const b = JSON.parse(localStorage.getItem(CACHE) ?? 'null')
    if (b && typeof b === 'object') return { ...BRANDING_DEFAULTS, ...b }
  } catch { /* storage unavailable or corrupt */ }
  return { ...BRANDING_DEFAULTS }
}
