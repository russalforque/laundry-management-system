import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Avatar } from '../../components/Avatar'
import { ActiveBadge, EditCustomerSheet } from '../../components/customers/CustomerForm'
import { ActionBar, bigPrimary, bigSecondary, column, fullBleed, Notice, quietBtn, Section, StateMessage } from '../../components/desktop-tablet/orderParts'
import { Owed, StatusPill } from '../../components/desktop-tablet/ui'
import { I, Icon } from '../../components/Icons'
import { when } from '../../components/OrderCard'
import type { CustomerInput } from '../../db/customers'
import type { OrderListRow } from '../../db/orderQueries'
import { lastVisit, ORDER_FILTER_EMPTY, sinceDate, useCustomerDetail, type OrderFilter } from '../../hooks/useCustomerDetail'
import { useNavAccess } from '../../layouts/navigation'
import { formatPeso, formatPesoShort } from '../../lib/money'

/**
 * A customer on tablets (landscape first) and desktops (/customers/:id): one column that answers what the counter asks,
 * in that order: who is this and how do I reach them · is anything of theirs ready, do they owe anything · what have
 * they brought before. New Order is the one primary action, pinned to the bottom. Deleting sits apart at the end.
 * Same data and actions as the phone page (hooks/useCustomerDetail.ts).
 */
export default function CustomerDetails() {
  const c = useCustomerDetail(Number(useParams().id))
  const { customer, stats, orders, load, loadError, error, walkIn, canDelete, setEditing, filter, setFilter, filtered } = c
  const { can } = useNavAccess()
  const back = (
    <button type="button" onClick={c.goBack} className="-ml-3 inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-[15px] font-semibold text-slate-600 hover:bg-slate-200/60 active:bg-slate-200">
      <Icon className="h-5 w-5">{I.back}</Icon>Customers
    </button>
  )

  if (!customer) {
    return (
      <div className={`${column} space-y-4`}>
        {back}
        <div className="rounded-2xl bg-white">
          {customer === null ? (
            <StateMessage icon={I.user} title="Customer not found" text="They may have been deleted, or the link is wrong. Search for them in the customer list." action={<Link to="/customers" className={bigSecondary}>Back to customers</Link>} />
          ) : loadError ? (
            <StateMessage icon={I.info} title="Couldn't load this customer" text={loadError} action={<button type="button" onClick={load} className={bigPrimary}><Icon className="h-5 w-5">{I.refresh}</Icon>Try again</button>} />
          ) : (
            <div className="space-y-5 p-6 motion-safe:animate-pulse" aria-busy="true" aria-label="Loading customer">
              <div className="flex items-center gap-4"><div className="size-16 rounded-full bg-slate-200" /><div className="h-8 w-64 rounded-lg bg-slate-200" /></div>
              <div className="h-20 rounded-xl bg-slate-100" />
              <div className="h-48 rounded-xl bg-slate-100" />
            </div>
          )}
        </div>
      </div>
    )
  }

  const { active, phone, readyCount, owed, unpaidCount } = c
  const canEdit = !walkIn && can('customers.manage')
  const canOrder = !walkIn && can('orders.manage')
  const edit = () => setEditing(true)
  const save = async (v: CustomerInput) => { await c.save(v) }
  const first = customer.full_name.split(/\s+/)[0]

  return (
    <div className={fullBleed}>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-10 pt-5">
        <div className={column}>
          {back}

          {/* ── Who ───────────────────────────────────────────── */}
          <header className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-4">
            <Avatar name={customer.full_name} className="size-16 text-xl" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="truncate text-3xl font-bold tracking-tight text-slate-900">{customer.full_name}</h1>
                {!walkIn && <ActiveBadge active={active} />}
              </div>
              <p className="mt-0.5 text-[15px] text-slate-500">
                <span className="font-medium tabular-nums text-slate-600">{customer.customer_code}</span> · Customer since {sinceDate(customer.created_at)}
                {walkIn && ' · Past walk-in orders'}
              </p>
            </div>
            {canEdit && <button type="button" onClick={edit} className={`${bigSecondary} min-h-12 px-5`}><Icon className="h-5 w-5">{I.pencil}</Icon>Edit</button>}
          </header>

          {/* ── What needs attention: laundry waiting, money owed. Each filters the history. ── */}
          {(readyCount > 0 || owed > 0 || error) && (
            <div className="mt-5 space-y-3">
              {error && <Notice tone="error">{error}</Notice>}
              {readyCount > 0 && (
                <AttentionButton tone="ready" icon={I.bag} onClick={() => setFilter('open')}>
                  <b>{readyCount} order{readyCount === 1 ? '' : 's'} ready for pickup</b> — tap to see {readyCount === 1 ? 'it' : 'them'}
                </AttentionButton>
              )}
              {owed > 0 && (
                <AttentionButton tone="owed" icon={I.wallet} onClick={() => setFilter('unpaid')}>
                  <b className="tabular-nums">{formatPeso(owed)} balance due</b> on {unpaidCount} order{unpaidCount === 1 ? '' : 's'} — tap to see {unpaidCount === 1 ? 'it' : 'them'}
                </AttentionButton>
              )}
            </div>
          )}

          <div className="mt-5 rounded-2xl bg-white px-7 py-6 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
            {/* At a glance */}
            {stats && (
              <dl className="grid grid-cols-4 gap-6 pb-6">
                <Figure label="Orders" value={String(stats.total_orders)} />
                <Figure label="Total billed" value={formatPesoShort(stats.total_spent_cents)} />
                <Figure label="Balance due" value={owed ? formatPeso(owed) : '—'} tone={owed ? 'text-amber-700' : 'text-slate-900'} />
                <Figure label="Last order" value={lastVisit(stats.last_order_at)} />
              </dl>
            )}

            {!walkIn && (
              <Section title="Contact & care">
                <div className="space-y-4">
                  <ContactRow
                    icon={I.phone}
                    label="Mobile"
                    value={customer.contact}
                    empty="No phone number"
                    onAdd={canEdit ? edit : undefined}
                    actions={phone && (
                      <>
                        <a href={`tel:${phone}`} className={quietBtn}><Icon className="h-4 w-4">{I.phone}</Icon>Call</a>
                        <a href={`sms:${phone}`} className={quietBtn}><Icon className="h-4 w-4">{I.message}</Icon>Text</a>
                      </>
                    )}
                  />
                  <ContactRow
                    icon={I.pin}
                    label="Address"
                    value={customer.address}
                    empty="No address saved"
                    onAdd={canEdit ? edit : undefined}
                    actions={<a href={`geo:0,0?q=${encodeURIComponent(customer.address)}`} className={quietBtn}><Icon className="h-4 w-4">{I.pin}</Icon>Map</a>}
                  />
                  <ContactRow
                    icon={I.note}
                    label="Care notes"
                    value={customer.notes}
                    empty='None yet — e.g. "No fabric softener"'
                    tone={customer.notes ? 'bg-amber-50 text-amber-600' : undefined}
                    onAdd={canEdit ? edit : undefined}
                    actions={canEdit && <button type="button" onClick={edit} className={quietBtn}>Edit</button>}
                  />
                </div>
              </Section>
            )}

            <Section title="Order history">
              {orders.length > 0 && (
                <div role="tablist" aria-label="Filter orders" className="mb-2 flex gap-1 border-b border-slate-200">
                  {c.filters.map((f) => <HistoryTab key={f.id} id={f.id} label={f.label} count={f.count} active={filter === f.id} onClick={setFilter} />)}
                </div>
              )}
              {filtered.length === 0 ? (
                <p className="px-2 py-8 text-center text-[15px] text-slate-500">{ORDER_FILTER_EMPTY[filter]}</p>
              ) : (
                <ul className="-mx-3 divide-y divide-slate-100">
                  {filtered.map((o) => <HistoryRow key={o.id} o={o} />)}
                </ul>
              )}
            </Section>
          </div>

          {/* ── Destructive, rare: apart, and only offered when it can succeed ── */}
          {canEdit && (
            <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 pt-6">
              <p className="min-w-0 text-sm text-slate-500">
                {canDelete ? 'This customer has no orders, so they can be deleted. Needs an admin PIN.' : 'Customers with orders are kept for your records and can’t be deleted.'}
              </p>
              {canDelete && (
                <button type="button" onClick={c.remove} className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-xl border border-red-200 bg-white px-5 font-semibold text-red-600 hover:bg-red-50">
                  <Icon className="h-5 w-5">{I.trash}</Icon>Delete customer
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── The one primary action ─────────────────────────── */}
      {canOrder && (
        <ActionBar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-semibold text-slate-900">{customer.full_name}</p>
            <p className="truncate text-sm text-slate-500">
              {owed > 0 ? <span className="font-semibold text-amber-700">{formatPeso(owed)} balance due from earlier orders</span> : customer.contact || 'No phone number'}
            </p>
          </div>
          <Link to={`/orders/new?customer=${customer.id}`} className={`${bigPrimary} w-80 shrink-0 text-lg`}>
            <Icon className="h-6 w-6">{I.plus}</Icon>New Order for {first}
          </Link>
        </ActionBar>
      )}

      {c.editing && <EditCustomerSheet customer={customer} onSave={save} onClose={() => setEditing(false)} />}
      {c.pinSheet}
    </div>
  )
}

function Figure({ label, value, tone = 'text-slate-900' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className={`mt-0.5 truncate text-2xl font-bold tabular-nums ${tone}`}>{value}</dd>
    </div>
  )
}

function AttentionButton({ tone, icon, onClick, children }: { tone: 'ready' | 'owed'; icon: ReactNode; onClick: () => void; children: ReactNode }) {
  const cls = tone === 'ready' ? 'bg-violet-50 text-violet-900 ring-violet-200 hover:bg-violet-100' : 'bg-amber-50 text-amber-900 ring-amber-200 hover:bg-amber-100'
  return (
    <button type="button" onClick={onClick} className={`flex min-h-14 w-full items-center gap-3 rounded-xl px-4 text-left text-[15px] ring-1 ${cls}`}>
      <Icon className="h-6 w-6 shrink-0">{icon}</Icon>
      <span className="min-w-0 flex-1">{children}</span>
      <Icon className="h-5 w-5 shrink-0 opacity-60">{I.chevron}</Icon>
    </button>
  )
}

function ContactRow({ icon, label, value, empty, actions, onAdd, tone }: {
  icon: ReactNode; label: string; value: string; empty: string; actions?: ReactNode; onAdd?: () => void; tone?: string
}) {
  return (
    <div className="flex items-start gap-4">
      <span className={`mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl ${tone ?? 'bg-slate-100 text-slate-500'}`}><Icon className="h-5 w-5">{icon}</Icon></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-slate-500">{label}</p>
        <p className={`whitespace-pre-line wrap-break-word text-base ${value ? 'text-slate-900' : 'text-slate-400'}`}>{value || empty}</p>
      </div>
      <div className="-mr-3 flex shrink-0 items-center gap-1">
        {value ? actions : onAdd && <button type="button" onClick={onAdd} className={quietBtn}><Icon className="h-4 w-4">{I.plus}</Icon>Add</button>}
      </div>
    </div>
  )
}

function HistoryTab({ id, label, count, active, onClick }: { id: OrderFilter; label: string; count: number; active: boolean; onClick: (id: OrderFilter) => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={() => onClick(id)}
      className={`-mb-px inline-flex min-h-12 items-center gap-2 border-b-[3px] px-4 text-[15px] transition-colors ${
        active ? 'border-blue-600 font-semibold text-blue-700' : 'border-transparent font-medium text-slate-600 hover:text-slate-900'
      }`}
    >
      {label}
      <span className={`min-w-6 rounded-full px-1.5 py-0.5 text-center text-xs font-semibold tabular-nums ${active ? 'bg-blue-600 text-white' : 'bg-slate-200/70 text-slate-600'}`}>{count}</span>
    </button>
  )
}

/** One past or open order: number and when · status and items · total and what's owed. Opens the order. */
function HistoryRow({ o }: { o: OrderListRow }) {
  const cancelled = o.status === 'cancelled'
  return (
    <li>
      <Link to={`/orders/${o.id}`} className="grid min-h-18 grid-cols-[9rem_minmax(0,1fr)_8rem_1.25rem] items-center gap-x-4 rounded-xl px-3 py-3 hover:bg-slate-50 active:bg-slate-100">
        <span className="min-w-0">
          <span className="block font-semibold tabular-nums text-slate-900">#{o.order_number}</span>
          <span className="block truncate text-sm tabular-nums text-slate-500">{when(o.received_at)}</span>
        </span>
        <span className="min-w-0">
          <StatusPill status={o.status} />
          <span className="mt-1 block truncate text-sm text-slate-500">{o.items || 'No items'}</span>
        </span>
        <span className="flex flex-col items-end gap-1">
          <span className={`text-base font-bold tabular-nums ${cancelled ? 'text-slate-400' : 'text-slate-900'}`}>{formatPeso(o.total_cents)}</span>
          <Owed status={o.status} pay={o.payment_status} balance={o.balance_cents} />
        </span>
        <Icon className="h-5 w-5 text-slate-300">{I.chevron}</Icon>
      </Link>
    </li>
  )
}
