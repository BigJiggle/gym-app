import type { Meal } from '../types'

/**
 * Refeed protocol: on the chosen weekly refeed day, add extra carbohydrate (and
 * the calories those carbs carry — 4 kcal/g) on top of the normal plan while
 * keeping protein and fat unchanged. This restores glycogen and briefly lifts
 * leptin during a prep deficit.
 *
 * Returns a NEW meal array with the carb boost distributed across the day's main
 * (non-snack) meals so each meal card reflects the higher carbs/calories. Snacks
 * are left simple. The input plan is never mutated — callers use this for display
 * on the refeed day only, so every other day and all index-based persistence
 * (swap/reorder/mark-eaten) keep using the baseline plan.
 *
 * The added carbs always sum to exactly `carbBoostG` (the remainder from an
 * uneven split lands on the earliest meals), so the day's total matches the
 * boosted target.
 */
export function applyRefeedToMeals(meals: Meal[], carbBoostG: number): Meal[] {
  if (!Array.isArray(meals) || meals.length === 0) return []
  const boost = Number.isFinite(carbBoostG) ? Math.max(0, Math.round(carbBoostG)) : 0
  if (boost === 0) return meals.map((m) => ({ ...m }))

  const isSnack = (m: Meal) => m.name.toLowerCase().includes('snack')
  // Prefer main meals; if the plan is all snacks, spread across everything.
  const mainIdx = meals.map((_, i) => i).filter((i) => !isSnack(meals[i]))
  const idx = mainIdx.length > 0 ? mainIdx : meals.map((_, i) => i)

  const base = Math.floor(boost / idx.length)
  let remainder = boost - base * idx.length
  const addFor = new Map<number, number>()
  for (const i of idx) {
    const extra = base + (remainder > 0 ? 1 : 0)
    if (remainder > 0) remainder--
    addFor.set(i, extra)
  }

  return meals.map((m, i) => {
    const addCarbs = addFor.get(i) ?? 0
    if (addCarbs === 0) return { ...m }
    return {
      ...m,
      carbs_g: m.carbs_g + addCarbs,
      calories: m.calories + addCarbs * 4,
    }
  })
}
