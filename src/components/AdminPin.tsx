import { useState } from 'react'
import { verifyAdminPin } from '../db/users'
import { grantAdminApproval } from '../lib/permissions'
import { PinPad } from './PinPad'
import { Sheet } from './Sheet'

interface Request {
  reason: string
  resolve: (ok: boolean) => void
}

/**
 * Gate for sensitive actions: `await approve('Delete customer?')` resolves true once any
 * admin enters their PIN, false if dismissed. Render `sheet` somewhere in the component.
 */
export function useAdminPin() {
  const [req, setReq] = useState<Request | null>(null)

  const approve = (reason: string) => {
    // Keep hardware-keyboard digits going to the keypad, not a field behind the sheet.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    return new Promise<boolean>((resolve) => setReq({ reason, resolve }))
  }
  const close = (ok: boolean) => {
    req?.resolve(ok)
    setReq(null)
  }

  const sheet = req && (
    <Sheet label="Admin approval" onClose={() => close(false)}>
      <p className="px-1 pb-6 text-[15px] text-blue-900/70">{req.reason}</p>
      <div className="pb-2">
        <PinPad hint="Enter an admin PIN to continue" onSubmit={async (pin) => { await verifyAdminPin(pin); grantAdminApproval(); close(true) }} />
      </div>
    </Sheet>
  )

  return { approve, sheet }
}
