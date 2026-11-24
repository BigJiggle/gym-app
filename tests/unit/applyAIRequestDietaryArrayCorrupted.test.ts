// Reproduces an unguarded read seam in the AI-assistant apply path
// (`plan:applyAIRequest`). When the assistant turns a request into an ADDITIVE
// change to one of the user's JSON-array columns (dietary_restrictions /
// food_exclusions / food_preferences) — e.g. "I'm now shellfish-free" →
// { dietary_restrictions_add: ['Shellfish'] } — the handler merges the new
// item into the EXISTING stored array. It read that existing cell with a RAW
// `JSON.parse((existing[k] as string) ?? '[]')`.
//
// Those exact columns are the ones `safeJsonArray` (userHandlers) was created
// to tolerate: a legacy / hand-edited / corrupt cell can hold a bare token
// (`Dairy-free` instead of `["Dairy-free"]`) or valid-JSON-of-the-wrong-shape
// (`5`). The SAME handler already reads these columns defensively 10 lines
// earlier when building the AI context (try/catch → []), but the merge/write
// path did not — so:
//   • a non-JSON cell makes `JSON.parse` THROW, rejecting the whole AI request
//     with an opaque SyntaxError (the assistant can no longer adjust that user's
//     diet at all until the cell is hand-repaired);
//   • a valid-but-non-array cell (`5`) survives the parse, then the
//     `[...current, ...toAdd]` spread throws "current is not iterable".
// Either way an in-scope corruption surface the rest of the app degrades
// gracefully instead crashes a real user-facing feature.
//
// Exercises the REAL handler against an in-memory node-sqlite3-wasm database;
// processAIRequest is stubbed to return the settings change directly.
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

describe('plan:applyAIRequest — corrupt dietary JSON-array cell on additive change', () => {
  let handlers: Map<string, Handler>
  const USER = 1

  beforeEach(() => {
    testDb = buildDb()
    processAIRequestMock.mockReset()
    testDb.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('claude_api_key', 'test-key')`).run([])
    handlers = collectHandlers()
  })

  function insertUser(dietaryRestrictions: string) {
    // Raw INSERT writes the (deliberately corrupt) cell verbatim, mimicking a
    // legacy / hand-edited row that never went through user:create's JSON.stringify.
    testDb.prepare(
      `INSERT INTO users (id, name, age, sex, height_cm, weight_kg, goal, dietary_preference,
        training_frequency, dietary_restrictions)
       VALUES (?, 'Test', 30, 'male', 180, 85, 'cut', 'omnivore', 4, ?)`
    ).run([USER, dietaryRestrictions])
  }

  it('full-replaces onto a bare-token (non-JSON) cell without throwing', async () => {
    insertUser('Dairy-free') // not JSON — the unconditional raw JSON.parse throws
    processAIRequestMock.mockResolvedValue({
      action: 'update',
      message: "Noted — set your restrictions.",
      // Base column key present → the JSON_ARRAY_COLS merge branch runs and reads
      // the existing cell. Even a plain full-replace reaches that read.
      settingChanges: { dietary_restrictions: ['Shellfish'] },
      regenerateDiet: false,
      regenerateTraining: false,
    })

    const res = await handlers.get('plan:applyAIRequest')!(
      {}, USER, "I'm shellfish-free now", 'diet'
    )

    expect((res as any).action).toBe('update')
    const row = testDb.prepare('SELECT dietary_restrictions FROM users WHERE id=?')
      .get([USER]) as { dietary_restrictions: string }
    // The replacement array is persisted as well-formed JSON; the corrupt prior
    // value no longer aborts the whole request.
    expect(JSON.parse(row.dietary_restrictions)).toEqual(['Shellfish'])
  })

  it('merges an additive change into a valid-JSON-but-non-array cell without throwing on the spread', async () => {
    insertUser('5') // valid JSON, wrong shape — the [...current] spread throws
    processAIRequestMock.mockResolvedValue({
      action: 'update',
      message: 'Added.',
      // Base key + _add → the merge spreads the existing value into a new Set.
      settingChanges: { dietary_restrictions: [], dietary_restrictions_add: ['Peanuts'] },
      regenerateDiet: false,
      regenerateTraining: false,
    })

    const res = await handlers.get('plan:applyAIRequest')!(
      {}, USER, 'add peanuts to my restrictions', 'diet'
    )

    expect((res as any).action).toBe('update')
    const row = testDb.prepare('SELECT dietary_restrictions FROM users WHERE id=?')
      .get([USER]) as { dietary_restrictions: string }
    // Corrupt prior value degrades to [] (the app-wide contract for these cells),
    // then the added item is persisted.
    expect(JSON.parse(row.dietary_restrictions)).toEqual(['Peanuts'])
  })

  it('still merges additively into a well-formed array cell (unchanged behavior)', async () => {
    insertUser('["Dairy-free"]')
    processAIRequestMock.mockResolvedValue({
      action: 'update',
      message: 'Added.',
      settingChanges: { dietary_restrictions: ['Dairy-free'], dietary_restrictions_add: ['Shellfish'] },
      regenerateDiet: false,
      regenerateTraining: false,
    })

    await handlers.get('plan:applyAIRequest')!({}, USER, 'add shellfish', 'diet')

    const row = testDb.prepare('SELECT dietary_restrictions FROM users WHERE id=?')
      .get([USER]) as { dietary_restrictions: string }
    expect(JSON.parse(row.dietary_restrictions)).toEqual(['Dairy-free', 'Shellfish'])
  })
})
