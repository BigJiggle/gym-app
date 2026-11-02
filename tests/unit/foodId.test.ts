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

describe('display-name labels resolve to their canonical food id', () => {
  // Many meal-plan foods render under a display name that does NOT slug to their
  // canonical food id: "Salmon Fillet"→salmon, "Whole Eggs"→eggs, "Mixed
  // Berries"→berries. Slugging the label alone produced "salmon_fillet" /
  // "whole_eggs" / "mixed_berries" — none of which the exclusion engine matches —
  // so tapping ✕ on those foods silently did nothing and they kept reappearing.
  it('maps display labels whose name differs from their id to the canonical id', () => {
    expect(foodLabelToExclusionId('Salmon Fillet (180g)')).toBe('salmon')
    expect(foodLabelToExclusionId('Whole Eggs x3')).toBe('eggs')
    expect(foodLabelToExclusionId('Mixed Berries (100g)')).toBe('berries')
  })

  it('leaves labels whose slug already equals their id unchanged', () => {
    expect(foodLabelToExclusionId('Chicken Breast (180g)')).toBe('chicken_breast')
    expect(foodLabelToExclusionId('Broccoli (200g)')).toBe('broccoli')
    expect(foodLabelToExclusionId('Rice Cakes x3')).toBe('rice_cakes')
  })

  it('falls back to the slug for foods not in the picker list', () => {
    // Culture/shake display names that are not in FOODS keep their slug (unchanged
    // behavior) rather than mis-resolving.
    expect(foodLabelToExclusionId('Jollof Rice (200g cooked)')).toBe('jollof_rice')
  })

  const omnivore = (exclude: string[]) =>
    buildMealsPublic(2500, 180, 250, 70, 6, 'omnivore', exclude)
  const planHas = (meals: ReturnType<typeof omnivore>, re: RegExp) =>
    meals.some((m) => m.foods.some((f) => re.test(f)))

  it('excluding Salmon Fillet via its ✕ label removes salmon from the regenerated plan', () => {
    expect(planHas(omnivore([]), /salmon/i)).toBe(true)
    const id = foodLabelToExclusionId('Salmon Fillet (180g)')
    expect(planHas(omnivore([id]), /salmon/i)).toBe(false)
  })

  it('excluding Whole Eggs via its ✕ label removes whole eggs from the regenerated plan', () => {
    expect(planHas(omnivore([]), /whole eggs/i)).toBe(true)
    const id = foodLabelToExclusionId('Whole Eggs x3')
    expect(planHas(omnivore([id]), /whole eggs/i)).toBe(false)
  })
})
