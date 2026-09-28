import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, panelCls } from '../../components/desktop-tablet/ui'
import { I, Icon } from '../../components/Icons'
import { PrinterPanel } from '../../components/settings/PrinterPanel'
import { useAuth } from '../../context/AuthContext'

const TIPS: { icon: ReactNode; title: string; text: string }[] = [
  { icon: I.refresh, title: 'Connects by itself', text: 'With auto-connect on, the printer connects when the app opens and when you come back to it.' },
  { icon: I.receipt, title: 'Receipts after each order', text: 'A new order prints its receipt right after saving when Print receipt is on; any receipt can be printed again from its order.' },
  { icon: I.register, title: 'Cash drawer', text: 'Plug the drawer into the printer’s RJ11 port. It can open by itself after cash payments, never for GCash.' },
]

/**
 * Printer on tablets and desktops: printer setup (shared with Settings › Receipt printer) beside a short
 * guide. Open to every employee; the rest of Settings is admin only.
 */
export default function Printer() {
  const { can } = useAuth()
  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-6">
      <PageHeader title="Printer" sub="Connect the receipt printer and check its status." />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="min-w-0 space-y-4"><PrinterPanel /></div>
        <aside className={`${panelCls} space-y-4 p-5 lg:sticky lg:top-0`}>
          <h2 className="text-base font-bold text-slate-900">How printing works</h2>
          <ul className="space-y-4">
            {TIPS.map((t) => (
              <li key={t.title} className="flex gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600"><Icon className="h-5 w-5">{t.icon}</Icon></span>
                <span className="min-w-0 text-sm">
                  <span className="block font-semibold text-slate-900">{t.title}</span>
                  <span className="block text-slate-500">{t.text}</span>
                </span>
              </li>
            ))}
          </ul>
          {can('settings.manage') && (
            <Link to="/settings?view=receipt" className="flex min-h-11 items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 text-sm font-semibold text-blue-700 hover:bg-blue-50">
              Receipt layout &amp; paper width<Icon className="h-4 w-4">{I.chevron}</Icon>
            </Link>
          )}
        </aside>
      </div>
    </div>
  )
}
