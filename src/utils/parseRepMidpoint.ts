// Parse a prescribed rep range (e.g. "8-12", "12", "15-20") into a single
// representative rep count used to SEED each set's default `reps` in
// WorkoutSession / the add-set handler.
//
// The Reps field in SessionEditor is FREE TEXT (`<input type="text">`) and
// persists whatever the user types verbatim, so this receives untrusted,
// possibly-malformed strings. The old implementation split on '-' and, in the
// exactly-two-parts branch, averaged `parseInt(parts[0]) + parseInt(parts[1])`
// with no NaN guard — so a partial entry like "12-" (parts = ["12", ""]) or
// "-12" produced `Math.round((12 + NaN) / 2)` === NaN. That NaN seeded every
// set's reps, which then propagated into the post-workout summary volume
// (`weight * reps` → NaN) and was persisted as `reps_actual`. The `|| 10`
// fallback only existed on the single-part branch, so these dashed cases slipped
// through.
//
// This version extracts every numeric token, ignores non-numeric ones, and
// falls back to 10 when none are present — so valid ranges behave exactly as
// before while any malformed input yields a finite rep count.
export function parseRepMidpoint(repRange: string): number {
  const nums = repRange
    .split('-')
    .map((p) => parseInt(p, 10))
    .filter((n) => Number.isFinite(n))
  if (nums.length === 0) return 10
  // Midpoint of the lowest→highest numeric tokens present (a lone number maps to
  // itself; a well-formed "lo-hi" range to its rounded midpoint, unchanged).
  return Math.round((nums[0] + nums[nums.length - 1]) / 2)
}
