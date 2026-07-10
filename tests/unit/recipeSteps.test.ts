import { describe, it, expect } from 'vitest'
import { buildRecipeSteps, foodName } from '../../src/pages/Diet/recipeSteps'

describe('recipe steps generator', () => {
  it('strips portion suffixes from food names', () => {
    expect(foodName('Chicken Breast (150g)')).toBe('Chicken Breast')
    expect(foodName('White Rice (200g cooked)')).toBe('White Rice')
    expect(foodName('Almonds')).toBe('Almonds')
  })

  it('returns [] for an empty meal', () => {
    expect(buildRecipeSteps([], 'medium')).toEqual([])
  })

  it('produces protein → carb → veg → serve steps for a cooked meal', () => {
    const steps = buildRecipeSteps(['Chicken Breast (150g)', 'White Rice (200g)', 'Broccoli (120g)'], 'medium')
    expect(steps.length).toBeGreaterThanOrEqual(3)
    expect(steps.some((s) => /Chicken Breast/.test(s))).toBe(true)
    expect(steps.some((s) => /White Rice/.test(s))).toBe(true)
    expect(steps.some((s) => /Broccoli/.test(s))).toBe(true)
    expect(steps[steps.length - 1]).toMatch(/serve/i)
  })

  it('is deterministic (same input → same output)', () => {
    const foods = ['Salmon (150g)', 'Quinoa (100g)', 'Asparagus (120g)']
    expect(buildRecipeSteps(foods, 'chef')).toEqual(buildRecipeSteps(foods, 'chef'))
  })

  it('chef mode adds a marinate/season step that quick mode omits', () => {
    const foods = ['Steak (200g)', 'Potato (200g)']
    const chef = buildRecipeSteps(foods, 'chef').join(' ')
    const quick = buildRecipeSteps(foods, 'quick').join(' ')
    expect(chef).toMatch(/marinate|season/i)
    expect(quick).not.toMatch(/marinate/i)
  })

  it('treats a shake + fruit as no-cook assembly', () => {
    const steps = buildRecipeSteps(['Whey Protein Shake (30g)', 'Banana (100g)'], 'medium')
    expect(steps).toHaveLength(1)
    expect(steps[0]).toMatch(/no cooking/i)
  })
})
