import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { recordShiftEvent } from '../db/shifts'
import { canBluetoothPrint, openCashDrawer } from '../lib/printer'
import { useAdminPin } from './AdminPin'
import { I, Icon } from './Icons'

export type DrawerMsg = { ok: boolean; msg: string } | null

/**
 * Drawer feedback plus a manual "Open cash drawer" button, shown after a cash payment.
 * Roles with cashDrawer.open (admin, manager) open it directly; Staff need an admin PIN.
 */
export function CashDrawerControl({ status, className = '' }: { status: DrawerMsg; className?: string }) {
  const { can, user } = useAuth()
  const { approve, sheet } = useAdminPin()
  const [manual, setManual] = useState<DrawerMsg>(null)
  const [busy, setBusy] = useState(false)
  const shown = manual ?? status
  if (!canBluetoothPrint()) return null

  async function open() {
    if (busy) return
    if (!can('cashDrawer.open') && !(await approve('Open the cash drawer?'))) return
    setBusy(true)
    try {
      await openCashDrawer()
      recordShiftEvent('drawer_open', user?.id ?? null, null, 'Opened by hand after a payment')
      setManual({ ok: true, msg: 'Cash drawer opened.' })
    } catch (e) {
      setManual({ ok: false, msg: e instanceof Error ? e.message : 'Could not open the cash drawer.' })
    }
    setBusy(false)
  }

  return (
    <div className={`w-full space-y-2 ${className}`}>
      {shown && (
        <p role="status" className={`rounded-xl px-4 py-3 text-left text-sm font-medium ${shown.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {shown.msg}
        </p>
      )}
      <button
        type="button" onClick={open} disabled={busy}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white font-semibold text-slate-700 active:bg-slate-50 disabled:opacity-60"
      >
        <Icon className="h-5 w-5">{I.register}</Icon>{busy ? 'Opening…' : 'Open cash drawer'}
      </button>
      {sheet}
    </div>
  )
}
