import { createContext, useContext, useState, type ReactNode } from 'react'
import { login as dbLogin } from '../db/users'
import type { Role, User } from '../types'

interface AuthValue {
  user: User | null
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  can: (...roles: Role[]) => boolean
}

const AuthContext = createContext<AuthValue | null>(null)

// Session lives in memory only: closing the app requires logging in again.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)

  const value: AuthValue = {
    user,
    login: async (u, p) => setUser(await dbLogin(u, p)),
    logout: () => setUser(null),
    can: (...roles) => !!user && (user.role === 'admin' || roles.includes(user.role)),
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
