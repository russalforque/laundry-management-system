import { useState, type ReactNode } from 'react'
import { AuthScreen, primaryAction, ScreenTitle, TopBar } from '../components/AuthScreen'
import { I, Icon } from '../components/Icons'
import { PinPad } from '../components/PinPad'
import { completeFirstRunSetup } from '../db/users'

type SetupRole = 'admin' | 'cashier'
const PIN_LENGTH = 4

const ROLES: { id: SetupRole; title: string; text: string; icon: ReactNode }[] = [
  { id: 'admin', title: 'Administrator', text: 'Full access to manage orders, customers, services, reports and settings.', icon: I.user },
  { id: 'cashier', title: 'Staff', text: 'Process orders and manage daily transactions.', icon: I.register },
]

type Step = { at: 'role' } | { at: 'create' } | { at: 'confirm'; pin: string } | { at: 'done'; userId: number }

/** First-run flow on a new install. `onDone` receives the account to preselect on Sign In. */
export default function Setup({ onDone }: { onDone: (userId: number) => void }) {
  const [role, setRole] = useState<SetupRole>('admin')
  const [step, setStep] = useState<Step>({ at: 'role' })

  if (step.at === 'role') return <ChooseRole value={role} onChange={setRole} onContinue={() => setStep({ at: 'create' })} />

  if (step.at === 'done') return <PinSuccess role={role} onContinue={() => onDone(step.userId)} />

  const confirming = step.at === 'confirm'
  return (
    <AuthScreen>
      <TopBar onBack={() => setStep(confirming ? { at: 'create' } : { at: 'role' })} />
      <div className="mt-6 mb-8">
        <ScreenTitle
          title={confirming ? 'Confirm PIN' : 'Create PIN'}
          text={confirming ? `Enter your ${PIN_LENGTH}-digit PIN again.` : `Set a ${PIN_LENGTH}-digit PIN to secure your account.`}
        />
      </div>
      <PinPad
        key={step.at}
        length={PIN_LENGTH}
        hint=""
        onSubmit={async (pin) => {
          if (!confirming) return setStep({ at: 'confirm', pin })
          if (pin !== step.pin) throw new Error("PINs don't match. Try again.")
          setStep({ at: 'done', userId: await completeFirstRunSetup(role, pin) })
        }}
      />
    </AuthScreen>
  )
}

function ChooseRole({ value, onChange, onContinue }: { value: SetupRole; onChange: (r: SetupRole) => void; onContinue: () => void }) {
  return (
    <AuthScreen>
      <TopBar />
      <h1 className="mt-4 text-[28px] font-bold leading-tight tracking-tight text-slate-900">Let's Set Up<br />Your App</h1>
      <p className="mt-2 max-w-60 text-[15px] leading-snug text-slate-500">Choose how you want to use Sellix Laundry.</p>

      <div role="radiogroup" aria-label="Role" className="mt-8 space-y-3">
        {ROLES.map((r) => {
          const on = r.id === value
          return (
            <button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(r.id)}
              className={`flex w-full items-start gap-4 rounded-2xl border-[1.5px] p-4 text-left transition active:scale-[0.99] ${
                on ? 'border-blue-300 bg-blue-50/70' : 'border-slate-200 bg-white active:bg-blue-50/40'
              }`}
            >
              <span className={`grid size-12 shrink-0 place-items-center rounded-xl ${on ? 'bg-blue-100 text-blue-600' : 'bg-blue-50 text-blue-600'}`}>
                <Icon className="h-6 w-6">{r.icon}</Icon>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-semibold text-slate-900">{r.title}</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-slate-500">{r.text}</span>
              </span>
              <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border-2 ${on ? 'border-blue-600' : 'border-slate-300'}`}>
                {on && <span className="size-3 rounded-full bg-blue-600" />}
              </span>
            </button>
          )
        })}
      </div>

      <button type="button" onClick={onContinue} className={`mt-auto ${primaryAction}`}>
        Continue<Icon className="h-5 w-5">{I.next}</Icon>
      </button>
    </AuthScreen>
  )
}

function PinSuccess({ role, onContinue }: { role: SetupRole; onContinue: () => void }) {
  return (
    <AuthScreen>
      <TopBar />
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <span className="grid size-32 animate-pop-in place-items-center rounded-full bg-blue-50">
          <span className="grid size-24 place-items-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-600/30">
            <svg viewBox="0 0 24 24" className="size-12" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m5 12.5 4.5 4.5L19 7.5" />
            </svg>
          </span>
        </span>
        <h1 className="mt-10 text-2xl font-bold tracking-tight text-slate-900">PIN Set Successfully!</h1>
        <p className="mt-3 max-w-72 text-[15px] leading-snug text-slate-500">
          Your PIN has been created. Use this PIN to sign in to your account.
        </p>
        {role === 'cashier' && (
          <p className="mt-6 max-w-72 rounded-2xl bg-blue-50 px-4 py-3 text-[13px] leading-snug text-blue-900">
            The Administrator account still uses the default PIN <b>1234</b>. Ask your admin to change it.
          </p>
        )}
      </div>
      <button type="button" onClick={onContinue} className={primaryAction}>
        Continue<Icon className="h-5 w-5">{I.next}</Icon>
      </button>
    </AuthScreen>
  )
}
