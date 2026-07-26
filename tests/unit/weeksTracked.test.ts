import { describe, it, expect } from 'vitest'
import { computeWeeksTracked } from '../../src/utils/weeksTracked'

// Build a history newest-first (as checkin:history returns it) of `count`
// check-ins spaced `stepDays` apart, ending at `end` (YYYY-MM-DD).
function history(end: string, count: number, stepDays: number) {
  const endMs = new Date(end).getTime()
  return Array.from({ length: count }, (_, i) => ({
    check_in_date: new Date(endMs - i * stepDays * 86400000)
      .toISOString()
      .slice(0, 10),
  }))
}

describe('computeWeeksTracked', () => {
  it('daily-cadence: 22 daily check-ins over 3 weeks → 3, not the row count (the bug)', () => {
    // The old code showed checkinHistory.length (= 22 "weeks"); the real span is 21 days = 3 weeks.
    const daily = history('2026-07-26', 22, 1)
    expect(computeWeeksTracked(daily)).toBe(3)
    expect(daily.length).toBe(22) // proves count != weeks
  })

  it('weekly cadence: 6 weekly check-ins → 5 weeks of span', () => {
    expect(computeWeeksTracked(history('2026-07-26', 6, 7))).toBe(5)
  })

  it('exactly one week apart (2 entries) → 1', () => {
    expect(computeWeeksTracked(history('2026-07-26', 2, 7))).toBe(1)
  })

  it('fewer than 2 check-ins → 0', () => {
    expect(computeWeeksTracked([{ check_in_date: '2026-07-26' }])).toBe(0)
    expect(computeWeeksTracked([])).toBe(0)
  })

  it('sub-half-week span rounds to 0 weeks', () => {
    // 3 daily check-ins span 2 days ≈ 0.29 weeks → rounds to 0.
    expect(computeWeeksTracked(history('2026-07-26', 3, 1))).toBe(0)
  })

  it('is order-independent (uses min/max span)', () => {
    const asc = [
      { check_in_date: '2026-06-01' },
      { check_in_date: '2026-06-15' },
      { check_in_date: '2026-06-29' },
    ]
    const desc = [...asc].reverse()
    expect(computeWeeksTracked(asc)).toBe(4) // 28 days
    expect(computeWeeksTracked(desc)).toBe(4)
  })

  it('skips non-finite dates without producing NaN', () => {
    const withGarbage = [
      { check_in_date: '2026-07-26' },
      { check_in_date: 'not-a-date' },
      { check_in_date: '2026-07-12' },
    ]
    expect(computeWeeksTracked(withGarbage)).toBe(2) // 14 days between the two valid entries
  })
})
