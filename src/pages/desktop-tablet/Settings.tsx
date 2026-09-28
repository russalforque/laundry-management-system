import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { LogoTile } from '../../components/AuthScreen'
import BackupPanel from '../../components/BackupPanel'
import { Segmented, Toggle } from '../../components/Controls'
import { btnPrimary, btnSecondary, PageHeader, panelCls, useSplit } from '../../components/desktop-tablet/ui'
import { I, Icon } from '../../components/Icons'
import { Field, field } from '../../components/Manage'
import { PrinterPanel } from '../../components/settings/PrinterPanel'
import {
  AboutCard, area, BrandPreview, BusinessSummary, ColorPicker, Group, LogoPicker, okToLeave, outline, Panel, RECEIPT_TOGGLES, ReceiptHeaderPreview, Row, UnitInput,
} from '../../components/settings/SettingsParts'
import ThermalReceipt from '../../components/ThermalReceipt'
import { Toast, useAutoDismiss, type Msg } from '../../components/Toast'
import { useAuth } from '../../context/AuthContext'
import { BUSINESS_KEYS, SYSTEM_KEYS, useBrandingSettings, useReceiptSettings, useSettingsForm, type SettingsView } from '../../hooks/useSettings'
import { DEFAULT_PRIMARY } from '../../lib/branding'
import type { Permission } from '../../lib/permissions'
import { PAPER, type PaperWidth } from '../../lib/receipt'
import type { PaymentStatus } from '../../types'

type Section = Exclude<SettingsView, 'hub'>

const SECTIONS: { id: Section; label: string; title: string; text: string; icon: ReactNode; perm?: Permission }[] = [
  { id: 'business', label: 'Business', title: 'Business Information', text: 'Your business details, shown in the app and on every receipt.', icon: I.store },
  { id: 'branding', label: 'Branding', title: 'Branding', text: 'Your logo and colors across the app.', icon: I.palette },
  { id: 'receipt', label: 'Receipt', title: 'Receipt', text: 'What prints on customer receipts.', icon: I.receipt },
  { id: 'printer', label: 'Printer', title: 'Receipt Printer', text: 'Bluetooth thermal printer and cash drawer.', icon: I.printer },
  { id: 'system', label: 'Preferences', title: 'App Preferences', text: 'Order defaults, pricing rules and automatic backup.', icon: I.gear },
  { id: 'backup', label: 'Backup', title: 'Backup & Restore', text: 'Keep a copy of your data and bring it back when needed.', icon: I.cloud, perm: 'backup.manage' },
  { id: 'about', label: 'About', title: 'About', text: 'App information.', icon: I.info },
]

/** Save state and button for a section's header: unsaved dot, "All changes saved", or the save in progress. */
function SaveActions({ dirty, busy, children }: { dirty: boolean; busy: boolean; children?: ReactNode }) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-3">
      <p className="text-sm" aria-live="polite">
        {dirty
          ? <span className="flex items-center gap-2 font-semibold text-amber-700"><span className="size-2 shrink-0 rounded-full bg-amber-500" />Unsaved changes</span>
          : <span className="text-slate-500">{busy ? 'Saving…' : 'All changes saved'}</span>}
      </p>
      {children}
      <button disabled={busy || !dirty} className={`${btnPrimary} px-6`}>{busy ? 'Saving…' : 'Save changes'}</button>
    </div>
  )
}

/** One settings section: its title and description, header actions, and the result of the last save. */
function SectionShell({ section, onSubmit, actions, msg, onDismiss, children }: {
  section: Section; onSubmit?: (e: FormEvent) => void; actions?: ReactNode; msg?: Msg; onDismiss?: () => void; children: ReactNode
}) {
  useAutoDismiss(msg ?? null, () => onDismiss?.())
  const s = SECTIONS.find((x) => x.id === section)!
  const body = (
    <>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 border-b border-slate-200 pb-4">
        <div className="min-w-0">
          <h2 className="text-xl font-bold tracking-tight text-slate-900">{s.title}</h2>
          <p className="mt-0.5 text-sm text-slate-500">{s.text}</p>
        </div>
        {actions}
      </div>
      {msg && onDismiss && <Toast msg={msg} onDismiss={onDismiss} />}
      {children}
    </>
  )
  return onSubmit ? <form onSubmit={onSubmit} className="space-y-5">{body}</form> : <div className="space-y-5">{body}</div>
}

function ReceiptSection({ onDirty, onEditBusiness }: { onDirty: (d: boolean) => void; onEditBusiness: () => void }) {
  const r = useReceiptSettings()
  const { c, set, unsaved, busy, msg, setMsg, doc } = r
  useEffect(() => { onDirty(unsaved) }, [unsaved, onDirty])
  if (!c || !doc) return <div className="h-96 animate-pulse rounded-2xl bg-slate-200/60" aria-busy="true" />
  const shownCount = RECEIPT_TOGGLES.filter((t) => c[t.key] === '1').length

  return (
    <SectionShell
      section="receipt"
      onSubmit={r.save}
      msg={msg}
      onDismiss={() => setMsg(null)}
      actions={<SaveActions dirty={unsaved} busy={busy === 'save'} />}
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start">
        <div className="min-w-0 space-y-4">
          <div>
            <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Business details</h3>
            <BusinessSummary name={c.business_name} address={c.business_address} contact={c.business_contact} onEdit={onEditBusiness} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
            <Panel title="Logo" text="Printed in black and white at the top.">
              <LogoPicker
                has={!!c.receipt_logo}
                preview={c.receipt_logo ? <img src={c.receipt_logo} alt="Receipt logo" className="size-full object-contain" /> : <Icon className="h-7 w-7 text-slate-400">{I.store}</Icon>}
                onPick={r.pickLogo}
                onRemove={() => set('receipt_logo', '')}
                hint="Simple, high-contrast logos print best."
                extra={r.brandLogo && c.receipt_logo !== r.brandLogo && (
                  <button type="button" onClick={() => set('receipt_logo', r.brandLogo)} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 -ml-3 font-semibold text-blue-600 hover:bg-blue-50">
                    <Icon className="h-5 w-5">{I.palette}</Icon>Use branding logo
                  </button>
                )}
              />
            </Panel>
            <Panel title="Paper width" text={`Match your printer's roll · ${PAPER[c.receipt_paper].cols} characters per line`}>
              <Segmented<PaperWidth>
                label="Paper width"
                value={c.receipt_paper}
                onChange={(v) => set('receipt_paper', v)}
                options={[{ value: '58', label: '58 mm' }, { value: '80', label: '80 mm' }]}
              />
            </Panel>
          </div>

          <Panel title="Receipt text">
            <div className="grid gap-4 lg:grid-cols-2">
              <label className="block text-sm font-semibold text-slate-800">
                Header <span className="font-normal text-slate-500">(optional)</span>
                <textarea className={area} rows={3} placeholder="e.g. Open daily 7 AM - 8 PM" value={c.receipt_header} onChange={(e) => set('receipt_header', e.target.value)} />
              </label>
              <label className="block text-sm font-semibold text-slate-800">
                Footer message <span className="font-normal text-slate-500">(optional)</span>
                <textarea className={area} rows={3} placeholder="Thank you for your support!" value={c.receipt_footer} onChange={(e) => set('receipt_footer', e.target.value)} />
              </label>
            </div>
          </Panel>

          <Group title="Show on receipt" aside={<span className="text-xs tabular-nums text-slate-500">{shownCount} of {RECEIPT_TOGGLES.length} on</span>}>
            <div className="grid divide-y divide-slate-100 lg:grid-cols-2 lg:divide-y-0">
              {RECEIPT_TOGGLES.map((t) => (
                <div key={t.key} className="lg:border-b lg:border-slate-100 lg:odd:border-r">
                  <Row icon={t.icon} title={t.title} text={t.text}>
                    <Toggle label={t.title} on={c[t.key] === '1'} onChange={(v) => set(t.key, v ? '1' : '0')} />
                  </Row>
                </div>
              ))}
            </div>
          </Group>
        </div>

        <aside aria-label="Receipt preview" className="min-w-0 space-y-3 xl:sticky xl:top-0">
          <section className={`${panelCls} space-y-3 p-4`}>
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-base font-bold text-slate-900">Preview</h3>
              <span className="text-sm text-slate-500">{c.receipt_paper} mm sample</span>
            </div>
            <Segmented<PaymentStatus>
              label="Sample payment status"
              value={r.sample}
              onChange={r.setSample}
              options={[{ value: 'paid', label: 'Paid' }, { value: 'partial', label: 'Partial' }, { value: 'unpaid', label: 'Unpaid' }]}
            />
            <div className="rounded-xl bg-slate-100 p-3">
              <ThermalReceipt doc={doc} className="shadow-sm" />
            </div>
          </section>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={r.testPrint} disabled={!!busy} className={outline}>
              <Icon className="h-5 w-5">{I.printer}</Icon>{busy === 'test' ? 'Printing…' : 'Test print'}
            </button>
            <button type="button" onClick={r.reset} disabled={!!busy} className={btnSecondary}>
              <Icon className="h-5 w-5">{I.refresh}</Icon>Reset
            </button>
          </div>
        </aside>
      </div>
    </SectionShell>
  )
}

function BrandingSection({ onDirty, onEditBusiness }: { onDirty: (d: boolean) => void; onEditBusiness: () => void }) {
  const { b, set, unsaved, pickLogo, save, reset, busy, msg, setMsg } = useBrandingSettings()
  useEffect(() => { onDirty(unsaved) }, [unsaved, onDirty])

  return (
    <SectionShell
      section="branding"
      onSubmit={save}
      msg={msg}
      onDismiss={() => setMsg(null)}
      actions={
        <SaveActions dirty={unsaved} busy={busy}>
          <button type="button" onClick={reset} disabled={busy} className={btnSecondary}><Icon className="h-5 w-5">{I.refresh}</Icon>Reset to default theme</button>
        </SaveActions>
      }
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start">
        <div className="min-w-0 space-y-4">
          <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
            <div>
              <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Business name</h3>
              <BusinessSummary name={b.business_name} onEdit={onEditBusiness} />
            </div>
            <Panel title="Logo" text="Shown in the app header, sidebar and sign-in screen.">
              <LogoPicker
                has={!!b.brand_logo}
                preview={<LogoTile size="header" src={b.brand_logo} />}
                onPick={pickLogo}
                onRemove={() => set('brand_logo', '')}
                hint="A square logo works best. To print it on receipts, open Receipt and use the branding logo."
              />
            </Panel>
          </div>
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
        </div>

        <aside aria-label="Branding preview" className="min-w-0 xl:sticky xl:top-0">
          <section className={`${panelCls} space-y-3 p-4`}>
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-base font-bold text-slate-900">Preview</h3>
              <span className={`text-sm ${unsaved ? 'font-semibold text-amber-700' : 'text-slate-500'}`}>{unsaved ? 'Not saved yet' : 'Current'}</span>
            </div>
            <BrandPreview b={b} />
            <p className="text-sm text-slate-500">Status colors always stay green (paid), amber (pending) and red (unpaid, cancelled).</p>
          </section>
        </aside>
      </div>
    </SectionShell>
  )
}

/**
 * Settings on tablets and desktops: every section one tab away (the app sidebar stays in place), each shown
 * in full with Save in its header and, for Receipt and Branding, the live preview beside the form. Same data,
 * validation and saves as the phone screens (hooks/useSettings.ts). Leaving a section with unsaved edits asks first.
 */
export default function Settings() {
  const { can } = useAuth()
  const [params, setParams] = useSearchParams()
  const { state } = useLocation()
  const split = useSplit()
  const sections = SECTIONS.filter((s) => !s.perm || can(s.perm))
  // A "Backup" shortcut arrives with { anchor: 'backup' }; the phone hub (view=hub) has no page of its own here.
  const asked = (params.get('view') ?? ((state as { anchor?: string } | null)?.anchor === 'backup' ? 'backup' : 'business')) as SettingsView
  const view: Section = sections.some((s) => s.id === asked) ? (asked as Section) : 'business'
  const form = useSettingsForm()
  const { f, set, save, busy, msg, setMsg } = form
  const [childDirty, setChildDirty] = useState(false)
  const dirty = view === 'business' ? form.dirty(BUSINESS_KEYS) : view === 'system' ? form.dirty(SYSTEM_KEYS) : childDirty

  useEffect(() => { setMsg(null) }, [view, setMsg])

  function go(v: Section) {
    if (v === view || !okToLeave(dirty)) return
    if (view === 'business' || view === 'system') form.load() // drop the discarded edits
    setChildDirty(false)
    setParams({ view: v }, { replace: true })
  }

  let content: ReactNode
  if (view === 'business') {
    content = (
      <SectionShell section="business" onSubmit={(e) => save(BUSINESS_KEYS, e)} msg={msg} onDismiss={() => setMsg(null)} actions={<SaveActions dirty={dirty} busy={busy} />}>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start">
          <Panel title="Business details">
            <Field label="Business name" icon={I.store} required>
              <input className={field} placeholder="Enter business name" autoComplete="organization" value={f.business_name} onChange={(e) => set('business_name', e.target.value)} required />
            </Field>
            <div className="grid gap-4 lg:grid-cols-2">
              <Field label="Address" icon={I.pin}>
                <input className={field} placeholder="Street, city" autoComplete="street-address" value={f.business_address} onChange={(e) => set('business_address', e.target.value)} />
              </Field>
              <Field label="Contact number" icon={I.phone}>
                <input className={field} type="tel" inputMode="tel" placeholder="09XX XXX XXXX" autoComplete="tel" value={f.business_contact} onChange={(e) => set('business_contact', e.target.value)} />
              </Field>
            </div>
          </Panel>
          <Panel title="Receipt header" text="How these details print at the top of receipts.">
            <ReceiptHeaderPreview name={f.business_name} address={f.business_address} contact={f.business_contact} />
            <button type="button" onClick={() => go('receipt')} className={`${outline} w-full`}>
              <Icon className="h-5 w-5">{I.receipt}</Icon>Receipt logo, text & layout
            </button>
          </Panel>
        </div>
      </SectionShell>
    )
  } else if (view === 'system') {
    content = (
      <SectionShell section="system" onSubmit={(e) => save(SYSTEM_KEYS, e)} msg={msg} onDismiss={() => setMsg(null)} actions={<SaveActions dirty={dirty} busy={busy} />}>
        <div className="grid gap-5 xl:grid-cols-2 xl:items-start">
          <div className="space-y-5">
            <Group title="Orders">
              <Row icon={I.calendar} title="Default pickup" text="Days after receiving. Leave blank for no default.">
                <UnitInput label="Default pickup days" unit="days" decimals={0} maxInt={2} value={f.default_pickup_days} onChange={(v) => set('default_pickup_days', v)} />
              </Row>
            </Group>
            <Group title="Pricing">
              <Row icon={I.layers} title="Max weight per load" text="Loads are counted from weight (8 kg: 8.1 kg = 2 loads). Blank to enter loads by hand. Items can override it.">
                <UnitInput label="Max weight per load in kg" unit="kg" decimals={2} maxInt={3} value={f.load_max_kg} onChange={(v) => set('load_max_kg', v)} />
              </Row>
              {can('services.manage') && <Row icon={I.receipt} title="Prices, packages & add-ons" text="Edit services, packages and what they include" to="/services" />}
            </Group>
          </div>
          <Group title="Data">
            <Row icon={I.database} title="Auto backup" text="Daily, when the app is first opened">
              <Toggle label="Auto backup" on={f.auto_backup !== '0'} onChange={(on) => set('auto_backup', on ? '1' : '0')} />
            </Row>
            {can('backup.manage') && <Row icon={I.cloud} title="Backup & restore" text="Export, import and restore data" onClick={() => go('backup')} />}
          </Group>
        </div>
      </SectionShell>
    )
  } else if (view === 'receipt') {
    content = <ReceiptSection onDirty={setChildDirty} onEditBusiness={() => go('business')} />
  } else if (view === 'branding') {
    content = <BrandingSection onDirty={setChildDirty} onEditBusiness={() => go('business')} />
  } else if (view === 'printer') {
    content = <SectionShell section="printer"><div className="max-w-3xl space-y-4"><PrinterPanel /></div></SectionShell>
  } else if (view === 'backup') {
    content = <SectionShell section="backup"><div id="backup" className="max-w-3xl"><BackupPanel /></div></SectionShell>
  } else {
    content = <SectionShell section="about"><div className="max-w-xl"><AboutCard /></div></SectionShell>
  }

  const links = SETTINGS_LINKS.filter((l) => !l.perm || can(l.perm))

  if (!split) {
    // Portrait: sections as one scrolling row of tabs; the related pages stay in the header.
    return (
      <div className="mx-auto max-w-7xl space-y-4 pb-6">
        <PageHeader
          title="Settings"
          sub="Business, receipts, printing and app preferences."
          actions={links.map((l) => <Link key={l.to} to={l.to} className={btnSecondary}><Icon className="h-5 w-5">{l.icon}</Icon>{l.short}</Link>)}
        />
        <nav aria-label="Settings sections" className={`${panelCls} p-1.5`}>
          <ul role="tablist" className="flex gap-1 overflow-x-auto scrollbar-none">
            {sections.map((s) => (
              <li key={s.id} className="shrink-0">
                <button
                  type="button"
                  role="tab"
                  aria-selected={view === s.id}
                  onClick={() => go(s.id)}
                  className={`flex min-h-11 items-center gap-2 whitespace-nowrap rounded-xl px-4 text-sm font-semibold ${
                    view === s.id ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0">{s.icon}</Icon>{s.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        {content}
      </div>
    )
  }

  // Landscape: grouped section list on the left (like a native settings app), the open section beside it.
  return (
    <div className="mx-auto max-w-7xl space-y-4 pb-6">
      <PageHeader title="Settings" sub="Business, receipts, printing and app preferences." />
      <div className="grid grid-cols-[15rem_minmax(0,1fr)] items-start gap-5">
        <nav aria-label="Settings sections" className={`${panelCls} sticky top-0 space-y-3 p-2`}>
          {SECTION_GROUPS.map((g) => {
            const list = sections.filter((s) => g.ids.includes(s.id))
            if (!list.length) return null
            return (
              <section key={g.title}>
                <h2 className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{g.title}</h2>
                <ul role="tablist" aria-orientation="vertical" aria-label={g.title} className="space-y-0.5">
                  {list.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={view === s.id}
                        onClick={() => go(s.id)}
                        className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] ${
                          view === s.id ? 'bg-blue-50 font-semibold text-blue-700' : 'font-medium text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <Icon className={`h-5 w-5 shrink-0 ${view === s.id ? 'text-blue-600' : 'text-slate-400'}`}>{s.icon}</Icon>{s.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
          {links.length > 0 && (
            <section>
              <h2 className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Managed on their own pages</h2>
              <ul className="space-y-0.5">
                {links.map((l) => (
                  <li key={l.to}>
                    <Link to={l.to} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-[15px] font-medium text-slate-700 hover:bg-slate-100">
                      <Icon className="h-5 w-5 shrink-0 text-slate-400">{l.icon}</Icon>
                      <span className="min-w-0 flex-1 truncate">{l.label}</span>
                      <Icon className="h-4 w-4 shrink-0 text-slate-300">{I.chevron}</Icon>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </nav>
        <div className="min-w-0">{content}</div>
      </div>
    </div>
  )
}

/** Landscape section list, in the order an owner sets the shop up. */
const SECTION_GROUPS: { title: string; ids: Section[] }[] = [
  { title: 'Business', ids: ['business', 'branding'] },
  { title: 'Receipts & printing', ids: ['receipt', 'printer'] },
  { title: 'App', ids: ['system', 'backup', 'about'] },
]

/** Settings that live on their own pages, reachable from here too. */
const SETTINGS_LINKS: { to: string; label: string; short: string; icon: ReactNode; perm?: Permission }[] = [
  { to: '/services', label: 'Services & prices', short: 'Services', icon: I.shirt, perm: 'services.manage' },
  { to: '/users', label: 'Users & roles', short: 'Users', icon: I.users, perm: 'users.manage' },
  { to: '/account', label: 'My account & PIN', short: 'Change PIN', icon: I.shield },
]
