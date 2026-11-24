// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import { usePlanStore } from '../../src/store/planStore'
import WeeklyScorecardWidget from '../../src/components/widgets/WeeklyScorecardWidget'

// Same bug class the 11-19 Diet "This Week" fix closed (countLoggedMeals), but on
// the DASHBOARD "Weekly Prep Scorecard" — which the fix did not reach. A mid-week
// meal-count REDUCTION (Settings / Regenerate / AI refine) leaves PAST-day
// completions at the now-removed meal indices in the DB (clearOrphanedMealCompletions
// purges only `date >= today`). The scorecard's Meals tile counted them RAW
// (`mealCompletions.filter(c => weekDates.includes(c.date)).length`), so a day
// logged 6/6 under a 6-meal plan inflates the weekly "logged/expected" past the
// real, displayable count once the plan shrinks to 4 — e.g. "6/4" on a Monday.
// The count must use the SAME mapped set the macro surfaces use.

const todayStr = new Date().toLocaleDateString('en-CA')

function meal(name: string) {
  return {
    name, time: '12:00', calories: 500, protein_g: 40, carbs_g: 50, fat_g: 15,
    foods: ['Chicken Breast (150g)'],
  }
}
const FOUR_MEALS = Array.from({ length: 4 }, (_, i) => meal(`Meal ${i + 1}`))

// Six completions logged under the old 6-meal plan; indices 4 & 5 are now orphaned
// relative to the 4-meal plan.
function sixCompletions() {
  return Array.from({ length: 6 }, (_, i) => ({
    id: i + 1, user_id: 1, date: todayStr, meal_index: i, meal_name: `Meal ${i + 1}`,
    completed: 1, logged_at: '',
  }))
}

// The widget counts Monday-through-today; compute the same window so the expected
// denominator is day-independent.
const now = new Date()
const dow = now.getDay()
const daysElapsed = (dow === 0 ? 6 : dow - 1) + 1
const expectedMeals = daysElapsed * 4

beforeEach(() => {
  localStorage.clear()
  usePlanStore.setState({
    dietPlan: { meals: FOUR_MEALS } as never,
    trainingPlan: null,
    workoutHistory: [],
    mealCompletions: sixCompletions(),
  } as never)
})

afterEach(() => cleanup())

describe('Weekly Prep Scorecard counts only completions that map to the current plan', () => {
  it(`does not inflate the Meals tile with orphaned completions (shows 4/${expectedMeals}, not 6/${expectedMeals})`, () => {
    render(<WeeklyScorecardWidget />)
    // The nonsensical over-count (6 mapped-and-orphan completions) must NOT appear.
    expect(screen.queryByText(`6/${expectedMeals}`)).toBeNull()
    // Only the 4 completions that still map to the 4-meal plan are counted.
    expect(screen.getByText(`4/${expectedMeals}`)).toBeTruthy()
  })
})
