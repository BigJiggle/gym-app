import { describe, it, expect } from 'vitest'
import { computeWeeklyWeightRate } from '../../src/utils/weeklyRate'

// Minimal shape the util reads (a subset of CheckIn). Newest-first, exactly as
// the history query returns it.
const c = (date: string, weight: number) => ({ check_in_date: date, weight_kg: weight })

describe('computeWeeklyWeightRate', () => {
  it('returns null with fewer than 2 check-ins', () => {
    expect(computeWeeklyWeightRate([], 4)).toBeNull()
    expect(computeWeeklyWeightRate([c('2026-07-25', 90)], 4)).toBeNull()
  })

  it('computes a per-week slope for a weekly cadence (unchanged behavior)', () => {
    // 90 -> 88 across 3 weeks = -0.667 kg/wk over the recent-4 window
    const rate = computeWeeklyWeightRate(
      [c('2026-07-25', 88), c('2026-07-18', 88.7), c('2026-07-11', 89.3), c('2026-07-04', 90)],
      4
    )
    expect(rate).not.toBeNull()
    expect(rate!).toBeCloseTo((88 - 90) / 3, 5)
  })

  it('handles exactly 2 weekly check-ins', () => {
    const rate = computeWeeklyWeightRate([c('2026-07-25', 89), c('2026-07-18', 90)], 4)
    expect(rate).toBeCloseTo(-1, 5)
  })

  // The core bug: a daily-cadence athlete's recent window spans < 1 week, so a
  // routine water swing was extrapolated ~7x and poisoned the show projection.
  it('does NOT extrapolate a per-week rate from a sub-week daily window', () => {
    // Four consecutive days, 1 kg water swing. The old code returned 1/(3/7) = +2.33 kg/wk.
    const rate = computeWeeklyWeightRate(
      [c('2026-07-25', 90), c('2026-07-24', 89.5), c('2026-07-23', 89.2), c('2026-07-22', 89)],
      4
    )
    expect(rate).toBeNull()
  })

  it('extends the window past the min count so a daily user still gets a >=1-week rate', () => {
    // 8 daily check-ins spanning a full week: 91 -> 90 over 7 days = -1 kg/wk.
    const days = [
      c('2026-07-25', 90.0),
      c('2026-07-24', 90.1),
      c('2026-07-23', 90.3),
      c('2026-07-22', 90.4),
      c('2026-07-21', 90.6),
      c('2026-07-20', 90.7),
      c('2026-07-19', 90.9),
      c('2026-07-18', 91.0),
    ]
    const rate = computeWeeklyWeightRate(days, 4)
    expect(rate).not.toBeNull()
    expect(rate!).toBeCloseTo((90 - 91) / 1, 5)
  })

  it('returns null when all check-ins share the same day (weeksDiff = 0)', () => {
    const rate = computeWeeklyWeightRate(
      [c('2026-07-25', 90), c('2026-07-25', 89), c('2026-07-25', 91)],
      4
    )
    expect(rate).toBeNull()
  })

  it('ignores non-finite weights / dates without producing NaN', () => {
    const rate = computeWeeklyWeightRate(
      [c('2026-07-25', 88), c('2026-07-18', NaN), c('2026-07-11', 90)],
      4
    )
    // Skips the NaN anchor, uses the 2026-07-11 anchor (2 weeks): (88-90)/2
    expect(rate).toBeCloseTo(-1, 5)
  })
})
