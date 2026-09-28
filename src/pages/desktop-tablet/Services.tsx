import { useState, type KeyboardEvent, type ReactNode } from 'react'
import { Select, Toggle } from '../../components/Controls'
import {
  btnDanger, btnPrimary, btnSecondary, Drawer, EmptyState, PageHeader, panelCls, SearchField, SegmentedTabs, SidePanel, useSplit,
} from '../../components/desktop-tablet/ui'
import { I, Icon } from '../../components/Icons'
import { card } from '../../components/Manage'
import { Block, Includes, ItemRow, RecentServiceOrders, ServiceFormSections, ServiceTile } from '../../components/services/ServiceParts'
import { fieldCls } from '../../components/ui'
import {
  newServiceForm, toServiceForm, useServiceCatalog, useServiceDetail, useServiceForm,
  type ServiceFormValues, type ServiceKind,
} from '../../hooks/useServices'
import { formatPeso, formatPesoShort } from '../../lib/money'
import { kindOf, maxKgOf, TYPE_UNIT } from '../../lib/pricing'
import type { Inclusion, Service } from '../../types'

type Panel = { kind: 'none' } | { kind: 'detail'; id: number } | { kind: 'form'; form: ServiceFormValues; back: Panel }

const unitText = (s: Service) => (s.pricing_type === 'fixed' ? 'flat' : TYPE_UNIT[s.pricing_type].replace('/', 'per '))

function DetailPanel({ s, all, inclusions, defaultMaxKg, onClose, onEdit, onOpen, onChanged, onDeleted }: {
  s: Service; all: Service[]; inclusions: Inclusion[]; defaultMaxKg: number | null
  onClose: () => void; onEdit: () => void; onOpen: (id: number) => void; onChanged: () => Promise<unknown>; onDeleted: () => Promise<unknown>
}) {
  const { stats, recent, error, busy, loaded, noun, partOf, deletable, toggleActive, remove } = useServiceDetail(s, all, inclusions, onChanged, onDeleted)
  return (
    <SidePanel
      title={`${noun} details`}
      onClose={onClose}
      closeLabel="Close details"
      footer={
        <div className="space-y-2">
          {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">{error}</p>}
          <div className="flex gap-2">
            {loaded && deletable && <button type="button" onClick={remove} disabled={busy} className={btnDanger}><Icon className="h-5 w-5">{I.trash}</Icon>Delete</button>}
            <button type="button" onClick={onEdit} disabled={busy} className={`${btnPrimary} flex-1`}><Icon className="h-5 w-5">{I.pencil}</Icon>Edit {noun.toLowerCase()}</button>
          </div>
        </div>
      }
    >
      <section className="flex items-start gap-4">
        <ServiceTile s={s} className={`size-20 rounded-2xl shadow-sm ${s.active ? '' : 'opacity-50 grayscale'}`} />
        <div className="min-w-0 flex-1">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
            <Icon className="h-3.5 w-3.5">{s.is_addon ? I.box : s.is_package ? I.layers : I.washer}</Icon>{noun}
          </span>
          <h3 className="mt-1 text-xl font-bold leading-tight tracking-tight text-slate-900 wrap-break-word">{s.name}</h3>
          {s.description && <p className="mt-0.5 text-sm text-slate-500">{s.description}</p>}
          <p className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tabular-nums tracking-tight text-slate-900">{formatPesoShort(s.price_cents)}</span>
            <span className="text-sm font-medium text-slate-500">{s.pricing_type === 'fixed' ? 'flat price' : unitText(s)}</span>
          </p>
        </div>
      </section>

      <div className={`${card} flex items-center gap-3 px-4 py-3`}>
        <span className={`size-2.5 shrink-0 rounded-full ${s.active ? 'bg-emerald-500' : 'bg-red-500'}`} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-slate-900">{s.active ? 'Active' : 'Inactive'}</span>
          <span className="block text-xs text-slate-500">{s.active ? 'Offered on New Order' : 'Hidden from New Order; past orders keep it'}</span>
        </span>
        <Toggle label={`${noun} active`} on={!!s.active} onChange={toggleActive} disabled={busy} />
      </div>

      <dl className="grid grid-cols-2 gap-3">
        {[
          { icon: I.orders, label: 'Times ordered', value: stats ? String(stats.orders) : null },
          { icon: I.chart, label: 'Total revenue', value: stats ? formatPeso(stats.revenue_cents) : null },
        ].map((t) => (
          <div key={t.label} className="rounded-xl bg-slate-50 p-3">
            <dt className="flex items-center gap-2 text-xs font-medium text-slate-500"><Icon className="h-4 w-4 text-blue-600">{t.icon}</Icon>{t.label}</dt>
            <dd className="mt-1 truncate text-lg font-bold tabular-nums text-slate-900">{t.value ?? <span className="block h-6 w-16 animate-pulse rounded bg-slate-200" />}</dd>
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

      <RecentServiceOrders recent={recent} />

      {loaded && !deletable && (
        <p className="flex items-start gap-2 px-1 text-xs text-slate-500">
          <Icon className="mt-px h-4 w-4 shrink-0 text-slate-400">{I.info}</Icon>
          Used in past orders, so it can't be deleted. Turn it off above to stop offering it.
        </p>
      )}
    </SidePanel>
  )
}

function FormPanel({ initial, all, defaultMaxKg, wide, onSaved, onCancel }: {
  initial: ServiceFormValues; all: Service[]; defaultMaxKg: number | null; wide: boolean; onSaved: (id: number) => void; onCancel: () => void
}) {
  const sf = useServiceForm(initial, all, onSaved, onCancel)
  return (
    <SidePanel
      title={sf.editing ? `Edit ${sf.noun}` : `Add ${sf.noun}`}
      onClose={sf.cancel}
      closeLabel="Cancel"
      onSubmit={sf.save}
      footer={
        <div className="space-y-2">
          {sf.error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">{sf.error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={sf.cancel} className={btnSecondary}>Cancel</button>
            <button disabled={sf.busy} className={`${btnPrimary} px-8`}>{sf.busy ? 'Saving…' : `Save ${sf.noun.toLowerCase()}`}</button>
          </div>
        </div>
      }
    >
      <ServiceFormSections sf={sf} defaultMaxKg={defaultMaxKg} columns={wide} />
    </SidePanel>
  )
}


type Tab = 'services' | 'addons'
type Availability = 'all' | 'active' | 'inactive'
const AVAILABILITY: { id: Availability; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Offered' },
  { id: 'inactive', label: 'Hidden' },
]

/**
 * Services on tablets and desktops. Two catalogs, kept apart because staff think of them apart: Services (with
 * packages) and Add-ons. Each row says its price, unit and whether it's offered on New Order. Landscape keeps the
 * picked item (or its form) in a panel beside the list; portrait opens it in a drawer. Same catalog, form and
 * rules as the phone page (hooks/useServices.ts).
 */
export default function Services() {
  const c = useServiceCatalog()
  const { rows, all, inclusions, defaultMaxKg, load, subtitle, text, setText, byPrice, setByPrice, list } = c
  const [tab, setTab] = useState<Tab>('services')
  const [availability, setAvailability] = useState<Availability>('all')
  const [panel, setPanel] = useState<Panel>({ kind: 'none' })
  const split = useSplit()

  const inTab = (s: Service, t: Tab) => (t === 'addons' ? !!s.is_addon : !s.is_addon)
  const shown = list.filter((s) => inTab(s, tab) && (availability === 'all' || (availability === 'active') === !!s.active))
  const groups: { title: string | null; items: Service[] }[] = tab === 'addons'
    ? [{ title: null, items: shown }]
    : (['service', 'package'] as ServiceKind[])
      .map((k) => ({ title: k === 'service' ? 'Services' : 'Packages', items: shown.filter((s) => kindOf(s) === k) }))
      .filter((g) => g.items.length)

  const open = (id: number) => setPanel({ kind: 'detail', id })
  const close = () => setPanel({ kind: 'none' })
  const add = (kind: ServiceKind) => setPanel({ kind: 'form', form: newServiceForm(kind), back: panel.kind === 'form' ? { kind: 'none' } : panel })
  const selected = panel.kind === 'detail' ? panel.id : panel.kind === 'form' ? panel.form.id : undefined
  const onRowKey = (e: KeyboardEvent, id: number) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(id) } }
  const switchTab = (t: Tab) => { setTab(t); if (panel.kind === 'detail') close() }
  /** Opening an item from another's details (Includes / Included in) also shows its catalog. */
  const openAny = (id: number) => { const t = rows?.find((x) => x.id === id); if (t) setTab(t.is_addon ? 'addons' : 'services'); open(id) }

  let side: ReactNode = null
  if (panel.kind === 'form') {
    side = (
      <FormPanel
        key={panel.form.id ?? `new-${panel.form.kind}`}
        initial={panel.form}
        all={all}
        defaultMaxKg={defaultMaxKg}
        wide={!split}
        onCancel={() => setPanel(panel.back)}
        onSaved={async (id) => { await load(); openAny(id) }}
      />
    )
  } else if (panel.kind === 'detail') {
    const s = rows?.find((x) => x.id === panel.id)
    if (s) {
      side = (
        <DetailPanel
          key={s.id}
          s={s}
          all={all}
          inclusions={inclusions}
          defaultMaxKg={defaultMaxKg}
          onClose={close}
          onEdit={() => setPanel({ kind: 'form', form: toServiceForm(s, inclusions), back: panel })}
          onOpen={openAny}
          onChanged={load}
          onDeleted={async () => { await load(); close() }}
        />
      )
    }
  }

  const addons = tab === 'addons'
  const count = (t: Tab) => (rows ? list.filter((s) => inTab(s, t)).length : null)
  const addLabel = addons ? 'Add add-on' : 'Add service'

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <PageHeader
        title="Services"
        sub="What customers can order, what it costs, and whether it's offered."
        actions={
          <>
            {!addons && <button type="button" onClick={() => add('package')} className={btnSecondary}><Icon className="h-5 w-5">{I.layers}</Icon>Add package</button>}
            {/* Steps back to secondary while an item or form is open, so the panel's action is the one primary. */}
            <button type="button" onClick={() => add(addons ? 'addon' : 'service')} className={side ? btnSecondary : btnPrimary}><Icon className="h-5 w-5">{I.plus}</Icon>{addLabel}</button>
          </>
        }
      />

      <div className="flex min-h-0 flex-1 gap-4">
        <section aria-label="Catalog" className={`${panelCls} flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden`}>
          <div className="space-y-2 border-b border-slate-100 p-3">
            <SegmentedTabs
              label="Catalog"
              value={tab}
              onChange={switchTab}
              options={[{ id: 'services', label: 'Services & packages', count: count('services') }, { id: 'addons', label: 'Add-ons', count: count('addons') }]}
            />
            <SearchField value={text} onChange={setText} label={addons ? 'Search add-ons' : 'Search services'} placeholder={addons ? 'Search add-ons' : 'Search services'} />
            <div className="flex gap-2">
              <SegmentedTabs label="Availability" options={AVAILABILITY} value={availability} onChange={setAvailability} className="min-w-0 flex-1" />
              <div className="w-44 shrink-0">
                <Select className={`${fieldCls} min-h-12 py-2.5`} aria-label="Sort" value={byPrice ? 'price' : 'name'} onChange={(e) => setByPrice(e.target.value === 'price')}>
                  <option value="name">Name A–Z</option>
                  <option value="price">Highest price</option>
                </Select>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {rows === null ? (
              <div className="space-y-2 p-3" aria-busy="true">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />)}</div>
            ) : shown.length === 0 ? (
              count(tab) ? (
                <EmptyState icon={I.search} title="Nothing matches" text="Try a different search or availability filter." />
              ) : (
                <EmptyState
                  icon={addons ? I.box : I.shirt}
                  title={addons ? 'No add-ons yet' : 'No services yet'}
                  text={addons ? 'Add detergent, fabric conditioner and other extras customers can add to an order.' : 'Add your first service to start taking orders.'}
                />
              )
            ) : (
              groups.map((g) => (
                <section key={g.title ?? 'addons'} aria-label={g.title ?? 'Add-ons'}>
                  {g.title && (
                    <h2 className="sticky top-0 z-10 border-b border-slate-100 bg-slate-50/95 px-4 py-2 text-xs font-semibold text-slate-600 backdrop-blur">
                      {g.title} <span className="font-normal text-slate-400">· {g.items.length}</span>
                    </h2>
                  )}
                  <ul>
                    {g.items.map((s) => {
                      const on = selected === s.id
                      return (
                        <li key={s.id}>
                          <button
                            type="button"
                            aria-current={on || undefined}
                            onClick={() => open(s.id)}
                            onKeyDown={(e) => onRowKey(e, s.id)}
                            className={`flex min-h-18 w-full items-center gap-3 border-b border-slate-100 px-4 py-2.5 text-left outline-none transition-colors focus-visible:bg-blue-50 ${
                              on ? 'bg-blue-50/80 shadow-[inset_3px_0_0_var(--color-blue-600)]' : 'hover:bg-slate-50 active:bg-slate-100'
                            }`}
                          >
                            <ServiceTile s={s} className={`size-12 rounded-xl ${s.active ? '' : 'opacity-50 grayscale'}`} />
                            <span className="min-w-0 flex-1">
                              <span className={`block truncate font-semibold ${s.active ? 'text-slate-900' : 'text-slate-500'}`}>{s.name}</span>
                              <span className="block truncate text-xs text-slate-500">{subtitle(s)}</span>
                            </span>
                            <span className="shrink-0 text-right">
                              <span className="block font-bold tabular-nums text-slate-900">{formatPesoShort(s.price_cents)}</span>
                              <span className="block text-xs text-slate-500">{unitText(s)}{s.max_kg != null ? ` · max ${s.max_kg} kg` : ''}</span>
                            </span>
                            <span className={`w-18 shrink-0 rounded-full py-1 text-center text-xs font-semibold ${s.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                              {s.active ? 'Offered' : 'Hidden'}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              ))
            )}
          </div>
        </section>

        {split ? (
          <aside aria-label="Details" className="flex min-h-0 w-104 shrink-0 flex-col xl:w-120">
            {side ?? (
              <div className={`${panelCls} flex flex-1 flex-col`}>
                <EmptyState
                  icon={addons ? I.box : I.shirt}
                  title={addons ? 'No add-on selected' : 'No service selected'}
                  text="Pick one to see its price, what it includes and how often it's ordered, or to change it."
                />
              </div>
            )}
          </aside>
        ) : side && (
          <Drawer label={panel.kind === 'form' ? 'Service form' : 'Service details'} onClose={panel.kind === 'form' ? () => setPanel(panel.back) : close}>{side}</Drawer>
        )}
      </div>
    </div>
  )
}
