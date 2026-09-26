export const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-base outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-200'
export const primaryBtn = 'rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white active:bg-blue-700 disabled:opacity-60'
export const secondaryBtn = 'rounded-lg bg-slate-200 px-4 py-3 font-semibold text-slate-800 active:bg-slate-300'

/** Rounded input used by the redesigned (blue) screens. */
export const fieldCls =
  'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'

/**
 * Position for a page's floating action button: 2rem above the phone bottom nav
 * (4rem of tabs + its safe-area-aware bottom padding), bottom-right corner on larger screens.
 */
export const fabPos =
  'fixed right-6 z-20 bottom-[calc(6rem+max(0.5rem,env(safe-area-inset-bottom)))] md:bottom-8 md:right-8'
