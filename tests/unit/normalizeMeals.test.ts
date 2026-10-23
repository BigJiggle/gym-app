import { describe, it, expect } from 'vitest'
import { normalizeMeals } from '../../electron/services/nutritionEngine'

// The AI diet paths (plan:generateDiet / plan:refineDietWithPrompt) persist the
// model's `meals` verbatim. An untrusted LLM response can return a non-array
// `meals`, an entry missing `foods`, or non-finite numeric fields — all of which
// then crash the renderer (NextMealWidget `meal.foods.length`, the Diet page's
// `meal.foods.map`, GroceryList's `for (const food of meal.foods)`) with no error
// boundary, or throw in the handler's per-meal `.reduce`. normalizeMeals is the
// single write-seam guard that guarantees a well-formed Meal[] shape.
describe('normalizeMeals', () => {
  it('returns [] for a non-array meals value (object / string / null)', () => {
    expect(normalizeMeals(undefined)).toEqual([])
    expect(normalizeMeals(null)).toEqual([])
    expect(normalizeMeals('see above')).toEqual([])
    expect(normalizeMeals({ breakfast: {} })).toEqual([])
  })

  it('gives a meal with a missing/invalid foods field an empty foods array', () => {
    const out = normalizeMeals([
      { name: 'Breakfast', time: '07:00', calories: 500, protein_g: 40, carbs_g: 50, fat_g: 15 },
      { name: 'Lunch', time: '13:00', calories: 600, protein_g: 45, carbs_g: 60, fat_g: 18, foods: 'rice' },
    ])
    expect(out).toHaveLength(2)
    expect(Array.isArray(out[0].foods)).toBe(true)
    expect(out[0].foods).toEqual([])
    expect(Array.isArray(out[1].foods)).toBe(true)
    expect(out[1].foods).toEqual([])
  })

  it('keeps only string members of a foods array', () => {
    const out = normalizeMeals([
      { name: 'Dinner', time: '20:00', calories: 700, protein_g: 50, carbs_g: 70, fat_g: 20, foods: ['Rice (150g)', null, 42, 'Chicken (200g)'] },
    ])
    expect(out[0].foods).toEqual(['Rice (150g)', 'Chicken (200g)'])
  })

  it('coerces non-finite / missing numeric fields to 0', () => {
    const out = normalizeMeals([
      { name: 'Snack', time: '15:00', foods: ['Apple'], calories: NaN, protein_g: undefined, carbs_g: 'x', fat_g: Infinity },
    ])
    expect(out[0].calories).toBe(0)
    expect(out[0].protein_g).toBe(0)
    expect(out[0].carbs_g).toBe(0)
    expect(out[0].fat_g).toBe(0)
  })

  it('drops non-object entries but keeps well-formed meals', () => {
    const out = normalizeMeals([
      null,
      'nope',
      { name: 'Breakfast', time: '07:00', calories: 500, protein_g: 40, carbs_g: 50, fat_g: 15, foods: ['Oats (80g dry)'] },
    ])
    expect(out).toHaveLength(1)
    expect(out[0].name).toBe('Breakfast')
    expect(out[0].foods).toEqual(['Oats (80g dry)'])
  })

  it('supplies sensible defaults for a missing name/time', () => {
    const out = normalizeMeals([{ calories: 400, protein_g: 30, carbs_g: 40, fat_g: 10, foods: [] }])
    expect(out).toHaveLength(1)
    expect(typeof out[0].name).toBe('string')
    expect(out[0].name.length).toBeGreaterThan(0)
    expect(out[0].time).toMatch(/^\d{2}:\d{2}$/)
  })
})
