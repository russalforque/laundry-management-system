import { AccountDetails, AccountSheets, ProfileHeader } from '../../components/account/ProfileParts'
import { ChangePinFlow, Stepper } from '../../components/account/PinSteps'
import { btnSecondary, PageHeader, panelCls } from '../../components/desktop-tablet/ui'
import { I, Icon } from '../../components/Icons'
import { FloatingToast } from '../../components/Toast'
import { PIN_SUBTITLE, useChangePin } from '../../hooks/useChangePin'
import { useMyAccount } from '../../hooks/useMyAccount'

/**
 * My Account on tablets and desktops: profile (photo, name, username), account details and actions on the
 * left, Change PIN on the right. The PIN keypad also takes the keyboard's number keys. Same flows as the phone
 * pages (hooks/useMyAccount.ts, hooks/useChangePin.ts).
 */
export default function Account() {
  const c = useChangePin()
  const a = useMyAccount()
  const { switchUser, logout, user } = a

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-6">
      <PageHeader title="My Account" sub="Your profile and sign-in PIN." />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_28rem] lg:items-start">
        <aside className="min-w-0 space-y-4">
          <div className={`${panelCls} p-5`}>
            <ProfileHeader a={a} layout="row" />
          </div>
          {user && (
            <section className={`${panelCls} py-2`}>
              <h2 className="px-4 pb-1 pt-2 text-base font-bold text-slate-900">Account</h2>
              <AccountDetails user={user} />
            </section>
          )}
          <section className={`${panelCls} space-y-3 p-5`}>
            <h2 className="text-base font-bold text-slate-900">About your PIN</h2>
            <ul className="space-y-2 text-sm text-slate-600">
              <li className="flex gap-2"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-blue-600">{I.lock}</Icon>Use 4–6 digits that others can't guess.</li>
              <li className="flex gap-2"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-blue-600">{I.shield}</Icon>Too many wrong tries lock the account for a while; an admin can reset it.</li>
              <li className="flex gap-2"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-blue-600">{I.users}</Icon>Hand over the counter with Switch user, so every order is recorded under the right name.</li>
            </ul>
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="button" onClick={switchUser} className={btnSecondary}><Icon className="h-5 w-5">{I.users}</Icon>Switch user</button>
              <button type="button" onClick={logout} className={`${btnSecondary} text-red-600`}><Icon className="h-5 w-5">{I.logout}</Icon>Log out</button>
            </div>
          </section>
        </aside>

        <section aria-label="Change PIN" className="min-w-0 rounded-3xl bg-blue-50/60 p-5">
          <div className="flex items-start gap-2">
            {!c.done && c.step > 1 && (
              <button type="button" onClick={c.back} aria-label="Previous step" className="-ml-2 grid size-10 shrink-0 place-items-center rounded-full text-slate-900 hover:bg-blue-100">
                <Icon className="h-5 w-5">{I.back}</Icon>
              </button>
            )}
            <div className="min-w-0">
              <h2 className="text-lg font-bold leading-tight text-slate-900">Change PIN</h2>
              <p className="mt-0.5 truncate text-sm text-slate-500">{c.done ? 'Your PIN has been updated' : PIN_SUBTITLE[c.step]}</p>
            </div>
          </div>
          <Stepper step={c.done ? 4 : c.step} />
          <ChangePinFlow c={c} />
        </section>
      </div>
      <AccountSheets a={a} />
      <FloatingToast msg={a.msg} onDismiss={a.clearMsg} />
    </div>
  )
}
