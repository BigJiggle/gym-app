import { describe, it } from 'vitest'
import { generateNutritionPlan } from '../../electron/services/nutritionEngine'

describe('spot check', () => {
  it('80kg male omnivore 6 meals cut', () => {
    const plan = generateNutritionPlan({
      weight_kg: 80, height_cm: 175, age: 30, sex: 'male',
      activity_level: 'moderate', goal: 'cut',
      dietary_preference: 'omnivore', meal_count: 6, include_snacks: false
    })
    console.log('=== 80kg Male, Omnivore, 6 meals, No Snacks, Cut ===')
    console.log(`Calories: ${plan.calories_target}, Protein: ${plan.protein_g}g, Carbs: ${plan.carbs_g}g, Fat: ${plan.fat_g}g`)
    for (const meal of plan.meals) {
      console.log(`  ${meal.name} | Cal: ${meal.calories} | Pro: ${meal.protein_g}g | Carb: ${meal.carbs_g}g | Fat: ${meal.fat_g}g`)
      for (const food of meal.foods) console.log(`    - ${food}`)
    }
  })

  it('70kg female vegan 4 meals maintain with snack', () => {
    const plan = generateNutritionPlan({
      weight_kg: 70, height_cm: 165, age: 28, sex: 'female',
      activity_level: 'light', goal: 'maintain',
      dietary_preference: 'vegan', meal_count: 4, include_snacks: true
    })
    console.log('=== 70kg Female, Vegan, 4 meals (with snack), Maintain ===')
    console.log(`Calories: ${plan.calories_target}, Protein: ${plan.protein_g}g, Carbs: ${plan.carbs_g}g, Fat: ${plan.fat_g}g`)
    for (const meal of plan.meals) {
      console.log(`  ${meal.name} | Cal: ${meal.calories} | Pro: ${meal.protein_g}g | Carb: ${meal.carbs_g}g | Fat: ${meal.fat_g}g`)
      for (const food of meal.foods) console.log(`    - ${food}`)
    }
  })
})
