import type { WorkoutLog } from '../types'

// Weekly plan-completion summary for the Training tab's "Sessions This Week"
// widget.
//
// The widget renders one square per PLANNED session (keyed by its day_of_week)
// and lights it green iff a workout was completed on that weekday this week. The
// badge count / color / "all sessions done" message must agree with those
// squares. The old inline code derived the badge from `completedDows.size` — the
// number of DISTINCT weekdays with ANY completed workout this week — which
// diverges from the squares the moment training happens off the planned days:
//   • Plan Mon/Wed/Fri, trained Tue/Thu/Sat → size=3 == 3 sessions → badge read
//     "3/3 · All sessions done this week!" while ZERO squares were green (no
//     planned day was trained — a blatant self-contradiction).
//   • Trained an extra day beyond the plan → size=4 > 3 sessions → badge read
//     "4/3", and the "all done" congratulation failed to fire even though every
//     planned session WAS completed.
// Both come from counting raw weekdays instead of completed PLANNED sessions.
//
// doneCount here counts planned session days that were trained — exactly the
// green squares — so it is always ≤ total and `allDone` is true iff every
// planned session's weekday was trained. completedDows is returned so the squares
// use the same derivation.
//
// Weekdays are noon-anchored (`T12:00:00`) so the DOW is DST/timezone-stable, and
// Sunday (JS getDay() === 0) maps to 7 to match day_of_week's Mon=1…Sun=7 scheme.
export interface WeeklySessionProgress {
  completedDows: Set<number>
  doneCount: number
  total: number
  allDone: boolean
}

export function weekdayFromDateStr(dateStr: string): number {
  const d = new Date(dateStr + 'T12:00:00')
  const js = d.getDay()
  return js === 0 ? 7 : js
}

export function weeklySessionProgress(
  plannedDows: number[],
  completedDates: string[],
): WeeklySessionProgress {
  const completedDows = new Set(completedDates.map(weekdayFromDateStr))
  const total = plannedDows.length
  const doneCount = plannedDows.filter((d) => completedDows.has(d)).length
  return { completedDows, doneCount, total, allDone: total > 0 && doneCount === total }
}

// Convenience overload for the widget: takes the completed workout logs directly.
export function weeklySessionProgressFromLogs(
  plannedDows: number[],
  completedLogs: WorkoutLog[],
): WeeklySessionProgress {
  return weeklySessionProgress(plannedDows, completedLogs.map((l) => l.date))
}
