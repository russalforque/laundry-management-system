import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { BrandName, LogoTile } from '../components/AuthScreen'
import { useAdminPin } from '../components/AdminPin'
import BackupPanel from '../components/BackupPanel'
import { PaymentBadge, StatusBadge } from '../components/Badges'
import { Segmented, Toggle } from '../components/Controls'
import { I, Icon } from '../components/Icons'
import { BackHeader, card, Field, field, primary } from '../components/Manage'
import { NumberInput } from '../components/NumberInput'
import { Sheet } from '../components/Sheet'
import ThermalReceipt from '../components/ThermalReceipt'
import { FloatingToast, Toast, useAutoDismiss, type Msg } from '../components/Toast'
import { useAuth } from '../context/AuthContext'
import { useBranding } from '../context/BrandingContext'
import { getSettings, setSetting } from '../db/settings'
import { recordShiftEvent } from '../db/shifts'
import { BRANDING_DEFAULTS, BRANDING_KEYS, brandName, DEFAULT_PRIMARY, isHex, readable, themeVars, type Branding } from '../lib/branding'
import { fileToThumbnail } from '../lib/image'
import {
  CASH_DRAWER_AUTO, canBluetoothPrint, connectPrinter, discoverDevices, listPairedDevices, pairDevice, PRINTER_ADDRESS, PRINTER_AUTO_CONNECT, PRINTER_NAME, printerScore,
  openCashDrawer, printerStatus, printSampleReceipt, printTestPage, savePrinter, type PairedDevice,
} from '../lib/printer'
import {
  logoBitmap, orderReceipt, PAPER, RECEIPT_DEFAULTS, RECEIPT_KEYS, RECEIPT_RESET_KEYS, receiptConfig, sampleOrder,
  type Bitmap, type PaperWidth, type ReceiptConfig, type ReceiptKey,
} from '../lib/receipt'
import type { PaymentStatus } from '../types'

type View = 'hub' | 'business' | 'branding' | 'receipt' | 'system' | 'printer' | 'backup' | 'about'
type Form = typeof blank

const blank = { business_name: '', business_address: '', business_contact: '', default_pickup_days: '', load_max_kg: '', auto_backup: '1' }
// Receipt footer lives on the Receipt screen only; name/address/contact only here.
const BUSINESS_KEYS: (keyof Form)[] = ['business_name', 'business_address', 'business_contact']
const SYSTEM_KEYS: (keyof Form)[] = ['default_pickup_days', 'load_max_kg', 'auto_backup']

const DISCARD = 'Discard your unsaved changes?'
/** Asks before throwing away edits; true when it is fine to leave. */
const okToLeave = (dirty: boolean) => !dirty || window.confirm(DISCARD)

export default function Settings() {
  const [params, setParams] = useSearchParams()
  const { state } = useLocation()
  const navigate = useNavigate()
  const nav = state as { anchor?: string; fromHub?: boolean } | null
  // The More sheet's "Backup & Restore" shortcut arrives with { anchor: 'backup' }.
  const view = (params.get('view') ?? (nav?.anchor === 'backup' ? 'backup' : 'hub')) as View

  const [f, setF] = useState<Form>(blank)
  const [saved, setSaved] = useState<Form>(blank)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)
  const { brand, setBrand } = useBranding()
  const { can } = useAuth()

  const load = useCallback(async () => {
    const s = await getSettings()
    const next = Object.fromEntries(Object.keys(blank).map((k) => [k, s[k] ?? blank[k as keyof Form]])) as Form
    setF(next)
    setSaved(next)
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => { setMsg(null); document.querySelector('main')?.scrollTo(0, 0) }, [view])

  const set = (k: keyof Form, v: string) => { setF((x) => ({ ...x, [k]: v })); setMsg(null) }
  const dirty = (keys: (keyof Form)[]) => keys.some((k) => f[k] !== saved[k])
  const open = (v: View) => setParams({ view: v }, { state: { fromHub: true } })
  // Leaving a sub-screen discards unsaved edits (after asking).
  const back = (unsaved = false) => {
    if (!okToLeave(unsaved)) return
    load()
    if (nav?.fromHub) navigate(-1)
    else setParams({}, { replace: true })
  }

  async function save(keys: (keyof Form)[], e: FormEvent) {
    e.preventDefault()
    const days = f.default_pickup_days.trim()
    if (keys.includes('business_name') && !f.business_name.trim()) return setMsg({ ok: false, text: 'Business name is required.' })
    if (keys.includes('default_pickup_days') && days && !/^\d{1,2}$/.test(days)) return setMsg({ ok: false, text: 'Default pickup days must be a whole number from 0 to 99.' })
    const maxKg = f.load_max_kg.trim()
    if (keys.includes('load_max_kg') && maxKg && !(/^\d{1,3}(\.\d{1,2})?$/.test(maxKg) && Number(maxKg) > 0)) return setMsg({ ok: false, text: 'Max weight per load must be a number above 0 (up to 2 decimals).' })
    setBusy(true)
    try {
      const trimmed = Object.fromEntries(keys.map((k) => [k, f[k].trim()])) as Partial<Form>
      for (const k of keys) await setSetting(k, trimmed[k]!)
      if (keys.includes('business_name')) setBrand({ ...brand, business_name: f.business_name.trim() })
      setF((x) => ({ ...x, ...trimmed }))
      setSaved((x) => ({ ...x, ...trimmed }))
      setMsg({ ok: true, text: 'Changes saved.' })
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Failed to save.' })
    }
    setBusy(false)
  }

  if (view === 'business') {
    const unsaved = dirty(BUSINESS_KEYS)
    return (
      <SubPage
        title="Business Information"
        text="Your business details, shown in the app and on every receipt."
        onBack={() => back(unsaved)}
        onSubmit={(e) => save(BUSINESS_KEYS, e)}
        bar={<SaveBar dirty={unsaved} busy={busy} msg={msg} onDismiss={() => setMsg(null)} />}
      >
        <Panel title="Business details">
          <Field label="Business name" icon={I.store} required>
            <input className={field} placeholder="Enter business name" autoComplete="organization" value={f.business_name} onChange={(e) => set('business_name', e.target.value)} required />
          </Field>
          <Field label="Address" icon={I.pin}>
            <input className={field} placeholder="Street, city" autoComplete="street-address" value={f.business_address} onChange={(e) => set('business_address', e.target.value)} />
          </Field>
          <Field label="Contact number" icon={I.phone}>
            <input className={field} type="tel" inputMode="tel" placeholder="09XX XXX XXXX" autoComplete="tel" value={f.business_contact} onChange={(e) => set('business_contact', e.target.value)} />
          </Field>
        </Panel>
        <Panel title="Receipt header" text="How these details print at the top of receipts.">
          <div className="rounded-xl bg-slate-100 p-3">
            <div className="mx-auto max-w-xs bg-white px-4 py-5 text-center text-[13px] leading-relaxed text-slate-800 shadow-sm">
              <p className="wrap-break-word font-bold uppercase">{f.business_name.trim() || 'Business name'}</p>
              {f.business_address.trim() && <p className="wrap-break-word">{f.business_address.trim()}</p>}
              {f.business_contact.trim() && <p>{f.business_contact.trim()}</p>}
              <p aria-hidden className="mt-2 overflow-hidden whitespace-nowrap text-slate-300">- - - - - - - - - - - - - - - - - - - -</p>
            </div>
          </div>
          <button type="button" onClick={() => { if (okToLeave(unsaved)) open('receipt') }} className={`${outline} w-full`}>
            <Icon className="h-5 w-5">{I.receipt}</Icon>Receipt logo, text & layout
          </button>
        </Panel>
      </SubPage>
    )
  }

  if (view === 'system') {
    const unsaved = dirty(SYSTEM_KEYS)
    return (
      <SubPage
        title="System Settings"
        text="Order defaults, pricing rules and data safety."
        onBack={() => back(unsaved)}
        onSubmit={(e) => save(SYSTEM_KEYS, e)}
        bar={<SaveBar dirty={unsaved} busy={busy} msg={msg} onDismiss={() => setMsg(null)} />}
      >
        <Group title="Orders">
          <Row icon={I.calendar} title="Default pickup" text="Days after receiving. Leave blank for no default.">
            <UnitInput label="Default pickup days" unit="days" decimals={0} maxInt={2} value={f.default_pickup_days} onChange={(v) => set('default_pickup_days', v)} />
          </Row>
        </Group>
        <Group title="Pricing">
          <Row icon={I.layers} title="Max weight per load" text="Loads are counted from weight (8 kg: 8.1 kg = 2 loads). Blank to enter loads by hand. Items can override it.">
            <UnitInput label="Max weight per load in kg" unit="kg" decimals={2} maxInt={3} value={f.load_max_kg} onChange={(v) => set('load_max_kg', v)} />
          </Row>
          <Row icon={I.receipt} title="Prices, packages & add-ons" text="Edit services, packages and what they include" onClick={() => { if (okToLeave(unsaved)) navigate('/services') }} />
        </Group>
        <Group title="Data">
          <Row icon={I.database} title="Auto backup" text="Daily, when the app is first opened">
            <Toggle label="Auto backup" on={f.auto_backup !== '0'} onChange={(on) => set('auto_backup', on ? '1' : '0')} />
          </Row>
          {can('backup.manage') && <Row icon={I.cloud} title="Backup & restore" text="Export, import and restore data" onClick={() => { if (okToLeave(unsaved)) open('backup') }} />}
        </Group>
      </SubPage>
    )
  }

  const editBusiness = (unsaved: boolean) => { if (okToLeave(unsaved)) open('business') }

  if (view === 'receipt') return <ReceiptPanel onBack={back} onEditBusiness={editBusiness} />

  if (view === 'branding') return <BrandingPanel onBack={back} onEditBusiness={editBusiness} />

  if (view === 'printer')
    return (
      <SubPage title="Receipt Printer" text="Bluetooth thermal printer and cash drawer." onBack={() => back()}>
        <PrinterPanel />
      </SubPage>
    )

  if (view === 'backup' && can('backup.manage'))
    return (
      <SubPage title="Backup & Restore" text="Keep a copy of your data and bring it back when needed." onBack={() => back()}>
        <BackupPanel />
      </SubPage>
    )

  if (view === 'about')
    return (
      <SubPage title="About" onBack={() => back()}>
        <section className={`${card} flex flex-col items-center px-6 py-8 text-center`}>
          <span className="grid size-20 place-items-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/25">
            <Icon className="h-12 w-12">{I.washer}</Icon>
          </span>
          <h2 className="mt-4 text-2xl font-bold text-slate-900">Sellix<span className="text-blue-600">Laundry</span></h2>
          <p className="text-slate-500">Laundry Management System</p>
          <p className="mt-4 max-w-sm text-sm text-slate-500">Works fully offline. All data is stored on this device. Use Backup &amp; Restore to keep a copy elsewhere.</p>
        </section>
      </SubPage>
    )

  return <Hub open={open} />
}

function Hub({ open }: { open: (v: View) => void }) {
  const { user, logout, switchUser, can } = useAuth()
  const { brand } = useBranding()
  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-2">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Settings</h1>
        <p className="mt-1 text-slate-500">Manage your account and system settings.</p>
      </header>

      <Link to="/account" className={`${card} flex items-center gap-4 p-4 active:bg-slate-50`}>
        <span className="grid size-14 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-600">
          <Icon className="h-7 w-7">{I.user}</Icon>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-lg font-bold text-slate-900">{user?.full_name}</span>
          <span className="block truncate text-sm text-slate-500">{user?.username} · My profile</span>
        </span>
        <Icon className="h-5 w-5 text-slate-400">{I.chevron}</Icon>
      </Link>

      <Group title="Business">
        <Row icon={I.store} title="Business information" text={brandName(brand)} onClick={() => open('business')} />
        <Row icon={I.palette} title="Branding" text="Logo and theme colors" onClick={() => open('branding')} />
        <Row icon={I.receipt} title="Receipt" text="Logo, text, fields and paper size" onClick={() => open('receipt')} />
        <Row icon={I.printer} title="Receipt printer" text="Bluetooth printer and cash drawer" onClick={() => open('printer')} />
        {can('services.manage') && <Row icon={I.shirt} title="Services & prices" text="Services, packages, add-ons and units" to="/services" />}
      </Group>

      <Group title="System">
        <Row icon={I.gear} title="System settings" text="Order defaults, load weight, auto backup" onClick={() => open('system')} />
        {can('backup.manage') && <Row icon={I.cloud} title="Backup & restore" text="Export, import and restore data" onClick={() => open('backup')} />}
      </Group>

      <Group title="Account">
        {can('users.manage') && <Row icon={I.users} title="User management" text="Manage users and roles" to="/users" />}
        <Row icon={I.shield} title="Change PIN" text="Update your login PIN" to="/account" />
      </Group>

      <Group title="Support">
        <Row icon={I.info} title="About" text="App information" onClick={() => open('about')} />
        <Row icon={I.users} title="Switch user" text="Hand over to another account (e.g. a cashier)" onClick={switchUser} />
        <Row icon={I.logout} title="Log out" text="Sign out of this device" onClick={logout} danger />
      </Group>
    </div>
  )
}

/* ─── Shared building blocks ─────────────────────────────────────────────────────────────── */

/** Sub-screen shell: back header with a one-line description; a form when `onSubmit` is given, with `bar` pinned last. */
function SubPage({ title, text, onBack, onSubmit, bar, wide, children }: {
  title: string; text?: string; onBack: () => void; onSubmit?: (e: FormEvent) => void; bar?: ReactNode; wide?: boolean; children: ReactNode
}) {
  const cls = `mx-auto ${wide ? 'max-w-5xl' : 'max-w-2xl'} space-y-4`
  const body = (
    <>
      <div>
        <BackHeader title={title} onBack={onBack} />
        {text && <p className="mt-0.5 pl-11 text-sm text-slate-500">{text}</p>}
      </div>
      {children}
      {bar}
    </>
  )
  return onSubmit ? <form onSubmit={onSubmit} className={cls}>{body}</form> : <div className={`${cls} pb-2`}>{body}</div>
}

/**
 * Save bar pinned to the bottom of the screen (just above the phone's bottom nav), so Save is always
 * in thumb reach. Shows whether there are unsaved changes, and the result of the last save.
 */
function SaveBar({ dirty, busy, msg, onDismiss, children }: { dirty: boolean; busy: boolean; msg: Msg; onDismiss: () => void; children?: ReactNode }) {
  useAutoDismiss(msg, onDismiss)
  return (
    <div className="sticky bottom-0 z-20 -mx-4 -mb-4 border-t border-slate-200/70 bg-white/95 px-4 pb-4 pt-3 shadow-[0_-4px_20px_rgba(15,23,42,0.06)] backdrop-blur md:bottom-4 md:mx-0 md:mb-0 md:rounded-2xl md:border md:pb-3">
      {msg && <Toast msg={msg} onDismiss={onDismiss} className="mb-3" />}
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 text-sm" aria-live="polite">
          {dirty
            ? <span className="flex items-center gap-2 font-semibold text-amber-700"><span className="size-2 shrink-0 rounded-full bg-amber-500" />Unsaved changes</span>
            : <span className="text-slate-500">{busy ? 'Saving…' : 'All changes saved'}</span>}
        </p>
        {children}
        <button disabled={busy || !dirty} className={`${primary} min-h-12 px-6 disabled:opacity-40 disabled:shadow-none`}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  )
}

/** Card with a heading and an optional description. */
function Panel({ title, text, action, children }: { title: string; text?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className={`${card} p-4 sm:p-5`}>
      <div className="mb-4 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          {text && <p className="mt-0.5 text-sm text-slate-500">{text}</p>}
        </div>
        {action}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function Group({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
        {aside}
      </div>
      <div className={`${card} divide-y divide-slate-100 overflow-hidden`}>{children}</div>
    </section>
  )
}

/** Settings list row: navigates (`to`), acts (`onClick`), or hosts a control (`children`). */
function Row({ icon, title, text, to, onClick, danger, children }: {
  icon: ReactNode; title: string; text: string; to?: string; onClick?: () => void; danger?: boolean; children?: ReactNode
}) {
  const body = (
    <>
      <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${danger ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
        <Icon className="h-5 w-5">{icon}</Icon>
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block font-semibold ${danger ? 'text-red-600' : 'text-slate-900'}`}>{title}</span>
        <span className="block text-sm text-slate-500">{text}</span>
      </span>
      {children ?? <Icon className="h-5 w-5 shrink-0 text-slate-400">{I.chevron}</Icon>}
    </>
  )
  const cls = 'flex min-h-16 w-full items-center gap-3.5 px-4 py-3 text-left'
  if (to) return <Link to={to} className={`${cls} active:bg-slate-50`}>{body}</Link>
  if (onClick) return <button type="button" onClick={onClick} className={`${cls} active:bg-slate-50`}>{body}</button>
  return <div className={cls}>{body}</div>
}

/** Short number field with its unit inside ("3 days", "8 kg"). */
function UnitInput({ label, unit, decimals, maxInt, value, onChange }: { label: string; unit: string; decimals: number; maxInt: number; value: string; onChange: (v: string) => void }) {
  return (
    <span className="relative block w-28 shrink-0">
      <NumberInput
        className="min-h-12 w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-4 pr-12 text-right text-base tabular-nums outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        decimals={decimals}
        maxInt={maxInt}
        enterKeyHint="done"
        aria-label={label}
        placeholder="—"
        value={value}
        onChange={onChange}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">{unit}</span>
    </span>
  )
}

/** Logo tile with Upload / Change and Remove next to it; `extra` adds more buttons. */
function LogoPicker({ preview, has, onPick, onRemove, hint, extra }: {
  preview: ReactNode; has: boolean; onPick: (file: File | undefined) => void; onRemove: () => void; hint: string; extra?: ReactNode
}) {
  const picker = useRef<HTMLInputElement>(null)
  return (
    <div>
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => picker.current?.click()}
          aria-label={has ? 'Change logo' : 'Upload logo'}
          className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 active:bg-slate-100"
        >
          {preview}
        </button>
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
          <button type="button" onClick={() => picker.current?.click()} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 -ml-3 font-semibold text-blue-600 active:bg-blue-50">
            <Icon className="h-5 w-5">{I.download}</Icon>{has ? 'Change logo' : 'Upload logo'}
          </button>
          {extra}
          {has && (
            <button type="button" onClick={onRemove} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 -ml-3 font-semibold text-red-600 active:bg-red-50">
              <Icon className="h-5 w-5">{I.trash}</Icon>Remove
            </button>
          )}
        </div>
      </div>
      <p className="mt-3 text-sm text-slate-500">{hint}</p>
      <input ref={picker} type="file" accept="image/*" hidden onChange={(e) => { onPick(e.target.files?.[0]); e.target.value = '' }} />
    </div>
  )
}

/** Read-only business details with a jump to Business Information, the one place they are edited. */
function BusinessSummary({ name, address, contact, onEdit }: { name: string; address?: string; contact?: string; onEdit: () => void }) {
  const lines = [
    { icon: I.store, value: name, empty: 'No business name' },
    ...(address !== undefined ? [{ icon: I.pin, value: address, empty: 'No address' }] : []),
    ...(contact !== undefined ? [{ icon: I.phone, value: contact, empty: 'No contact number' }] : []),
  ]
  return (
    <section className={`${card} flex items-start gap-3 p-4`}>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {lines.map((l) => (
          <li key={l.empty} className="flex items-center gap-2.5 text-sm">
            <Icon className="h-4 w-4 shrink-0 text-slate-400">{l.icon}</Icon>
            <span className={`min-w-0 truncate ${l.value.trim() ? 'font-medium text-slate-900' : 'text-slate-400'}`}>{l.value.trim() || l.empty}</span>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onEdit} className="-my-1 -mr-2 inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-blue-600 active:bg-blue-50">
        <Icon className="h-4 w-4">{I.pencil}</Icon>Edit
      </button>
    </section>
  )
}

const byLikelyPrinter = (a: PairedDevice, b: PairedDevice) => printerScore(b) - printerScore(a) || a.name.localeCompare(b.name)

/**
 * Receipt printer setup: the paired printer is picked and connected automatically (POS-5890 and other
 * ESC/POS Bluetooth printers); new printers can be found and paired here without Android's settings.
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
    <button key={d.address} type="button" onClick={onClick} disabled={!!busy} aria-current={current || undefined} className="flex min-h-16 w-full items-center gap-3.5 px-4 py-3 text-left active:bg-slate-50 disabled:opacity-70">
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

const area = 'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-normal outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
const outline = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-4 font-semibold text-blue-600 active:bg-blue-50 disabled:opacity-60'

const RECEIPT_TOGGLES: { key: ReceiptKey; icon: ReactNode; title: string; text: string }[] = [
  { key: 'receipt_show_customer', icon: I.user, title: 'Customer name', text: 'Who the order belongs to' },
  { key: 'receipt_show_phone', icon: I.phone, title: 'Phone number', text: "Customer's contact number" },
  { key: 'receipt_show_order_no', icon: I.receipt, title: 'Order number', text: 'Needed to claim the laundry' },
  { key: 'receipt_show_datetime', icon: I.calendar, title: 'Date & time', text: 'When the order or payment was made' },
  { key: 'receipt_show_items', icon: I.layers, title: 'Service breakdown', text: 'Each service and add-on with quantity and price' },
  { key: 'receipt_show_method', icon: I.wallet, title: 'Payment method', text: 'Cash, GCash or other' },
  { key: 'receipt_show_staff', icon: I.users, title: 'Staff / cashier', text: 'Who took the order or payment' },
  { key: 'receipt_show_qr', icon: I.scan, title: 'Order QR code', text: 'Scan it at pickup to open the order (printer must support images)' },
]

/** Settings › Receipt: what the printed receipt shows, with a live preview of the exact printout. */
function ReceiptPanel({ onBack, onEditBusiness }: { onBack: (unsaved: boolean) => void; onEditBusiness: (unsaved: boolean) => void }) {
  const [c, setC] = useState<ReceiptConfig | null>(null)
  const [saved, setSaved] = useState<ReceiptConfig | null>(null)
  const [logo, setLogo] = useState<Bitmap | null>(null)
  const [sample, setSample] = useState<PaymentStatus>('partial')
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState<Msg>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const { brand, setBrand } = useBranding()

  useEffect(() => { getSettings().then((s) => { const r = receiptConfig(s); setC(r); setSaved(r) }) }, [])

  // The logo is dithered to 1-bit dots for the preview, exactly as it will print.
  const logoSrc = c?.receipt_logo ?? ''
  const paper = c?.receipt_paper ?? '58'
  useEffect(() => {
    let live = true
    logoBitmap(logoSrc, paper).catch(() => null).then((b) => { if (live) setLogo(b) })
    return () => { live = false }
  }, [logoSrc, paper])

  if (!c) return null

  const unsaved = !!saved && RECEIPT_KEYS.some((k) => c[k] !== saved[k])
  const set = (k: ReceiptKey, v: string) => { setC((x) => x && { ...x, [k]: v }); setMsg(null) }
  const doc = orderReceipt(sampleOrder(sample), c, logo)
  const shownCount = RECEIPT_TOGGLES.filter((t) => c[t.key] === '1').length

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!c) return
    if (!c.business_name.trim()) return setMsg({ ok: false, text: 'Business name is required. Set it in Business Information.' })
    setBusy('save')
    try {
      const next = Object.fromEntries(RECEIPT_KEYS.map((k) => [k, k === 'receipt_logo' ? c[k] : c[k].trim()])) as ReceiptConfig
      for (const k of RECEIPT_KEYS) await setSetting(k, next[k])
      setBrand({ ...brand, business_name: next.business_name })
      setC(next)
      setSaved(next)
      setMsg({ ok: true, text: 'Receipt settings saved.' })
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Failed to save.' })
    }
    setBusy('')
  }

  function reset() {
    setC((x) => x && { ...x, ...Object.fromEntries(RECEIPT_RESET_KEYS.map((k) => [k, RECEIPT_DEFAULTS[k]])) })
    setMsg({ ok: true, text: 'Defaults restored. Tap Save to keep them.' })
  }

  async function testPrint() {
    if (!c) return
    if (!canBluetoothPrint()) return setMsg({ ok: false, text: 'Test print needs the Android app and a Bluetooth receipt printer.' })
    setBusy('test')
    setMsg(null)
    try {
      await printSampleReceipt(c, sample)
      setMsg({ ok: true, text: 'Sample receipt sent to the printer.' })
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Could not print.' })
    }
    setBusy('')
  }

  async function pickLogo(file: File | undefined) {
    if (!file) return
    try {
      set('receipt_logo', await fileToThumbnail(file, 480, 0.9))
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Could not read this image.' })
    }
  }

  const preview = (
    <div className="space-y-3">
      <Segmented<PaymentStatus>
        label="Sample payment status"
        value={sample}
        onChange={setSample}
        options={[{ value: 'paid', label: 'Paid' }, { value: 'partial', label: 'Partial' }, { value: 'unpaid', label: 'Unpaid' }]}
      />
      <div className="rounded-xl bg-slate-100 p-3">
        <ThermalReceipt doc={doc} className="shadow-sm" />
      </div>
    </div>
  )
  const extraActions = (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" onClick={testPrint} disabled={!!busy} className={outline}>
        <Icon className="h-5 w-5">{I.printer}</Icon>{busy === 'test' ? 'Printing…' : 'Test print'}
      </button>
      <button type="button" onClick={reset} disabled={!!busy} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 font-semibold text-slate-600 active:bg-slate-100 disabled:opacity-60">
        <Icon className="h-5 w-5">{I.refresh}</Icon>Reset
      </button>
    </div>
  )

  return (
    <SubPage
      wide
      title="Receipt"
      text="What prints on customer receipts."
      onBack={() => onBack(unsaved)}
      onSubmit={save}
      bar={
        <SaveBar dirty={unsaved} busy={busy === 'save'} msg={msg} onDismiss={() => setMsg(null)}>
          <button type="button" onClick={() => setPreviewOpen(true)} className={`${outline} px-4 md:hidden`}>
            <Icon className="h-5 w-5">{I.eye}</Icon>Preview
          </button>
        </SaveBar>
      }
    >
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] md:items-start">
        <div className="min-w-0 space-y-4">
          <div>
            <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Business details</h2>
            <BusinessSummary name={c.business_name} address={c.business_address} contact={c.business_contact} onEdit={() => onEditBusiness(unsaved)} />
          </div>

          <Panel title="Logo" text="Printed in black and white at the top.">
            <LogoPicker
              has={!!c.receipt_logo}
              preview={c.receipt_logo ? <img src={c.receipt_logo} alt="Receipt logo" className="size-full object-contain" /> : <Icon className="h-7 w-7 text-slate-400">{I.store}</Icon>}
              onPick={pickLogo}
              onRemove={() => set('receipt_logo', '')}
              hint="Simple, high-contrast logos print best."
              extra={brand.brand_logo && c.receipt_logo !== brand.brand_logo && (
                <button type="button" onClick={() => set('receipt_logo', brand.brand_logo)} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 -ml-3 font-semibold text-blue-600 active:bg-blue-50">
                  <Icon className="h-5 w-5">{I.palette}</Icon>Use branding logo
                </button>
              )}
            />
          </Panel>

          <Panel title="Receipt text">
            <label className="block text-sm font-semibold text-slate-800">
              Header <span className="font-normal text-slate-500">(optional)</span>
              <textarea className={area} rows={2} placeholder="e.g. Open daily 7 AM - 8 PM" value={c.receipt_header} onChange={(e) => set('receipt_header', e.target.value)} />
            </label>
            <label className="block text-sm font-semibold text-slate-800">
              Footer message <span className="font-normal text-slate-500">(optional)</span>
              <textarea className={area} rows={3} placeholder="Thank you for your support!" value={c.receipt_footer} onChange={(e) => set('receipt_footer', e.target.value)} />
            </label>
          </Panel>

          <Panel title="Paper width" text={`Match your printer's roll · ${PAPER[c.receipt_paper].cols} characters per line`}>
            <Segmented<PaperWidth>
              label="Paper width"
              value={c.receipt_paper}
              onChange={(v) => set('receipt_paper', v)}
              options={[{ value: '58', label: '58 mm' }, { value: '80', label: '80 mm' }]}
            />
          </Panel>

          <Group title="Show on receipt" aside={<span className="text-xs tabular-nums text-slate-500">{shownCount} of {RECEIPT_TOGGLES.length} on</span>}>
            {RECEIPT_TOGGLES.map((t) => (
              <Row key={t.key} icon={t.icon} title={t.title} text={t.text}>
                <Toggle label={t.title} on={c[t.key] === '1'} onChange={(v) => set(t.key, v ? '1' : '0')} />
              </Row>
            ))}
          </Group>

          <div className="md:hidden">{extraActions}</div>
        </div>

        {/* Tablet/desktop: preview stays beside the form */}
        <aside className="hidden min-w-0 space-y-3 md:sticky md:top-4 md:block">
          <section className={`${card} space-y-3 p-4`}>
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-base font-bold text-slate-900">Preview</h2>
              <span className="text-sm text-slate-500">{c.receipt_paper} mm sample</span>
            </div>
            {preview}
          </section>
          {extraActions}
        </aside>
      </div>

      {previewOpen && (
        <Sheet label={`Preview · ${c.receipt_paper} mm`} onClose={() => setPreviewOpen(false)}>
          {preview}
          <button type="button" onClick={testPrint} disabled={!!busy} className={`${outline} mt-3 w-full`}>
            <Icon className="h-5 w-5">{I.printer}</Icon>{busy === 'test' ? 'Printing…' : 'Test print'}
          </button>
          {msg && <Toast msg={msg} onDismiss={() => setMsg(null)} className="mt-3" />}
        </Sheet>
      )}
    </SubPage>
  )
}

/** Theme color suggestions. Green, amber and red are left out: they already mean paid, pending and errors. */
const SWATCHES = [DEFAULT_PRIMARY, '#4f46e5', '#7c3aed', '#c026d3', '#db2777', '#0891b2', '#0f766e', '#334155']

/** Settings › Branding: logo and theme colors, with a live preview of the unsaved choices. */
function BrandingPanel({ onBack, onEditBusiness }: { onBack: (unsaved: boolean) => void; onEditBusiness: (unsaved: boolean) => void }) {
  const { brand, setBrand } = useBranding()
  const [b, setB] = useState<Branding>(brand)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)
  const [previewOpen, setPreviewOpen] = useState(false)

  const unsaved = BRANDING_KEYS.some((k) => b[k] !== brand[k])

  // Picking the stock blue means "default", so the exact built-in blue theme is used.
  const set = (k: keyof Branding, v: string) => {
    setB((x) => ({ ...x, [k]: k === 'brand_primary' && v.toLowerCase() === DEFAULT_PRIMARY ? '' : v }))
    setMsg(null)
  }

  async function pickLogo(file: File | undefined) {
    if (!file) return
    try {
      set('brand_logo', await fileToThumbnail(file, 320, 0.9))
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Could not read this image.' })
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!b.business_name.trim()) return setMsg({ ok: false, text: 'Business name is required. Set it in Business Information.' })
    const next = { ...b, business_name: b.business_name.trim(), brand_primary: b.brand_primary.toLowerCase(), brand_accent: b.brand_accent.toLowerCase() }
    setBusy(true)
    try {
      for (const k of BRANDING_KEYS) await setSetting(k, next[k])
      setB(next)
      setBrand(next)
      setMsg({ ok: true, text: 'Branding saved.' })
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Failed to save.' })
    }
    setBusy(false)
  }

  function reset() {
    setB((x) => ({ ...BRANDING_DEFAULTS, business_name: x.business_name }))
    setMsg({ ok: true, text: 'Blue theme and app logo restored. Tap Save to apply.' })
  }

  const preview = (
    <>
      <BrandPreview b={b} />
      <p className="text-sm text-slate-500">Status colors always stay green (paid), amber (pending) and red (unpaid, cancelled).</p>
    </>
  )

  return (
    <SubPage
      wide
      title="Branding"
      text="Your logo and colors across the app."
      onBack={() => onBack(unsaved)}
      onSubmit={save}
      bar={
        <SaveBar dirty={unsaved} busy={busy} msg={msg} onDismiss={() => setMsg(null)}>
          <button type="button" onClick={() => setPreviewOpen(true)} className={`${outline} px-4 md:hidden`}>
            <Icon className="h-5 w-5">{I.eye}</Icon>Preview
          </button>
        </SaveBar>
      }
    >
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] md:items-start">
        <div className="min-w-0 space-y-4">
          <div>
            <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Business name</h2>
            <BusinessSummary name={b.business_name} onEdit={() => onEditBusiness(unsaved)} />
          </div>

          <Panel title="Logo" text="Shown in the app header, sidebar and sign-in screen.">
            <LogoPicker
              has={!!b.brand_logo}
              preview={<LogoTile size="header" src={b.brand_logo} />}
              onPick={pickLogo}
              onRemove={() => set('brand_logo', '')}
              hint="A square logo works best. To print it on receipts, open Receipt and tap Use branding logo."
            />
          </Panel>

          <Panel title="Primary color" text="Buttons, active navigation, links, icons and selected items.">
            <ColorPicker label="Primary color" value={b.brand_primary || DEFAULT_PRIMARY} onChange={(v) => set('brand_primary', v)} />
          </Panel>

          <Panel
            title="Accent color"
            text="Highlights the last word of your business name. When off, the primary color is used."
            action={<Toggle label="Use an accent color" on={!!b.brand_accent} onChange={(on) => set('brand_accent', on ? '#0891b2' : '')} />}
          >
            {b.brand_accent ? <ColorPicker label="Accent color" value={b.brand_accent} onChange={(v) => set('brand_accent', v)} /> : null}
          </Panel>

          <button type="button" onClick={reset} disabled={busy} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl font-semibold text-slate-600 active:bg-slate-100 disabled:opacity-60 md:hidden">
            <Icon className="h-5 w-5">{I.refresh}</Icon>Reset to default theme
          </button>
        </div>

        <aside className="hidden min-w-0 space-y-3 md:sticky md:top-4 md:block">
          <section className={`${card} space-y-3 p-4`}>
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-base font-bold text-slate-900">Preview</h2>
              <span className={`text-sm ${unsaved ? 'font-semibold text-amber-700' : 'text-slate-500'}`}>{unsaved ? 'Not saved yet' : 'Current'}</span>
            </div>
            {preview}
          </section>
          <button type="button" onClick={reset} disabled={busy} className={`${outline} w-full`}>
            <Icon className="h-5 w-5">{I.refresh}</Icon>Reset to default theme
          </button>
        </aside>
      </div>

      {previewOpen && (
        <Sheet label="Preview" onClose={() => setPreviewOpen(false)}>
          <div className="space-y-3">{preview}</div>
        </Sheet>
      )}
    </SubPage>
  )
}

/** Swatches, the system color picker and a hex field. Says so when a color is darkened for readability. */
function ColorPicker({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const safe = isHex(value) ? readable(value) : ''
  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label={label} className="grid grid-cols-8 gap-2 max-[380px]:grid-cols-4">
        {SWATCHES.map((s) => {
          const on = s === value.toLowerCase()
          return (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={s.toUpperCase()}
              onClick={() => onChange(s)}
              style={{ backgroundColor: s }}
              className={`grid aspect-square min-h-11 w-full place-items-center rounded-full text-white ring-offset-2 transition active:scale-95 ${on ? 'ring-2 ring-slate-900' : ''}`}
            >
              {on && <Icon className="h-5 w-5">{I.tick}</Icon>}
            </button>
          )
        })}
      </div>
      <div className="flex items-center gap-3">
        <label className="relative shrink-0">
          <span className="sr-only">{label}: custom</span>
          <input
            type="color"
            value={isHex(value) ? value.toLowerCase() : DEFAULT_PRIMARY}
            onChange={(e) => onChange(e.target.value)}
            className="h-12 w-16 cursor-pointer rounded-xl border border-slate-200 bg-white p-1"
          />
        </label>
        {/* Remounts when the color changes elsewhere; a typed code applies on Enter or when leaving the field. */}
        <HexInput key={value} label={label} value={value} onChange={onChange} />
        <span className="text-sm text-slate-500">Custom</span>
      </div>
      {safe && safe !== value.toLowerCase() && (
        <p className="flex items-center gap-2 text-sm text-slate-600">
          <span className="size-4 shrink-0 rounded-full" style={{ backgroundColor: safe }} />
          Darkened to {safe.toUpperCase()} so text stays readable.
        </p>
      )}
    </div>
  )
}

function HexInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value.toUpperCase())
  const commit = () => {
    const v = text.trim().replace(/^#?/, '#')
    if (isHex(v)) onChange(v.toLowerCase())
    else setText(value.toUpperCase())
  }
  return (
    <input
      className="min-h-12 w-32 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-base uppercase tabular-nums outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      aria-label={`${label}: hex code`}
      maxLength={7}
      spellCheck={false}
      autoCapitalize="characters"
      enterKeyHint="done"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit() } }}
    />
  )
}

/** Sample of the main UI pieces in the unsaved colors: the theme variables are scoped to this box, the app is untouched. */
function BrandPreview({ b }: { b: Branding }) {
  const chip = 'rounded-full px-4 py-1.5 text-sm font-medium'
  return (
    <div aria-hidden style={themeVars(b) as CSSProperties} className="rounded-xl bg-slate-100 p-3">
      <div className="space-y-4 rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <LogoTile size="header" src={b.brand_logo} />
          <div className="min-w-0">
            <div className="truncate text-lg font-bold leading-tight tracking-tight text-slate-900"><BrandName name={b.business_name} /></div>
            <div className="truncate text-xs text-slate-500">Laundry Management System</div>
          </div>
        </div>
        <div className="flex gap-2">
          <span className={`${primary} flex-1`}><Icon className="h-5 w-5">{I.plus}</Icon>New Order</span>
          <span className={`${outline} flex-1`}><Icon className="h-5 w-5">{I.printer}</Icon>Print</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={`${chip} bg-blue-600 text-white shadow-sm shadow-blue-600/30`}>All</span>
          <span className={`${chip} bg-slate-200/60 text-slate-600`}>Washing</span>
          <span className={`${chip} bg-slate-200/60 text-slate-600`}>Ready</span>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-600"><Icon className="h-5 w-5">{I.receipt}</Icon></span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-slate-900">SL-000123</span>
            <span className="text-sm font-semibold text-blue-600">View details</span>
          </span>
          <StatusBadge status="washing" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <PaymentBadge status="paid" /><PaymentBadge status="partial" /><PaymentBadge status="unpaid" /><StatusBadge status="cancelled" />
        </div>
        <div className="grid grid-cols-3 border-t border-slate-100 pt-2 text-xs">
          {[{ icon: I.home, label: 'Home', on: true }, { icon: I.orders, label: 'Orders', on: false }, { icon: I.users, label: 'Customers', on: false }].map((t) => (
            <span key={t.label} className={`flex flex-col items-center gap-0.5 ${t.on ? 'font-semibold text-blue-600' : 'font-medium text-slate-500'}`}>
              <Icon className={`h-6 w-6 ${t.on ? 'fill-blue-100' : ''}`}>{t.icon}</Icon>
              {t.label}
              <span className={`h-1 w-8 rounded-full ${t.on ? 'bg-blue-600' : 'bg-transparent'}`} />
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
