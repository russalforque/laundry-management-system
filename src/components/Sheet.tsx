import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { I, Icon } from './Icons'

/** Drag distance (px) past which releasing the handle dismisses the sheet. */
const DISMISS_PX = 90

/**
 * Bottom sheet on phones, centered dialog on tablets. Rendered into <body> so it always
 * covers the bottom nav, whatever stacking context the caller sits in. Slides up on open,
 * slides down on close, and can be swiped down by its handle/header.
 */
export function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const [closing, setClosing] = useState(false)
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ startY: number; startT: number } | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const reduceMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const requestClose = () => (reduceMotion ? onClose() : setClosing(true))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') requestClose() }
    document.addEventListener('keydown', onKey)
    // Move focus into the dialog, unless a child (e.g. an autoFocus input) already took it.
    if (!panelRef.current?.contains(document.activeElement)) panelRef.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onDragStart = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return
    drag.current = { startY: e.clientY, startT: e.timeStamp }
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onDragMove = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current) setDragY(Math.max(0, e.clientY - drag.current.startY))
  }
  const onDragEnd = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    drag.current = null
    setDragging(false)
    if (!d) return
    const dy = Math.max(0, e.clientY - d.startY)
    const fast = dy > 30 && dy / Math.max(1, e.timeStamp - d.startT) > 0.6 // quick flick
    if (dy > DISMISS_PX || fast) requestClose()
    else setDragY(0)
  }

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 md:items-center ${
        closing ? 'animate-fade-out' : 'animate-fade-in'
      } motion-reduce:animate-none`}
      onClick={requestClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onAnimationEnd={(e) => { if (closing && e.target === e.currentTarget) onClose() }}
        style={dragY ? { transform: `translateY(${dragY}px)` } : undefined}
        className={`flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl outline-none md:rounded-3xl ${
          closing ? 'animate-sheet-down md:animate-dialog-out' : 'animate-sheet-up md:animate-dialog-in'
        } ${dragging ? '' : 'transition-transform duration-200'} motion-reduce:animate-none`}
      >
        <div
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
          className="shrink-0 touch-none select-none"
        >
          <div aria-hidden className="mx-auto mt-3 h-1.5 w-10 rounded-full bg-slate-300 md:hidden" />
          <div className="flex items-center justify-between px-5 pb-2 pt-3">
            <h2 className="text-lg font-bold text-slate-900">{label}</h2>
            <button type="button" onClick={requestClose} aria-label="Close" className="-mr-2 grid size-11 place-items-center rounded-full text-slate-400 active:bg-slate-100">
              <Icon className="h-5 w-5">{I.x}</Icon>
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1.5rem,calc(env(safe-area-inset-bottom)+1rem))]">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
