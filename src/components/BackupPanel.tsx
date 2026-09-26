import { useCallback, useEffect, useRef, useState } from 'react'
import { createBackup, exportBackup, listBackups, readLocalBackup, restoreBackup, type BackupInfo } from '../db/backup'
import { getSettings, setSetting } from '../db/settings'
import { formatDateTime } from '../lib/money'
import { useAdminPin } from './AdminPin'
import { Toggle } from './Controls'
import { I, Icon } from './Icons'
import { card, primary } from './Manage'
import { FloatingToast, type Msg } from './Toast'

const WARNING = 'Restoring a backup will replace the current local data. Continue?'
const outline = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-4 font-semibold text-blue-600 active:bg-blue-50 disabled:opacity-60'

/** Whole days since `iso`, for the "how fresh is my backup" status. */
const daysAgo = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)

export default function BackupPanel() {
  const [last, setLast] = useState<string | null>(null)
  const [auto, setAuto] = useState(true)
  const [files, setFiles] = useState<BackupInfo[] | null>(null)
  const [busy, setBusy] = useState('') // 'backup' | 'export' | file name being restored
  const [msg, setMsg] = useState<Msg>(null)
  const picker = useRef<HTMLInputElement>(null)
  const { approve, sheet } = useAdminPin()

  const load = useCallback(async () => {
    const s = await getSettings()
    setLast(s.last_backup_at ?? '')
    setAuto(s.auto_backup !== '0')
    setFiles(await listBackups())
  }, [])
  useEffect(() => { load() }, [load])

  async function act(tag: string, fn: () => Promise<string | void>) {
    setBusy(tag)
    setMsg(null)
    try {
      const text = await fn()
      if (text) setMsg({ ok: true, text })
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Something went wrong.' })
    }
    setBusy('')
    load().catch(() => {})
  }

  // Restored data replaces everything in memory too, so reload back to the login screen.
  const restore = async (tag: string, getText: () => Promise<string>) => {
    if (!(await approve(WARNING))) return
    act(tag, async () => {
      await restoreBackup(await getText())
      alert('Restore complete. The app will now reload.')
      location.reload()
    })
  }

  async function onPick(file: File | undefined) {
    if (picker.current) picker.current.value = ''
    if (file) restore('import', () => file.text())
  }

  async function toggleAuto(on: boolean) {
    setAuto(on)
    await setSetting('auto_backup', on ? '1' : '0')
  }

  // Backup health: none yet / older than a week is worth a nudge; not colour alone, the text says it too.
  const age = last ? daysAgo(last) : null
  const health = last === null
    ? null
    : !last
      ? { cls: 'bg-amber-50 text-amber-700', icon: 'bg-amber-50 text-amber-600', label: 'No backup yet' }
      : age! > 7
        ? { cls: 'bg-amber-50 text-amber-700', icon: 'bg-amber-50 text-amber-600', label: `${age} days old` }
        : { cls: 'bg-emerald-50 text-emerald-700', icon: 'bg-emerald-50 text-emerald-600', label: 'Up to date' }

  return (
    <>
      {/* Status + main action */}
      <section id="backup" className={`${card} scroll-mt-4 overflow-hidden`}>
        <div className="flex items-center gap-4 p-4">
          <span className={`grid size-14 shrink-0 place-items-center rounded-2xl ${health?.icon ?? 'bg-slate-100 text-slate-400'}`}>
            <Icon className="h-7 w-7">{I.cloud}</Icon>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">Last backup</span>
            <span className="block truncate text-lg font-bold text-slate-900">{last === null ? '…' : last ? formatDateTime(last) : 'Never'}</span>
            {health && (
              <span className={`mt-1 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${health.cls}`}>{health.label}</span>
            )}
          </span>
        </div>
        <div className="px-4 pb-4">
          <button
            type="button"
            disabled={!!busy}
            onClick={() => act('backup', async () => { const b = await createBackup(); return `Backup saved: ${b.name}` })}
            className={`${primary} min-h-12 w-full`}
          >
            <Icon className="h-5 w-5">{I.database}</Icon>{busy === 'backup' ? 'Backing up…' : 'Back up now'}
          </button>
        </div>
        <div className="flex items-center gap-3 border-t border-slate-100 px-4 py-3">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-slate-800">Automatic daily backup</span>
            <span className="block text-xs text-slate-500">When the app is first opened each day.</span>
          </span>
          <Toggle label="Automatic daily backup" on={auto} onChange={toggleAuto} />
        </div>
      </section>

      {/* Moving data on and off the device */}
      <section>
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Transfer</h2>
        <div className={`${card} divide-y divide-slate-100 overflow-hidden`}>
          <button type="button" disabled={!!busy} onClick={() => act('export', async () => { await exportBackup() })} className="flex min-h-16 w-full items-center gap-3.5 px-4 py-3 text-left active:bg-slate-50 disabled:opacity-60">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600"><Icon className="h-5 w-5">{I.up}</Icon></span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-slate-900">{busy === 'export' ? 'Exporting…' : 'Export backup'}</span>
              <span className="block text-sm text-slate-500">Save or send a copy off this device</span>
            </span>
            <Icon className="h-5 w-5 shrink-0 text-slate-400">{I.chevron}</Icon>
          </button>
          <button type="button" disabled={!!busy} onClick={() => picker.current?.click()} className="flex min-h-16 w-full items-center gap-3.5 px-4 py-3 text-left active:bg-slate-50 disabled:opacity-60">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600"><Icon className="h-5 w-5">{I.download}</Icon></span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-slate-900">{busy === 'import' ? 'Restoring…' : 'Import backup file'}</span>
              <span className="block text-sm text-slate-500">Replaces current data · admin PIN needed</span>
            </span>
            <Icon className="h-5 w-5 shrink-0 text-slate-400">{I.chevron}</Icon>
          </button>
        </div>
        <input ref={picker} type="file" accept=".json,application/json" className="hidden" onChange={(e) => onPick(e.target.files?.[0])} />
      </section>

      {/* Backups kept on this device */}
      <section>
        <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">On this device</h2>
          {files && files.length > 0 && <span className="text-xs tabular-nums text-slate-500">{files.length} saved</span>}
        </div>
        <ul className={`${card} divide-y divide-slate-100 overflow-hidden`}>
          {files === null
            ? [0, 1].map((i) => <li key={i} aria-hidden className="h-16 animate-pulse bg-slate-50" />)
            : files.length === 0
              ? <li className="p-4 text-sm text-slate-500">No backups yet. Tap <b>Back up now</b> to make the first one.</li>
              : files.map((f) => (
                  <li key={f.name} className="flex min-h-16 items-center gap-3.5 px-4 py-2">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500"><Icon className="h-5 w-5">{I.note}</Icon></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-900">{f.mtime ? formatDateTime(new Date(f.mtime).toISOString()) : f.name}</span>
                      <span className="block truncate text-xs text-slate-500">{(f.size / 1024).toFixed(0)} KB · {f.name}</span>
                    </span>
                    <button
                      type="button"
                      disabled={!!busy}
                      onClick={() => restore(f.name, () => readLocalBackup(f.name))}
                      aria-label={`Restore backup ${f.name}`}
                      className={`${outline} min-h-11 shrink-0 px-3 text-sm`}
                    >
                      {busy === f.name ? 'Restoring…' : 'Restore'}
                    </button>
                  </li>
                ))}
        </ul>
        <p className="mt-2 px-1 text-xs text-slate-500">Keeps the 15 newest. Deleting the app erases these, so export a copy regularly.</p>
      </section>

      <FloatingToast msg={msg} onDismiss={() => setMsg(null)} />
      {sheet}
    </>
  )
}
