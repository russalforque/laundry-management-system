import type { ComponentType } from 'react'
import { useWide } from '../hooks/useScreen'

/**
 * Picks the presentation for the current screen: the phone component below 768px, the tablet / desktop one
 * from 768px up (hooks/useScreen.ts). Only the chosen one is rendered, so a phone never mounts desktop UI
 * and a tablet or desktop never mounts a Mobile* page. Both share their data and logic through hooks/.
 */
export function ScreenSwitch({ mobile: Mobile, wide: Wide }: { mobile: ComponentType; wide: ComponentType }) {
  return useWide() ? <Wide /> : <Mobile />
}
