import type { ReactNode } from 'react'
import { I, Icon } from './Icons'

/** Shared building blocks for the blue "manage" screens (Users, Services). */

export const card = 'min-w-0 rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.05)]'
export const field = 'w-full rounded-xl border border-slate-200 bg-white py-3 pl-12 pr-4 text-base outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
export const primary = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 font-semibold text-white shadow-sm shadow-blue-600/30 active:bg-blue-700 disabled:opacity-60'

export const StatusBadge = ({ active, inactiveCls = 'bg-slate-100 text-slate-500' }: { active: boolean; inactiveCls?: string }) => (
  <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${active ? 'bg-emerald-50 text-emerald-700' : inactiveCls}`}>
    {active ? 'Active' : 'Inactive'}
  </span>
)

export function BackHeader({ title, onBack, action }: { title: string; onBack: () => void; action?: ReactNode }) {
  return (
    <header className="flex items-center gap-2">
      <button type="button" onClick={onBack} aria-label="Back" className="-ml-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-slate-800 active:bg-slate-200">
        <Icon className="h-6 w-6">{I.back}</Icon>
      </button>
      <h1 className="min-w-0 flex-1 truncate text-2xl font-bold text-slate-900">{title}</h1>
      {action}
    </header>
  )
}

export const EditButton = ({ onClick }: { onClick: () => void }) => (
  <button onClick={onClick} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-blue-200 bg-white px-4 text-sm font-semibold text-blue-600 active:bg-blue-50">
    <Icon>{I.pencil}</Icon>Edit
  </button>
)

/** Labelled input with a leading icon; pass an input/select styled with `field`. */
export function Field({ label, icon, required, children }: { label: string; icon: ReactNode; required?: boolean; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="text-sm font-semibold text-slate-800">{label}{required && <span className="text-red-500"> *</span>}</span>
      <span className="relative mt-1.5 block">
        <Icon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500">{icon}</Icon>
        {children}
      </span>
    </label>
  )
}


export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={`${card} space-y-4 p-4 sm:p-5`}>
      <h2 className="text-lg font-bold text-slate-900">{title}</h2>
      {children}
    </section>
  )
}

export function EmptyCard({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-slate-100 text-slate-400"><Icon className="h-6 w-6">{icon}</Icon></span>
      <p className="mt-3 text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{text}</p>
    </div>
  )
}

/** Search box plus a toggle button (used for the alternate sort). */
export function SearchRow({ value, onChange, placeholder, label, toggled, onToggle, toggleLabel }: {
  value: string; onChange: (v: string) => void; placeholder: string; label: string
  toggled: boolean; onToggle: () => void; toggleLabel: string
}) {
  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <Icon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400">{I.search}</Icon>
        <input className={field} type="search" enterKeyHint="search" aria-label={label} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
      <button
        type="button"
        onClick={onToggle}
        aria-label={toggleLabel}
        aria-pressed={toggled}
        className={`grid w-13 shrink-0 place-items-center rounded-xl border transition-colors ${toggled ? 'border-blue-200 bg-blue-50 text-blue-600' : 'border-slate-200 bg-white text-slate-600 active:bg-slate-50'}`}
      >
        <Icon className="h-5 w-5">{I.sliders}</Icon>
      </button>
    </div>
  )
}

export function FilterTabs<T extends string>({ options, value, onChange, label }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="-mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
      {options.map((f) => (
        <button
          key={f.id}
          type="button"
          role="tab"
          aria-selected={value === f.id}
          onClick={() => onChange(f.id)}
          className={`min-h-10 shrink-0 whitespace-nowrap rounded-full px-5 text-sm font-medium transition-colors ${
            value === f.id ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30' : 'bg-slate-200/60 text-slate-600 active:bg-slate-200'
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  )
}

/** Full-width red "Deactivate …" / green "Reactivate …" action. */
export function ActiveToggleButton({ active, noun, onClick, disabled, title }: { active: boolean; noun: string; onClick: () => void; disabled?: boolean; title?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl border font-semibold transition disabled:opacity-50 ${
        active ? 'border-red-200 bg-red-50 text-red-600 active:bg-red-100' : 'border-emerald-200 bg-emerald-50 text-emerald-700 active:bg-emerald-100'
      }`}
    >
      <Icon className="h-5 w-5">{active ? I.trash : I.check}</Icon>
      {active ? `Deactivate ${noun}` : `Reactivate ${noun}`}
    </button>
  )
}
