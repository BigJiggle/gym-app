// Reproduces the "editing a logged set silently fails" bug: the workout:updateSet
// IPC handler bound `undefined` field values straight into the SQL UPDATE, and
// node-sqlite3-wasm throws "Unsupported type for binding: undefined". The
// WorkoutLogEditor auto-save sends { weight_kg, reps_actual, rir_actual } every
// blur, computing `undefined` for any empty field — so editing the weight of a
// set that has no RIR (a very common case: RIR is optional), or clearing a
// weight/reps field, made the whole save throw and the edit never persisted
// (a DB↔UI desync — the UI shows the new value, the DB keeps the old one).
//
// Exercises the REAL handler against an in-memory node-sqlite3-wasm database.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Database } from 'node-sqlite3-wasm'
import { SCHEMA_SQL, MIGRATIONS } from '../../electron/database/schema'

// Provide getDb (our in-memory instance); never load the real db.ts, which
// imports 'electron' (unavailable in the node test env).
let testDb: Database
vi.mock('../../electron/database/db', () => ({
  getDb: () => testDb,
  namedParams: (obj: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(obj).map(([k, v]) => [`@${k}`, v ?? null])),
}))

// Import AFTER the mock is registered.
import { registerWorkoutHandlers } from '../../electron/ipc/workoutHandlers'

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

describe('workout:updateSet — undefined field bindings', () => {
  let handlers: Map<string, Handler>
  const USER = 1
  let setId: number

  beforeEach(() => {
    testDb = buildDb()
    testDb.prepare(
      `INSERT INTO users (id, name, age, sex, height_cm, weight_kg, goal)
       VALUES (?, 'Test', 30, 'male', 180, 85, 'cut')`
    ).run([USER])
    testDb.prepare(
      `INSERT INTO workout_logs (id, user_id, session_id, date, status)
       VALUES (1, ?, NULL, '2026-07-16', 'completed')`
    ).run([USER])
    // A logged set that has a weight + reps but NO rir (rir_actual is NULL) —
    // the common shape produced when a set is logged without recording RIR.
    const res = testDb.prepare(
      `INSERT INTO exercise_logs (workout_log_id, exercise_name, set_number, reps_actual, weight_kg, rir_actual, skipped)
       VALUES (1, 'Barbell Bench Press', 1, 8, 100, NULL, 0)`
    ).run([])
    setId = res.lastInsertRowid as number
    handlers = collectHandlers()
  })

  it('persists a weight edit on a set that has no RIR (rir_actual undefined)', () => {
    const update = handlers.get('workout:updateSet')!
    // Exactly what WorkoutLogEditor.autoSave sends when the row has an empty RIR:
    // rir_actual is `undefined`, not null.
    expect(() =>
      update({}, setId, { weight_kg: 105, reps_actual: 8, rir_actual: undefined })
    ).not.toThrow()
    const row = testDb.prepare('SELECT * FROM exercise_logs WHERE id=?').get([setId]) as Record<string, unknown>
    expect(row.weight_kg).toBe(105)
    expect(row.rir_actual).toBeNull()
  })

  it('clears a weight to NULL when the field is emptied (weight_kg undefined)', () => {
    const update = handlers.get('workout:updateSet')!
    expect(() =>
      update({}, setId, { weight_kg: undefined, reps_actual: 8, rir_actual: 2 })
    ).not.toThrow()
    const row = testDb.prepare('SELECT * FROM exercise_logs WHERE id=?').get([setId]) as Record<string, unknown>
    expect(row.weight_kg).toBeNull()
    expect(row.rir_actual).toBe(2)
  })
})
