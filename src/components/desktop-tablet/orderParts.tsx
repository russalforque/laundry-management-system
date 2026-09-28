import type { ReactNode } from 'react'
import { I, Icon } from '../Icons'

/**
 * Building blocks for the Orders module on tablets (landscape first) and desktops: pages/desktop-tablet/Orders.tsx,
 * NewOrder.tsx and OrderDetails.tsx. One reading column, sections split by hairlines rather than boxed in cards,
 * and the one primary action pinned to the bottom edge where a thumb reaches it.
 */

/** Large touch buttons (56px): the screen's one primary action, and its quieter companions. */
export const bigPrimary = 'inline-flex min-h-14 min-w-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 text-base font-semibold text-white shadow-sm shadow-blue-600/30 transition-colors hover:bg-blue-700 active:bg-blue-700 disabled:bg-blue-300 disabled:shadow-none'
export const bigSecondary = 'inline-flex min-h-14 min-w-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-base font-semibold text-slate-700 transition-colors hover:bg-slate-50 active:bg-slate-100 disabled:opacity-50'
/** Text-weight action inside a section header (Edit, Change, + Add-on). */
export const quietBtn = 'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-50 active:bg-blue-100 disabled:opacity-50'

/** The reading column: comfortable line length on a 1280px landscape tablet, full width on smaller ones. */
export const column = 'mx-auto w-full max-w-4xl'

/**
 * Cancels <main>'s p-6 so the page fills it edge to edge as a column: a body that scrolls on its own and a bar
 * pinned under it. Keep <main>'s padding value (layouts/AppShell.tsx) and this in step.
 */
export const fullBleed = '-m-6 flex h-[calc(100%+3rem)] min-h-0 flex-col'

/** A titled part of a page, divided from the one above by a hairline. */
export function Section({ title, hint, action, children, id, className = '' }: {
  title: ReactNode; hint?: ReactNode; action?: ReactNode; children: ReactNode; id?: string; className?: string
}) {
  return (
    <section id={id} aria-label={typeof title === 'string' ? title : undefined} className={`border-t border-slate-200/80 py-6 first:border-t-0 first:pt-0 ${className}`}>
      <div className="mb-3 flex min-h-11 items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          {hint && <p className="text-sm text-slate-500">{hint}</p>}
        </div>
        {action && <div className="-mr-3 flex shrink-0 flex-wrap items-center justify-end gap-1">{action}</div>}
      </div>
      {children}
    </section>
  )
}

/** The bar pinned to the bottom of a fullBleed page: context on the left, the action(s) on the right. */
export function ActionBar({ children, above }: { children: ReactNode; above?: ReactNode }) {
  return (
    <div className="shrink-0 border-t border-slate-200 bg-white px-6 pb-[max(0.875rem,env(safe-area-inset-bottom))] pt-3.5 shadow-[0_-4px_20px_rgba(15,23,42,0.05)]">
      <div className={column}>
        {above}
        <div className="flex items-center gap-4">{children}</div>
      </div>
    </div>
  )
}

const TONE = {
  error: { box: 'bg-red-50 text-red-800', icon: 'text-red-600', btn: 'hover:bg-red-100' },
  warn: { box: 'bg-amber-50 text-amber-900', icon: 'text-amber-600', btn: 'hover:bg-amber-100' },
  info: { box: 'bg-blue-50 text-blue-900', icon: 'text-blue-600', btn: 'hover:bg-blue-100' },
  ok: { box: 'bg-emerald-50 text-emerald-900', icon: 'text-emerald-600', btn: 'hover:bg-emerald-100' },
}

/** One line of feedback: what happened and, in the text, what to do next. */
export function Notice({ tone = 'info', children, onDismiss, className = '' }: {
  tone?: keyof typeof TONE; children: ReactNode; onDismiss?: () => void; className?: string
}) {
  const t = TONE[tone]
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex items-start gap-3 rounded-xl px-4 py-3 text-[15px] ${t.box} ${className}`}>
      <Icon className={`mt-0.5 h-5 w-5 ${t.icon}`}>{tone === 'ok' ? I.check : I.info}</Icon>
      <div className="min-w-0 flex-1">{children}</div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss message" className={`-my-1.5 -mr-2 grid size-10 shrink-0 place-items-center rounded-lg ${t.btn}`}>
          <Icon className="h-4 w-4">{I.x}</Icon>
        </button>
      )}
    </div>
  )
}

/** Centered state for an empty, failed or not-found view: icon, what happened, what to do. */
export function StateMessage({ icon, title, text, action }: { icon: ReactNode; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <span className="grid size-16 place-items-center rounded-full bg-slate-100 text-slate-400"><Icon className="h-8 w-8">{icon}</Icon></span>
      <p className="mt-4 text-lg font-semibold text-slate-900">{title}</p>
      {text && <p className="mt-1 max-w-md text-[15px] text-slate-500">{text}</p>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-3">{action}</div>}
    </div>
  )
}

/**
 * Step indicator for a short flow: ✓ Customer → 2 Services → 3 Payment → 4 Review. Only the current step is
 * emphasized; finished steps are tappable to go back to them.
 */
export function StepIndicator({ steps, current, onSelect, done }: {
  steps: string[]; current: number; onSelect?: (i: number) => void; done?: boolean
}) {
  return (
    <ol aria-label="Steps" className="flex min-w-0 items-center gap-1">
      {steps.map((label, i) => {
        const state = done || i < current ? 'done' : i === current ? 'current' : 'todo'
        const inner = (
          <>
            <span aria-hidden className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
              state === 'current' ? 'bg-blue-600 text-white' : state === 'done' ? 'bg-blue-50 text-blue-700' : 'border border-slate-300 text-slate-500'
            }`}>
              {state === 'done' ? <Icon className="h-4 w-4">{I.tick}</Icon> : i + 1}
            </span>
            <span className={`truncate text-sm ${state === 'current' ? 'font-semibold text-slate-900' : state === 'done' ? 'font-medium text-slate-600' : 'text-slate-400'}`}>{label}</span>
          </>
        )
        return (
          <li key={label} aria-current={state === 'current' ? 'step' : undefined} className="flex min-w-0 items-center gap-1">
            {i > 0 && <Icon className="h-4 w-4 shrink-0 text-slate-300">{I.chevron}</Icon>}
            {onSelect && state === 'done' && !done ? (
              <button type="button" onClick={() => onSelect(i)} aria-label={`Back to ${label}`} className="flex min-h-11 min-w-0 items-center gap-2 rounded-xl px-2 hover:bg-slate-100 active:bg-slate-200">{inner}</button>
            ) : (
              <span className="flex min-h-11 min-w-0 items-center gap-2 px-2">{inner}</span>
            )}
          </li>
        )
      })}
    </ol>
  )
}
