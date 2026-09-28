import type { ReactNode } from 'react'
import { I, Icon } from '../../components/Icons'
import { DoneView, iconBtn, primary } from '../../components/order/DraftParts'
import { OrderProgress, primaryAction, StepBody } from '../../components/order/NewOrderSteps'
import type { OrderDraft } from '../../hooks/useOrderDraft'
import type { OrderWizard } from '../../hooks/useOrderWizard'
import { formatPeso } from '../../lib/money'

/**
 * Phone New Order: Customer → Services → Add-ons → Summary → Payment, one step per screen, then Order Created.
 * Draft and step come from routes/NewOrderSession.tsx and are shared with the tablet / desktop wizard; the screens
 * themselves are components/order/NewOrderSteps.tsx.
 */
export default function MobileNewOrder({ d, w, onRestart }: { d: OrderDraft; w: OrderWizard; onRestart: () => void }) {
  if (d.done) return <DoneView d={d} onRestart={onRestart} progress={<OrderProgress w={w} done />} />

  const action = primaryAction(d, w)
  // The running amount stays in view once something is picked: subtotal while choosing, the total from Summary on.
  const late = w.step === 'summary' || w.step === 'payment'
  const info: ReactNode = w.step !== 'customer' && d.lines.length > 0 && w.step !== 'payment' && (
    <>
      <span className="block text-xs text-slate-500">{late ? `Total · ${d.itemCount}` : d.itemCount}</span>
      <span className="block text-lg font-bold leading-tight tabular-nums text-slate-900">{formatPeso(late ? d.shownTotal : d.subtotal)}</span>
    </>
  )

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col">
      <header className="space-y-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={w.back} aria-label="Back" className={`-ml-2 ${iconBtn}`}>
            <Icon className="h-6 w-6">{I.back}</Icon>
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-slate-500">New Order · Step {w.index + 1} of 5</p>
            <h1 className="truncate text-xl font-bold leading-tight tracking-tight text-slate-900">{w.meta.title}</h1>
          </div>
        </div>
        <OrderProgress w={w} />
      </header>

      <div className="mt-4 flex-1 space-y-4">
        <StepBody d={d} w={w} />
      </div>

      {/* One primary action, pinned above the phone nav; errors sit right above it. */}
      <div className="sticky bottom-0 z-10 -mx-4 mt-4 border-t border-slate-200/70 bg-white/95 px-4 pb-3 pt-3 shadow-[0_-4px_20px_rgba(15,23,42,0.06)] backdrop-blur">
        {w.error && <p role="alert" className="mb-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">{w.error}</p>}
        <div className="flex items-center gap-3">
          {info && <div className="min-w-0 shrink-0" aria-live="polite">{info}</div>}
          <button type="button" onClick={action.onClick} disabled={action.disabled} aria-busy={d.busy} className={`${primary} min-w-0 flex-1`}>
            {action.label}
          </button>
        </div>
      </div>
    </div>
  )
}
