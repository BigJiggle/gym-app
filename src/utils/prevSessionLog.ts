import type { WorkoutLog } from '../types'

// Find the most recent completed workout for the SAME plan session as `log`,
// strictly before `log`'s date — used to draw the per-exercise strength
// progression arrows (↑/↓) in the workout history list.
//
// `history` is expected newest-first (the `workout:history` handler returns
// `ORDER BY id DESC`), so `.find` returns the newest qualifying earlier log.
//
// Guard against a NULL session_id on BOTH sides. A workout's session linkage is
// deliberately nulled (`UPDATE workout_logs SET session_id = NULL …`) whenever the
// training plan is regenerated — which happens automatically at every phase
// boundary (hypertrophy→strength→peak→deload) and on any show-date change, because
// the old `training_sessions` rows are deleted and the FK forbids dangling refs.
// After such a regen EVERY historical completed log has `session_id === null`, so a
// bare `h.session_id === log.session_id` becomes `null === null` → true and matches
// an UNRELATED earlier workout, drawing a wrong progression arrow for any exercise
// that happens to recur across the two sessions. A log whose session is unknown
// (null) has no determinable "same-session" predecessor, so return undefined and
// let the UI simply omit the arrow rather than show a misleading one.
export function findPrevSessionLog(
  history: WorkoutLog[],
  log: WorkoutLog
): WorkoutLog | undefined {
  if (log.session_id == null) return undefined
  return history.find(
    (h) =>
      h.id !== log.id &&
      h.status === 'completed' &&
      h.session_id === log.session_id &&
      h.date < log.date
  )
}
