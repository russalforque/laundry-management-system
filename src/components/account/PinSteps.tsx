import { I, Icon } from '../Icons'
import { PinBoxes, PinKeypad, usePinEntry } from '../PinPad'
import { PIN_STEPS, type ChangePin } from '../../hooks/useChangePin'

/** Change PIN pieces shared by the phone and tablet / desktop My Account pages (hooks/useChangePin.ts). */

export const checkPath = <path d="m6 12.5 4 4 8-9" />

export const continueCls =
  'mt-5 flex min-h-14 w-full shrink-0 items-center justify-center gap-2 rounded-2xl bg-blue-600 text-base font-semibold text-white shadow-md shadow-blue-600/25 transition hover:bg-blue-700 active:scale-[0.99] active:bg-blue-700 disabled:bg-blue-300 disabled:shadow-none'

/** Numbered progress: done steps show a check, the current one is filled blue. `step` 4 = all done. */
export function Stepper({ step }: { step: number }) {
  return (
    <ol className="mt-5 flex items-start px-1" aria-label="Progress">
      {PIN_STEPS.map((label, i) => {
        const n = i + 1
        const state = n < step ? 'done' : n === step ? 'current' : 'todo'
        return (
          <li key={label} className={`flex items-start ${i ? 'flex-1' : ''}`} aria-current={state === 'current' ? 'step' : undefined}>
            {i > 0 && <span aria-hidden className={`mx-1 mt-4.5 h-0.5 flex-1 rounded-full ${n <= step ? 'bg-blue-300' : 'bg-slate-200'}`} />}
            <span className="flex w-19 shrink-0 flex-col items-center">
              <span
                className={`grid size-9 place-items-center rounded-full text-sm font-semibold transition-colors ${
                  state === 'todo' ? 'bg-slate-100 text-slate-600' : 'bg-blue-600 text-white shadow-sm shadow-blue-600/30'
                }`}
              >
                {state === 'done' ? <Icon className="h-5 w-5">{checkPath}</Icon> : n}
              </span>
              <span className={`mt-1.5 whitespace-nowrap text-xs ${state === 'current' ? 'font-semibold text-blue-600' : 'text-slate-500'}`}>{label}</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

interface StepProps {
  title: string
  subtitle: string
  length?: number | null
  lockedUntil?: number
  /** Message carried in from a previous step (e.g. confirm mismatch). */
  note?: string
  onSubmit: (pin: string) => Promise<void> | void
}

/** Card with lock icon, digit boxes and keypad, followed by the Continue button. */
export function PinStep({ title, subtitle, length, lockedUntil, note, onSubmit }: StepProps) {
  const entry = usePinEntry({ length, lockedUntil, onSubmit, autoSubmit: false })
  const message = entry.busy ? 'Checking…' : entry.status || (entry.pin ? '' : note)

  return (
    <>
      <section className="mt-5 flex flex-col items-center rounded-3xl bg-white px-4 pb-4 pt-5 shadow-[0_2px_12px_color-mix(in_oklab,var(--color-blue-600)_6%,transparent)]">
        <span className="grid size-14 place-items-center rounded-2xl bg-blue-50 text-blue-600">
          <Icon className="h-7 w-7">{I.lock}</Icon>
        </span>
        <h2 className="mt-3 text-lg font-bold text-slate-900">{title}</h2>
        <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>
        <div className="mt-5">
          <PinBoxes entry={entry} />
        </div>
        <p role="status" aria-live="polite" className="mt-2 min-h-5 text-center text-sm font-semibold text-blue-700">
          {message}
        </p>
        <PinKeypad entry={entry} className="mt-3" />
      </section>
      <button type="button" disabled={!entry.ready} onClick={() => entry.submit()} className={continueCls}>
        Continue
        <Icon className="h-5 w-5 rotate-180">{I.back}</Icon>
      </button>
    </>
  )
}

/** The current step of the flow, or the "PIN changed" confirmation. */
export function ChangePinFlow({ c }: { c: ChangePin }) {
  const { me, step, done, note, firstLength } = c
  if (done) {
    return (
      <>
        <section className="mt-5 flex flex-col items-center rounded-3xl bg-white px-5 py-10 text-center shadow-[0_2px_12px_color-mix(in_oklab,var(--color-blue-600)_6%,transparent)]">
          <span className="grid size-16 place-items-center rounded-full bg-blue-600 text-white shadow-md shadow-blue-600/30">
            <Icon className="h-8 w-8">{checkPath}</Icon>
          </span>
          <h2 role="status" className="mt-4 text-lg font-bold text-slate-900">PIN Changed</h2>
          <p className="mt-1 text-sm text-slate-500">Use your new PIN next time you sign in.</p>
        </section>
        <button type="button" onClick={c.leave} className={continueCls}>Done</button>
      </>
    )
  }
  if (!me) return <div className="mt-5 h-112 animate-pulse rounded-3xl bg-white" />
  if (step === 1) {
    return (
      <PinStep
        key="current"
        title="Enter Current PIN"
        subtitle={`Enter your current ${me.pin_length ? `${me.pin_length}-digit ` : ''}PIN`}
        length={me.pin_length}
        lockedUntil={me.locked_until}
        onSubmit={c.submitCurrent}
      />
    )
  }
  if (step === 2) return <PinStep key="new" title="Enter New PIN" subtitle="Create a new 4–6 digit PIN" note={note} onSubmit={c.submitNew} />
  return <PinStep key="confirm" title="Confirm New PIN" subtitle="Enter the same PIN again" length={firstLength} onSubmit={c.submitConfirm} />
}
