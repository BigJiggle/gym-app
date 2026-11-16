// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useUserStore } from '../../src/store/userStore'
import { usePlanStore } from '../../src/store/planStore'
import { useSettingsStore } from '../../src/store/settingsStore'
import Diet from '../../src/pages/Diet'

// A regenerate from the Diet tab (Regenerate Meals, save prefs, toggle a
// restriction, exclude a food) all funnel through the store's generateDietPlan,
// whose IPC handler DELETEs+INSERTs the diet_plans row (new plan id) and purges
// today/future meal_completions whose positional meal_index no longer maps to a
// meal (clearOrphanedMealCompletions). The in-memory `mealCompletions` store is
// NOT refreshed by that path, so when the new plan has FEWER meals the store keeps
// the orphaned completions — "mealsEaten" (todayCompletions.length) then exceeds
// "totalMeals" (displayMeals.length), rendering e.g. "6/4 meals", greening the
// weekly-compliance cell, and suppressing every "all meals hit" state until a tab
// switch / relaunch. The reorder handlers already reload completions for exactly
// this reason; the regenerate paths must too.

const todayStr = new Date().toLocaleDateString('en-CA')

function meal(name: string) {
  return {
    name,
    time: '12:00',
    calories: 500,
    protein_g: 40,
    carbs_g: 50,
    fat_g: 15,
    foods: ['Chicken Breast (150g)', 'White Rice (100g cooked)'],
  }
}
const SIX_MEALS = Array.from({ length: 6 }, (_, i) => meal(`Meal ${i + 1}`))
const FOUR_MEALS = Array.from({ length: 4 }, (_, i) => meal(`Meal ${i + 1}`))

const PLAN_6 = {
  id: 10, user_id: 1, name: 'Deficit Nutrition Plan', calories_target: 3000,
  protein_g: 240, carbs_g: 300, fat_g: 90, meal_count: 6, meals: SIX_MEALS, phase: 'deficit',
}
// What a regenerate that shrinks the meal count produces (new id, fewer meals).
const PLAN_4 = { ...PLAN_6, id: 11, meal_count: 4, meals: FOUR_MEALS }

function completionsFor(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1, user_id: 1, date: todayStr, meal_index: i, meal_name: `Meal ${i + 1}`, completed: 1,
  }))
}

// The DB-backed completions the reload reads. Starts at 6 (logged under the
// 6-meal plan); the "regenerate" shrinks it to 4 (backend purged indices >= 4).
let completionsInDb = completionsFor(6)

beforeEach(() => {
  localStorage.clear()
  completionsInDb = completionsFor(6)
  const api: Record<string, ReturnType<typeof vi.fn>> = {
    getDietPlan: vi.fn().mockResolvedValue(PLAN_6),
    getMealCompletions: vi.fn().mockImplementation(async () => completionsInDb),
  }
  // Any api method the page/widgets touch that we didn't explicitly mock resolves
  // to null so the render never throws on an undefined api function.
  ;(window as unknown as { api: unknown }).api = new Proxy(api, {
    get(target, prop: string) {
      if (prop in target) return target[prop]
      return (target[prop] = vi.fn().mockResolvedValue(null))
    },
  })
  useUserStore.setState({
    user: {
      id: 1, name: 'Test', weight_kg: 85, sex: 'male', height_cm: 180, age: 30,
      goal: 'cut', training_frequency: 4, meal_count: 6, snack_count: 2,
    } as never,
    shows: [],
  } as never)
  usePlanStore.setState({
    trainingPlan: null, dietPlan: PLAN_6,
    latestCheckin: null, checkinHistory: [],
    mealCompletions: completionsFor(6), workoutHistory: [],
  } as never)
  useSettingsStore.setState({ settings: { units: 'metric' } } as never)
})

afterEach(() => cleanup())

describe('Diet regenerate refreshes meal completions', () => {
  it('reloads today completions when the plan is regenerated so orphans do not inflate meals-eaten', async () => {
    render(<MemoryRouter><Diet /></MemoryRouter>)
    await act(async () => {}) // flush mount effects → initial completions load

    const api = (window as unknown as { api: Record<string, ReturnType<typeof vi.fn>> }).api
    const loadsAfterMount = api.getMealCompletions.mock.calls.length

    // Simulate a regenerate that shrinks 6 → 4 meals: the backend purged today's
    // orphaned completions (indices 4,5), and the store received the new plan.
    completionsInDb = completionsFor(4)
    await act(async () => {
      usePlanStore.setState({ dietPlan: PLAN_4 as never })
    })
    await act(async () => {})

    // The completions-reload effect must refire on the new plan id, or the store
    // keeps 6 completions against a 4-meal plan ("6/4 meals").
    expect(api.getMealCompletions.mock.calls.length).toBeGreaterThan(loadsAfterMount)

    // Store now matches the DB: no completion points past the current meal count,
    // so mealsEaten (today completions) can never exceed totalMeals.
    const state = usePlanStore.getState()
    const todays = state.mealCompletions.filter((c) => c.date === todayStr)
    expect(todays.length).toBe(4)
    expect(todays.length).toBeLessThanOrEqual((state.dietPlan as { meal_count: number }).meal_count)
  })
})
