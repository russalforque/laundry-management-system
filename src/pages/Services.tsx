import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { inputCls, primaryBtn, secondaryBtn } from '../components/ui'
import { createService, listServices, PRICING_LABEL, PRICING_UNIT, updateService } from '../db/services'
import { centsToInput, formatPeso, parsePesoToCents } from '../lib/money'
import type { PricingMethod, Service } from '../types'

interface Form {
  id?: number
  name: string
  description: string
  pricingMethod: PricingMethod
  price: string
  active: boolean
}

const blank: Form = { name: '', description: '', pricingMethod: 'per_kg', price: '', active: true }

export default function Services() {
  const [rows, setRows] = useState<Service[]>([])
  const [form, setForm] = useState<Form | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(() => listServices().then(setRows), [])
  useEffect(() => { load() }, [load])

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => f && { ...f, [k]: v })

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!form) return
    const priceCents = parsePesoToCents(form.price)
    if (priceCents === null) return setError('Enter a valid price (0 or more, up to 2 decimals).')
    try {
      const input = { ...form, priceCents }
      if (form.id) await updateService(form.id, input)
      else await createService(input)
      setForm(null); setError('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed.')
    }
  }

  function edit(s: Service) {
    setForm({ id: s.id, name: s.name, description: s.description, pricingMethod: s.pricing_method, price: centsToInput(s.price_cents), active: !!s.active })
    setError('')
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-slate-900">Services</h1>
        <button onClick={() => { setForm(blank); setError('') }} className={primaryBtn}>+ Add service</button>
      </div>

      {form && (
        <form onSubmit={save} className="mb-4 space-y-3 rounded-xl bg-white p-4 shadow-sm">
          <h2 className="font-semibold">{form.id ? 'Edit service' : 'New service'}</h2>
          <input className={inputCls} placeholder="Service name" value={form.name} onChange={(e) => set('name', e.target.value)} required autoFocus />
          <input className={inputCls} placeholder="Description (optional)" value={form.description} onChange={(e) => set('description', e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <select className={inputCls} value={form.pricingMethod} onChange={(e) => set('pricingMethod', e.target.value as PricingMethod)}>
              {Object.entries(PRICING_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input className={inputCls} placeholder="Price (₱)" inputMode="decimal" value={form.price} onChange={(e) => set('price', e.target.value)} required />
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-5 w-5" checked={form.active} onChange={(e) => set('active', e.target.checked)} /> Active (available for new orders)
          </label>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button className={`${primaryBtn} flex-1`}>Save</button>
            <button type="button" onClick={() => setForm(null)} className={`${secondaryBtn} flex-1`}>Cancel</button>
          </div>
        </form>
      )}

      <ul className="divide-y divide-slate-100 rounded-xl bg-white shadow-sm">
        {rows.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <div className="truncate font-medium">
                {s.name} {!s.active && <span className="text-xs text-slate-400">(inactive)</span>}
              </div>
              <div className="truncate text-sm text-slate-500">
                {formatPeso(s.price_cents)}{PRICING_UNIT[s.pricing_method]} · {PRICING_LABEL[s.pricing_method]}
                {s.description && ` · ${s.description}`}
              </div>
            </div>
            <button onClick={() => edit(s)} className="rounded-lg bg-slate-100 px-4 py-2 font-medium active:bg-slate-200">Edit</button>
          </li>
        ))}
        {rows.length === 0 && <li className="p-6 text-center text-slate-500">No services yet. Add your first service to start taking orders.</li>}
      </ul>
    </div>
  )
}
