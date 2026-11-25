import { describe, it, expect } from 'vitest'
import { computeExerciseTrend } from '../../src/utils/exerciseTrend'
import type { WorkoutLog, ExerciseLogEntry } from '../../src/types'

// Build a completed WorkoutLog with the given sets for one exercise.
function log(id: number, date: string, sets: Partial<ExerciseLogEntry>[]): WorkoutLog {
  return {
    id,
    user_id: 1,
    session_id: 10,
    date,
    status: 'completed',
    started_at: `${date}T10:00:00`,
    ended_at: `${date}T11:00:00`,
    notes: null,
    sets: sets.map((s, i) => ({
      id: id * 100 + i,
      workout_log_id: id,
      exercise_name: 'Bench Press',
      set_number: i + 1,
      reps_prescribed: '8-12',
      reps_actual: 8,
      weight_kg: 100,
      rir_actual: 2,
      skipped: false,
      notes: null,
      ...s,
    })),
  }
}

// history is newest-first (as the workout:history handler returns, ORDER BY id DESC).
describe('computeExerciseTrend', () => {
  it('reports up when the top weight rose across sessions', () => {
    const history = [
      log(3, '2026-11-20', [{ weight_kg: 110, reps_actual: 8 }]),
      log(2, '2026-11-13', [{ weight_kg: 105, reps_actual: 8 }]),
      log(1, '2026-11-06', [{ weight_kg: 100, reps_actual: 8 }]),
    ]
    expect(computeExerciseTrend(history).get('Bench Press')).toBe('up')
  })

  it('reports down when the top weight fell, stable when unchanged', () => {
    const down = [
      log(2, '2026-11-13', [{ weight_kg: 95, reps_actual: 8 }]),
      log(1, '2026-11-06', [{ weight_kg: 100, reps_actual: 8 }]),
    ]
    expect(computeExerciseTrend(down).get('Bench Press')).toBe('down')
    const stable = [
      log(2, '2026-11-13', [{ weight_kg: 100, reps_actual: 8 }]),
      log(1, '2026-11-06', [{ weight_kg: 100, reps_actual: 8 }]),
    ]
    expect(computeExerciseTrend(stable).get('Bench Press')).toBe('stable')
  })

  it('needs at least two completed sessions to emit a trend', () => {
    const history = [log(1, '2026-11-06', [{ weight_kg: 100, reps_actual: 8 }])]
    expect(computeExerciseTrend(history).has('Bench Press')).toBe(false)
  })

  // The core regression: a set logged with a weight but reps cleared to 0
  // (reps_actual: 0 — reachable from the live WorkoutSession, whose reps input is
  // `value={s.reps || ''}` and whose ✓ is not rep-gated) must NOT count toward the
  // trend. Otherwise this newest "120 kg × 0" phantom set becomes the session's top
  // weight and paints a green ↑ "improving" arrow next to a PR line that correctly
  // ignores the same set — a visible UI↔UI desync. Every sibling strength surface
  // (exercisePRs, lastPerfBySession, computePRs, detectNewPRs) excludes reps-0.
  it('ignores a reps-0 weighted set so it cannot flip the trend', () => {
    const history = [
      // newest session: a heavy phantom set (reps cleared to 0) plus a real set
      log(3, '2026-11-20', [
        { weight_kg: 120, reps_actual: 0 }, // phantom — must be ignored
        { weight_kg: 90, reps_actual: 8 },  // the real top set this session
      ]),
      log(2, '2026-11-13', [{ weight_kg: 100, reps_actual: 8 }]),
      log(1, '2026-11-06', [{ weight_kg: 100, reps_actual: 8 }]),
    ]
    // Real top weights: 90 (newest) vs 100 (oldest) → down. If the 120×0 phantom
    // leaked in, newest top would be 120 → a bogus 'up'.
    expect(computeExerciseTrend(history).get('Bench Press')).toBe('down')
  })

  it('ignores reps-0 even when it is the only set in the newest session', () => {
    const history = [
      log(3, '2026-11-20', [{ weight_kg: 999, reps_actual: 0 }]), // phantom only
      log(2, '2026-11-13', [{ weight_kg: 110, reps_actual: 8 }]),
      log(1, '2026-11-06', [{ weight_kg: 100, reps_actual: 8 }]),
    ]
    // Newest session contributes nothing; trend is 110 (newest valid) vs 100 → up.
    expect(computeExerciseTrend(history).get('Bench Press')).toBe('up')
  })
})
