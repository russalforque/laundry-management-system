import { useEffect, useState } from 'react'
import { Toggle } from '../../components/Controls'
import { I, Icon } from '../../components/Icons'
import { BackHeader, card, EmptyCard, FilterTabs, primary, SearchRow } from '../../components/Manage'
import { Block, Includes, ItemRow, RecentServiceOrders, ServiceFormSections, ServiceTile } from '../../components/services/ServiceParts'
import { fabPos } from '../../components/ui'
import {
  KIND_LABEL, newServiceForm, SERVICE_FILTERS as FILTERS, toServiceForm, useServiceCatalog, useServiceDetail, useServiceForm,
  type ServiceFormValues,
} from '../../hooks/useServices'
import { formatPeso, formatPesoShort } from '../../lib/money'
import { maxKgOf, TYPE_UNIT } from '../../lib/pricing'
import type { Inclusion, Service } from '../../types'

type View = { kind: 'list' } | { kind: 'form'; form: ServiceFormValues; back: View } | { kind: 'detail'; id: number }

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

function ServiceForm({ initial, all, defaultMaxKg, onSaved, onCancel }: {
  initial: ServiceFormValues; all: Service[]; defaultMaxKg: number | null; onSaved: (id: number) => void; onCancel: () => void
}) {
  const sf = useServiceForm(initial, all, onSaved, onCancel)
  return (
    <form onSubmit={sf.save} className="space-y-4">
      <BackHeader title={sf.editing ? `Edit ${sf.noun}` : `Add ${sf.noun}`} onBack={sf.cancel} />
      <ServiceFormSections sf={sf} defaultMaxKg={defaultMaxKg} />

      {/* Pinned above the bottom nav so Save stays in thumb reach on a long form. */}
      <div className="sticky bottom-0 z-20 -mx-4 -mb-4 border-t border-slate-200/70 bg-white/95 px-4 pb-4 pt-3 shadow-[0_-4px_20px_rgba(15,23,42,0.06)] backdrop-blur">
        {sf.error && <p role="alert" className="mb-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">{sf.error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={sf.cancel} className="min-h-12 flex-1 rounded-xl bg-slate-100 font-semibold text-slate-700 active:bg-slate-200">Cancel</button>
          <button disabled={sf.busy} className={`${primary} min-h-12 flex-2 text-base`}>
            {sf.busy ? 'Saving…' : `Save ${sf.noun.toLowerCase()}`}
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
  const { stats, recent, error, busy, loaded, noun, partOf, deletable, toggleActive, remove } = useServiceDetail(s, all, inclusions, onChanged, onDeleted)

  return (
    <div className="space-y-5">
      <BackHeader title={`${noun} details`} onBack={onBack} />

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

      <RecentServiceOrders recent={recent} />

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

      {/* Primary action in thumb reach */}
      <div className="sticky bottom-0 z-20 -mx-4 -mb-4 border-t border-slate-200/70 bg-white/95 px-4 pb-4 pt-3 shadow-[0_-4px_20px_rgba(15,23,42,0.06)] backdrop-blur">
        {error && <p role="alert" className="mb-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">{error}</p>}
        <button type="button" onClick={onEdit} disabled={busy} className={`${primary} min-h-12 w-full text-base`}>
          <Icon className="h-5 w-5">{I.pencil}</Icon>Edit {noun.toLowerCase()}
        </button>
      </div>
    </div>
  )
}

/** Phone Services: search, type tabs and item cards; details and the form each open on their own screen. */
export default function MobileServices() {
  const c = useServiceCatalog()
  const { rows, all, inclusions, defaultMaxKg, load, subtitle, text, setText, filter, setFilter, byPrice, setByPrice, list, count, groups, addKind } = c
  const [view, setView] = useState<View>({ kind: 'list' })

  // <main> is the shared scroll container; open each view at the top.
  const viewKey = view.kind === 'detail' ? `detail-${view.id}` : view.kind
  useEffect(() => { document.querySelector('main')?.scrollTo(0, 0) }, [viewKey])

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
          onEdit={() => setView({ kind: 'form', form: toServiceForm(s, inclusions), back: view })}
          onOpen={(id) => setView({ kind: 'detail', id })}
          onChanged={load}
          onDeleted={async () => { await load(); setView({ kind: 'list' }) }}
        />
      </div>
    )
  }

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
        <div className="grid gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-200/60" />)}</div>
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
              <ul className="grid gap-2.5">{g.items.map(card_)}</ul>
            </section>
          ))}
        </div>
      )}

      {/* Extended FAB: says what it adds, following the selected tab. */}
      <button
        type="button"
        onClick={() => setView({ kind: 'form', form: newServiceForm(addKind), back: { kind: 'list' } })}
        className={`${fabPos} inline-flex h-14 items-center gap-2 rounded-full bg-blue-600 pl-4 pr-5 font-semibold text-white shadow-lg shadow-blue-600/30 transition active:scale-95 active:bg-blue-700`}
      >
        <Icon className="h-6 w-6">{I.plus}</Icon>Add {KIND_LABEL[addKind].toLowerCase()}
      </button>
    </div>
  )
}
