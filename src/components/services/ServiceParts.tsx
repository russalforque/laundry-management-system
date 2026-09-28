import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Segmented, Select, Toggle } from '../Controls'
import { I, Icon, serviceIcon } from '../Icons'
import { card, EmptyCard, Field, field, Section } from '../Manage'
import { NumberInput } from '../NumberInput'
import { fieldCls } from '../ui'
import { priceUnit, type ServiceOrder } from '../../db/services'
import { KIND_HINT, KIND_LABEL, usesLoads, type ServiceFormCtl, type ServiceFormValues, type ServiceKind } from '../../hooks/useServices'
import { formatPesoShort } from '../../lib/money'
import { STATUS_LABEL } from '../../lib/orders'
import { canInclude, qtyText, TYPE_LABEL, typeOf } from '../../lib/pricing'
import type { Inclusion, PricingType, Service } from '../../types'

/** Services pieces shared by the phone and tablet / desktop Services pages (hooks/useServices.ts). */

const TONES = ['bg-blue-50 text-blue-600', 'bg-blue-100 text-blue-700', 'bg-slate-100 text-slate-600']
const toneFor = (id: number) => TONES[id % TONES.length]

export const priceText = (cents: number, t: PricingType) => `${formatPesoShort(cents)}${priceUnit(t)}`
const day = (iso: string) => new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })

export function ServiceTile({ s, className }: { s: { id?: number; name: string; image?: string | null }; className: string }) {
  if (s.image) return <img src={s.image} alt="" className={`shrink-0 object-cover ${className}`} />
  return (
    <span className={`grid shrink-0 place-items-center ${toneFor(s.id ?? 0)} ${className}`}>
      <Icon className="h-1/2 w-1/2">{serviceIcon(s.name)}</Icon>
    </span>
  )
}

/** Card with a small uppercase heading above it, the pattern used across Settings. */
export function Block({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 flex items-baseline justify-between gap-3 px-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</span>
        {aside}
      </h2>
      {children}
    </section>
  )
}

/** One linked item (included service/add-on, or a package that includes this one); opens its details. */
export function ItemRow({ s, right, onOpen }: { s: Service; right?: ReactNode; onOpen: (id: number) => void }) {
  return (
    <li>
      <button type="button" onClick={() => onOpen(s.id)} className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left hover:bg-slate-50 active:bg-slate-50">
        <ServiceTile s={s} className={`size-10 rounded-xl ${s.active ? '' : 'opacity-50 grayscale'}`} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-slate-900">{s.name}</span>
          <span className="block truncate text-xs text-slate-500">
            {s.active ? priceText(s.price_cents, s.pricing_type) : <span className="font-semibold text-red-600">Inactive · not offered</span>}
          </span>
        </span>
        {right}
        <Icon className="h-4 w-4 shrink-0 text-slate-300">{I.chevron}</Icon>
      </button>
    </li>
  )
}

/** What a package/service includes, with the extra-charge rules, as staff will see it on New Order. */
export function Includes({ parent, all, inclusions, maxKg, onOpen }: { parent: Service; all: Service[]; inclusions: Inclusion[]; maxKg: number | null; onOpen: (id: number) => void }) {
  const kids = inclusions
    .filter((i) => i.service_id === parent.id)
    .flatMap((i) => {
      const child = all.find((s) => s.id === i.included_id)
      return child && canInclude(parent, child) ? [{ child, qty: i.quantity }] : []
    })
  const svcs = kids.filter((k) => !k.child.is_addon)
  const adds = kids.filter((k) => k.child.is_addon)
  const per = parent.pricing_type === 'per_item' ? 'item' : parent.pricing_type === 'per_quantity' ? 'pc' : parent.pricing_type === 'fixed' ? '' : 'load'
  const rules = [
    parent.pricing_type === 'per_load' && maxKg && `Each load over ${maxKg} kg is another ${formatPesoShort(parent.price_cents)} (staff can adjust loads).`,
    parent.pricing_type === 'per_kg' && `Charged ${formatPesoShort(parent.price_cents)} for every kg.`,
    adds.length > 0 && 'Add-ons above the included amount are charged at their own price.',
    svcs.length > 0 && 'Included services added separately are not charged again for the same loads.',
    !adds.length && 'Add-ons are charged at their own price.',
  ].filter(Boolean) as string[]
  const qtyPill = (qty: number) => (
    <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold tabular-nums text-blue-700">{qty}×{per && ` / ${per}`}</span>
  )
  const freePill = <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Included</span>

  return (
    <>
      <Block title={parent.is_package ? 'Package includes' : 'Included add-ons'} aside={kids.length > 0 && <span className="text-xs tabular-nums text-slate-400">{kids.length}</span>}>
        <div className={`${card} overflow-hidden`}>
          {kids.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">Nothing included. Add-ons are charged separately. Tap <b>Edit</b> to include some.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {svcs.map((k) => <ItemRow key={k.child.id} s={k.child} right={freePill} onOpen={onOpen} />)}
              {adds.map((k) => <ItemRow key={k.child.id} s={k.child} right={qtyPill(k.qty)} onOpen={onOpen} />)}
            </ul>
          )}
          {usesLoads(parent.pricing_type) && (
            <div className="flex items-center gap-3 border-t border-slate-100 px-4 py-3 text-sm">
              <Icon className="h-5 w-5 shrink-0 text-slate-400">{I.washer}</Icon>
              <span className="flex-1 text-slate-600">Max weight</span>
              <span className="font-semibold text-slate-900">{maxKg ? `${maxKg} kg per load` : 'Loads entered by staff'}</span>
            </div>
          )}
        </div>
      </Block>

      <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Icon className="h-4 w-4 text-blue-600">{I.info}</Icon>How extra charges work</p>
        <ul className="mt-2 list-disc space-y-1 pl-6 text-sm text-slate-600">
          {rules.map((r) => <li key={r}>{r}</li>)}
        </ul>
      </div>
    </>
  )
}

/** Where an item was used lately, newest first, each opening its order. */
export function RecentServiceOrders({ recent }: { recent: ServiceOrder[] | null }) {
  return (
    <Block title="Recent orders" aside={recent && recent.length > 0 && <span className="text-xs tabular-nums text-slate-400">{recent.length}</span>}>
      <div className={`${card} overflow-hidden`}>
        {recent === null ? (
          <div className="divide-y divide-slate-100" aria-busy="true">
            {[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse bg-slate-50" />)}
          </div>
        ) : recent.length === 0 ? (
          <EmptyCard icon={I.orders} title="No orders yet" text="Orders that include this item will appear here." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {recent.map((o) => (
              <li key={o.id}>
                <Link to={`/orders/${o.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-slate-50 active:bg-slate-50">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-semibold text-slate-900">#{o.order_number}</span>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{STATUS_LABEL[o.status]}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">{qtyText(typeOf(o), o.quantity)} · {day(o.received_at)}, {time(o.received_at)}</span>
                  </span>
                  <span className="shrink-0 font-bold tabular-nums text-slate-900">{formatPesoShort(o.amount_cents)}</span>
                  <Icon className="h-4 w-4 shrink-0 text-slate-300">{I.chevron}</Icon>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Block>
  )
}

function IncludePicker({ title, hint, items, form, setIncludes }: {
  title: string; hint: string; items: Service[]; form: ServiceFormValues; setIncludes: (v: Record<number, number>) => void
}) {
  if (!items.length) return <p className="text-sm text-slate-500">{title}: none available yet.</p>
  const toggle = (id: number) => {
    const next = { ...form.includes }
    if (next[id]) delete next[id]
    else next[id] = 1
    setIncludes(next)
  }
  const bump = (id: number, d: number) => setIncludes({ ...form.includes, [id]: Math.min(99, Math.max(1, (form.includes[id] ?? 1) + d)) })
  const stepBtn = 'grid size-11 place-items-center rounded-lg text-blue-600 hover:bg-blue-50 active:bg-blue-50 disabled:text-slate-300'
  return (
    <div className="space-y-2">
      <div>
        <div className="text-sm font-semibold text-slate-800">{title}</div>
        <div className="text-xs text-slate-500">{hint}</div>
      </div>
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {items.map((s) => {
          const on = !!form.includes[s.id]
          return (
            <li key={s.id} className={`flex min-h-14 items-center gap-3 px-3 py-1 ${on ? 'bg-blue-50/40' : ''}`}>
              <button type="button" role="checkbox" aria-checked={on} onClick={() => toggle(s.id)} className="flex min-h-12 min-w-0 flex-1 items-center gap-3 text-left">
                <span aria-hidden className={`grid size-6 shrink-0 place-items-center rounded-md border-2 ${on ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300'}`}>
                  {on && <Icon className="h-4 w-4">{I.tick}</Icon>}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-slate-800">
                  {s.name}{!s.active && <span className="text-slate-400"> (inactive)</span>}
                </span>
              </button>
              {on && s.is_addon ? (
                <span className="flex shrink-0 items-center rounded-lg border border-slate-200">
                  <button type="button" aria-label={`Less ${s.name}`} className={stepBtn} disabled={form.includes[s.id] <= 1} onClick={() => bump(s.id, -1)}>
                    <Icon className="h-4 w-4">{I.minus}</Icon>
                  </button>
                  <span className="w-7 text-center text-base font-semibold tabular-nums" aria-label={`${form.includes[s.id]} included`}>{form.includes[s.id]}</span>
                  <button type="button" aria-label={`More ${s.name}`} className={stepBtn} onClick={() => bump(s.id, 1)}>
                    <Icon className="h-4 w-4">{I.plus}</Icon>
                  </button>
                </span>
              ) : (
                <span className="shrink-0 text-xs text-slate-400">{formatPesoShort(s.price_cents)}{priceUnit(s.pricing_type)}</span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * The add / edit form's sections (Details, Pricing, Includes, Active), without page chrome. `columns` sets the
 * two groups side by side for wide containers.
 */
export function ServiceFormSections({ sf, defaultMaxKg, columns }: { sf: ServiceFormCtl; defaultMaxKg: number | null; columns?: boolean }) {
  const { form, set, setKind, pickImage, editing, eligible, perWord } = sf
  return (
    <div className={`grid gap-4 ${columns ? 'lg:grid-cols-2 lg:items-start' : ''}`}>
      <div className="min-w-0 space-y-4">
        <Section title="Details">
          <div className="space-y-1.5">
            <Segmented
              label="Item type"
              value={form.kind}
              onChange={setKind}
              options={(['service', 'package', 'addon'] as ServiceKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))}
            />
            <p className="text-xs text-slate-500">{KIND_HINT[form.kind]}</p>
          </div>
          <div className="flex items-center gap-4">
            <ServiceTile s={{ id: form.id, name: form.name, image: form.image }} className="size-20 rounded-2xl" />
            <div className="min-w-0 flex-1 text-sm">
              <div className="font-semibold text-slate-800">Photo <span className="font-normal text-slate-400">(optional)</span></div>
              <div className="text-slate-500">Shown on the New Order cards. Without a photo, an icon is used.</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <label className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full bg-blue-50 px-4 font-semibold text-blue-700 hover:bg-blue-100 active:bg-blue-100">
                  <Icon className="h-4 w-4">{form.image ? I.refresh : I.plus}</Icon>
                  {form.image ? 'Change' : 'Add Photo'}
                  <input type="file" accept="image/*" className="sr-only" onChange={pickImage} />
                </label>
                {form.image && (
                  <button type="button" onClick={() => set('image', null)} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-red-50 px-4 font-semibold text-red-600 hover:bg-red-100 active:bg-red-100">
                    <Icon className="h-4 w-4">{I.trash}</Icon>Remove
                  </button>
                )}
              </div>
            </div>
          </div>
          <Field label="Name" icon={I.shirt} required>
            <input className={field} placeholder={form.kind === 'package' ? 'e.g. Wash + Dry + Fold' : form.kind === 'addon' ? 'e.g. Detergent' : 'e.g. Wash'} value={form.name} onChange={(e) => set('name', e.target.value)} required autoFocus={!editing} />
          </Field>
          <Field label="Description" icon={I.note}>
            <input className={field} placeholder="Enter description (optional)" value={form.description} onChange={(e) => set('description', e.target.value)} />
          </Field>
        </Section>

        <Section title="Pricing">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Price" icon={I.peso} required>
              <NumberInput className={field} placeholder="Enter price" value={form.price} onChange={(v) => set('price', v)} required />
            </Field>
            <label className="block min-w-0">
              <span className="text-sm font-semibold text-slate-800">Pricing Type<span className="text-red-500"> *</span></span>
              <span className="mt-1.5 block">
                <Select className={fieldCls} value={form.pricingType} onChange={(e) => set('pricingType', e.target.value as PricingType)}>
                  {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </span>
            </label>
          </div>
          {usesLoads(form.pricingType) && form.kind !== 'addon' && (
            <Field label="Max Weight per Load (kg)" icon={I.washer}>
              <NumberInput
                className={field}
                maxInt={4}
                placeholder={defaultMaxKg ? `Default: ${defaultMaxKg} kg (Settings)` : 'No limit set in Settings'}
                value={form.maxKg}
                onChange={(v) => set('maxKg', v)}
              />
            </Field>
          )}
          <p className="text-xs text-slate-400">
            {form.pricingType === 'per_load' && 'Staff enter the weight; loads are counted from the max weight per load and can be adjusted. '}
            Price changes only apply to new orders; existing orders keep their price.
          </p>
        </Section>
      </div>

      <div className="min-w-0 space-y-4">
        {form.kind !== 'addon' && (
          <Section title={form.kind === 'package' ? 'Package Includes' : 'Included Add-ons'}>
            {form.kind === 'package' && (
              <IncludePicker
                title="Services"
                hint="Not charged again when added to the same order."
                items={eligible.filter((s) => !s.is_addon)}
                form={form}
                setIncludes={(v) => set('includes', v)}
              />
            )}
            <IncludePicker
              title="Add-ons"
              hint={`Free quantity per ${perWord}; anything above it is charged.`}
              items={eligible.filter((s) => s.is_addon)}
              form={form}
              setIncludes={(v) => set('includes', v)}
            />
          </Section>
        )}

        <section className={`${card} flex items-center gap-3 p-4 sm:px-5`}>
          <span className="min-w-0 flex-1">
            <span className="block font-bold text-slate-900">Active</span>
            <span className="block text-sm text-slate-500">{form.active ? 'Available for new orders' : 'Hidden from New Order'}</span>
          </span>
          <Toggle label="Active" on={form.active} onChange={(v) => set('active', v)} />
        </section>
      </div>
    </div>
  )
}
