import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { listPayments, type PaymentHistoryRow } from '../db/payments'
import { METHOD_LABEL } from '../lib/orders'
import type { PaymentMethod } from '../types'

/** Matches the default `limit` of listPayments; when hit, older payments are not shown. */
export const PAYMENT_LIMIT = 300

export type MethodFilter = 'all' | PaymentMethod
export const METHODS: PaymentMethod[] = ['cash', 'gcash', 'other']

export const paymentTime = (iso: string) => new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** Local YYYY-MM-DD, `offset` days from today (the format listPayments' `date` expects). */
export function ymd(offset = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** "Today", "Yesterday" or the full date, for the day group headers. */
function dayLabel(iso: string) {
  const d = new Date(iso).toDateString()
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  if (d === new Date().toDateString()) return 'Today'
  if (d === yesterday.toDateString()) return 'Yesterday'
  return new Date(iso).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

/** Label for the picked `date` filter ('' = every date). */
export function periodLabel(date: string) {
  if (!date) return 'All dates'
  if (date === ymd()) return 'Today'
  if (date === ymd(-1)) return 'Yesterday'
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

/**
 * Payments received, with date / search / method / employee filters and day groups. Staff see the ones they
 * collected, admins and managers see everyone's. Shared by pages/mobile/MobilePayments.tsx and
 * pages/desktop-tablet/Payments.tsx.
 */
export function usePaymentList() {
  const { can } = useAuth()
  const all = can('payments.viewAll')
  const [date, setDate] = useState('')
  const [rows, setRows] = useState<PaymentHistoryRow[] | null>(null)
  const [error, setError] = useState(false)
  const [search, setSearch] = useState('')
  const [method, setMethod] = useState<MethodFilter>('all')
  const [employee, setEmployee] = useState('')

  const load = useCallback(() => {
    setRows(null)
    setError(false)
    listPayments({ date: date || undefined })
      .then(setRows)
      .catch((e) => { console.error(e); setRows([]); setError(true) })
  }, [date])
  useEffect(load, [load])

  // Employee names come from the loaded payments, so managers can filter without access to the user list.
  const employees = useMemo(() => [...new Set((rows ?? []).map((p) => p.user_name))].sort(), [rows])

  // Search and employee narrow the list first; the summary tiles are taken from that, so they stay honest.
  const base = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (rows ?? []).filter((p) =>
      (!employee || p.user_name === employee) &&
      (!q || `${p.order_number} ${p.customer_name} ${p.reference}`.toLowerCase().includes(q)))
  }, [rows, search, employee])
  const shown = useMemo(() => (method === 'all' ? base : base.filter((p) => p.method === method)), [base, method])
  const shownTotal = useMemo(() => shown.reduce((n, p) => n + p.amount_cents, 0), [shown])

  // Rows arrive newest first, so consecutive grouping keeps the days in order.
  const days = useMemo(() => {
    const out: { key: string; label: string; rows: PaymentHistoryRow[]; total: number }[] = []
    for (const p of shown) {
      const key = new Date(p.paid_at).toDateString()
      let g = out[out.length - 1]
      if (!g || g.key !== key) out.push((g = { key, label: dayLabel(p.paid_at), rows: [], total: 0 }))
      g.rows.push(p)
      g.total += p.amount_cents
    }
    return out
  }, [shown])

  const filtered = !!date || !!search.trim() || method !== 'all' || !!employee
  const clear = () => { setDate(''); setSearch(''); setMethod('all'); setEmployee('') }
  // What narrows the list beyond the date chips, spelled out above the results.
  const narrowing = [method !== 'all' && METHOD_LABEL[method], employee && `by ${employee}`, search.trim() && `“${search.trim()}”`].filter(Boolean).join(' · ')

  return {
    all, date, setDate, rows, error, load, search, setSearch, method, setMethod, employee, setEmployee,
    employees, base, shown, shownTotal, days, filtered, clear, narrowing,
  }
}
