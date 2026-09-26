import { isFinal } from '../lib/orders'
import { requirePermission } from '../lib/permissions'
import type { Machine, MachineAssignment, MachineStatus, MachineType, OrderStatus } from '../types'
import { query, run, transaction, type Tx } from './client'
import { ORDER_CUSTOMER_NAME } from './customers'

export const MACHINE_PREFIX: Record<MachineType, string> = { washer: 'W', dryer: 'D' }
export const MACHINE_TYPE_LABEL: Record<MachineType, string> = { washer: 'Washer', dryer: 'Dryer' }
export const MACHINE_STATUS_LABEL: Record<MachineStatus, string> = {
  available: 'Available',
  in_use: 'In Use',
  done: 'Done',
  out_of_service: 'Inactive',
}
/** The order status a machine type puts an order in. */
const STATUS_FOR: Record<MachineType, OrderStatus> = { washer: 'washing', dryer: 'drying' }

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')"

/** Allowed preset cycle length, in minutes. */
export const CYCLE_MIN = 1
export const CYCLE_MAX = 600

/** "W03" + washer → "Washer 03". */
export const machineName = (code: string, type: MachineType) => `${MACHINE_TYPE_LABEL[type]} ${code.slice(1)}`

/** Whether a started cycle's time is up. Cycles without a timer (none since timers were added) count as done. */
export const cycleDone = (expectedEndAt: string | null, now = Date.now()) => !expectedEndAt || Date.parse(expectedEndAt) <= now

/**
 * Done is derived from the stored expected end time rather than written by a timer, so it's right the moment the
 * app opens again — after navigation, backgrounding, a restart or a reboot — with nothing to catch up on.
 */
export const machineStatus = (m: Pick<Machine, 'order_id' | 'out_of_service' | 'expected_end_at'>, now = Date.now()): MachineStatus =>
  m.order_id ? (cycleDone(m.expected_end_at, now) ? 'done' : 'in_use') : m.out_of_service ? 'out_of_service' : 'available'

/**
 * Fired after anything starts, ends or moves a cycle, so timer alerts (lib/machineAlerts.ts) and open screens
 * can follow without the db layer depending on them.
 */
export const machineEvents = new EventTarget()
export const machinesChanged = () => machineEvents.dispatchEvent(new Event('change'))

/** Machines with the order currently inside each, sorted W01, W02 … W10. */
export const listMachines = (type?: MachineType) =>
  query<Machine>(
    `SELECT m.*, a.order_id, o.order_number, ${ORDER_CUSTOMER_NAME} AS customer_name, a.started_at,
       a.duration_minutes, a.expected_end_at
     FROM machines m
     LEFT JOIN machine_assignments a ON a.machine_id = m.id AND a.ended_at IS NULL
     LEFT JOIN orders o ON o.id = a.order_id
     LEFT JOIN customers c ON c.id = o.customer_id
     ${type ? 'WHERE m.type = ?' : ''}
     ORDER BY m.type DESC, CAST(substr(m.code, 2) AS INTEGER), m.code`,
    type ? [type] : [],
  )

/** "w3" → "W03". Returns null unless it is the type's letter followed by 1–3 digits. */
export function normalizeCode(type: MachineType, raw: string): string | null {
  const m = /^([A-Za-z])\s*-?\s*(\d{1,3})$/.exec(raw.trim())
  if (!m || m[1].toUpperCase() !== MACHINE_PREFIX[type] || Number(m[2]) < 1) return null
  return `${MACHINE_PREFIX[type]}${m[2].replace(/^0+/, '').padStart(2, '0')}`
}

export async function nextMachineCode(type: MachineType) {
  const rows = await query<{ code: string }>('SELECT code FROM machines WHERE type = ?', [type])
  const max = rows.reduce((n, r) => Math.max(n, Number(r.code.slice(1)) || 0), 0)
  return `${MACHINE_PREFIX[type]}${String(max + 1).padStart(2, '0')}`
}

export interface MachineInput {
  code: string
  notes: string
  outOfService: boolean
  cycleMinutes: number
}

function checkCycle(minutes: number) {
  if (!Number.isInteger(minutes) || minutes < CYCLE_MIN || minutes > CYCLE_MAX)
    throw new Error(`Cycle duration must be a whole number of minutes from ${CYCLE_MIN} to ${CYCLE_MAX}.`)
}

async function guardDuplicate<T>(fn: () => Promise<T>) {
  try {
    return await fn()
  } catch {
    throw new Error('A machine with this number already exists.')
  }
}

export async function createMachine(type: MachineType, i: MachineInput) {
  requirePermission('machines.configure')
  const code = normalizeCode(type, i.code)
  if (!code) throw new Error(`Machine number must look like ${MACHINE_PREFIX[type]}01.`)
  checkCycle(i.cycleMinutes)
  await guardDuplicate(() =>
    run('INSERT INTO machines (code, type, notes, out_of_service, cycle_minutes) VALUES (?,?,?,?,?)', [code, type, i.notes.trim(), i.outOfService ? 1 : 0, i.cycleMinutes]),
  )
}

const openAssignment = (tx: Tx, machineId: number) =>
  tx.query<{ order_id: number }>('SELECT order_id FROM machine_assignments WHERE machine_id = ? AND ended_at IS NULL', [machineId])

export async function updateMachine(id: number, i: MachineInput) {
  requirePermission('machines.configure')
  return transaction(async (tx) => {
    const [m] = await tx.query<{ code: string; type: MachineType }>('SELECT code, type FROM machines WHERE id = ?', [id])
    if (!m) throw new Error('Machine not found.')
    const code = normalizeCode(m.type, i.code)
    if (!code) throw new Error(`Machine number must look like ${MACHINE_PREFIX[m.type]}01.`)
    checkCycle(i.cycleMinutes)
    const [busy] = await openAssignment(tx, id)
    if (busy && i.outOfService) throw new Error('This machine is in use. Unload or move the order before making it Inactive.')
    if (busy && code !== m.code) throw new Error('This machine is in use. Finish or move the order before renumbering it.')
    await guardDuplicate(() =>
      // A new duration applies from the next start; a running cycle keeps the one it started with.
      tx.run(`UPDATE machines SET code = ?, notes = ?, out_of_service = ?, cycle_minutes = ?, updated_at = ${NOW} WHERE id = ?`, [code, i.notes.trim(), i.outOfService ? 1 : 0, i.cycleMinutes, id]),
    )
  })
}

/** Past assignments keep their machine_code snapshot, so order history is unaffected. */
export async function deleteMachine(id: number) {
  requirePermission('machines.configure')
  return transaction(async (tx) => {
    const [busy] = await openAssignment(tx, id)
    if (busy) throw new Error('This machine is in use. Unload or move the order before deleting it.')
    await tx.run('DELETE FROM machines WHERE id = ?', [id])
  })
}

/** Every cycle still open (running or done, not yet unloaded), for timer alerts. */
export const listOpenCycles = () =>
  query<{ id: number; order_id: number; machine_code: string; machine_type: MachineType; expected_end_at: string | null; order_number: string; customer_name: string }>(
    `SELECT a.id, a.order_id, a.machine_code, a.machine_type, a.expected_end_at, o.order_number, ${ORDER_CUSTOMER_NAME} AS customer_name
     FROM machine_assignments a JOIN orders o ON o.id = a.order_id JOIN customers c ON c.id = o.customer_id
     WHERE a.ended_at IS NULL`,
  )

/** Current machine (if any) and full machine history for one order, oldest first. */
export async function getOrderMachines(orderId: number) {
  const history = await query<MachineAssignment>(
    `SELECT a.*, u.full_name AS user_name FROM machine_assignments a LEFT JOIN users u ON u.id = a.user_id
     WHERE a.order_id = ? ORDER BY a.started_at, a.id`,
    [orderId],
  )
  return { current: history.find((a) => !a.ended_at) ?? null, history }
}

const endOpen = (tx: Tx, orderId: number, reason: NonNullable<MachineAssignment['end_reason']>) =>
  tx.run(`UPDATE machine_assignments SET ended_at = ${NOW}, end_reason = ? WHERE order_id = ? AND ended_at IS NULL`, [reason, orderId])

const setStatus = (tx: Tx, orderId: number, status: OrderStatus) =>
  tx.run(`UPDATE orders SET status = ?, updated_at = ${NOW} WHERE id = ?`, [status, orderId])

const openOf = (tx: Tx, orderId: number) =>
  tx.query<{ machine_id: number | null; machine_type: MachineType }>(
    'SELECT machine_id, machine_type FROM machine_assignments WHERE order_id = ? AND ended_at IS NULL', [orderId],
  )

async function orderStatus(tx: Tx, orderId: number) {
  const [order] = await tx.query<{ status: OrderStatus }>('SELECT status FROM orders WHERE id = ?', [orderId])
  if (!order) throw new Error('Order not found.')
  return order.status
}

/**
 * Starts a machine for an order using the machine's preset cycle: started_at = now, expected_end_at = now + cycle.
 * Staff never type a duration. Covers Start Washing (Received → Washing), Move to Dryer (washed
 * order → Drying) and Change Machine (same type; the old machine is freed). Touches only machine
 * assignments and the workflow status — never items, totals, payments or the customer.
 * Payment status is deliberately ignored: Pay Later orders are processed like any other.
 */
export async function assignMachine(orderId: number, machineId: number) {
  const userId = requirePermission('machines.operate').id // the signed-in employee, never passed in
  await transaction(async (tx) => {
    const status = await orderStatus(tx, orderId)
    if (isFinal(status)) throw new Error('This order is closed and can no longer use a machine.')

    const [m] = await tx.query<{ id: number; code: string; type: MachineType; out_of_service: number; cycle_minutes: number }>(
      'SELECT id, code, type, out_of_service, cycle_minutes FROM machines WHERE id = ?', [machineId],
    )
    if (!m) throw new Error('Machine not found.')
    if (m.out_of_service) throw new Error(`${m.code} is Inactive.`)
    if (!(m.cycle_minutes >= CYCLE_MIN)) throw new Error(`${m.code} has no cycle duration set. Ask an admin to set one on the Machines page.`)

    const [current] = await openOf(tx, orderId)
    if (current?.machine_id === m.id) return // same machine picked again: nothing to do
    if (current && current.machine_type !== m.type) throw new Error('Finish washing before moving this order to a dryer.')
    if (!current) {
      const allowed = m.type === 'washer' ? status === 'received' : status === 'washing' || status === 'drying'
      if (!allowed) throw new Error(`This order can't go into a ${MACHINE_TYPE_LABEL[m.type].toLowerCase()} now.`)
    }
    const [busy] = await openAssignment(tx, m.id)
    if (busy) throw new Error(`${m.code} is already in use by another order. Pick another machine.`)

    if (current) await endOpen(tx, orderId, 'changed')
    const start = Date.now()
    await tx.run(
      `INSERT INTO machine_assignments (machine_id, machine_code, machine_type, order_id, started_at, duration_minutes, expected_end_at, user_id)
       VALUES (?,?,?,?,?,?,?,?)`,
      [m.id, m.code, m.type, orderId, new Date(start).toISOString(), m.cycle_minutes, new Date(start + m.cycle_minutes * 60_000).toISOString(), userId],
    )
    if (status !== STATUS_FOR[m.type]) await setStatus(tx, orderId, STATUS_FOR[m.type])
  })
  machinesChanged()
}

/** Blocks freeing a machine whose cycle is still running (In Use can't jump to Available). */
async function requireCycleDone(tx: Tx, orderId: number) {
  const [a] = await tx.query<{ machine_code: string; expected_end_at: string | null }>(
    'SELECT machine_code, expected_end_at FROM machine_assignments WHERE order_id = ? AND ended_at IS NULL', [orderId],
  )
  if (a && !cycleDone(a.expected_end_at)) throw new Error(`${a.machine_code} is still running. Mark it as unloaded once the timer finishes.`)
}

/**
 * Mark as Unloaded (Done → Available), once the timer is over and the laundry is out. From a washer the order stays
 * Washing (washed) until it moves to a dryer or is marked Ready; from a dryer it becomes Ready for Pickup.
 */
export async function unloadMachine(orderId: number) {
  requirePermission('machines.operate')
  const type = await transaction(async (tx) => {
    const status = await orderStatus(tx, orderId)
    const [current] = await openOf(tx, orderId)
    if (!current || status !== STATUS_FOR[current.machine_type]) throw new Error('This machine was already unloaded.')
    await requireCycleDone(tx, orderId)
    await endOpen(tx, orderId, 'finished')
    if (current.machine_type === 'dryer') await setStatus(tx, orderId, 'ready')
    return current.machine_type
  })
  machinesChanged()
  return type
}

/**
 * Keeps machines in step with a status change made through setOrderStatus (Mark Ready, Complete,
 * Cancel): a washer is only held while Washing and a dryer only while Drying.
 */
export async function syncMachineWithStatus(tx: Tx, orderId: number, status: OrderStatus) {
  const [current] = await openOf(tx, orderId)
  if (current && STATUS_FOR[current.machine_type] !== status) await endOpen(tx, orderId, 'status')
}

/** Whether the order has a machine running right now (used to block Mark Ready mid-wash). */
export async function hasOpenMachine(tx: Tx, orderId: number) {
  return (await openOf(tx, orderId)).length > 0
}
