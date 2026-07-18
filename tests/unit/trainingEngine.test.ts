import { describe, it, expect } from 'vitest'
import { generateTrainingPlan } from '../../electron/services/trainingEngine'

const BASE_INPUT = {
  training_frequency: 4,
  training_experience_years: 2,
  equipment_access: 'full_gym',
  goal: 'cut'
}

describe('trainingEngine', () => {
  it('generates a plan with required fields', () => {
    const plan = generateTrainingPlan(BASE_INPUT)
    expect(plan.name).toBeTruthy()
    expect(plan.weeks_total).toBeGreaterThan(0)
    expect(plan.sessions).toBeDefined()
    expect(plan.sessions.length).toBeGreaterThan(0)
    expect(['hypertrophy', 'strength', 'peak', 'deload']).toContain(plan.phase)
  })

  it('generates 4 sessions for 4-day frequency', () => {
    const plan = generateTrainingPlan({ ...BASE_INPUT, training_frequency: 4 })
    expect(plan.sessions).toHaveLength(4)
  })

  it('generates 3 sessions for 3-day frequency', () => {
    const plan = generateTrainingPlan({ ...BASE_INPUT, training_frequency: 3 })
    expect(plan.sessions).toHaveLength(3)
  })

  it('generates 6 sessions for 6-day frequency', () => {
    const plan = generateTrainingPlan({ ...BASE_INPUT, training_frequency: 6 })
    expect(plan.sessions).toHaveLength(6)
  })

  it('each session has exercises', () => {
    const plan = generateTrainingPlan(BASE_INPUT)
    for (const session of plan.sessions) {
      expect(session.exercises.length).toBeGreaterThan(0)
    }
  })

  it('exercises have required fields', () => {
    const plan = generateTrainingPlan(BASE_INPUT)
    for (const session of plan.sessions) {
      for (const ex of session.exercises) {
        expect(ex.name).toBeTruthy()
        expect(ex.sets).toBeGreaterThan(0)
        expect(ex.reps).toBeTruthy()
        expect(typeof ex.rir).toBe('number')
      }
    }
  })

  it('uses hypertrophy phase when no show date', () => {
    const plan = generateTrainingPlan({ ...BASE_INPUT, goal: 'maintain' })
    expect(plan.phase).toBe('hypertrophy')
  })

  it('uses deload phase when 2 weeks out (weeksOut <= 3)', () => {
    const plan = generateTrainingPlan({ ...BASE_INPUT, weeks_out: 2 })
    expect(plan.phase).toBe('deload')
  })

  it('uses hypertrophy phase when more than 16 weeks out', () => {
    const plan = generateTrainingPlan({ ...BASE_INPUT, weeks_out: 20 })
    expect(plan.phase).toBe('hypertrophy')
  })

  it('filters exercises by equipment for home gym', () => {
    const plan = generateTrainingPlan({ ...BASE_INPUT, equipment_access: 'home' })
    for (const session of plan.sessions) {
      for (const ex of session.exercises) {
        const fullGymOnly = [
          'Barbell Bench Press', 'Leg Press', 'Hack Squat', 'Lat Pulldown',
          'Cable Row', 'Barbell Row', 'T-Bar Row'
        ]
        const isFullGymOnly = fullGymOnly.includes(ex.name)
        expect(isFullGymOnly).toBe(false)
      }
    }
  })

  it('assigns correct day_of_week values', () => {
    const plan = generateTrainingPlan(BASE_INPUT)
    for (const session of plan.sessions) {
      expect(session.day_of_week).toBeGreaterThanOrEqual(1)
      expect(session.day_of_week).toBeLessThanOrEqual(7)
    }
  })

  it('caps frequency at 6', () => {
    const plan = generateTrainingPlan({ ...BASE_INPUT, training_frequency: 8 })
    expect(plan.sessions.length).toBeLessThanOrEqual(6)
  })

  // Regression: Arnold split at high frequency (5–6 days) builds "variant B"
  // sessions by dropping the first exercise of each muscle group. With a low
  // exercises_per_session (3–4, both reachable — Settings allows 3–12), each
  // muscle group only has a single exercise, so the drop emptied the whole
  // "Shoulders & Arms (B)" session — a real workout day with zero exercises.
  it('Arnold split never produces an empty session at low exercises_per_session', () => {
    for (const freq of [5, 6]) {
      for (const exPer of [3, 4, 5, 6]) {
        const plan = generateTrainingPlan({
          ...BASE_INPUT,
          split_preference: 'arnold',
          training_frequency: freq,
          exercises_per_session: exPer,
        })
        for (const session of plan.sessions) {
          expect(
            session.exercises.length,
            `arnold freq=${freq} exPer=${exPer} — "${session.session_name}" was empty`
          ).toBeGreaterThan(0)
          for (const ex of session.exercises) {
            expect(ex.name).toBeTruthy()
          }
        }
      }
    }
  })

  // Regression: a non-positive / non-finite exercises_per_session (0, negative,
  // or NaN) must NOT collapse a session to zero exercises. A hand-typed 0 slips
  // past the Settings input's min={3} (HTML min doesn't block typed values) and
  // is finite, so it persists unclamped. In the builders it flowed through
  // `exPerSession ?? default` — but `??` ignores 0, so `getExercises(..., 0)`
  // returned [] and (for PPL/Arnold legs, which exclude the core fallback) the
  // Legs day was saved empty: a dead, uncompletable workout (0/0 → NaN% bar).
  // Every split must fall back to its own sensible default for a bad value.
  it('never produces an empty session for a non-positive / non-finite exercises_per_session', () => {
    const splits = ['auto', 'ppl', 'upper_lower', 'arnold', 'bro', 'full_body']
    for (const split of splits) {
      for (const bad of [0, -3, NaN] as number[]) {
        const plan = generateTrainingPlan({
          ...BASE_INPUT,
          split_preference: split,
          training_frequency: 6,
          exercises_per_session: bad,
        })
        for (const session of plan.sessions) {
          expect(
            session.exercises.length,
            `${split} exPer=${bad} — "${session.session_name}" was empty`
          ).toBeGreaterThan(0)
        }
      }
    }
  })
})
