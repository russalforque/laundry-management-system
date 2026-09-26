import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { requirePermission } from '../lib/permissions'
import { exportDatabase, replaceDatabase } from './client'
import { migrations } from './migrations'
import { getSettings, setSetting } from './settings'

const DIR = 'backups'
const KEEP = 15
const APP_ID = 'sellix-laundry'

interface BackupFile {
  app: string
  schema: number
  exportedAt: string
  data: { tables?: { name: string }[] }
}

export interface BackupInfo {
  name: string
  size: number
  mtime: number
}

const stamp = (d: Date) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-` +
  `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`

const localDay = (iso: string) => new Date(iso).toDateString()

/** Snapshot the whole database into a self-describing JSON file and store it on the device. */
export async function createBackup(tag = ''): Promise<{ name: string; text: string }> {
  requirePermission('backup.manage')
  return snapshot(tag)
}

/** Unguarded: also runs for the daily auto backup, before anyone signs in. */
async function snapshot(tag: string): Promise<{ name: string; text: string }> {
  const now = new Date()
  const text = JSON.stringify({
    app: APP_ID,
    schema: migrations.length,
    exportedAt: now.toISOString(),
    data: JSON.parse(await exportDatabase()),
  } satisfies BackupFile)
  const name = `sellix-backup-${stamp(now)}${tag ? `-${tag}` : ''}.json`
  await Filesystem.writeFile({ path: `${DIR}/${name}`, data: text, directory: Directory.Data, encoding: Encoding.UTF8, recursive: true })
  await setSetting('last_backup_at', now.toISOString())
  await prune()
  return { name, text }
}

export async function listBackups(): Promise<BackupInfo[]> {
  requirePermission('backup.manage')
  return backupFiles()
}

async function backupFiles(): Promise<BackupInfo[]> {
  try {
    const { files } = await Filesystem.readdir({ path: DIR, directory: Directory.Data })
    return files
      .filter((f) => f.name.endsWith('.json'))
      .map((f) => ({ name: f.name, size: f.size, mtime: f.mtime ?? 0 }))
      .sort((a, b) => b.name.localeCompare(a.name))
  } catch {
    return [] // folder not created yet
  }
}

async function prune() {
  for (const b of (await backupFiles()).slice(KEEP)) {
    await Filesystem.deleteFile({ path: `${DIR}/${b.name}`, directory: Directory.Data }).catch(() => {})
  }
}

/** Runs once per day, the first time the app is opened. Never blocks or throws into the UI. */
export async function runAutoBackupIfDue() {
  try {
    const s = await getSettings()
    if (s.auto_backup === '0') return
    if (s.last_backup_at && localDay(s.last_backup_at) === new Date().toDateString()) return
    await snapshot('auto')
  } catch {
    /* an auto-backup failure must never stop the app from starting */
  }
}

/** Gets a text file off the device: browser download, or the Android share sheet. */
export async function saveFile(name: string, text: string, type: string, dialogTitle: string): Promise<void> {
  if (Capacitor.getPlatform() === 'web') {
    const url = URL.createObjectURL(new Blob([text], { type }))
    const a = Object.assign(document.createElement('a'), { href: url, download: name })
    a.click()
    URL.revokeObjectURL(url)
    return
  }
  const { uri } = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 })
  await Share.share({ title: name, dialogTitle, url: uri })
}

export async function exportBackup(): Promise<void> {
  requirePermission('backup.manage')
  const { name, text } = await createBackup('export')
  await saveFile(name, text, 'application/json', 'Save or send backup')
}

export async function readLocalBackup(name: string) {
  requirePermission('backup.manage')
  return (await Filesystem.readFile({ path: `${DIR}/${name}`, directory: Directory.Data, encoding: Encoding.UTF8 })).data as string
}

function parse(text: string): { schema: number; dataJson: string } {
  let file: BackupFile
  try {
    file = JSON.parse(text)
  } catch {
    throw new Error('This file is not a valid backup.')
  }
  const names = file?.data?.tables?.map((t) => t.name) ?? []
  const required = ['users', 'customers', 'services', 'orders', 'order_items', 'payments', 'settings']
  if (file?.app !== APP_ID || !required.every((n) => names.includes(n))) throw new Error('This file is not a Sellix Laundry backup.')
  if (!Number.isInteger(file.schema) || file.schema < 1) throw new Error('Backup has an invalid version.')
  if (file.schema > migrations.length) throw new Error('This backup was made by a newer version of the app. Update the app first.')
  return { schema: file.schema, dataJson: JSON.stringify(file.data) }
}

/**
 * Replaces all current data with the backup. A safety backup is taken first; if the
 * restore fails, the previous data is put back automatically.
 */
export async function restoreBackup(text: string): Promise<void> {
  requirePermission('backup.manage')
  const next = parse(text) // validate before touching anything
  const safety = await snapshot('pre-restore')
  try {
    await replaceDatabase(next.dataJson, next.schema)
  } catch (e) {
    const prev = parse(safety.text)
    await replaceDatabase(prev.dataJson, prev.schema).catch(() => {
      throw new Error(`Restore failed and automatic rollback failed. Your previous data is saved in backup "${safety.name}".`)
    })
    throw new Error(`Restore failed; your data was left unchanged. (${e instanceof Error ? e.message : 'unknown error'})`)
  }
}
