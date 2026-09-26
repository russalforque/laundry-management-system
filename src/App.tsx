import { useEffect, useState, type ReactNode } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { MachineAlerts } from './components/MachineAlerts'
import { AuthProvider, useAuth } from './context/AuthContext'
import { BrandingProvider, useBranding } from './context/BrandingContext'
import { runAutoBackupIfDue } from './db/backup'
import { initDb } from './db/client'
import { getSettings, setSetting } from './db/settings'
import { isSetupPending, seedAdminIfEmpty } from './db/users'
import { brandingFrom } from './lib/branding'
import { autoConnectPrinter } from './lib/printer'
import { NAV } from './nav'
import Account from './pages/Account'
import Dashboard from './pages/Dashboard'
import CustomerDetail from './pages/CustomerDetail'
import Customers from './pages/Customers'
import Login from './pages/Login'
import Machines from './pages/Machines'
import NewOrder from './pages/NewOrder'
import OrderDetail from './pages/OrderDetail'
import Orders from './pages/Orders'
import Payments from './pages/Payments'
import Placeholder from './pages/Placeholder'
import Printer from './pages/Printer'
import Reports from './pages/Reports'
import Receipt from './pages/Receipt'
import Settings from './pages/Settings'
import Store from './pages/Store'
import Services from './pages/Services'
import Setup from './pages/Setup'
import Users from './pages/Users'
import { Intro, Splash } from './pages/Welcome'
import type { Permission } from './lib/permissions'

const pages: Record<string, ReactNode> = {
  '/customers': <Customers />,
  '/': <Dashboard />,
  '/machines': <Machines />,
  '/orders': <Orders />,
  '/payments': <Payments />,
  '/printer': <Printer />,
  '/reports': <Reports />,
  '/services': <Services />,
  '/settings': <Settings />,
  '/store': <Store />,
  '/users': <Users />,
}

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
  useEffect(() => {
    if (!user) return
    autoConnectPrinter()
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
      <MachineAlerts />
      <Routes>
        <Route path="/orders/:id/receipt" element={<Guard perm="orders.manage"><Receipt /></Guard>} />
        <Route element={<Layout />}>
          {NAV.map((n) => (
            <Route
              key={n.to}
              path={n.to}
              element={<Guard perm={n.perm}>{pages[n.to] ?? <Placeholder title={n.label} />}</Guard>}
            />
          ))}
          <Route path="/orders/new" element={<Guard perm="orders.manage"><NewOrder /></Guard>} />
          <Route path="/orders/:id" element={<Guard perm="orders.manage"><OrderDetail /></Guard>} />
          <Route path="/customers/:id" element={<Guard perm="customers.manage"><CustomerDetail /></Guard>} />
          <Route path="/account" element={<Account />} />
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
