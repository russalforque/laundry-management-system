import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { LogoTile } from '../../components/AuthScreen'
import BackupPanel from '../../components/BackupPanel'
import { Segmented, Toggle } from '../../components/Controls'
import { I, Icon } from '../../components/Icons'
import { BackHeader, card, Field, field, primary } from '../../components/Manage'
import { PrinterPanel } from '../../components/settings/PrinterPanel'
import {
  AboutCard, area, BrandPreview, BusinessSummary, ColorPicker, Group, LogoPicker, okToLeave, outline, Panel, RECEIPT_TOGGLES, ReceiptHeaderPreview, Row, UnitInput,
} from '../../components/settings/SettingsParts'
import { Sheet } from '../../components/Sheet'
import ThermalReceipt from '../../components/ThermalReceipt'
import { Toast, useAutoDismiss, type Msg } from '../../components/Toast'
import { useAuth } from '../../context/AuthContext'
import { useBranding } from '../../context/BrandingContext'
import { BUSINESS_KEYS, SYSTEM_KEYS, useBrandingSettings, useReceiptSettings, useSettingsForm, type SettingsView as View } from '../../hooks/useSettings'
import { brandName, DEFAULT_PRIMARY } from '../../lib/branding'
import { PAPER, type PaperWidth } from '../../lib/receipt'
import type { PaymentStatus } from '../../types'

/** Phone Settings: a hub of rows, each opening its own screen (?view=…) with a back header and a pinned Save bar. */
export default function MobileSettings() {
  const [params, setParams] = useSearchParams()
  const { state } = useLocation()
  const navigate = useNavigate()
  const nav = state as { anchor?: string; fromHub?: boolean } | null
  // The More sheet's "Backup & Restore" shortcut arrives with { anchor: 'backup' }.
  const view = (params.get('view') ?? (nav?.anchor === 'backup' ? 'backup' : 'hub')) as View
  const { f, set, dirty, save, busy, msg, setMsg, load } = useSettingsForm()
  const { can } = useAuth()

  useEffect(() => { setMsg(null); document.querySelector('main')?.scrollTo(0, 0) }, [view, setMsg])

  const open = (v: View) => setParams({ view: v }, { state: { fromHub: true } })
  // Leaving a sub-screen discards unsaved edits (after asking).
  const back = (unsaved = false) => {
    if (!okToLeave(unsaved)) return
    load()
    if (nav?.fromHub) navigate(-1)
    else setParams({}, { replace: true })
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
          <ReceiptHeaderPreview name={f.business_name} address={f.business_address} contact={f.business_contact} />
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
        <AboutCard />
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

/** Sub-screen shell: back header with a one-line description; a form when `onSubmit` is given, with `bar` pinned last. */
function SubPage({ title, text, onBack, onSubmit, bar, children }: {
  title: string; text?: string; onBack: () => void; onSubmit?: (e: FormEvent) => void; bar?: ReactNode; children: ReactNode
}) {
  const cls = 'mx-auto max-w-2xl space-y-4'
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
    <div className="sticky bottom-0 z-20 -mx-4 -mb-4 border-t border-slate-200/70 bg-white/95 px-4 pb-4 pt-3 shadow-[0_-4px_20px_rgba(15,23,42,0.06)] backdrop-blur">
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

/** Settings › Receipt: what the printed receipt shows; the live preview of the printout opens in a sheet. */
function ReceiptPanel({ onBack, onEditBusiness }: { onBack: (unsaved: boolean) => void; onEditBusiness: (unsaved: boolean) => void }) {
  const r = useReceiptSettings()
  const [previewOpen, setPreviewOpen] = useState(false)
  const { c, set, unsaved, busy, msg, setMsg, doc } = r
  if (!c || !doc) return null
  const shownCount = RECEIPT_TOGGLES.filter((t) => c[t.key] === '1').length

  const preview = (
    <div className="space-y-3">
      <Segmented<PaymentStatus>
        label="Sample payment status"
        value={r.sample}
        onChange={r.setSample}
        options={[{ value: 'paid', label: 'Paid' }, { value: 'partial', label: 'Partial' }, { value: 'unpaid', label: 'Unpaid' }]}
      />
      <div className="rounded-xl bg-slate-100 p-3">
        <ThermalReceipt doc={doc} className="shadow-sm" />
      </div>
    </div>
  )

  return (
    <SubPage
      title="Receipt"
      text="What prints on customer receipts."
      onBack={() => onBack(unsaved)}
      onSubmit={r.save}
      bar={
        <SaveBar dirty={unsaved} busy={busy === 'save'} msg={msg} onDismiss={() => setMsg(null)}>
          <button type="button" onClick={() => setPreviewOpen(true)} className={`${outline} px-4`}>
            <Icon className="h-5 w-5">{I.eye}</Icon>Preview
          </button>
        </SaveBar>
      }
    >
      <div>
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Business details</h2>
        <BusinessSummary name={c.business_name} address={c.business_address} contact={c.business_contact} onEdit={() => onEditBusiness(unsaved)} />
      </div>

      <Panel title="Logo" text="Printed in black and white at the top.">
        <LogoPicker
          has={!!c.receipt_logo}
          preview={c.receipt_logo ? <img src={c.receipt_logo} alt="Receipt logo" className="size-full object-contain" /> : <Icon className="h-7 w-7 text-slate-400">{I.store}</Icon>}
          onPick={r.pickLogo}
          onRemove={() => set('receipt_logo', '')}
          hint="Simple, high-contrast logos print best."
          extra={r.brandLogo && c.receipt_logo !== r.brandLogo && (
            <button type="button" onClick={() => set('receipt_logo', r.brandLogo)} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 -ml-3 font-semibold text-blue-600 active:bg-blue-50">
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

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={r.testPrint} disabled={!!busy} className={outline}>
          <Icon className="h-5 w-5">{I.printer}</Icon>{busy === 'test' ? 'Printing…' : 'Test print'}
        </button>
        <button type="button" onClick={r.reset} disabled={!!busy} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 font-semibold text-slate-600 active:bg-slate-100 disabled:opacity-60">
          <Icon className="h-5 w-5">{I.refresh}</Icon>Reset
        </button>
      </div>

      {previewOpen && (
        <Sheet label={`Preview · ${c.receipt_paper} mm`} onClose={() => setPreviewOpen(false)}>
          {preview}
          <button type="button" onClick={r.testPrint} disabled={!!busy} className={`${outline} mt-3 w-full`}>
            <Icon className="h-5 w-5">{I.printer}</Icon>{busy === 'test' ? 'Printing…' : 'Test print'}
          </button>
          {msg && <Toast msg={msg} onDismiss={() => setMsg(null)} className="mt-3" />}
        </Sheet>
      )}
    </SubPage>
  )
}

/** Settings › Branding: logo and theme colors; the live preview of the unsaved choices opens in a sheet. */
function BrandingPanel({ onBack, onEditBusiness }: { onBack: (unsaved: boolean) => void; onEditBusiness: (unsaved: boolean) => void }) {
  const { b, set, unsaved, pickLogo, save, reset, busy, msg, setMsg } = useBrandingSettings()
  const [previewOpen, setPreviewOpen] = useState(false)

  return (
    <SubPage
      title="Branding"
      text="Your logo and colors across the app."
      onBack={() => onBack(unsaved)}
      onSubmit={save}
      bar={
        <SaveBar dirty={unsaved} busy={busy} msg={msg} onDismiss={() => setMsg(null)}>
          <button type="button" onClick={() => setPreviewOpen(true)} className={`${outline} px-4`}>
            <Icon className="h-5 w-5">{I.eye}</Icon>Preview
          </button>
        </SaveBar>
      }
    >
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

      <button type="button" onClick={reset} disabled={busy} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl font-semibold text-slate-600 active:bg-slate-100 disabled:opacity-60">
        <Icon className="h-5 w-5">{I.refresh}</Icon>Reset to default theme
      </button>

      {previewOpen && (
        <Sheet label="Preview" onClose={() => setPreviewOpen(false)}>
          <div className="space-y-3">
            <BrandPreview b={b} />
            <p className="text-sm text-slate-500">Status colors always stay green (paid), amber (pending) and red (unpaid, cancelled).</p>
          </div>
        </Sheet>
      )}
    </SubPage>
  )
}
