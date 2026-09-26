import { useRef, useState, type FormEvent } from 'react'
import { addPayment } from '../db/payments'
import { cashTender, centsToInput, formatPeso, parsePesoToCents } from '../lib/money'
import type { PaymentMethod } from '../types'
import { Select } from './Controls'
import { NumberInput } from './NumberInput'
import { StoreClosedNotice, useStoreShift } from './StoreStatus'
import { inputCls, primaryBtn } from './ui'

export default function PaymentForm({ orderId, balanceCents, paidCents, onSaved }: {
  orderId: number
  balanceCents: number
  /** Amount already paid as displayed; the database rejects the payment if it has changed since. */
  paidCents?: number
  onSaved: (paymentId: number, method: PaymentMethod) => void
}) {
  const [amount, setAmount] = useState(centsToInput(balanceCents))
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [reference, setReference] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false) // state updates are async; this blocks a double tap in the same frame
  const storeClosed = useStoreShift().shift === null // payments are refused while the store is closed
  const isCash = method === 'cash'
  const entered = parsePesoToCents(amount)
  // Cash may exceed the balance (change is handed back); only the part that settles it is recorded.
  const recordCents = entered === null ? null : isCash ? cashTender(balanceCents, entered).applied : entered

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (submitting.current || storeClosed) return
    if (entered === null || entered <= 0) return setError('Enter a valid amount above zero.')
    if (!isCash && entered > balanceCents) return setError(`Amount cannot exceed the balance (${formatPeso(balanceCents)}).`)
    submitting.current = true
    setBusy(true)
    try {
      const paymentId = await addPayment({
        orderId, amountCents: recordCents!, method, reference, tenderedCents: isCash ? entered : null, expectedPaidCents: paidCents,
      })
      onSaved(paymentId, method)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      submitting.current = false
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-3 border-t border-slate-100 pt-3">
      <StoreClosedNotice />
      <div className="flex items-baseline justify-between text-sm text-slate-500">
        Balance Due <b className="text-base tabular-nums text-slate-900">{formatPeso(balanceCents)}</b>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-medium text-slate-600">
          {isCash ? 'Amount Received' : 'Amount Paid'}
          <NumberInput
            className={`${inputCls} mt-1`} placeholder="0.00" value={amount}
            onChange={(v) => { setAmount(v); setError('') }} required
          />
        </label>
        <label className="block text-sm font-medium text-slate-600">
          Method
          <span className="mt-1 block">
            <Select className={inputCls} value={method} onChange={(e) => { setMethod(e.target.value as PaymentMethod); setError('') }}>
              <option value="cash">Cash</option>
              <option value="gcash">GCash</option>
              <option value="other">Other</option>
            </Select>
          </span>
        </label>
      </div>
      {isCash && <CashChange dueCents={balanceCents} received={amount} />}
      <label className="block text-sm font-medium text-slate-600">
        Reference / notes <span className="font-normal text-slate-400">(optional)</span>
        <input className={`${inputCls} mt-1`} value={reference} onChange={(e) => setReference(e.target.value)} />
      </label>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button disabled={busy || storeClosed} className={`${primaryBtn} w-full`}>
        {busy ? 'Saving…' : recordCents ? `Collect ${formatPeso(recordCents)}` : 'Collect Payment'}
      </button>
    </form>
  )
}

/**
 * Live cash summary while the amount received is typed: the change to hand back, or, for a partial
 * payment, the balance still owed. Shared by Pay Now (new order) and Collect Payment.
 */
export function CashChange({ dueCents, received }: { dueCents: number; received: string }) {
  const cents = received.trim() ? parsePesoToCents(received) : 0
  let body = null
  if (cents === null) {
    body = <p className="text-sm font-medium text-red-600">Enter a valid amount, e.g. 500 or 500.50.</p>
  } else if (cents > 0 && dueCents > 0) {
    const { applied, change, remaining } = cashTender(dueCents, cents)
    body = remaining > 0 ? (
      <div className="rounded-xl bg-amber-50 px-4 py-3 text-amber-800">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-semibold">Balance Due</span>
          <span className="text-2xl font-bold tabular-nums">{formatPeso(remaining)}</span>
        </div>
        <p className="text-xs">Amount Paid {formatPeso(applied)} (partial payment)</p>
      </div>
    ) : (
      <div className="rounded-xl bg-emerald-50 px-4 py-3 text-emerald-800">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-semibold">Change</span>
          <span className="text-3xl font-bold tabular-nums">{formatPeso(change)}</span>
        </div>
        <p className="text-xs">Amount Paid {formatPeso(applied)} · order fully paid</p>
      </div>
    )
  }
  return <div aria-live="polite">{body}</div>
}
