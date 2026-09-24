import { useEffect, useState, type ReactNode } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { AuthProvider, useAuth } from './context/AuthContext'
import { initDb } from './db/client'
import { seedAdminIfEmpty } from './db/users'
import { NAV } from './nav'
import Account from './pages/Account'
import CustomerDetail from './pages/CustomerDetail'
import Customers from './pages/Customers'
import Login from './pages/Login'
import NewOrder from './pages/NewOrder'
import OrderDetail from './pages/OrderDetail'
import Orders from './pages/Orders'
import Placeholder from './pages/Placeholder'
import Services from './pages/Services'
import Users from './pages/Users'

const pages: Record<string, ReactNode> = {
  '/customers': <Customers />,
  '/orders': <Orders />,
  '/services': <Services />,
  '/users': <Users />,
}

function Guard({ roles, children }: { roles?: import('./types').Role[]; children: ReactNode }) {
  const { can } = useAuth()
  return !roles || can(...roles) ? children : <Navigate to="/" replace />
}

function Gate() {
  const { user } = useAuth()
  if (!user) return <Login />
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          {NAV.map((n) => (
            <Route
              key={n.to}
              path={n.to}
              element={<Guard roles={n.roles}>{pages[n.to] ?? <Placeholder title={n.label} />}</Guard>}
            />
          ))}
          <Route path="/orders/new" element={<NewOrder />} />
          <Route path="/orders/:id" element={<OrderDetail />} />
          <Route path="/customers/:id" element={<CustomerDetail />} />
          <Route path="/account" element={<Account />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}

export default function App() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    initDb()
      .then(seedAdminIfEmpty)
      .then(() => setReady(true))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  if (error) return <div className="p-6 text-red-600">Database error: {error}</div>
  if (!ready) return <div className="p-6 text-slate-500">Starting…</div>
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}
