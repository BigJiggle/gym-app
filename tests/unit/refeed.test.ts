import { describe, it, expect } from 'vitest'
import { applyRefeedToMeals } from '../../src/utils/refeed'
import type { Meal } from '../../src/types'

function meal(name: string, over: Partial<Meal> = {}): Meal {
  return {
    name,
    time: '12:00',
    calories: 500,
    protein_g: 40,
    carbs_g: 50,
    fat_g: 15,
    foods: ['Chicken (200g)', 'Rice (150g)'],
    ...over,
  }
}

const totalCarbs = (ms: Meal[]) => ms.reduce((s, m) => s + m.carbs_g, 0)
const totalCals = (ms: Meal[]) => ms.reduce((s, m) => s + m.calories, 0)

describe('applyRefeedToMeals — refeed day meal adjustment', () => {
  it('adds exactly the carb boost across main meals, split evenly', () => {
    const base = [meal('Meal 1'), meal('Meal 2'), meal('Meal 3'), meal('Meal 4')]
    const out = applyRefeedToMeals(base, 100)
    expect(totalCarbs(out) - totalCarbs(base)).toBe(100)
    // 100g over 4 meals → +25g each
    out.forEach((m) => expect(m.carbs_g).toBe(75))
  })

  it('adds calories at 4 kcal per boosted gram, total matching the carb boost', () => {
    const base = [meal('Meal 1'), meal('Meal 2')]
    const out = applyRefeedToMeals(base, 100)
    expect(totalCals(out) - totalCals(base)).toBe(400)
  })

  it('keeps protein and fat unchanged', () => {
    const base = [meal('Meal 1', { protein_g: 45, fat_g: 12 }), meal('Meal 2', { protein_g: 30, fat_g: 20 })]
    const out = applyRefeedToMeals(base, 80)
    expect(out.map((m) => m.protein_g)).toEqual([45, 30])
    expect(out.map((m) => m.fat_g)).toEqual([12, 20])
  })

  it('distributes an uneven boost exactly, remainder to earliest meals', () => {
    const base = [meal('Meal 1'), meal('Meal 2'), meal('Meal 3')]
    const out = applyRefeedToMeals(base, 100)
    // 100 / 3 → 34, 33, 33
    expect(out.map((m) => m.carbs_g - 50)).toEqual([34, 33, 33])
    expect(totalCarbs(out) - totalCarbs(base)).toBe(100)
  })

  it('boosts only main meals, leaving snacks simple, when both exist', () => {
    const base = [meal('Meal 1'), meal('Meal 2'), meal('Snack 1'), meal('Snack 2')]
    const out = applyRefeedToMeals(base, 100)
    // 100 over the 2 main meals → +50 each; snacks untouched
    expect(out[0].carbs_g).toBe(100)
    expect(out[1].carbs_g).toBe(100)
    expect(out[2].carbs_g).toBe(50)
    expect(out[3].carbs_g).toBe(50)
    expect(totalCarbs(out) - totalCarbs(base)).toBe(100)
  })

  it('falls back to all meals when the plan is all snacks', () => {
    const base = [meal('Snack 1'), meal('Snack 2')]
    const out = applyRefeedToMeals(base, 60)
    expect(out.map((m) => m.carbs_g - 50)).toEqual([30, 30])
    expect(totalCarbs(out) - totalCarbs(base)).toBe(60)
  })

  it('does not mutate the input meals (baseline stays intact)', () => {
    const base = [meal('Meal 1'), meal('Meal 2')]
    const snapshot = base.map((m) => ({ ...m }))
    applyRefeedToMeals(base, 100)
    expect(base).toEqual(snapshot)
  })

  it('returns a copy unchanged for a zero or invalid boost', () => {
    const base = [meal('Meal 1'), meal('Meal 2')]
    expect(applyRefeedToMeals(base, 0).map((m) => m.carbs_g)).toEqual([50, 50])
    expect(applyRefeedToMeals(base, NaN).map((m) => m.carbs_g)).toEqual([50, 50])
    expect(applyRefeedToMeals(base, -50).map((m) => m.carbs_g)).toEqual([50, 50])
  })

  it('handles an empty meal list without throwing', () => {
    expect(applyRefeedToMeals([], 100)).toEqual([])
  })

  it('preserves meal order and food lists', () => {
    const base = [meal('Meal 1', { foods: ['A', 'B'] }), meal('Snack', { foods: ['C'] })]
    const out = applyRefeedToMeals(base, 100)
    expect(out.map((m) => m.name)).toEqual(['Meal 1', 'Snack'])
    expect(out[0].foods).toEqual(['A', 'B'])
    expect(out[1].foods).toEqual(['C'])
  })
})
