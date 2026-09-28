import type { getOrderDetail } from '../../db/orderQueries'
import { I, Icon } from '../Icons'

/** Styles and blocks shared by the order screens (Order Details, the Orders work pane, New Order). */

export type Detail = NonNullable<Awaited<ReturnType<typeof getOrderDetail>>>

export const panel = 'min-w-0 rounded-3xl border border-blue-100/80 bg-white shadow-[0_2px_10px_rgba(37,99,235,0.05)]'
export const solid = 'inline-flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 text-center font-semibold leading-tight text-white shadow-sm shadow-blue-600/30 active:bg-blue-700 disabled:bg-blue-300 disabled:shadow-none'
export const outline = 'inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-white font-semibold text-blue-600 active:bg-blue-50 disabled:opacity-50'

export type StepState = 'done' | 'current' | 'todo' | 'skipped'

/**
 * Numbered circles joined by a line: done = blue check, current = solid blue, todo = outlined.
 * The line into a step turns blue once that step is reached. With `onSelect`, steps are buttons (only the done
 * ones with `doneOnly`, e.g. a wizard that can go back but not skip ahead).
 */
export function StepTrack({ steps, label, size = 'md', onSelect, doneOnly }: {
  steps: { label: string; state: StepState }[]
  label: string
  size?: 'sm' | 'md'
  onSelect?: (i: number) => void
  doneOnly?: boolean
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
            {onSelect && (!doneOnly || s.state === 'done') ? (
              <button type="button" onClick={() => onSelect(i)} aria-label={doneOnly ? `Back to ${s.label}` : undefined} className="relative flex min-h-11 w-full min-w-0 flex-col items-center rounded-xl">
                {inner}
              </button>
            ) : inner}
          </li>
        )
      })}
    </ol>
  )
}
