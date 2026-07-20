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

  describe('multi-check-in weight trend (adaptive)', () => {
    // A single noisy weigh-in (a 2 kg water spike last week) reads as a fast drop
    // week-over-week, but the multi-week trend is flat → the smoothed logic treats
    // it as a stall, not a "dropping too fast" event.
    const NOISY_PRIORS = [
      { weight_kg: 84.0, week_number: 3 }, // last week's water spike (most recent)
      { weight_kg: 82.2, week_number: 2 },
      { weight_kg: 82.1, week_number: 1 }, // oldest anchor
    ]

    it('single-week delta alone would add calories (too-fast) without trend context', () => {
      const adj = calculateAdjustments(
        { ...GOOD_CHECKIN, weight_kg: 82 },
        { weight_kg: 84, week_number: 3 },
        2000,
        'cut'
        // no recentCheckins → single-week fallback
      )
      expect(adj.calories_delta).toBe(150)
      expect(adj.notes.some((n) => n.includes('too fast'))).toBe(true)
      expect(adj.notes.some((n) => n.includes('Weight trend'))).toBe(false)
    })

    it('smoothed trend treats the same weigh-in as a stall, not a fast drop', () => {
      const adj = calculateAdjustments(
        { ...GOOD_CHECKIN, weight_kg: 82 },
        { weight_kg: 84, week_number: 3 },
        2000,
        'cut',
        NOISY_PRIORS
      )
      expect(adj.calories_delta).toBe(-100)
      expect(adj.notes.some((n) => n.includes('stalling'))).toBe(true)
      expect(adj.notes.some((n) => n.includes('Weight trend'))).toBe(true)
    })

    it('adds calories when the trend (not just one week) is dropping too fast', () => {
      const adj = calculateAdjustments(
        { ...GOOD_CHECKIN, weight_kg: 80 },
        { weight_kg: 82, week_number: 3 },
        2000,
        'cut',
        [
          { weight_kg: 82, week_number: 3 },
          { weight_kg: 84, week_number: 2 },
          { weight_kg: 86, week_number: 1 },
        ]
      )
      // ~-2.5%/wk over the window → too fast
      expect(adj.calories_delta).toBe(150)
      expect(adj.notes.some((n) => n.includes('too fast'))).toBe(true)
      expect(adj.notes.some((n) => n.includes('Weight trend'))).toBe(true)
    })

    it('leaves calories unchanged when the trend is on-track (0.3–1%/wk)', () => {
      const adj = calculateAdjustments(
        { ...GOOD_CHECKIN, weight_kg: 82 },
        { weight_kg: 82.6, week_number: 3 },
        2000,
        'cut',
        [
          { weight_kg: 82.6, week_number: 3 },
          { weight_kg: 83.2, week_number: 2 },
          { weight_kg: 83.8, week_number: 1 },
        ]
      )
      expect(adj.calories_delta).toBe(0)
      expect(adj.notes.some((n) => n.toLowerCase().includes('on track'))).toBe(true)
    })

    it('falls back to the single-week delta with fewer than two priors', () => {
      const adj = calculateAdjustments(
        { ...GOOD_CHECKIN, weight_kg: 85 },
        { weight_kg: 85, week_number: 1 },
        2000,
        'cut',
        [{ weight_kg: 85, week_number: 1 }] // only one prior → no trend
      )
      expect(adj.calories_delta).toBe(-100)
      // single-week wording, not the trend label
      expect(adj.notes.some((n) => n.includes('Weight stalling'))).toBe(true)
    })

    it('ignores non-finite weigh-ins in the trend window', () => {
      const adj = calculateAdjustments(
        { ...GOOD_CHECKIN, weight_kg: 82 },
        { weight_kg: 84, week_number: 3 },
        2000,
        'cut',
        [
          { weight_kg: NaN, week_number: 3 },
          { weight_kg: 82.2, week_number: 2 },
          { weight_kg: 82.1, week_number: 1 },
        ]
      )
      // NaN dropped → two valid priors remain, trend still forms and reads a stall
      expect(adj.calories_delta).toBe(-100)
      expect(adj.notes.some((n) => n.includes('Weight trend'))).toBe(true)
    })
  })

  // A biweekly / every-3-days schedule (both first-class Settings options) means
  // consecutive check-ins are NOT one week apart. The %/week thresholds must be
  // normalized by the actual elapsed time between check-in dates, not assume one
  // week per interval — otherwise a textbook-healthy 0.8 %/wk cut reads as a
  // "dropping too fast" 1.6 %/wk event and the engine wrongly adds calories.
  describe('cadence-aware trend (non-weekly schedules)', () => {
    it('single-week fallback normalizes a 14-day gap by elapsed weeks', () => {
      // 100 kg athlete lost 1.6 kg over 14 days = 0.8 kg/wk ≈ 0.8 %/wk (on track).
      const adj = calculateAdjustments(
        { ...GOOD_CHECKIN, weight_kg: 98.4, check_in_date: '2026-01-15' },
        { weight_kg: 100, week_number: 1, check_in_date: '2026-01-01' },
        2000,
        'cut'
      )
      expect(adj.calories_delta).toBe(0)
      expect(adj.notes.some((n) => n.includes('too fast'))).toBe(false)
      expect(adj.notes.some((n) => n.toLowerCase().includes('on track'))).toBe(true)
    })

    it('smoothed trend divides by elapsed weeks, not check-in count (biweekly)', () => {
      // Three check-ins 14 days apart, steady 0.8 %/wk loss.
      const adj = calculateAdjustments(
        { ...GOOD_CHECKIN, weight_kg: 96.8, check_in_date: '2026-01-29' },
        { weight_kg: 98.4, week_number: 2, check_in_date: '2026-01-15' },
        2000,
        'cut',
        [
          { weight_kg: 98.4, week_number: 2, check_in_date: '2026-01-15' },
          { weight_kg: 100, week_number: 1, check_in_date: '2026-01-01' },
        ]
      )
      // oldest 100 kg on 01-01, current 96.8 kg on 01-29 → 28 days = 4 weeks.
      // (96.8-100)/4 = -0.8 kg/wk ≈ -0.8 %/wk → on track, no calorie change.
      expect(adj.calories_delta).toBe(0)
      expect(adj.notes.some((n) => n.includes('too fast'))).toBe(false)
    })

    it('still flags a genuinely too-fast biweekly drop', () => {
      // 100 kg → 96 kg over 14 days = 2 kg/wk ≈ 2 %/wk → genuinely too fast.
      const adj = calculateAdjustments(
        { ...GOOD_CHECKIN, weight_kg: 96, check_in_date: '2026-01-15' },
        { weight_kg: 100, week_number: 1, check_in_date: '2026-01-01' },
        2000,
        'cut'
      )
      expect(adj.calories_delta).toBe(150)
      expect(adj.notes.some((n) => n.includes('too fast'))).toBe(true)
    })
  })
})
