import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAdminPin } from '../components/AdminPin'
import { deleteCustomer, getCustomer, getCustomerStats, isActiveCustomer, updateCustomer, WALK_IN_CODE, type CustomerInput } from '../db/customers'
import { listOrders, type OrderListRow } from '../db/orderQueries'
import { isFinal } from '../lib/orders'
import type { Customer, CustomerStats } from '../types'

export const sinceDate = (iso: string) => new Date(iso).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' })

/** "Today", "Yesterday", "5 days ago", "3 wks ago", then a date. */
export function lastVisit(iso: string | null) {
  if (!iso) return 'None yet'
  const d = new Date(iso)
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((start(new Date()) - start(d)) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 14) return `${days} days ago`
  if (days < 60) return `${Math.floor(days / 7)} wks ago`
  return d.toLocaleDateString('en-PH', { month: 'short', year: 'numeric' })
}

/** Digits (and a leading +) for tel:/sms: links, or null when there's no usable number. */
export const dialable = (contact: string) => {
  const n = contact.replace(/[^\d+]/g, '')
  return n.replace(/\D/g, '').length >= 7 ? n : null
}

/** Order list filters: what's still in the shop, and what still needs paying. */
export type OrderFilter = 'all' | 'open' | 'unpaid'
const isOpen = (o: OrderListRow) => !isFinal(o.status)
const isUnpaid = (o: OrderListRow) => o.status !== 'cancelled' && o.payment_status !== 'paid'

export const ORDER_FILTER_EMPTY: Record<OrderFilter, string> = {
  all: 'No orders yet. Start one with New Order.',
  open: 'Nothing in the shop for this customer right now.',
  unpaid: 'All orders are fully paid.',
}

/**
 * One customer: profile, stats, orders with the in-shop / balance-due filters, editing and deletion.
 * Shared by pages/mobile/MobileCustomerDetails.tsx and pages/desktop-tablet/CustomerDetails.tsx.
 */
export function useCustomerDetail(id: number) {
  const navigate = useNavigate()
  const [customer, setCustomer] = useState<Customer | null | undefined>(undefined)
  const [stats, setStats] = useState<CustomerStats | null>(null)
  const [orders, setOrders] = useState<OrderListRow[]>([])
  const [filter, setFilter] = useState<OrderFilter>('all')
  const [editing, setEditing] = useState(false)
  const { approve, sheet: pinSheet } = useAdminPin()
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState('')

  const load = useCallback(async () => {
    try {
      const [c, s, o] = await Promise.all([getCustomer(id), getCustomerStats(id), listOrders({ customerId: id })])
      setCustomer(c ?? null)
      setStats(s)
      setOrders(o)
      setLoadError('')
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load this customer.')
    }
  }, [id])
  useEffect(() => { load() }, [load])

  function goBack() {
    // react-router keeps the history index in state; fall back to the list when opened directly.
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1)
    else navigate('/customers')
  }

  // Customers with any order (even cancelled) are kept for the records, so don't offer a delete that will fail.
  const walkIn = customer?.customer_code === WALK_IN_CODE
  const canDelete = !!customer && !walkIn && orders.length === 0

  async function remove() {
    setError('')
    // Null-safe: React Compiler memoizes on customer?.full_name, which is read before any loading guard.
    if (!customer || !(await approve(`Delete ${customer.full_name}? This cannot be undone.`))) return
    try {
      await deleteCustomer(id)
      navigate('/customers', { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
    }
  }

  async function save(c: CustomerInput) {
    await updateCustomer(id, c)
    setEditing(false)
    await load()
  }

  const openCount = orders.filter(isOpen).length
  const unpaidCount = orders.filter(isUnpaid).length

  return {
    customer, stats, orders, load, loadError, error,
    editing, setEditing, save, remove, canDelete, walkIn, pinSheet, goBack,
    filter, setFilter,
    filtered: filter === 'open' ? orders.filter(isOpen) : filter === 'unpaid' ? orders.filter(isUnpaid) : orders,
    filters: [
      { id: 'all' as const, label: 'All', count: orders.length },
      { id: 'open' as const, label: 'In shop', count: openCount },
      { id: 'unpaid' as const, label: 'Balance due', count: unpaidCount },
    ],
    openCount, unpaidCount,
    readyCount: orders.filter((o) => o.status === 'ready').length,
    owed: stats?.outstanding_cents ?? 0,
    active: customer ? isActiveCustomer(stats?.last_order_at ?? customer.created_at) : false,
    phone: customer ? dialable(customer.contact) : null,
  }
}
