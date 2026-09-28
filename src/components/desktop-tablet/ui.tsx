import { useEffect, useRef, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useMedia } from '../../hooks/useScreen'
import { formatPesoShort } from '../../lib/money'
import { PROCESSING, STATUS_LABEL } from '../../lib/orders'
import type { OrderStatus, PaymentStatus } from '../../types'
import { I, Icon } from '../Icons'

/**
 * Building blocks for the tablet / desktop pages (pages/desktop-tablet, see hooks/useScreen.ts). Phones never render these:
 * they keep their own headers (AppHeader), cards and bottom sheets.
 */

export const panelCls = 'min-w-0 rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.05)]'

/**
 * Whether list + detail fit side by side: landscape tablets (1024px and up) and desktops. Portrait tablets
 * (768–1023px) keep the list full width and open the detail in a Drawer over it.
 */
export const useSplit = () => useMedia('(min-width: 1024px)')

/** Search box used in every tablet list toolbar: icon, 48px tall, clear button once there is text. */
export function SearchField({ value, onChange, label, placeholder, className = '' }: {
  value: string; onChange: (v: string) => void; label: string; placeholder: string; className?: string
}) {
  return (
    <div className={`relative min-w-0 ${className}`}>
      <Icon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400">{I.search}</Icon>
      <input
        className="min-h-12 w-full rounded-xl border border-slate-200 bg-white pl-12 pr-11 text-[15px] text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button type="button" onClick={() => onChange('')} aria-label="Clear search" className="absolute right-1 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full text-slate-400 hover:bg-slate-100">
          <Icon className="h-5 w-5">{I.x}</Icon>
        </button>
      )}
    </div>
  )
}

/** Segmented control for a page's top-level views (Services | Add-ons, report tabs…), optional count per tab. */
export function SegmentedTabs<T extends string | null>({ options, value, onChange, label, className = '' }: {
  options: { id: T; label: string; count?: number | null }[]; value: T; onChange: (v: T) => void; label: string; className?: string
}) {
  return (
    <div role="tablist" aria-label={label} className={`flex gap-1 rounded-xl bg-slate-100 p-1 ${className}`}>
      {options.map((o) => {
        const on = o.id === value
        return (
          <button
            key={String(o.id)}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.id)}
            className={`inline-flex min-h-10 min-w-0 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 text-sm font-semibold ${
              on ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:bg-white/60'
            }`}
          >
            <span className="truncate">{o.label}</span>
            {o.count != null && <span className={`tabular-nums ${on ? 'text-blue-600' : 'text-slate-400'}`}>{o.count}</span>}
          </button>
        )
      })}
    </div>
  )
}

/** Centered empty / nothing-selected message for a list or detail pane. */
export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-14 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-slate-100 text-slate-400"><Icon className="h-7 w-7">{icon}</Icon></span>
      <p className="mt-3 font-semibold text-slate-900">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-slate-500">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/**
 * Detail panel over a full-width list on portrait tablets: slides nothing, just fades in at the right edge,
 * leaving a strip of the list visible so staff keep their place. Escape or a tap outside closes it.
 */
export function Drawer({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // A sheet opened from inside the drawer (payment, confirm…) handles its own Escape first.
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && document.querySelectorAll('[role="dialog"]').length === 1) onClose() }
    document.addEventListener('keydown', onKey)
    if (!ref.current?.contains(document.activeElement)) ref.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return createPortal(
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/30 animate-fade-in motion-reduce:animate-none" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-[min(40rem,calc(100%-5rem))] flex-col bg-slate-50 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] shadow-2xl outline-none"
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}

/** Page title row: title and one line of context on the left, the page's main actions on the right. */
export function PageHeader({ title, sub, actions, children }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {sub && <p className="mt-0.5 truncate text-sm text-slate-500">{sub}</p>}
        {children}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

/** Buttons sized for mouse and touch alike (44px), for page headers and toolbars. */
export const btnPrimary = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm shadow-blue-600/30 hover:bg-blue-700 active:bg-blue-700 disabled:bg-blue-300 disabled:shadow-none'
export const btnSecondary = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-50'
export const btnDanger = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 text-sm font-semibold text-red-600 hover:bg-red-50 active:bg-red-50 disabled:opacity-50'

/** Data tables: sticky header, quiet row dividers, hover + selected rows. */
export const table = {
  wrap: `${panelCls} overflow-hidden`,
  table: 'w-full border-collapse text-left text-sm',
  thead: 'sticky top-0 z-10 bg-slate-50/95 backdrop-blur',
  th: 'whitespace-nowrap border-b border-slate-200 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500',
  row: 'cursor-pointer border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50',
  rowOn: 'cursor-pointer border-b border-slate-100 bg-blue-50/70 transition-colors last:border-0 hover:bg-blue-50',
  td: 'px-4 py-3 align-middle',
}

/** Small label + value used in KPI rows. */
export function Kpi({ label, value, sub, tone = 'text-slate-900', icon }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string; icon?: ReactNode }) {
  return (
    <div className={`${panelCls} flex min-h-24 flex-col justify-center p-4`}>
      <span className="flex items-center gap-2 text-sm font-medium text-slate-500">{icon}{label}</span>
      <span className={`mt-1 truncate text-2xl font-bold tabular-nums tracking-tight ${tone}`}>{value}</span>
      {sub && <span className="mt-0.5 truncate text-xs text-slate-500">{sub}</span>}
    </div>
  )
}

/**
 * Detail / edit panel beside a table (desktop) or in place of it (tablet): title with a close button,
 * a body that scrolls on its own, and an optional pinned footer. `onSubmit` makes the whole panel a form.
 */
export function SidePanel({ title, onClose, closeLabel, footer, onSubmit, children }: {
  title: ReactNode; onClose: () => void; closeLabel: string; footer?: ReactNode; onSubmit?: (e: FormEvent) => void; children: ReactNode
}) {
  const inner = (
    <>
      <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3">
        <h2 className="min-w-0 flex-1 truncate text-lg font-bold text-slate-900">{title}</h2>
        <button type="button" onClick={onClose} aria-label={closeLabel} title={closeLabel} className="grid size-10 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-800">
          <Icon className="h-5 w-5">{I.x}</Icon>
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-5">{children}</div>
      {footer && <div className="border-t border-slate-200 bg-white px-5 py-3">{footer}</div>}
    </>
  )
  const cls = `${panelCls} flex max-h-full min-h-0 flex-col overflow-hidden`
  return onSubmit ? <form onSubmit={onSubmit} className={cls}>{inner}</form> : <div className={cls}>{inner}</div>
}

/** Status as a pill with a leading dot. */
const STATUS_PILL: Record<OrderStatus, { pill: string; dot: string }> = {
  received: { pill: 'bg-slate-100 text-slate-700', dot: 'bg-slate-400' },
  [PROCESSING]: { pill: 'bg-blue-50 text-blue-700', dot: 'bg-blue-600' },
  ready: { pill: 'bg-violet-50 text-violet-700', dot: 'bg-violet-500' },
  released: { pill: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  cancelled: { pill: 'bg-red-50 text-red-600', dot: 'bg-red-500' },
}

export function StatusPill({ status }: { status: OrderStatus }) {
  const c = STATUS_PILL[status]
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${c.pill}`}>
      <span className={`size-1.5 rounded-full ${c.dot}`} aria-hidden />{STATUS_LABEL[status]}
    </span>
  )
}

const PAY_PILL: Record<PaymentStatus, string> = {
  paid: 'bg-emerald-50 text-emerald-700',
  partial: 'bg-amber-50 text-amber-800',
  unpaid: 'bg-red-50 text-red-700',
}

/** Money still owed, said as an amount (the question at the counter), or Paid. */
export function Owed({ status, pay, balance }: { status: OrderStatus; pay: PaymentStatus; balance: number }) {
  if (status === 'cancelled') return null
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${PAY_PILL[pay]}`}>
      {pay === 'paid' ? 'Paid' : `${formatPesoShort(balance)} due`}
    </span>
  )
}
