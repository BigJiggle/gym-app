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
