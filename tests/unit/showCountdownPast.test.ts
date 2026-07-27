import { describe, it, expect } from 'vitest'
import { getShowCountdown } from '../../src/utils/dates'

// Build a local YYYY-MM-DD offset n days from today, staying at local midnight so
// month/day rollover and DST are handled the same way getShowCountdown builds
// `todayMidnight` internally.
function shiftDays(n: number): string {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + n).toLocaleDateString('en-CA')
}

describe('getShowCountdown — past vs today (isPast)', () => {
  it('a show today is not past and reads 0 days out', () => {
    const c = getShowCountdown(shiftDays(0))
    expect(c.totalDays).toBe(0)
    expect(c.isPast).toBe(false)
  })

  it('a show yesterday is past (the bug: it was clamped to 0 and read as "SHOW DAY!")', () => {
    const c = getShowCountdown(shiftDays(-1))
    expect(c.totalDays).toBe(0)   // still clamped — contract preserved for existing callers
    expect(c.isPast).toBe(true)   // …but now distinguishable from today
  })

  it('a show a month ago is past', () => {
    const c = getShowCountdown(shiftDays(-30))
    expect(c.totalDays).toBe(0)
    expect(c.isPast).toBe(true)
  })

  it('an upcoming show is not past and keeps its weeks/days breakdown', () => {
    const c = getShowCountdown(shiftDays(10))
    expect(c.isPast).toBe(false)
    expect(c.totalDays).toBe(10)
    expect(c.weeks).toBe(1)
    expect(c.days).toBe(3)
  })

  it('an exact-week upcoming show has zero remainder days', () => {
    const c = getShowCountdown(shiftDays(14))
    expect(c.isPast).toBe(false)
    expect(c.totalDays).toBe(14)
    expect(c.weeks).toBe(2)
    expect(c.days).toBe(0)
  })
})
