import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { listOpenCycles, machineName } from '../db/machines'

/**
 * "Laundry Finished" device notifications for machine timers. Each open cycle gets one notification scheduled at its
 * expected_end_at, keyed by the assignment id. The OS fires it on time with the app in the background or closed, fully
 * offline, and the plugin restores pending ones after a reboot. Nothing here is the source of truth: sync() rebuilds the
 * schedule from the database, so it self-heals after a restore, a cancel, a machine change or a missed event.
 */

const KIND = 'machine-done'
const CHANNEL = 'machine-done'
const native = Capacitor.isNativePlatform()

export type Cycle = Awaited<ReturnType<typeof listOpenCycles>>[number]

export const doneText = (c: Pick<Cycle, 'machine_code' | 'machine_type' | 'order_number'>) =>
  `${machineName(c.machine_code, c.machine_type)} has completed Order #${c.order_number}.`

let allowed: Promise<boolean> | null = null

/** Asks once per app run; notifications are an extra, so any failure just means in-app alerts only. */
function permission() {
  allowed ??= (async () => {
    try {
      let p = await LocalNotifications.checkPermissions()
      if (p.display === 'prompt' || p.display === 'prompt-with-rationale') p = await LocalNotifications.requestPermissions()
      if (p.display !== 'granted') return false
      if (native && Capacitor.getPlatform() === 'android') {
        await LocalNotifications.createChannel({
          id: CHANNEL,
          name: 'Machine timers',
          description: 'When a washer or dryer finishes its cycle',
          importance: 5,
          visibility: 1,
          vibration: true,
        })
      }
      return true
    } catch (e) {
      console.warn('Notifications unavailable', e)
      return false
    }
  })()
  return allowed
}

let queue: Promise<void> = Promise.resolve()

/** Brings scheduled notifications in line with the open cycles. Calls are serialized; errors are logged, never thrown. */
export function syncMachineAlerts() {
  queue = queue.then(doSync).catch((e) => console.warn('Machine alert sync failed', e))
  return queue
}

async function doSync() {
  if (!(await permission())) return
  const now = Date.now()
  const cycles = await listOpenCycles()
  const open = new Map(cycles.map((c) => [c.id, c]))
  const want = cycles.filter((c) => c.expected_end_at && Date.parse(c.expected_end_at) > now)

  const pending = (await LocalNotifications.getPending()).notifications.filter((n) => n.extra?.kind === KIND)
  // Stale: the cycle ended early (cancel / change machine) or the id now belongs to another cycle (after a restore).
  const stale = pending.filter((n) => open.get(n.id)?.expected_end_at !== n.extra?.endsAt)
  if (stale.length) await LocalNotifications.cancel({ notifications: stale.map((n) => ({ id: n.id })) })

  const have = new Set(pending.filter((n) => !stale.includes(n)).map((n) => n.id))
  const add = want.filter((c) => !have.has(c.id))
  if (add.length) {
    await LocalNotifications.schedule({
      notifications: add.map((c) => ({
        id: c.id,
        title: 'Laundry Finished',
        body: `${doneText(c)} ${c.customer_name} · Tap to unload.`,
        schedule: { at: new Date(c.expected_end_at!), allowWhileIdle: true },
        channelId: CHANNEL,
        extra: { kind: KIND, orderId: c.order_id, endsAt: c.expected_end_at },
      })),
    })
  }

  // Clear finished-cycle notifications from the shade once the machine is unloaded.
  if (native) {
    const delivered = (await LocalNotifications.getDeliveredNotifications()).notifications
    const gone = delivered.filter((n) => n.extra?.kind === KIND && !open.has(n.id))
    if (gone.length) await LocalNotifications.removeDeliveredNotifications({ notifications: gone })
  }
}

/** Tapping a notification opens that order on its Machines step (after sign-in, if needed). */
export function onAlertTap(open: (orderId: number) => void) {
  const h = LocalNotifications.addListener('localNotificationActionPerformed', (a) => {
    const id = Number(a.notification.extra?.orderId)
    if (a.notification.extra?.kind === KIND && id) open(id)
  })
  return () => { h.then((x) => x.remove()).catch(() => {}) }
}

/**
 * Android 12+ may deliver alarms a few minutes late unless exact alarms are allowed for the app (off by default on
 * Android 14). Returns null where it doesn't apply.
 */
export async function exactAlarmsAllowed(): Promise<boolean | null> {
  if (Capacitor.getPlatform() !== 'android') return null
  try {
    return (await LocalNotifications.checkExactNotificationSetting()).exact_alarm === 'granted'
  } catch {
    return null
  }
}

export const openExactAlarmSettings = () => LocalNotifications.changeExactNotificationSetting().catch(() => null)
