import { formatPeso, formatPesoShort } from '../../lib/money'
import { qtyText, TYPE_LABEL, TYPE_UNIT, typeOf } from '../../lib/pricing'
import type { OrderItemRow, Service } from '../../types'
import { I, Icon, serviceIcon } from '../Icons'
import { ServiceArt } from '../ServiceArt'
import { panel, PanelHead, Row, type Detail } from './shared'

const count = (n: number) => `${n} ${n === 1 ? 'item' : 'items'}`

/** One service line: what it is and how its subtotal was reached. */
function ServiceCard({ line, onEdit }: { line: OrderItemRow; onEdit?: () => void }) {
  const t = typeOf(line)
  const included = line.included_qty > 0
  const allIncluded = line.included_qty >= line.quantity && !line.amount_cents
  return (
    <li className={`${panel} p-3.5`}>
      <div className="flex items-start gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-600">
          <Icon className="h-6 w-6">{serviceIcon(line.service_name)}</Icon>
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="wrap-break-word font-semibold leading-snug text-slate-900">{line.service_name}</p>
          <p className="text-sm text-slate-500">{t === 'fixed' ? 'Fixed price' : TYPE_LABEL[t]}</p>
        </div>
        <p className="shrink-0 pt-0.5 text-lg font-bold tabular-nums text-slate-900">
          {allIncluded ? <span className="text-sm font-semibold text-emerald-600">Included</span> : formatPeso(line.amount_cents)}
        </p>
      </div>
      <dl className="mt-3 divide-y divide-white rounded-2xl bg-blue-50/60 px-3.5 text-[15px]">
        <Row icon={I.clock} label="Quantity">{t === 'fixed' ? '1' : qtyText(t, line.quantity)}{line.weight_kg ? ` (${line.weight_kg} kg)` : ''}</Row>
        <Row icon={I.note} label="Unit price">{formatPeso(line.unit_price_cents)}{TYPE_UNIT[t]}</Row>
        {included && !allIncluded && <Row icon={I.check} label="Included">{t === 'fixed' || t === 'per_kg' ? 'Yes' : line.included_qty}</Row>}
        <Row icon={I.receipt} label="Subtotal">{formatPeso(line.amount_cents)}</Row>
      </dl>
      {(line.note || onEdit) && (
        <div className="mt-1 flex items-center justify-between gap-2">
          <p className="min-w-0 py-2 text-xs text-slate-500">{line.note}</p>
          {onEdit && (
            <button type="button" onClick={onEdit} aria-label={`Change ${line.service_name}`} className="-mb-1 -mr-1 inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-2 text-sm font-semibold text-blue-600 active:bg-blue-50">
              <Icon className="h-4 w-4">{I.pencil}</Icon>Edit
            </button>
          )}
        </div>
      )}
    </li>
  )
}

/** An add-on to tap onto the order: photo, name, price per unit, and how many are on the order. */
function AddonCard({ s, line, busy, onChange }: { s: Service; line?: OrderItemRow; busy: boolean; onChange: (qty: number) => void }) {
  const included = line?.included_qty ?? 0
  const qty = line?.quantity ?? 0
  const picked = qty > included // staff added some beyond what a package/service includes
  const fixedAdded = s.pricing_type === 'fixed' && !!line // a flat-rate add-on only goes on once
  return (
    <li className={`${panel} relative flex min-h-32 gap-2.5 p-3 ${line ? 'border-blue-300 ring-1 ring-blue-200' : ''}`}>
      <ServiceArt name={s.name} image={s.image} className="size-16 shrink-0 rounded-xl" iconCls="h-8 w-8" />
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="line-clamp-2 wrap-break-word text-sm font-semibold leading-snug text-slate-900">{s.name}</p>
        <p className="mt-0.5 text-sm tabular-nums text-slate-900">
          <b className="font-bold">{formatPesoShort(s.price_cents)}</b>
          {TYPE_UNIT[s.pricing_type] && <span className="text-slate-500"> {TYPE_UNIT[s.pricing_type].replace('/', '/ ')}</span>}
        </p>
        {line && (
          <p className="mt-1 text-xs font-semibold text-blue-600">
            {s.pricing_type === 'fixed' ? (included ? 'Included' : 'Added')
              : `${qtyText(typeOf(line), qty)} on order${included ? ` · ${included} incl.` : ''}`}
          </p>
        )}
        <div className="mt-auto flex items-center justify-end gap-2 pt-2">
          {picked && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onChange(qty - 1 <= included ? 0 : qty - 1)}
              aria-label={`Remove one ${s.name}`}
              className="grid size-11 place-items-center rounded-full border border-blue-200 bg-white text-blue-600 active:bg-blue-50 disabled:opacity-50"
            >
              <Icon className="h-5 w-5">{I.minus}</Icon>
            </button>
          )}
          <button
            type="button"
            disabled={busy || fixedAdded}
            onClick={() => onChange(qty + 1)}
            aria-label={fixedAdded ? `${s.name} added` : `Add ${s.name}`}
            className="grid size-11 place-items-center rounded-full bg-blue-600 text-white shadow-sm shadow-blue-600/30 active:bg-blue-700 disabled:bg-blue-200 disabled:shadow-none"
          >
            <Icon className="h-5 w-5">{fixedAdded ? I.tick : I.plus}</Icon>
          </button>
        </div>
      </div>
    </li>
  )
}

export function ServicesStep({ data, services, editable, busy, onAddMore, onEdit, onAddon }: {
  data: Detail
  /** Active services; null while loading. */
  services: Service[] | null
  /** Items can still change (the order isn't completed or cancelled). */
  editable: boolean
  busy: boolean
  onAddMore: () => void
  onEdit: (line: OrderItemRow) => void
  onAddon: (s: Service, qty: number) => void
}) {
  const { order, items } = data
  const addons = services?.filter((s) => s.is_addon) ?? []
  // Add-ons that can be tapped live in their own grid; everything else (and all lines on a closed order) is listed here.
  const inGrid = new Set(editable ? addons.map((s) => s.id) : [])
  const lines = items.filter((i) => !inGrid.has(i.service_id))

  return (
    <div className="space-y-5">
      <section className={`${panel} p-4 sm:p-5`}>
        <PanelHead
          title="Services"
          sub={count(lines.length)}
          action={editable && (
            <button type="button" onClick={onAddMore} disabled={busy} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-2xl bg-blue-50 py-1.5 pl-2 pr-4 font-semibold text-blue-600 active:bg-blue-100 disabled:opacity-50">
              <span className="grid size-7 place-items-center rounded-full bg-blue-600 text-white"><Icon className="h-4 w-4">{I.plus}</Icon></span>
              Add More
            </button>
          )}
        />
        {lines.length ? (
          <ul className="mt-4 space-y-3">
            {lines.map((l) => <ServiceCard key={l.id} line={l} onEdit={editable ? () => onEdit(l) : undefined} />)}
          </ul>
        ) : (
          <p className="mt-4 rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
            No services yet. Tap Add More to add one.
          </p>
        )}
      </section>

      {editable && (
        <section aria-labelledby="od-addons">
          <div className="px-1">
            <h2 id="od-addons" className="text-lg font-bold text-slate-900">Add-ons</h2>
            <p className="text-sm text-slate-500">Add extra services or products</p>
          </div>
          {services === null ? (
            <div className="mt-3 grid grid-cols-2 gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-32 animate-pulse rounded-3xl bg-white/70" />)}</div>
          ) : addons.length ? (
            <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {addons.map((s) => (
                <AddonCard key={s.id} s={s} line={items.find((i) => i.service_id === s.id)} busy={busy} onChange={(q) => onAddon(s, q)} />
              ))}
            </ul>
          ) : (
            <p className={`${panel} mt-3 px-4 py-6 text-center text-sm text-slate-500`}>No add-ons are set up. An admin can add them on the Services page.</p>
          )}
        </section>
      )}

      <section aria-label="Order total" className="rounded-3xl bg-blue-100/70 px-5 py-4">
        {order.discount_cents > 0 && (
          <dl className="mb-2 space-y-1 border-b border-blue-200/70 pb-2 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-slate-600">Subtotal</dt><dd className="tabular-nums text-slate-900">{formatPeso(order.subtotal_cents)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-600">Discount</dt><dd className="tabular-nums text-emerald-700">− {formatPeso(order.discount_cents)}</dd></div>
          </dl>
        )}
        <div className="flex items-center justify-between gap-3">
          <span className="text-lg font-semibold text-slate-900">Total</span>
          <span aria-live="polite" className="text-2xl font-bold tabular-nums text-slate-900">{formatPeso(order.total_cents)}</span>
        </div>
      </section>
    </div>
  )
}
