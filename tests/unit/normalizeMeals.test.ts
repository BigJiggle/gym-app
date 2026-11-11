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

// Read-seam behavior: plan:getDiet reads the diet_plans.meals TEXT cell and used to
// hand its RAW `JSON.parse` straight to the renderer with no normalization (unlike the
// training seam plan:getTraining, which routes through normalizeExercises). A corrupt /
// hand-edited cell then either threw in the handler (non-JSON text) or slipped a
// null/non-object meal — or one with a non-string `time` — into the Diet page's
// `m.time.split(':')` and NextMealWidget's `meal.foods.map`, white-screening with no
// error boundary. For normalizeMeals to serve that seam it must accept the stored JSON
// STRING, not just an already-parsed array — mirroring normalizeExercises.
describe('normalizeMeals — stored-cell (JSON string) read seam', () => {
  it('parses a valid JSON-string array of meals (the stored diet_plans.meals cell)', () => {
    const stored = JSON.stringify([
      { name: 'Breakfast', time: '07:00', calories: 500, protein_g: 40, carbs_g: 50, fat_g: 15, foods: ['Oats (80g dry)'] },
      { name: 'Lunch', time: '13:00', calories: 600, protein_g: 45, carbs_g: 60, fat_g: 18, foods: ['Chicken (200g)'] },
    ])
    const out = normalizeMeals(stored)
    expect(out).toHaveLength(2)
    expect(out[0].name).toBe('Breakfast')
    expect(out[0].foods).toEqual(['Oats (80g dry)'])
    expect(out[1].time).toBe('13:00')
  })

  it('returns [] (no throw) for a corrupt / non-JSON stored cell', () => {
    expect(normalizeMeals('{not valid json')).toEqual([])
    expect(normalizeMeals('')).toEqual([])
  })

  it('guarantees every meal has a split-safe string time and an array foods from a corrupt JSON-string cell', () => {
    // A hand-edited cell holding a null entry and a meal with a non-string `time`
    // and missing `foods` — the exact shapes that crash m.time.split(':') / meal.foods.map.
    const stored = JSON.stringify([
      null,
      { name: 'Meal 2', time: 70000, calories: 400, protein_g: 30, carbs_g: 40, fat_g: 10 },
      { name: 'Meal 3', time: '18:30', calories: 500, protein_g: 35, carbs_g: 45, fat_g: 12, foods: ['Rice'] },
    ])
    const out = normalizeMeals(stored)
    expect(out).toHaveLength(2)
    for (const m of out) {
      expect(typeof m.time).toBe('string')
      expect(m.time).toMatch(/^\d{1,2}:\d{2}$/)
      expect(Array.isArray(m.foods)).toBe(true)
      // Prove the Diet page's parse can't throw / NaN-out on these.
      const [h, min] = m.time.split(':')
      expect(Number.isFinite(Number(h) * 60 + Number(min))).toBe(true)
    }
  })
})
