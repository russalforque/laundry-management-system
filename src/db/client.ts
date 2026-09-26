import { Capacitor } from '@capacitor/core'
import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite'
import { defineCustomElements as defineJeepSqlite } from 'jeep-sqlite/loader'
import { migrations } from './migrations'

export const DB_NAME = 'sellix_laundry'

export const sqlite = new SQLiteConnection(CapacitorSQLite)
const isWeb = Capacitor.getPlatform() === 'web'

let db: SQLiteDBConnection | null = null
let ready: Promise<SQLiteDBConnection> | null = null
let txQueue: Promise<unknown> = Promise.resolve()
let pendingUserVersion: number | null = null

async function initWebStore() {
  defineJeepSqlite(window)
  const el = document.createElement('jeep-sqlite')
  document.body.appendChild(el)
  await customElements.whenDefined('jeep-sqlite')
  await sqlite.initWebStore()
}

async function migrate(conn: SQLiteDBConnection) {
  const current = (await conn.query('PRAGMA user_version')).values?.[0]?.user_version ?? 0
  for (let v = current; v < migrations.length; v++) {
    await conn.execute(migrations[v], true) // one transaction per migration
    await conn.execute(`PRAGMA user_version = ${v + 1}`, false)
  }
}

async function open(): Promise<SQLiteDBConnection> {
  if (isWeb) await initWebStore()
  const consistent = (await sqlite.checkConnectionsConsistency()).result
  const exists = (await sqlite.isConnection(DB_NAME, false)).result
  const conn =
    consistent && exists
      ? await sqlite.retrieveConnection(DB_NAME, false)
      : await sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false)
  await conn.open()
  await conn.execute('PRAGMA foreign_keys = ON', false)
  if (pendingUserVersion !== null) {
    // A restored file carries its own schema version; migrate() then upgrades older backups.
    await conn.execute(`PRAGMA user_version = ${pendingUserVersion}`, false)
    pendingUserVersion = null
  }
  await migrate(conn)
  if (isWeb) await sqlite.saveToStore(DB_NAME)
  db = conn
  return conn
}

/** Idempotent; safe to call from anywhere. */
export function initDb(): Promise<SQLiteDBConnection> {
  ready ??= open().catch((e) => {
    ready = null
    throw e
  })
  return ready
}

async function persist() {
  if (isWeb) await sqlite.saveToStore(DB_NAME)
}

export async function query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const conn = await initDb()
  return ((await conn.query(sql, params as never[])).values ?? []) as T[]
}

export async function queryOne<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  return (await query<T>(sql, params))[0]
}

export async function run(sql: string, params: unknown[] = []) {
  const conn = await initDb()
  const res = await conn.run(sql, params as never[], true)
  await persist()
  return { lastId: res.changes?.lastId ?? 0, changes: res.changes?.changes ?? 0 }
}

/** Runs fn atomically; rolls back on any error. Calls are serialized. */
export function transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const next = txQueue.then(async () => {
    const conn = await initDb()
    await conn.beginTransaction()
    try {
      const tx: Tx = {
        query: async (sql, params = []) => ((await conn.query(sql, params as never[])).values ?? []) as never,
        run: async (sql, params = []) => {
          const res = await conn.run(sql, params as never[], false)
          return { lastId: res.changes?.lastId ?? 0, changes: res.changes?.changes ?? 0 }
        },
      }
      const result = await fn(tx)
      await conn.commitTransaction()
      await persist()
      return result
    } catch (e) {
      await conn.rollbackTransaction().catch(() => {})
      throw e
    }
  })
  txQueue = next.catch(() => {})
  return next
}

export interface Tx {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>
  run(sql: string, params?: unknown[]): Promise<{ lastId: number; changes: number }>
}

/** Close the connection (needed before restore/import). */
export async function closeDb() {
  if (db) await sqlite.closeConnection(DB_NAME, false)
  db = null
  ready = null
}

/** Full database as plugin JSON text (all tables, schema and data). */
export async function exportDatabase(): Promise<string> {
  const conn = await initDb()
  const res = await conn.exportToJson('full')
  if (!res.export) throw new Error('Database export failed.')
  return JSON.stringify(res.export)
}

/** Replaces the whole database with the given plugin JSON. Callers must have made a safety backup. */
export async function replaceDatabase(dataJson: string, schemaVersion: number) {
  if (!(await sqlite.isJsonValid(dataJson)).result) throw new Error('Backup data is not valid.')
  await txQueue.catch(() => {}) // let in-flight transactions finish
  await closeDb()
  await sqlite.importFromJson(dataJson)
  pendingUserVersion = schemaVersion
  await initDb()
  const users = await queryOne<{ n: number }>('SELECT COUNT(*) AS n FROM users')
  if (!users?.n) throw new Error('Restored data has no users.')
}
