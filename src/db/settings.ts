import { requirePermission, type Permission } from '../lib/permissions'
import { query, run } from './client'

export type Settings = Record<string, string>

export async function getSettings(): Promise<Settings> {
  const rows = await query<{ key: string; value: string }>('SELECT key, value FROM settings')
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}

/** App bookkeeping, written before anyone signs in (welcome flow, first-run setup, auto backup). */
const INTERNAL_KEYS = ['intro_seen', 'setup_pending', 'last_backup_at']
/** Which permission may change a setting; anything not listed (business info, branding, receipt, system) needs settings.manage. */
const KEY_PERMISSION: Record<string, Permission> = {
  printer_address: 'printer.use',
  printer_name: 'printer.use',
  printer_auto_connect: 'printer.use',
  auto_backup: 'backup.manage',
}

export const setSetting = async (key: string, value: string) => {
  if (!INTERNAL_KEYS.includes(key)) requirePermission(KEY_PERMISSION[key] ?? 'settings.manage')
  return run(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
    [key, value],
  )
}
