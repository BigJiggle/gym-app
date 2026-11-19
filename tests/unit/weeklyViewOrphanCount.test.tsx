// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, act, screen } from '@testing-library/react'
import { useUserStore } from '../../src/store/userStore'
import { usePlanStore } from '../../src/store/planStore'
import WeeklyMealView from '../../src/pages/Diet/WeeklyMealView'

// A mid-week meal-count REDUCTION (Settings meal-count change, Regenerate Meals,
// AI refine that drops meals) purges only today/future orphaned completions
// (clearOrphanedMealCompletions: `date >= today`). Past-day completions at the
// now-removed meal indices survive in the DB and are loaded into the Weekly View.
//
// The per-day COMPLETION COUNT (completedCountForDay) used a raw
// `completions.filter(date).length`, so a day logged 6/6 under a 6-meal plan read
// "6/6" against the new 4-meal plan → the day cell showed "6/4", the progress bar
// went past 100%, and the day greened — while dayMacros (which indexes meals[idx])
// skipped the two orphans and counted only 4 meals. A same-screen count↔macro
// desync. The count must use the SAME mapped set the macros do.

const todayStr = new Date().toLocaleDateString('en-CA')

function meal(name: string) {
  return {
    name, time: '12:00', calories: 500, protein_g: 40, carbs_g: 50, fat_g: 15,
    foods: ['Chicken Breast (150g)'],
  }
}
const FOUR_MEALS = Array.from({ length: 4 }, (_, i) => meal(`Meal ${i + 1}`))

// Six completions logged TODAY under the old 6-meal plan; indices 4 & 5 are now
// orphaned relative to the 4-meal plan.
function sixCompletions() {
  return Array.from({ length: 6 }, (_, i) => ({
    id: i + 1, user_id: 1, date: todayStr, meal_index: i, meal_name: `Meal ${i + 1}`,
    completed: 1, logged_at: '',
  }))
}

beforeEach(() => {
  localStorage.clear()
  const api: Record<string, ReturnType<typeof vi.fn>> = {
    // The Weekly View's mount effect reloads the week's completions; return the
    // orphaned 6-set so the store keeps the past-day orphans (as the DB would).
    getMealCompletions: vi.fn().mockResolvedValue(sixCompletions()),
  }
  ;(window as unknown as { api: unknown }).api = new Proxy(api, {
    get(target, prop: string) {
      if (prop in target) return target[prop]
      return (target[prop] = vi.fn().mockResolvedValue(null))
    },
  })
  useUserStore.setState({ user: { id: 1, name: 'Test' } as never } as never)
  usePlanStore.setState({ mealCompletions: sixCompletions() } as never)
})

afterEach(() => cleanup())

describe('Weekly View counts only completions that map to the current plan', () => {
  it('shows "4/4" (not "6/4") for a day whose orphaned completions survive a meal-count reduction', async () => {
    render(<WeeklyMealView mealCount={4} meals={FOUR_MEALS} />)
    await act(async () => {}) // flush the completions-reload effect

    // The nonsensical over-count must NOT appear anywhere (day cell / header).
    expect(screen.queryByText('6/4')).toBeNull()
    expect(screen.queryByText('6/4 meals logged')).toBeNull()

    // The day cell is clamped to the mapped count: 4 of the 4 current meals.
    expect(screen.getAllByText('4/4').length).toBeGreaterThan(0)
    expect(screen.getByText('4/4 meals logged')).toBeTruthy()
  })
})
