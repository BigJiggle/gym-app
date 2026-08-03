import { describe, it, expect } from 'vitest'
import { parseTargetWeightKg } from '../../src/utils/targetWeight'

describe('parseTargetWeightKg — guards a corrupt persisted target_weight_kg from rendering NaN', () => {
  // Regression: the old inline logic `raw ? parseFloat(raw) : null` returned NaN
  // for a non-numeric string (a corrupt / hand-edited settings row). NaN passed
  // the `targetKg !== null` render guards in the Show Day Projection / Progress
  // cards (NaN !== null is true) and surfaced literal "NaN kg"/"NaN lbs".
  it('non-numeric strings resolve to null (were NaN), not a rendered value', () => {
    for (const bad of ['abc', 'NaN', 'kg', '--', ' ']) {
      const result = parseTargetWeightKg(bad)
      expect(result).toBeNull()
      // The precise failure the guard prevents: the old code would have produced NaN.
      expect(Number.isNaN(result as unknown as number)).toBe(false)
    }
  })

  it('empty / missing settings resolve to null (unchanged behavior)', () => {
    expect(parseTargetWeightKg('')).toBeNull()
    expect(parseTargetWeightKg(undefined)).toBeNull()
    expect(parseTargetWeightKg(null)).toBeNull()
  })

  it('non-positive values resolve to null (0 / negative are not a real stage-weight goal)', () => {
    expect(parseTargetWeightKg('0')).toBeNull()
    expect(parseTargetWeightKg('-5')).toBeNull()
    expect(parseTargetWeightKg('-0.1')).toBeNull()
  })

  it('valid positive numeric strings parse through unchanged', () => {
    expect(parseTargetWeightKg('75')).toBe(75)
    expect(parseTargetWeightKg('82.5')).toBe(82.5)
    // parseFloat tolerates a trailing unit suffix exactly as before — still finite.
    expect(parseTargetWeightKg('90kg')).toBe(90)
  })

  it('accepts a numeric value too (defensive — same finite/positive contract)', () => {
    expect(parseTargetWeightKg(70 as unknown as number)).toBe(70)
    expect(parseTargetWeightKg(Number.NaN)).toBeNull()
    expect(parseTargetWeightKg(Infinity)).toBeNull()
  })
})
