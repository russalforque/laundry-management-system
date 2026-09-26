import { useLayoutEffect, useRef, type ChangeEvent, type InputHTMLAttributes } from 'react'
import { formatNumberInput, isSignificant, type NumberFormat } from '../lib/number'

/** How many digits / decimal points sit before position `at`. */
const countBefore = (s: string, at: number) => [...s.slice(0, at)].filter(isSignificant).length

/** The position just after the `n`-th digit / decimal point (commas skipped). */
function positionAfter(s: string, n: number) {
  let pos = 0
  while (pos < s.length && n > 0) {
    if (isSignificant(s[pos]!)) n--
    pos++
  }
  return pos
}

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'inputMode'> & NumberFormat & {
  value: string
  /** The formatted text (e.g. "1,250.50"); read it with parseNumber / parsePesoToCents. */
  onChange: (value: string) => void
}

/**
 * Text field for money, quantities and weights that adds thousands separators while typing.
 * Invalid characters, a second decimal point and extra decimals are ignored; the cursor stays next to
 * the digit just typed, and backspace over a comma deletes the digit before it.
 */
export function NumberInput({ value, onChange, decimals = 2, maxInt = 9, ...props }: Props) {
  const ref = useRef<HTMLInputElement>(null)
  const caret = useRef<number | null>(null) // digits before the cursor, restored after the re-render
  const shown = formatNumberInput(value, { decimals, maxInt })

  useLayoutEffect(() => {
    const el = ref.current
    if (caret.current === null || !el || document.activeElement !== el) return
    const pos = positionAfter(el.value, caret.current)
    el.setSelectionRange(pos, pos)
    caret.current = null
  })

  function handle(e: ChangeEvent<HTMLInputElement>) {
    const el = e.target
    let raw = el.value
    let at = el.selectionStart ?? raw.length
    // Deleting only a comma would bring it straight back; delete the digit beside it instead.
    const onlyCommaGone = raw.length < shown.length && [...raw].filter(isSignificant).join('') === [...shown].filter(isSignificant).join('')
    if (onlyCommaGone) {
      const kind = (e.nativeEvent as InputEvent).inputType
      if (kind === 'deleteContentForward') {
        let i = at
        while (i < raw.length && !isSignificant(raw[i]!)) i++
        if (i < raw.length) raw = raw.slice(0, i) + raw.slice(i + 1)
      } else {
        let i = at - 1
        while (i >= 0 && !isSignificant(raw[i]!)) i--
        if (i >= 0) { raw = raw.slice(0, i) + raw.slice(i + 1); at = i }
      }
    }
    const next = formatNumberInput(raw, { decimals, maxInt })
    const digits = Math.min(countBefore(raw, at), [...next].filter(isSignificant).length)
    if (next === shown) {
      // Nothing valid changed (e.g. a letter was typed): put the text and cursor back right away.
      el.value = shown
      const pos = positionAfter(shown, digits)
      el.setSelectionRange(pos, pos)
      return
    }
    caret.current = digits
    onChange(next)
  }

  return (
    <input
      {...props}
      ref={ref}
      type="text"
      inputMode={decimals > 0 ? 'decimal' : 'numeric'}
      autoComplete="off"
      value={shown}
      onChange={handle}
    />
  )
}
