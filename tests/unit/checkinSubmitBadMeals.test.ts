// Reproduces a DB↔UI desync / missing-normalize gap in the adaptive-nutrition path
// of `checkin:submit`.
//
// Every weekly check-in recomputes the diet plan's calorie + macro targets from the
// athlete's latest weigh-in and rescales each meal's per-meal macros in place. The
// handler read the stored `diet_plans.meals` cell with a RAW `JSON.parse(...).map(...)`
// inside a try/catch — the LAST diet read-and-recompute seam that did NOT go through
// `normalizeMeals` (as its siblings `plan:getDiet`, `plan:recalculateMacros`,
// `plan:swapMeal` and `plan:reorderMeals` all now do).
//
// `normalizeMeals`' own contract documents that the `meals` cell is a reachable
// corruption surface: "SQLite is dynamically typed and the DB file is user-accessible,
// so a corrupt / hand-edited / legacy cell can hold … a null/non-object … meal entry".
// A legacy / pre-sanitize / AI-verbatim row can carry a droppable `null` entry that
// `plan:getDiet` (the renderer's source) FILTERS OUT via `normalizeMeals`.
//
// With the raw parse, `existingMeals.map((m) => m.calories …)` throws
// "Cannot read properties of null (reading 'calories')" on that null entry. The
// try/catch swallows it, so the handler writes the ORIGINAL, UNSCALED meals back
// (null entry and all) while STILL advancing the plan header
// (calories_target/protein_g/carbs_g/fat_g). Result: the plan header reflects the
// new weigh-in but the meal cards keep their stale per-meal macros — and the Diet
// page (which normalizes, dropping the null) then renders meals that no longer sum
// to the stored targets. A DB↔UI desync that never self-heals.
//
// Fix: read the cell through `normalizeMeals` (exactly like `plan:getDiet`), so the
// null is filtered BEFORE the map — the real meals are scaled, the row is written
// back consistent with the new targets, and the corrupt entry is healed away. For a
// VALID meals array `normalizeMeals` is a shape-preserving no-op.
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

import { registerCheckinHandlers } from '../../electron/ipc/checkinHandlers'

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
  registerCheckinHandlers(fakeIpc as any)
  return handlers
}

const mkMeal = (i: number) => ({ name: `Meal ${i}`, time: '12:00', calories: 500, protein_g: 40, carbs_g: 40, fat_g: 15, foods: [`food ${i}`] })

const submitData = (overrides: Record<string, unknown> = {}) => ({
  user_id: 1,
  weight_kg: 85,
  training_adherence: 100,
  diet_adherence: 100,
  energy_level: 3,
  sleep_quality: 3,
  stress_level: 3,
  notes: '',
  check_in_date: '2026-01-15',
  ...overrides,
})

describe('checkin:submit — tolerates / heals a droppable meal entry in the diet plan', () => {
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

  it('heals a null meal entry out of the stored cell instead of writing it back unscaled', () => {
    // A legacy/corrupt cell with a droppable null entry between two real meals.
    const meals = [mkMeal(0), null, mkMeal(1)]
    testDb.prepare(
      `INSERT INTO diet_plans (id, user_id, name, calories_target, protein_g, carbs_g, fat_g, meal_count, meals, phase)
       VALUES (1, ?, 'Plan', 2000, 100, 200, 60, 3, ?, 'deficit')`
    ).run([USER, JSON.stringify(meals)])

    expect(() => handlers.get('checkin:submit')!({}, submitData())).not.toThrow()

    const row = testDb.prepare('SELECT calories_target, protein_g, meals FROM diet_plans WHERE id=1').get([]) as {
      calories_target: number
      protein_g: number
      meals: string
    }
    const stored = JSON.parse(row.meals) as unknown[]

    // Header always recomputes protein from body weight (85 kg) → 196 g.
    expect(row.protein_g).toBe(Math.round(85 * 2.3))

    // Pre-fix: the map throws on the null entry, the catch keeps the ORIGINAL cell,
    // so the null survives and the real meals keep their stale per-meal macros while
    // the header advanced — a desync that never heals. Post-fix the null is filtered
    // and the surviving meals are rescaled and written back.
    expect(stored.every((m) => m !== null && typeof m === 'object')).toBe(true)
    expect(stored).toHaveLength(2)
    for (const m of stored as Array<Record<string, number>>) {
      expect(Number.isFinite(m.calories)).toBe(true)
      expect(Number.isFinite(m.protein_g)).toBe(true)
      expect(Number.isFinite(m.carbs_g)).toBe(true)
      expect(Number.isFinite(m.fat_g)).toBe(true)
    }
  })

  it('still scales a VALID 3-meal plan in place (shape-preserving no-op on the read)', () => {
    const meals = Array.from({ length: 3 }, (_, i) => mkMeal(i))
    testDb.prepare(
      `INSERT INTO diet_plans (id, user_id, name, calories_target, protein_g, carbs_g, fat_g, meal_count, meals, phase)
       VALUES (1, ?, 'Plan', 2000, 100, 200, 60, 3, ?, 'deficit')`
    ).run([USER, JSON.stringify(meals)])

    handlers.get('checkin:submit')!({}, submitData())

    const row = testDb.prepare('SELECT meals FROM diet_plans WHERE id=1').get([]) as { meals: string }
    const stored = JSON.parse(row.meals) as Array<Record<string, unknown>>
    expect(stored).toHaveLength(3)
    expect(stored[0].name).toBe('Meal 0')
    expect(stored[0].foods).toEqual(['food 0'])
    for (const m of stored) {
      expect(Number.isFinite(m.protein_g as number)).toBe(true)
    }
  })
})
