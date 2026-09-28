import { useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useWide } from '../hooks/useScreen'
import { DesktopTabletSidebar } from './DesktopTabletNavigation'
import { MobileTabBar, MobileTopBar } from './MobileNavigation'
import { blueBackground, useMainScroll } from './navigation'

/**
 * The signed-in app frame. Phones get the phone chrome (MobileNavigation.tsx: top bar + bottom tab bar);
 * tablets and desktops get the sidebar / rail (DesktopTabletNavigation.tsx) and no tab bar.
 *
 * <main> and its <Outlet> keep the same place in the tree for both, so crossing the 768px breakpoint (a tablet
 * rotating, a window resizing) swaps the chrome without remounting the route underneath: New Order keeps its
 * draft (routes/NewOrderSession.tsx) while its page switches between the phone and tablet / desktop version.
 */
export default function AppShell() {
  const wide = useWide()
  const { pathname } = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  useMainScroll(mainRef)

  return (
    // h-dvh, not h-screen: on Android WebView 100vh can exceed the visible area, which lets the whole
    // shell (tab bar included) scroll. Only <main> scrolls.
    <div className={`flex h-dvh overflow-hidden bg-slate-100 ${wide ? '' : 'flex-col'}`}>
      {wide ? <DesktopTabletSidebar /> : <MobileTopBar />}
      <main ref={mainRef} className={`min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain ${wide ? 'p-6' : 'p-4'} ${blueBackground(pathname) ? 'bg-blue-50' : ''}`}>
        <Outlet />
      </main>
      {!wide && <MobileTabBar />}
    </div>
  )
}
