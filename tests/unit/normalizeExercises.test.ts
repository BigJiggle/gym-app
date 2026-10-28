import { describe, it, expect } from 'vitest'
import { normalizeExercises } from '../../electron/services/trainingEngine'

// Every training-plan load funnels through plan:getTraining, which reads the
// training_sessions.exercises TEXT cell and hands it straight to the renderer. The
// UI assumes each entry is an object (the Training tab does
// `session.exercises.map(ex => ex.name)`, WorkoutSession's buildInitialStates does
// `for (const ex of session.exercises) clampSetCount(ex.sets)`) with NO error
// boundary — so a `null` / non-object entry throws
// "Cannot read properties of null (reading 'name')" and white-screens the tab, and a
// non-JSON cell throws in the handler. Both are reachable from a hand-edited/corrupt
// cell and the null-entry case from the AI refine paths (which validate only the
// array LENGTH, not each entry). normalizeExercises is the read-seam guard — the
// training-side counterpart of normalizeMeals on the diet side.
describe('normalizeExercises', () => {
  it('returns [] for a non-array value (object / null / undefined)', () => {
    expect(normalizeExercises(undefined)).toEqual([])
    expect(normalizeExercises(null)).toEqual([])
    expect(normalizeExercises({ a: 1 })).toEqual([])
  })

  it('returns [] for an unparseable JSON string and parses a valid one', () => {
    expect(normalizeExercises('not json')).toEqual([])
    expect(normalizeExercises('{}')).toEqual([])
    const out = normalizeExercises('[{"name":"Bench Press","sets":4,"reps":"8-12","rir":2}]')
    expect(out).toHaveLength(1)
    expect(out[0].name).toBe('Bench Press')
  })

  it('drops null / non-object entries but keeps well-formed exercises', () => {
    // The exact crash case: a [null] entry (hand-edited cell or AI output) that slips
    // past an array-length-only check and then throws ex.name in the renderer.
    const out = normalizeExercises([
      null,
      'squat',
      42,
      { name: 'Barbell Squat', sets: 4, reps: '6-10', rir: 2 },
    ])
    expect(out).toHaveLength(1)
    expect(out[0].name).toBe('Barbell Squat')
  })

  it('does not throw and drops everything for an array of only bad entries', () => {
    expect(() => normalizeExercises([null, null])).not.toThrow()
    expect(normalizeExercises([null, null])).toEqual([])
  })

  it('supplies a string name fallback for a missing / non-string name', () => {
    const out = normalizeExercises([
      { sets: 3, reps: '10', rir: 1 },
      { name: '', sets: 3, reps: '10', rir: 1 },
      { name: 123, sets: 3, reps: '10', rir: 1 },
    ])
    expect(out).toHaveLength(3)
    for (const ex of out) {
      expect(typeof ex.name).toBe('string')
      expect(ex.name.length).toBeGreaterThan(0)
    }
  })

  it('passes all other fields through untouched (valid plan unchanged)', () => {
    const input = [{ name: 'Incline DB Press', sets: 3, reps: '8-12', rir: 2, notes: 'controlled eccentric' }]
    const out = normalizeExercises(input)
    expect(out[0]).toEqual(input[0])
    // sets/reps are left verbatim for the consumer's clampSetCount / parseRepMidpoint.
    const weird = normalizeExercises([{ name: 'X', sets: 999999, reps: 10, rir: 2 }])
    expect(weird[0].sets).toBe(999999)
    expect(weird[0].reps as unknown).toBe(10)
  })
})
