import { describe, it, expect } from 'vitest'
import { computeAdherenceStreak } from '../../src/utils/adherenceStreak'
import { localDateStr } from '../../src/utils/dates'

// Same orphan-count desync class the 11-19 Diet "This Week" fix and the 11-24
// Weekly Prep Scorecard fix closed with countLoggedMeals — but on the DASHBOARD
// "N-day streak" badge, which those fixes did not reach (it still counted
// completions RAW with `mealCompletions.filter(c => c.date === dateStr).length`).
//
// After a mid-week meal-count REDUCTION, PAST-day completions at the now-removed
// indices survive in the DB (clearOrphanedMealCompletions purges only date>=today).
// A past day that logged only 2 of the CURRENT 4 meals, plus 2 orphaned index-4/5
// rows, has a RAW count of 4 → miscredited as a fully-logged day → inflated streak.

// Fixed base date so the generated completion dates are deterministic.
const BASE = new Date(2026, 5, 15, 12, 0, 0)
function dayOffset(n: number): string {
  const d = new Date(BASE)
  d.setDate(BASE.getDate() - n)
  return localDateStr(d)
}

describe('computeAdherenceStreak counts only completions mapping to the current plan', () => {
  it('does not credit a past day whose only "complete" count comes from orphaned indices', () => {
    const yesterday = dayOffset(1)
    const twoDaysAgo = dayOffset(2)
    // Current plan has 4 meals. Yesterday: indices 0,1 are real, 4,5 are orphans
    // from a former 6-meal plan — raw count 4, mapped count 2. Two days ago: a
    // genuine 4/4. The buggy raw count would read yesterday as 4/4 and give a
    // streak of 2; the correct mapped count breaks at yesterday → 0.
    const completions = [
      { date: yesterday, meal_index: 0 },
      { date: yesterday, meal_index: 1 },
      { date: yesterday, meal_index: 4 },
      { date: yesterday, meal_index: 5 },
      { date: twoDaysAgo, meal_index: 0 },
      { date: twoDaysAgo, meal_index: 1 },
      { date: twoDaysAgo, meal_index: 2 },
      { date: twoDaysAgo, meal_index: 3 },
    ]
    expect(computeAdherenceStreak(completions, 4, [], [], BASE)).toBe(0)
  })

  it('still counts genuinely fully-logged consecutive days', () => {
    const completions = [1, 2, 3].flatMap((n) =>
      [0, 1, 2, 3].map((idx) => ({ date: dayOffset(n), meal_index: idx })),
    )
    // No scheduled sessions → meal adherence alone drives the streak: 3 full days.
    expect(computeAdherenceStreak(completions, 4, [], [], BASE)).toBe(3)
  })

  it('breaks the streak when a scheduled session that day was not completed', () => {
    const yesterday = dayOffset(1)
    const completions = [0, 1, 2, 3].map((idx) => ({ date: yesterday, meal_index: idx }))
    // Yesterday fell on a day that has a scheduled session, but nothing completed.
    const d = new Date(BASE)
    d.setDate(BASE.getDate() - 1)
    const dow = d.getDay() === 0 ? 7 : d.getDay()
    expect(computeAdherenceStreak(completions, 4, [{ day_of_week: dow }], [], BASE)).toBe(0)
  })

  it('returns 0 when there is no meal plan', () => {
    expect(computeAdherenceStreak([], 0, [], [], BASE)).toBe(0)
  })
})
