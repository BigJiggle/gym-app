// Parses the persisted `target_weight_kg` setting (stored as a string) into a
// finite, positive kg number — or null when it's absent/empty/non-numeric.
//
// The setting is written as `String(kg)` by the validated Progress editor
// (which only saves values that pass `!isNaN(v) && v > 0`), but a hand-edited or
// corrupt DB/settings row can hold a non-numeric string ("", "abc", "NaN") or a
// non-positive number ("0", "-5"). A bare `settings.target_weight_kg ?
// parseFloat(...) : null` — the pattern this replaces — returns NaN for a
// non-numeric string (the truthy string passes the `?` guard, then parseFloat
// yields NaN) and 0 for "0". That NaN then propagates through the Show Day
// Projection / Progress target math and renders literal "NaN kg"/"NaN lbs" to the
// athlete (the `targetKg !== null` render guards don't catch NaN, since
// `NaN !== null` is true). Guard at the parse seam so a bad value reads as
// "no target set" instead of surfacing NaN.
export function parseTargetWeightKg(raw: string | number | undefined | null): number | null {
  if (raw == null || raw === '') return null
  const n = typeof raw === 'number' ? raw : parseFloat(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}
