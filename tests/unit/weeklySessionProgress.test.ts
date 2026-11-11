import { describe, it, expect } from 'vitest'
import { weeklySessionProgress, weekdayFromDateStr } from '../../src/utils/weeklySessionProgress'

// Week of Mon 2026-11-09 … Sun 2026-11-15 (day_of_week Mon=1 … Sun=7):
//   Mon 11-09=1  Tue 11-10=2  Wed 11-11=3  Thu 11-12=4  Fri 11-13=5  Sat 11-14=6  Sun 11-15=7
const MON = '2026-11-09'
const TUE = '2026-11-10'
const WED = '2026-11-11'
const THU = '2026-11-12'
const FRI = '2026-11-13'
const SAT = '2026-11-14'
const SUN = '2026-11-15'

describe('weekdayFromDateStr — noon-anchored, Sun→7', () => {
  it('maps ISO dates to the day_of_week scheme', () => {
    expect(weekdayFromDateStr(MON)).toBe(1)
    expect(weekdayFromDateStr(WED)).toBe(3)
    expect(weekdayFromDateStr(FRI)).toBe(5)
    expect(weekdayFromDateStr(SUN)).toBe(7) // JS getDay()===0 → 7
  })
})

describe('weeklySessionProgress — counts completed PLANNED sessions', () => {
  it('on-schedule: every planned day trained → done & allDone', () => {
    const r = weeklySessionProgress([1, 3, 5], [MON, WED, FRI])
    expect(r.doneCount).toBe(3)
    expect(r.total).toBe(3)
    expect(r.allDone).toBe(true)
  })

  // The core bug: training off the planned days must NOT read as "all done".
  // The old `completedDows.size` gave 3 here (== 3 sessions) → "3/3 · all done"
  // while NONE of the Mon/Wed/Fri squares were green.
  it('off-schedule: plan Mon/Wed/Fri, trained Tue/Thu/Sat → 0 done, not allDone', () => {
    const r = weeklySessionProgress([1, 3, 5], [TUE, THU, SAT])
    expect(r.doneCount).toBe(0)
    expect(r.allDone).toBe(false)
    // No planned weekday is in the completed set
    expect([1, 3, 5].filter((d) => r.completedDows.has(d))).toEqual([])
  })

  // Extra-day training beyond the plan must not push doneCount above total
  // (old code read "4/3" and suppressed the "all done" message). Here all
  // planned days ARE trained, plus an extra Saturday.
  it('extra day: plan Mon/Wed, trained Mon/Wed/Sat → 2/2 allDone (not 3/2)', () => {
    const r = weeklySessionProgress([1, 3], [MON, WED, SAT])
    expect(r.doneCount).toBe(2)
    expect(r.total).toBe(2)
    expect(r.allDone).toBe(true)
  })

  it('partial: only some planned days trained', () => {
    const r = weeklySessionProgress([1, 3, 5], [MON])
    expect(r.doneCount).toBe(1)
    expect(r.allDone).toBe(false)
  })

  it('Sunday-scheduled session trained on Sunday is credited', () => {
    const r = weeklySessionProgress([7], [SUN])
    expect(r.doneCount).toBe(1)
    expect(r.allDone).toBe(true)
  })

  it('empty plan → total 0, not allDone', () => {
    const r = weeklySessionProgress([], [MON])
    expect(r.total).toBe(0)
    expect(r.doneCount).toBe(0)
    expect(r.allDone).toBe(false)
  })
})
