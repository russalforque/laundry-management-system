import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { AuthScreen, LogoTile, primaryAction } from '../components/AuthScreen'
import { Avatar } from '../components/Avatar'
import { I, Icon } from '../components/Icons'
import { NewPinPad, PinPad } from '../components/PinPad'
import { useAuth } from '../context/AuthContext'
import { useBranding } from '../context/BrandingContext'
import { checkLegacyPassword, listProfiles, ROLE_LABEL, type Profile } from '../db/users'
import { brandName } from '../lib/branding'

const LAST_KEY = 'login.lastUser'
const TONE = 'bg-blue-100 text-blue-700'

function readLast() {
  try {
    return Number(localStorage.getItem(LAST_KEY)) || null
  } catch {
    return null
  }
}

function saveLast(id: number) {
  try {
    localStorage.setItem(LAST_KEY, String(id))
  } catch {
    /* storage unavailable: preselecting the last user is a convenience only */
  }
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

/** Above this many accounts the list gets a search box. */
const SEARCH_FROM = 7

/**
 * `preselectId` comes from first-run setup, so the new account lands straight on its keypad.
 * `pickUser` (Switch User) opens on the account list instead of the last user's keypad.
 */
export default function Login({ preselectId, pickUser }: { preselectId?: number | null; pickUser?: boolean }) {
  const [profiles, setProfiles] = useState<Profile[] | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [lastId] = useState(readLast)

  const load = () => {
    setError('')
    return listProfiles().then(setProfiles, (e) => setError(e instanceof Error ? e.message : 'Could not load users.'))
  }

  useEffect(() => {
    listProfiles().then((ps) => {
      setProfiles(ps)
      // Returning staff land straight on their keypad.
      const last = preselectId ?? (pickUser ? null : readLast())
      setSelectedId((ps.find((p) => p.id === last) ?? (ps.length === 1 ? ps[0] : undefined))?.id ?? null)
    }, (e) => setError(e instanceof Error ? e.message : 'Could not load users.'))
  }, [preselectId, pickUser])

  const selected = profiles?.find((p) => p.id === selectedId)

  return (
    <AuthScreen>
      {selected ? (
        <PinStep
          key={selected.id}
          profile={selected}
          onSwitch={profiles!.length > 1 ? () => { setSelectedId(null); load() } : undefined}
        />
      ) : (
        <ProfileStep
          profiles={error ? [] : profiles}
          lastId={lastId}
          error={error}
          onRetry={() => { setProfiles(null); load() }}
          onPick={setSelectedId}
          switching={pickUser}
        />
      )}
    </AuthScreen>
  )
}

/**
 * Brand-coloured header running to the screen edges (and under the status bar): logo + business
 * name, then the screen's heading. The blue follows Settings › Branding like the rest of the app.
 */
function Hero({ children }: { children: ReactNode }) {
  const { brand } = useBranding()
  return (
    <header className="relative -mx-6 -mt-[max(env(safe-area-inset-top),0.75rem)] shrink-0 overflow-hidden rounded-b-4xl bg-blue-600 px-6 pb-7 pt-[max(env(safe-area-inset-top),0.75rem)] text-white sm:-mx-8 sm:px-8">
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-white/10" />
      <div aria-hidden className="pointer-events-none absolute -bottom-28 -left-12 size-52 rounded-full bg-white/5" />
      <div className="relative flex h-12 items-center gap-2.5">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white shadow-sm shadow-blue-900/20"><LogoTile size="xs" /></span>
        <span className="min-w-0 truncate font-semibold">{brandName(brand)}</span>
      </div>
      <div className="relative mt-6">{children}</div>
    </header>
  )
}

function ProfileStep({ profiles, lastId, error, onRetry, onPick, switching }: {
  profiles: Profile[] | null; lastId: number | null; error: string; onRetry: () => void; onPick: (id: number) => void; switching?: boolean
}) {
  const [search, setSearch] = useState('')
  const q = search.trim().toLowerCase()
  const shown = q && profiles ? profiles.filter((p) => `${p.full_name} ${ROLE_LABEL[p.role]}`.toLowerCase().includes(q)) : profiles
  const searchable = !error && !!profiles && profiles.length >= SEARCH_FROM

  return (
    <div className="flex flex-1 flex-col">
      <Hero>
        <h1 className="text-[28px] font-bold leading-tight tracking-tight">{switching ? 'Switch user' : 'Who’s signing in?'}</h1>
        <p className="mt-1 text-[15px] text-white/80">Tap your name to continue.</p>
        {searchable && (
          <div className="relative mt-5">
            <Icon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400">{I.search}</Icon>
            <input
              type="search" enterKeyHint="search" aria-label="Find your name" placeholder="Find your name"
              value={search} onChange={(e) => setSearch(e.target.value)}
              className="h-13 w-full rounded-2xl border-0 bg-white pl-12 pr-12 text-base text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:ring-4 focus:ring-white/40"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-1 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full text-slate-400 active:bg-slate-100">
                <Icon className="h-5 w-5">{I.x}</Icon>
              </button>
            )}
          </div>
        )}
      </Hero>

      <div className="mt-6 flex-1">
        {error ? (
          <div role="alert" className="flex flex-col items-center rounded-2xl border border-red-100 bg-red-50 px-4 py-6 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-white text-red-600 shadow-sm"><Icon className="h-6 w-6">{I.info}</Icon></span>
            <p className="mt-3 font-semibold text-red-700">Couldn’t load accounts</p>
            <p className="mt-1 text-sm text-red-700/80">{error}</p>
            <button type="button" onClick={onRetry} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-red-700 shadow-sm active:bg-red-100">
              <Icon className="h-5 w-5">{I.refresh}</Icon>Try again
            </button>
          </div>
        ) : profiles?.length === 0 ? (
          <Notice icon={I.users} title="No active accounts" text="Ask an admin to reactivate your account." />
        ) : shown?.length === 0 ? (
          <Notice icon={I.search} title="No match" text={`No account matches “${search.trim()}”.`} />
        ) : (
          <>
            <p className="mb-3 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              {shown ? `${shown.length} account${shown.length === 1 ? '' : 's'}` : 'Accounts'}
            </p>
            <ul className="space-y-2.5" aria-busy={shown === null}>
              {shown === null
                ? [0, 1, 2].map((i) => <li key={i} className="h-19 animate-pulse rounded-2xl bg-slate-100" />)
                : shown.map((p) => <ProfileRow key={p.id} profile={p} last={p.id === lastId} onPick={onPick} />)}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}

function ProfileRow({ profile: p, last, onPick }: { profile: Profile; last: boolean; onPick: (id: number) => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onPick(p.id)}
        className={`flex min-h-19 w-full items-center gap-4 rounded-2xl border bg-white px-4 py-3 text-left shadow-[0_1px_3px_rgba(15,23,42,0.06)] transition active:scale-[0.99] active:bg-blue-50/70 ${
          last ? 'border-blue-200 ring-1 ring-blue-100' : 'border-slate-200/80'
        }`}
      >
        <Avatar name={p.full_name} photo={p.photo} tone={last ? 'bg-blue-600 text-white' : TONE} className="size-12 text-base" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-semibold text-slate-900">{p.full_name}</span>
          <span className="mt-0.5 flex items-center gap-2 text-[13px] text-slate-500">
            {ROLE_LABEL[p.role]}
            {last && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">Last used</span>}
          </span>
        </span>
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-slate-50 text-slate-400">
          <Icon className="h-4 w-4">{I.chevron}</Icon>
        </span>
      </button>
    </li>
  )
}

function Notice({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="flex flex-col items-center rounded-2xl bg-slate-50 px-4 py-8 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-white text-slate-400 shadow-sm"><Icon className="h-6 w-6">{icon}</Icon></span>
      <p className="mt-3 font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{text}</p>
    </div>
  )
}

function PinStep({ profile, onSwitch }: { profile: Profile; onSwitch?: () => void }) {
  const { login, setupAndLogin } = useAuth()
  const [password, setPassword] = useState<string | null>(null)
  const needsSetup = !profile.pin_length
  const name = firstName(profile.full_name)

  return (
    <div className="flex flex-1 flex-col">
      {/* Who is signing in; the keypad below keeps the thumb zone. */}
      <Hero>
        <p className="text-sm font-medium text-white/75">{needsSetup ? 'Set up your PIN' : greeting()}</p>
        <h1 className="mt-0.5 truncate text-[28px] font-bold leading-tight tracking-tight">{name}</h1>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex min-h-8 items-center rounded-full bg-white/15 px-3 text-[13px] font-medium">
            {needsSetup ? `Step ${password === null ? 1 : 2} of 2 · ${password === null ? 'Confirm password' : 'Choose PIN'}` : ROLE_LABEL[profile.role]}
          </span>
          {onSwitch && (
            <button
              type="button"
              onClick={onSwitch}
              aria-label={`Not ${name}? Switch user`}
              className="-mr-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-white active:bg-white/15"
            >
              <Icon className="h-4 w-4">{I.users}</Icon>Switch user
            </button>
          )}
        </div>
      </Hero>

      <div className="mt-8 flex w-full flex-1 flex-col items-center">
        {!needsSetup ? (
          <PinPad
            length={profile.pin_length}
            lockedUntil={profile.locked_until}
            hint={`Enter your ${profile.pin_length}-digit PIN`}
            onSubmit={async (pin) => { await login(profile.id, pin); saveLast(profile.id) }}
          />
        ) : password === null ? (
          <PasswordStep userId={profile.id} onDone={setPassword} />
        ) : (
          <NewPinPad onDone={async (pin) => { await setupAndLogin(profile.id, password, pin); saveLast(profile.id) }} />
        )}
      </div>

      {!needsSetup && (
        <p className="flex items-center justify-center gap-1.5 pt-4 text-center text-[13px] text-slate-500">
          <Icon className="h-4 w-4 shrink-0 text-slate-400">{I.info}</Icon>Forgot your PIN? Ask an admin to reset it.
        </p>
      )}
    </div>
  )
}

/** One-time step for accounts created before PIN login: confirm the old password. */
function PasswordStep({ userId, onDone }: { userId: number; onDone: (password: string) => void }) {
  const [value, setValue] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await checkLegacyPassword(userId, value)
      onDone(value)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="w-full">
      <p className="text-[15px] text-slate-600">Sign-in now uses a PIN. Enter your current password once to set it up.</p>
      <label className="mt-5 block text-sm font-semibold text-slate-800">
        Current password
        <span className="relative mt-1.5 block">
          <input
            type={show ? 'text' : 'password'}
            autoComplete="current-password"
            autoFocus
            required
            aria-invalid={!!error}
            aria-describedby={error ? 'password-error' : undefined}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className={`h-14 w-full rounded-2xl border-[1.5px] pl-4 pr-14 text-base font-normal text-slate-900 outline-none focus:ring-4 ${
              error ? 'border-red-300 focus:border-red-500 focus:ring-red-100' : 'border-slate-200 focus:border-blue-600 focus:ring-blue-100'
            }`}
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? 'Hide password' : 'Show password'}
            aria-pressed={show}
            className="absolute right-1.5 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-xl text-slate-500 active:bg-slate-100"
          >
            <Icon className="h-5 w-5">{show ? I.eyeOff : I.eye}</Icon>
          </button>
        </span>
      </label>
      {error && <p id="password-error" role="alert" className="mt-2 text-sm font-semibold text-red-600">{error}</p>}
      <button disabled={busy || !value} className={`mt-5 ${primaryAction}`}>
        {busy ? 'Checking…' : 'Continue'}
      </button>
    </form>
  )
}
