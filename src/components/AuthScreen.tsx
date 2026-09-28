import type { ReactNode } from 'react'
import appLogo from '../assets/app-logo.png'
import { useBranding } from '../context/BrandingContext'
import { brandName } from '../lib/branding'
import { useMedia, useWide } from '../hooks/useScreen'
import { I, Icon } from './Icons'

export const primaryAction =
  'flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 text-base font-semibold text-white shadow-lg shadow-blue-600/25 transition active:scale-[0.98] active:bg-blue-700 disabled:opacity-60'
export const secondaryAction =
  'flex h-14 w-full items-center justify-center rounded-2xl bg-blue-50 text-base font-semibold text-blue-600 transition active:scale-[0.98] active:bg-blue-100'

/**
 * Full-screen white page for the welcome, setup and sign-in screens: edge to edge on phones,
 * a phone-sized card on tablets. `decor` adds the soft circle seen behind the splash.
 */
export function AuthScreen({ children, decor }: { children: ReactNode; decor?: boolean }) {
  // Landscape tablets / desktops: brand panel beside the screen, sized to the viewport so nothing is cut off.
  // The splash (decor) keeps the single card: it's up for a moment and already shows the brand.
  const wide = useWide()
  const landscape = useMedia('(orientation: landscape)')
  const split = wide && landscape && !decor
  if (split) {
    return (
      <div className="flex h-dvh overflow-hidden bg-blue-50">
        <BrandPanel />
        <div className="flex min-w-0 flex-1 items-center justify-center p-6">
          <main className="relative isolate flex h-full max-h-190 w-full max-w-md flex-col overflow-y-auto overflow-x-hidden rounded-4xl bg-white px-8 pb-6 pt-[max(env(safe-area-inset-top),0.75rem)] shadow-xl shadow-blue-900/10">
            {children}
          </main>
        </div>
      </div>
    )
  }
  return (
    <div className="flex min-h-dvh justify-center bg-white sm:items-center sm:bg-blue-50 sm:p-6">
      <main className="relative isolate flex min-h-dvh w-full flex-col overflow-hidden bg-white px-6 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-[max(env(safe-area-inset-top),0.75rem)] sm:min-h-[760px] sm:max-w-md sm:rounded-4xl sm:px-8 sm:shadow-xl sm:shadow-blue-900/10">
        {decor && (
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute -right-32 -top-24 size-96 rounded-full bg-blue-50/80" />
            <div className="absolute -bottom-40 -left-40 size-96 rounded-full bg-blue-50/60" />
          </div>
        )}
        {children}
      </main>
    </div>
  )
}

/** What the app does, in three lines, for the brand panel. */
const FEATURES: { icon: ReactNode; title: string; text: string }[] = [
  { icon: I.orders, title: 'Orders & payments', text: 'Take orders, collect Pay Now or Pay Later, print receipts.' },
  { icon: I.basket, title: 'Simple workflow', text: 'Received, Processing, Ready for Pickup, Completed.' },
  { icon: I.chart, title: 'Reports & store shift', text: 'Daily sales, balances due and drawer counts.' },
]

/**
 * Left half of the landscape sign-in screens: business logo and name on the brand color (Settings › Branding),
 * with a short reminder of what the app does.
 */
function BrandPanel() {
  const { brand } = useBranding()
  const name = brandName(brand)
  const cut = name.lastIndexOf(' ')
  return (
    <aside aria-hidden className="relative hidden w-[42%] max-w-xl shrink-0 flex-col justify-between overflow-hidden bg-blue-600 px-10 pb-10 pt-[max(env(safe-area-inset-top),2.5rem)] text-white md:flex">
      <div className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-white/10" />
      <div className="pointer-events-none absolute -bottom-32 -left-20 size-96 rounded-full bg-white/5" />
      <div className="relative flex items-center gap-4">
        <span className="grid size-18 shrink-0 place-items-center rounded-3xl bg-white shadow-lg shadow-blue-900/20"><LogoTile size="sm" /></span>
        <span className="min-w-0">
          <span className="block truncate text-3xl font-bold leading-tight tracking-tight">
            {cut < 0 ? name : <>{name.slice(0, cut)} <span className="text-blue-100">{name.slice(cut + 1)}</span></>}
          </span>
          <span className="block text-sm text-blue-100">Laundry Management System</span>
        </span>
      </div>
      <ul className="relative space-y-5">
        {FEATURES.map((f) => (
          <li key={f.title} className="flex items-start gap-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/15"><Icon className="h-6 w-6">{f.icon}</Icon></span>
            <span className="min-w-0">
              <span className="block font-semibold">{f.title}</span>
              <span className="block text-sm leading-snug text-blue-100">{f.text}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="relative flex items-center gap-2 text-sm text-blue-100">
        <Icon className="h-4 w-4 shrink-0">{I.shield}</Icon>Works offline. All data stays on this device.
      </p>
    </aside>
  )
}

/** 48px row at the top: optional back arrow on the left, optional action on the right. */
export function TopBar({ onBack, right }: { onBack?: () => void; right?: ReactNode }) {
  return (
    <div className="flex h-12 shrink-0 items-center justify-between">
      {onBack ? (
        <button type="button" onClick={onBack} aria-label="Back" className="-ml-3 grid size-12 place-items-center rounded-full text-slate-800 active:bg-blue-50">
          <Icon className="h-6 w-6">{I.back}</Icon>
        </button>
      ) : <span />}
      {right}
    </div>
  )
}

const LOGO_SIZE = { lg: 'size-28', sm: 'size-16', header: 'size-12', xs: 'size-8' }

/**
 * Business logo from Settings › Branding (the bundled app logo if none); `size` picks the splash (lg),
 * sign-in (sm), app header or compact (xs) variant. `src` overrides it (branding preview).
 */
export function LogoTile({ size = 'sm', src }: { size?: keyof typeof LOGO_SIZE; src?: string }) {
  const { brand } = useBranding()
  const logo = src ?? brand.brand_logo
  // Uploaded logos are JPEGs with a white background, so they sit on a rounded white tile.
  return logo
    ? <img src={logo} alt="" className={`shrink-0 rounded-[22%] bg-white object-contain ${LOGO_SIZE[size]}`} />
    : <img src={appLogo} alt="" className={`shrink-0 object-contain ${LOGO_SIZE[size]}`} />
}

/** Business name with its last word in the accent color ("Sellix <Laundry>"). `name` overrides it (branding preview). */
export function BrandName({ name }: { name?: string }) {
  const { brand } = useBranding()
  const n = name?.trim() || brandName(brand)
  const i = n.lastIndexOf(' ')
  return i < 0 ? n : <>{n.slice(0, i)} <span className="text-accent">{n.slice(i + 1)}</span></>
}

/** Centered logo, name and tagline. */
export function BrandMark({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  const lg = size === 'lg'
  return (
    <div className="flex flex-col items-center text-center">
      <LogoTile size={size} />
      <p className={`font-bold tracking-tight text-slate-900 ${lg ? 'mt-6 text-[32px] leading-tight' : 'mt-3 text-lg'}`}>
        <BrandName />
      </p>
      <p className={lg ? 'mt-1 text-base text-slate-500' : 'text-xs text-slate-500'}>Laundry Management System</p>
    </div>
  )
}

/** Centered screen title with a muted line under it. */
export function ScreenTitle({ title, text }: { title: string; text: ReactNode }) {
  return (
    <div className="text-center">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
      <p className="mx-auto mt-2 max-w-64 text-[15px] leading-snug text-slate-500">{text}</p>
    </div>
  )
}
