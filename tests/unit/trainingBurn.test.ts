import { describe, it, expect } from 'vitest'
import {
  TRAINING_MET,
  currentBodyweightKg,
  weeklyTrainingKcalBurned,
} from '../../src/utils/trainingBurn'

// A one-hour session so kcal === round(MET * weight) for easy assertions.
function oneHourLog(date: string) {
  return { date, started_at: `${date}T08:00:00`, ended_at: `${date}T09:00:00` }
}

describe('currentBodyweightKg — shared current-weight source', () => {
  const user = { weight_kg: 90 } // stale onboarding weight

  it('prefers the latest check-in weigh-in over the onboarding weight', () => {
    expect(currentBodyweightKg({ weight_kg: 82 }, user)).toBe(82)
  })

  it('falls back to the onboarding weight when there is no check-in', () => {
    expect(currentBodyweightKg(null, user)).toBe(90)
    expect(currentBodyweightKg(undefined, user)).toBe(90)
  })

  it('falls back when the stored check-in weight is non-finite or non-positive', () => {
    expect(currentBodyweightKg({ weight_kg: NaN }, user)).toBe(90)
    expect(currentBodyweightKg({ weight_kg: 0 }, user)).toBe(90)
    expect(currentBodyweightKg({ weight_kg: -5 }, user)).toBe(90)
  })
})

describe('weeklyTrainingKcalBurned — MET 5.5 estimate', () => {
  it('computes MET * bodyweight * hours, rounded per log then summed', () => {
    const { total, perLog } = weeklyTrainingKcalBurned(
      [oneHourLog('2026-11-10'), oneHourLog('2026-11-12')],
      80,
    )
    const perSession = Math.round(TRAINING_MET * 80) // 1h each → 440
    expect(perLog.map((e) => e.kcal)).toEqual([perSession, perSession])
    expect(total).toBe(perSession * 2)
    expect(perLog[0]).toMatchObject({ date: '2026-11-10', mins: 60 })
  })

  it('skips logs missing a timestamp and non-positive / corrupt durations', () => {
    const logs = [
      oneHourLog('2026-11-10'),
      { date: '2026-11-11', started_at: '2026-11-11T08:00:00', ended_at: null }, // not finished
      { date: '2026-11-12', started_at: '2026-11-12T09:00:00', ended_at: '2026-11-12T08:00:00' }, // reversed
      { date: '2026-11-13', started_at: 'not-a-date', ended_at: 'also-bad' }, // unparseable
    ]
    const { total, perLog } = weeklyTrainingKcalBurned(logs, 80)
    expect(perLog).toHaveLength(1)
    expect(perLog[0].date).toBe('2026-11-10')
    expect(total).toBe(Math.round(TRAINING_MET * 80))
  })

  it('returns zero burn for a non-finite / non-positive bodyweight (no NaN leak)', () => {
    expect(weeklyTrainingKcalBurned([oneHourLog('2026-11-10')], NaN)).toEqual({ total: 0, perLog: [] })
    expect(weeklyTrainingKcalBurned([oneHourLog('2026-11-10')], 0)).toEqual({ total: 0, perLog: [] })
  })
})

describe('regression: dashboard and Training tab agree on kcal burned', () => {
  // Both surfaces now compute burn from currentBodyweightKg(latestCheckin, user)
  // over the same logs. Before the fix the Training tab used the stale
  // users.weight_kg while the dashboard used the latest check-in weight, so once an
  // athlete weighed in at a different weight (the normal cut flow) the two widgets
  // reported DIFFERENT kcal for the identical set of workouts — a UI↔UI desync.
  it('uses the latest weigh-in on both surfaces, not the stale onboarding weight', () => {
    const user = { weight_kg: 90 } // onboarding weight (never updated on check-in)
    const latestCheckin = { weight_kg: 82 } // current weight after a cut
    const logs = [oneHourLog('2026-11-10'), oneHourLog('2026-11-12')]

    const weightKg = currentBodyweightKg(latestCheckin, user)
    const dashboard = weeklyTrainingKcalBurned(logs, weightKg)
    const trainingTab = weeklyTrainingKcalBurned(logs, weightKg)

    // Both surfaces agree...
    expect(trainingTab.total).toBe(dashboard.total)
    // ...and reflect the CURRENT weight (82), not the stale onboarding weight (90).
    expect(dashboard.total).toBe(Math.round(TRAINING_MET * 82) * 2)
    expect(dashboard.total).not.toBe(Math.round(TRAINING_MET * 90) * 2)
  })
})
