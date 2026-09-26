import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { I, Icon } from '../components/Icons'
import { BackHeader, EmptyCard, primary } from '../components/Manage'
import ThermalReceipt from '../components/ThermalReceipt'
import { getOrderDetail, getPaymentReceipt } from '../db/orderQueries'
import { getSettings } from '../db/settings'
import { canBluetoothPrint, NoPrinterError, printOrderReceipt, printPaymentReceipt } from '../lib/printer'
import { logoBitmap, orderReceipt, PAPER, paymentReceipt, receiptConfig, type ReceiptDoc } from '../lib/receipt'

type PrintState = { state: 'busy' | 'ok' | 'error'; msg?: string; noPrinter?: boolean } | null

/** Zigzag bottom edge so the preview reads as torn-off paper (screen only). */
const tornEdge = 'pb-[calc(2ch+6px)] [mask:conic-gradient(from_-45deg_at_bottom,#0000,#000_1deg_89deg,#0000_90deg)_50%/12px_100%] print:[mask:none]'

/**
 * Standalone (no app chrome) so printing only ever outputs the receipt. Uses the same layout as the
 * Bluetooth printer, following Settings › Receipt (paper width, visible fields, logo, QR).
 * `?payment=<id>` shows the receipt for that one payment instead of the order receipt.
 */
export default function Receipt() {
  const id = Number(useParams().id)
  const paymentId = Number(useSearchParams()[0].get('payment')) || 0
  const navigate = useNavigate()
  const [doc, setDoc] = useState<ReceiptDoc | null | undefined>(undefined)
  const [printing, setPrinting] = useState<PrintState>(null)

  useEffect(() => {
    let live = true
    ;(async () => {
      const [detail, settings] = await Promise.all([paymentId ? getPaymentReceipt(id, paymentId) : getOrderDetail(id), getSettings()])
      const c = receiptConfig(settings)
      const logo = await logoBitmap(c.receipt_logo, c.receipt_paper).catch(() => null)
      if (!live) return
      if (!detail) return setDoc(null)
      setDoc('payment' in detail ? paymentReceipt(detail, c, logo) : orderReceipt(detail, c, logo))
    })()
    return () => { live = false }
  }, [id, paymentId])

  const back = () => navigate(`/orders/${id}`)

  async function print() {
    // Android: straight to the Bluetooth thermal printer. Browser: the system print dialog.
    if (!canBluetoothPrint()) return window.print()
    setPrinting({ state: 'busy' })
    try {
      await (paymentId ? printPaymentReceipt(id, paymentId) : printOrderReceipt(id))
      setPrinting({ state: 'ok' })
    } catch (e) {
      setPrinting({ state: 'error', msg: e instanceof Error ? e.message : 'Could not print.', noPrinter: e instanceof NoPrinterError })
    }
  }

  const title = paymentId ? 'Payment Receipt' : 'Receipt'
  const paper = doc && doc.cols === PAPER['80'].cols ? '80 mm' : '58 mm'
  const busy = printing?.state === 'busy'

  return (
    <div className="flex min-h-dvh flex-col bg-slate-100 print:block print:min-h-0 print:bg-white">
      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-6 pt-[max(1rem,env(safe-area-inset-top))] print:max-w-none print:p-0">
        <div className="print:hidden">
          <BackHeader title={title} onBack={back} />
          {doc && <p className="mt-0.5 text-sm text-slate-500">Print preview · {paper} paper</p>}
        </div>

        {doc === undefined ? (
          <div className="mx-auto mt-5 h-96 max-w-xs animate-pulse rounded-t-lg bg-white/70" aria-busy="true" aria-label="Loading receipt" />
        ) : doc === null ? (
          <div className="mt-5 rounded-2xl bg-white">
            <EmptyCard
              icon={I.receipt}
              title={paymentId ? 'Payment not found' : 'Order not found'}
              text="It may have been deleted. Go back to the order to try again."
            />
          </div>
        ) : (
          <div className="mt-5 drop-shadow-[0_6px_16px_rgba(15,23,42,0.10)] print:mt-0 print:filter-none">
            <ThermalReceipt doc={doc} className={`rounded-t-lg ${tornEdge} print:rounded-none print:px-0 print:py-0`} />
          </div>
        )}
      </main>

      {doc && (
        <footer className="sticky bottom-0 z-10 rounded-t-3xl border-t border-slate-100 bg-white px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(15,23,42,0.06)] print:hidden">
          <div className="mx-auto max-w-md space-y-3">
            {printing && printing.state !== 'busy' && (
              <p
                role={printing.state === 'error' ? 'alert' : 'status'}
                className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-medium ${printing.state === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0">{printing.state === 'ok' ? I.check : I.info}</Icon>
                <span className="min-w-0">
                  {printing.state === 'ok' ? 'Receipt printed.' : printing.msg}
                  {printing.noPrinter && <Link to="/printer" className="mt-1 block font-semibold underline">Set up printer</Link>}
                </span>
              </p>
            )}
            <button type="button" onClick={print} disabled={busy} className={`${primary} min-h-13 w-full rounded-2xl text-base`}>
              <Icon className="h-5 w-5">{I.printer}</Icon>
              {busy ? 'Printing…' : printing?.state === 'ok' ? 'Print Again' : 'Print Receipt'}
            </button>
          </div>
        </footer>
      )}
    </div>
  )
}
