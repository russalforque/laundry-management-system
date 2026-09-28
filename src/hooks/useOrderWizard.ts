import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useCustomerSearch, type OrderDraft } from './useOrderDraft'

/**
 * The New Order wizard. One controller for both layouts, held by routes/NewOrderSession.tsx above the layout switch
 * with the draft, so rotating a tablet keeps the order in progress. Each layout runs its own flow of steps over the
 * same draft and the same checks:
 *   phones (pages/mobile/MobileNewOrder.tsx)          Customer → Services → Add-ons → Summary → Payment, then Create
 *   tablets / desktops (pages/desktop-tablet/NewOrder.tsx)  Customer → Services & Add-ons → Payment → Review, then Confirm
 * The step lives in the URL (?step=), so the Android back button walks back through the steps.
 */

export type WizardStep = 'customer' | 'services' | 'addons' | 'summary' | 'payment' | 'review'

export interface WizardFlow {
  steps: { id: WizardStep; label: string; title: string }[]
  /** The overview step: Edit from there opens a step whose Continue goes straight back to it. */
  hub: WizardStep
  /** Why a step isn't complete yet; null when it is. */
  check: (d: OrderDraft, s: WizardStep) => string | null
  /** A step from the other flow (after crossing the phone breakpoint) mapped onto this one. */
  alias: Partial<Record<WizardStep, WizardStep>>
}

export const WIZARD_STEPS: WizardFlow['steps'] = [
  { id: 'customer', label: 'Customer', title: 'Select customer' },
  { id: 'services', label: 'Services', title: 'Select services' },
  { id: 'addons', label: 'Add-ons', title: 'Add-ons' },
  { id: 'summary', label: 'Summary', title: 'Order summary' },
  { id: 'payment', label: 'Payment', title: 'Payment' },
]

export const PHONE_FLOW: WizardFlow = {
  steps: WIZARD_STEPS,
  hub: 'summary',
  check: (d, s) =>
    s === 'customer' ? (d.presetPending ? null : d.customerError())
    : s === 'services' ? d.servicesError()
    : s === 'addons' ? d.addonsError()
    : s === 'summary' ? d.summaryError()
    : d.paymentError(),
  alias: { review: 'payment' },
}

/** Tablets and desktops: fewer, fuller steps; payment is taken before the final review, and Confirm places the order. */
export const TABLET_FLOW: WizardFlow = {
  steps: [
    { id: 'customer', label: 'Customer', title: 'Who is this order for?' },
    { id: 'services', label: 'Services', title: 'Services & add-ons' },
    { id: 'payment', label: 'Payment', title: 'Payment' },
    { id: 'review', label: 'Review', title: 'Review & confirm' },
  ],
  hub: 'review',
  check: (d, s) =>
    s === 'customer' ? (d.presetPending ? null : d.customerError())
    : s === 'services' ? d.servicesError() ?? d.addonsError() ?? d.pickupError()
    : s === 'payment' ? d.discountError() ?? d.paymentError()
    : null, // review: Confirm re-runs every check (placeOrder)
  alias: { addons: 'services', summary: 'payment' },
}

/** The progress track also shows the finish line: the order being created. */
export const CREATE_LABEL = 'Create'

export type OrderWizard = ReturnType<typeof useOrderWizard>

export function useOrderWizard(d: OrderDraft, preset: number, flow: WizardFlow = PHONE_FLOW) {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [err, setErr] = useState<{ step: WizardStep; msg: string } | null>(null)
  // Set when a step is opened from the hub (Summary / Review) to edit it: its Next goes straight back there.
  const [returnTo, setReturnTo] = useState<WizardStep | null>(null)
  const { steps } = flow

  const stepError = (s: WizardStep): string | null => flow.check(d, s)

  // Requested step, then clamped to the first earlier step that isn't complete (deep links, reloads, a
  // customer removed on the way back…), so nothing can be skipped. The last step itself is checked on Create.
  const raw = params.get('step') as WizardStep | null
  const mapped = raw ? flow.alias[raw] ?? raw : null
  const requested: WizardStep = mapped && steps.some((s) => s.id === mapped) ? mapped : preset ? 'services' : 'customer'
  const reqIdx = steps.findIndex((s) => s.id === requested)
  const blocked = steps.slice(0, reqIdx).find((s) => stepError(s.id))
  const step = blocked?.id ?? requested
  const index = steps.findIndex((s) => s.id === step)
  const meta = steps[index]!
  const error = err?.step === step ? err.msg : ''
  const fail = (msg: string) => setErr({ step, msg })
  const customerSearch = useCustomerSearch(step === 'customer')

  function goTo(s: WizardStep) {
    setErr(null)
    setReturnTo(null)
    if (s !== step) setParams((p) => { const n = new URLSearchParams(p); n.set('step', s); return n })
    document.querySelector('main')?.scrollTo({ top: 0 })
    document.querySelector('[data-wizard-scroll]')?.scrollTo({ top: 0 })
  }

  /** Next / Continue: checks this step, then moves on (or back to the hub when editing from there). */
  function next() {
    const e = stepError(step)
    if (e) return fail(e)
    const to = returnTo && returnTo !== step ? returnTo : steps[index + 1]?.id
    if (to) goTo(to)
  }

  /** Change customer / Edit services / Edit payment from the hub. */
  function edit(s: WizardStep) {
    goTo(s)
    setReturnTo(flow.hub) // after goTo, which clears it
  }

  /** Header back: the previous screen (history keeps every step), or the orders list when opened directly. */
  function back() {
    setErr(null)
    setReturnTo(null)
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1)
    else if (index > 0) goTo(steps[index - 1]!.id)
    else navigate('/orders')
  }

  const create = () => d.placeOrder(fail)

  return {
    step, index, meta, steps, hub: flow.hub, error, fail, clearError: () => setErr(null),
    returning: !!returnTo && returnTo !== step,
    goTo, next, edit, back, create, stepError, customerSearch,
  }
}
