import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { I, Icon } from './Icons'

/**
 * Shared by Select and DateInput so every picker field looks the same: 48px min height, native
 * arrow/indicator removed, one icon vertically centred on the right, and `pr-11` (forced, so a
 * caller's padding can't shrink it) keeping the text clear of that icon.
 */
const pickerCls = 'peer min-h-12 w-full cursor-pointer appearance-none disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400'
const pickerIconCls =
  'pointer-events-none absolute right-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500 transition-colors peer-focus:text-blue-600 peer-disabled:text-slate-300'

/**
 * Native select (keeps the phone's own option picker) with the platform arrow replaced by one
 * consistent down chevron. `className` styles the select itself, e.g. `field` (which leaves room
 * for a leading icon) or `fieldCls`.
 */
export function Select({ className = '', children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative block">
      <select {...props} className={`${pickerCls} truncate ${className} pr-11!`}>
        {children}
      </select>
      <Icon className={pickerIconCls}>{I.chevronDown}</Icon>
    </span>
  )
}

/**
 * Native date/time input (keeps the phone's own picker) styled like Select: the browser's calendar/clock
 * indicator is hidden but still covers the whole field (see `.picker-input` in index.css), so a tap
 * anywhere opens the picker, and one calendar or clock icon sits on the right.
 */
export function DateInput({ className = '', type = 'date', ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  type?: 'date' | 'time' | 'month' | 'datetime-local'
}) {
  return (
    <span className="relative block">
      <input {...props} type={type} className={`picker-input relative ${pickerCls} ${className} pr-11!`} />
      <Icon className={pickerIconCls}>{type === 'time' ? I.clock : I.calendar}</Icon>
    </span>
  )
}

/** iOS/Android-style on/off switch. */
export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (on: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-8 w-14 shrink-0 rounded-full transition-colors disabled:opacity-40 ${on ? 'bg-blue-600' : 'bg-slate-300'}`}
    >
      <span className={`absolute top-1 size-6 rounded-full bg-white shadow transition-all ${on ? 'left-7' : 'left-1'}`} />
    </button>
  )
}

/** Pill tabs where exactly one option is active (e.g. "Select Customer | Walk-in"). */
export function Segmented<T extends string>({
  label, value, onChange, options,
}: {
  label: string
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode }[]
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-xl bg-slate-100 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors ${
            value === o.value ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30' : 'text-slate-600 active:bg-white'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
