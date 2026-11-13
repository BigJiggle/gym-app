import type { WorkoutLog, CheckIn, User } from '../types'

// MET value for vigorous resistance training (ACSM standard).
export const TRAINING_MET = 5.5

// The athlete's CURRENT bodyweight (kg) for training energy-expenditure math.
//
// Prefers the most recent check-in weigh-in — which tracks the cut week to week —
// and falls back to users.weight_kg (the onboarding / Settings value). That
// fallback is NEVER updated when a check-in is submitted, so it goes stale the
// moment the athlete's weight changes. The dashboard "This Week's Volume" widget
// and the Training tab's "This Week's Calorie Burn" widget show the SAME MET-5.5
// kcal-burned metric over the SAME completed workouts, so they must read bodyweight
// from the same source — otherwise the two surfaces report DIFFERENT kcal for the
// identical set of workouts the instant a check-in weight differs from the
// onboarding weight (i.e. after the first weigh-in of any cut) — a routine UI↔UI
// desync. A non-finite / non-positive stored check-in weight falls through to the
// onboarding weight rather than poisoning the estimate.
export function currentBodyweightKg(
  latestCheckin: Pick<CheckIn, 'weight_kg'> | null | undefined,
  user: Pick<User, 'weight_kg'>,
): number {
  const ci = latestCheckin?.weight_kg
  if (typeof ci === 'number' && Number.isFinite(ci) && ci > 0) return ci
  return user.weight_kg
}

export interface TrainingBurnEntry {
  date: string
  kcal: number
  mins: number
}

// Estimated training calories burned across `logs`, using
// MET 5.5 × bodyweight(kg) × session-duration(hours). kcal is rounded PER LOG and
// then summed (matching both widgets' prior inline math), and the per-log breakdown
// is returned for the Training tab's daily chips. Logs missing either timestamp —
// or carrying a non-positive / non-finite duration (a corrupt/hand-edited row, or
// ended_at before started_at) — are skipped so no NaN/negative burn reaches the UI.
// A non-finite / non-positive bodyweight yields 0 total (empty breakdown).
export function weeklyTrainingKcalBurned(
  logs: Pick<WorkoutLog, 'date' | 'started_at' | 'ended_at'>[],
  bodyweightKg: number,
): { total: number; perLog: TrainingBurnEntry[] } {
  if (!Number.isFinite(bodyweightKg) || bodyweightKg <= 0) return { total: 0, perLog: [] }
  const perLog: TrainingBurnEntry[] = []
  let total = 0
  for (const log of logs) {
    if (!log.started_at || !log.ended_at) continue
    const ms = new Date(log.ended_at).getTime() - new Date(log.started_at).getTime()
    if (!Number.isFinite(ms) || ms <= 0) continue
    const hours = ms / (1000 * 60 * 60)
    const kcal = Math.round(hours * TRAINING_MET * bodyweightKg)
    total += kcal
    perLog.push({ date: log.date, kcal, mins: Math.round(hours * 60) })
  }
  return { total, perLog }
}
