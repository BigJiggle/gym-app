// Reproduces a DB↔UI desync in the manual macro-recalc path (`plan:recalculateMacros`).
//
// The "⟳ Recalculate Macros" button on the Diet page recomputes protein/carbs/fat from
// the athlete's current body weight while keeping their meal structure. A legacy /
// pre-sanitize diet_plans row can carry calories_target=0. The handler floors that to
// MIN_CALORIE_TARGET (1200) *locally* for the ratio math (so meals don't go NaN), and
// its comment claims it "self-heals such a row to a valid target on recalculation" — but
// the UPDATE only wrote protein_g/carbs_g/fat_g/meals, never calories_target. So the row
// kept calories_target=0 while the recomputed macros reflected a 1200-kcal plan: the Diet
// page then shows a "0 kcal" daily target next to non-zero protein/carbs/fat, and every
// calorie-scaling consumer keeps dividing by a stored 0.
//
// The sibling check-in adaptive recalc (`checkin:submit`) already writes calories_target
// back after flooring. Fix: recalculateMacros writes the floored `calories` too, so the
// row is genuinely self-healed and stays internally consistent.
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

describe('plan:recalculateMacros — self-heals a legacy calories_target=0 row', () => {
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

  it('writes a valid calories_target (>= MIN) when the stored target was 0', () => {
    // Legacy/pre-sanitize row: calories_target=0, real meals present.
    const meals = Array.from({ length: 3 }, (_, i) => mkMeal(i))
    testDb.prepare(
      `INSERT INTO diet_plans (id, user_id, name, calories_target, protein_g, carbs_g, fat_g, meal_count, meals, phase)
       VALUES (1, ?, 'Plan', 0, 0, 0, 0, 3, ?, 'deficit')`
    ).run([USER, JSON.stringify(meals)])

    const saved = handlers.get('plan:recalculateMacros')!({}, USER)

    // Returned + stored calorie target is healed to the floor, not left at 0.
    expect((saved as any).calories_target).toBeGreaterThanOrEqual(MIN_CALORIE_TARGET)
    const row = testDb.prepare('SELECT calories_target, protein_g FROM diet_plans WHERE id=1').get([]) as { calories_target: number; protein_g: number }
    expect(row.calories_target).toBeGreaterThanOrEqual(MIN_CALORIE_TARGET)

    // Macros derived from body weight (85 kg) must be internally consistent with the
    // now-non-zero target: protein = round(85*2.3) = 196.
    expect(row.protein_g).toBe(Math.round(85 * 2.3))
  })

  it('leaves a valid calories_target unchanged for a normal plan', () => {
    const meals = Array.from({ length: 3 }, (_, i) => mkMeal(i))
    testDb.prepare(
      `INSERT INTO diet_plans (id, user_id, name, calories_target, protein_g, carbs_g, fat_g, meal_count, meals, phase)
       VALUES (1, ?, 'Plan', 2400, 196, 200, 76, 3, ?, 'deficit')`
    ).run([USER, JSON.stringify(meals)])

    handlers.get('plan:recalculateMacros')!({}, USER)

    const row = testDb.prepare('SELECT calories_target FROM diet_plans WHERE id=1').get([]) as { calories_target: number }
    expect(row.calories_target).toBe(2400)
  })
})
