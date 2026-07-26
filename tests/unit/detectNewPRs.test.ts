import { describe, it, expect } from 'vitest'
import { detectNewPRs, type PRExerciseState, type PRPerf } from '../../src/utils/detectNewPRs'

function state(sets: Array<[number, number, boolean]>, allSkipped = false): PRExerciseState {
  return { allSkipped, sets: sets.map(([weight, reps, done]) => ({ weight, reps, done })) }
}

describe('detectNewPRs', () => {
  it('announces a PR only when the session beats the ALL-TIME best, not last session', () => {
    // Athlete's all-time PR on Bench is 100 (from some earlier session). Last session
    // they did 90. Today they hit 95 — above last session but below all-time. Prior
    // (buggy) logic compared to last session (90) and wrongly announced 95 as a PR.
    const prior: Map<string, PRPerf> = new Map([['Bench', { weight: 100, reps: 5 }]])
    const current: Array<[string, PRExerciseState]> = [
      ['Bench', state([[95, 6, true]])],
    ]
    expect(detectNewPRs(current, prior)).toEqual([])
  })

  it('announces a genuine all-time PR', () => {
    const prior: Map<string, PRPerf> = new Map([['Bench', { weight: 100, reps: 5 }]])
    const current: Array<[string, PRExerciseState]> = [
      ['Bench', state([[102.5, 3, true], [100, 5, true]])],
    ]
    expect(detectNewPRs(current, prior)).toEqual([{ exerciseName: 'Bench', weight: 102.5, reps: 3 }])
  })

  it('does not announce a PR for an exercise with no prior all-time record (first time)', () => {
    const prior: Map<string, PRPerf> = new Map()
    const current: Array<[string, PRExerciseState]> = [
      ['Squat', state([[140, 5, true]])],
    ]
    expect(detectNewPRs(current, prior)).toEqual([])
  })

  it('ignores skipped exercises, undone sets, and bodyweight (weight 0) sets', () => {
    const prior: Map<string, PRPerf> = new Map([
      ['Bench', { weight: 100, reps: 5 }],
      ['Pullup', { weight: 0, reps: 10 }],
      ['Deadlift', { weight: 180, reps: 3 }],
    ])
    const current: Array<[string, PRExerciseState]> = [
      ['Bench', state([[110, 4, false]])],            // beats PR but not marked done → no PR
      ['Pullup', state([[0, 15, true]])],             // bodyweight only → no weighted PR
      ['Deadlift', state([[200, 2, true]], true)],    // whole exercise skipped → no PR
    ]
    expect(detectNewPRs(current, prior)).toEqual([])
  })

  it('reports the reps of the heaviest done set', () => {
    const prior: Map<string, PRPerf> = new Map([['OHP', { weight: 50, reps: 8 }]])
    const current: Array<[string, PRExerciseState]> = [
      ['OHP', state([[55, 5, true], [52.5, 8, true]])],
    ]
    expect(detectNewPRs(current, prior)).toEqual([{ exerciseName: 'OHP', weight: 55, reps: 5 }])
  })
})
