import { describe, it, expect } from 'vitest'
import { computeCarbLoad } from '../../src/utils/carbLoad'

describe('computeCarbLoad', () => {
  it('computes an 8–12 g/kg three-day load for a valid metric bodyweight', () => {
    const r = computeCarbLoad('84', false)
    expect(r).not.toBeNull()
    // 84 kg → 672–1008 g total, ≈ 224–336 g/day
    expect(r).toEqual({ low: 672, high: 1008, perDayLow: 224, perDayHigh: 336 })
  })

  it('converts an imperial bodyweight to kg before the 8–12 g/kg math', () => {
    const r = computeCarbLoad('185', true)
    expect(r).not.toBeNull()
    const kg = 185 * 0.453592
    expect(r!.low).toBe(Math.round(kg * 8))
    expect(r!.high).toBe(Math.round(kg * 12))
  })

  // The bug: a typed NEGATIVE bodyweight passed the old
  // `!isNaN(parseFloat(carbWeight))` guard (−80 is finite) and rendered
  // nonsensical negative carb targets. It must now yield null (nothing shown).
  it('returns null for a negative bodyweight instead of negative carb targets', () => {
    expect(computeCarbLoad('-80', false)).toBeNull()
    expect(computeCarbLoad('-185', true)).toBeNull()
  })

  // "0" is a truthy string so it also slipped past the old guard and rendered
  // "0–0g"; a zero bodyweight is meaningless here.
  it('returns null for a zero bodyweight', () => {
    expect(computeCarbLoad('0', false)).toBeNull()
  })

  it('returns null for empty / non-numeric input', () => {
    expect(computeCarbLoad('', false)).toBeNull()
    expect(computeCarbLoad('abc', false)).toBeNull()
  })
})
