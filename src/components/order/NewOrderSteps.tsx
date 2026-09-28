import { useState, type ReactNode } from 'react'
import type { OrderDraft } from '../../hooks/useOrderDraft'
import { CREATE_LABEL, type OrderWizard } from '../../hooks/useOrderWizard'
import { formatPeso } from '../../lib/money'
import { I, Icon } from '../Icons'
import {
  AddCustomerButton, AfterSection, card, CartLine, CartTotals, CustomerChoices, CustomerRow, CustomerSearchInput, DiscountSheet,
  NewCustomerSheet, NotesSection, PaymentBreakdown, PaymentSection, PickList, PickupSection,
} from './DraftParts'
import { StepTrack, type StepState } from './shared'

/**
 * The New Order wizard's screens — Customer, Services, Add-ons, Summary, Payment — and each one's primary action.
 * Shared by pages/mobile/MobileNewOrder.tsx and pages/desktop-tablet/NewOrder.tsx, which only lay them out.
 */

/** Customer → Services → Add-ons → Summary → Payment → Create; done steps can be tapped to go back. */
export function OrderProgress({ w, done, size = 'sm' }: { w: OrderWizard; done?: boolean; size?: 'sm' | 'md' }) {
  const steps: { label: string; state: StepState }[] = [
    ...w.steps.map((s, i): { label: string; state: StepState } => ({
      label: s.label,
      state: done || i < w.index ? 'done' : i === w.index ? 'current' : 'todo',
    })),
    { label: CREATE_LABEL, state: done ? 'done' : 'todo' },
  ]
  return <StepTrack label="New order steps" steps={steps} size={size} onSelect={done ? undefined : (i) => w.goTo(w.steps[i]!.id)} doneOnly />
}

/** The step's one primary action: its label, whether it can be tapped yet, and what it does. */
export function primaryAction(d: OrderDraft, w: OrderWizard): { label: ReactNode; onClick: () => void; disabled: boolean } {
  const back = w.returning ? 'Back to Summary' : null
  const hasService = d.picked.some((s) => !s.is_addon)
  const next = (label: string) => <>{label}<Icon className="h-5 w-5">{I.next}</Icon></>
  switch (w.step) {
    case 'customer':
      return {
        label: d.customer ? next(back ?? `Continue with ${d.customer.full_name.split(/\s+/)[0]}`) : 'Select a customer',
        onClick: w.next,
        disabled: !d.customer,
      }
    case 'services':
      return { label: hasService ? next(back ?? 'Next: Add-ons') : 'Select a service to continue', onClick: w.next, disabled: !hasService }
    case 'addons':
      return { label: next(back ?? (d.picked.some((s) => s.is_addon) ? 'Next: Summary' : 'Skip add-ons')), onClick: w.next, disabled: false }
    case 'summary':
      return { label: next('Continue to Payment'), onClick: w.next, disabled: false }
    case 'payment':
    case 'review': // tablet flow only; never reached on phones
      return {
        label: d.busy ? 'Creating order…' : <><Icon className="h-5 w-5">{I.check}</Icon>Create Order · {formatPeso(d.shownTotal)}</>,
        onClick: w.create,
        disabled: d.busy,
      }
  }
}

/** The current step's screen. `wide` spreads lists into columns on tablets and desktops (needs an @container parent). */
export function StepBody({ d, w, wide }: { d: OrderDraft; w: OrderWizard; wide?: boolean }) {
  switch (w.step) {
    case 'customer': return <CustomerStep d={d} w={w} wide={wide} />
    case 'services':
      return (
        <>
          <StepHint>Tap + to add. At least one service is needed.</StepHint>
          <PickList d={d} kind="services" listCls={wide ? 'grid gap-3 @3xl:grid-cols-2' : undefined} />
        </>
      )
    case 'addons':
      return (
        <>
          <StepHint>Optional. Skip if the customer doesn’t need any.</StepHint>
          <PickList d={d} kind="addons" listCls={wide ? 'grid gap-3 @3xl:grid-cols-2' : undefined} />
        </>
      )
    case 'summary': return <SummaryStep d={d} w={w} />
    case 'payment':
    case 'review': // tablet flow only; never reached on phones
      return (
        <>
          <section className={`${card} flex items-end justify-between gap-3 p-4`}>
            <span className="min-w-0">
              <span className="block text-sm text-slate-500">Total due</span>
              <span className="block truncate text-sm text-slate-500">{d.customer?.full_name} · {d.itemCount}</span>
            </span>
            <span className="text-4xl font-bold tabular-nums tracking-tight text-slate-900">{formatPeso(d.shownTotal)}</span>
          </section>
          <PaymentSection d={d} />
          <PaymentBreakdown d={d} />
          <AfterSection d={d} />
        </>
      )
  }
}

const StepHint = ({ children }: { children: ReactNode }) => <p className="px-1 text-sm text-slate-500">{children}</p>

function CustomerStep({ d, w, wide }: { d: OrderDraft; w: OrderWizard; wide?: boolean }) {
  const { search, setSearch, matches, recent } = w.customerSearch
  const [adding, setAdding] = useState(false)
  return (
    <>
      <div className={wide ? 'flex flex-col gap-2 @xl:flex-row' : 'space-y-3'}>
        <div className="min-w-0 flex-1"><CustomerSearchInput value={search} onChange={setSearch} /></div>
        <AddCustomerButton onClick={() => setAdding(true)} className={wide ? 'min-h-12 shrink-0 px-5 text-sm' : undefined} />
      </div>
      {!!matches?.length && (
        <h2 className="px-1 pt-1 text-sm font-semibold text-slate-500">{recent ? 'Recent customers' : 'Matching customers'}</h2>
      )}
      <CustomerChoices
        matches={matches}
        customer={d.customer}
        search={search}
        onPick={(c) => { d.setCustomer(c); w.clearError() }}
        listCls={wide ? 'grid gap-2 @2xl:grid-cols-2' : undefined}
      />
      {adding && (
        <NewCustomerSheet
          search={search}
          onClose={() => setAdding(false)}
          onCreated={(c) => {
            d.setCustomer(c)
            setSearch('')
            setAdding(false)
            w.goTo(w.returning ? w.hub : 'services') // saved and selected: carry straight on
          }}
        />
      )}
    </>
  )
}

/** A titled group on Summary with its Edit action. */
function Group({ title, onEdit, editLabel = 'Edit', children }: { title: string; onEdit: () => void; editLabel?: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <h2 className="font-semibold text-slate-900">{title}</h2>
        <button type="button" onClick={onEdit} className="-mr-2 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-blue-700 hover:bg-blue-50 active:bg-blue-50">
          <Icon className="h-4 w-4">{editLabel === 'Edit' ? I.pencil : I.plus}</Icon>{editLabel}
        </button>
      </div>
      {children}
    </section>
  )
}

function SummaryStep({ d, w }: { d: OrderDraft; w: OrderWizard }) {
  const [discountDraft, setDiscountDraft] = useState<string | null>(null) // non-null while the discount sheet is open
  return (
    <>
      {d.customer && <CustomerRow customer={d.customer} onChange={() => w.edit('customer')} />}
      <Group title="Services" onEdit={() => w.edit('services')}>
        {d.serviceLines.length
          ? <ul className="space-y-2">{d.serviceLines.map((l) => <CartLine key={l.service.id} d={d} line={l} />)}</ul>
          : <p className={`${card} p-4 text-center text-sm text-slate-500`}>No services selected.</p>}
      </Group>
      <Group title="Add-ons" onEdit={() => w.edit('addons')} editLabel={d.addonLines.length ? 'Edit' : 'Add'}>
        {d.addonLines.length
          ? <ul className="space-y-2">{d.addonLines.map((l) => <CartLine key={l.service.id} d={d} line={l} />)}</ul>
          : <p className="px-1 text-sm text-slate-500">No add-ons.</p>}
      </Group>
      <CartTotals d={d} onDiscount={() => setDiscountDraft(d.discount)} />
      <PickupSection d={d} />
      <NotesSection d={d} />
      {discountDraft !== null && <DiscountSheet d={d} draft={discountDraft} setDraft={setDiscountDraft} />}
    </>
  )
}
