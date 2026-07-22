import { describe, it, expect } from 'vitest'
import { getSwapAlternatives } from '../../src/pages/Diet/swapAlternatives'
import type { Meal } from '../../src/types'

function mealOf(name: string, calories = 600): Meal {
  return { name, time: '08:00', calories, protein_g: 40, carbs_g: 60, fat_g: 15, foods: [] }
}

const flatLower = (alts: string[][]) => alts.flat().map((s) => s.toLowerCase())

describe('getSwapAlternatives — restriction/allergen filtering', () => {
  // Regression guard: without restrictions the omnivore breakfast set is unchanged.
  it('returns all candidates when there are no exclusions or restrictions', () => {
    const alts = getSwapAlternatives(mealOf('Breakfast'), 'omnivore', [], [])
    expect(alts.length).toBe(3)
  })

  // BUG (pre-fix): a "Dairy-free" user is stored in dietary_restrictions, which the
  // swap sheet ignored — so Greek Yogurt / Whey were still offered and persistable.
  it('never offers dairy foods to a Dairy-free user', () => {
    const alts = getSwapAlternatives(mealOf('Breakfast'), 'omnivore', [], ['Dairy-free'])
    const foods = flatLower(alts)
    expect(foods.some((f) => f.includes('yogurt'))).toBe(false)
    expect(foods.some((f) => f.includes('whey'))).toBe(false)
    expect(foods.some((f) => f.includes('cottage cheese'))).toBe(false)
    // The dairy-free egg-whites breakfast option must still be available.
    expect(alts.length).toBeGreaterThan(0)
    expect(alts.some((alt) => alt.some((f) => f.toLowerCase().includes('egg')))).toBe(true)
  })

  // BUG (pre-fix): a "Nut allergy" user was offered almonds/walnuts/almond butter.
  it('never offers tree nuts to a Nut-allergy user', () => {
    const alts = getSwapAlternatives(mealOf('Dinner'), 'vegan', [], ['Nut allergy'])
    const foods = flatLower(alts)
    expect(foods.some((f) => f.includes('almond'))).toBe(false)
    expect(foods.some((f) => f.includes('walnut'))).toBe(false)
    // Only the nut-free vegan main (tofu / quinoa / avocado) should remain.
    expect(alts.length).toBe(1)
    expect(alts[0].some((f) => f.toLowerCase().includes('tofu'))).toBe(true)
  })

  // Every hardcoded omnivore/veg main carries almonds, so a nut-allergy user gets an
  // empty (but SAFE) list rather than an allergen-laden one; the UI shows guidance.
  it('returns an empty list rather than offer an allergen when no candidate is safe', () => {
    const alts = getSwapAlternatives(mealOf('Dinner'), 'omnivore', [], ['Nut allergy'])
    expect(alts.length).toBe(0)
  })

  // Gluten-free must drop the oats-bearing breakfast options.
  it('never offers oats to a Gluten-free user', () => {
    const alts = getSwapAlternatives(mealOf('Breakfast'), 'omnivore', [], ['Gluten-free'])
    expect(flatLower(alts).some((f) => f.includes('oats'))).toBe(false)
  })

  // Existing food_exclusions (specific food IDs, substring-matched) still work.
  it('still respects specific food_exclusions', () => {
    const alts = getSwapAlternatives(mealOf('Dinner'), 'omnivore', ['salmon'], [])
    expect(flatLower(alts).some((f) => f.includes('salmon'))).toBe(false)
  })

  // Restriction labels are matched case-insensitively.
  it('matches restriction labels case-insensitively', () => {
    const alts = getSwapAlternatives(mealOf('Breakfast'), 'omnivore', [], ['dairy-free'])
    expect(flatLower(alts).some((f) => f.includes('yogurt'))).toBe(false)
  })
})
