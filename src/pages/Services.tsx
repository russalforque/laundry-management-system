import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { I, Icon, serviceIcon } from '../components/Icons'
import {
  BackHeader, card, EmptyCard, Field, field, FilterTabs, primary, SearchRow, Section,
} from '../components/Manage'
import { Segmented, Select, Toggle } from '../components/Controls'
import { NumberInput } from '../components/NumberInput'
import {
  createService, deleteService, listInclusions, listServices, priceUnit, serviceRecentOrders, serviceStats, setServiceActive, updateService,
  type ServiceOrder, type ServiceStats,
} from '../db/services'
import { getSettings } from '../db/settings'
import { fileToThumbnail } from '../lib/image'
import { centsToInput, formatPeso, formatPesoShort, parsePesoToCents } from '../lib/money'
import { STATUS_LABEL } from '../lib/orders'
import { canInclude, kindOf, maxKgOf, parseMaxKg, qtyText, TYPE_LABEL, TYPE_UNIT, typeOf } from '../lib/pricing'
import type { Inclusion, PricingType, Service } from '../types'
import { fabPos, fieldCls } from '../components/ui'

type Kind = 'service' | 'package' | 'addon'

interface Form {
  id?: number
  name: string
  description: string
  kind: Kind
  pricingType: PricingType
  price: string
  active: boolean
  image: string | null
  /** Blank = use the Settings value. */
  maxKg: string
  /** Included item id → quantity per load/unit. */
  includes: Record<number, number>
}

type View = { kind: 'list' } | { kind: 'form'; form: Form; back: View } | { kind: 'detail'; id: number }
type Filter = 'all' | Kind | 'inactive'

const blank: Form = { name: '', description: '', kind: 'service', pricingType: 'per_load', price: '', active: true, image: null, maxKg: '', includes: {} }
const toForm = (s: Service, inc: Inclusion[]): Form => ({
  id: s.id, name: s.name, description: s.description, kind: kindOf(s), pricingType: s.pricing_type, price: centsToInput(s.price_cents),
  active: !!s.active, image: s.image, maxKg: s.max_kg == null ? '' : String(s.max_kg),
  includes: Object.fromEntries(inc.filter((i) => i.service_id === s.id).map((i) => [i.included_id, i.quantity])),
})
const asFlags = (k: Kind) => ({ is_addon: k === 'addon' ? 1 : 0, is_package: k === 'package' ? 1 : 0 })

const KIND_LABEL: Record<Kind, string> = { service: 'Service', package: 'Package', addon: 'Add-on' }
const KIND_HINT: Record<Kind, string> = {
  service: 'A laundry service such as Wash, Dry, Fold or Comforter. Can include add-ons.',
  package: 'A bundle such as Wash + Dry + Fold, priced as one. Can include services and add-ons at no extra charge.',
  addon: 'Detergent, fabric conditioner… listed under Add-ons on New Order.',
}
/** Sensible unit when switching kind; staff can still pick any. */
const KIND_TYPE: Record<Kind, PricingType> = { service: 'per_load', package: 'per_load', addon: 'per_quantity' }

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'service', label: 'Services' },
  { id: 'package', label: 'Packages' },
  { id: 'addon', label: 'Add-ons' },
  { id: 'inactive', label: 'Inactive' },
]

const TONES = ['bg-blue-50 text-blue-600', 'bg-blue-100 text-blue-700', 'bg-slate-100 text-slate-600']
const toneFor = (id: number) => TONES[id % TONES.length]

const priceText = (cents: number, t: PricingType) => `${formatPesoShort(cents)}${priceUnit(t)}`
const usesLoads = (t: PricingType) => t === 'per_load' || t === 'per_kg'
const day = (iso: string) => new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })

// ---------- building blocks ----------

function ServiceTile({ s, className }: { s: { id?: number; name: string; image?: string | null }; className: string }) {
  if (s.image) return <img src={s.image} alt="" className={`shrink-0 object-cover ${className}`} />
  return (
    <span className={`grid shrink-0 place-items-center ${toneFor(s.id ?? 0)} ${className}`}>
      <Icon className="h-1/2 w-1/2">{serviceIcon(s.name)}</Icon>
    </span>
  )
}

/** Card with a small uppercase heading above it, the pattern used across Settings. */
function Block({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
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
function ItemRow({ s, right, onOpen }: { s: Service; right?: ReactNode; onOpen: (id: number) => void }) {
  return (
    <li>
      <button type="button" onClick={() => onOpen(s.id)} className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left active:bg-slate-50">
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
function Includes({ parent, all, inclusions, maxKg, onOpen }: { parent: Service; all: Service[]; inclusions: Inclusion[]; maxKg: number | null; onOpen: (id: number) => void }) {
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

// ---------- views ----------

function ServiceCard({ s, subtitle, onOpen }: { s: Service; subtitle: string; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className={`${card} flex min-h-20 w-full items-center gap-3 p-3 text-left transition active:bg-slate-50 sm:gap-4 sm:p-4`}>
      <ServiceTile s={s} className={`size-14 rounded-2xl ${s.active ? '' : 'opacity-50 grayscale'}`} />
      <span className="min-w-0 flex-1">
        <span className={`block truncate font-bold ${s.active ? 'text-slate-900' : 'text-slate-500'}`}>{s.name}</span>
        <span className="mt-0.5 block truncate text-sm text-slate-500">{subtitle}</span>
        {/* Status only when it needs attention: every other item is active. */}
        {!s.active && <span className="mt-1 inline-block rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">Inactive</span>}
      </span>
      <span className="shrink-0 text-right">
        <span className="block font-bold tabular-nums text-slate-900">{formatPesoShort(s.price_cents)}</span>
        <span className="block text-xs text-slate-500">{s.pricing_type === 'fixed' ? 'flat' : TYPE_UNIT[s.pricing_type].replace('/', 'per ')}</span>
        {s.max_kg != null && <span className="block text-xs text-slate-400">max {s.max_kg} kg</span>}
      </span>
      <Icon className="-mr-1 h-5 w-5 shrink-0 text-slate-300">{I.chevron}</Icon>
    </button>
  )
}

function IncludePicker({ title, hint, items, form, setIncludes }: {
  title: string; hint: string; items: Service[]; form: Form; setIncludes: (v: Record<number, number>) => void
}) {
  if (!items.length) return <p className="text-sm text-slate-500">{title}: none available yet.</p>
  const toggle = (id: number) => {
    const next = { ...form.includes }
    if (next[id]) delete next[id]
    else next[id] = 1
    setIncludes(next)
  }
  const bump = (id: number, d: number) => setIncludes({ ...form.includes, [id]: Math.min(99, Math.max(1, (form.includes[id] ?? 1) + d)) })
  const stepBtn = 'grid size-11 place-items-center rounded-lg text-blue-600 active:bg-blue-50 disabled:text-slate-300'
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

function ServiceForm({ initial, all, defaultMaxKg, onSaved, onCancel }: {
  initial: Form; all: Service[]; defaultMaxKg: number | null; onSaved: (id: number) => void; onCancel: () => void
}) {
  const [form, setForm] = useState(initial)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))
  const editing = !!form.id
  const noun = KIND_LABEL[form.kind]
  const self = asFlags(form.kind)
  const eligible = all.filter((s) => s.id !== form.id && canInclude(self, s))
  const perWord = form.pricingType === 'per_item' ? 'item' : form.pricingType === 'per_quantity' ? 'piece' : form.pricingType === 'fixed' ? 'order' : 'load'
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)
  const cancel = () => { if (!dirty || window.confirm('Discard your unsaved changes?')) onCancel() }

  function setKind(kind: Kind) {
    // Drop inclusions the new kind can't hold (e.g. services when switching a package back to a service).
    const flags = asFlags(kind)
    const includes = Object.fromEntries(Object.entries(form.includes).filter(([id]) => {
      const s = all.find((x) => x.id === Number(id))
      return s && canInclude(flags, s)
    }))
    setForm((f) => ({ ...f, kind, includes, pricingType: f.kind === kind ? f.pricingType : KIND_TYPE[kind] }))
  }

  async function pickImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return
    try {
      set('image', await fileToThumbnail(file))
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load image.')
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    const priceCents = parsePesoToCents(form.price)
    if (priceCents === null) return setError('Enter a valid price (0 or more, up to 2 decimals).')
    const maxKg = form.maxKg.trim() && usesLoads(form.pricingType) ? parseMaxKg(form.maxKg) : null
    if (form.maxKg.trim() && usesLoads(form.pricingType) && maxKg === null) return setError('Enter a valid max weight per load, or leave it blank.')
    if (form.kind === 'package' && !Object.keys(form.includes).length) return setError('Choose what this package includes.')
    setBusy(true)
    try {
      const input = {
        name: form.name, description: form.description, pricingType: form.pricingType, priceCents, active: form.active, image: form.image,
        isAddon: form.kind === 'addon', isPackage: form.kind === 'package', maxKg,
        inclusions: form.kind === 'addon' ? [] : Object.entries(form.includes).map(([id, quantity]) => ({ id: Number(id), quantity })),
      }
      onSaved(form.id ? (await updateService(form.id, input), form.id) : await createService(input))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <BackHeader title={editing ? `Edit ${noun}` : `Add ${noun}`} onBack={cancel} />

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <div className="space-y-4">
          <Section title="Details">
            <div className="space-y-1.5">
              <Segmented
                label="Item type"
                value={form.kind}
                onChange={setKind}
                options={(['service', 'package', 'addon'] as Kind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))}
              />
              <p className="text-xs text-slate-500">{KIND_HINT[form.kind]}</p>
            </div>
            <div className="flex items-center gap-4">
              <ServiceTile s={{ id: form.id, name: form.name, image: form.image }} className="size-20 rounded-2xl" />
              <div className="min-w-0 flex-1 text-sm">
                <div className="font-semibold text-slate-800">Photo <span className="font-normal text-slate-400">(optional)</span></div>
                <div className="text-slate-500">Shown on the New Order cards. Without a photo, an icon is used.</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <label className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full bg-blue-50 px-4 font-semibold text-blue-700 active:bg-blue-100">
                    <Icon className="h-4 w-4">{form.image ? I.refresh : I.plus}</Icon>
                    {form.image ? 'Change' : 'Add Photo'}
                    <input type="file" accept="image/*" className="sr-only" onChange={pickImage} />
                  </label>
                  {form.image && (
                    <button type="button" onClick={() => set('image', null)} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-red-50 px-4 font-semibold text-red-600 active:bg-red-100">
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

        <div className="space-y-4">
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

      {/* Pinned above the bottom nav so Save stays in thumb reach on a long form. */}
      <div className="sticky bottom-0 z-20 -mx-4 -mb-4 border-t border-slate-200/70 bg-white/95 px-4 pb-4 pt-3 shadow-[0_-4px_20px_rgba(15,23,42,0.06)] backdrop-blur md:bottom-4 md:mx-0 md:mb-0 md:rounded-2xl md:border md:pb-3">
        {error && <p role="alert" className="mb-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={cancel} className="min-h-12 flex-1 rounded-xl bg-slate-100 font-semibold text-slate-700 active:bg-slate-200 md:flex-none md:px-8">Cancel</button>
          <button disabled={busy} className={`${primary} min-h-12 flex-2 text-base md:flex-none md:px-10`}>
            {busy ? 'Saving…' : `Save ${noun.toLowerCase()}`}
          </button>
        </div>
      </div>
    </form>
  )
}

function ServiceDetail({ s, all, inclusions, defaultMaxKg, onBack, onEdit, onOpen, onChanged, onDeleted }: {
  s: Service; all: Service[]; inclusions: Inclusion[]; defaultMaxKg: number | null
  onBack: () => void; onEdit: () => void; onOpen: (id: number) => void; onChanged: () => Promise<unknown>; onDeleted: () => Promise<unknown>
}) {
  const [stats, setStats] = useState<ServiceStats | null>(null)
  const [recent, setRecent] = useState<ServiceOrder[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const noun = KIND_LABEL[kindOf(s)]
  const partOf = all.filter((p) => inclusions.some((i) => i.included_id === s.id && i.service_id === p.id) && canInclude(p, s))

  useEffect(() => {
    serviceStats(s.id).then(setStats).catch(() => setStats({ orders: 0, revenue_cents: 0 }))
    serviceRecentOrders(s.id).then(setRecent).catch(() => setRecent([]))
  }, [s.id])

  async function act(fn: () => Promise<unknown>) {
    setBusy(true)
    try {
      await fn()
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const toggleActive = () => {
    if (s.active && !window.confirm(`Deactivate ${s.name}? It won't be available for new orders.`)) return
    act(async () => { await setServiceActive(s.id, !s.active); await onChanged() })
  }
  const remove = () => {
    if (!window.confirm(`Delete ${s.name}? This cannot be undone.`)) return
    act(async () => { await deleteService(s.id); await onDeleted() })
  }

  // Only never-used items can be deleted; say why otherwise instead of hiding the option silently.
  const loaded = stats !== null && recent !== null
  const deletable = loaded && stats.orders === 0 && recent.length === 0

  return (
    <div className="space-y-5">
      <BackHeader title={`${noun} details`} onBack={onBack} />

      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <div className="min-w-0 space-y-5">
          {/* Identity, price and availability */}
          <section className={`${card} overflow-hidden`}>
            <div className="flex flex-col items-center px-4 pb-5 pt-6 text-center">
              <ServiceTile s={s} className={`size-24 rounded-3xl shadow-sm ${s.active ? '' : 'opacity-50 grayscale'}`} />
              <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                <Icon className="h-3.5 w-3.5">{s.is_addon ? I.box : s.is_package ? I.layers : I.washer}</Icon>{noun}
              </span>
              <h1 className="mt-2 max-w-full text-2xl font-bold leading-tight tracking-tight text-slate-900 wrap-break-word">{s.name}</h1>
              {s.description && <p className="mt-1 max-w-sm text-sm text-slate-500">{s.description}</p>}
              <p className="mt-3 flex items-baseline gap-1.5">
                <span className="text-3xl font-bold tabular-nums tracking-tight text-slate-900">{formatPesoShort(s.price_cents)}</span>
                <span className="text-sm font-medium text-slate-500">{s.pricing_type === 'fixed' ? 'flat price' : TYPE_UNIT[s.pricing_type].replace('/', 'per ')}</span>
              </p>
            </div>
            {/* Availability sits with the item it controls; turning it off still asks first. */}
            <div className="flex items-center gap-3 border-t border-slate-100 px-4 py-3">
              <span className={`size-2.5 shrink-0 rounded-full ${s.active ? 'bg-emerald-500' : 'bg-red-500'}`} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-slate-900">{s.active ? 'Active' : 'Inactive'}</span>
                <span className="block text-xs text-slate-500">{s.active ? 'Offered on New Order' : 'Hidden from New Order; past orders keep it'}</span>
              </span>
              <Toggle label={`${noun} active`} on={!!s.active} onChange={toggleActive} disabled={busy} />
            </div>
          </section>

          {/* Performance at a glance */}
          <dl className="grid grid-cols-2 gap-3">
            {[
              { icon: I.orders, label: 'Times ordered', value: stats ? String(stats.orders) : null },
              { icon: I.chart, label: 'Total revenue', value: stats ? formatPeso(stats.revenue_cents) : null },
            ].map((t) => (
              <div key={t.label} className={`${card} p-4`}>
                <dt className="flex items-center gap-2 text-xs font-medium text-slate-500"><Icon className="h-4 w-4 text-blue-600">{t.icon}</Icon>{t.label}</dt>
                <dd className="mt-1 truncate text-xl font-bold tabular-nums text-slate-900">
                  {t.value ?? <span className="block h-7 w-16 animate-pulse rounded bg-slate-100" />}
                </dd>
              </div>
            ))}
          </dl>

          {!s.is_addon && <Includes parent={s} all={all} inclusions={inclusions} maxKg={maxKgOf(s, defaultMaxKg)} onOpen={onOpen} />}

          {partOf.length > 0 && (
            <Block title="Included in" aside={<span className="text-xs tabular-nums text-slate-400">{partOf.length}</span>}>
              <ul className={`${card} divide-y divide-slate-100 overflow-hidden`}>
                {partOf.map((p) => {
                  const qty = inclusions.find((i) => i.service_id === p.id && i.included_id === s.id)?.quantity
                  return <ItemRow key={p.id} s={p} onOpen={onOpen} right={s.is_addon && qty ? <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold tabular-nums text-blue-700">{qty}× free</span> : undefined} />
                })}
              </ul>
            </Block>
          )}
        </div>

        <div className="min-w-0 space-y-5">
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
                      <Link to={`/orders/${o.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 active:bg-slate-50">
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

          {loaded && (
            deletable ? (
              <button type="button" onClick={remove} disabled={busy} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-red-100 bg-white font-semibold text-red-600 active:bg-red-50 disabled:opacity-50">
                <Icon className="h-5 w-5">{I.trash}</Icon>Delete {noun.toLowerCase()}
              </button>
            ) : (
              <p className="flex items-start gap-2 px-1 text-xs text-slate-500">
                <Icon className="mt-px h-4 w-4 shrink-0 text-slate-400">{I.info}</Icon>
                Used in past orders, so it can't be deleted. Turn it off above to stop offering it.
              </p>
            )
          )}
        </div>
      </div>

      {/* Primary action in thumb reach */}
      <div className="sticky bottom-0 z-20 -mx-4 -mb-4 border-t border-slate-200/70 bg-white/95 px-4 pb-4 pt-3 shadow-[0_-4px_20px_rgba(15,23,42,0.06)] backdrop-blur md:bottom-4 md:mx-0 md:mb-0 md:rounded-2xl md:border md:pb-3">
        {error && <p role="alert" className="mb-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">{error}</p>}
        <button type="button" onClick={onEdit} disabled={busy} className={`${primary} min-h-12 w-full text-base md:ml-auto md:flex md:w-auto md:px-10`}>
          <Icon className="h-5 w-5">{I.pencil}</Icon>Edit {noun.toLowerCase()}
        </button>
      </div>
    </div>
  )
}

// ---------- page ----------

export default function Services() {
  const [rows, setRows] = useState<Service[] | null>(null)
  const [inclusions, setInclusions] = useState<Inclusion[]>([])
  const [defaultMaxKg, setDefaultMaxKg] = useState<number | null>(null)
  const [view, setView] = useState<View>({ kind: 'list' })
  const [text, setText] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [byPrice, setByPrice] = useState(false)

  const load = useCallback(async () => {
    const [s, inc] = await Promise.all([listServices(), listInclusions()])
    setRows(s)
    setInclusions(inc)
  }, [])
  useEffect(() => {
    load()
    getSettings().then((s) => setDefaultMaxKg(parseMaxKg(s.load_max_kg)))
  }, [load])
  // <main> is the shared scroll container; open each view at the top.
  const viewKey = view.kind === 'detail' ? `detail-${view.id}` : view.kind
  useEffect(() => { document.querySelector('main')?.scrollTo(0, 0) }, [viewKey])

  const all = rows ?? []
  const subtitle = (s: Service) => {
    if (s.description) return s.description
    const names = inclusions.filter((i) => i.service_id === s.id).flatMap((i) => all.find((x) => x.id === i.included_id)?.name ?? [])
    return names.length ? `Includes ${names.join(', ')}` : TYPE_LABEL[s.pricing_type]
  }

  if (view.kind === 'form') {
    return (
      <div className="mx-auto max-w-5xl pb-4">
        <ServiceForm
          key={view.form.id ?? 'new'}
          initial={view.form}
          all={all}
          defaultMaxKg={defaultMaxKg}
          onCancel={() => setView(view.back)}
          onSaved={async (id) => { await load(); setView({ kind: 'detail', id }) }}
        />
      </div>
    )
  }

  if (view.kind === 'detail') {
    const s = rows?.find((x) => x.id === view.id)
    if (!s) return null
    return (
      <div className="mx-auto max-w-5xl pb-4">
        <ServiceDetail
          key={s.id}
          s={s}
          all={all}
          inclusions={inclusions}
          defaultMaxKg={defaultMaxKg}
          onBack={() => setView({ kind: 'list' })}
          onEdit={() => setView({ kind: 'form', form: toForm(s, inclusions), back: view })}
          onOpen={(id) => setView({ kind: 'detail', id })}
          onChanged={load}
          onDeleted={async () => { await load(); setView({ kind: 'list' }) }}
        />
      </div>
    )
  }

  const q = text.trim().toLowerCase()
  const list = all
    .filter((s) => (filter === 'all' ? true : filter === 'inactive' ? !s.active : kindOf(s) === filter))
    .filter((s) => !q || `${s.name} ${s.description}`.toLowerCase().includes(q))
  if (byPrice) list.sort((a, b) => b.price_cents - a.price_cents)

  // Tab counts follow the search, so they say what each tab will show.
  const searched = all.filter((s) => !q || `${s.name} ${s.description}`.toLowerCase().includes(q))
  const count = (f: Filter) => searched.filter((s) => (f === 'all' ? true : f === 'inactive' ? !s.active : kindOf(s) === f)).length
  // "All" is split into Services / Packages / Add-ons so the long list scans by type.
  const groups = filter === 'all'
    ? (['service', 'package', 'addon'] as Kind[]).map((k) => ({ k, items: list.filter((s) => kindOf(s) === k) })).filter((g) => g.items.length)
    : [{ k: null, items: list }]
  const addKind: Kind = filter === 'package' || filter === 'addon' ? filter : 'service'
  const card_ = (s: Service) => <li key={s.id}><ServiceCard s={s} subtitle={subtitle(s)} onOpen={() => setView({ kind: 'detail', id: s.id })} /></li>

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-28">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Services</h1>
          <p className="mt-1 text-sm text-slate-500">Services, packages, add-ons and their prices.</p>
        </div>
      </div>

      <SearchRow
        value={text}
        onChange={setText}
        label="Search services"
        placeholder="Search service…"
        toggled={byPrice}
        onToggle={() => setByPrice((v) => !v)}
        toggleLabel={byPrice ? 'Sorted by price; sort by name' : 'Sorted by name; sort by price'}
      />
      <FilterTabs
        options={FILTERS.map((f) => ({ ...f, label: rows ? `${f.label} ${count(f.id)}` : f.label }))}
        value={filter}
        onChange={setFilter}
        label="Filter services"
      />
      {byPrice && <p className="-mt-2 text-xs text-slate-500">Sorted by price, highest first</p>}

      {rows === null ? (
        <div className="grid gap-3 lg:grid-cols-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-200/60" />)}</div>
      ) : list.length === 0 ? (
        <div className={card}>
          {rows.length === 0
            ? <EmptyCard icon={I.shirt} title="No services yet" text="Add your first service to start taking orders." />
            : <EmptyCard icon={I.search} title="No services found" text="Try a different search or filter." />}
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.k ?? 'list'} aria-label={g.k ? `${KIND_LABEL[g.k]}s` : undefined}>
              {g.k && (
                <h2 className="mb-2 flex items-baseline justify-between px-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{g.k === 'addon' ? 'Add-ons' : `${KIND_LABEL[g.k]}s`}</span>
                  <span className="text-xs tabular-nums text-slate-400">{g.items.length}</span>
                </h2>
              )}
              <ul className="grid gap-2.5 lg:grid-cols-2">{g.items.map(card_)}</ul>
            </section>
          ))}
        </div>
      )}

      {/* Extended FAB: says what it adds, following the selected tab. */}
      <button
        type="button"
        onClick={() => setView({ kind: 'form', form: { ...blank, kind: addKind, pricingType: KIND_TYPE[addKind] }, back: { kind: 'list' } })}
        className={`${fabPos} inline-flex h-14 items-center gap-2 rounded-full bg-blue-600 pl-4 pr-5 font-semibold text-white shadow-lg shadow-blue-600/30 transition active:scale-95 active:bg-blue-700`}
      >
        <Icon className="h-6 w-6">{I.plus}</Icon>Add {KIND_LABEL[addKind].toLowerCase()}
      </button>
    </div>
  )
}
