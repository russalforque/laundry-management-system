import { useEffect } from 'react'
import { I, Icon } from './Icons'

export type Msg = { ok: boolean; text: string } | null

/** How long a success message stays up; errors stay until dismissed or replaced. */
const OK_MS = 3500

/** Clears a success message after a few seconds. */
export function useAutoDismiss(msg: Msg, onDismiss: () => void) {
  useEffect(() => {
    if (!msg?.ok) return
    const t = setTimeout(onDismiss, OK_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msg])
}

/** Green success / red error message with an icon and a dismiss button. */
export function Toast({ msg, onDismiss, className = '' }: { msg: NonNullable<Msg>; onDismiss: () => void; className?: string }) {
  return (
    <div
      role={msg.ok ? 'status' : 'alert'}
      className={`flex animate-toast-in items-start gap-3 rounded-xl py-2 pl-3 pr-1 text-sm font-medium transition-colors ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'} ${className}`}
    >
      <Icon className="mt-2.5 h-5 w-5 shrink-0">{msg.ok ? I.check : I.info}</Icon>
      <span className="min-w-0 flex-1 py-2">{msg.text}</span>
      <button type="button" onClick={onDismiss} aria-label="Dismiss message" className="grid size-11 shrink-0 place-items-center rounded-lg active:bg-black/5">
        <Icon className="h-4 w-4">{I.x}</Icon>
      </button>
    </div>
  )
}

/**
 * Message that floats at the bottom of the screen (above the phone's bottom nav), so feedback is
 * seen next to the button that was tapped, however far down the page it is. Place it last on the page.
 */
export function FloatingToast({ msg, onDismiss }: { msg: Msg; onDismiss: () => void }) {
  useAutoDismiss(msg, onDismiss)
  if (!msg) return null
  return (
    <div className="pointer-events-none sticky bottom-3 z-20 md:bottom-4">
      <Toast msg={msg} onDismiss={onDismiss} className="pointer-events-auto shadow-lg shadow-slate-900/10 ring-1 ring-black/5" />
    </div>
  )
}
