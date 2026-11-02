// Reproduces an unguarded write seam in the AI-assistant apply path
// (`plan:applyAIRequest`). The Settings "Edit profile" save route clamps
// exercises_per_session (3–12) and sets_per_exercise (2–8) via
// sanitizeUserUpdate's clampExercisesPerSession / clampSetsPerExercise, but the
// AI path writes the users row DIRECTLY and only clamps meal_count / snack_count /
// training_frequency in its NUMERIC_BOUNDS table. So a request the assistant turns
// into a settings change (e.g. "give me 40 working sets per exercise") persists the
// raw value unclamped.
//
// Downstream that is a nonsensical plan + DB↔UI desync: getSets() in the training
// engine honors sets_per_exercise verbatim (compounds get +1) with NO cap unless a
// maxSetsOverride is supplied — which a plain settings change does not carry — so the
// regenerated plan stores 40/41-set exercises. The Training tab renders "41 × …"
// while the live WorkoutSession clamps every set count to 1–20 (clampSetCount), and
// the stored users column is left out of the app's own range for every future
// regeneration. This is the exact hole the Settings clamp closes, reopened on the
// sibling seam.
//
// Exercises the REAL handler against an in-memory node-sqlite3-wasm database; the
// training rebuild uses the real trainingEngine (generateWorkoutWithClaude is stubbed
// to throw so the deterministic rule-based engine runs).
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Database } from 'node-sqlite3-wasm'
import { SCHEMA_SQL, MIGRATIONS } from '../../electron/database/schema'

let testDb: Database
vi.mock('../../electron/database/db', () => ({
  getDb: () => testDb,
  namedParams: (obj: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(obj).map(([k, v]) => [`@${k}`, v ?? null])),
}))

const processAIRequestMock = vi.fn()
vi.mock('../../electron/services/claudeService', () => ({
  refineDietPlan: vi.fn(),
  processAIRequest: (...args: unknown[]) => processAIRequestMock(...args),
  generateDietWithClaude: vi.fn(),
  // Reject so plan regeneration falls back to the real rule-based engine.
  generateWorkoutWithClaude: vi.fn(() => Promise.reject(new Error('no ai'))),
  refineWorkoutWithClaude: vi.fn(),
  refineWorkoutForSafety: vi.fn(),
  generateWorkoutWithClaude2: vi.fn(),
}))

import { registerPlanHandlers } from '../../electron/ipc/planHandlers'

type Handler = (event: unknown, ...args: any[]) => any

function buildDb(): Database {
  const db = new Database(':memory:')
  const run = (sql: string) => {
    for (const stmt of sql.split(';').map((s) => s.trim()).filter(Boolean)) db.prepare(stmt).run([])
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

describe('plan:applyAIRequest — training field clamp (exercises/sets per session)', () => {
  let handlers: Map<string, Handler>
  const USER = 1

  beforeEach(() => {
    testDb = buildDb()
    processAIRequestMock.mockReset()
    testDb.prepare(
      `INSERT INTO users (id, name, age, sex, height_cm, weight_kg, goal, dietary_preference,
        training_frequency, exercises_per_session, sets_per_exercise)
       VALUES (?, 'Test', 30, 'male', 180, 85, 'cut', 'omnivore', 4, 6, 4)`
    ).run([USER])
    testDb.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('claude_api_key', 'test-key')`).run([])
    handlers = collectHandlers()
  })

  it('clamps an out-of-range sets_per_exercise / exercises_per_session before persisting', async () => {
    processAIRequestMock.mockResolvedValue({
      action: 'update',
      message: 'Bumped your working sets.',
      settingChanges: { sets_per_exercise: 40, exercises_per_session: 30 },
      regenerateTraining: false,
    })

    const res = await handlers.get('plan:applyAIRequest')!(
      {}, USER, 'give me 40 working sets per exercise and 30 exercises a session', 'training'
    )

    expect((res as any).action).toBe('update')
    // Stored values are clamped to the app's own ranges (2–8 sets, 3–12 exercises),
    // the same bounds Settings/onboarding/the engine agree on.
    expect((res as any).updatedUser.sets_per_exercise).toBe(8)
    expect((res as any).updatedUser.exercises_per_session).toBe(12)
    const row = testDb.prepare('SELECT sets_per_exercise, exercises_per_session FROM users WHERE id=?')
      .get([USER]) as { sets_per_exercise: number; exercises_per_session: number }
    expect(row.sets_per_exercise).toBe(8)
    expect(row.exercises_per_session).toBe(12)
  })

  it('a regenerated plan never renders a nonsensical set count from the clamped value', async () => {
    processAIRequestMock.mockResolvedValue({
      action: 'update',
      message: 'Rebuilt your training.',
      settingChanges: { sets_per_exercise: 40 },
      regenerateTraining: true,
    })

    const res = await handlers.get('plan:applyAIRequest')!(
      {}, USER, 'give me 40 working sets per exercise', 'training'
    )

    const sessions = (res as any).trainingPlan.sessions as Array<{ exercises: Array<{ sets: number }> }>
    expect(sessions.length).toBeGreaterThan(0)
    // With sets_per_exercise clamped to 8, the engine emits at most 8 (+1 for
    // compounds) = 9 sets — well inside the WorkoutSession 1–20 cap, so no desync.
    const maxSets = Math.max(...sessions.flatMap(s => s.exercises.map(e => e.sets)))
    expect(maxSets).toBeLessThanOrEqual(9)
  })
})
