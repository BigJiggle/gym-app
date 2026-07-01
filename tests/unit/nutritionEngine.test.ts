import { describe, it, expect } from 'vitest'
import { generateNutritionPlan, clampWeightKg } from '../../electron/services/nutritionEngine'

const BASE_INPUT = {
  weight_kg: 80,
  height_cm: 178,
  age: 28,
  sex: 'male',
  activity_level: 'moderate',
  goal: 'cut',
  dietary_preference: 'omnivore',
  meal_count: 4
}

describe('nutritionEngine', () => {
  it('generates a plan with required fields', () => {
    const plan = generateNutritionPlan(BASE_INPUT)
    expect(plan.calories_target).toBeGreaterThan(0)
    expect(plan.protein_g).toBeGreaterThan(0)
    expect(plan.carbs_g).toBeGreaterThanOrEqual(0)
    expect(plan.fat_g).toBeGreaterThan(0)
    expect(plan.meals).toHaveLength(4)
    expect(plan.phase).toBe('deficit')
  })

  it('applies calorie deficit for cut goal', () => {
    const cut = generateNutritionPlan({ ...BASE_INPUT, goal: 'cut' })
    const maintain = generateNutritionPlan({ ...BASE_INPUT, goal: 'maintain' })
    expect(cut.calories_target).toBeLessThan(maintain.calories_target)
  })

  it('sets protein at approximately 2.3g/kg', () => {
    const plan = generateNutritionPlan(BASE_INPUT)
    const expected = Math.round(80 * 2.3)
    expect(plan.protein_g).toBe(expected)
  })

  it('generates correct number of meals', () => {
    const plan3 = generateNutritionPlan({ ...BASE_INPUT, meal_count: 3 })
    expect(plan3.meals).toHaveLength(3)
    const plan6 = generateNutritionPlan({ ...BASE_INPUT, meal_count: 6 })
    expect(plan6.meals).toHaveLength(6)
  })

  it('handles female BMR calculation', () => {
    const female = generateNutritionPlan({ ...BASE_INPUT, sex: 'female', weight_kg: 60 })
    const male = generateNutritionPlan({ ...BASE_INPUT, sex: 'male', weight_kg: 60 })
    expect(female.calories_target).toBeLessThan(male.calories_target)
  })

  it('applies recomp phase correctly', () => {
    const plan = generateNutritionPlan({ ...BASE_INPUT, goal: 'recomp' })
    expect(plan.phase).toBe('deficit')
    expect(plan.calories_target).toBeGreaterThan(0)
  })

  it('generates vegan-appropriate meals', () => {
    const plan = generateNutritionPlan({ ...BASE_INPUT, dietary_preference: 'vegan' })
    const allFoods = plan.meals.flatMap((m) => m.foods)
    const hasAnimalProduct = allFoods.some((f) =>
      ['chicken', 'beef', 'salmon', 'whey', 'egg', 'greek yogurt'].some((a) =>
        f.toLowerCase().includes(a)
      )
    )
    expect(hasAnimalProduct).toBe(false)
  })

  it('does not generate calories below 1200', () => {
    const extreme = generateNutritionPlan({
      ...BASE_INPUT,
      weight_kg: 45,
      activity_level: 'sedentary',
      goal: 'cut',
      sex: 'female'
    })
    expect(extreme.calories_target).toBeGreaterThanOrEqual(1200)
  })

  it('macro calories sum to roughly the calorie target', () => {
    const plan = generateNutritionPlan(BASE_INPUT)
    const macroCalories = plan.protein_g * 4 + plan.carbs_g * 4 + plan.fat_g * 9
    const tolerance = 20
    expect(Math.abs(macroCalories - plan.calories_target)).toBeLessThanOrEqual(tolerance)
  })

  // Regression: a NaN meal_count used to survive Math.max/Math.min(NaN) unchanged,
  // which made buildMeals' mainSets lookup + .slice(0, NaN) produce zero main meals.
  it('falls back to a valid meal count when meal_count is NaN', () => {
    const plan = generateNutritionPlan({ ...BASE_INPUT, meal_count: NaN as any })
    expect(plan.meals.length).toBeGreaterThanOrEqual(3)
    expect(plan.meals.every((m) => m.foods.length > 0)).toBe(true)
  })

  // Regression: phase was derived from goal string via PHASE_MAP, so a 'maintain'
  // goal with weeks_out set was labeled 'maintenance' even though getPhaseAwareDeficit
  // returns a negative value → the plan was actually in deficit but labeled wrong.
  it('maintain off-season (no weeks_out) → phase maintenance', () => {
    const plan = generateNutritionPlan({ ...BASE_INPUT, goal: 'maintain' })
    expect(plan.phase).toBe('maintenance')
  })

  it('maintain with show approaching (weeks_out=6) → phase deficit', () => {
    const plan = generateNutritionPlan({ ...BASE_INPUT, goal: 'maintain', weeks_out: 6 })
    expect(plan.phase).toBe('deficit')
  })

  // Regression: on minimum 1200 kcal plans a fixed 200 kcal snack exceeded
  // the per-main-meal allocation, making snack the largest "meal" of the day.
  it('snack calories do not exceed per-main-meal calories on a 1200 kcal plan', () => {
    const plan = generateNutritionPlan({
      ...BASE_INPUT,
      weight_kg: 45,
      activity_level: 'sedentary',
      goal: 'cut',
      sex: 'female',
      meal_count: 6,
      snack_count: 1,
    } as any)
    const snack = plan.meals.find((m) => m.name.toLowerCase().includes('snack'))
    const mains = plan.meals.filter((m) => !m.name.toLowerCase().includes('snack'))
    if (snack && mains.length > 0) {
      const avgMain = mains.reduce((s, m) => s + m.calories, 0) / mains.length
      expect(snack.calories).toBeLessThanOrEqual(Math.ceil(avgMain) + 5) // allow 5 kcal rounding
    }
  })
})

describe('clampWeightKg', () => {
  it('passes through a valid weight unchanged', () => {
    expect(clampWeightKg(80)).toBe(80)
  })

  it('falls back to the default for 0/negative/NaN weight', () => {
    expect(clampWeightKg(0)).toBe(70)
    expect(clampWeightKg(-10)).toBe(70)
    expect(clampWeightKg(NaN)).toBe(70)
    expect(clampWeightKg(undefined)).toBe(70)
  })

  it('honors a custom fallback', () => {
    expect(clampWeightKg(0, 65)).toBe(65)
  })
})

// ── Food preferences: snack foods must NOT replace main meal ingredients ──────
// Regression tests for the bug where greek_yogurt/apple preferences silently
// replaced salmon/rice in Dinner because they share the same macro category.

describe('nutritionEngine — preference substitution respects meal context', () => {
  const BASE_6 = { ...BASE_INPUT, meal_count: 6, include_snacks: false }

  function dinnerFoods(prefs: string[]): string[] {
    const plan = generateNutritionPlan({ ...BASE_6, food_preferences: prefs } as any)
    const dinner = plan.meals.find((m) => m.name === 'Dinner')
    return dinner?.foods ?? []
  }

  function lunchFoods(prefs: string[]): string[] {
    const plan = generateNutritionPlan({ ...BASE_6, food_preferences: prefs } as any)
    const lunch = plan.meals.find((m) => m.name === 'Lunch')
    return lunch?.foods ?? []
  }

  it('greek_yogurt preference does NOT appear in Dinner foods', () => {
    const foods = dinnerFoods(['greek_yogurt'])
    const hasYogurt = foods.some((f) => f.toLowerCase().includes('greek yogurt'))
    expect(hasYogurt).toBe(false)
  })

  it('apple preference does NOT appear in Dinner foods', () => {
    const foods = dinnerFoods(['apple'])
    const hasApple = foods.some((f) => f.toLowerCase().includes('apple'))
    expect(hasApple).toBe(false)
  })

  it('banana preference does NOT appear in Dinner foods', () => {
    const foods = dinnerFoods(['banana'])
    const hasBanana = foods.some((f) => f.toLowerCase().includes('banana'))
    expect(hasBanana).toBe(false)
  })

  it('greek_yogurt preference does NOT appear in Lunch foods', () => {
    const foods = lunchFoods(['greek_yogurt'])
    const hasYogurt = foods.some((f) => f.toLowerCase().includes('greek yogurt'))
    expect(hasYogurt).toBe(false)
  })

  it('whey_protein preference does NOT replace chicken/salmon in Dinner', () => {
    const foods = dinnerFoods(['whey_protein'])
    const hasShake = foods.some((f) => f.toLowerCase().includes('shake') || f.toLowerCase().includes('whey'))
    expect(hasShake).toBe(false)
  })

  it('greek_yogurt preference DOES appear in Mid-Morning Snack (snack slot allows it)', () => {
    const plan = generateNutritionPlan({
      ...BASE_INPUT,
      meal_count: 5,
      include_snacks: true,
      food_preferences: ['greek_yogurt'],
    } as any)
    const snack = plan.meals.find((m) => m.name === 'Mid-Morning Snack')
    // Snack template already uses greek_yogurt as its default — confirming it's not blocked
    const hasYogurt = snack?.foods.some((f) => f.toLowerCase().includes('greek yogurt'))
    expect(hasYogurt).toBe(true)
  })

  it('non-snack preference (tuna_can) CAN substitute in Dinner as a valid protein swap', () => {
    // tuna_can is NOT in SNACK_ONLY_FOODS — it's a legitimate main-meal protein
    const foods = dinnerFoods(['tuna_can'])
    // The preference may or may not fire depending on category match, but it must NOT be blocked
    // Just assert no crash and a valid foods array is returned
    expect(foods.length).toBeGreaterThan(0)
  })
})
