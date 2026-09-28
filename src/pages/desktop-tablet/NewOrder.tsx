import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Avatar } from '../../components/Avatar'
import { I, Icon } from '../../components/Icons'
import { NumberInput } from '../../components/NumberInput'
import { ServiceArt } from '../../components/ServiceArt'
import { StoreClosedNotice } from '../../components/StoreStatus'
import { ActionBar, bigPrimary, bigSecondary, column, fullBleed, Notice, quietBtn, StepIndicator } from '../../components/desktop-tablet/orderParts'
import {
  AddToggle, AfterSection, CustomerChoices, DiscountSheet, DoneView, includedText, LineStepper, lineDetail, METHODS, NewCustomerSheet,
  NotesSection, PickupSection, quickCash,
} from '../../components/order/DraftParts'
import { priceUnit } from '../../db/services'
import { isPicked, pickupLabel, type Line, type OrderDraft } from '../../hooks/useOrderDraft'
import type { OrderWizard } from '../../hooks/useOrderWizard'
import { centsToInput, formatPeso, parsePesoToCents } from '../../lib/money'
import { includesText, loadsFor, maxKgOf } from '../../lib/pricing'
import type { Service } from '../../types'

/**
 * New Order on tablets (landscape first) and desktops: Customer → Services & Add-ons → Payment → Review, one step at a
 * time in a single column (TABLET_FLOW in hooks/useOrderWizard.ts). The running total and the step's one primary action
 * stay pinned to the bottom. Draft, pricing and every check are shared with the phone (routes/NewOrderSession.tsx), and
 * the order is saved as Received, the payment recorded and the receipt printed.
 */
export default function NewOrder({ d, w, onRestart }: { d: OrderDraft; w: OrderWizard; onRestart: () => void }) {
  const labels = w.steps.map((s) => s.label)
  // Created: the confirmation's own check mark says it's done; the step indicator would only crowd its narrow column.
  if (d.done) return <div className="pt-6"><DoneView d={d} onRestart={onRestart} /></div>

  const hasService = d.picked.some((s) => !s.is_addon)
  const back = w.returning ? 'Back to Review' : null
  const cont = (label: string) => <>{label}<Icon className="h-5 w-5">{I.next}</Icon></>
  const action: { label: ReactNode; onClick: () => void; disabled: boolean } =
    w.step === 'customer' ? { label: d.customer ? cont(back ?? 'Continue') : 'Select a customer', onClick: w.next, disabled: !d.customer }
    : w.step === 'services' ? { label: hasService ? cont(back ?? 'Continue') : 'Select a service', onClick: w.next, disabled: !hasService }
    : w.step === 'payment' ? { label: cont(back ?? 'Review order'), onClick: w.next, disabled: false }
    : { label: d.busy ? 'Saving order…' : <><Icon className="h-5 w-5">{I.check}</Icon>Confirm Order</>, onClick: w.create, disabled: d.busy }

  return (
    <div className={fullBleed}>
      {/* ── Where you are ─────────────────────────────────── */}
      <header className="shrink-0 border-b border-slate-200 bg-white px-6">
        <div className={`${column} flex min-h-18 items-center gap-4`}>
          <button type="button" onClick={w.back} aria-label="Back" className="-ml-3 grid size-12 shrink-0 place-items-center rounded-full text-slate-800 hover:bg-slate-100 active:bg-slate-200">
            <Icon className="h-6 w-6">{I.back}</Icon>
          </button>
          <h1 className="shrink-0 text-xl font-bold tracking-tight text-slate-900">New Order</h1>
          <div className="flex min-w-0 flex-1 justify-center">
            <StepIndicator steps={labels} current={w.index} onSelect={(i) => w.goTo(w.steps[i]!.id)} />
          </div>
          <Link to="/orders" className="inline-flex min-h-12 shrink-0 items-center rounded-xl px-4 text-[15px] font-semibold text-slate-600 hover:bg-slate-100">Cancel</Link>
        </div>
      </header>

      {/* ── The step ──────────────────────────────────────── */}
      <div data-wizard-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-10 pt-7">
        <div className={column}>
          <h2 className="mb-5 text-2xl font-bold tracking-tight text-slate-900">{w.meta.title}</h2>
          <div>
            {w.step === 'customer' ? <CustomerStep d={d} w={w} />
              : w.step === 'services' ? <ServicesStep d={d} />
              : w.step === 'payment' ? <PaymentStep d={d} />
              : <ReviewStep d={d} w={w} />}
          </div>
        </div>
      </div>

      {/* ── Running total and the one action ──────────────── */}
      <ActionBar above={w.error && <Notice tone="error" onDismiss={w.clearError} className="mb-3">{w.error}</Notice>}>
        <div className="min-w-0 flex-1" aria-live="polite">
          <p className="truncate text-sm text-slate-500">{d.customer ? d.customer.full_name : 'No customer yet'} · {d.itemCount}</p>
          <p className="text-3xl font-bold tabular-nums tracking-tight text-slate-900">{formatPeso(d.shownTotal)}</p>
        </div>
        {w.index > 0 && !w.returning && (
          <button type="button" onClick={w.back} disabled={d.busy} className={`${bigSecondary} shrink-0`}>Back</button>
        )}
        <button type="button" onClick={action.onClick} disabled={action.disabled} aria-busy={d.busy} className={`${bigPrimary} w-80 shrink-0 text-lg`}>
          {action.label}
        </button>
      </ActionBar>
    </div>
  )
}

/** A block inside a step: title, optional hint, content; hairline between blocks. */
function Block({ title, hint, action, children }: { title: string; hint?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t border-slate-200 pt-6 first:border-t-0 first:pt-0 [&+&]:mt-8">
      <div className="mb-3 flex min-h-11 items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          {hint && <p className="text-sm text-slate-500">{hint}</p>}
        </div>
        {action && <div className="-mr-3">{action}</div>}
      </div>
      {children}
    </section>
  )
}

// ── Step 1 · Customer ─────────────────────────────────────────────

function CustomerStep({ d, w }: { d: OrderDraft; w: OrderWizard }) {
  const { search, setSearch, matches, recent } = w.customerSearch
  const [adding, setAdding] = useState(false)
  return (
    <>
      <div className="flex gap-3">
        <div className="relative min-w-0 flex-1">
          <Icon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400">{I.search}</Icon>
          <input
            className="min-h-14 w-full rounded-xl border border-slate-200 bg-white pl-12 pr-4 text-base text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            type="search"
            enterKeyHint="search"
            aria-label="Search customer by name or phone number"
            placeholder="Search name or phone number"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button type="button" onClick={() => setAdding(true)} className={`${bigSecondary} shrink-0 border-blue-200 text-blue-700`}>
          <Icon className="h-5 w-5">{I.userPlus}</Icon>New customer
        </button>
      </div>

      <p className="mb-2 mt-6 text-sm font-semibold text-slate-500">
        {matches === null ? 'Loading customers…' : matches.length ? (recent ? 'Recent customers' : 'Matching customers') : ''}
      </p>
      <CustomerChoices matches={matches} customer={d.customer} search={search} onPick={(c) => { d.setCustomer(c); w.clearError() }} />
      {matches?.length === 0 && search.trim() && (
        <div className="mt-2 flex justify-center">
          <button type="button" onClick={() => setAdding(true)} className={quietBtn}><Icon className="h-4 w-4">{I.plus}</Icon>Add “{search.trim()}” as a new customer</button>
        </div>
      )}

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

// ── Step 2 · Services & add-ons ───────────────────────────────────

function ServicesStep({ d }: { d: OrderDraft }) {
  const services = d.services.filter((s) => !s.is_addon).sort((a, b) => b.is_package - a.is_package)
  const addons = d.services.filter((s) => !!s.is_addon)
  return (
    <>
      <Block title="Service" hint="Tap a service to add it, then set the weight or quantity.">
        {services.length ? (
          <ul className="grid grid-cols-2 gap-3 xl:grid-cols-3">{services.map((s) => <ServiceTile key={s.id} d={d} s={s} />)}</ul>
        ) : (
          <Notice tone="warn">No active services. Ask a manager to add services in Services first.</Notice>
        )}
      </Block>

      {addons.length > 0 && (
        <Block title="Add-ons" hint="Optional: detergent, fabric conditioner, stain treatment…">
          <ul className="grid grid-cols-2 gap-3 xl:grid-cols-3">{addons.map((s) => <ServiceTile key={s.id} d={d} s={s} />)}</ul>
        </Block>
      )}

      <Block title="Pickup & special instructions">
        <div className="space-y-5">
          <PickupSection d={d} className="space-y-3" />
          <NotesSection d={d} className="space-y-2" />
        </div>
      </Block>
    </>
  )
}

/**
 * A service or add-on as a large tile: name and price on top (tap to add), and once added the quantity control
 * (− qty +, or Added for flat-rate items) and, for per-load services, the weight that counts the loads.
 */
function ServiceTile({ d, s }: { d: OrderDraft; s: Service }) {
  const line = d.lineOf(s.id)
  const userPicked = isPicked(d.qty[s.id])
  const included = !!line && !userPicked
  const fixed = s.pricing_type === 'fixed'
  const invalid = userPicked && !line?.p
  const byId = new Map(d.services.map((x) => [x.id, x]))
  const note = includedText(line?.p ?? null) || (s.is_package ? includesText(s, byId, d.inclusions) : s.description)
  const on = !!line
  return (
    <li className={`flex flex-col rounded-2xl border bg-white transition-colors ${
      invalid ? 'border-red-400 ring-1 ring-red-400' : on ? 'border-blue-500 ring-1 ring-blue-500' : 'border-slate-200 hover:border-slate-300'
    }`}>
      <button
        type="button"
        onClick={() => d.addOne(s)}
        disabled={on && (fixed || included)}
        aria-label={on ? `Add one more ${s.name}` : `Add ${s.name}`}
        className="flex min-h-24 flex-1 items-start gap-3 rounded-t-2xl p-4 text-left active:bg-slate-50 disabled:active:bg-transparent"
      >
        <ServiceArt name={s.name} image={s.image} className="size-12 shrink-0 rounded-xl" iconCls="h-6 w-6" />
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 font-semibold leading-snug text-slate-900">{s.name}</span>
          <span className="mt-0.5 block text-slate-500">
            <b className="text-lg font-bold tabular-nums text-slate-900">{formatPeso(s.price_cents)}</b>{priceUnit(s.pricing_type)}
          </span>
          {note && <span className={`mt-0.5 line-clamp-1 text-xs ${included || includedText(line?.p ?? null) ? 'font-semibold text-emerald-700' : 'text-slate-500'}`}>{note}</span>}
        </span>
        {on && <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-blue-600 text-white"><Icon className="h-4 w-4">{I.tick}</Icon></span>}
      </button>

      <div className="flex min-h-16 flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-2.5">
        {!on ? (
          <button type="button" onClick={() => d.addOne(s)} tabIndex={-1} className="-mx-4 -my-2.5 flex min-h-16 flex-1 items-center gap-1.5 rounded-b-2xl px-4 text-sm font-semibold text-blue-700 active:bg-blue-50">
            <Icon className="h-4 w-4">{I.plus}</Icon>Add
          </button>
        ) : fixed ? (
          <AddToggle d={d} service={s} />
        ) : (
          <>
            <LineStepper d={d} service={s} />
            <span className="text-base font-bold tabular-nums text-slate-900">{line.p && line.p.includedQty > 0 && !line.p.amountCents ? 'Included' : formatPeso(line.p?.amountCents ?? 0)}</span>
          </>
        )}
        {on && s.pricing_type === 'per_load' && userPicked && <WeightField d={d} s={s} />}
        {invalid && <p className="w-full text-sm font-medium text-red-600">Enter a valid {s.pricing_type === 'per_kg' ? 'weight' : 'whole number'}.</p>}
      </div>
    </li>
  )
}

/** Weight for a per-load service: entering it counts the loads; a load count too small for the weight is flagged. */
function WeightField({ d, s }: { d: OrderDraft; s: Service }) {
  const maxKg = maxKgOf(s, d.defaultMaxKg)
  const wt = d.weightOf(s)
  const p = d.lineOf(s.id)?.p
  const need = wt && maxKg ? loadsFor(wt, maxKg) : 0
  return (
    <div className="w-full">
      <label className="flex items-center gap-3 text-sm text-slate-600">
        Weight
        <span className="relative">
          <NumberInput
            className="h-12 w-28 rounded-xl border border-slate-200 bg-white pl-3 pr-9 text-base font-semibold tabular-nums text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 aria-invalid:border-red-400"
            maxInt={4}
            placeholder="0"
            aria-label={`${s.name} weight in kg`}
            aria-invalid={wt === undefined}
            value={d.weight[s.id] ?? ''}
            onChange={(v) => d.setWeight(s, v)}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">kg</span>
        </span>
        {maxKg ? <span className="text-slate-400">max {maxKg} kg / load</span> : null}
      </label>
      {wt === undefined && <p className="mt-1 text-sm font-medium text-red-600">Enter a valid weight, e.g. 7.5.</p>}
      {p && need > p.quantity && <p className="mt-1 text-sm font-medium text-amber-700">{wt} kg needs {need} loads at {maxKg} kg per load.</p>}
    </div>
  )
}

// ── Step 3 · Payment ──────────────────────────────────────────────

function RadioCard({ on, onClick, title, hint, icon }: { on: boolean; onClick: () => void; title: string; hint: string; icon: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={`flex min-h-20 items-center gap-4 rounded-2xl border p-4 text-left transition-colors ${
        on ? 'border-blue-500 bg-blue-50/60 ring-1 ring-blue-500' : 'border-slate-200 bg-white hover:bg-slate-50'
      }`}
    >
      <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${on ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}><Icon className="h-6 w-6">{icon}</Icon></span>
      <span className="min-w-0">
        <span className="block text-lg font-semibold text-slate-900">{title}</span>
        <span className="block text-sm text-slate-500">{hint}</span>
      </span>
    </button>
  )
}

const METHOD_ICON: Record<string, ReactNode> = { cash: I.wallet, gcash: I.phone, other: I.peso }

function PaymentStep({ d }: { d: OrderDraft }) {
  const [discountDraft, setDiscountDraft] = useState<string | null>(null) // non-null while the discount sheet is open
  const { payOpt, method, isCash, shownTotal } = d
  const now = payOpt !== 'later'
  const partial = payOpt === 'partial'
  const quick = payOpt === 'full' && isCash ? quickCash(shownTotal) : []
  const showAmount = partial || (payOpt === 'full' && isCash)
  const methodLabel = METHODS.find((m) => m.value === method)!.label
  return (
    <>
      {/* The total, first and largest */}
      <section className="rounded-2xl bg-white px-6 py-5 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[15px] text-slate-500">Total to pay</p>
            <p className="text-5xl font-bold tabular-nums tracking-tight text-slate-900">{formatPeso(shownTotal)}</p>
          </div>
          <div className="text-right text-[15px] text-slate-500">
            <p className="tabular-nums">Subtotal {formatPeso(d.subtotal)}</p>
            {(d.discountCents ?? 0) > 0 && <p className="tabular-nums text-emerald-700">Discount −{formatPeso(d.discountCents!)}</p>}
            {d.discountCents === null && <p className="font-medium text-red-600">Discount is invalid</p>}
            <button type="button" onClick={() => setDiscountDraft(d.discount)} className={`${quietBtn} -mr-3`}>
              {(d.discountCents ?? 0) > 0 || d.discountCents === null ? 'Change discount' : 'Add discount'}
            </button>
          </div>
        </div>
      </section>

      <div className="mt-8">
        <Block title="Payment option">
          <div role="radiogroup" aria-label="Payment option" className="grid grid-cols-2 gap-3">
            <RadioCard on={now} onClick={() => !now && d.choosePayOption('full')} title="Pay Now" hint="Customer pays today" icon={I.wallet} />
            <RadioCard on={!now} onClick={() => d.choosePayOption('later')} title="Pay Later" hint="Collect the balance at pickup" icon={I.clock} />
          </div>
          {now && (
            <label className="mt-3 inline-flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-1 text-[15px] text-slate-700">
              <input type="checkbox" className="size-5 accent-blue-600" checked={partial} onChange={(e) => d.choosePayOption(e.target.checked ? 'partial' : 'full')} />
              Partial payment — the customer pays part now, the rest at pickup
            </label>
          )}
          {!now && (
            <Notice tone="warn" className="mt-3">Saved as <b>Unpaid</b>. The <b>{formatPeso(shownTotal)}</b> balance is collected when the customer picks up.</Notice>
          )}
        </Block>

        {now && (
          <Block title="Payment method">
            <StoreClosedNotice action="take payment (or choose Pay Later)" />
            <div role="radiogroup" aria-label="Payment method" className="mt-3 grid grid-cols-3 gap-3">
              {METHODS.map((m) => {
                const on = method === m.value
                return (
                  <button
                    key={m.value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => { d.setMethod(m.value); if (m.value === 'cash') d.setReference('') }}
                    className={`flex min-h-16 items-center justify-center gap-2.5 rounded-2xl border text-lg font-semibold transition-colors ${
                      on ? 'border-blue-600 bg-blue-600 text-white shadow-sm shadow-blue-600/30' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="h-6 w-6">{METHOD_ICON[m.value]}</Icon>{m.label}
                  </button>
                )
              })}
            </div>

            {showAmount && (
              <div className="mt-6">
                <label htmlFor="pay-amount" className="text-[15px] font-medium text-slate-700">{partial ? 'Amount paid now' : 'Amount received'}</label>
                <div className="relative mt-1.5 max-w-md">
                  <span className="pointer-events-none absolute inset-y-0 left-5 flex items-center text-2xl text-slate-400">₱</span>
                  <NumberInput
                    id="pay-amount"
                    value={d.paid}
                    onChange={d.setPaid}
                    placeholder="0.00"
                    className="min-h-16 w-full rounded-xl border border-slate-200 bg-white pl-12 pr-4 text-3xl font-bold tabular-nums text-slate-900 outline-none placeholder:text-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                {quick.length > 0 && (
                  <div role="group" aria-label="Quick amounts" className="mt-3 flex flex-wrap gap-2">
                    {quick.map((c, i) => {
                      const on = d.paid.trim() !== '' && parsePesoToCents(d.paid) === c
                      return (
                        <button
                          key={c}
                          type="button"
                          aria-pressed={on}
                          onClick={() => d.setPaid(centsToInput(c))}
                          className={`min-h-12 rounded-xl px-5 text-base font-semibold tabular-nums transition-colors ${
                            on ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {i === 0 ? `Exact ${formatPeso(c)}` : formatPeso(c)}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {payOpt === 'full' && !isCash && (
              <Notice className="mt-5">Collect exactly <b>{formatPeso(shownTotal)}</b> by {methodLabel}.</Notice>
            )}
            {!isCash && (
              <label className="mt-5 block max-w-md text-[15px] font-medium text-slate-700">
                Reference no. <span className="font-normal text-slate-400">(optional)</span>
                <input
                  className="mt-1.5 min-h-14 w-full rounded-xl border border-slate-200 bg-white px-4 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  autoCapitalize="characters"
                  placeholder={method === 'gcash' ? 'GCash reference' : 'Reference'}
                  value={d.reference}
                  onChange={(e) => d.setReference(e.target.value)}
                />
              </label>
            )}

            {/* The result, worked out as the amount is typed */}
            <div aria-live="polite" className="mt-6">
              {payOpt === 'full' && isCash ? (
                <div className={`flex items-baseline justify-between rounded-2xl px-6 py-4 ${d.change > 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>
                  <span className="text-lg font-semibold">Change</span>
                  <span className="text-4xl font-bold tabular-nums">{formatPeso(d.change)}</span>
                </div>
              ) : partial && (
                <div className="flex items-baseline justify-between rounded-2xl bg-amber-50 px-6 py-4 text-amber-900">
                  <span className="text-lg font-semibold">Balance at pickup</span>
                  <span className="text-4xl font-bold tabular-nums">{formatPeso(d.balance)}</span>
                </div>
              )}
            </div>
          </Block>
        )}
      </div>

      {discountDraft !== null && <DiscountSheet d={d} draft={discountDraft} setDraft={setDiscountDraft} />}
    </>
  )
}

// ── Step 4 · Review & confirm ─────────────────────────────────────

function ReviewPart({ title, onEdit, children }: { title: string; onEdit: () => void; children: ReactNode }) {
  return (
    <section className="border-t border-slate-100 py-5 first:border-t-0 first:pt-0 last:pb-0">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
        <button type="button" onClick={onEdit} className={`${quietBtn} -mr-3`}><Icon className="h-4 w-4">{I.pencil}</Icon>Edit</button>
      </div>
      {children}
    </section>
  )
}

function ReviewLine({ l }: { l: Line }) {
  const incl = includedText(l.p)
  return (
    <li className="flex items-baseline justify-between gap-4 py-2">
      <span className="min-w-0">
        <span className="block font-semibold text-slate-900">{l.service.name}</span>
        <span className="block text-sm text-slate-500">{lineDetail(l)}{incl && <span className="font-medium text-emerald-700"> · {incl}</span>}</span>
      </span>
      <span className="shrink-0 text-base font-semibold tabular-nums text-slate-900">{l.p && l.p.includedQty > 0 && !l.p.amountCents ? 'Included' : formatPeso(l.p?.amountCents ?? 0)}</span>
    </li>
  )
}

function ReviewStep({ d, w }: { d: OrderDraft; w: OrderWizard }) {
  const { customer } = d
  const paid = d.paidCents ?? 0
  const methodLabel = METHODS.find((m) => m.value === d.method)!.label
  const payWords = d.payOpt === 'later' ? 'Pay Later — unpaid' : d.payOpt === 'partial' ? `Partial · ${methodLabel}` : `Paid in full · ${methodLabel}`
  return (
    <>
      <div className="rounded-2xl bg-white px-6 py-6 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
        <ReviewPart title="Customer" onEdit={() => w.edit('customer')}>
          {customer && (
            <div className="flex items-center gap-3">
              <Avatar name={customer.full_name} tone="bg-blue-600 text-white" className="size-11 text-sm" />
              <span className="min-w-0">
                <span className="block text-lg font-semibold text-slate-900">{customer.full_name}</span>
                <span className="block text-sm text-slate-500">{customer.contact || 'No phone number'}</span>
              </span>
            </div>
          )}
        </ReviewPart>

        <ReviewPart title="Services & add-ons" onEdit={() => w.edit('services')}>
          <ul className="divide-y divide-slate-100">{[...d.serviceLines, ...d.addonLines].map((l) => <ReviewLine key={l.service.id} l={l} />)}</ul>
          <p className="mt-2 text-sm text-slate-500">
            Pickup: <b className="font-semibold text-slate-700">{d.expectedPickup ? pickupLabel(d.pickupDate, d.pickupTime) : 'As soon as ready'}</b>
            {d.notes.trim() && <> · Note: <span className="text-slate-700">{d.notes.trim()}</span></>}
          </p>
        </ReviewPart>

        <ReviewPart title="Payment" onEdit={() => w.edit('payment')}>
          <p className="text-lg font-semibold text-slate-900">{payWords}</p>
          <dl className="mt-2 space-y-1 text-[15px]">
            {d.payOpt === 'full' && d.isCash && d.receivedCents !== null && (
              <div className="flex justify-between text-slate-600"><dt>Amount received</dt><dd className="tabular-nums">{formatPeso(d.receivedCents)}</dd></div>
            )}
            <div className="flex justify-between text-slate-600"><dt>Paid now</dt><dd className="tabular-nums">{formatPeso(paid)}</dd></div>
            {d.change > 0 && <div className="flex justify-between font-semibold text-emerald-700"><dt>Change to give</dt><dd className="tabular-nums">{formatPeso(d.change)}</dd></div>}
            {d.balance > 0 && <div className="flex justify-between font-semibold text-amber-700"><dt>Balance at pickup</dt><dd className="tabular-nums">{formatPeso(d.balance)}</dd></div>}
          </dl>
        </ReviewPart>

        {/* Total: the last thing read before confirming */}
        <dl className="mt-5 border-t border-slate-200 pt-5">
          {(d.discountCents ?? 0) > 0 && (
            <div className="flex justify-between text-[15px] text-slate-500"><dt>Subtotal · Discount</dt><dd className="tabular-nums">{formatPeso(d.subtotal)} · −{formatPeso(d.discountCents!)}</dd></div>
          )}
          <div className="flex items-baseline justify-between">
            <dt className="text-xl font-semibold text-slate-900">Total</dt>
            <dd className="text-4xl font-bold tabular-nums tracking-tight text-slate-900">{formatPeso(d.shownTotal)}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-6">
        <h3 className="mb-2 text-sm font-semibold text-slate-500">After confirming</h3>
        <AfterSection d={d} className="divide-y divide-slate-100 rounded-2xl bg-white shadow-[0_1px_3px_rgba(15,23,42,0.05)]" />
        <p className="mt-3 px-1 text-sm text-slate-500">The order is saved as <b className="text-slate-700">Received</b> and the receipt prints right away. Tap <b className="text-slate-700">Start Processing</b> on the order when the laundry goes in.</p>
      </div>
    </>
  )
}
