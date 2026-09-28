import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  createService, deleteService, listInclusions, listServices, serviceRecentOrders, serviceStats, setServiceActive, updateService,
  type ServiceOrder, type ServiceStats,
} from '../db/services'
import { getSettings } from '../db/settings'
import { fileToThumbnail } from '../lib/image'
import { centsToInput, parsePesoToCents } from '../lib/money'
import { canInclude, kindOf, parseMaxKg, TYPE_LABEL } from '../lib/pricing'
import type { Inclusion, PricingType, Service } from '../types'

/**
 * Services, packages and add-ons: the catalog with its search / filter / sort, the add-edit form and one
 * item's details. Shared by pages/mobile/MobileServices.tsx and pages/desktop-tablet/Services.tsx.
 */

export type ServiceKind = 'service' | 'package' | 'addon'
export type ServiceFilter = 'all' | ServiceKind | 'inactive'

export interface ServiceFormValues {
  id?: number
  name: string
  description: string
  kind: ServiceKind
  pricingType: PricingType
  price: string
  active: boolean
  image: string | null
  /** Blank = use the Settings value. */
  maxKg: string
  /** Included item id → quantity per load/unit. */
  includes: Record<number, number>
}

export const KIND_LABEL: Record<ServiceKind, string> = { service: 'Service', package: 'Package', addon: 'Add-on' }
export const KIND_HINT: Record<ServiceKind, string> = {
  service: 'A laundry service such as Wash, Dry, Fold or Comforter. Can include add-ons.',
  package: 'A bundle such as Wash + Dry + Fold, priced as one. Can include services and add-ons at no extra charge.',
  addon: 'Detergent, fabric conditioner… listed under Add-ons on New Order.',
}
/** Sensible unit when switching kind; staff can still pick any. */
export const KIND_TYPE: Record<ServiceKind, PricingType> = { service: 'per_load', package: 'per_load', addon: 'per_quantity' }

export const SERVICE_FILTERS: { id: ServiceFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'service', label: 'Services' },
  { id: 'package', label: 'Packages' },
  { id: 'addon', label: 'Add-ons' },
  { id: 'inactive', label: 'Inactive' },
]

export const blankService: ServiceFormValues = { name: '', description: '', kind: 'service', pricingType: 'per_load', price: '', active: true, image: null, maxKg: '', includes: {} }
export const newServiceForm = (kind: ServiceKind): ServiceFormValues => ({ ...blankService, kind, pricingType: KIND_TYPE[kind] })
export const toServiceForm = (s: Service, inc: Inclusion[]): ServiceFormValues => ({
  id: s.id, name: s.name, description: s.description, kind: kindOf(s), pricingType: s.pricing_type, price: centsToInput(s.price_cents),
  active: !!s.active, image: s.image, maxKg: s.max_kg == null ? '' : String(s.max_kg),
  includes: Object.fromEntries(inc.filter((i) => i.service_id === s.id).map((i) => [i.included_id, i.quantity])),
})
const asFlags = (k: ServiceKind) => ({ is_addon: k === 'addon' ? 1 : 0, is_package: k === 'package' ? 1 : 0 })
export const usesLoads = (t: PricingType) => t === 'per_load' || t === 'per_kg'

/** The catalog: every item with its inclusions, and the searched / filtered / sorted list. */
export function useServiceCatalog() {
  const [rows, setRows] = useState<Service[] | null>(null)
  const [inclusions, setInclusions] = useState<Inclusion[]>([])
  const [defaultMaxKg, setDefaultMaxKg] = useState<number | null>(null)
  const [text, setText] = useState('')
  const [filter, setFilter] = useState<ServiceFilter>('all')
  const [byPrice, setByPrice] = useState(false)

  const load = useCallback(async () => {
    const [s, inc] = await Promise.all([listServices(), listInclusions()])
    setRows(s)
    setInclusions(inc)
  }, [])
  useEffect(() => {
    load()
    getSettings().then((s) => setDefaultMaxKg(parseMaxKg(s.load_max_kg))).catch(console.error)
  }, [load])

  const all = rows ?? []
  const subtitle = (s: Service) => {
    if (s.description) return s.description
    const names = inclusions.filter((i) => i.service_id === s.id).flatMap((i) => all.find((x) => x.id === i.included_id)?.name ?? [])
    return names.length ? `Includes ${names.join(', ')}` : TYPE_LABEL[s.pricing_type]
  }

  const q = text.trim().toLowerCase()
  const matches = (s: Service, f: ServiceFilter) => (f === 'all' ? true : f === 'inactive' ? !s.active : kindOf(s) === f)
  const searched = all.filter((s) => !q || `${s.name} ${s.description}`.toLowerCase().includes(q))
  const list = searched.filter((s) => matches(s, filter))
  if (byPrice) list.sort((a, b) => b.price_cents - a.price_cents)

  return {
    rows, all, inclusions, defaultMaxKg, load, subtitle,
    text, setText, filter, setFilter, byPrice, setByPrice, list,
    /** Tab counts follow the search, so they say what each tab will show. */
    count: (f: ServiceFilter) => searched.filter((s) => matches(s, f)).length,
    /** "All" is split into Services / Packages / Add-ons so the long list scans by type. */
    groups: filter === 'all'
      ? (['service', 'package', 'addon'] as ServiceKind[]).map((k) => ({ k: k as ServiceKind | null, items: list.filter((s) => kindOf(s) === k) })).filter((g) => g.items.length)
      : [{ k: null as ServiceKind | null, items: list }],
    /** What Add creates, following the selected tab. */
    addKind: (filter === 'package' || filter === 'addon' ? filter : 'service') as ServiceKind,
  }
}

/** Add / edit form: fields, kind switching (drops inclusions the new kind can't hold), photo, validation and save. */
export function useServiceForm(initial: ServiceFormValues, all: Service[], onSaved: (id: number) => void, onCancel: () => void) {
  const [form, setForm] = useState(initial)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const saving = useRef(false) // blocks a double tap saving twice
  const set = <K extends keyof ServiceFormValues>(k: K, v: ServiceFormValues[K]) => setForm((f) => ({ ...f, [k]: v }))
  const self = asFlags(form.kind)
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)

  function setKind(kind: ServiceKind) {
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
    if (saving.current) return
    saving.current = true
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
      saving.current = false
      setBusy(false)
    }
  }

  return {
    form, set, setKind, pickImage, save, error, busy, dirty,
    editing: !!form.id,
    noun: KIND_LABEL[form.kind],
    eligible: all.filter((s) => s.id !== form.id && canInclude(self, s)),
    perWord: form.pricingType === 'per_item' ? 'item' : form.pricingType === 'per_quantity' ? 'piece' : form.pricingType === 'fixed' ? 'order' : 'load',
    cancel: () => { if (!dirty || window.confirm('Discard your unsaved changes?')) onCancel() },
  }
}
export type ServiceFormCtl = ReturnType<typeof useServiceForm>

/** One item's figures and recent orders, turning it on / off, and deleting it (only when never used). */
export function useServiceDetail(s: Service, all: Service[], inclusions: Inclusion[], onChanged: () => Promise<unknown>, onDeleted: () => Promise<unknown>) {
  const [stats, setStats] = useState<ServiceStats | null>(null)
  const [recent, setRecent] = useState<ServiceOrder[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

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

  const loaded = stats !== null && recent !== null
  return {
    stats, recent, error, busy, loaded,
    noun: KIND_LABEL[kindOf(s)],
    /** Packages and services that include this item. */
    partOf: all.filter((p) => inclusions.some((i) => i.included_id === s.id && i.service_id === p.id) && canInclude(p, s)),
    // Only never-used items can be deleted; the page says why otherwise instead of hiding the option silently.
    deletable: loaded && stats.orders === 0 && recent.length === 0,
    toggleActive: () => {
      if (s.active && !window.confirm(`Deactivate ${s.name}? It won't be available for new orders.`)) return
      act(async () => { await setServiceActive(s.id, !s.active); await onChanged() })
    },
    remove: () => {
      if (!window.confirm(`Delete ${s.name}? This cannot be undone.`)) return
      act(async () => { await deleteService(s.id); await onDeleted() })
    },
  }
}
