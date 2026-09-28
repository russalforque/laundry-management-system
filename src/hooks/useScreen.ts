import { useSyncExternalStore } from 'react'

/**
 * Which layout family to render. Matches Tailwind's `md` (768px) and `xl` (1280px) breakpoints, so a page
 * that switches with this hook agrees with any `md:` / `xl:` classes around it.
 *   mobile  < 768     phone pages (bottom tab bar, wizards, bottom sheets)
 *   tablet  768–1279  navigation rail, large-screen layouts sized for touch
 *   desktop ≥ 1280    full sidebar, widest layouts (split views, preview panels)
 */
export type Screen = 'mobile' | 'tablet' | 'desktop'

const TABLET = '(min-width: 768px)'
const DESKTOP = '(min-width: 1280px)'

function read(): Screen {
  if (typeof window === 'undefined' || !window.matchMedia) return 'mobile'
  return window.matchMedia(DESKTOP).matches ? 'desktop' : window.matchMedia(TABLET).matches ? 'tablet' : 'mobile'
}

function subscribe(cb: () => void) {
  const lists = [TABLET, DESKTOP].map((q) => window.matchMedia(q))
  for (const l of lists) l.addEventListener('change', cb)
  return () => { for (const l of lists) l.removeEventListener('change', cb) }
}

export function useScreen(): Screen {
  return useSyncExternalStore(subscribe, read, () => 'mobile')
}

/** Tablet or desktop: pages use this to pick their large-screen layout over the phone one. */
export const useWide = () => useScreen() !== 'mobile'

/** Whether a media query matches, kept live (e.g. '(orientation: landscape)'). */
export function useMedia(query: string) {
  return useSyncExternalStore(
    (cb) => { const l = window.matchMedia(query); l.addEventListener('change', cb); return () => l.removeEventListener('change', cb) },
    () => window.matchMedia(query).matches,
    () => false,
  )
}
