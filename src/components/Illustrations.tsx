import type { ReactNode } from 'react'

/**
 * Intro-slide artwork in the blue palette. Each piece sits on a soft blue disc and shares
 * the gradients defined in <Defs>, so the four read as one set.
 */
function Art({ id, children }: { id: string; children: ReactNode }) {
  return (
    <svg viewBox="0 0 240 200" className="h-full w-full" role="img" aria-hidden>
      <defs>
        <linearGradient id={`${id}-blue`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#60a5fa" />
          <stop offset="1" stopColor="#1d4ed8" />
        </linearGradient>
        <linearGradient id={`${id}-soft`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#dbeafe" />
        </linearGradient>
        <filter id={`${id}-shadow`} x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#1d4ed8" floodOpacity="0.18" />
        </filter>
      </defs>
      <circle cx="120" cy="100" r="92" fill="#eff6ff" />
      {children}
    </svg>
  )
}

const Sparkle = ({ x, y, s = 1 }: { x: number; y: number; s?: number }) => (
  <path transform={`translate(${x} ${y}) scale(${s})`} d="M0-10C1 -3 3 -1 10 0 3 1 1 3 0 10-1 3-3 1-10 0-3-1-1-3 0-10Z" fill="#3b82f6" />
)

/** Round white badge with a shirt, used as an accent on several slides. */
const ShirtBadge = ({ id, x, y }: { id: string; x: number; y: number }) => (
  <g transform={`translate(${x} ${y})`} filter={`url(#${id}-shadow)`}>
    <circle r="20" fill="#fff" />
    <path d="M-5-9-12-5l2.5 6 3-1V11h13V0l3 1 2.5-6-7-4a5 5 0 0 1-10 0Z" fill="#2563eb" />
  </g>
)

export function BasketArt() {
  const id = 'art1'
  return (
    <Art id={id}>
      <Sparkle x={196} y={42} />
      <Sparkle x={210} y={62} s={0.4} />
      {/* folded towels */}
      <g filter={`url(#${id}-shadow)`}>
        <rect x="62" y="70" width="116" height="26" rx="13" fill={`url(#${id}-soft)`} stroke="#bfdbfe" strokeWidth="1.5" />
        <rect x="70" y="52" width="100" height="24" rx="12" fill="#fff" stroke="#bfdbfe" strokeWidth="1.5" />
        <rect x="80" y="36" width="80" height="22" rx="11" fill="#2563eb" />
        <rect x="80" y="36" width="80" height="9" rx="4.5" fill="#60a5fa" />
      </g>
      {/* basket */}
      <g filter={`url(#${id}-shadow)`}>
        <path d="M44 92h152l-14 72a10 10 0 0 1-10 8H68a10 10 0 0 1-10-8Z" fill={`url(#${id}-blue)`} />
        <rect x="38" y="86" width="164" height="16" rx="8" fill="#3b82f6" />
        <rect x="38" y="86" width="164" height="6" rx="3" fill="#93c5fd" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <rect key={i} x={70 + i * 17} y="114" width="9" height="40" rx="4.5" fill="#bfdbfe" opacity="0.85" />
        ))}
      </g>
    </Art>
  )
}

export function PhoneArt() {
  const id = 'art2'
  return (
    <Art id={id}>
      {/* phone */}
      <g transform="rotate(-8 120 96)" filter={`url(#${id}-shadow)`}>
        <rect x="78" y="22" width="92" height="150" rx="16" fill="#2563eb" />
        <rect x="84" y="28" width="80" height="138" rx="11" fill="#fff" />
        <rect x="112" y="32" width="24" height="5" rx="2.5" fill="#bfdbfe" />
        <path d="M117 52l-9 5 3 7 3-1v15h16V63l3 1 3-7-9-5a5 5 0 0 1-10 0Z" fill="#3b82f6" />
        {[92, 108, 124].map((y) => (
          <g key={y}>
            <circle cx="98" cy={y + 4} r="4" fill="#93c5fd" />
            <rect x="108" y={y} width="44" height="8" rx="4" fill="#dbeafe" />
          </g>
        ))}
      </g>
      {/* checked order card */}
      <g filter={`url(#${id}-shadow)`}>
        <rect x="40" y="118" width="62" height="54" rx="12" fill="#fff" />
        <circle cx="62" cy="145" r="11" fill="#2563eb" />
        <path d="m57 145 3.5 3.5 6.5-7" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="78" y="138" width="16" height="5" rx="2.5" fill="#bfdbfe" />
        <rect x="78" y="147" width="12" height="5" rx="2.5" fill="#dbeafe" />
      </g>
      {/* basket */}
      <g filter={`url(#${id}-shadow)`}>
        <path d="M150 140h56l-6 30a6 6 0 0 1-6 5h-32a6 6 0 0 1-6-5Z" fill={`url(#${id}-blue)`} />
        <rect x="146" y="134" width="64" height="10" rx="5" fill="#3b82f6" />
        <path d="M160 134c2-14 34-14 36 0" stroke="#2563eb" strokeWidth="4" fill="none" />
        {[0, 1, 2, 3].map((i) => <rect key={i} x={163 + i * 9} y="150" width="5" height="16" rx="2.5" fill="#bfdbfe" />)}
      </g>
    </Art>
  )
}

export function GrowthArt() {
  const id = 'art3'
  return (
    <Art id={id}>
      <g filter={`url(#${id}-shadow)`}>
        <rect x="52" y="112" width="30" height="56" rx="8" fill={`url(#${id}-blue)`} />
        <rect x="92" y="88" width="30" height="80" rx="8" fill={`url(#${id}-blue)`} />
        <rect x="132" y="60" width="30" height="108" rx="8" fill={`url(#${id}-blue)`} />
        <rect x="52" y="112" width="30" height="10" rx="5" fill="#93c5fd" />
        <rect x="92" y="88" width="30" height="10" rx="5" fill="#93c5fd" />
        <rect x="132" y="60" width="30" height="10" rx="5" fill="#93c5fd" />
      </g>
      <path d="M44 98 C80 84 120 64 176 30" stroke="#2563eb" strokeWidth="7" fill="none" strokeLinecap="round" />
      <path d="M160 26l20 2-6 19" stroke="#2563eb" strokeWidth="7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <ShirtBadge id={id} x={176} y={144} />
    </Art>
  )
}

export function ReceiptArt() {
  const id = 'art4'
  return (
    <Art id={id}>
      {/* receipt */}
      <g filter={`url(#${id}-shadow)`}>
        <path d="M62 28h84v118l-7-5-7 5-7-5-7 5-7-5-7 5-7-5-7 5-7-5-7 5-7-5Z" fill="#fff" />
        <rect x="76" y="44" width="40" height="7" rx="3.5" fill="#3b82f6" />
        {[62, 76, 90, 104].map((y, i) => (
          <g key={y}>
            <circle cx="79" cy={y + 3} r="3" fill="#93c5fd" />
            <rect x="88" y={y} width={i % 2 ? 36 : 46} height="6" rx="3" fill="#dbeafe" />
          </g>
        ))}
      </g>
      {/* thermal printer */}
      <g filter={`url(#${id}-shadow)`}>
        <rect x="104" y="92" width="96" height="74" rx="18" fill={`url(#${id}-blue)`} />
        <rect x="118" y="80" width="68" height="26" rx="10" fill="#3b82f6" />
        <rect x="126" y="86" width="52" height="12" rx="4" fill="#1e40af" />
        <rect x="104" y="92" width="96" height="10" rx="5" fill="#60a5fa" opacity="0.6" />
      </g>
      <ShirtBadge id={id} x={152} y={158} />
    </Art>
  )
}
