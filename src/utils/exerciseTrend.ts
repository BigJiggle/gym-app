import type { WorkoutLog } from '../types'

export type TrendDirection = 'up' | 'down' | 'stable'

// Strength trend per exercise: compares the top-set weight across the last 3
// completed sessions for each exercise and reports up / down / stable. Shown as
// the ↑ / ↓ / → arrow beside each exercise on the Training tab, directly next to
// the "Last:" and "PR:" lines (which come from lastPerfBySession / exercisePRs).
//
// A set counts toward the trend only when it has BOTH a real weight AND a real
// rep count. The reps guard (`!s.reps_actual`, which rejects null/undefined/0)
// matches every sibling strength surface in the app — exercisePRs,
// lastPerfBySession, computePRs, WorkoutSession's lastPerformance/allTimePR, and
// detectNewPRs. Without it, this was the one training surface that still folded a
// reps-0 weighted set into a strength metric: the live WorkoutSession stores a set
// completed with a weight entered but reps cleared to 0 as `reps_actual: 0` (its
// reps input is `value={s.reps || ''}` → `Number('') === 0`, and the ✓ button is
// not rep-gated). Such a phantom set — e.g. 120 kg × 0 — then became that session's
// top weight here and painted a green ↑ "improving" arrow right beside a PR line
// that (correctly) ignores the very same set, a visible UI↔UI desync.
//
// `history` is expected newest-first (the `workout:history` handler returns
// `ORDER BY id DESC`); up to 3 most-recent completed sessions per exercise are
// collected, and the trend is the sign of (newest top weight − oldest top weight).
export function computeExerciseTrend(history: WorkoutLog[]): Map<string, TrendDirection> {
  const workoutsPerExercise = new Map<string, number[]>()
  for (const log of history) {
    if (log.status !== 'completed') continue
    const logBest = new Map<string, number>()
    for (const s of log.sets ?? []) {
      if (s.skipped || !s.weight_kg || s.weight_kg === 0 || !s.reps_actual) continue
      const cur = logBest.get(s.exercise_name) ?? 0
      if (s.weight_kg > cur) logBest.set(s.exercise_name, s.weight_kg)
    }
    for (const [name, best] of logBest) {
      if (!workoutsPerExercise.has(name)) workoutsPerExercise.set(name, [])
      const arr = workoutsPerExercise.get(name)!
      if (arr.length < 3) arr.push(best)
    }
  }
  const result = new Map<string, TrendDirection>()
  for (const [name, weights] of workoutsPerExercise) {
    if (weights.length < 2) continue
    const diff = weights[0] - weights[weights.length - 1]
    result.set(name, diff > 0 ? 'up' : diff < 0 ? 'down' : 'stable')
  }
  return result
}
