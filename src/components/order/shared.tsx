import type { ReactNode } from 'react'
import type { getOrderDetail } from '../../db/orderQueries'
import { I, Icon } from '../Icons'

/** Blocks shared by the Order Details wizard steps (pages/OrderDetail.tsx). */

export type Detail = NonNullable<Awaited<ReturnType<typeof getOrderDetail>>>

/** Runs one save at a time (double taps are ignored), shows its error or `ok` message, then reloads the order. */
export type Run = (fn: () => Promise<unknown>, ok?: string) => Promise<boolean>

export const panel = 'min-w-0 rounded-3xl border border-blue-100/80 bg-white shadow-[0_2px_10px_rgba(37,99,235,0.05)]'
export const soft = 'inline-flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-2xl bg-blue-50 px-4 text-center font-semibold leading-tight text-blue-600 active:bg-blue-100 disabled:opacity-50'
export const solid = 'inline-flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 text-center font-semibold leading-tight text-white shadow-sm shadow-blue-600/30 active:bg-blue-700 disabled:bg-blue-300 disabled:shadow-none'
export const outline = 'inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-white font-semibold text-blue-600 active:bg-blue-50 disabled:opacity-50'

export type StepState = 'done' | 'current' | 'todo' | 'skipped'

/**
 * Numbered circles joined by a line: done = blue check, current = solid blue, todo = outlined.
 * The line into a step turns blue once that step is reached. With `onSelect`, steps are buttons.
 */
export function StepTrack({ steps, label, size = 'md', onSelect }: {
  steps: { label: string; state: StepState }[]
  label: string
  size?: 'sm' | 'md'
  onSelect?: (i: number) => void
}) {
  const dot = size === 'md' ? 'size-9 text-sm' : 'size-7 text-xs'
  const top = size === 'md' ? 'top-[1.125rem]' : 'top-3.5'
  return (
    <ol aria-label={label} className="grid" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
      {steps.map((s, i) => {
        const reached = s.state !== 'todo'
        const inner = (
          <>
            <span
              className={`relative z-10 grid ${dot} place-items-center rounded-full font-bold ${
                s.state === 'current' ? 'bg-blue-600 text-white ring-4 ring-blue-100'
                : s.state === 'done' ? 'bg-blue-600 text-white'
                : s.state === 'skipped' ? 'border-2 border-dashed border-slate-300 bg-white text-slate-400'
                : 'border-2 border-slate-200 bg-white text-slate-500'
              }`}
            >
              {s.state === 'done' ? <Icon className="h-4 w-4">{I.tick}</Icon> : s.state === 'skipped' ? <Icon className="h-3.5 w-3.5">{I.minus}</Icon> : i + 1}
            </span>
            <span className={`mt-1.5 block max-w-full truncate px-0.5 text-center leading-tight ${size === 'md' ? 'text-xs' : 'text-[11px]'} ${
              s.state === 'current' ? 'font-semibold text-blue-600' : s.state === 'done' ? 'text-slate-600' : 'text-slate-400'
            }`}>
              {s.label}
            </span>
          </>
        )
        return (
          <li key={s.label} aria-current={s.state === 'current' ? 'step' : undefined} className="relative flex min-w-0 flex-col items-center">
            {i > 0 && <span aria-hidden className={`absolute right-1/2 ${top} h-0.5 w-full ${reached && s.state !== 'skipped' ? 'bg-blue-600' : 'bg-slate-200'}`} />}
            {onSelect ? (
              <button type="button" onClick={() => onSelect(i)} className="relative flex min-h-11 w-full min-w-0 flex-col items-center rounded-xl">
                {inner}
              </button>
            ) : inner}
          </li>
        )
      })}
    </ol>
  )
}

/** Card heading with an optional caption under it and an action on the right. */
export function PanelHead({ title, sub, action }: { title: string; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        {sub && <p className="mt-0.5 text-sm text-slate-500">{sub}</p>}
      </div>
      {action}
    </div>
  )
}

/** One label / value line in a summary table. */
export function Row({ icon, label, children, strong }: { icon?: ReactNode; label: string; children: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <dt className={`flex min-w-0 items-center gap-2.5 ${strong ? 'font-semibold text-slate-900' : 'text-slate-600'}`}>
        {icon && <Icon className="h-5 w-5 text-slate-500">{icon}</Icon>}<span className="truncate">{label}</span>
      </dt>
      <dd className={`shrink-0 text-right tabular-nums ${strong ? 'text-lg font-bold text-slate-900' : 'font-semibold text-slate-900'}`}>{children}</dd>
    </div>
  )
}

/** Light-blue information strip, e.g. "Machine times are automatically recorded…". */
export function InfoNote({ children, tone = 'blue' }: { children: ReactNode; tone?: 'blue' | 'amber' }) {
  const cls = tone === 'amber' ? 'bg-amber-50 text-amber-900' : 'bg-blue-50/80 text-slate-600'
  return (
    <p className={`flex items-start gap-3 rounded-2xl px-4 py-3 text-sm ${cls}`}>
      <span className={`grid size-6 shrink-0 place-items-center rounded-full text-white ${tone === 'amber' ? 'bg-amber-500' : 'bg-blue-600'}`}>
        <Icon className="h-4 w-4"><path d="M12 11v6M12 7.5h.01" strokeWidth={2.5} /></Icon>
      </span>
      <span className="min-w-0 flex-1 pt-0.5">{children}</span>
    </p>
  )
}
