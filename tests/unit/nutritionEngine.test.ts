import { describe, it, expect } from 'vitest'
import { generateNutritionPlan } from '../../electron/services/nutritionEngine'

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
})
