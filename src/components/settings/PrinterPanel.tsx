import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useAdminPin } from '../AdminPin'
import { Toggle } from '../Controls'
import { I, Icon } from '../Icons'
import { card, primary } from '../Manage'
import { FloatingToast, type Msg } from '../Toast'
import { useAuth } from '../../context/AuthContext'
import { getSettings, setSetting } from '../../db/settings'
import { recordShiftEvent } from '../../db/shifts'
import {
  CASH_DRAWER_AUTO, canBluetoothPrint, connectPrinter, discoverDevices, listPairedDevices, pairDevice, PRINTER_ADDRESS, PRINTER_AUTO_CONNECT, PRINTER_NAME, printerScore,
  openCashDrawer, printerStatus, printTestPage, savePrinter, type PairedDevice,
} from '../../lib/printer'
import { Group, outline } from './SettingsParts'

const byLikelyPrinter = (a: PairedDevice, b: PairedDevice) => printerScore(b) - printerScore(a) || a.name.localeCompare(b.name)

/**
 * Receipt printer setup: the paired printer is picked and connected automatically (POS-5890 and other
 * ESC/POS Bluetooth printers); new printers can be found and paired here without Android's settings.
 * Used by Settings › Receipt printer and by the Printer page on every screen size.
 */
export function PrinterPanel() {
  const { can, user } = useAuth()
  const { approve, sheet } = useAdminPin()
  const [devices, setDevices] = useState<PairedDevice[] | null>(null)
  const [nearby, setNearby] = useState<PairedDevice[] | null>(null)
  const [selected, setSelected] = useState({ address: '', name: '' })
  const [connected, setConnected] = useState(false)
  const [auto, setAuto] = useState(true)
  const [drawerAuto, setDrawerAuto] = useState(true)
  const [busy, setBusy] = useState('') // 'test' | 'drawer' | 'search' | 'connect' | device address being set up
  const [msg, setMsg] = useState<Msg>(null)
  const fail = (e: unknown, fallback: string) => setMsg({ ok: false, text: e instanceof Error ? e.message : fallback })

  const refreshStatus = useCallback(() => printerStatus().then((s) => setConnected(s.connected)).catch(() => setConnected(false)), [])

  const scan = useCallback(async () => {
    try {
      const list = await listPairedDevices()
      setDevices(list.sort(byLikelyPrinter))
      return list
    } catch (e) {
      setDevices([])
      fail(e, 'Could not read Bluetooth devices.')
      return []
    }
  }, [])

  /** Saves the printer and connects to it right away, so a problem shows up here instead of at checkout. */
  const use = useCallback(async (d: Pick<PairedDevice, 'address' | 'name'>, note = '') => {
    await savePrinter(d)
    setSelected(d)
    setBusy('connect')
    try {
      await connectPrinter(d.address)
      setMsg({ ok: true, text: `${note}Connected to ${d.name}. Receipts will print automatically.` })
    } catch (e) {
      setMsg({ ok: false, text: `${d.name} is selected, but ${e instanceof Error ? e.message.charAt(0).toLowerCase() + e.message.slice(1) : 'it could not connect.'}` })
    }
    setBusy('')
    refreshStatus()
  }, [refreshStatus])

  useEffect(() => {
    if (!canBluetoothPrint()) return
    ;(async () => {
      const s = await getSettings()
      setAuto(s[PRINTER_AUTO_CONNECT] !== '0')
      setDrawerAuto(s[CASH_DRAWER_AUTO] !== '0')
      setSelected({ address: s[PRINTER_ADDRESS] ?? '', name: s[PRINTER_NAME] ?? '' })
      const list = await scan()
      await refreshStatus()
      // Nothing chosen yet: pick the paired printer automatically.
      if (!s[PRINTER_ADDRESS]) {
        const best = [...list].sort(byLikelyPrinter).find((d) => printerScore(d) > 0)
        if (best) await use(best, `Found ${best.name}. `)
      }
    })()
  }, [scan, use, refreshStatus])

  async function search() {
    setBusy('search')
    setMsg(null)
    setNearby(null)
    try {
      const found = await discoverDevices()
      setNearby(found.filter((d) => !d.paired).sort(byLikelyPrinter))
    } catch (e) {
      setNearby([])
      fail(e, 'Could not search for printers.')
    }
    setBusy('')
  }

  async function pairAndUse(d: PairedDevice) {
    setBusy(d.address)
    setMsg({ ok: true, text: `Pairing with ${d.name}…` })
    try {
      await pairDevice(d.address)
      setNearby((n) => n?.filter((x) => x.address !== d.address) ?? null)
      await scan()
      await use(d, 'Paired. ')
    } catch (e) {
      fail(e, 'Could not pair with the printer.')
      setBusy('')
    }
  }

  async function test() {
    setBusy('test')
    setMsg(null)
    try {
      await printTestPage(selected.address)
      setMsg({ ok: true, text: 'Test page sent to the printer.' })
    } catch (e) {
      fail(e, 'Could not print.')
    }
    setBusy('')
    refreshStatus()
  }

  async function toggleAuto(on: boolean) {
    setAuto(on)
    await setSetting(PRINTER_AUTO_CONNECT, on ? '1' : '0')
  }

  async function openDrawer() {
    if (busy) return
    if (!can('cashDrawer.open') && !(await approve('Open the cash drawer?'))) return
    setBusy('drawer')
    setMsg(null)
    try {
      await openCashDrawer()
      recordShiftEvent('drawer_open', user?.id ?? null, null, 'Opened from Printer settings')
      setMsg({ ok: true, text: 'Cash drawer opened.' })
    } catch (e) {
      fail(e, 'Could not open the cash drawer.')
    }
    setBusy('')
    refreshStatus()
  }

  async function toggleDrawerAuto(on: boolean) {
    setDrawerAuto(on)
    await setSetting(CASH_DRAWER_AUTO, on ? '1' : '0')
  }

  if (!canBluetoothPrint())
    return (
      <section className={`${card} flex items-start gap-3 p-4`}>
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600"><Icon className="h-5 w-5">{I.info}</Icon></span>
        <p className="text-sm text-slate-600">Bluetooth printing is available in the Android app. In the browser, receipts print through the system print dialog.</p>
      </section>
    )

  const status = busy === 'connect'
    ? { label: 'Connecting…', cls: 'bg-blue-50 text-blue-700', dot: 'bg-blue-500 animate-pulse' }
    : connected
      ? { label: 'Connected', cls: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' }
      : { label: 'Not connected', cls: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' }

  const deviceRow = (d: PairedDevice, onClick: () => void, right: ReactNode, current = false) => (
    <button key={d.address} type="button" onClick={onClick} disabled={!!busy} aria-current={current || undefined} className="flex min-h-16 w-full items-center gap-3.5 px-4 py-3 text-left hover:bg-slate-50 active:bg-slate-50 disabled:opacity-70">
      <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${printerScore(d) > 0 ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-400'}`}>
        <Icon className="h-5 w-5">{I.printer}</Icon>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-slate-900">{d.name}</span>
        <span className="block truncate text-sm text-slate-500">{printerScore(d) > 0 ? 'Receipt printer · ' : ''}{d.address}</span>
      </span>
      {right}
    </button>
  )

  return (
    <>
      {/* Current printer: status first, then its actions */}
      <section className={`${card} overflow-hidden`}>
        <div className="flex items-center gap-4 p-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-600"><Icon className="h-7 w-7">{I.printer}</Icon></span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">Current printer</span>
            <span className="block truncate text-lg font-bold text-slate-900">{selected.address ? selected.name || selected.address : 'None selected'}</span>
            {selected.address ? (
              <span className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${status.cls}`}>
                <span className={`size-2 rounded-full ${status.dot}`} />{status.label}
              </span>
            ) : (
              <span className="mt-0.5 block text-sm text-slate-500">Pick a paired printer below, or search for one.</span>
            )}
          </span>
        </div>
        {selected.address && (
          <div className="flex gap-2 px-4 pb-4">
            {!connected && (
              <button type="button" onClick={() => use(selected)} disabled={!!busy} className={`${outline} flex-1`}>
                <Icon className="h-5 w-5">{I.refresh}</Icon>{busy === 'connect' ? 'Connecting…' : 'Connect'}
              </button>
            )}
            <button type="button" onClick={test} disabled={!!busy} className={`${primary} min-h-12 flex-1`}>
              <Icon className="h-5 w-5">{I.receipt}</Icon>{busy === 'test' ? 'Printing…' : 'Test print'}
            </button>
          </div>
        )}
        <div className="flex items-center gap-3 border-t border-slate-100 px-4 py-3">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-slate-800">Auto-connect</span>
            <span className="block text-xs text-slate-500">Connect when the app opens so receipts print instantly.</span>
          </span>
          <Toggle label="Auto-connect printer" on={auto} onChange={toggleAuto} />
        </div>
      </section>

      <section className={`${card} overflow-hidden`}>
        <div className="flex items-center gap-4 p-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-600"><Icon className="h-7 w-7">{I.register}</Icon></span>
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-bold text-slate-900">Cash drawer</span>
            <span className="block text-sm text-slate-500">Plugged into the printer's drawer (RJ11) port.</span>
          </span>
        </div>
        <div className="px-4 pb-4">
          <button type="button" onClick={openDrawer} disabled={!!busy} className={`${outline} w-full`}>
            <Icon className="h-5 w-5">{I.register}</Icon>{busy === 'drawer' ? 'Opening…' : 'Open cash drawer'}
          </button>
        </div>
        {can('settings.manage') && (
          <div className="flex items-center gap-3 border-t border-slate-100 px-4 py-3">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-slate-800">Open after cash payment</span>
              <span className="block text-xs text-slate-500">Never for GCash or other methods.</span>
            </span>
            <Toggle label="Automatically open drawer after cash payment" on={drawerAuto} onChange={toggleDrawerAuto} />
          </div>
        )}
      </section>

      <Group
        title="Paired devices"
        aside={
          <button type="button" onClick={() => { setMsg(null); scan() }} className="-my-2 -mr-2 flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-blue-700 active:bg-blue-50">
            <Icon className="h-4 w-4">{I.refresh}</Icon>Refresh
          </button>
        }
      >
        {devices === null ? (
          [0, 1].map((i) => (
            <div key={i} className="flex items-center gap-3.5 px-4 py-3.5" aria-hidden>
              <span className="size-10 animate-pulse rounded-xl bg-slate-100" />
              <span className="flex-1 space-y-2"><span className="block h-3.5 w-2/5 animate-pulse rounded bg-slate-100" /><span className="block h-3 w-1/3 animate-pulse rounded bg-slate-100" /></span>
            </div>
          ))
        ) : devices.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">No paired devices yet. Use <b>Search for printers</b> below.</p>
        ) : devices.map((d) => {
          const current = d.address === selected.address
          return deviceRow(d, () => use(d), current
            ? <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700"><Icon className="h-3.5 w-3.5">{I.tick}</Icon>In use</span>
            : <span className="shrink-0 text-sm font-semibold text-blue-600">Use</span>, current)
        })}
      </Group>

      <Group title="Nearby printers">
        {nearby?.map((d) => deviceRow(d, () => pairAndUse(d),
          <span className="shrink-0 rounded-full bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white">{busy === d.address ? 'Pairing…' : 'Pair & use'}</span>))}
        {nearby?.length === 0 && <p className="p-4 text-sm text-slate-500">No new devices found. Make sure the printer is on and close by.</p>}
        <button type="button" onClick={search} disabled={!!busy} className="flex min-h-14 w-full items-center justify-center gap-2 font-semibold text-blue-700 active:bg-blue-50 disabled:opacity-60">
          <Icon className={`h-5 w-5 ${busy === 'search' ? 'animate-pulse' : ''}`}>{I.search}</Icon>{busy === 'search' ? 'Searching… (about 12 seconds)' : 'Search for printers'}
        </button>
      </Group>

      <details className={`${card} group overflow-hidden`}>
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 font-semibold text-slate-900 active:bg-slate-50 [&::-webkit-details-marker]:hidden">
          <Icon className="h-5 w-5 text-slate-400">{I.info}</Icon>
          <span className="flex-1">Printer not found?</span>
          <Icon className="h-5 w-5 text-slate-400 transition-transform group-open:rotate-180">{I.chevronDown}</Icon>
        </summary>
        <ol className="list-decimal space-y-2 px-4 pb-4 pl-12 text-sm text-slate-600">
          <li>Turn the printer on (the light should blink) and keep it within a few meters.</li>
          <li>Tap <b>Search for printers</b>, then <b>Pair &amp; use</b>. The PIN (0000 or 1234) is entered for you.</li>
          <li>POS-5890 and most 58 mm / 80 mm ESC/POS Bluetooth printers are supported. Match the paper width in Settings › Receipt.</li>
        </ol>
      </details>

      <FloatingToast msg={msg} onDismiss={() => setMsg(null)} />
      {sheet}
    </>
  )
}
