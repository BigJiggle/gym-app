import { describe, it, expect } from 'vitest'
import { countLoggedMeals } from '../../src/utils/mealCompletions'

const C = (date: string, meal_index: number) => ({ date, meal_index })

describe('countLoggedMeals', () => {
  it('counts only completions that map to a meal in the current plan', () => {
    // 6 logged under an old 6-meal plan; current plan has 4 meals.
    const comps = [0, 1, 2, 3, 4, 5].map((i) => C('2026-11-16', i))
    expect(countLoggedMeals(comps, '2026-11-16', 4)).toBe(4)
  })

  it('is a no-op when the meal count grows (no orphans exist)', () => {
    const comps = [0, 1, 2, 3].map((i) => C('2026-11-16', i))
    expect(countLoggedMeals(comps, '2026-11-16', 6)).toBe(4)
  })

  it('counts a fully-logged day exactly', () => {
    const comps = [0, 1, 2, 3].map((i) => C('2026-11-16', i))
    expect(countLoggedMeals(comps, '2026-11-16', 4)).toBe(4)
  })

  it('ignores other dates and out-of-range / negative indices', () => {
    const comps = [
      C('2026-11-16', 0),
      C('2026-11-17', 1), // different day
      C('2026-11-16', -1), // corrupt negative index
      C('2026-11-16', 9), // orphan beyond current plan
    ]
    expect(countLoggedMeals(comps, '2026-11-16', 4)).toBe(1)
  })

  it('returns 0 for a zero-meal plan', () => {
    expect(countLoggedMeals([C('2026-11-16', 0)], '2026-11-16', 0)).toBe(0)
  })
})
