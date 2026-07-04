// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { isPreservedKey, mergeWeighIns, resetLocalData } from '../../src/utils/resetData'

describe('isPreservedKey', () => {
  it('preserves weigh-in history and water intake keys', () => {
    expect(isPreservedKey('daily_weight_log')).toBe(true)
    expect(isPreservedKey('water_target_ml')).toBe(true)
    expect(isPreservedKey('water_ml_2026-07-04')).toBe(true)
    expect(isPreservedKey('water_ml_2025-01-01')).toBe(true)
  })

  it('does not preserve other app-local logs', () => {
    for (const k of [
      'cardio_log', 'cardio_target_min', 'sleep_log', 'posing_log',
      'condition_log', 'supplement_list', 'supplement_log', 'refeed_day',
      'dashboard_widgets', 'milestones_1', 'random_key',
    ]) {
      expect(isPreservedKey(k)).toBe(false)
    }
  })
})

describe('mergeWeighIns', () => {
  it('unions daily and check-in weigh-ins, one per date, sorted ascending', () => {
    const daily = [{ date: '2026-01-03', weight_kg: 80 }]
    const checkins = [
      { date: '2026-01-01', weight_kg: 82 },
      { date: '2026-01-02', weight_kg: 81 },
    ]
    expect(mergeWeighIns(daily, checkins)).toEqual([
      { date: '2026-01-01', weight_kg: 82 },
      { date: '2026-01-02', weight_kg: 81 },
      { date: '2026-01-03', weight_kg: 80 },
    ])
  })

  it('existing daily entry wins over a same-date check-in weight', () => {
    const daily = [{ date: '2026-01-01', weight_kg: 79.5 }]
    const checkins = [{ date: '2026-01-01', weight_kg: 82 }]
    expect(mergeWeighIns(daily, checkins)).toEqual([{ date: '2026-01-01', weight_kg: 79.5 }])
  })

  it('drops invalid entries (bad date, NaN, non-positive)', () => {
    const daily = [
      { date: '2026-01-01', weight_kg: 80 },
      { date: '', weight_kg: 70 },
      { date: '2026-01-02', weight_kg: NaN },
      { date: '2026-01-03', weight_kg: 0 },
      { date: '2026-01-04', weight_kg: -5 },
    ] as { date: string; weight_kg: number }[]
    expect(mergeWeighIns(daily, [])).toEqual([{ date: '2026-01-01', weight_kg: 80 }])
  })

  it('handles empty inputs', () => {
    expect(mergeWeighIns([], [])).toEqual([])
  })
})

describe('resetLocalData', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('wipes non-preserved keys and keeps weigh-in + water keys', () => {
    localStorage.setItem('daily_weight_log', JSON.stringify([{ date: '2026-01-01', weight_kg: 80 }]))
    localStorage.setItem('water_ml_2026-07-04', '1500')
    localStorage.setItem('water_target_ml', '3000')
    localStorage.setItem('cardio_log', '[1,2,3]')
    localStorage.setItem('sleep_log', '[]')
    localStorage.setItem('supplement_list', '[]')
    localStorage.setItem('dashboard_widgets', '["a"]')

    resetLocalData(localStorage, [])

    expect(localStorage.getItem('cardio_log')).toBeNull()
    expect(localStorage.getItem('sleep_log')).toBeNull()
    expect(localStorage.getItem('supplement_list')).toBeNull()
    expect(localStorage.getItem('dashboard_widgets')).toBeNull()
    expect(localStorage.getItem('water_ml_2026-07-04')).toBe('1500')
    expect(localStorage.getItem('water_target_ml')).toBe('3000')
    expect(JSON.parse(localStorage.getItem('daily_weight_log')!)).toEqual([
      { date: '2026-01-01', weight_kg: 80 },
    ])
  })

  it('folds preserved check-in weigh-ins into the daily weight log', () => {
    localStorage.setItem('daily_weight_log', JSON.stringify([{ date: '2026-01-05', weight_kg: 78 }]))
    localStorage.setItem('cardio_log', '[1]')

    resetLocalData(localStorage, [
      { date: '2026-01-01', weight_kg: 82 },
      { date: '2026-01-03', weight_kg: 80 },
    ])

    expect(localStorage.getItem('cardio_log')).toBeNull()
    expect(JSON.parse(localStorage.getItem('daily_weight_log')!)).toEqual([
      { date: '2026-01-01', weight_kg: 82 },
      { date: '2026-01-03', weight_kg: 80 },
      { date: '2026-01-05', weight_kg: 78 },
    ])
  })

  it('creates a daily weight log from check-ins when none existed', () => {
    localStorage.setItem('posing_log', '[]')
    resetLocalData(localStorage, [{ date: '2026-02-01', weight_kg: 90 }])
    expect(localStorage.getItem('posing_log')).toBeNull()
    expect(JSON.parse(localStorage.getItem('daily_weight_log')!)).toEqual([
      { date: '2026-02-01', weight_kg: 90 },
    ])
  })

  it('tolerates a corrupted daily_weight_log', () => {
    localStorage.setItem('daily_weight_log', 'not json{')
    localStorage.setItem('cardio_log', '[1]')
    resetLocalData(localStorage, [{ date: '2026-03-01', weight_kg: 85 }])
    expect(localStorage.getItem('cardio_log')).toBeNull()
    expect(JSON.parse(localStorage.getItem('daily_weight_log')!)).toEqual([
      { date: '2026-03-01', weight_kg: 85 },
    ])
  })

  it('leaves an empty daily weight log when nothing to preserve', () => {
    localStorage.setItem('cardio_log', '[1]')
    resetLocalData(localStorage, [])
    expect(localStorage.getItem('cardio_log')).toBeNull()
    expect(JSON.parse(localStorage.getItem('daily_weight_log')!)).toEqual([])
  })
})
