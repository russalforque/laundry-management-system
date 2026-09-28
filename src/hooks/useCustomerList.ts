import { useCallback, useEffect, useState } from 'react'
import { listCustomers, type CustomerActivity, type CustomerListRow, type CustomerSort } from '../db/customers'

export const CUSTOMER_ACTIVITY: { id: CustomerActivity; label: string }[] = [
  { id: '', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'inactive', label: 'Inactive' },
]
export const CUSTOMER_SORTS: { id: CustomerSort; label: string }[] = [
  { id: 'name', label: 'Name A–Z' },
  { id: 'recent', label: 'Recent activity' },
  { id: 'spent', label: 'Highest billed' },
]

/**
 * The Customers list: search, activity filter and sort, and the matching customers. Shared by the phone
 * card list (pages/mobile/MobileCustomers.tsx) and the tablet / desktop table (pages/desktop-tablet/Customers.tsx).
 */
export function useCustomerList() {
  const [text, setText] = useState('')
  const [activity, setActivity] = useState<CustomerActivity>('')
  const [sort, setSort] = useState<CustomerSort>('name')
  const [rows, setRows] = useState<CustomerListRow[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [loadError, setLoadError] = useState(false)

  const load = useCallback(
    () => listCustomers(text, activity, sort).then((r) => { setRows(r); setLoadError(false) }).catch(() => setLoadError(true)),
    [text, activity, sort],
  )
  useEffect(() => { load() }, [load])

  return {
    text, setText, activity, setActivity, sort, setSort, rows, loadError, adding, setAdding, load,
    filtered: !!(text || activity),
    activityLabel: CUSTOMER_ACTIVITY.find((a) => a.id === activity)!.label,
  }
}
