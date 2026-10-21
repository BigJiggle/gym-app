// Reproduces a DB↔UI desync in the THIRD AI diet path: the AI Assistant
// (`plan:applyAIRequest`) with a request Claude classifies as a settings change that
// sets `regenerateDiet: true` (e.g. "give me 3 meals a day instead of 6").
//
// Unlike the food-level `refine_diet` branch and `plan:refineDietWithPrompt` (both
// already fixed), the settings-change `regenerateDiet` branch rebuilt `meals` via
// buildMealsPublic(clampMealCount(meal_count)) but only wrote back meals + macros —
// it left `diet_plans.meal_count` stale and never purged today/future meal
// completions. Meal completions are keyed by POSITIONAL meal_index, so when the regen
// shrinks the count (6 -> 3) the leftover completions at indexes 3-5 keep counting as
// "meals eaten" (WeeklyMealView's completedCountForDay counts ALL completions for a
// date → "6/3 logged", progress > 100%), and dietPlan.meal_count stays 6.
//
// Fix: persist meal_count = rebuilt meals length and purge orphaned today/future
// completions, mirroring every other diet-write path.
//
// Exercises the REAL handler against an in-memory node-sqlite3-wasm database; the
// diet rebuild uses the real nutritionEngine (buildMealsPublic is NOT mocked).
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Database } from 'node-sqlite3-wasm'
import { SCHEMA_SQL, MIGRATIONS } from '../../electron/database/schema'

let testDb: Database
vi.mock('../../electron/database/db', () => ({
  getDb: () => testDb,
  namedParams: (obj: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(obj).map(([k, v]) => [`@${k}`, v ?? null])),
}))

// Stub only the Claude service entry point: processAIRequest routes the request to a
// settings change + regenerateDiet. The diet rebuild itself runs through the real
// nutritionEngine. Every name planHandlers destructures must exist so registration
// doesn't throw.
const processAIRequestMock = vi.fn()
vi.mock('../../electron/services/claudeService', () => ({
  refineDietPlan: vi.fn(),
  processAIRequest: (...args: unknown[]) => processAIRequestMock(...args),
  generateDietWithClaude: vi.fn(),
  generateWorkoutWithClaude: vi.fn(),
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

const mkMeal = (i: number) => ({ name: `Meal ${i}`, time: '12:00', calories: 500, protein_g: 40, carbs_g: 40, fat_g: 15, foods: [`food ${i}`] })
const today = new Date().toLocaleDateString('en-CA')
const yesterday = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toLocaleDateString('en-CA') })()

describe('plan:applyAIRequest (regenerateDiet) — orphaned meal completions when a settings change shrinks the meal count', () => {
  let handlers: Map<string, Handler>
  const USER = 1

  beforeEach(() => {
    testDb = buildDb()
    processAIRequestMock.mockReset()
    testDb.prepare(
      `INSERT INTO users (id, name, age, sex, height_cm, weight_kg, goal, dietary_preference, meal_count, snack_count)
       VALUES (?, 'Test', 30, 'male', 180, 85, 'cut', 'omnivore', 6, 0)`
    ).run([USER])
    const meals6 = Array.from({ length: 6 }, (_, i) => mkMeal(i))
    testDb.prepare(
      `INSERT INTO diet_plans (id, user_id, name, calories_target, protein_g, carbs_g, fat_g, meal_count, meals, phase)
       VALUES (1, ?, 'Plan', 3000, 240, 240, 90, 6, ?, 'deficit')`
    ).run([USER, JSON.stringify(meals6)])
    testDb.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('claude_api_key', 'test-key')`).run([])
    for (let i = 0; i < 6; i++) {
      testDb.prepare(
        `INSERT INTO meal_completions (user_id, date, meal_index, meal_name, completed) VALUES (?, ?, ?, ?, 1)`
      ).run([USER, today, i, `Meal ${i}`])
    }
    testDb.prepare(
      `INSERT INTO meal_completions (user_id, date, meal_index, meal_name, completed) VALUES (?, ?, 5, 'Meal 5', 1)`
    ).run([USER, yesterday])

    handlers = collectHandlers()
  })

  it('persists meal_count = rebuilt meals length and purges today/future orphaned completions', async () => {
    // The assistant applies a meal_count change and asks to regenerate the diet.
    processAIRequestMock.mockResolvedValue({
      action: 'update',
      message: 'Switched you to 3 meals a day.',
      settingChanges: { meal_count: 3 },
      regenerateDiet: true,
    })

    const res = await handlers.get('plan:applyAIRequest')!({}, USER, 'give me 3 meals a day instead of 6', 'diet')

    expect((res as any).action).toBe('update')
    // The rebuilt plan has 3 meals (3 mains, 0 snacks).
    expect((res as any).dietPlan.meals.length).toBe(3)
    // Stored meal_count now matches the rebuilt meals array (was left at 6 before the fix).
    expect((res as any).dietPlan.meal_count).toBe(3)
    const row = testDb.prepare('SELECT meal_count FROM diet_plans WHERE id=1').get([]) as { meal_count: number }
    expect(row.meal_count).toBe(3)

    // Today's completions at indexes >= 3 are gone; 0-2 survive.
    const todayIdx = (testDb.prepare('SELECT meal_index FROM meal_completions WHERE user_id=? AND date=? ORDER BY meal_index').all([USER, today]) as Array<{ meal_index: number }>).map(r => r.meal_index)
    expect(todayIdx).toEqual([0, 1, 2])

    // Historical (yesterday) high-index completion is preserved.
    const ydayIdx = (testDb.prepare('SELECT meal_index FROM meal_completions WHERE user_id=? AND date=?').all([USER, yesterday]) as Array<{ meal_index: number }>).map(r => r.meal_index)
    expect(ydayIdx).toEqual([5])
  })

  it('leaves completions untouched when the regen keeps the same meal count', async () => {
    // A settings change that regenerates the diet but does not change the count.
    processAIRequestMock.mockResolvedValue({
      action: 'update',
      message: 'Switched you to quick-prep meals.',
      settingChanges: { cooking_time_pref: 'quick' },
      regenerateDiet: true,
    })

    await handlers.get('plan:applyAIRequest')!({}, USER, 'make my meals quicker to prep', 'diet')

    const row = testDb.prepare('SELECT meal_count FROM diet_plans WHERE id=1').get([]) as { meal_count: number }
    expect(row.meal_count).toBe(6)
    const todayCount = (testDb.prepare('SELECT COUNT(*) c FROM meal_completions WHERE user_id=? AND date=?').get([USER, today]) as { c: number }).c
    expect(todayCount).toBe(6)
  })
})
