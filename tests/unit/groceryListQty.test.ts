import { describe, it, expect } from 'vitest'
import { buildGroceryItems } from '../../src/pages/Diet/GroceryList'
import type { Meal } from '../../src/types'

// Minimal meal factory — only `name` and `foods` matter for grocery aggregation.
function meal(name: string, foods: string[]): Meal {
  return { name, time: '12:00', calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, foods }
}

describe('buildGroceryItems — weekly quantity', () => {
  it('sums DIFFERING fixed counts of the same food across meals (was: reused first-seen count)', () => {
    // Pre-Workout carries "Rice Cakes x3", the Afternoon Snack "Rice Cakes x2":
    // a normal 4-meal + 2-snack omnivore plan. Weekly total = (3 + 2) * 7 = 35,
    // NOT 3 * (2 meals) * 7 = 42 (the old first-seen-count bug).
    const meals = [
      meal('Pre-Workout', ['Rice Cakes x3']),
      meal('Afternoon Snack', ['Rice Cakes x2']),
    ]
    const items = buildGroceryItems(meals)
    const riceCakes = items.find((i) => i.baseName === 'Rice Cakes')
    expect(riceCakes).toBeDefined()
    expect(riceCakes!.weeklyQty).toBe('Rice Cakes x35/wk')
  })

  it('handles equal fixed counts across meals correctly', () => {
    const meals = [
      meal('Afternoon Snack', ['Rice Cakes x2']),
      meal('Evening Snack', ['Rice Cakes x2']),
    ]
    const items = buildGroceryItems(meals)
    expect(items.find((i) => i.baseName === 'Rice Cakes')!.weeklyQty).toBe('Rice Cakes x28/wk')
  })

  it('a single fixed-count occurrence multiplies by 7 days', () => {
    const items = buildGroceryItems([meal('Breakfast', ['Whole Eggs x3'])])
    expect(items.find((i) => i.baseName === 'Whole Eggs')!.weeklyQty).toBe('Whole Eggs x21/wk')
  })

  it('plain foods (no notation) count once per meal they appear in', () => {
    const items = buildGroceryItems([
      meal('Breakfast', ['Banana']),
      meal('Lunch', ['Banana']),
      meal('Dinner', ['Banana']),
    ])
    expect(items.find((i) => i.baseName === 'Banana')!.weeklyQty).toBe('Banana ×21/wk')
  })

  it('gram-based foods still sum grams × 7', () => {
    const items = buildGroceryItems([
      meal('Lunch', ['Chicken Breast (200g)']),
      meal('Dinner', ['Chicken Breast (150g)']),
    ])
    expect(items.find((i) => i.baseName === 'Chicken Breast')!.weeklyQty).toBe('Chicken Breast (2450g/wk)')
  })

  it('ml / non-gram-non-count notation is preserved and multiplied by occurrences', () => {
    const items = buildGroceryItems([meal('Mid-Morning', ['Soy Milk (200ml)'])])
    expect(items.find((i) => i.baseName === 'Soy Milk')!.weeklyQty).toBe('Soy Milk (200ml) ×7/wk')
  })
})
