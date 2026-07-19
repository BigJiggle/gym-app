// Regression test for the plan-generation weeks-out desync.
//
// Every plan-generation seam (planHandlers, showHandlers, claudeService) used to
// compute weeks-out from `Date.now()`:
//     Math.max(0, Math.floor((showNoon - Date.now()) / (day * 7)))
// while the UI countdown (`getShowCountdown` / `buildPrepTimeline`) measures it
// from LOCAL MIDNIGHT. Because Date.now() subtracts the part of today already
// elapsed, generating a plan in the afternoon/evening near a phase boundary
// produced a weeks-out ONE bucket lower than what the athlete is shown — so the
// generated diet/training phase disagreed with the displayed prep phase.
//
// `weeksUntilShow` mirrors the UI's midnight-based math, so the two always agree
// and the value no longer depends on the time of day.

import { describe, it, expect, afterEach, vi } from 'vitest'
import { weeksUntilShow } from '../../electron/services/showDates'
import { getShowCountdown } from '../../src/utils/dates'

describe('weeksUntilShow — matches the displayed countdown, independent of time of day', () => {
  afterEach(() => vi.useRealTimers())

  // 2026-09-06 is 49 days after 2026-07-19 → the UI shows "7 weeks out".
  const SHOW = '2026-09-06'

  it('agrees with getShowCountdown even when a plan is generated in the evening (was off-by-one)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 19, 20, 0, 0)) // Jul 19 2026, 8:00 PM local

    // The OLD data formula (inlined here) drops to 6 weeks in the evening —
    // disagreeing with the UI's 7-week countdown. This documents the bug.
    const oldFormula = Math.max(
      0,
      Math.floor((new Date(SHOW + 'T12:00:00').getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 7))
    )
    expect(oldFormula).toBe(6)

    // What the athlete actually sees, and what the fixed helper now returns.
    expect(getShowCountdown(SHOW).weeks).toBe(7)
    expect(weeksUntilShow(SHOW)).toBe(7)
  })

  it('is time-of-day independent (early morning == late night)', () => {
    const morning = weeksUntilShow(SHOW, new Date(2026, 6, 19, 6, 0, 0))
    const evening = weeksUntilShow(SHOW, new Date(2026, 6, 19, 23, 30, 0))
    expect(morning).toBe(evening)
    expect(morning).toBe(7)
  })

  it('matches getShowCountdown across a full day of generation times', () => {
    for (const hour of [0, 3, 9, 12, 15, 18, 21, 23]) {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2026, 6, 19, hour, 45, 0))
      expect(weeksUntilShow(SHOW)).toBe(getShowCountdown(SHOW).weeks)
      vi.useRealTimers()
    }
  })

  it('clamps a past show to 0', () => {
    expect(weeksUntilShow('2020-01-01', new Date(2026, 6, 19, 12, 0, 0))).toBe(0)
  })
})
