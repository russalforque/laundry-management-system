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

export function Avatar({ name, className = 'size-11 text-sm', tone }: { name: string; className?: string; tone?: string }) {
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center rounded-full font-bold ${tone ?? toneFor(name)} ${className}`}>
      {initials(name)}
    </span>
  )
}
