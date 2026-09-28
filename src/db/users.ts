import { hashPassword, verifyPassword } from '../lib/hash'
import { requirePermission, sessionUser, STAFF_ROLE } from '../lib/permissions'
import type { Role, User } from '../types'
import { DbError, query, queryOne, run } from './client'
import { ORDER_CUSTOMER_NAME } from './customers'
import { setSetting } from './settings'

const COLS = 'id, username, full_name, role, active, created_at, photo'
const ROLES: Role[] = ['admin', 'manager', 'cashier']
export const ROLE_LABEL: Record<Role, string> = { admin: 'Admin', manager: 'Manager', cashier: 'Staff' }

const MAX_ATTEMPTS = 5
const BASE_LOCK_MS = 30_000
const MAX_LOCK_MS = 15 * 60_000

/** Thrown for wrong or locked PINs; lockedUntil (epoch ms) lets the keypad show a countdown. */
export class PinError extends Error {
  constructor(message: string, public lockedUntil = 0) {
    super(message)
  }
}

/** What the login screen may know about a user: no hashes. */
export interface Profile {
  id: number
  full_name: string
  role: Role
  pin_length: number | null
  locked_until: number
  photo: string | null
}

interface Secret {
  id: number
  pin_hash: string | null
  pin_salt: string | null
  password_hash: string
  salt: string
  failed_attempts: number
  locked_until: number
}

export const isValidPin = (pin: string) => /^\d{4,6}$/.test(pin)

function validatePin(pin: string) {
  if (!isValidPin(pin)) throw new Error('PIN must be 4–6 digits.')
}

function validateProfile(username: string, fullName: string, role: Role) {
  validateNames(username, fullName)
  if (!ROLES.includes(role)) throw new Error('Invalid role.')
}

function validateNames(username: string, fullName: string) {
  if (!/^[A-Za-z0-9._-]{3,32}$/.test(username)) throw new Error('Username must be 3-32 letters, numbers, . _ -')
  if (!fullName.trim()) throw new Error('Full name is required.')
  if (fullName.trim().length > 60) throw new Error('Full name is too long (60 characters max).')
}

/** A unique-username clash in words; any other failure passes through unchanged. */
const usernameTaken = (e: unknown) => (e instanceof DbError && e.kind === 'unique' ? new Error('Username already exists.') : e)

const lockMessage = (until: number) => `Too many attempts. Try again in ${Math.ceil((until - Date.now()) / 1000)}s.`

/** Every 5th consecutive failure locks the account, doubling each time up to 15 minutes. */
async function recordFailure(s: Secret): Promise<PinError> {
  const n = s.failed_attempts + 1
  const lockedUntil = n % MAX_ATTEMPTS === 0 ? Date.now() + Math.min(BASE_LOCK_MS * 2 ** (n / MAX_ATTEMPTS - 1), MAX_LOCK_MS) : 0
  await run('UPDATE users SET failed_attempts=?, locked_until=? WHERE id=?', [n, lockedUntil, s.id])
  if (lockedUntil) return new PinError(lockMessage(lockedUntil), lockedUntil)
  const left = MAX_ATTEMPTS - (n % MAX_ATTEMPTS)
  return new PinError(`Incorrect PIN. ${left} attempt${left === 1 ? '' : 's'} left.`)
}

const clearFailures = (id: number) => run('UPDATE users SET failed_attempts=0, locked_until=0 WHERE id=?', [id])

/** Checks a secret against the lockout counter; `which` picks the PIN or the legacy password. */
async function attempt(s: Secret, value: string, which: 'pin' | 'password') {
  if (s.locked_until > Date.now()) throw new PinError(lockMessage(s.locked_until), s.locked_until)
  const [hash, salt] = which === 'pin' ? [s.pin_hash, s.pin_salt] : [s.password_hash, s.salt]
  if (!hash || !salt || !(await verifyPassword(value, hash, salt))) throw await recordFailure(s)
  if (s.failed_attempts) await clearFailures(s.id)
}

const getSecret = (id: number) =>
  queryOne<Secret & User>(
    `SELECT ${COLS}, pin_hash, pin_salt, password_hash, salt, failed_attempts, locked_until FROM users WHERE id=? AND active=1`,
    [id],
  )

async function activeSecret(id: number) {
  const s = await getSecret(id)
  if (!s) throw new Error('This account is not available.')
  return s
}

const toUser = ({ id, username, full_name, role, active, created_at, photo }: User): User => ({ id, username, full_name, role, active, created_at, photo })

async function setPin(userId: number, pin: string) {
  validatePin(pin)
  const { hash, salt } = await hashPassword(pin)
  await run(
    "UPDATE users SET pin_hash=?, pin_salt=?, pin_length=?, failed_attempts=0, locked_until=0, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?",
    [hash, salt, pin.length, userId],
  )
}

/** Password column is legacy (NOT NULL); new accounts get an unguessable one. */
const unusablePassword = () => hashPassword(crypto.randomUUID())

let seeding: Promise<void> | null = null

/** First run only: create the default admin (PIN 1234) so the app can be logged into. Concurrent calls share one run. */
export const seedAdminIfEmpty = () => (seeding ??= seedAdmin().finally(() => { seeding = null }))

async function seedAdmin() {
  const row = await queryOne<{ n: number }>('SELECT COUNT(*) AS n FROM users')
  if (row?.n) return
  const { hash, salt } = await unusablePassword()
  const { lastId } = await run('INSERT INTO users (username, full_name, password_hash, salt, role) VALUES (?,?,?,?,?)', [
    'admin', 'Administrator', hash, salt, 'admin',
  ])
  await setPin(lastId, '1234')
  // Brand-new install: the welcome flow asks who uses this device and replaces the default PIN.
  await setSetting(SETUP_PENDING, '1')
}

const SETUP_PENDING = 'setup_pending'

export const isSetupPending = async () =>
  (await queryOne<{ value: string }>('SELECT value FROM settings WHERE key=?', [SETUP_PENDING]))?.value === '1'

/**
 * First-run setup. Administrator replaces the seeded admin's default PIN; Cashier adds a
 * cashier account (the admin keeps the default PIN until changed). Returns the account to sign in.
 */
export async function completeFirstRunSetup(role: 'admin' | 'cashier', pin: string): Promise<number> {
  if (!(await isSetupPending())) throw new Error('Setup has already been completed.')
  let id: number
  if (role === 'admin') {
    const admin = await queryOne<{ id: number }>("SELECT id FROM users WHERE role='admin' AND active=1 ORDER BY id LIMIT 1")
    if (!admin) throw new Error('No administrator account found.')
    await setPin(admin.id, pin)
    id = admin.id
  } else {
    await insertUser({ username: 'cashier', fullName: 'Cashier', role: STAFF_ROLE, pin }) // no one is signed in yet
    id = (await queryOne<{ id: number }>("SELECT id FROM users WHERE username='cashier'"))!.id
  }
  await run('DELETE FROM settings WHERE key=?', [SETUP_PENDING])
  return id
}

export const listProfiles = () =>
  query<Profile>('SELECT id, full_name, role, pin_length, locked_until, photo FROM users WHERE active=1 ORDER BY full_name COLLATE NOCASE')

export async function loginWithPin(userId: number, pin: string): Promise<User> {
  const s = await activeSecret(userId)
  await attempt(s, pin, 'pin')
  return toUser(s)
}

/** Accounts created before PINs existed: prove identity with the old password, then choose a PIN. */
export async function checkLegacyPassword(userId: number, password: string) {
  await attempt(await activeSecret(userId), password, 'password')
}

export async function setupPin(userId: number, password: string, pin: string): Promise<User> {
  const s = await activeSecret(userId)
  if (s.pin_hash) throw new Error('A PIN is already set for this account.')
  await attempt(s, password, 'password')
  await setPin(userId, pin)
  return toUser(s)
}

export const verifyOwnPin = async (userId: number, pin: string) => attempt(await activeSecret(userId), pin, 'pin')

export async function changePin(userId: number, current: string, next: string) {
  await verifyOwnPin(userId, current)
  await setPin(userId, next)
}

// ---------- My Account: the signed-in employee's own profile ----------
// Always the session user (lib/permissions.ts), never an id from the UI, so no one edits another account here.
// Role and active status aren't editable from My Account; only Users (users.manage) changes them.

/** The signed-in employee as stored now, e.g. after a My Account edit. */
export async function getOwnAccount(): Promise<User> {
  const row = await queryOne<User>(`SELECT ${COLS} FROM users WHERE id=? AND active=1`, [sessionUser().id])
  if (!row) throw new Error('This account is not available.')
  return toUser(row)
}

export async function updateOwnProfile(input: { username: string; fullName: string }): Promise<User> {
  const me = sessionUser()
  const username = input.username.trim()
  validateNames(username, input.fullName)
  try {
    await run(
      "UPDATE users SET username=?, full_name=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?",
      [username, input.fullName.trim(), me.id],
    )
  } catch (e) {
    throw usernameTaken(e)
  }
  return getOwnAccount()
}

/** Saves (or clears, with null) the photo's path; lib/avatarPhoto.ts writes the file itself. */
export async function setOwnPhoto(path: string | null): Promise<User> {
  await run("UPDATE users SET photo=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?", [path, sessionUser().id])
  return getOwnAccount()
}

/** Approves a sensitive action if the PIN belongs to any active admin. Failures count against every admin tried. */
export async function verifyAdminPin(pin: string) {
  const admins = await query<Secret>(
    "SELECT id, pin_hash, pin_salt, password_hash, salt, failed_attempts, locked_until FROM users WHERE role='admin' AND active=1 AND pin_hash IS NOT NULL",
  )
  const open = admins.filter((a) => a.locked_until <= Date.now())
  if (!open.length) {
    const until = Math.min(...admins.map((a) => a.locked_until))
    throw admins.length ? new PinError(lockMessage(until), until) : new Error('No admin has a PIN set.')
  }
  for (const a of open) {
    if (a.pin_hash && a.pin_salt && (await verifyPassword(pin, a.pin_hash, a.pin_salt))) {
      if (a.failed_attempts) await clearFailures(a.id)
      return
    }
  }
  const errors = await Promise.all(open.map(recordFailure))
  throw errors.find((e) => e.lockedUntil) ? errors.reduce((a, b) => (b.lockedUntil > a.lockedUntil ? b : a)) : new PinError('Incorrect admin PIN.')
}

export const listUsers = async () => {
  requirePermission('users.manage')
  return query<User>(`SELECT ${COLS} FROM users ORDER BY full_name COLLATE NOCASE`)
}

async function activeAdminCount(excludeId: number) {
  const r = await queryOne<{ n: number }>("SELECT COUNT(*) AS n FROM users WHERE role='admin' AND active=1 AND id<>?", [excludeId])
  return r?.n ?? 0
}

export async function createUser(input: { username: string; fullName: string; role: Role; pin: string }) {
  requirePermission('users.manage')
  await insertUser(input)
}

async function insertUser(input: { username: string; fullName: string; role: Role; pin: string }) {
  validateProfile(input.username, input.fullName, input.role)
  validatePin(input.pin)
  const { hash, salt } = await unusablePassword()
  let id: number
  try {
    id = (await run('INSERT INTO users (username, full_name, password_hash, salt, role) VALUES (?,?,?,?,?)', [
      input.username, input.fullName.trim(), hash, salt, input.role,
    ])).lastId
  } catch (e) {
    throw usernameTaken(e)
  }
  await setPin(id, input.pin)
}

export async function updateUser(
  id: number,
  input: { username: string; fullName: string; role: Role; active: boolean; newPin?: string },
) {
  requirePermission('users.manage')
  validateProfile(input.username, input.fullName, input.role)
  if (input.newPin) validatePin(input.newPin)
  // Never leave the system without an active admin.
  if ((input.role !== 'admin' || !input.active) && (await activeAdminCount(id)) === 0)
    throw new Error('At least one active admin is required.')
  try {
    await run(
      "UPDATE users SET username=?, full_name=?, role=?, active=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?",
      [input.username, input.fullName.trim(), input.role, input.active ? 1 : 0, id],
    )
  } catch (e) {
    throw usernameTaken(e)
  }
  // Setting a PIN also clears any lockout, so admins can unlock staff.
  if (input.newPin) await setPin(id, input.newPin)
}

export interface UserActivity {
  id: number
  order_number: string
  created_at: string
  customer_name: string
  total_cents: number
}

/** Latest orders a user recorded — the app's audit trail for staff activity. */
export const userActivity = async (userId: number, limit = 5) => {
  requirePermission('users.manage')
  return query<UserActivity>(
    `SELECT o.id, o.order_number, o.created_at, ${ORDER_CUSTOMER_NAME} AS customer_name, o.total_cents
     FROM orders o JOIN customers c ON c.id = o.customer_id
     WHERE o.created_by = ? ORDER BY o.created_at DESC LIMIT ?`,
    [userId, limit],
  )
}
