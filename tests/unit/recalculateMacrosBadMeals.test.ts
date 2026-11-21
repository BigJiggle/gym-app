// Reproduces a crash / missing-error-handling gap in the manual macro-recalc path
// (`plan:recalculateMacros`).
//
// The "⟳ Recalculate Macros" button on the Diet page recomputes protein/carbs/fat
// from the athlete's current body weight while keeping their meal structure. The
// handler read the stored `diet_plans.meals` cell with a RAW `JSON.parse(...).map(...)`
// — the one diet read-and-recompute path that did NOT go through `normalizeMeals`
// (as its sibling read `plan:getDiet` does) or a try/catch (as `checkin:submit`'s
// identical in-place meal scaling does).
//
// `normalizeMeals`' own contract documents that the `meals` cell is a reachable
// corruption surface: "SQLite is dynamically typed and the DB file is user-accessible,
// so a corrupt / hand-edited / legacy cell can hold non-JSON text" or a non-array
// (`{}`, `5`, `"x"`). For such a cell the raw path throws:
//   - non-JSON text  → `JSON.parse` throws SyntaxError
//   - valid-but-non-array (`{}` / `5`) → `JSON.parse` succeeds, then `.map` throws
//     "existingMeals.map is not a function"
// Either way the IPC call rejects; the Diet button's onClick has no catch, so the
// recalc silently fails with no feedback (and never self-heals the row).
//
// Fix: read the cell through `normalizeMeals` (exactly like `plan:getDiet`), which
// returns [] for a corrupt/non-array cell so recalc heals the macros instead of
// throwing. For a VALID meals array `normalizeMeals` is a shape-preserving no-op.
//
// Exercises the REAL handler against an in-memory node-sqlite3-wasm database.
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
  refineDietPlan: vi.fn(),
  generateDietWithClaude: vi.fn(),
  generateWorkoutWithClaude: vi.fn(),
  refineWorkoutWithClaude: vi.fn(),
  processAIRequest: vi.fn(),
  refineWorkoutForSafety: vi.fn(),
}))

import { registerPlanHandlers } from '../../electron/ipc/planHandlers'
import { MIN_CALORIE_TARGET } from '../../electron/services/nutritionEngine'

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

const mkMeal = (i: number) => ({ name: `Meal ${i}`, time: '12:00', calories: 500, protein_g: 40, carbs_g: 40, fat_g: 15, foods: [`food ${i}`] })

describe('plan:recalculateMacros — tolerates a corrupt / non-array meals cell', () => {
  let handlers: Map<string, Handler>
  const USER = 1

  beforeEach(() => {
    testDb = buildDb()
    testDb.prepare(
      `INSERT INTO users (id, name, age, sex, height_cm, weight_kg, goal, meal_count)
       VALUES (?, 'Test', 30, 'male', 180, 85, 'cut', 3)`
    ).run([USER])
    handlers = collectHandlers()
  })

  it('does not throw on non-JSON meals text; heals macros from body weight', () => {
    testDb.prepare(
      `INSERT INTO diet_plans (id, user_id, name, calories_target, protein_g, carbs_g, fat_g, meal_count, meals, phase)
       VALUES (1, ?, 'Plan', 2400, 196, 200, 76, 3, 'not valid json', 'deficit')`
    ).run([USER])

    let saved: any
    expect(() => { saved = handlers.get('plan:recalculateMacros')!({}, USER) }).not.toThrow()
    // Macros still derived from body weight (85 kg) → protein = round(85*2.3) = 196.
    expect(saved.protein_g).toBe(Math.round(85 * 2.3))
    const row = testDb.prepare('SELECT calories_target, protein_g FROM diet_plans WHERE id=1').get([]) as { calories_target: number; protein_g: number }
    expect(row.calories_target).toBeGreaterThanOrEqual(MIN_CALORIE_TARGET)
    expect(row.protein_g).toBe(Math.round(85 * 2.3))
  })

  it('does not throw on a valid-JSON-but-non-array meals cell ({})', () => {
    testDb.prepare(
      `INSERT INTO diet_plans (id, user_id, name, calories_target, protein_g, carbs_g, fat_g, meal_count, meals, phase)
       VALUES (1, ?, 'Plan', 2400, 196, 200, 76, 3, '{}', 'deficit')`
    ).run([USER])

    expect(() => handlers.get('plan:recalculateMacros')!({}, USER)).not.toThrow()
  })

  it('preserves a VALID meals array (shape-preserving no-op) and recomputes per-meal macros', () => {
    const meals = Array.from({ length: 3 }, (_, i) => mkMeal(i))
    testDb.prepare(
      `INSERT INTO diet_plans (id, user_id, name, calories_target, protein_g, carbs_g, fat_g, meal_count, meals, phase)
       VALUES (1, ?, 'Plan', 2400, 196, 200, 76, 3, ?, 'deficit')`
    ).run([USER, JSON.stringify(meals)])

    const saved = handlers.get('plan:recalculateMacros')!({}, USER) as any
    expect(Array.isArray(saved.meals)).toBe(true)
    expect(saved.meals).toHaveLength(3)
    // Names / foods / calories preserved; macros recomputed from the per-meal calorie share.
    expect(saved.meals[0].name).toBe('Meal 0')
    expect(saved.meals[0].calories).toBe(500)
    expect(saved.meals[0].foods).toEqual(['food 0'])
    expect(Number.isFinite(saved.meals[0].protein_g)).toBe(true)
  })
})
