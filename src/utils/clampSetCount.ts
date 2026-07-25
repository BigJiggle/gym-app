// Clamp a per-exercise set count to a safe, loggable integer range.
//
// An exercise's `sets` value flows into WorkoutSession/WorkoutLogEditor, which
// build one set row per set — `Array.from({ length: count })` and
// `for (i = 0; i < count; i++)`. The SessionEditor "Sets" input persists a
// hand-typed value verbatim (`parseInt(value) || 1` only catches 0/NaN, never a
// negative or a huge pasted number), and a stored/AI plan can carry an
// out-of-range value too. Without a clamp:
//   • a huge value (e.g. 999999) allocates ~1M set rows → renderer hang / OOM,
//   • a negative value makes the array length 0 → an exercise with ZERO set rows
//     that can never be marked done — a silent, uncompletable dead exercise.
// Clamp to a sane 1–20: any legit plan (≤ ~12) passes through unchanged, while
// 0/negative/NaN → 1 (still loggable) and anything huge → 20.
export const MAX_SET_COUNT = 20

export function clampSetCount(value: unknown): number {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return 1
  return Math.max(1, Math.min(MAX_SET_COUNT, n))
}
