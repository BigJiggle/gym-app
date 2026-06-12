/**
 * Integration tests — user-journey level.
 *
 * These tests mock window.api and exercise the Zustand stores exactly as the
 * UI would: call store actions in realistic sequences and assert that the
 * resulting state matches what the user should see.
 *
 * Philosophy: each test represents a USER scenario, not a unit of code.
 * If a test fails, a real user would notice a bug.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── Store imports ────────────────────────────────────────────────────────────
// Import after mocking window so Zustand picks up the mock api
import { usePlanStore } from '../../src/store/planStore'
import { useUserStore } from '../../src/store/userStore'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeMealCompletion(overrides = {}) {
  return { id: 1, user_id: 1, date: '2026-05-18', meal_index: 0, meal_name: 'Breakfast', completed: 1, logged_at: new Date().toISOString(), ...overrides }
}

function makeSet(overrides = {}) {
  return { id: 1, workout_log_id: 1, exercise_name: 'Squat', set_number: 1, reps_prescribed: '5', reps_actual: 5, weight_kg: 100, rir_actual: 2, skipped: 0, notes: null, ...overrides }
}

function makeWorkoutLog(overrides = {}) {
  return { id: 1, user_id: 1, session_id: 1, date: '2026-05-18', status: 'in_progress' as const, started_at: new Date().toISOString(), ended_at: null, notes: null, sets: [], ...overrides }
}

function makeDietPlan(calories: number, overrides = {}) {
  return {
    id: 1, user_id: 1, name: 'Prep Plan', calories_target: calories, protein_g: 180, carbs_g: 200, fat_g: 60,
    meal_count: 3,
    meals: [
      { name: 'Breakfast', time: '07:00', calories: Math.round(calories * 0.25), protein_g: 45, carbs_g: 50, fat_g: 15, foods: ['Oats (80g)', 'Eggs x2'] },
      { name: 'Lunch',     time: '12:00', calories: Math.round(calories * 0.35), protein_g: 63, carbs_g: 70, fat_g: 21, foods: ['Chicken (150g)', 'Rice (200g)'] },
      { name: 'Dinner',    time: '18:00', calories: Math.round(calories * 0.40), protein_g: 72, carbs_g: 80, fat_g: 24, foods: ['Salmon (200g)', 'Sweet Potato (200g)'] },
    ],
    phase: 'deficit' as const, created_at: new Date().toISOString(),
    ...overrides
  }
}

function makeCheckin(weekNumber: number, overrides = {}) {
  return {
    id: weekNumber, user_id: 1, week_number: weekNumber, check_in_date: '2026-05-18',
    weight_kg: 84, training_adherence: 90, diet_adherence: 85,
    energy_level: 4, sleep_quality: 4, stress_level: 2,
    adjustments: { calories_delta: 0, cardio_change: 'no change', training_volume_change: 'no change', notes: ['On track.'] },
    schedule_type: 'day' as const, interval_days: 7,
    ...overrides,
  }
}

// ── Reset store state between tests ─────────────────────────────────────────

beforeEach(() => {
  usePlanStore.setState({
    trainingPlan: null, dietPlan: null, checkinHistory: [], latestCheckin: null,
    progressEntries: [], loading: false, error: null, activeWorkout: null,
    workoutHistory: [], mealCompletions: [], lastRefreshMessage: null,
  })
  useUserStore.setState({ user: null, shows: [], loading: false, error: null })
  vi.restoreAllMocks()
})

// ══════════════════════════════════════════════════════════════════════════════
// JOURNEY 1: Check-in → diet plan updates in store
// ══════════════════════════════════════════════════════════════════════════════

describe('Journey: Check-in cascades to diet plan update', () => {
  it('diet plan in store reflects calorie adjustment after check-in', async () => {
    const originalDiet = makeDietPlan(2000)
    const updatedDiet  = makeDietPlan(1850)  // −150 kcal applied by backend
    const checkin = makeCheckin(2, {
      adjustments: { calories_delta: -150, cardio_change: 'no change', training_volume_change: 'no change', notes: ['Adjusted.'] }
    })

    // Start with the original diet already in store (as if user loaded it before)
    usePlanStore.setState({ dietPlan: originalDiet })

    vi.stubGlobal('window', {
      api: {
        submitCheckin: vi.fn().mockResolvedValue(checkin),
        getDietPlan:   vi.fn().mockResolvedValue(updatedDiet),
      }
    })

    await usePlanStore.getState().submitCheckin({ user_id: 1, weight_kg: 83, training_adherence: 90, diet_adherence: 85, energy_level: 4, sleep_quality: 4, stress_level: 2, check_in_date: '2026-05-18' } as any)

    // The store should now hold the UPDATED diet, not the original
    const { dietPlan } = usePlanStore.getState()
    expect(dietPlan?.calories_target).toBe(1850)
    expect(dietPlan?.calories_target).not.toBe(2000)
  })

  it('check-in is added to history even if diet reload fails', async () => {
    const checkin = makeCheckin(2)
    usePlanStore.setState({ dietPlan: makeDietPlan(2000) })

    vi.stubGlobal('window', {
      api: {
        submitCheckin: vi.fn().mockResolvedValue(checkin),
        getDietPlan:   vi.fn().mockRejectedValue(new Error('Network error')),
      }
    })

    await usePlanStore.getState().submitCheckin({ user_id: 1, weight_kg: 84 } as any)

    // Check-in must still be in history despite diet reload failure
    const { checkinHistory, latestCheckin } = usePlanStore.getState()
    expect(checkinHistory).toHaveLength(1)
    expect(checkinHistory[0].week_number).toBe(2)
    expect(latestCheckin?.week_number).toBe(2)
  })

  it('meal scaling in updated diet plan adds up correctly', () => {
    // After a −150 kcal adjustment from 2000, verify meals sum to 1850
    const updated = makeDietPlan(1850)
    const mealTotal = updated.meals.reduce((sum: number, m: any) => sum + m.calories, 0)
    // Allow ±3 kcal rounding tolerance
    expect(Math.abs(mealTotal - 1850)).toBeLessThanOrEqual(3)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// JOURNEY 2: Workout session — sets persist in store
// ══════════════════════════════════════════════════════════════════════════════

describe('Journey: Workout session — logged sets appear in store', () => {
  it('activeWorkout.sets contains each set after logSet', async () => {
    const workoutLog = makeWorkoutLog()
    const set1 = makeSet({ id: 1, set_number: 1, reps_actual: 5 })
    const set2 = makeSet({ id: 2, set_number: 2, reps_actual: 4 })

    usePlanStore.setState({ activeWorkout: workoutLog })

    vi.stubGlobal('window', {
      api: {
        logSet: vi.fn()
          .mockResolvedValueOnce(set1)
          .mockResolvedValueOnce(set2),
      }
    })

    const store = usePlanStore.getState()
    await store.logSet(1, { exercise_name: 'Squat', set_number: 1, reps_actual: 5 } as any)
    await store.logSet(1, { exercise_name: 'Squat', set_number: 2, reps_actual: 4 } as any)

    const { activeWorkout } = usePlanStore.getState()
    expect(activeWorkout?.sets).toHaveLength(2)
    expect(activeWorkout?.sets[0].id).toBe(1)
    expect(activeWorkout?.sets[1].id).toBe(2)
  })

  it('editing a set (same id) replaces it in store, not duplicates it', async () => {
    const originalSet = makeSet({ id: 1, reps_actual: 5 })
    const editedSet   = makeSet({ id: 1, reps_actual: 6 })  // same id, corrected reps

    usePlanStore.setState({ activeWorkout: makeWorkoutLog({ sets: [originalSet] }) })

    vi.stubGlobal('window', {
      api: { logSet: vi.fn().mockResolvedValue(editedSet) }
    })

    await usePlanStore.getState().logSet(1, { exercise_name: 'Squat', set_number: 1, reps_actual: 6 } as any)

    const { activeWorkout } = usePlanStore.getState()
    // Must be exactly 1 set (replaced), not 2 (duplicated)
    expect(activeWorkout?.sets).toHaveLength(1)
    expect(activeWorkout?.sets[0].reps_actual).toBe(6)
  })

  it('activeWorkout is null after completeWorkout', async () => {
    usePlanStore.setState({ activeWorkout: makeWorkoutLog() })

    vi.stubGlobal('window', {
      api: { completeWorkout: vi.fn().mockResolvedValue({}) }
    })

    await usePlanStore.getState().completeWorkout(1)
    expect(usePlanStore.getState().activeWorkout).toBeNull()
  })

  it('sets logged before completeWorkout are not visible after (activeWorkout is null)', async () => {
    const set1 = makeSet({ id: 1 })
    usePlanStore.setState({ activeWorkout: makeWorkoutLog() })

    vi.stubGlobal('window', {
      api: {
        logSet:          vi.fn().mockResolvedValue(set1),
        completeWorkout: vi.fn().mockResolvedValue({}),
      }
    })

    await usePlanStore.getState().logSet(1, {} as any)
    await usePlanStore.getState().completeWorkout(1)

    // activeWorkout is null — no stale set data leaking into future sessions
    expect(usePlanStore.getState().activeWorkout).toBeNull()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// JOURNEY 3: Meal completion — store uses real DB id
// ══════════════════════════════════════════════════════════════════════════════

describe('Journey: Meal completion — real id, no duplicates', () => {
  it('store entry uses the real DB id from the returned record', async () => {
    const dbRecord = makeMealCompletion({ id: 42 })

    vi.stubGlobal('window', {
      api: { logMealCompletion: vi.fn().mockResolvedValue(dbRecord) }
    })

    await usePlanStore.getState().logMealCompletion(1, '2026-05-18', 0, 'Breakfast')

    const { mealCompletions } = usePlanStore.getState()
    expect(mealCompletions).toHaveLength(1)
    expect(mealCompletions[0].id).toBe(42)   // real id, not Date.now()
  })

  it('logging the same meal twice replaces rather than duplicates', async () => {
    const first  = makeMealCompletion({ id: 1 })
    const second = makeMealCompletion({ id: 2 })  // INSERT OR REPLACE produces new id

    vi.stubGlobal('window', {
      api: { logMealCompletion: vi.fn()
        .mockResolvedValueOnce(first)
        .mockResolvedValueOnce(second)
      }
    })

    await usePlanStore.getState().logMealCompletion(1, '2026-05-18', 0, 'Breakfast')
    await usePlanStore.getState().logMealCompletion(1, '2026-05-18', 0, 'Breakfast')

    const { mealCompletions } = usePlanStore.getState()
    // Only one entry for this meal on this date — the second replaces the first
    const forThisMeal = mealCompletions.filter(c => c.date === '2026-05-18' && c.meal_index === 0)
    expect(forThisMeal).toHaveLength(1)
    expect(forThisMeal[0].id).toBe(2)  // latest record wins
  })

  it('unlogging removes entry from store', async () => {
    const record = makeMealCompletion({ id: 5 })
    usePlanStore.setState({ mealCompletions: [record] })

    vi.stubGlobal('window', {
      api: { unlogMealCompletion: vi.fn().mockResolvedValue({ success: true }) }
    })

    await usePlanStore.getState().unlogMealCompletion(1, '2026-05-18', 0)
    expect(usePlanStore.getState().mealCompletions).toHaveLength(0)
  })

  it('logging meal A does not affect meal B in the same store', async () => {
    const mealA = makeMealCompletion({ id: 10, meal_index: 0, meal_name: 'Breakfast' })
    const mealB = makeMealCompletion({ id: 11, meal_index: 1, meal_name: 'Lunch' })
    usePlanStore.setState({ mealCompletions: [mealA] })

    vi.stubGlobal('window', {
      api: { logMealCompletion: vi.fn().mockResolvedValue(mealB) }
    })

    await usePlanStore.getState().logMealCompletion(1, '2026-05-18', 1, 'Lunch')

    const { mealCompletions } = usePlanStore.getState()
    expect(mealCompletions).toHaveLength(2)
    expect(mealCompletions.find(c => c.meal_index === 0)?.id).toBe(10)  // meal A untouched
    expect(mealCompletions.find(c => c.meal_index === 1)?.id).toBe(11)  // meal B added
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// JOURNEY 4: Diet plan macro recalculation
// ══════════════════════════════════════════════════════════════════════════════

describe('Journey: Diet plan — macro recalculation updates store', () => {
  it('recalculateMacros replaces dietPlan in store', async () => {
    const original  = makeDietPlan(2000)
    const recalculated = makeDietPlan(1900)
    usePlanStore.setState({ dietPlan: original })

    vi.stubGlobal('window', {
      api: { recalculateMacros: vi.fn().mockResolvedValue(recalculated) }
    })

    await usePlanStore.getState().recalculateMacros(1)
    expect(usePlanStore.getState().dietPlan?.calories_target).toBe(1900)
  })

  it('recalculateMacros sets error state on failure, keeps old plan', async () => {
    const original = makeDietPlan(2000)
    usePlanStore.setState({ dietPlan: original })

    vi.stubGlobal('window', {
      api: { recalculateMacros: vi.fn().mockRejectedValue(new Error('AI unavailable')) }
    })

    await usePlanStore.getState().recalculateMacros(1)

    const { dietPlan, error } = usePlanStore.getState()
    // Old plan preserved (not wiped) when recalc fails
    expect(dietPlan?.calories_target).toBe(2000)
    expect(error).toContain('AI unavailable')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// JOURNEY 5: Cross-feature — check-in history then open form
// ══════════════════════════════════════════════════════════════════════════════

describe('Journey: Check-in history consistency', () => {
  it('submitting a new check-in prepends to history in the correct order', async () => {
    const week1 = makeCheckin(1, { check_in_date: '2026-05-11' })
    const week2 = makeCheckin(2, { check_in_date: '2026-05-18' })

    // Seed with existing week 1
    usePlanStore.setState({ checkinHistory: [week1], latestCheckin: week1 })

    vi.stubGlobal('window', {
      api: {
        submitCheckin: vi.fn().mockResolvedValue(week2),
        getDietPlan:   vi.fn().mockResolvedValue(makeDietPlan(2000)),
      }
    })

    await usePlanStore.getState().submitCheckin({ user_id: 1, weight_kg: 84 } as any)

    const { checkinHistory, latestCheckin } = usePlanStore.getState()
    // Most recent check-in should be first in history array
    expect(checkinHistory[0].week_number).toBe(2)
    expect(checkinHistory[1].week_number).toBe(1)
    expect(latestCheckin?.week_number).toBe(2)
  })

  it('loadCheckinHistory keeps history and latestCheckin consistent', async () => {
    const week1 = makeCheckin(1, { check_in_date: '2026-05-11' })
    const week2 = makeCheckin(2, { check_in_date: '2026-05-18' })
    const history = [week2, week1]   // most-recent first (as API returns)

    vi.stubGlobal('window', {
      api: {
        getCheckinHistory: vi.fn().mockResolvedValue(history),
        getLatestCheckin:  vi.fn().mockResolvedValue(week2),
      }
    })

    await usePlanStore.getState().loadCheckinHistory(1)

    const { checkinHistory, latestCheckin } = usePlanStore.getState()
    expect(checkinHistory[0].week_number).toBe(latestCheckin?.week_number)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// JOURNEY 6: User resets data — all state is cleared
// ══════════════════════════════════════════════════════════════════════════════

describe('Journey: Reset all data', () => {
  it('clears user and shows from userStore on reset', async () => {
    useUserStore.setState({ user: { id: 1 } as any, shows: [{ id: 1 } as any] })

    vi.stubGlobal('window', {
      api: { resetAllData: vi.fn().mockResolvedValue({}) }
    })

    await useUserStore.getState().resetAllData()

    const { user, shows } = useUserStore.getState()
    expect(user).toBeNull()
    expect(shows).toHaveLength(0)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// JOURNEY 7: Adversarial — rapid concurrent actions
// ══════════════════════════════════════════════════════════════════════════════

describe('Adversarial: Rapid concurrent actions', () => {
  it('logging two different sets concurrently both end up in store', async () => {
    const set1 = makeSet({ id: 1, set_number: 1 })
    const set2 = makeSet({ id: 2, set_number: 2 })
    usePlanStore.setState({ activeWorkout: makeWorkoutLog() })

    vi.stubGlobal('window', {
      api: {
        logSet: vi.fn()
          .mockResolvedValueOnce(set1)
          .mockResolvedValueOnce(set2),
      }
    })

    // Fire both concurrently (simulates rapid tapping)
    const store = usePlanStore.getState()
    await Promise.all([
      store.logSet(1, { set_number: 1 } as any),
      store.logSet(1, { set_number: 2 } as any),
    ])

    // Both sets should be in the store
    const { activeWorkout } = usePlanStore.getState()
    expect(activeWorkout?.sets).toHaveLength(2)
  })

  it('logging the same meal twice concurrently leaves exactly one entry', async () => {
    const record1 = makeMealCompletion({ id: 100 })
    const record2 = makeMealCompletion({ id: 101 })

    vi.stubGlobal('window', {
      api: {
        logMealCompletion: vi.fn()
          .mockResolvedValueOnce(record1)
          .mockResolvedValueOnce(record2),
      }
    })

    await Promise.all([
      usePlanStore.getState().logMealCompletion(1, '2026-05-18', 0, 'Breakfast'),
      usePlanStore.getState().logMealCompletion(1, '2026-05-18', 0, 'Breakfast'),
    ])

    // Only one entry should remain (the last write wins)
    const forMeal = usePlanStore.getState().mealCompletions.filter(
      c => c.date === '2026-05-18' && c.meal_index === 0
    )
    expect(forMeal).toHaveLength(1)
  })
})
