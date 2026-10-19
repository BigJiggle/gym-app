// Reproduces a user-induced "dead session" defect in the training plan editor.
//
// SessionEditor lets the user remove exercises one by one (`removeExercise` has no
// minimum guard) and tap Save with ZERO exercises left — the Save button is only
// disabled while saving. `plan:updateSession` then persisted an empty exercises
// array verbatim. The engine and AI paths both guarantee every session carries at
// least one exercise (generateTrainingPlan never emits an empty session — asserted
// by trainingEngine/audit-training tests — and the Claude path filters
// `exercises.length > 0` in planHandlers and showHandlers), so an empty session is
// an invariant violation reachable ONLY through this editor seam.
//
// A persisted empty session renders an enabled "▶ Start Workout" button that opens
// a WorkoutSession which can never be completed (canComplete is always false with
// no sets) and whose progress bar divides by zero (doneCount / 0 → NaN% width) — a
// dead, uncompletable workout the user can only abandon.
//
// Fix: `plan:updateSession` rejects a save that would leave the session with no
// exercises (mirrors the AI-path `exercises.length > 0` invariant), leaving the
// previously-stored exercises intact. Exercises the REAL handler against an
// in-memory node-sqlite3-wasm database.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Database } from 'node-sqlite3-wasm'
import { SCHEMA_SQL, MIGRATIONS } from '../../electron/database/schema'

let testDb: Database
vi.mock('../../electron/database/db', () => ({
  getDb: () => testDb,
  namedParams: (obj: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(obj).map(([k, v]) => [`@${k}`, v ?? null])),
}))

// Stub the Claude service — planHandlers destructures these at import time.
vi.mock('../../electron/services/claudeService', () => ({
  generateDietWithClaude: vi.fn(),
  generateWorkoutWithClaude: vi.fn(),
  refineDietPlan: vi.fn(),
  refineWorkoutWithClaude: vi.fn(),
  processAIRequest: vi.fn(),
  refineWorkoutForSafety: vi.fn(),
}))

import { registerPlanHandlers } from '../../electron/ipc/planHandlers'

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
  registerPlanHandlers(fakeIpc as any)
  return handlers
}

const EXERCISE = { name: 'Barbell Bench Press', sets: 4, reps: '8-12', rir: 2 }

function seedSession(): number {
  testDb.prepare(
    `INSERT INTO users (id, name, age, sex, height_cm, weight_kg, goal) VALUES (1, 'A', 30, 'male', 180, 85, 'cut')`
  ).run([])
  testDb.prepare(
    `INSERT INTO training_plans (id, user_id, name, weeks_total, phase) VALUES (1, 1, 'Plan', 12, 'hypertrophy')`
  ).run([])
  const res = testDb.prepare(
    `INSERT INTO training_sessions (plan_id, week_number, day_of_week, session_name, exercises) VALUES (1, 1, 1, 'Push', ?)`
  ).run([JSON.stringify([EXERCISE])])
  return res.lastInsertRowid as number
}

describe('plan:updateSession rejects an empty session', () => {
  let handlers: Map<string, Handler>
  let sessionId: number

  beforeEach(() => {
    testDb = buildDb()
    handlers = collectHandlers()
    sessionId = seedSession()
  })

  it('persists a non-empty exercise list (normal edit path unchanged)', () => {
    const updated = [EXERCISE, { name: 'Incline Dumbbell Press', sets: 3, reps: '10-12', rir: 2 }]
    const row = handlers.get('plan:updateSession')!(null, sessionId, updated)
    expect(row.exercises).toHaveLength(2)
    const stored = testDb.prepare('SELECT exercises FROM training_sessions WHERE id=?').get(sessionId) as { exercises: string }
    expect(JSON.parse(stored.exercises)).toHaveLength(2)
  })

  it('throws on an empty exercise list and leaves the stored exercises intact', () => {
    expect(() => handlers.get('plan:updateSession')!(null, sessionId, [])).toThrow()
    // The previously-stored exercise must survive — a rejected save must not wipe it.
    const stored = testDb.prepare('SELECT exercises FROM training_sessions WHERE id=?').get(sessionId) as { exercises: string }
    expect(JSON.parse(stored.exercises)).toHaveLength(1)
    expect(JSON.parse(stored.exercises)[0].name).toBe('Barbell Bench Press')
  })

  it('throws on a non-array payload (renderer bug guard)', () => {
    expect(() => handlers.get('plan:updateSession')!(null, sessionId, null as any)).toThrow()
    const stored = testDb.prepare('SELECT exercises FROM training_sessions WHERE id=?').get(sessionId) as { exercises: string }
    expect(JSON.parse(stored.exercises)).toHaveLength(1)
  })
})
