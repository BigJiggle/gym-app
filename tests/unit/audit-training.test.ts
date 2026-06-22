import { describe, it, expect } from 'vitest'
import { generateTrainingPlan, determinePhase } from '../../electron/services/trainingEngine'

const base = {
  training_frequency: 5, training_experience_years: 3,
  equipment_access: 'full_gym', goal: 'cut',
}

describe('audit training', () => {
  it('session count matches frequency (2..6)', () => {
    for (const f of [2,3,4,5,6]) {
      const plan = generateTrainingPlan({ ...base, training_frequency: f, weeks_out: 10 })
      expect(plan.sessions.length, `freq=${f}`).toBe(f)
    }
  })

  it('freq=7 clamps to 6, freq=0/NaN defaults sensibly', () => {
    expect(generateTrainingPlan({ ...base, training_frequency: 7, weeks_out: 10 }).sessions.length).toBe(6)
    expect(generateTrainingPlan({ ...base, training_frequency: 0, weeks_out: 10 }).sessions.length).toBeGreaterThanOrEqual(2)
    expect(generateTrainingPlan({ ...base, training_frequency: NaN, weeks_out: 10 }).sessions.length).toBe(4)
  })

  it('days of week are distinct within a plan', () => {
    for (const f of [2,3,4,5,6]) {
      for (const pref of ['auto','upper_lower','arnold','bro','full_body']) {
        const plan = generateTrainingPlan({ ...base, training_frequency: f, split_preference: pref, weeks_out: 10 })
        const days = plan.sessions.map(s=>s.day_of_week)
        expect(new Set(days).size, `freq=${f} pref=${pref} days=${days}`).toBe(days.length)
      }
    }
  })

  it('peak week (weeks_out<=3) is deload phase with reduced sets', () => {
    expect(determinePhase(1, 'cut')).toBe('deload')
    const deload = generateTrainingPlan({ ...base, weeks_out: 1 })
    const hyper = generateTrainingPlan({ ...base, weeks_out: 20 })
    const avg = (p: any) => {
      const all = p.sessions.flatMap((s: any)=>s.exercises.map((e: any)=>e.sets))
      return all.reduce((a: number,b: number)=>a+b,0)/all.length
    }
    expect(avg(deload)).toBeLessThan(avg(hyper))
  })

  it('every session has at least one exercise (no empty sessions)', () => {
    for (const f of [2,3,4,5,6]) {
      for (const pref of ['auto','upper_lower','arnold','bro','full_body']) {
        for (const eq of ['full_gym','home','minimal']) {
          const plan = generateTrainingPlan({ ...base, training_frequency: f, split_preference: pref, equipment_access: eq, weeks_out: 10 })
          for (const s of plan.sessions) {
            expect(s.exercises.length, `freq=${f} pref=${pref} eq=${eq} session=${s.session_name}`).toBeGreaterThan(0)
          }
        }
      }
    }
  })
})
