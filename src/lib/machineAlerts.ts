import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'

/**
 * Machine timers (and their "Laundry Finished" notifications) were retired: the washers and dryers have their own timers.
 * Devices updated from a version with timers may still hold notifications it scheduled, which would fire for loads that
 * are no longer timed. This clears those once per app run, without asking for notification permission.
 */

const KIND = 'machine-done'
const CHANNEL = 'machine-done'

let cleared = false

export async function clearRetiredMachineAlerts() {
  if (cleared || !Capacitor.isNativePlatform()) return
  cleared = true
  try {
    if ((await LocalNotifications.checkPermissions()).display !== 'granted') return // never granted: nothing was scheduled
    const pending = (await LocalNotifications.getPending()).notifications.filter((n) => n.extra?.kind === KIND)
    if (pending.length) await LocalNotifications.cancel({ notifications: pending.map((n) => ({ id: n.id })) })
    const delivered = (await LocalNotifications.getDeliveredNotifications()).notifications.filter((n) => n.extra?.kind === KIND)
    if (delivered.length) await LocalNotifications.removeDeliveredNotifications({ notifications: delivered })
    if (Capacitor.getPlatform() === 'android') await LocalNotifications.deleteChannel({ id: CHANNEL })
  } catch (e) {
    console.warn('Could not clear old machine timer alerts', e)
  }
}
