// Reproduces a DB↔UI desync in the meal swap + reorder paths (`plan:swapMeal`,
// `plan:reorderMeals`).
//
// Both handlers read the stored `diet_plans.meals` cell with a RAW `JSON.parse` and
// then index into / length-check the parsed array. But the Diet page renders — and
// swap/reorder against — the NORMALIZED meal list that `plan:getDiet` returns
// (`normalizeMeals(meals)`), which FILTERS OUT droppable entries (a `null` / a
// non-object). `normalizeMeals`' own contract documents that the cell is a reachable
// corruption surface: a legacy / pre-sanitize (before the getDiet normalize seam
// existed) / hand-edited row can hold such an entry.
//
// When the raw array carries a droppable entry the two views diverge:
//   - plan:swapMeal — the display index the user tapped maps, in the raw array, to a
//     DIFFERENT meal (or the null), so the swap lands on the wrong meal and the one
//     the user meant is left unchanged.
//   - plan:reorderMeals — `existing.length` (raw, includes the bad entry) exceeds the
//     visible meal count, so a perfectly valid reorder of the displayed cards throws
//     "Meal count mismatch" and is silently reverted.
//
// Fix: read the cell through `normalizeMeals` (exactly like plan:getDiet /
// plan:recalculateMacros), so the backend's meal list agrees with what the Diet page
// shows. Shape-preserving no-op for a valid array.
//
// Exercises the REAL handlers against an in-memory node-sqlite3-wasm database.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Database } from 'node-sqlite3-wasm'
import { SCHEMA_SQL, MIGRATIONS } from '../../electron/database/schema'

let testDb: Database
vi.mock('../../electron/database/db', () => ({
  getDb: () => testDb,
  namedParams: (obj: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(obj).map(([k, v]) => [`@${k}`, v ?? null])),
}))

vi.mock('../../electron/services/claudeService', () => ({
  refineDietPlan: vi.fn(),
  generateDietWithClaude: vi.fn(),
  generateWorkoutWithClaude: vi.fn(),
  refineWorkoutWithClaude: vi.fn(),
  processAIRequest: vi.fn(),
  refineWorkoutForSafety: vi.fn(),
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

// normalizeMeals-stable meal (integer macros, HH:MM time) so round-trips compare equal.
const mkMeal = (name: string, time: string) =>
  ({ name, time, calories: 500, protein_g: 40, carbs_g: 40, fat_g: 15, foods: [`${name} food`] })

function seedPlan(db: Database, userId: number, meals: unknown[]) {
  db.prepare(
    `INSERT INTO diet_plans (id, user_id, name, calories_target, protein_g, carbs_g, fat_g, meal_count, meals, phase)
     VALUES (1, ?, 'Plan', 2400, 196, 200, 76, ?, ?, 'deficit')`
  ).run([userId, meals.length, JSON.stringify(meals)])
}

describe('plan:swapMeal / plan:reorderMeals — tolerate a legacy/corrupt meals cell', () => {
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

  // The visible meals are [Breakfast, Dinner] (the null between them is dropped by
  // normalizeMeals). Swapping visible index 1 must change DINNER's foods.
  it('swapMeal writes to the meal the user actually sees (null entry dropped)', () => {
    seedPlan(testDb, USER, [mkMeal('Breakfast', '08:00'), null, mkMeal('Dinner', '19:00')])

    const saved = handlers.get('plan:swapMeal')!({}, USER, 1, ['swapped food']) as any
    const meals = saved.meals as Array<{ name: string; foods: string[] }>

    const dinner = meals.find((m) => m.name === 'Dinner')
    expect(dinner).toBeDefined()
    // Pre-fix: index 1 hit the null (revived as a junk "Meal"), Dinner kept its
    // original foods → this fails.
    expect(dinner!.foods).toEqual(['swapped food'])
    // Breakfast untouched; no junk/placeholder meal revived from the null.
    expect(meals.find((m) => m.name === 'Breakfast')!.foods).toEqual(['Breakfast food'])
    expect(meals).toHaveLength(2)
  })

  // A valid reorder of the two visible cards must not be rejected by a stale raw count.
  it('reorderMeals accepts a valid reorder of the visible cards (null entry dropped)', () => {
    seedPlan(testDb, USER, [mkMeal('Breakfast', '08:00'), null, mkMeal('Dinner', '19:00')])

    // The renderer holds the NORMALIZED list [Breakfast, Dinner] and sends it reordered.
    const reordered = [mkMeal('Dinner', '19:00'), mkMeal('Breakfast', '08:00')]
    let saved: any
    // Pre-fix: existing.length (3, raw) !== 2 → throws "Meal count mismatch".
    expect(() => { saved = handlers.get('plan:reorderMeals')!({}, USER, reordered) }).not.toThrow()
    const names = (saved.meals as Array<{ name: string }>).map((m) => m.name)
    expect(names).toEqual(['Dinner', 'Breakfast'])
  })

  // Regression guard: a clean plan still swaps/reorders exactly as before.
  it('is a no-op shape-wise for a valid meals array', () => {
    seedPlan(testDb, USER, [mkMeal('Breakfast', '08:00'), mkMeal('Lunch', '13:00'), mkMeal('Dinner', '19:00')])

    const swapped = handlers.get('plan:swapMeal')!({}, USER, 0, ['oats']) as any
    expect(swapped.meals).toHaveLength(3)
    expect(swapped.meals[0].name).toBe('Breakfast')
    expect(swapped.meals[0].foods).toEqual(['oats'])
    expect(swapped.meals[2].name).toBe('Dinner')

    const reordered = [mkMeal('Dinner', '19:00'), mkMeal('Breakfast', '08:00'), mkMeal('Lunch', '13:00')]
    // Re-seed to a known clean state then reorder.
    testDb.prepare('DELETE FROM diet_plans WHERE id=1').run([])
    seedPlan(testDb, USER, [mkMeal('Breakfast', '08:00'), mkMeal('Lunch', '13:00'), mkMeal('Dinner', '19:00')])
    const saved = handlers.get('plan:reorderMeals')!({}, USER, reordered) as any
    expect((saved.meals as Array<{ name: string }>).map((m) => m.name)).toEqual(['Dinner', 'Breakfast', 'Lunch'])
  })
})
