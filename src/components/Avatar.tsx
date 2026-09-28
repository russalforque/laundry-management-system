import { useState } from 'react'
import { useAvatarSrc } from '../lib/avatarPhoto'

const TONES = [
  'bg-blue-100 text-blue-700',
  'bg-blue-50 text-blue-600',
  'bg-blue-600 text-white',
  'bg-slate-100 text-slate-700',
  'bg-blue-200 text-blue-800',
  'bg-slate-200 text-slate-700',
]

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?'

/** Same name → same color, so a customer is recognizable across screens. */
const toneFor = (name: string) => TONES[[...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 0) % TONES.length]

/**
 * Round avatar: the employee's profile photo (users.photo, lib/avatarPhoto.ts) when there is one, otherwise
 * initials. `src` shows an image directly (e.g. a crop preview).
 */
export function Avatar({ name, className = 'size-11 text-sm', tone, photo, src }: {
  name: string
  className?: string
  tone?: string
  photo?: string | null
  src?: string | null
}) {
  const loaded = useAvatarSrc(photo)
  const url = src ?? loaded
  const [broken, setBroken] = useState<string | null>(null)
  if (url && broken !== url) {
    return <img src={url} alt="" aria-hidden onError={() => setBroken(url)} className={`shrink-0 rounded-full bg-slate-100 object-cover ${className}`} />
  }
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center rounded-full font-bold ${tone ?? toneFor(name)} ${className}`}>
      {initials(name)}
    </span>
  )
}
