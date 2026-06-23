import { describe, it, expect } from 'vitest'
import { generateNutritionPlan, getPhaseAwareDeficit } from '../../electron/services/nutritionEngine'

const base = {
  weight_kg: 80, height_cm: 178, age: 28, sex: 'male',
  activity_level: 'moderate', goal: 'cut', dietary_preference: 'omnivore',
  meal_count: 5,
}

describe('audit logic', () => {
  it('per-meal calories sum to ~ daily target (±80)', () => {
    for (const mc of [3,4,5,6]) {
      for (const sc of [0,1,2,3]) {
        const plan = generateNutritionPlan({ ...base, meal_count: mc, snack_count: sc, weeks_out: 8 })
        const sum = plan.meals.reduce((a,m)=>a+m.calories,0)
        expect(Math.abs(sum - plan.calories_target), `mc=${mc} sc=${sc} sum=${sum} target=${plan.calories_target}`).toBeLessThanOrEqual(80)
      }
    }
  })

  it('meal times are in ascending order', () => {
    const plan = generateNutritionPlan({ ...base, meal_count: 6, snack_count: 2, weeks_out: 8 })
    const times = plan.meals.map(m=>m.time)
    const sorted = [...times].sort()
    expect(times).toEqual(sorted)
  })

  it('vegetarian lunch contains no meat', () => {
    for (const culture of ['any','indian','mexican','mediterranean','asian','west_african','japanese','korean','middle_eastern']) {
      const plan = generateNutritionPlan({ ...base, dietary_preference: 'vegetarian', culture_pref: culture, meal_count: 4, snack_count: 0, weeks_out: 8 })
      const lunch = plan.meals.find(m => m.name === 'Lunch')!
      expect(lunch, `no Lunch meal for culture=${culture}`).toBeDefined()
      const foods = lunch.foods.join(' ').toLowerCase()
      expect(foods, `culture=${culture}`).not.toMatch(/chicken|beef|fish|salmon|turkey|pork|tuna/)
    }
  })

  it('no undefined/NaN in foods or macros', () => {
    for (const pref of ['omnivore','vegan','vegetarian']) {
      for (const culture of ['any','indian','mexican','mediterranean','asian','west_african','japanese','korean','middle_eastern']) {
        const plan = generateNutritionPlan({ ...base, dietary_preference: pref, culture_pref: culture, meal_count: 6, snack_count: 1, weeks_out: 6 })
        for (const m of plan.meals) {
          expect(Number.isFinite(m.calories)).toBe(true)
          expect(Number.isFinite(m.protein_g)).toBe(true)
          for (const f of m.foods) {
            expect(f, `pref=${pref} culture=${culture}`).not.toContain('undefined')
            expect(f).not.toContain('NaN')
          }
        }
      }
    }
  })

  it('protein ~2.3 g/kg, fat ~0.9 g/kg', () => {
    const plan = generateNutritionPlan({ ...base, weeks_out: 8 })
    expect(plan.protein_g / 80).toBeCloseTo(2.3, 1)
    expect(plan.fat_g / 80).toBeCloseTo(0.9, 1)
    expect(plan.protein_g / 80).toBeGreaterThanOrEqual(1.8)
    expect(plan.fat_g / 80).toBeGreaterThanOrEqual(0.5)
  })

  it('peak week eases off (deficit milder than mid-prep)', () => {
    const peak = getPhaseAwareDeficit(1, 'cut')      // 0-1 wk
    const mid = getPhaseAwareDeficit(4, 'cut')        // mid prep
    expect(Math.abs(peak)).toBeLessThan(Math.abs(mid))
  })

  it('off-season cut (undefined weeks_out) still applies a deficit', () => {
    expect(getPhaseAwareDeficit(undefined, 'cut')).toBeLessThan(0)
    expect(getPhaseAwareDeficit(undefined, 'recomp')).toBeLessThan(0)
  })

  it('bulk + show overrides to cut deficit', () => {
    expect(getPhaseAwareDeficit(8, 'bulk')).toBeLessThan(0)
    expect(getPhaseAwareDeficit(undefined, 'bulk')).toBeGreaterThan(0) // off-season surplus
  })

  it('weight_kg=0 is guarded (no NaN, protein>0)', () => {
    const plan = generateNutritionPlan({ ...base, weight_kg: 0, weeks_out: 8 })
    expect(plan.protein_g).toBeGreaterThan(0)
    expect(Number.isFinite(plan.calories_target)).toBe(true)
  })

  it('meal_count < 3 clamps to >=3', () => {
    const plan = generateNutritionPlan({ ...base, meal_count: 1, weeks_out: 8 })
    expect(plan.meals.length).toBeGreaterThanOrEqual(3)
  })

  it('maintain off-season is true maintenance, but maintain+show applies a mild deficit that eases at peak', () => {
    expect(getPhaseAwareDeficit(undefined, 'maintain')).toBe(0)      // off-season
    expect(getPhaseAwareDeficit(4, 'maintain')).toBeLessThan(0)       // show approaching
    expect(Math.abs(getPhaseAwareDeficit(1, 'maintain'))).toBeLessThan(Math.abs(getPhaseAwareDeficit(4, 'maintain')))
  })
})
