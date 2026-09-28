import { useEffect, useState, type ReactNode } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { BrandingProvider, useBranding } from './context/BrandingContext'
import { runAutoBackupIfDue } from './db/backup'
import { initDb } from './db/client'
import { getSettings, setSetting } from './db/settings'
import { isSetupPending, seedAdminIfEmpty } from './db/users'
import { brandingFrom } from './lib/branding'
import type { Permission } from './lib/permissions'
import { clearRetiredMachineAlerts } from './lib/machineAlerts'
import { autoConnectPrinter } from './lib/printer'
import AppShell from './layouts/AppShell'
import { NAV } from './nav'
import Login from './pages/Login'
import Placeholder from './pages/Placeholder'
import Receipt from './pages/Receipt'
import Setup from './pages/Setup'
import { Intro, Splash } from './pages/Welcome'
import NewOrderSession from './routes/NewOrderSession'
import { ACCOUNT, CHANGE_PIN, CUSTOMER_DETAILS, NAV_PAGES, ORDER_DETAILS } from './routes/pages'
import { ScreenSwitch } from './routes/ScreenSwitch'

/** Route-level check; the db layer enforces the same permissions again (lib/permissions.ts). */
function Guard({ perm, children }: { perm?: Permission; children: ReactNode }) {
  const { can } = useAuth()
  return !perm || can(perm) ? children : <Navigate to="/" replace />
}

interface Boot {
  introSeen: boolean
  setupPending: boolean
}

function Gate({ boot, onBoot }: { boot: Boot; onBoot: (b: Boot) => void }) {
  const { user, pickUser } = useAuth()
  const [preselectId, setPreselectId] = useState<number | null>(null)
  // Keep the receipt printer connected while someone is signed in: at login and each time the app returns to the foreground.
  // Also clears any notifications left scheduled by the retired machine timers (once per run).
  useEffect(() => {
    if (!user) return
    autoConnectPrinter()
    clearRetiredMachineAlerts()
    const onVisible = () => { if (document.visibilityState === 'visible') autoConnectPrinter() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [user])
  if (!user) {
    if (!boot.introSeen)
      return <Intro onDone={() => { onBoot({ ...boot, introSeen: true }); setSetting(INTRO_SEEN, '1').catch(console.error) }} />
    if (boot.setupPending)
      return <Setup onDone={(id) => { setPreselectId(id); onBoot({ ...boot, setupPending: false }) }} />
    return <Login preselectId={pickUser ? null : preselectId} pickUser={pickUser} />
  }
  return (
    <HashRouter>
      <Routes>
        <Route path="/orders/:id/receipt" element={<Guard perm="orders.manage"><Receipt /></Guard>} />
        {/* Phone: tab bar chrome and pages/mobile. Tablet / desktop: sidebar chrome and pages/desktop-tablet. */}
        <Route element={<AppShell />}>
          {NAV.map((n) => (
            <Route
              key={n.to}
              path={n.to}
              element={<Guard perm={n.perm}>{NAV_PAGES[n.to] ? <ScreenSwitch {...NAV_PAGES[n.to]!} /> : <Placeholder title={n.label} />}</Guard>}
            />
          ))}
          <Route path="/orders/new" element={<Guard perm="orders.manage"><NewOrderSession /></Guard>} />
          <Route path="/orders/:id" element={<Guard perm="orders.manage"><ScreenSwitch {...ORDER_DETAILS} /></Guard>} />
          <Route path="/customers/:id" element={<Guard perm="customers.manage"><ScreenSwitch {...CUSTOMER_DETAILS} /></Guard>} />
          <Route path="/account" element={<ScreenSwitch {...ACCOUNT} />} />
          <Route path="/account/pin" element={<ScreenSwitch {...CHANGE_PIN} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}

const INTRO_SEEN = 'intro_seen'
/** Keeps the splash up long enough to read, and to let its progress bar finish. */
const SPLASH_MS = 1400

export default function App() {
  return (
    <BrandingProvider>
      <Root />
    </BrandingProvider>
  )
}

function Root() {
  const { setBrand } = useBranding()
  const [boot, setBoot] = useState<Boot | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const minSplash = new Promise((r) => setTimeout(r, SPLASH_MS))
    initDb()
      .then(seedAdminIfEmpty)
      .then(() => Promise.all([getSettings(), isSetupPending(), minSplash]))
      .then(([settings, setupPending]) => {
        setBrand(brandingFrom(settings))
        setBoot({ introSeen: settings[INTRO_SEEN] === '1', setupPending })
        runAutoBackupIfDue()
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [setBrand])

  if (error || !boot) return <Splash error={error} />
  return (
    <AuthProvider>
      <Gate boot={boot} onBoot={setBoot} />
    </AuthProvider>
  )
}
