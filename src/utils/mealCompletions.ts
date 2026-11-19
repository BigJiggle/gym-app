import type { MealCompletion } from '../types'

// Count a day's logged meals, counting ONLY completions whose positional
// meal_index still maps to a meal in the CURRENT plan.
//
// Completions are keyed by positional meal_index. A mid-week meal-count REDUCTION
// (Settings meal-count change, Regenerate Meals, or an AI refine that drops meals)
// leaves PAST-day completions at the now-removed indices in the DB:
// clearOrphanedMealCompletions purges only `date >= today`, so a Monday logged 6/6
// under a 6-meal plan keeps its meal_index 4 & 5 rows after the plan shrinks to 4.
//
// Every per-day / weekly MACRO sum already skips those orphans — it indexes into
// the meals array (`meals[c.meal_index]`), so a removed index contributes 0. But
// the per-day COMPLETION COUNTS were a raw `completions.filter(date).length`, which
// still counts the orphans. On the same screen that made a past day read "6/4",
// paint it done/green, and push the progress bar past 100% while its macro totals
// counted only 4 meals — a value-shown-doesn't-match-what's-stored desync.
//
// Counting the SAME mapped set the macro totals use keeps every day-completion
// surface consistent with them. `mealCount` is the current plan's meal count
// (meals.length). An INCREASE (4→6) creates no orphans, so this is a no-op there.
export function countLoggedMeals(
  completions: Pick<MealCompletion, 'date' | 'meal_index'>[],
  date: string,
  mealCount: number
): number {
  return completions.filter(
    (c) => c.date === date && c.meal_index >= 0 && c.meal_index < mealCount
  ).length
}
