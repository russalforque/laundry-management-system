import { hashPassword, verifyPassword } from '../lib/hash'
import type { Role, User } from '../types'
import { query, queryOne, run } from './client'

const COLS = 'id, username, full_name, role, active, created_at'
const ROLES: Role[] = ['admin', 'manager', 'cashier']
export const MIN_PASSWORD = 6

function validatePassword(p: string) {
  if (p.length < MIN_PASSWORD) throw new Error(`Password must be at least ${MIN_PASSWORD} characters.`)
}

function validateProfile(username: string, fullName: string, role: Role) {
  if (!/^[A-Za-z0-9._-]{3,32}$/.test(username)) throw new Error('Username must be 3-32 letters, numbers, . _ -')
  if (!fullName.trim()) throw new Error('Full name is required.')
  if (!ROLES.includes(role)) throw new Error('Invalid role.')
}

/** First run only: create the default admin so the app can be logged into. */
export async function seedAdminIfEmpty() {
  const row = await queryOne<{ n: number }>('SELECT COUNT(*) AS n FROM users')
  if (row?.n) return
  const { hash, salt } = await hashPassword('admin123')
  await run('INSERT INTO users (username, full_name, password_hash, salt, role) VALUES (?,?,?,?,?)', [
    'admin', 'Administrator', hash, salt, 'admin',
  ])
}

export async function login(username: string, password: string): Promise<User> {
  const row = await queryOne<User & { password_hash: string; salt: string }>(
    `SELECT ${COLS}, password_hash, salt FROM users WHERE username = ?`,
    [username.trim()],
  )
  // Same message for unknown user / wrong password / disabled account.
  const fail = new Error('Invalid username or password.')
  if (!row || !row.active) throw fail
  if (!(await verifyPassword(password, row.password_hash, row.salt))) throw fail
  const { password_hash: _h, salt: _s, ...user } = row
  return user
}

export async function changePassword(userId: number, current: string, next: string) {
  validatePassword(next)
  const row = await queryOne<{ password_hash: string; salt: string }>(
    'SELECT password_hash, salt FROM users WHERE id = ?',
    [userId],
  )
  if (!row || !(await verifyPassword(current, row.password_hash, row.salt))) throw new Error('Current password is incorrect.')
  await setPassword(userId, next)
}

async function setPassword(userId: number, password: string) {
  const { hash, salt } = await hashPassword(password)
  await run("UPDATE users SET password_hash=?, salt=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?", [
    hash, salt, userId,
  ])
}

export const listUsers = () => query<User>(`SELECT ${COLS} FROM users ORDER BY full_name COLLATE NOCASE`)

async function activeAdminCount(excludeId: number) {
  const r = await queryOne<{ n: number }>("SELECT COUNT(*) AS n FROM users WHERE role='admin' AND active=1 AND id<>?", [excludeId])
  return r?.n ?? 0
}

export async function createUser(input: { username: string; fullName: string; role: Role; password: string }) {
  validateProfile(input.username, input.fullName, input.role)
  validatePassword(input.password)
  const { hash, salt } = await hashPassword(input.password)
  try {
    await run('INSERT INTO users (username, full_name, password_hash, salt, role) VALUES (?,?,?,?,?)', [
      input.username, input.fullName.trim(), hash, salt, input.role,
    ])
  } catch {
    throw new Error('Username already exists.')
  }
}

export async function updateUser(
  id: number,
  input: { username: string; fullName: string; role: Role; active: boolean; newPassword?: string },
) {
  validateProfile(input.username, input.fullName, input.role)
  // Never leave the system without an active admin.
  if ((input.role !== 'admin' || !input.active) && (await activeAdminCount(id)) === 0)
    throw new Error('At least one active admin is required.')
  try {
    await run(
      "UPDATE users SET username=?, full_name=?, role=?, active=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?",
      [input.username, input.fullName.trim(), input.role, input.active ? 1 : 0, id],
    )
  } catch {
    throw new Error('Username already exists.')
  }
  if (input.newPassword) {
    validatePassword(input.newPassword)
    await setPassword(id, input.newPassword)
  }
}
