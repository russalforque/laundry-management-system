import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useWide } from '../hooks/useScreen'
import { useOrderDraft } from '../hooks/useOrderDraft'
import { PHONE_FLOW, TABLET_FLOW, useOrderWizard } from '../hooks/useOrderWizard'
import NewOrder from '../pages/desktop-tablet/NewOrder'
import MobileNewOrder from '../pages/mobile/MobileNewOrder'

/**
 * /orders/new. The draft (hooks/useOrderDraft.ts) and the wizard step (hooks/useOrderWizard.ts) live here, above the
 * layout switch, so rotating a tablet or resizing a window across the phone breakpoint never loses the order in
 * progress. The phone and tablet / desktop pages render the same steps from the same draft.
 *
 * "Start new order" remounts the session with a new key, so every field starts blank again. A page reload
 * would do the same but also drops the sign-in (kept in memory only) and sends staff back to the login screen.
 */
export default function NewOrderSession() {
  const navigate = useNavigate()
  const [run, setRun] = useState(0)
  return (
    <Session
      key={run}
      onRestart={() => {
        navigate('/orders/new', { replace: true }) // drop ?customer= and ?step= from the last order
        setRun((r) => r + 1)
        document.querySelector('main')?.scrollTo({ top: 0 })
      }}
    />
  )
}

function Session({ onRestart }: { onRestart: () => void }) {
  const [params] = useSearchParams()
  const preset = Number(params.get('customer')) || 0
  const d = useOrderDraft(preset)
  const wide = useWide()
  const w = useOrderWizard(d, preset, wide ? TABLET_FLOW : PHONE_FLOW)
  return wide
    ? <NewOrder d={d} w={w} onRestart={onRestart} />
    : <MobileNewOrder d={d} w={w} onRestart={onRestart} />
}
