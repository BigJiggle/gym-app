import { describe, it, expect } from 'vitest'
import { computePRs } from '../../src/pages/Training/WorkoutStats'
import type { WorkoutLog, ExerciseLogEntry } from '../../src/types'

// Helper to build a minimal completed WorkoutLog with the given sets.
function makeLog(sets: Partial<ExerciseLogEntry>[], date = '2026-11-10'): WorkoutLog {
  return {
    id: 1,
    user_id: 1,
    session_id: 1,
    date,
    status: 'completed',
    started_at: `${date}T10:00:00`,
    ended_at: `${date}T11:00:00`,
    notes: null,
    sets: sets.map((s, i) => ({
      id: i + 1,
      workout_log_id: 1,
      exercise_name: s.exercise_name ?? 'Barbell Bench Press',
      set_number: s.set_number ?? i + 1,
      reps_prescribed: s.reps_prescribed ?? null,
      reps_actual: s.reps_actual ?? null,
      weight_kg: s.weight_kg ?? null,
      rir_actual: s.rir_actual ?? null,
      skipped: s.skipped ?? false,
      notes: s.notes ?? null,
    })),
  }
}

describe('computePRs reps guard — a weight-but-zero-reps set is not a PR', () => {
  it('excludes a set with weight_kg > 0 but reps_actual === 0 (reachable from the live session)', () => {
    // The live WorkoutSession persists a set tapped done with a weight entered
    // but reps cleared as { weight_kg: 100, reps_actual: 0 }. It must NOT surface
    // as a "100 kg × 0" PR — every other PR computation in the app excludes it.
    const prs = computePRs([makeLog([{ exercise_name: 'Barbell Squat', weight_kg: 100, reps_actual: 0 }])])
    expect(prs).toEqual([])
  })

  it('still records a normal weighted set with real reps as a PR', () => {
    const prs = computePRs([makeLog([{ exercise_name: 'Barbell Squat', weight_kg: 140, reps_actual: 5 }])])
    expect(prs).toHaveLength(1)
    expect(prs[0]).toMatchObject({ exerciseName: 'Barbell Squat', weightKg: 140, reps: 5 })
  })

  it('agrees with the rest of the app: a 0-rep heavy set does not beat a lighter real-rep PR', () => {
    // Exercise has a real 120 kg × 8 PR and a later 150 kg × 0 (cleared-reps) set.
    // The 150×0 must be ignored, so the reported PR stays 120 × 8 — matching the
    // Plan tab's exercisePRs, which excludes reps_actual === 0.
    const prs = computePRs([
      makeLog([{ exercise_name: 'Deadlift', weight_kg: 120, reps_actual: 8 }], '2026-11-01'),
      makeLog([{ exercise_name: 'Deadlift', weight_kg: 150, reps_actual: 0 }], '2026-11-08'),
    ])
    expect(prs).toHaveLength(1)
    expect(prs[0]).toMatchObject({ exerciseName: 'Deadlift', weightKg: 120, reps: 8 })
  })
})
