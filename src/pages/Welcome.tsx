import { useState, type ReactNode, type TouchEvent } from 'react'
import { AuthScreen, BrandMark, primaryAction, secondaryAction, TopBar } from '../components/AuthScreen'
import { I, Icon } from '../components/Icons'
import { BasketArt, GrowthArt, PhoneArt, ReceiptArt } from '../components/Illustrations'

/** Shown while the database opens. The bar fills over the minimum splash time (see App). */
export function Splash({ error }: { error?: string }) {
  return (
    <AuthScreen decor>
      <div className="flex flex-1 flex-col items-center justify-center">
        <BrandMark size="lg" />
        {error ? (
          <p role="alert" className="mt-10 max-w-xs rounded-2xl bg-blue-50 px-4 py-3 text-center text-sm font-semibold text-blue-900">
            The app couldn't start. Close and reopen it. If this keeps happening, contact your administrator.
            <span className="mt-1 block text-xs font-normal text-blue-800/70">Details: {error}</span>
          </p>
        ) : (
          <div role="progressbar" aria-label="Starting" className="mt-24 h-1 w-36 overflow-hidden rounded-full bg-blue-100">
            <div className="h-full animate-splash-progress rounded-full bg-blue-600" />
          </div>
        )}
      </div>
    </AuthScreen>
  )
}

const SLIDES: { art: ReactNode; title: string; text: string }[] = [
  {
    art: <BasketArt />,
    title: 'Manage Your Laundry Business With Ease',
    text: 'Create orders, track status, manage customers, and grow your laundry business — all in one app.',
  },
  {
    art: <PhoneArt />,
    title: 'Simple Order Management',
    text: 'Quickly add services, set quantities, and track every order from start to finish.',
  },
  {
    art: <GrowthArt />,
    title: 'Track and Grow',
    text: 'View daily sales, monitor orders, manage customers, and get reports to help your business grow.',
  },
  {
    art: <ReceiptArt />,
    title: 'Print Receipts',
    text: 'Create and print receipts easily using a thermal printer.',
  },
]

const SWIPE_PX = 50

/** Four intro slides with Skip, Back / Next, dots and swipe. `onDone` fires on Skip or Get Started. */
export function Intro({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0)
  const [touchX, setTouchX] = useState<number | null>(null)
  const last = i === SLIDES.length - 1
  const slide = SLIDES[i]

  const go = (to: number) => setI(Math.max(0, Math.min(SLIDES.length - 1, to)))
  const onTouchEnd = (e: TouchEvent) => {
    if (touchX === null) return
    const dx = e.changedTouches[0].clientX - touchX
    if (Math.abs(dx) > SWIPE_PX) go(i + (dx < 0 ? 1 : -1))
    setTouchX(null)
  }

  return (
    <AuthScreen>
      <TopBar
        right={(
          <button type="button" onClick={onDone} className="-mr-3 min-h-12 rounded-xl px-3 text-sm font-semibold text-blue-600 active:bg-blue-50">
            Skip
          </button>
        )}
      />

      <section
        aria-roledescription="slide"
        aria-label={`${i + 1} of ${SLIDES.length}`}
        onTouchStart={(e) => setTouchX(e.touches[0].clientX)}
        onTouchEnd={onTouchEnd}
        className="flex flex-1 flex-col items-center"
      >
        <div key={i} className="flex w-full flex-1 animate-fade-in flex-col items-center justify-center">
          <div className="aspect-6/5 w-full max-w-84">{slide.art}</div>
          <h1 className="mt-6 max-w-72 text-center text-[26px] font-bold leading-tight tracking-tight text-slate-900">{slide.title}</h1>
          <p className="mt-3 max-w-76 text-center text-[15px] leading-relaxed text-slate-500">{slide.text}</p>
        </div>

        <div className="mb-8 mt-8 flex gap-2" aria-hidden>
          {SLIDES.map((_, n) => (
            <span key={n} className={`h-2 rounded-full transition-all ${n === i ? 'w-6 bg-blue-600' : 'w-2 bg-blue-100'}`} />
          ))}
        </div>
      </section>

      <div className="flex gap-3">
        {i > 0 && (
          <button type="button" onClick={() => go(i - 1)} className={secondaryAction}>
            Back
          </button>
        )}
        <button type="button" onClick={last ? onDone : () => go(i + 1)} className={primaryAction}>
          {last ? 'Get Started' : <>Next<Icon className="h-5 w-5">{I.next}</Icon></>}
        </button>
      </div>
    </AuthScreen>
  )
}
