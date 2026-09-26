/** Pill-shaped filter tab; place inside a `role="tablist"` row. */
export function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`min-h-10 shrink-0 whitespace-nowrap rounded-full px-5 text-sm font-medium transition-colors ${
        active ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30' : 'border border-slate-200 bg-white text-slate-600 active:bg-slate-50'
      }`}
    >
      {children}
    </button>
  )
}
