import { describe, it, expect } from 'vitest'
import { sanitizeUserUpdate } from '../../electron/ipc/userSanitize'

// node-sqlite3-wasm binds NaN / ±Infinity as NULL. In the Settings profile edit
// form, clearing a numeric input runs parseInt('')/parseFloat('') → NaN, which
// flows into user:update. Without a guard that NaN is bound as NULL, silently
// blanking a required column (age/height_cm/weight_kg/...), which then crashes
// displayWeight()/displayHeight() and propagates NaN through the nutrition engine.
// sanitizeUserUpdate must DROP such fields so the stored value is preserved.
describe('sanitizeUserUpdate — non-finite numeric guard', () => {
  it('drops a cleared (NaN) weight so the stored value is kept', () => {
    const clean = sanitizeUserUpdate({ id: 1, weight_kg: NaN, age: 30 })
    expect('weight_kg' in clean).toBe(false)
    expect(clean.age).toBe(30)
    expect(clean.id).toBe(1)
  })

  it('drops NaN / Infinity for every required numeric field', () => {
    const clean = sanitizeUserUpdate({
      id: 1,
      age: NaN,
      height_cm: Infinity,
      weight_kg: -Infinity,
      training_frequency: NaN,
      exercises_per_session: NaN,
      sets_per_exercise: NaN,
    })
    for (const k of ['age', 'height_cm', 'weight_kg', 'training_frequency', 'exercises_per_session', 'sets_per_exercise']) {
      expect(k in clean, `${k} should be dropped`).toBe(false)
    }
    // id must survive so the WHERE clause still targets the row.
    expect(clean.id).toBe(1)
  })

  it('keeps valid finite numbers', () => {
    const clean = sanitizeUserUpdate({ id: 1, age: 28, height_cm: 180, weight_kg: 82.5 })
    expect(clean.age).toBe(28)
    expect(clean.height_cm).toBe(180)
    expect(clean.weight_kg).toBe(82.5)
  })

  it('drops unchanged (undefined) fields but keeps an explicit null body_fat_pct', () => {
    const clean = sanitizeUserUpdate({ id: 1, age: undefined, body_fat_pct: null })
    expect('age' in clean).toBe(false)
    // body_fat_pct is nullable — a null clears it and must be preserved.
    expect('body_fat_pct' in clean).toBe(true)
    expect(clean.body_fat_pct).toBeNull()
  })

  // Onboarding's validateStep enforces age 16–80, height 100–250 cm, weight 30–300 kg
  // and blocks progression outside those ranges. The Settings "Edit profile" save path
  // has no such gate — the HTML min/max only bound the spinner arrows, so a typed-in
  // extreme (e.g. "850" from a fat-fingered "85.0") reaches user:update unclamped and
  // clampWeightKg only floors (no ceiling), inflating the diet plan to ~13,000 kcal /
  // ~1,955 g protein. sanitizeUserUpdate must clamp these to the same Onboarding range.
  it('clamps out-of-range age / height_cm / weight_kg to the Onboarding bounds', () => {
    const high = sanitizeUserUpdate({ id: 1, age: 850, height_cm: 900, weight_kg: 850 })
    expect(high.age).toBe(80)
    expect(high.height_cm).toBe(250)
    expect(high.weight_kg).toBe(300)

    const low = sanitizeUserUpdate({ id: 1, age: 4, height_cm: 5, weight_kg: 2 })
    expect(low.age).toBe(16)
    expect(low.height_cm).toBe(100)
    expect(low.weight_kg).toBe(30)
  })

  it('leaves in-range age / height_cm / weight_kg untouched', () => {
    const clean = sanitizeUserUpdate({ id: 1, age: 28, height_cm: 180, weight_kg: 82.5 })
    expect(clean.age).toBe(28)
    expect(clean.height_cm).toBe(180)
    expect(clean.weight_kg).toBe(82.5)
  })

  // training_frequency is DISPLAYED verbatim (QuickStatsWidget "Training Days
  // {value}/week", Settings "Training Days" row) AND drives the plan, whose session
  // count the engine caps at 2–6 (generateTrainingPlan: Math.min(6, Math.max(2, …))).
  // Onboarding sets it via a range slider (min 2, max 6) so it can't go out of range,
  // but the Settings "Edit profile" number input's min/max only bind the spinner
  // arrows — a typed extreme (e.g. "999") reaches user:update unclamped. It then
  // persists as 999, so the dashboard shows "999/week" while the plan has 6 sessions
  // (a DB↔UI desync). sanitizeUserUpdate must clamp it to the same 2–6 range the
  // engine and onboarding agree on. Mirrors the age/height/weight guard above.
  it('clamps out-of-range training_frequency to the engine bounds (2–6)', () => {
    expect(sanitizeUserUpdate({ id: 1, training_frequency: 999 }).training_frequency).toBe(6)
    expect(sanitizeUserUpdate({ id: 1, training_frequency: 1 }).training_frequency).toBe(2)
    // Fractional typed values round to a whole day count.
    expect(sanitizeUserUpdate({ id: 1, training_frequency: 3.4 }).training_frequency).toBe(3)
  })

  it('leaves an in-range training_frequency untouched', () => {
    expect(sanitizeUserUpdate({ id: 1, training_frequency: 4 }).training_frequency).toBe(4)
  })

  // exercises_per_session / sets_per_exercise feed generateTrainingPlan, which honors
  // each with NO upper bound: getSets() returns `userDefault` (isolations) or
  // `userDefault + 1` (compounds) sets, and the builders request that many exercises
  // per group. The Settings number inputs (exercises 3–12, sets 2–8) only bound the
  // spinner arrows, so a typed "999" reaches user:update unclamped — "Save & regenerate"
  // then stores a plan with ~1000 sets per exercise and dozens of exercises per session,
  // which the Training tab renders verbatim while the live WorkoutSession clamps each to
  // 1–20 (a nonsensical plan + DB↔UI desync). sanitizeUserUpdate must clamp both to the
  // Settings ranges. Mirrors the training_frequency guard above.
  it('clamps out-of-range exercises_per_session (3–12) and sets_per_exercise (2–8)', () => {
    const high = sanitizeUserUpdate({ id: 1, exercises_per_session: 999, sets_per_exercise: 999 })
    expect(high.exercises_per_session).toBe(12)
    expect(high.sets_per_exercise).toBe(8)

    const low = sanitizeUserUpdate({ id: 1, exercises_per_session: 0, sets_per_exercise: -5 })
    expect(low.exercises_per_session).toBe(3)
    expect(low.sets_per_exercise).toBe(2)

    // Fractional typed values round to a whole count.
    expect(sanitizeUserUpdate({ id: 1, sets_per_exercise: 4.6 }).sets_per_exercise).toBe(5)
  })

  it('leaves in-range exercises_per_session / sets_per_exercise untouched', () => {
    const clean = sanitizeUserUpdate({ id: 1, exercises_per_session: 6, sets_per_exercise: 4 })
    expect(clean.exercises_per_session).toBe(6)
    expect(clean.sets_per_exercise).toBe(4)
  })

  // show_date and division are NOT independent user-profile fields — they are
  // DERIVED from the `shows` table and rebuilt from it on every launch:
  // plan:startupRefresh (and syncPrimaryToNearest after every show add/update/
  // delete/setPrimary) runs `UPDATE users SET show_date=?, division=?` from the
  // nearest upcoming show, or `SET show_date=NULL, division=NULL` when there is
  // none. The Settings "Edit profile" form nonetheless exposes editable "Show
  // Date" and "Division" inputs that save straight through user:update to the
  // users row. That write is silently reverted on the next launch (the edit is
  // lost — data loss), and in the meantime it desyncs the app: the Diet plan is
  // NOT regenerated for the new weeks-out (only shows:* paths do that), so the
  // sidebar/Training/CheckIn/Progress read the just-written user.show_date while
  // the Diet page keeps the old show's macros (a DB↔UI desync). Shows are managed
  // exclusively through "My Shows" / onboarding / the AI assistant, all of which
  // route through the shows table. sanitizeUserUpdate must therefore DROP these
  // two derived columns so a profile edit can neither ghost-write nor desync them.
  it('drops show_date and division (derived from the shows table, not editable here)', () => {
    const clean = sanitizeUserUpdate({
      id: 1,
      show_date: '2026-11-15',
      division: "Men's Physique",
      weight_kg: 82.5,
    })
    expect('show_date' in clean).toBe(false)
    expect('division' in clean).toBe(false)
    // Genuine profile fields in the same payload still go through.
    expect(clean.weight_kg).toBe(82.5)
    expect(clean.id).toBe(1)
  })

  it('serializes array fields and clamps meal/snack counts', () => {
    const clean = sanitizeUserUpdate({
      id: 1,
      dietary_restrictions: ['Dairy-free'],
      meal_count: 99,
      snack_count: -3,
    })
    expect(clean.dietary_restrictions).toBe('["Dairy-free"]')
    expect(clean.meal_count).toBe(20)
    expect(clean.snack_count).toBe(0)
  })
})
