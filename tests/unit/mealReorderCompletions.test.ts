// Reproduces the "reordering meals desyncs meal completions" bug. Meal
// completions are keyed by POSITIONAL meal_index, but plan:reorderMeals stored
// the reordered meals array without remapping existing completions. So after a
// user marked a meal eaten today and then dragged a snack past it, the stored
// completion still pointed at the old index — which now belongs to a DIFFERENT
// meal. Result: the wrong meal shows the "eaten" ✓ and its macros are counted
// toward Today's Intake / the weekly tab, while the meal actually eaten shows as
// not eaten (a DB↔UI desync that persists across reloads).
//
// The fix remaps today/future completions through the reorder permutation so
// each completion follows ITS meal to the meal's new position.
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
  registerPlanHandlers({ handle: (c: string, fn: Handler) => handlers.set(c, fn) } as any)
  return handlers
}

const today = () => new Date().toLocaleDateString('en-CA')

// Four meals in positional order; each has a distinct time so the reorder is a
// true permutation the handler can recover.
const MEALS = [
  { name: 'Breakfast', time: '08:00', calories: 500, protein_g: 40, carbs_g: 50, fat_g: 15, foods: ['Eggs'] },
  { name: 'Lunch', time: '12:00', calories: 700, protein_g: 55, carbs_g: 70, fat_g: 20, foods: ['Chicken', 'Rice'] },
  { name: 'Dinner', time: '18:00', calories: 800, protein_g: 60, carbs_g: 75, fat_g: 25, foods: ['Beef', 'Potato'] },
  { name: 'Snack 1', time: '15:00', calories: 200, protein_g: 20, carbs_g: 15, fat_g: 8, foods: ['Yogurt'] },
]

describe('plan:reorderMeals — meal completions follow their meal to the new index', () => {
  let handlers: Map<string, Handler>
  const USER = 1

  beforeEach(() => {
    testDb = buildDb()
    testDb.prepare(
      `INSERT INTO users (id, name, age, sex, height_cm, weight_kg, goal)
       VALUES (?, 'Test', 30, 'male', 180, 85, 'cut')`
    ).run([USER])
    testDb.prepare(
      `INSERT INTO diet_plans (user_id, name, calories_target, protein_g, carbs_g, fat_g, meal_count, meals)
       VALUES (?, 'Plan', 2200, 175, 210, 68, 4, ?)`
    ).run([USER, JSON.stringify(MEALS)])
    // The user marked Lunch (index 1) eaten today.
    testDb.prepare(
      `INSERT INTO meal_completions (user_id, date, meal_index, meal_name, completed)
       VALUES (?, ?, 1, 'Lunch', 1)`
    ).run([USER, today()])
    handlers = collectHandlers()
  })

  it('remaps the eaten mark when a snack is dragged in front of the eaten meal', () => {
    // Drag Snack 1 (old index 3) to the front → [Snack 1, Breakfast, Lunch, Dinner].
    // Lunch moves from index 1 to index 2.
    const reordered = [MEALS[3], MEALS[0], MEALS[1], MEALS[2]]
    handlers.get('plan:reorderMeals')!(null, USER, reordered)

    const rows = testDb
      .prepare('SELECT meal_index, meal_name FROM meal_completions WHERE user_id=? AND date=?')
      .all([USER, today()]) as { meal_index: number; meal_name: string }[]

    // Exactly one completion, still for Lunch, now pointing at Lunch's new slot (2).
    expect(rows).toHaveLength(1)
    expect(rows[0].meal_name).toBe('Lunch')
    expect(rows[0].meal_index).toBe(2)

    // And index 2 in the stored plan is indeed Lunch — no desync.
    const plan = testDb.prepare('SELECT meals FROM diet_plans WHERE user_id=? ORDER BY id DESC LIMIT 1').get([USER]) as { meals: string }
    const storedMeals = JSON.parse(plan.meals) as { name: string }[]
    expect(storedMeals[rows[0].meal_index].name).toBe('Lunch')
  })

  it('leaves the eaten mark untouched when the reorder does not move the eaten meal', () => {
    // Drag Dinner (index 2) to the end → order of Lunch (index 1) is unchanged.
    const reordered = [MEALS[0], MEALS[1], MEALS[3], MEALS[2]]
    handlers.get('plan:reorderMeals')!(null, USER, reordered)

    const rows = testDb
      .prepare('SELECT meal_index, meal_name FROM meal_completions WHERE user_id=? AND date=?')
      .all([USER, today()]) as { meal_index: number; meal_name: string }[]
    expect(rows).toHaveLength(1)
    expect(rows[0].meal_name).toBe('Lunch')
    expect(rows[0].meal_index).toBe(1)
  })

  it('does not touch a past-day completion (history is immutable)', () => {
    // A completion logged yesterday for Breakfast (index 0) must stay at index 0.
    testDb.prepare(
      `INSERT INTO meal_completions (user_id, date, meal_index, meal_name, completed)
       VALUES (?, '2020-01-01', 0, 'Breakfast', 1)`
    ).run([USER])
    const reordered = [MEALS[3], MEALS[0], MEALS[1], MEALS[2]]
    handlers.get('plan:reorderMeals')!(null, USER, reordered)

    const past = testDb
      .prepare('SELECT meal_index, meal_name FROM meal_completions WHERE user_id=? AND date=?')
      .get([USER, '2020-01-01']) as { meal_index: number; meal_name: string }
    expect(past.meal_index).toBe(0)
    expect(past.meal_name).toBe('Breakfast')
  })
})
