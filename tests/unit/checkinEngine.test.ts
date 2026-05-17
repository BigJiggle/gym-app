import { describe, it, expect } from 'vitest'
import { calculateAdjustments } from '../../electron/services/checkinEngine'

const GOOD_CHECKIN = {
  weight_kg: 84,
  training_adherence: 95,
  diet_adherence: 90,
  energy_level: 4,
  sleep_quality: 4,
  stress_level: 2
}

describe('checkinEngine', () => {
  it('returns an adjustments object with required fields', () => {
    const adj = calculateAdjustments(GOOD_CHECKIN, null, 2000, 'cut')
    expect(typeof adj.calories_delta).toBe('number')
    expect(typeof adj.cardio_change).toBe('string')
    expect(typeof adj.training_volume_change).toBe('string')
    expect(Array.isArray(adj.notes)).toBe(true)
    expect(adj.notes.length).toBeGreaterThan(0)
  })

  it('increases calories when weight drops too fast', () => {
    const adj = calculateAdjustments(
      { ...GOOD_CHECKIN, weight_kg: 82 },
      { weight_kg: 85, week_number: 1 },
      2000,
      'cut'
    )
    expect(adj.calories_delta).toBeGreaterThan(0)
    expect(adj.notes.some((n) => n.includes('too fast'))).toBe(true)
  })

  it('decreases calories when weight stalls', () => {
    const adj = calculateAdjustments(
      { ...GOOD_CHECKIN, weight_kg: 84 },
      { weight_kg: 84, week_number: 1 },
      2000,
      'cut'
    )
    expect(adj.calories_delta).toBeLessThan(0)
  })

  it('reduces training volume when recovery is poor', () => {
    const adj = calculateAdjustments(
      { ...GOOD_CHECKIN, energy_level: 2, sleep_quality: 2 },
      null,
      2000,
      'cut'
    )
    expect(adj.training_volume_change).not.toBe('no change')
  })

  it('adds a note about high stress', () => {
    const adj = calculateAdjustments(
      { ...GOOD_CHECKIN, stress_level: 4 },
      null,
      2000,
      'cut'
    )
    expect(adj.notes.some((n) => n.toLowerCase().includes('stress'))).toBe(true)
  })

  it('gives positive feedback for on-track weight loss', () => {
    const adj = calculateAdjustments(
      { ...GOOD_CHECKIN, weight_kg: 83.5 },
      { weight_kg: 84, week_number: 1 },
      2000,
      'cut'
    )
    expect(adj.calories_delta).toBe(0)
    expect(adj.notes.some((n) => n.includes('on track'))).toBe(true)
  })

  it('handles no previous checkin gracefully', () => {
    const adj = calculateAdjustments(GOOD_CHECKIN, null, 2000, 'cut')
    expect(() => calculateAdjustments(GOOD_CHECKIN, null, 2000, 'cut')).not.toThrow()
    expect(adj.notes.length).toBeGreaterThan(0)
  })

  it('flags low training adherence', () => {
    const adj = calculateAdjustments(
      { ...GOOD_CHECKIN, training_adherence: 40 },
      null,
      2000,
      'cut'
    )
    expect(adj.notes.some((n) => n.toLowerCase().includes('training adherence'))).toBe(true)
  })

  it('flags low diet adherence', () => {
    const adj = calculateAdjustments(
      { ...GOOD_CHECKIN, diet_adherence: 40 },
      null,
      2000,
      'cut'
    )
    expect(adj.notes.some((n) => n.toLowerCase().includes('diet adherence'))).toBe(true)
  })

  it('does not change calories for maintain goal with weight stable', () => {
    const adj = calculateAdjustments(
      { ...GOOD_CHECKIN, weight_kg: 85 },
      { weight_kg: 85, week_number: 1 },
      2500,
      'maintain'
    )
    expect(adj.calories_delta).toBe(0)
  })
})
