import type { MealCompletion } from '../types'
import { localDateStr } from './dates'
import { countLoggedMeals } from './mealCompletions'

// Consecutive days (counting back from YESTERDAY) where every planned meal was
// logged AND any scheduled training session that day was completed. `from`
// defaults to now and is injectable for deterministic tests.
//
// The per-day meal check counts ONLY completions whose positional meal_index
// still maps to a meal in the CURRENT plan (via countLoggedMeals). A mid-week
// meal-count REDUCTION (Settings / Regenerate / AI refine) leaves PAST-day
// completions at the now-removed indices in the DB — clearOrphanedMealCompletions
// purges only `date >= today` — so a raw `completions.filter(date).length` would
// still count those orphans and miscredit a past day as fully logged (e.g. a day
// that logged only 2 of the current 4 meals, plus 2 orphaned index-4/5 rows,
// reads as 4/4 and extends the streak). That is the same orphan-count desync the
// Diet "This Week" streak and the Weekly Prep Scorecard already fixed with
// countLoggedMeals; the dashboard streak was the last surface still counting raw.
export function computeAdherenceStreak(
  mealCompletions: Pick<MealCompletion, 'date' | 'meal_index'>[],
  totalMeals: number,
  sessions: { day_of_week: number }[],
  workoutHistory: { status: string; date: string }[],
  from: Date = new Date(),
): number {
  if (totalMeals <= 0) return 0
  let streak = 0
  for (let offset = 1; offset <= 60; offset++) {
    const d = new Date(from)
    d.setDate(from.getDate() - offset)
    const dateStr = localDateStr(d)
    const loggedCount = countLoggedMeals(mealCompletions, dateStr, totalMeals)
    if (loggedCount < totalMeals) break
    const dow = d.getDay() === 0 ? 7 : d.getDay()
    const hadSession = sessions.some((s) => s.day_of_week === dow)
    if (hadSession && !workoutHistory.some((l) => l.status === 'completed' && l.date === dateStr)) break
    streak++
  }
  return streak
}
