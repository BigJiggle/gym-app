import { describe, it, expect } from 'vitest'
import { previewGoalCalories, generateNutritionPlan } from '../../electron/services/nutritionEngine'

// plan:previewGoalCalories feeds the GoalPickerModal's "~N kcal" badge for each
// off-season goal; tapping a goal calls plan:selectOffSeasonGoal → generateNutritionPlan.
// The preview MUST agree with the plan the user actually gets, including on the app's
// corrupt / out-of-range stored-weight surface (hand-edited / legacy SQLite cell) that
// generateNutritionPlan defends with clampWeightKg. The handler used to inline the
// preview math WITHOUT clampWeightKg — so an out-of-range weight made the badge diverge
// from the generated plan. These tests pin the preview to generateNutritionPlan.

const GOALS = ['bulk', 'maintain', 'cut', 'recomp']
const base = {
  height_cm: 180, age: 30, sex: 'male', activity_level: 'moderate',
  dietary_preference: 'omnivore', meal_count: 5,
}

function planCals(weight_kg: number, goal: string): number {
  // weeks_out omitted = off-season, matching the handler + selectOffSeasonGoal(undefined).
  return generateNutritionPlan({ ...base, weight_kg, goal }).calories_target
}

describe('previewGoalCalories', () => {
  it('matches the generated plan for a normal in-range weight (no behavior change)', () => {
    const preview = previewGoalCalories(90, base.height_cm, base.age, base.sex, base.activity_level, GOALS)
    for (const g of GOALS) expect(preview[g], g).toBe(planCals(90, g))
  })

  it('clamps an out-of-range (corrupt) weight so the badge matches the generated plan', () => {
    // 850 kg (fat-fingered "85.0" / corrupt cell). Before the clamp was added the
    // preview used the raw 850 kg → a ~13k-kcal badge, while the generated plan clamps
    // to 300 kg → a far lower target: a preview↔plan desync.
    const preview = previewGoalCalories(850, base.height_cm, base.age, base.sex, base.activity_level, GOALS)
    for (const g of GOALS) expect(preview[g], g).toBe(planCals(850, g))
    // And the clamp means the 850 badge equals the 300 (ceiling) badge exactly.
    const atCeiling = previewGoalCalories(300, base.height_cm, base.age, base.sex, base.activity_level, GOALS)
    for (const g of GOALS) expect(preview[g], `${g} == ceiling`).toBe(atCeiling[g])
  })

  it('floors a too-low / missing weight to the plan fallback (30→70 fallback agreement)', () => {
    for (const w of [0, 10, NaN]) {
      const preview = previewGoalCalories(w, base.height_cm, base.age, base.sex, base.activity_level, GOALS)
      for (const g of GOALS) expect(preview[g], `w=${w} ${g}`).toBe(planCals(w, g))
    }
  })

  it('never returns below the 1200 kcal floor', () => {
    const preview = previewGoalCalories(30, 100, 80, 'female', 'sedentary', GOALS)
    for (const g of GOALS) expect(preview[g], g).toBeGreaterThanOrEqual(1200)
  })
})
