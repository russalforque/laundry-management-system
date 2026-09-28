import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Avatar } from '../../components/Avatar'
import { Select } from '../../components/Controls'
import { AddCustomerSheet } from '../../components/customers/CustomerForm'
import { bigPrimary, bigSecondary, StateMessage } from '../../components/desktop-tablet/orderParts'
import { I, Icon } from '../../components/Icons'
import { isActiveCustomer, type CustomerActivity, type CustomerListRow, type CustomerSort } from '../../db/customers'
import { lastVisit } from '../../hooks/useCustomerDetail'
import { CUSTOMER_ACTIVITY, CUSTOMER_SORTS, useCustomerList } from '../../hooks/useCustomerList'
import { useNavAccess } from '../../layouts/navigation'
import { formatPeso, formatPesoShort } from '../../lib/money'

/**
 * Customers on tablets (landscape first) and desktops: one full-width list built for finding someone fast at the
 * counter. Each row reads who and how to reach them → how often they come → what they owe, and opens the customer's
 * page (pages/desktop-tablet/CustomerDetails.tsx). Search, activity filter and sort are hooks/useCustomerList.ts,
 * the same as the phone list.
 */
export default function Customers() {
  const { text, setText, activity, setActivity, sort, setSort, rows, loadError, adding, setAdding, filtered, activityLabel, load } = useCustomerList()
  const { can } = useNavAccess()
  const navigate = useNavigate()
  const [params] = useSearchParams()

  // Older links selected a customer in a side pane (?id=); customers open on their own page now.
  const legacyId = Number(params.get('id'))
  if (legacyId) return <Navigate to={`/customers/${legacyId}`} replace />

  const canAdd = can('customers.manage')
  const add = canAdd && (
    <button type="button" onClick={() => setAdding(true)} className={bigPrimary}><Icon className="h-5 w-5">{I.userPlus}</Icon>Add Customer</button>
  )

  return (
    <div className="mx-auto flex h-full min-h-0 max-w-6xl flex-col gap-5">
      {/* ── Header ─────────────────────────────────────────── */}
      <header className="flex shrink-0 items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Customers</h1>
          <p className="mt-0.5 truncate text-[15px] text-slate-500" aria-live="polite">
            {rows === null ? 'Loading customers…' : `${rows.length} ${filtered ? 'matching ' : ''}customer${rows.length === 1 ? '' : 's'}${activity ? ` · ${activityLabel}` : ''}`}
          </p>
        </div>
        {add}
      </header>

      {/* ── Search, sort, activity ─────────────────────────── */}
      <div className="shrink-0 space-y-3">
        <div className="flex gap-3">
          <div className="relative min-w-0 flex-1">
            <Icon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400">{I.search}</Icon>
            <input
              className="min-h-14 w-full rounded-xl border border-slate-200 bg-white pl-12 pr-12 text-base text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              type="search"
              enterKeyHint="search"
              aria-label="Search customers"
              placeholder="Search name or phone number"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            {text && (
              <button type="button" onClick={() => setText('')} aria-label="Clear search" className="absolute right-2 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full text-slate-400 hover:bg-slate-100">
                <Icon className="h-5 w-5">{I.x}</Icon>
              </button>
            )}
          </div>
          <div className="w-56 shrink-0">
            <Select
              className="min-h-14 w-full rounded-xl border border-slate-200 bg-white px-4 text-base text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              aria-label="Sort customers"
              value={sort}
              onChange={(e) => setSort(e.target.value as CustomerSort)}
            >
              {CUSTOMER_SORTS.map((s) => <option key={s.id} value={s.id}>Sort: {s.label}</option>)}
            </Select>
          </div>
        </div>

        <div role="tablist" aria-label="Customer activity" className="flex gap-1 border-b border-slate-200">
          {CUSTOMER_ACTIVITY.map((a) => <Tab key={a.id} id={a.id} label={a.label} active={activity === a.id} onClick={setActivity} />)}
        </div>
      </div>

      {/* ── The list ───────────────────────────────────────── */}
      <section aria-label="Customer list" className="-mx-2 min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-4">
        {loadError && rows === null ? (
          <StateMessage
            icon={I.info}
            title="Couldn't load customers"
            text="Something went wrong reading the customer list. Try again."
            action={<button type="button" onClick={load} className={bigPrimary}><Icon className="h-5 w-5">{I.refresh}</Icon>Try again</button>}
          />
        ) : rows === null ? (
          <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white" aria-busy="true" aria-label="Loading customers">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4 motion-safe:animate-pulse">
                <div className="size-12 rounded-full bg-slate-200" />
                <div className="flex-1 space-y-2"><div className="h-4 w-48 rounded bg-slate-200" /><div className="h-3 w-32 rounded bg-slate-100" /></div>
                <div className="h-5 w-20 rounded bg-slate-100" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          filtered ? (
            <StateMessage
              icon={I.search}
              title={text.trim() ? `No customers match “${text.trim()}”` : `No ${activityLabel.toLowerCase()} customers`}
              text={text.trim() ? 'Check the spelling or try their phone number. New here? Add them as a customer.' : 'Try another tab.'}
              action={
                <>
                  <button type="button" onClick={() => { setText(''); setActivity('') }} className={bigSecondary}>Show all customers</button>
                  {canAdd && text.trim() && <button type="button" onClick={() => setAdding(true)} className={bigPrimary}><Icon className="h-5 w-5">{I.userPlus}</Icon>Add “{text.trim()}”</button>}
                </>
              }
            />
          ) : (
            <StateMessage icon={I.users} title="No customers yet" text="Add your first customer to start taking orders. Customers can also be added from New Order." action={add || undefined} />
          )
        ) : (
          <ul aria-label="Customers" className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200/70 bg-white">
            {rows.map((c) => <CustomerRowLink key={c.id} c={c} />)}
          </ul>
        )}
      </section>

      {adding && (
        <AddCustomerSheet
          name={text}
          onClose={() => setAdding(false)}
          onCreated={(id) => { setAdding(false); load(); navigate(`/customers/${id}`) }}
        />
      )}
    </div>
  )
}

function Tab({ id, label, active, onClick }: { id: CustomerActivity; label: string; active: boolean; onClick: (id: CustomerActivity) => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={() => onClick(id)}
      className={`-mb-px inline-flex min-h-12 shrink-0 items-center whitespace-nowrap border-b-[3px] px-5 text-[15px] transition-colors ${
        active ? 'border-blue-600 font-semibold text-blue-700' : 'border-transparent font-medium text-slate-600 hover:text-slate-900'
      }`}
    >
      {label}
    </button>
  )
}

/** One customer: who and how to reach them · orders and last visit · what they owe (the question at the counter). */
function CustomerRowLink({ c }: { c: CustomerListRow }) {
  const active = isActiveCustomer(c.last_activity)
  return (
    <li>
      <Link
        to={`/customers/${c.id}`}
        className="grid min-h-20 grid-cols-[3rem_minmax(0,1fr)_9rem_8rem_1.25rem] items-center gap-x-4 px-5 py-3 outline-none transition-colors hover:bg-slate-50 focus-visible:bg-blue-50 active:bg-slate-100"
      >
        <Avatar name={c.full_name} className={`size-12 text-sm ${active ? '' : 'opacity-60'}`} />
        <span className="min-w-0">
          <span className="block truncate text-base font-semibold text-slate-900">{c.full_name}</span>
          <span className="mt-0.5 block truncate text-sm tabular-nums text-slate-500">
            {c.contact || 'No phone number'}
            {c.address && <span className="hidden lg:inline"> · {c.address}</span>}
          </span>
        </span>
        <span className="min-w-0 text-sm">
          <span className="block font-medium tabular-nums text-slate-700">{c.total_orders} order{c.total_orders === 1 ? '' : 's'}</span>
          <span className={`block truncate ${active ? 'text-slate-500' : 'text-slate-400'}`}>{c.total_orders ? `Last: ${lastVisit(c.last_activity)}` : 'No orders yet'}</span>
        </span>
        <span className="text-right">
          {c.outstanding_cents > 0 ? (
            <>
              <span className="block text-base font-bold tabular-nums text-amber-700">{formatPeso(c.outstanding_cents)}</span>
              <span className="block text-xs font-semibold text-amber-700">balance due</span>
            </>
          ) : (
            <>
              <span className="block text-sm tabular-nums text-slate-500">{formatPesoShort(c.total_spent_cents)}</span>
              <span className="block text-xs text-slate-400">billed</span>
            </>
          )}
        </span>
        <Icon className="h-5 w-5 text-slate-300">{I.chevron}</Icon>
      </Link>
    </li>
  )
}
