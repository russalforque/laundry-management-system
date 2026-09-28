import { ChangePinFlow, Stepper } from '../../components/account/PinSteps'
import { I, Icon } from '../../components/Icons'
import { PIN_SUBTITLE, useChangePin } from '../../hooks/useChangePin'

/** Phone My Account › Change PIN (/account/pin): three full-screen steps with a keypad. */
export default function MobileChangePin() {
  const c = useChangePin()
  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col">
      <header className="flex items-start gap-2">
        <button type="button" onClick={c.back} aria-label="Back" className="-ml-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-slate-900 active:bg-blue-50">
          <Icon className="h-6 w-6">{I.back}</Icon>
        </button>
        <div className="min-w-0 pt-1">
          <h1 className="text-xl font-bold leading-tight text-slate-900">Change PIN</h1>
          <p className="mt-0.5 truncate text-sm text-slate-500">{c.done ? 'Your PIN has been updated' : PIN_SUBTITLE[c.step]}</p>
        </div>
      </header>

      <Stepper step={c.done ? 4 : c.step} />
      <ChangePinFlow c={c} />
    </div>
  )
}
