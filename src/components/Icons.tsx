import type { ReactNode } from 'react'

/** 24px stroke icon; pass one of the `I` glyphs as children. */
export const Icon = ({ children, className = 'h-4 w-4' }: { children: ReactNode; className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={`shrink-0 ${className}`}>
    {children}
  </svg>
)

export const I = {
  washer: <><rect x="4" y="3" width="16" height="18" rx="2.5" /><path d="M4 7.5h16M7 5.25h.01M9.5 5.25h.01" /><circle cx="12" cy="14" r="4" /><path d="M9.5 14.5c1 .8 2 .8 3 0s2-.8 3 0" /></>,
  shirt: <path d="M8.5 3.5 4 6l1.5 4.5L7.5 10v10.5h9V10l2 .5L20 6l-4.5-2.5a3.5 3.5 0 0 1-7 0Z" />,
  iron: <><path d="M3.5 18h17v-2.5A6.5 6.5 0 0 0 14 9H8.2a3 3 0 0 0-2.9 2.2Z" /><path d="M11 6h5a3 3 0 0 1 3 3v1.5M9 14h.01M12 14h.01" /></>,
  bed: <><path d="M3 6v13M3 15h18v4M21 15v-3a3 3 0 0 0-3-3h-7v6" /><circle cx="7" cy="11.5" r="2" /></>,
  pillow: <path d="M5 6.5c4.5 1.2 9.5 1.2 14 0-1.2 3.7-1.2 7.3 0 11-4.5-1.2-9.5-1.2-14 0 1.2-3.7 1.2-7.3 0-11Z" />,
  layers: <><path d="m12 4 8.5 4.5L12 13 3.5 8.5Z" /><path d="m3.5 12.5 8.5 4.5 8.5-4.5M3.5 16.5 12 21l8.5-4.5" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  check: <><circle cx="12" cy="12" r="8.5" /><path d="m8.5 12.2 2.3 2.3 4.7-4.8" /></>,
  peso: <><circle cx="12" cy="12" r="8.5" /><path d="M10 17V7.5h2.8a2.6 2.6 0 0 1 0 5.2H10M8 9.6h8M8 11.4h8" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  userPlus: <><circle cx="10" cy="8" r="3.5" /><path d="M3.5 20a6.5 6.5 0 0 1 13 0M19 8v6M16 11h6" /></>,
  report: <><path d="M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-10l-5-5Z" /><path d="M14 3.5v5h5M9 13h6M9 16.5h4" /></>,
  note: <><path d="M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-10l-5-5Z" /><path d="M14 3.5v5h5" /></>,
  receipt: <><path d="M6 3.5h12v17l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3Z" /><path d="M9 8h6M9 11.5h6M9 15h3.5" /></>,
  wallet: <><rect x="3.5" y="6" width="17" height="13" rx="2.5" /><path d="M3.5 10h17M16 14.5h.01" /></>,
  basket: <><path d="M3.5 9.5h17l-1.6 9a2 2 0 0 1-2 1.5H7.1a2 2 0 0 1-2-1.5Z" /><path d="m8 9.5 3-5M16 9.5l-3-5M9.5 13v3.5M14.5 13v3.5" /></>,
  heat: <path d="M7.5 20c-2-2.5 2-5 0-7.5s0-5.5 0-8M12 20c-2-2.5 2-5 0-7.5s0-5.5 0-8M16.5 20c-2-2.5 2-5 0-7.5s0-5.5 0-8" />,
  bag: <><path d="M6 8h12l-1 12.5H7Z" /><path d="M9 8V6.5a3 3 0 0 1 6 0V8" /></>,
  phone: <path d="M5 4h3.5l1.5 4.5-2 1.25a11 11 0 0 0 6.25 6.25L15.5 14l4.5 1.5V19a1.5 1.5 0 0 1-1.5 1.5A15.5 15.5 0 0 1 3.5 5.5 1.5 1.5 0 0 1 5 4Z" />,
  pin: <><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.5" /></>,
  pencil: <><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16Z" /><path d="m13.5 6.5 4 4" /></>,
  more: <path d="M12 5h.01M12 12h.01M12 19h.01" strokeWidth={3} />,
  /** "More" tab in the bottom nav: four rounded squares. */
  menu: <><rect x="4" y="4" width="6.5" height="6.5" rx="1.75" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.75" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.75" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.75" /></>,
  box: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z" /><path d="m4 7.5 8 4.5 8-4.5M12 12v9" /></>,
  trash: <path d="M4.5 7h15M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  user: <><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
  chart: <path d="M4 20h16M7 16v-5M12 16V6M17 16v-8" />,
  orders: <><rect x="5" y="3.5" width="14" height="17" rx="2" /><path d="M9 8.5h6M9 12h6M9 15.5h3.5" /></>,
  refresh: <path d="M20 11a8 8 0 0 0-14.9-4M4 4v3.5h3.5M4 13a8 8 0 0 0 14.9 4M20 20v-3.5h-3.5" />,
  calendar: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 9.5h16M8.5 3v4M15.5 3v4" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></>,
  sliders: <><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>,
  chevron: <path d="m9 6 6 6-6 6" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  back: <path d="M19 12H5m6-6-6 6 6 6" />,
  next: <path d="M5 12h14m-6-6 6 6-6 6" />,
  register: <><rect x="4" y="11" width="16" height="9.5" rx="2" /><path d="M7 11V5.5A1.5 1.5 0 0 1 8.5 4h7A1.5 1.5 0 0 1 17 5.5V11M10 7.5h4M8 14.5h.01M12 14.5h.01M16 14.5h.01M8 17.5h8" /></>,
  cart: <><path d="M3.5 4.5h2l2 11h11l2-8H7" /><circle cx="9.5" cy="19.5" r="1.25" /><circle cx="17" cy="19.5" r="1.25" /></>,
  up: <path d="M12 18V6m-5 5 5-5 5 5" />,
  down: <path d="M12 6v12m-5-5 5 5 5-5" />,
  download: <path d="M12 4v11m-4.5-4.5L12 15l4.5-4.5M5 19.5h14" />,
  trend: <path d="M3.5 17 9.5 11l4 4 7-7.5M15 7.5h5.5V13" />,
  bulb: <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z" /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M10.6 5.6A9.7 9.7 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.6 3.4M6.6 6.6C3.9 8.3 2.5 12 2.5 12S6 18.5 12 18.5a9 9 0 0 0 4.4-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2M3.5 3.5l17 17" /></>,
  lock: <><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3M12 14.5v2" /></>,
  crown: <path d="M4 8.5 8 12l4-6.5 4 6.5 4-3.5-1.5 10h-13Z" />,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8h.01" /></>,
  home: <path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-6h-6v6H5.5A1.5 1.5 0 0 1 4 19Z" />,
  users: <><circle cx="9" cy="8.5" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M15.5 5.2a3.5 3.5 0 0 1 0 6.6M18 14.2a6.5 6.5 0 0 1 3.5 5.8" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 3.5v2M12 18.5v2M20.5 12h-2M5.5 12h-2M18 6l-1.4 1.4M7.4 16.6 6 18M18 18l-1.4-1.4M7.4 7.4 6 6" /><circle cx="12" cy="12" r="6.5" /></>,
  cloud: <><path d="M7 18.5a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.5 1.5 3.8 3.8 0 0 1-.4 7.5Z" /><path d="M12 16v-5m-2.2 2.2L12 11l2.2 2.2" /></>,
  store: <><path d="M4 9.5 5.5 4h13L20 9.5M4 9.5v10.5h16V9.5M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0" /><path d="M10 20v-5h4v5" /></>,
  database: <><ellipse cx="12" cy="6" rx="7" ry="2.5" /><path d="M5 6v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" /></>,
  shield: <><path d="M12 3.5 5 6v5.5c0 4.2 3 7.8 7 9 4-1.2 7-4.8 7-9V6Z" /><path d="m9 12 2 2 4-4" /></>,
  bell: <><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15Z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>,
  tick: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  scan: <><path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" /><path d="M8 8h3v3H8ZM13 13h3v3h-3ZM13 8h3M8 16h3" /></>,
  flash: <path d="M13 3 5.5 13.5H11L10 21l7.5-10.5H12Z" />,
  palette: <><path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.2 0 1.8-.9 1.4-2l-.3-.8a1.6 1.6 0 0 1 1.5-2.2H17a3.5 3.5 0 0 0 3.5-3.5c0-4.7-3.8-8.5-8.5-8.5Z" /><circle cx="7.8" cy="11" r="1" /><circle cx="10.5" cy="7.5" r="1" /><circle cx="15" cy="8" r="1" /></>,
  printer: <><path d="M7 8V3.5h10V8" /><rect x="3.5" y="8" width="17" height="8.5" rx="2" /><path d="M7 13.5h10v7H7Z" /></>,
  message: <><path d="M5.5 4.5h13a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H10l-4.5 3.5V17.5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z" /><path d="M8.5 10.5h.01M12 10.5h.01M15.5 10.5h.01" strokeWidth={2.5} /></>,
  logout: <><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" /><path d="M10 16.5 5.5 12 10 7.5M5.5 12H15" /></>,
  camera: <><path d="M4.5 8.5a2 2 0 0 1 2-2h1.8l1.4-2h4.6l1.4 2h1.8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2Z" /><circle cx="12" cy="12.5" r="3.5" /></>,
  image: <><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><circle cx="9" cy="9.5" r="1.5" /><path d="m20.5 15.5-4.5-4.5-8.5 8.5" /></>,
}

/** Picks a glyph from a service name, so items read at a glance without per-service config. */
export function serviceIcon(name: string) {
  const n = name.toLowerCase()
  if (/iron|press/.test(n)) return I.iron
  if (/pillow/.test(n)) return I.pillow
  if (/bed|sheet|linen/.test(n)) return I.bed
  if (/comforter|blanket|duvet|curtain|towel/.test(n)) return I.layers
  if (/dry.?clean/.test(n)) return I.washer
  return I.shirt
}
