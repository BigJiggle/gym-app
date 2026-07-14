// Pure helpers for sanitizing user-profile payloads before they hit SQLite.
// Kept free of any electron/db imports so they can be unit-tested directly.

// meal_count/snack_count are stored unclamped otherwise — a plan generated from a
// clamped value still reads the raw stored value next time (e.g. AI profile payloads,
// `user.meal_count ?? 4` fallbacks), and an out-of-range count (NaN, 0, 50) can
// reach the meal-template builder downstream. Meals are clamped to 1–20, snacks 0–20.
export function clampMealCount(value: unknown): number | undefined {
  if (value === undefined) return undefined
  const n = Math.round(Number(value))
  return Number.isFinite(n) ? Math.max(1, Math.min(20, n)) : 4
}
export function clampSnackCount(value: unknown): number | undefined {
  if (value === undefined) return undefined
  const n = Math.round(Number(value))
  return Number.isFinite(n) ? Math.max(0, Math.min(20, n)) : 0
}
// body_fat_pct has no DB constraint and flows straight into trend charts —
// clamp to a physiologically plausible range instead of storing -5 or 150 as-is.
export function clampBodyFatPct(value: unknown): number | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(3, Math.min(60, n)) : null
}

// Serialize + clean a partial user-update payload for binding.
// - JSON array / boolean fields are stringified/int-coerced (node-sqlite3-wasm
//   rejects raw arrays/booleans).
// - `undefined` entries are dropped so unchanged fields aren't overwritten.
// - Non-finite numbers (NaN / ±Infinity) are ALSO dropped. A cleared numeric
//   input (`parseInt('')` → NaN) would otherwise reach node-sqlite3-wasm, which
//   binds non-finite numbers as NULL — silently blanking required columns like
//   age/height_cm/weight_kg (crashing displayWeight()/displayHeight() and
//   propagating NaN through the nutrition engine). Dropping keeps the stored value.
export function sanitizeUserUpdate(data: Record<string, unknown>): Record<string, unknown> {
  const serialized: Record<string, unknown> = {
    ...data,
    competition_history: data.competition_history !== undefined
      ? JSON.stringify(data.competition_history) : undefined,
    dietary_restrictions: data.dietary_restrictions !== undefined
      ? JSON.stringify(data.dietary_restrictions) : undefined,
    food_preferences: data.food_preferences !== undefined
      ? JSON.stringify(data.food_preferences) : undefined,
    food_exclusions: data.food_exclusions !== undefined
      ? JSON.stringify(data.food_exclusions) : undefined,
    is_natural: data.is_natural !== undefined ? (data.is_natural ? 1 : 0) : undefined,
    include_snacks: data.include_snacks !== undefined ? (data.include_snacks ? 1 : 0) : undefined,
    meal_count: clampMealCount(data.meal_count),
    snack_count: clampSnackCount(data.snack_count),
    body_fat_pct: clampBodyFatPct(data.body_fat_pct),
  }
  return Object.fromEntries(
    Object.entries(serialized).filter(
      ([, v]) => v !== undefined && !(typeof v === 'number' && !Number.isFinite(v))
    )
  )
}
