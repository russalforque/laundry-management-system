import { createContext, useContext, useState, type ReactNode } from 'react'
import { loginWithPin, setupPin } from '../db/users'
import { hasPermission, setSessionUser, type Permission } from '../lib/permissions'
import type { User } from '../types'

interface AuthValue {
  user: User | null
  login: (userId: number, pin: string) => Promise<void>
  /** Legacy accounts without a PIN: verify the old password, save the new PIN, sign in. */
  setupAndLogin: (userId: number, password: string, pin: string) => Promise<void>
  logout: () => void
  /** Log out and open the sign-in account list (not the last user's keypad), e.g. to hand over to a cashier. */
  switchUser: () => void
  /** Set by switchUser until the next sign-in: Login starts on the account list. */
  pickUser: boolean
  /** Whether the signed-in employee has this permission (lib/permissions.ts). */
  can: (p: Permission) => boolean
  /** After a My Account edit: the same employee as now stored (name, username, photo). */
  refreshUser: (u: User) => void
}

const AuthContext = createContext<AuthValue | null>(null)

// Session lives in memory only: closing the app requires logging in again.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [pickUser, setPickUser] = useState(false)

  const signIn = (u: User) => {
    setPickUser(false)
    setSessionUser(u)
    setUser(u)
  }
  const signOut = () => { setSessionUser(null); setUser(null) }

  const value: AuthValue = {
    user,
    login: async (id, pin) => signIn(await loginWithPin(id, pin)),
    setupAndLogin: async (id, pw, pin) => signIn(await setupPin(id, pw, pin)),
    logout: signOut,
    switchUser: () => { setPickUser(true); signOut() },
    pickUser,
    can: (p) => hasPermission(user?.role, p),
    refreshUser: (u) => { if (u.id === user?.id) { setSessionUser(u); setUser(u) } },
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
