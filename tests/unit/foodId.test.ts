import { describe, it, expect } from 'vitest'
import { foodLabelToExclusionId } from '../../src/utils/foodId'
import { buildMealsPublic } from '../../electron/services/nutritionEngine'

describe('foodLabelToExclusionId', () => {
  it('strips the fixed-count "xN" token so counted foods map to their real id', () => {
    // These are the fixed-label foods that carry an "xN" count in meal plans.
    expect(foodLabelToExclusionId('Rice Cakes x3')).toBe('rice_cakes')
    expect(foodLabelToExclusionId('Rice Cakes x2')).toBe('rice_cakes')
    expect(foodLabelToExclusionId('Corn Tortilla x2')).toBe('corn_tortilla')
  })

  it('strips the portion suffix for scalable foods', () => {
    expect(foodLabelToExclusionId('White Rice (150g cooked)')).toBe('white_rice')
    expect(foodLabelToExclusionId('Chicken Breast (200g)')).toBe('chicken_breast')
  })

  it('handles a portion suffix and a count token together', () => {
    expect(foodLabelToExclusionId('Rice Cakes x3 (30g)')).toBe('rice_cakes')
  })
})

describe('exclude-by-label actually excludes the food from regenerated plans', () => {
  const hasRiceCakes = (label: string, excludeId: string): boolean => {
    const meals = buildMealsPublic(2500, 180, 250, 70, 6, 'vegan', [excludeId])
    return meals.some((m) => m.foods.some((f) => /rice cakes/i.test(f)))
  }

  it('the OLD normalization (count suffix kept) fails to exclude rice cakes', () => {
    // Reproduces the bug: "Rice Cakes x3" used to normalize to "rice_cakes_x3",
    // which matches no food ID, so rice cakes survive the exclusion.
    expect(hasRiceCakes('Rice Cakes x3', 'rice_cakes_x3')).toBe(true)
  })

  it('the FIXED normalization removes rice cakes from the regenerated plan', () => {
    const goodId = foodLabelToExclusionId('Rice Cakes x3')
    expect(goodId).toBe('rice_cakes')
    expect(hasRiceCakes('Rice Cakes x3', goodId)).toBe(false)
  })
})
