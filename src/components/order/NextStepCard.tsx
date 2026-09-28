import type { ReactNode } from 'react'
import { formatPeso } from '../../lib/money'
import { PROCESSING } from '../../lib/orders'
import { I, Icon } from '../Icons'
import { solid, type Detail } from './shared'

export interface Next {
  label: string
  hint: string
  icon: ReactNode
  onClick: () => void
  disabled?: boolean
}

export interface NextStepProps {
  order: Detail['order']
  busy: boolean
  /** Why Complete Order can't run yet (e.g. balance due); null when it can. */
  blocker: string | null
  onStart: () => void
  onMarkReady: () => void
  onComplete: () => void
  /** Collect Payment, offered as the next step on a Ready order that still has a balance. */
  onCollect?: () => void
}

/** What the Next Step says and offers, without the layout: the phone card and the tablet status section + action bar both draw it. */
export interface NextStepModel {
  heading: string
  next: Next
  tone: 'run' | 'done'
}

/**
 * The order's Next Step: where it is and the one thing to do, as the page's single large button
 * (Start Processing → Mark Ready for Pickup → Collect Balance → Complete Order). Washing, drying and folding happen in the
 * shop and aren't tracked. The database re-checks every move, so a stale screen or double tap can't skip or repeat one.
 * Nothing for completed and cancelled orders.
 */
export function nextStepModel({ order, blocker, onStart, onMarkReady, onComplete, onCollect }: NextStepProps): NextStepModel | null {
  switch (order.status) {
    case 'received':
      return {
        heading: 'Received',
        tone: 'run',
        next: { label: 'Start Processing', hint: 'Tap when the laundry goes in to be washed, dried and folded.', icon: I.basket, onClick: onStart },
      }
    case PROCESSING:
      return {
        heading: 'Processing',
        tone: 'run',
        next: { label: 'Mark Ready for Pickup', hint: 'Tap once the laundry is washed, dried and folded, ready for the customer.', icon: I.check, onClick: onMarkReady },
      }
    case 'ready': {
      const due = order.total_cents - order.paid_cents
      // Money first: with a balance still owed, the next step is collecting it, then the hand-over.
      const next: Next = due > 0 && onCollect ? {
        label: `Collect ${formatPeso(due)} Balance`,
        hint: 'The laundry is ready. Collect the balance, then hand it over and complete the order.',
        icon: I.wallet,
        onClick: onCollect,
      } : {
        label: 'Complete Order',
        hint: blocker ?? 'Fully paid. Hand the laundry to the customer, then confirm.',
        icon: I.check,
        onClick: onComplete,
        disabled: !!blocker,
      }
      return { heading: 'Ready for Pickup', tone: 'done', next }
    }
    default:
      return null
  }
}

export function NextStepCard(props: NextStepProps) {
  const m = nextStepModel(props)
  if (!m) return null
  const { busy } = props
  const { heading, next, tone } = m
  return (
    <section aria-label="Next step" className={`rounded-3xl border-2 ${tone === 'done' ? 'border-emerald-200' : 'border-blue-200'} bg-white p-4 shadow-[0_2px_10px_rgba(37,99,235,0.08)] sm:p-5`}>
      <p className={`text-xs font-semibold uppercase tracking-wide ${tone === 'done' ? 'text-emerald-700' : 'text-blue-600'}`}>Next step</p>
      <p className="mt-0.5 text-xl font-bold leading-tight text-slate-900">{heading}</p>
      <div className="mt-4 space-y-2">
        <button type="button" onClick={next.onClick} disabled={busy || next.disabled} aria-describedby="next-step-hint" className={`${solid} min-h-14 w-full text-lg`}>
          <Icon className="h-6 w-6">{next.icon}</Icon>{busy ? 'Saving…' : next.label}
        </button>
        <p id="next-step-hint" className={`px-1 text-sm ${next.disabled ? 'font-medium text-amber-800' : 'text-slate-500'}`}>{next.hint}</p>
      </div>
    </section>
  )
}
