import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { Msg } from '../components/Toast'
import { useBranding } from '../context/BrandingContext'
import { getSettings, setSetting } from '../db/settings'
import { BRANDING_DEFAULTS, BRANDING_KEYS, DEFAULT_PRIMARY, type Branding } from '../lib/branding'
import { fileToThumbnail } from '../lib/image'
import { canBluetoothPrint, printSampleReceipt } from '../lib/printer'
import {
  logoBitmap, orderReceipt, RECEIPT_DEFAULTS, RECEIPT_KEYS, RECEIPT_RESET_KEYS, receiptConfig, sampleOrder,
  type Bitmap, type ReceiptConfig, type ReceiptKey,
} from '../lib/receipt'
import type { PaymentStatus } from '../types'

/**
 * Settings logic shared by pages/mobile/MobileSettings.tsx and pages/desktop-tablet/Settings.tsx:
 * the business / system form, receipt layout and branding, each with its validation and save.
 */

export type SettingsView = 'hub' | 'business' | 'branding' | 'receipt' | 'system' | 'printer' | 'backup' | 'about'

const blank = { business_name: '', business_address: '', business_contact: '', default_pickup_days: '', load_max_kg: '', auto_backup: '1' }
export type SettingsForm = typeof blank
// Receipt footer lives on the Receipt screen only; name/address/contact only here.
export const BUSINESS_KEYS: (keyof SettingsForm)[] = ['business_name', 'business_address', 'business_contact']
export const SYSTEM_KEYS: (keyof SettingsForm)[] = ['default_pickup_days', 'load_max_kg', 'auto_backup']

/** Business information and system settings: one form, saved per screen (`keys`). */
export function useSettingsForm() {
  const [f, setF] = useState<SettingsForm>(blank)
  const [saved, setSaved] = useState<SettingsForm>(blank)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)
  const { brand, setBrand } = useBranding()

  const load = useCallback(async () => {
    const s = await getSettings()
    const next = Object.fromEntries(Object.keys(blank).map((k) => [k, s[k] ?? blank[k as keyof SettingsForm]])) as SettingsForm
    setF(next)
    setSaved(next)
  }, [])
  useEffect(() => { load() }, [load])

  const set = (k: keyof SettingsForm, v: string) => { setF((x) => ({ ...x, [k]: v })); setMsg(null) }
  const dirty = (keys: (keyof SettingsForm)[]) => keys.some((k) => f[k] !== saved[k])

  async function save(keys: (keyof SettingsForm)[], e: FormEvent) {
    e.preventDefault()
    const days = f.default_pickup_days.trim()
    if (keys.includes('business_name') && !f.business_name.trim()) return setMsg({ ok: false, text: 'Business name is required.' })
    if (keys.includes('default_pickup_days') && days && !/^\d{1,2}$/.test(days)) return setMsg({ ok: false, text: 'Default pickup days must be a whole number from 0 to 99.' })
    const maxKg = f.load_max_kg.trim()
    if (keys.includes('load_max_kg') && maxKg && !(/^\d{1,3}(\.\d{1,2})?$/.test(maxKg) && Number(maxKg) > 0)) return setMsg({ ok: false, text: 'Max weight per load must be a number above 0 (up to 2 decimals).' })
    setBusy(true)
    try {
      const trimmed = Object.fromEntries(keys.map((k) => [k, f[k].trim()])) as Partial<SettingsForm>
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

  return { f, set, dirty, save, busy, msg, setMsg, load }
}

/** Settings › Receipt: what the printed receipt shows, with a live preview document of the exact printout. */
export function useReceiptSettings() {
  const [c, setC] = useState<ReceiptConfig | null>(null)
  const [saved, setSaved] = useState<ReceiptConfig | null>(null)
  const [logo, setLogo] = useState<Bitmap | null>(null)
  const [sample, setSample] = useState<PaymentStatus>('partial')
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState<Msg>(null)
  const { brand, setBrand } = useBranding()

  useEffect(() => { getSettings().then((s) => { const r = receiptConfig(s); setC(r); setSaved(r) }).catch(console.error) }, [])

  // The logo is dithered to 1-bit dots for the preview, exactly as it will print.
  const logoSrc = c?.receipt_logo ?? ''
  const paper = c?.receipt_paper ?? '58'
  useEffect(() => {
    let live = true
    logoBitmap(logoSrc, paper).catch(() => null).then((b) => { if (live) setLogo(b) })
    return () => { live = false }
  }, [logoSrc, paper])

  const unsaved = !!c && !!saved && RECEIPT_KEYS.some((k) => c[k] !== saved[k])
  const set = (k: ReceiptKey, v: string) => { setC((x) => x && { ...x, [k]: v }); setMsg(null) }

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

  return {
    c, set, unsaved, save, reset, testPrint, pickLogo, busy, msg, setMsg, sample, setSample,
    /** The branding logo, offered as the receipt logo when it differs. */
    brandLogo: brand.brand_logo,
    /** The receipt document the preview renders (null until the settings load). */
    doc: c ? orderReceipt(sampleOrder(sample), c, logo) : null,
  }
}

/** Settings › Branding: logo and theme colors, edited as a draft until saved. */
export function useBrandingSettings() {
  const { brand, setBrand } = useBranding()
  const [b, setB] = useState<Branding>(brand)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)

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

  return { b, set, unsaved, pickLogo, save, reset, busy, msg, setMsg }
}
