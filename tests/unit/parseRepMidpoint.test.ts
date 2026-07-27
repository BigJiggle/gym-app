import { describe, it, expect } from 'vitest'
import { parseRepMidpoint } from '../../src/utils/parseRepMidpoint'

describe('parseRepMidpoint', () => {
  it('averages a well-formed "lo-hi" range to its rounded midpoint', () => {
    expect(parseRepMidpoint('8-12')).toBe(10)
    expect(parseRepMidpoint('12-15')).toBe(14) // round(13.5) → 14
    expect(parseRepMidpoint('15-20')).toBe(18) // round(17.5) → 18
    expect(parseRepMidpoint('3-5')).toBe(4)
  })

  it('returns a single number unchanged', () => {
    expect(parseRepMidpoint('12')).toBe(12)
    expect(parseRepMidpoint('10')).toBe(10)
  })

  // The bug: a partial free-text entry with a trailing dash yielded NaN, which
  // seeded every set's default reps and propagated into summary volume /
  // reps_actual. It must resolve to a finite rep count instead.
  it('handles a trailing-dash partial entry without producing NaN', () => {
    const r = parseRepMidpoint('12-')
    expect(Number.isNaN(r)).toBe(false)
    expect(r).toBe(12)
  })

  it('handles a leading-dash partial entry without producing NaN', () => {
    const r = parseRepMidpoint('-12')
    expect(Number.isNaN(r)).toBe(false)
    expect(r).toBe(12)
  })

  it('falls back to 10 for empty / non-numeric input', () => {
    expect(parseRepMidpoint('')).toBe(10)
    expect(parseRepMidpoint('-')).toBe(10)
    expect(parseRepMidpoint('abc')).toBe(10)
  })

  it('never returns NaN for any of these inputs', () => {
    for (const s of ['8-12', '12', '12-', '-12', '', '-', 'abc', '10-', 'x-y', '8-12-15']) {
      expect(Number.isNaN(parseRepMidpoint(s))).toBe(false)
    }
  })
})
