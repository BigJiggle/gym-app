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

// age / height_cm / weight_kg are guarded to a physiological range by the Onboarding
// wizard's validateStep (age 16–80, height 100–250 cm, weight 30–300 kg), but the
// Settings "Edit profile" save path calls user:update directly with NO equivalent
// check — the HTML min/max on those <input type="number"> boxes only bound the
// spinner arrows, so a typed-in extreme (e.g. "850" from a fat-fingered "85.0", or a
// cm value typed into the imperial inches box) persists unclamped. clampWeightKg only
// FLOORS at 30 (no ceiling), so an 850-kg weight then drives calcBMR/TDEE to a
// ~13,000 kcal, ~1,955 g protein plan — a nonsensical, dangerous target. Clamp each
// to the same Onboarding range at the write seam so both entry points agree. A
// non-finite value (a cleared field → NaN) returns undefined so it is dropped by the
// final filter and the stored value is preserved (never NULLing a required column).
function clampProfileNumber(value: unknown, min: number, max: number): number | undefined {
  if (value === undefined) return undefined
  const n = Number(value)
  if (!Number.isFinite(n)) return undefined
  return Math.max(min, Math.min(max, n))
}
export function clampAge(value: unknown): number | undefined {
  const n = clampProfileNumber(value, 16, 80)
  return n === undefined ? undefined : Math.round(n)
}
export function clampHeightCm(value: unknown): number | undefined {
  return clampProfileNumber(value, 100, 250)
}
export function clampWeightKgField(value: unknown): number | undefined {
  return clampProfileNumber(value, 30, 300)
}
// training_frequency is displayed verbatim (QuickStatsWidget "Training Days
// {value}/week", the Settings "Training Days" row) and drives the plan, whose
// session count generateTrainingPlan caps at 2–6 (Math.min(6, Math.max(2, …))).
// Onboarding sets it with a range slider (min 2, max 6) so it can't go out of
// range there, but the Settings number input's min/max only bind the spinner
// arrows — a typed extreme (e.g. "999") reaches user:update unclamped and then
// persists, so the dashboard shows "999/week" while the plan still has 6 sessions
// (a DB↔UI desync). Clamp to the same 2–6 range both onboarding and the engine
// agree on. A non-finite value (cleared field → NaN) returns undefined so it is
// dropped by the final filter and the stored value is preserved.
export function clampTrainingFrequency(value: unknown): number | undefined {
  const n = clampProfileNumber(value, 2, 6)
  return n === undefined ? undefined : Math.round(n)
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
    age: clampAge(data.age),
    height_cm: clampHeightCm(data.height_cm),
    weight_kg: clampWeightKgField(data.weight_kg),
    training_frequency: clampTrainingFrequency(data.training_frequency),
  }
  return Object.fromEntries(
    Object.entries(serialized).filter(
      ([, v]) => v !== undefined && !(typeof v === 'number' && !Number.isFinite(v))
    )
  )
}
