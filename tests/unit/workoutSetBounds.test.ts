// Reproduces the "negative / non-finite reps & weight persist to the workout log"
// bug. The live WorkoutSession's reps and weight inputs (and the WorkoutLogEditor's)
// have no `min` — unlike the RIR input, which clamps to 0–5 — so a typed-in
// negative (e.g. a stray "-" before a number) reaches the write handlers, which
// stored `reps_actual`/`weight_kg` verbatim (only `?? null`). A negative reps
// then INVERTS the post-workout Total Volume (weight × reps) and, once in
// `exercise_logs`, poisons the permanent history: WorkoutStats charts, PR
// detection, and the next session's "last performance" pre-fill all read it back.
//
// Exercises the REAL handlers against an in-memory node-sqlite3-wasm database,
// plus the pure sanitize helpers directly.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Database } from 'node-sqlite3-wasm'
import { SCHEMA_SQL, MIGRATIONS } from '../../electron/database/schema'

let testDb: Database
vi.mock('../../electron/database/db', () => ({
  getDb: () => testDb,
  namedParams: (obj: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(obj).map(([k, v]) => [`@${k}`, v ?? null])),
}))

// Import AFTER the mock is registered.
import { registerWorkoutHandlers, sanitizeReps, sanitizeWeightKg } from '../../electron/ipc/workoutHandlers'

type Handler = (event: unknown, ...args: any[]) => any

function buildDb(): Database {
  const db = new Database(':memory:')
  const run = (sql: string) => {
    for (const stmt of sql.split(';').map((s) => s.trim()).filter(Boolean)) {
      db.prepare(stmt).run([])
    }
  }
  run(SCHEMA_SQL)
  for (const m of MIGRATIONS) run(m.sql)
  return db
}

function collectHandlers(): Map<string, Handler> {
  const handlers = new Map<string, Handler>()
  const fakeIpc = { handle: (channel: string, fn: Handler) => handlers.set(channel, fn) }
  registerWorkoutHandlers(fakeIpc as any)
  return handlers
}

describe('sanitizeReps / sanitizeWeightKg (pure)', () => {
  it('floors a negative reps to 0 and rounds fractional reps', () => {
    expect(sanitizeReps(-5)).toBe(0)
    expect(sanitizeReps(8)).toBe(8)
    expect(sanitizeReps(8.6)).toBe(9)
  })
  it('floors a negative weight to 0 and preserves fractional weight', () => {
    expect(sanitizeWeightKg(-50)).toBe(0)
    expect(sanitizeWeightKg(102.5)).toBe(102.5)
  })
  it('maps non-finite values to null, and preserves null/undefined as null', () => {
    expect(sanitizeReps(NaN)).toBeNull()
    expect(sanitizeReps(Infinity)).toBeNull()
    expect(sanitizeReps(null)).toBeNull()
    expect(sanitizeReps(undefined)).toBeNull()
    expect(sanitizeWeightKg(NaN)).toBeNull()
    expect(sanitizeWeightKg(-Infinity)).toBeNull()
    expect(sanitizeWeightKg(undefined)).toBeNull()
  })
})

describe('workout set write handlers — negative reps/weight are clamped', () => {
  let handlers: Map<string, Handler>
  const USER = 1

  beforeEach(() => {
    testDb = buildDb()
    testDb.prepare(
      `INSERT INTO users (id, name, age, sex, height_cm, weight_kg, goal)
       VALUES (?, 'Test', 30, 'male', 180, 85, 'cut')`
    ).run([USER])
    testDb.prepare(
      `INSERT INTO workout_logs (id, user_id, session_id, date, status)
       VALUES (1, ?, NULL, '2026-08-02', 'in_progress')`
    ).run([USER])
    handlers = collectHandlers()
  })

  it('saveSetsBatch: a fat-fingered negative reps is stored as 0, not negative', () => {
    const save = handlers.get('workout:saveSetsBatch')!
    save({}, 1, [
      { exercise_name: 'Barbell Bench Press', set_number: 1, reps_prescribed: '8', reps_actual: -5, weight_kg: 100, rir_actual: 2, skipped: false, notes: null },
    ])
    const row = testDb.prepare('SELECT * FROM exercise_logs WHERE workout_log_id=1').get([]) as Record<string, unknown>
    // Before the fix this stored -5, which makes Total Volume (100 × -5) negative.
    expect(row.reps_actual).toBe(0)
    expect(row.weight_kg).toBe(100)
  })

  it('saveSetsBatch: a negative weight is stored as 0, not negative', () => {
    const save = handlers.get('workout:saveSetsBatch')!
    save({}, 1, [
      { exercise_name: 'Squat', set_number: 1, reps_prescribed: '5', reps_actual: 5, weight_kg: -140, rir_actual: 1, skipped: false, notes: null },
    ])
    const row = testDb.prepare('SELECT * FROM exercise_logs WHERE workout_log_id=1').get([]) as Record<string, unknown>
    expect(row.weight_kg).toBe(0)
    expect(row.reps_actual).toBe(5)
  })

  it('logSet + updateSet: a negative reps edit clamps to 0', () => {
    const log = handlers.get('workout:logSet')!
    const created = log({}, 1, {
      exercise_name: 'Deadlift', set_number: 1, reps_prescribed: '5', reps_actual: 5, weight_kg: 180, rir_actual: 1, skipped: false, notes: null,
    }) as Record<string, unknown>
    const setId = created.id as number

    const update = handlers.get('workout:updateSet')!
    update({}, setId, { reps_actual: -3, weight_kg: 180, rir_actual: 1 })
    const row = testDb.prepare('SELECT * FROM exercise_logs WHERE id=?').get([setId]) as Record<string, unknown>
    expect(row.reps_actual).toBe(0)
    expect(row.weight_kg).toBe(180)
  })
})
