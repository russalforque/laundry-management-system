import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from 'react'
import { applyBranding, cachedBranding, type Branding } from '../lib/branding'

const Ctx = createContext<{ brand: Branding; setBrand: (b: Branding) => void } | null>(null)

/** Current business branding; changing it re-themes the whole app immediately. */
export function BrandingProvider({ children }: { children: ReactNode }) {
  const [brand, setBrand] = useState(cachedBranding)
  useLayoutEffect(() => applyBranding(brand), [brand])
  return <Ctx.Provider value={{ brand, setBrand }}>{children}</Ctx.Provider>
}

export function useBranding() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useBranding must be used inside BrandingProvider')
  return ctx
}
