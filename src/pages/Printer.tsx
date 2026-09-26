import { PrinterPanel } from './Settings'

/** Receipt printer connection and status, open to every employee (the rest of Settings is admin only). */
export default function Printer() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Printer</h1>
        <p className="mt-1 text-sm text-slate-500">Connect the receipt printer and check its status.</p>
      </div>
      <PrinterPanel />
    </div>
  )
}
