// Reproduces a reachable renderer crash in the AI Assistant diet-refine path:
// `plan:applyAIRequest` with a request Claude classifies as `refine_diet`.
//
// refineDietPlan() guarantees its returned `meals` is a NON-EMPTY ARRAY, but it
// does NOT validate each entry — it passes the model's objects through verbatim.
// A model can omit `foods` on an entry, return `foods` as a non-array, or send
// non-finite numeric fields. The handler used to persist that blob RAW
// (`JSON.stringify(r.meals)`), after which the Diet page / NextMealWidget read
// `meal.foods.map(...)` / `meal.foods.length` with no error boundary → white
// screen, and a non-finite macro could propagate NaN into every adherence calc.
//
// The sibling handler plan:refineDietWithPrompt was already hardened to run the
// model meals through normalizeMeals before storing; this one was not. Fix:
// apply the identical guard here.
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

const refineDietPlanMock = vi.fn()
const processAIRequestMock = vi.fn()
vi.mock('../../electron/services/claudeService', () => ({
  refineDietPlan: (...args: unknown[]) => refineDietPlanMock(...args),
  processAIRequest: (...args: unknown[]) => processAIRequestMock(...args),
  generateDietWithClaude: vi.fn(),
  generateWorkoutWithClaude: vi.fn(),
  refineWorkoutWithClaude: vi.fn(),
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

const mkMeal = (i: number) => ({ name: `Meal ${i}`, time: '12:00', calories: 500, protein_g: 40, carbs_g: 40, fat_g: 15, foods: [`food ${i}`] })

describe('plan:applyAIRequest (refine_diet) — malformed model meals are normalized before storing', () => {
  let handlers: Map<string, Handler>
  const USER = 1

  beforeEach(() => {
    testDb = buildDb()
    refineDietPlanMock.mockReset()
    processAIRequestMock.mockReset()
    testDb.prepare(
      `INSERT INTO users (id, name, age, sex, height_cm, weight_kg, goal, meal_count)
       VALUES (?, 'Test', 30, 'male', 180, 85, 'cut', 3)`
    ).run([USER])
    const meals3 = Array.from({ length: 3 }, (_, i) => mkMeal(i))
    testDb.prepare(
      `INSERT INTO diet_plans (id, user_id, name, calories_target, protein_g, carbs_g, fat_g, meal_count, meals, phase)
       VALUES (1, ?, 'Plan', 3000, 240, 240, 90, 3, ?, 'deficit')`
    ).run([USER, JSON.stringify(meals3)])
    testDb.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('claude_api_key', 'test-key')`).run([])

    processAIRequestMock.mockResolvedValue({ action: 'refine_diet', message: 'Swapped your foods.' })
  })

  it('coerces entries with missing/non-array foods and non-finite macros into a safe shape', async () => {
    handlers = collectHandlers()
    // refineDietPlan returns a non-empty array (its own guard), but entries are
    // malformed the way an LLM can realistically emit: one omits `foods`, one has
    // `foods` as a string, one has a NaN calorie field.
    refineDietPlanMock.mockResolvedValue({
      meals: [
        { name: 'Breakfast', time: '07:00', calories: 500, protein_g: 40, carbs_g: 40, fat_g: 15 }, // no `foods`
        { name: 'Lunch', time: '13:00', calories: 600, protein_g: 45, carbs_g: 50, fat_g: 18, foods: 'chicken and rice' }, // non-array foods
        { name: 'Dinner', time: '20:00', calories: Number.NaN, protein_g: 50, carbs_g: 55, fat_g: 20, foods: ['salmon', 42, 'rice'] }, // NaN cal + mixed foods
      ],
    })

    const res = await handlers.get('plan:applyAIRequest')!({}, USER, 'swap my foods', 'diet')

    expect((res as any).action).toBe('update')
    const meals = (res as any).dietPlan.meals as Array<Record<string, unknown>>
    expect(meals.length).toBe(3)
    for (const m of meals) {
      // Every meal has a real string[] `foods` — the Diet page's meal.foods.map won't throw.
      expect(Array.isArray(m.foods)).toBe(true)
      for (const f of m.foods as unknown[]) expect(typeof f).toBe('string')
      // All numeric fields are finite — no NaN leaks into adherence math.
      expect(Number.isFinite(m.calories as number)).toBe(true)
      expect(Number.isFinite(m.protein_g as number)).toBe(true)
      expect(Number.isFinite(m.carbs_g as number)).toBe(true)
      expect(Number.isFinite(m.fat_g as number)).toBe(true)
    }
    // The mixed foods array drops the non-string element.
    expect(meals[2].foods).toEqual(['salmon', 'rice'])

    // The persisted row is also safe (not just the returned value).
    const stored = JSON.parse((testDb.prepare('SELECT meals FROM diet_plans WHERE id=1').get([]) as { meals: string }).meals)
    for (const m of stored) expect(Array.isArray(m.foods)).toBe(true)
  })

  it('leaves the plan untouched and explains when the model meals normalize to empty', async () => {
    handlers = collectHandlers()
    // Every entry is a non-object → normalizeMeals returns [].
    refineDietPlanMock.mockResolvedValue({ meals: [null, 'not a meal', 42] })

    const res = await handlers.get('plan:applyAIRequest')!({}, USER, 'swap my foods', 'diet')

    expect((res as any).action).toBe('explain')
    // Original 3-meal plan is preserved.
    const row = testDb.prepare('SELECT meal_count, meals FROM diet_plans WHERE id=1').get([]) as { meal_count: number; meals: string }
    expect(row.meal_count).toBe(3)
    expect(JSON.parse(row.meals).length).toBe(3)
  })
})
