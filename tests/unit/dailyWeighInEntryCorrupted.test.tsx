// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import DailyWeighInWidget, { parseDailyWeightLog } from '../../src/components/widgets/DailyWeighInWidget'

// The Daily Weigh-In widget's localStorage guard (daily_weighInCorrupted test)
// only rejected a non-ARRAY value. But each ENTRY of a valid array is just as
// user-editable, and the widget then did `.find(e => e.date === …)` and summed
// `e.weight_kg` with no per-entry guard:
//   • a `null` entry → `null.date` → TypeError, and with no error boundary the
//     whole dashboard tab crashes (same failure class as the array-shape bug),
//   • a non-numeric weight (JSON string "80", null, "abc") → the `reduce` 7-day
//     average coerces via string concatenation: (0 + "80" + "81") / 2 → 4040.5,
//     a nonsense average silently shown to the athlete.
// parseDailyWeightLog must drop malformed entries while preserving valid ones.
beforeEach(() => localStorage.clear())
afterEach(() => cleanup())

const today = new Date().toLocaleDateString('en-CA')
function dayAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toLocaleDateString('en-CA')
}

describe('parseDailyWeightLog — per-entry corruption', () => {
  it('drops null / non-object entries but keeps valid ones', () => {
    const out = parseDailyWeightLog(
      JSON.stringify([null, 5, 'x', { date: today, weight_kg: 80 }])
    )
    expect(out).toEqual([{ date: today, weight_kg: 80 }])
  })

  it('coerces a numeric-string weight and drops it when out of bounds', () => {
    const out = parseDailyWeightLog(
      JSON.stringify([
        { date: today, weight_kg: '80' },      // string → coerced to 80
        { date: dayAgo(1), weight_kg: 850 },    // fat-fingered → dropped (bounds)
        { date: dayAgo(2), weight_kg: null },   // null → dropped (non-finite)
        { date: dayAgo(3), weight_kg: 'abc' },  // junk → dropped (NaN)
      ])
    )
    expect(out).toEqual([{ date: today, weight_kg: 80 }])
  })

  it('returns [] for a non-array or unparseable blob', () => {
    expect(parseDailyWeightLog('{}')).toEqual([])
    expect(parseDailyWeightLog('not json')).toEqual([])
    expect(parseDailyWeightLog(null)).toEqual([])
  })
})

describe('DailyWeighInWidget — per-entry corruption does not crash / NaN', () => {
  it('survives a null entry in an otherwise valid array', () => {
    localStorage.setItem(
      'daily_weight_log',
      JSON.stringify([null, { date: today, weight_kg: 80 }])
    )
    expect(() => render(<DailyWeighInWidget />)).not.toThrow()
    expect(screen.getByText('Daily Weigh-In')).toBeTruthy()
  })

  it('does not render a NaN / garbage 7-day average from string weights', () => {
    localStorage.setItem(
      'daily_weight_log',
      JSON.stringify([
        { date: today, weight_kg: '80' },
        { date: dayAgo(1), weight_kg: '81' },
      ])
    )
    render(<DailyWeighInWidget />)
    const body = document.body.textContent || ''
    expect(body.includes('NaN')).toBe(false)
    // The real average of 80 and 81 is 80.5 — not the 4040.5 string-concat value.
    expect(body.includes('4040')).toBe(false)
    expect(body.includes('80.5')).toBe(true)
  })
})
