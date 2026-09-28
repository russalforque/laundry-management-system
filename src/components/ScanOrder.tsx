import { BarcodeFormat, BarcodeScanner } from '@capacitor-mlkit/barcode-scanning'
import { Capacitor, type PluginListenerHandle } from '@capacitor/core'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { findOrderByNumber } from '../db/orderQueries'
import { parseOrderCode } from '../lib/orders'
import { I, Icon } from './Icons'
import { fieldCls } from './ui'

/** Router state set on the order screen when it was opened by a scan (see OrderDetail). */
export interface ScannedState { scanned?: boolean }

/** The same QR code is seen on every camera frame; ignore repeats of it for this long. */
const REPEAT_MS = 2500

/**
 * Start/stop run one after another: React (StrictMode, fast close/reopen) can unmount the scanner while
 * the camera is still starting, and the native plugin must never get two starts in a row.
 */
let cameraQueue: Promise<unknown> = Promise.resolve()
const queued = (fn: () => Promise<void>) => (cameraQueue = cameraQueue.then(fn, fn))

/**
 * Scan QR button: opens the camera, reads a receipt's order QR code and opens that order's
 * Order Details / Pickup screen. Only for employees who can manage orders.
 */
export function ScanQrButton({ className, label = 'Scan QR', iconOnly, children }: { className: string; label?: string; iconOnly?: boolean; children?: ReactNode }) {
  const { can } = useAuth()
  const [open, setOpen] = useState(false)
  if (!can('orders.manage')) return null
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={iconOnly ? 'Scan order QR code' : undefined} className={className}>
        {children ?? <><Icon className="h-5 w-5">{I.scan}</Icon>{!iconOnly && label}</>}
      </button>
      {open && <OrderScanner onClose={() => setOpen(false)} />}
    </>
  )
}

type Phase = { kind: 'starting' } | { kind: 'scanning'; torch: boolean } | { kind: 'blocked'; msg: string; settings?: boolean }

/**
 * Full-screen scanner. Android: ML Kit (bundled model, works offline) with the camera preview behind a
 * see-through page. Browser: the camera in a <video> where the browser can detect barcodes.
 * Typing an order number or customer name is always available as a fallback.
 */
function OrderScanner({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const native = Capacitor.isNativePlatform()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [phase, setPhase] = useState<Phase>({ kind: 'starting' })
  const [notice, setNotice] = useState('')
  const [text, setText] = useState('')
  const [torchOn, setTorchOn] = useState(false)
  const busy = useRef(false) // one lookup at a time, so a code seen on many frames opens the order once
  const lastSeen = useRef({ value: '', at: 0 })
  const onCode = useRef<(raw: string) => void>(() => {})

  /** Finds the order and opens it; when nothing matches, a notice says why and scanning carries on. */
  async function open(raw: string, typed: boolean) {
    if (busy.current) return
    const number = parseOrderCode(raw)
    if (!number) {
      // Typed text that isn't an order number is a customer search; a scanned one is someone else's QR code.
      if (typed) { onClose(); navigate(`/orders?q=${encodeURIComponent(raw.trim())}`); return }
      setNotice("Unknown QR code. This isn't an order receipt from this shop.")
      return
    }
    busy.current = true
    try {
      const found = await findOrderByNumber(number)
      if (!found) { setNotice(`No order ${number} was found on this device.`); return }
      onClose()
      navigate(`/orders/${found.id}`, { state: { scanned: true } satisfies ScannedState })
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Could not look up the order.')
    } finally {
      busy.current = false
    }
  }
  onCode.current = (raw) => {
    const now = Date.now()
    if (raw === lastSeen.current.value && now - lastSeen.current.at < REPEAT_MS) return
    lastSeen.current = { value: raw, at: now }
    open(raw, false)
  }

  useEffect(() => {
    let live = true
    let started = false
    let handle: PluginListenerHandle | null = null
    const block = (msg: string, settings = false) => { if (live) setPhase({ kind: 'blocked', msg, settings }) }

    ;(async () => {
      try {
        if (!(await BarcodeScanner.isSupported()).supported) return block("This device can't scan QR codes here. Type the order number instead.")
        if (native) {
          let { camera } = await BarcodeScanner.checkPermissions()
          if (camera === 'prompt' || camera === 'prompt-with-rationale') ({ camera } = await BarcodeScanner.requestPermissions())
          if (camera !== 'granted') return block('Camera access is off. Allow it in the app settings to scan receipts, or type the order number.', true)
        }
        await queued(async () => {
          if (!live) return
          handle = await BarcodeScanner.addListener('barcodesScanned', (e) => {
            const raw = e.barcodes[0]?.rawValue
            if (raw) onCode.current(raw)
          })
          if (native) document.documentElement.classList.add('qr-scanning')
          await BarcodeScanner.startScan({ formats: [BarcodeFormat.QrCode], videoElement: native ? undefined : videoRef.current ?? undefined })
          started = true
        })
        if (!started) return
        const torch = native && (await BarcodeScanner.isTorchAvailable().then((r) => r.available, () => false))
        if (live) setPhase({ kind: 'scanning', torch })
      } catch (e) {
        document.documentElement.classList.remove('qr-scanning')
        // Browsers reject getUserMedia with NotAllowedError when camera access is refused.
        const denied = e instanceof Error && /denied|NotAllowed|permission/i.test(`${e.name} ${e.message}`)
        block(denied ? 'Camera access was refused. Allow it to scan receipts, or type the order number.' : "The camera couldn't start. Type the order number instead.", denied && native)
      }
    })()

    return () => {
      live = false
      document.documentElement.classList.remove('qr-scanning')
      queued(async () => {
        await handle?.remove()
        if (started) await BarcodeScanner.stopScan().catch(() => {})
      })
    }
  }, [native])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function submit(e: FormEvent) {
    e.preventDefault()
    if (text.trim()) open(text, true)
  }

  const blocked = phase.kind === 'blocked'
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Scan order QR code"
      className={`fixed inset-0 z-[60] flex flex-col text-white ${blocked ? 'bg-slate-900' : native ? 'bg-transparent' : 'bg-black'}`}
    >
      {!native && !blocked && <video ref={videoRef} muted playsInline className="absolute inset-0 h-full w-full object-cover" />}

      <div className="relative z-10 flex items-center justify-between px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button type="button" onClick={onClose} aria-label="Close scanner" className="grid size-12 place-items-center rounded-full bg-black/40 active:bg-black/60">
          <Icon className="h-6 w-6">{I.x}</Icon>
        </button>
        <h2 className="text-lg font-semibold drop-shadow">Scan Receipt QR</h2>
        {phase.kind === 'scanning' && phase.torch ? (
          <button
            type="button"
            onClick={() => BarcodeScanner.toggleTorch().then(() => setTorchOn((t) => !t), () => {})}
            aria-label={torchOn ? 'Turn flashlight off' : 'Turn flashlight on'}
            aria-pressed={torchOn}
            className={`grid size-12 place-items-center rounded-full ${torchOn ? 'bg-amber-400 text-slate-900' : 'bg-black/40 active:bg-black/60'}`}
          >
            <Icon className="h-6 w-6">{I.flash}</Icon>
          </button>
        ) : <span className="size-12" />}
      </div>

      <div className="relative flex flex-1 items-center justify-center px-8">
        {blocked ? (
          <div className="max-w-xs text-center">
            <span className="mx-auto grid size-16 place-items-center rounded-full bg-white/10"><Icon className="h-8 w-8">{I.scan}</Icon></span>
            <p className="mt-4 text-[15px] text-slate-200">{phase.msg}</p>
            {phase.settings && (
              <button type="button" onClick={() => BarcodeScanner.openSettings().catch(() => {})} className="mt-4 min-h-12 rounded-xl bg-white px-5 font-semibold text-slate-900 active:bg-slate-200">
                Open App Settings
              </button>
            )}
          </div>
        ) : (
          // Viewfinder: the dimmed surround is the frame's own shadow, so the middle stays see-through.
          <div className="aspect-square w-[min(70vw,18rem)] rounded-3xl border-4 border-white/90 shadow-[0_0_0_100vmax_rgba(0,0,0,0.55)]">
            {phase.kind === 'starting' && <p className="grid h-full place-items-center text-sm text-white/90">Starting camera…</p>}
          </div>
        )}
        {!blocked && (
          <p className="absolute bottom-6 left-0 right-0 text-center text-sm text-white/90 drop-shadow">Point the camera at the QR code on the claim stub</p>
        )}
      </div>

      <form onSubmit={submit} className="relative z-10 space-y-3 rounded-t-3xl bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 text-slate-900">
        {notice && (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            <Icon className="mt-px h-4 w-4">{I.info}</Icon><span className="min-w-0 flex-1">{notice}</span>
          </p>
        )}
        <label className="block text-sm font-medium text-slate-600" htmlFor="scan-manual">QR not scanning? Type the order number or customer name</label>
        <div className="flex gap-2">
          <input
            id="scan-manual"
            className={fieldCls}
            placeholder="e.g. L-0125 or Juan"
            enterKeyHint="search"
            autoComplete="off"
            value={text}
            onChange={(e) => { setText(e.target.value); setNotice('') }}
          />
          <button type="submit" disabled={!text.trim()} className="shrink-0 rounded-xl bg-blue-600 px-5 font-semibold text-white active:bg-blue-700 disabled:opacity-50">Find</button>
        </div>
      </form>
    </div>,
    document.body,
  )
}
