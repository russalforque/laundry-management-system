import { useRef, useState, type FormEvent } from 'react'
import { refundOrder } from '../db/payments'
import { centsToInput, formatPeso, parsePesoToCents } from '../lib/money'
import type { PaymentMethod } from '../types'
import { Select } from './Controls'
import { NumberInput } from './NumberInput'
import { StoreClosedNotice, useStoreShift } from './StoreStatus'
import { inputCls, primaryBtn } from './ui'

/**
 * Refund money received on a cancelled order. `approve` runs just before saving (the admin PIN),
 * unless the refund follows straight on from an approved cancellation. The database re-checks everything.
 */
export default function RefundForm({ orderId, refundableCents, refundedCents, defaultMethod, approve, onSaved }: {
  orderId: number
  /** Paid minus already refunded, as displayed. */
  refundableCents: number
  /** Already refunded as displayed; the database rejects the refund if it has changed since. */
  refundedCents: number
  defaultMethod: PaymentMethod
  approve: (() => Promise<boolean>) | null
  onSaved: (method: PaymentMethod) => void
}) {
  const [amount, setAmount] = useState(centsToInput(refundableCents))
  const [method, setMethod] = useState<PaymentMethod>(defaultMethod)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false) // blocks a double tap in the same frame
  const storeClosed = useStoreShift().shift === null
  const cents = parsePesoToCents(amount)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (submitting.current || storeClosed) return
    if (cents === null || cents <= 0) return setError('Enter a valid amount above zero.')
    if (cents > refundableCents) return setError(`Refund cannot be more than ${formatPeso(refundableCents)}.`)
    if (!reason.trim()) return setError('Enter a reason for the refund.')
    submitting.current = true
    setBusy(true)
    try {
      if (approve && !(await approve())) return
      await refundOrder({ orderId, amountCents: cents, method, reason, expectedRefundedCents: refundedCents })
      onSaved(method)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <StoreClosedNotice action="give refunds" />
      <div className="flex items-baseline justify-between text-sm text-slate-500">
        Can be refunded <b className="text-base tabular-nums text-slate-900">{formatPeso(refundableCents)}</b>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-medium text-slate-600">
          Refund amount
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
      <label className="block text-sm font-medium text-slate-600">
        Reason <span className="text-red-500">*</span>
        <input
          className={`${inputCls} mt-1`} placeholder="e.g. Customer cancelled" value={reason}
          onChange={(e) => { setReason(e.target.value); setError('') }}
        />
      </label>
      {method === 'cash' && <p className="text-xs text-slate-500">Cash refunds come out of the drawer and lower the expected cash for this shift.</p>}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button disabled={busy || storeClosed} className={`${primaryBtn} w-full`}>
        {busy ? 'Saving…' : cents && cents > 0 ? `Refund ${formatPeso(cents)}` : 'Refund'}
      </button>
    </form>
  )
}
