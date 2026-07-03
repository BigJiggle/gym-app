import { useState, useEffect } from 'react'

interface StepperProps {
  value: number
  min: number
  max: number
  step?: number
  onChange: (n: number) => void
  ariaLabel?: string
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))

/**
 * Numeric stepper with −/+ buttons and a directly editable field.
 * Commits only clamped, finite integers so callers never receive NaN or
 * out-of-range values (e.g. a user typing "99" or clearing the field).
 */
export default function Stepper({ value, min, max, step = 1, onChange, ariaLabel }: StepperProps) {
  // Local text state lets the user clear the field mid-edit without it snapping.
  const [text, setText] = useState(String(value))

  useEffect(() => {
    setText(String(value))
  }, [value])

  const commit = (raw: string) => {
    const n = Math.round(Number(raw))
    if (raw.trim() === '' || !Number.isFinite(n)) {
      setText(String(value)) // revert to last valid value
      return
    }
    const clamped = clamp(n, min, max)
    setText(String(clamped))
    if (clamped !== value) onChange(clamped)
  }

  const bump = (delta: number) => {
    const next = clamp(value + delta, min, max)
    if (next !== value) onChange(next)
  }

  const btnCls =
    'w-10 py-2 rounded-lg text-lg font-bold border border-gray-700 bg-gray-800 text-gray-300 ' +
    'transition-colors hover:border-gray-600 disabled:opacity-40 disabled:cursor-not-allowed'

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label={ariaLabel ? `Decrease ${ariaLabel}` : 'Decrease'}
        onClick={() => bump(-step)}
        disabled={value <= min}
        className={btnCls}
      >
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        aria-label={ariaLabel}
        min={min}
        max={max}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        className="flex-1 min-w-0 text-center bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
      />
      <button
        type="button"
        aria-label={ariaLabel ? `Increase ${ariaLabel}` : 'Increase'}
        onClick={() => bump(step)}
        disabled={value >= max}
        className={btnCls}
      >
        +
      </button>
    </div>
  )
}
