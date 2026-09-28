import { useNavigate } from 'react-router-dom'
import { AccountDetails, AccountSheets, ProfileHeader } from '../../components/account/ProfileParts'
import { AppHeader } from '../../components/AppHeader'
import { I, Icon } from '../../components/Icons'
import { card } from '../../components/Manage'
import { FloatingToast } from '../../components/Toast'
import { useMyAccount } from '../../hooks/useMyAccount'

const heading = 'mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500'

/**
 * Phone My Account (More › My Account): the signed-in employee's own photo, name and username, Change PIN
 * (its own page, /account/pin), role and status, and Log out. Managing other employees stays in Users.
 */
export default function MobileAccount() {
  const a = useMyAccount()
  const navigate = useNavigate()
  const { user } = a
  if (!user) return null

  return (
    <div className="mx-auto max-w-md space-y-5 pb-6">
      <AppHeader />
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">My Account</h1>

      <div className={`${card} px-4 py-6`}>
        <ProfileHeader a={a} layout="center" />
      </div>

      <section>
        <h2 className={heading}>Security</h2>
        <button type="button" onClick={() => navigate('/account/pin')} className={`${card} flex min-h-16 w-full items-center gap-4 px-4 text-left active:bg-slate-50`}>
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600"><Icon className="h-5 w-5">{I.lock}</Icon></span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-slate-900">Change PIN</span>
            <span className="block text-sm text-slate-500">Your current PIN is required</span>
          </span>
          <Icon className="h-5 w-5 shrink-0 text-slate-400">{I.chevron}</Icon>
        </button>
      </section>

      <section>
        <h2 className={heading}>Account</h2>
        <div className={card}><AccountDetails user={user} /></div>
      </section>

      <div className="space-y-2">
        <button type="button" onClick={a.switchUser} className={`${card} flex min-h-13 w-full items-center justify-center gap-2 font-semibold text-blue-600 active:bg-blue-50`}>
          <Icon className="h-5 w-5">{I.users}</Icon>Switch user
        </button>
        <button type="button" onClick={a.logout} className="flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl font-semibold text-red-600 active:bg-red-50">
          <Icon className="h-5 w-5">{I.logout}</Icon>Log out
        </button>
      </div>

      <AccountSheets a={a} />
      <FloatingToast msg={a.msg} onDismiss={a.clearMsg} />
    </div>
  )
}
