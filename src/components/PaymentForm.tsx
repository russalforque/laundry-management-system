import { useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { addPayment } from '../db/payments'
import { centsToInput, formatPeso, parsePesoToCents } from '../lib/money'
import type { PaymentMethod } from '../types'
import { inputCls, primaryBtn } from './ui'

export default function PaymentForm({ orderId, balanceCents, onSaved }: { orderId: number; balanceCents: number; onSaved: () => void }) {
  const { user } = useAuth()
  const [amount, setAmount] = useState(centsToInput(balanceCents))
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [reference, setReference] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const cents = parsePesoToCents(amount)
    if (cents === null || cents <= 0) return setError('Enter a valid amount above zero.')
    if (cents > balanceCents) return setError(`Amount cannot exceed the balance (${formatPeso(balanceCents)}).`)
    setBusy(true)
    try {
      await addPayment({ orderId, amountCents: cents, method, reference }, user!.id)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed.')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-3 border-t border-slate-100 pt-3">
      <div className="grid grid-cols-2 gap-3">
        <input className={inputCls} inputMode="decimal" placeholder="Amount (₱)" aria-label="Payment amount" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        <select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} aria-label="Payment method">
          <option value="cash">Cash</option>
          <option value="gcash">GCash</option>
          <option value="other">Other</option>
        </select>
      </div>
      <input className={inputCls} placeholder="Reference / notes (optional)" value={reference} onChange={(e) => setReference(e.target.value)} />
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button disabled={busy} className={`${primaryBtn} w-full`}>{busy ? 'Saving…' : 'Record payment'}</button>
    </form>
  )
}
