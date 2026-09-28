import { useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BrandName, LogoTile } from '../AuthScreen'
import { PaymentBadge, StatusBadge } from '../Badges'
import { I, Icon } from '../Icons'
import { card, primary } from '../Manage'
import { NumberInput } from '../NumberInput'
import { DEFAULT_PRIMARY, isHex, readable, themeVars, type Branding } from '../../lib/branding'
import { PROCESSING } from '../../lib/orders'
import type { ReceiptKey } from '../../lib/receipt'

/** Settings building blocks shared by the phone and tablet / desktop Settings pages. */

export const area = 'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-normal outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
export const outline = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-4 font-semibold text-blue-600 hover:bg-blue-50 active:bg-blue-50 disabled:opacity-60'

const DISCARD = 'Discard your unsaved changes?'
/** Asks before throwing away edits; true when it is fine to leave. */
export const okToLeave = (dirty: boolean) => !dirty || window.confirm(DISCARD)

/** Card with a heading and an optional description. */
export function Panel({ title, text, action, children }: { title: string; text?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className={`${card} p-4 sm:p-5`}>
      <div className="mb-4 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          {text && <p className="mt-0.5 text-sm text-slate-500">{text}</p>}
        </div>
        {action}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

export function Group({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
        {aside}
      </div>
      <div className={`${card} divide-y divide-slate-100 overflow-hidden`}>{children}</div>
    </section>
  )
}

/** Settings list row: navigates (`to`), acts (`onClick`), or hosts a control (`children`). */
export function Row({ icon, title, text, to, onClick, danger, children }: {
  icon: ReactNode; title: string; text: string; to?: string; onClick?: () => void; danger?: boolean; children?: ReactNode
}) {
  const body = (
    <>
      <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${danger ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
        <Icon className="h-5 w-5">{icon}</Icon>
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block font-semibold ${danger ? 'text-red-600' : 'text-slate-900'}`}>{title}</span>
        <span className="block text-sm text-slate-500">{text}</span>
      </span>
      {children ?? <Icon className="h-5 w-5 shrink-0 text-slate-400">{I.chevron}</Icon>}
    </>
  )
  const cls = 'flex min-h-16 w-full items-center gap-3.5 px-4 py-3 text-left'
  if (to) return <Link to={to} className={`${cls} hover:bg-slate-50 active:bg-slate-50`}>{body}</Link>
  if (onClick) return <button type="button" onClick={onClick} className={`${cls} hover:bg-slate-50 active:bg-slate-50`}>{body}</button>
  return <div className={cls}>{body}</div>
}

/** Short number field with its unit inside ("3 days", "8 kg"). */
export function UnitInput({ label, unit, decimals, maxInt, value, onChange }: { label: string; unit: string; decimals: number; maxInt: number; value: string; onChange: (v: string) => void }) {
  return (
    <span className="relative block w-28 shrink-0">
      <NumberInput
        className="min-h-12 w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-4 pr-12 text-right text-base tabular-nums outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        decimals={decimals}
        maxInt={maxInt}
        enterKeyHint="done"
        aria-label={label}
        placeholder="—"
        value={value}
        onChange={onChange}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">{unit}</span>
    </span>
  )
}

/** Logo tile with Upload / Change and Remove next to it; `extra` adds more buttons. */
export function LogoPicker({ preview, has, onPick, onRemove, hint, extra }: {
  preview: ReactNode; has: boolean; onPick: (file: File | undefined) => void; onRemove: () => void; hint: string; extra?: ReactNode
}) {
  const picker = useRef<HTMLInputElement>(null)
  return (
    <div>
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => picker.current?.click()}
          aria-label={has ? 'Change logo' : 'Upload logo'}
          className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 hover:bg-slate-100 active:bg-slate-100"
        >
          {preview}
        </button>
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
          <button type="button" onClick={() => picker.current?.click()} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 -ml-3 font-semibold text-blue-600 hover:bg-blue-50 active:bg-blue-50">
            <Icon className="h-5 w-5">{I.download}</Icon>{has ? 'Change logo' : 'Upload logo'}
          </button>
          {extra}
          {has && (
            <button type="button" onClick={onRemove} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 -ml-3 font-semibold text-red-600 hover:bg-red-50 active:bg-red-50">
              <Icon className="h-5 w-5">{I.trash}</Icon>Remove
            </button>
          )}
        </div>
      </div>
      <p className="mt-3 text-sm text-slate-500">{hint}</p>
      <input ref={picker} type="file" accept="image/*" hidden onChange={(e) => { onPick(e.target.files?.[0]); e.target.value = '' }} />
    </div>
  )
}

/** Read-only business details with a jump to Business Information, the one place they are edited. */
export function BusinessSummary({ name, address, contact, onEdit }: { name: string; address?: string; contact?: string; onEdit: () => void }) {
  const lines = [
    { icon: I.store, value: name, empty: 'No business name' },
    ...(address !== undefined ? [{ icon: I.pin, value: address, empty: 'No address' }] : []),
    ...(contact !== undefined ? [{ icon: I.phone, value: contact, empty: 'No contact number' }] : []),
  ]
  return (
    <section className={`${card} flex items-start gap-3 p-4`}>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {lines.map((l) => (
          <li key={l.empty} className="flex items-center gap-2.5 text-sm">
            <Icon className="h-4 w-4 shrink-0 text-slate-400">{l.icon}</Icon>
            <span className={`min-w-0 truncate ${l.value.trim() ? 'font-medium text-slate-900' : 'text-slate-400'}`}>{l.value.trim() || l.empty}</span>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onEdit} className="-my-1 -mr-2 inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-blue-600 hover:bg-blue-50 active:bg-blue-50">
        <Icon className="h-4 w-4">{I.pencil}</Icon>Edit
      </button>
    </section>
  )
}

/** How business details print at the top of a receipt. */
export function ReceiptHeaderPreview({ name, address, contact }: { name: string; address: string; contact: string }) {
  return (
    <div className="rounded-xl bg-slate-100 p-3">
      <div className="mx-auto max-w-xs bg-white px-4 py-5 text-center text-[13px] leading-relaxed text-slate-800 shadow-sm">
        <p className="wrap-break-word font-bold uppercase">{name.trim() || 'Business name'}</p>
        {address.trim() && <p className="wrap-break-word">{address.trim()}</p>}
        {contact.trim() && <p>{contact.trim()}</p>}
        <p aria-hidden className="mt-2 overflow-hidden whitespace-nowrap text-slate-300">- - - - - - - - - - - - - - - - - - - -</p>
      </div>
    </div>
  )
}

export const RECEIPT_TOGGLES: { key: ReceiptKey; icon: ReactNode; title: string; text: string }[] = [
  { key: 'receipt_show_customer', icon: I.user, title: 'Customer name', text: 'Who the order belongs to' },
  { key: 'receipt_show_phone', icon: I.phone, title: 'Phone number', text: "Customer's contact number" },
  { key: 'receipt_show_order_no', icon: I.receipt, title: 'Order number', text: 'Needed to claim the laundry' },
  { key: 'receipt_show_datetime', icon: I.calendar, title: 'Date & time', text: 'When the order or payment was made' },
  { key: 'receipt_show_items', icon: I.layers, title: 'Service breakdown', text: 'Each service and add-on with quantity and price' },
  { key: 'receipt_show_method', icon: I.wallet, title: 'Payment method', text: 'Cash, GCash or other' },
  { key: 'receipt_show_staff', icon: I.users, title: 'Staff / cashier', text: 'Who took the order or payment' },
  { key: 'receipt_show_qr', icon: I.scan, title: 'Order QR code', text: 'Scan it at pickup to open the order (printer must support images)' },
]

/** Theme color suggestions. Green, amber and red are left out: they already mean paid, pending and errors. */
const SWATCHES = [DEFAULT_PRIMARY, '#4f46e5', '#7c3aed', '#c026d3', '#db2777', '#0891b2', '#0f766e', '#334155']

/** Swatches, the system color picker and a hex field. Says so when a color is darkened for readability. */
export function ColorPicker({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const safe = isHex(value) ? readable(value) : ''
  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label={label} className="grid grid-cols-8 gap-2 max-[380px]:grid-cols-4">
        {SWATCHES.map((s) => {
          const on = s === value.toLowerCase()
          return (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={s.toUpperCase()}
              onClick={() => onChange(s)}
              style={{ backgroundColor: s }}
              className={`grid aspect-square min-h-11 w-full place-items-center rounded-full text-white ring-offset-2 transition active:scale-95 ${on ? 'ring-2 ring-slate-900' : ''}`}
            >
              {on && <Icon className="h-5 w-5">{I.tick}</Icon>}
            </button>
          )
        })}
      </div>
      <div className="flex items-center gap-3">
        <label className="relative shrink-0">
          <span className="sr-only">{label}: custom</span>
          <input
            type="color"
            value={isHex(value) ? value.toLowerCase() : DEFAULT_PRIMARY}
            onChange={(e) => onChange(e.target.value)}
            className="h-12 w-16 cursor-pointer rounded-xl border border-slate-200 bg-white p-1"
          />
        </label>
        {/* Remounts when the color changes elsewhere; a typed code applies on Enter or when leaving the field. */}
        <HexInput key={value} label={label} value={value} onChange={onChange} />
        <span className="text-sm text-slate-500">Custom</span>
      </div>
      {safe && safe !== value.toLowerCase() && (
        <p className="flex items-center gap-2 text-sm text-slate-600">
          <span className="size-4 shrink-0 rounded-full" style={{ backgroundColor: safe }} />
          Darkened to {safe.toUpperCase()} so text stays readable.
        </p>
      )}
    </div>
  )
}

function HexInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value.toUpperCase())
  const commit = () => {
    const v = text.trim().replace(/^#?/, '#')
    if (isHex(v)) onChange(v.toLowerCase())
    else setText(value.toUpperCase())
  }
  return (
    <input
      className="min-h-12 w-32 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-base uppercase tabular-nums outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      aria-label={`${label}: hex code`}
      maxLength={7}
      spellCheck={false}
      autoCapitalize="characters"
      enterKeyHint="done"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit() } }}
    />
  )
}

/** Sample of the main UI pieces in the unsaved colors: the theme variables are scoped to this box, the app is untouched. */
export function BrandPreview({ b }: { b: Branding }) {
  const chip = 'rounded-full px-4 py-1.5 text-sm font-medium'
  return (
    <div aria-hidden style={themeVars(b) as CSSProperties} className="rounded-xl bg-slate-100 p-3">
      <div className="space-y-4 rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <LogoTile size="header" src={b.brand_logo} />
          <div className="min-w-0">
            <div className="truncate text-lg font-bold leading-tight tracking-tight text-slate-900"><BrandName name={b.business_name} /></div>
            <div className="truncate text-xs text-slate-500">Laundry Management System</div>
          </div>
        </div>
        <div className="flex gap-2">
          <span className={`${primary} flex-1`}><Icon className="h-5 w-5">{I.plus}</Icon>New Order</span>
          <span className={`${outline} flex-1`}><Icon className="h-5 w-5">{I.printer}</Icon>Print</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={`${chip} bg-blue-600 text-white shadow-sm shadow-blue-600/30`}>All</span>
          <span className={`${chip} bg-slate-200/60 text-slate-600`}>Processing</span>
          <span className={`${chip} bg-slate-200/60 text-slate-600`}>Ready</span>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-600"><Icon className="h-5 w-5">{I.receipt}</Icon></span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-slate-900">SL-000123</span>
            <span className="text-sm font-semibold text-blue-600">View details</span>
          </span>
          <StatusBadge status={PROCESSING} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <PaymentBadge status="paid" /><PaymentBadge status="partial" /><PaymentBadge status="unpaid" /><StatusBadge status="cancelled" />
        </div>
        <div className="grid grid-cols-3 border-t border-slate-100 pt-2 text-xs">
          {[{ icon: I.home, label: 'Home', on: true }, { icon: I.orders, label: 'Orders', on: false }, { icon: I.users, label: 'Customers', on: false }].map((t) => (
            <span key={t.label} className={`flex flex-col items-center gap-0.5 ${t.on ? 'font-semibold text-blue-600' : 'font-medium text-slate-500'}`}>
              <Icon className={`h-6 w-6 ${t.on ? 'fill-blue-100' : ''}`}>{t.icon}</Icon>
              {t.label}
              <span className={`h-1 w-8 rounded-full ${t.on ? 'bg-blue-600' : 'bg-transparent'}`} />
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

/** App name and what it is, for Settings › About. */
export function AboutCard() {
  return (
    <section className={`${card} flex flex-col items-center px-6 py-8 text-center`}>
      <span className="grid size-20 place-items-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/25">
        <Icon className="h-12 w-12">{I.washer}</Icon>
      </span>
      <h2 className="mt-4 text-2xl font-bold text-slate-900">Sellix<span className="text-blue-600">Laundry</span></h2>
      <p className="text-slate-500">Laundry Management System</p>
      <p className="mt-4 max-w-sm text-sm text-slate-500">Works fully offline. All data is stored on this device. Use Backup &amp; Restore to keep a copy elsewhere.</p>
    </section>
  )
}
