// Reproduces a DB↔UI desync in the OTHER AI diet-refine path: the AI Assistant
// (`plan:applyAIRequest`) with a request Claude classifies as `refine_diet`.
//
// This handler calls the same `refineDietPlan` food-swap as `plan:refineDietWithPrompt`,
// but historically only overwrote `meals` — leaving meal_count stale and today's
// high-index meal completions in place. Meal completions are keyed by POSITIONAL
// meal_index, so when the refine shrinks the meal count (6 -> 3), the leftover
// completions at indexes 3-5 keep counting as "meals eaten" (inflating adherence
// above 100% / showing "6/3"), and dietPlan.meal_count stays 6.
//
// The sibling handler plan:refineDietWithPrompt was fixed to persist the new
// meal_count and purge orphaned today/future completions; this handler was not.
// Fix: apply the identical guard here.
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

// Stub the Claude service: processAIRequest routes the request to `refine_diet`,
// and refineDietPlan returns a deterministic shrunk plan (6 meals -> 3) instead of
// hitting the network. Every name planHandlers destructures must exist so
// registration doesn't throw.
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
const today = new Date().toLocaleDateString('en-CA')
const yesterday = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toLocaleDateString('en-CA') })()

describe('plan:applyAIRequest (refine_diet) — orphaned meal completions when the refine shrinks the meal count', () => {
  let handlers: Map<string, Handler>
  const USER = 1

  beforeEach(() => {
    testDb = buildDb()
    refineDietPlanMock.mockReset()
    processAIRequestMock.mockReset()
    testDb.prepare(
      `INSERT INTO users (id, name, age, sex, height_cm, weight_kg, goal, meal_count)
       VALUES (?, 'Test', 30, 'male', 180, 85, 'cut', 6)`
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

    // The assistant classifies the request as a food-level diet refine...
    processAIRequestMock.mockResolvedValue({ action: 'refine_diet', message: 'Consolidated your meals.' })
    // ...and the refine returns a 3-meal plan (user asked for fewer meals).
    refineDietPlanMock.mockResolvedValue({ meals: Array.from({ length: 3 }, (_, i) => mkMeal(i)), protein_g: 240, carbs_g: 240, fat_g: 90 })

    handlers = collectHandlers()
  })

  it('persists meal_count = new meals length and purges today/future orphaned completions', async () => {
    const res = await handlers.get('plan:applyAIRequest')!({}, USER, 'combine my 6 meals into 3 bigger ones', 'diet')

    expect((res as any).action).toBe('update')
    expect((res as any).dietPlan.meals.length).toBe(3)
    // Stored meal_count now matches the actual meals array (was left at 6 before the fix).
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

  it('leaves completions untouched when the refine keeps the same meal count', async () => {
    refineDietPlanMock.mockResolvedValue({ meals: Array.from({ length: 6 }, (_, i) => mkMeal(i)), protein_g: 240, carbs_g: 240, fat_g: 90 })
    await handlers.get('plan:applyAIRequest')!({}, USER, 'swap the chicken for fish', 'diet')

    const row = testDb.prepare('SELECT meal_count FROM diet_plans WHERE id=1').get([]) as { meal_count: number }
    expect(row.meal_count).toBe(6)
    const todayCount = (testDb.prepare('SELECT COUNT(*) c FROM meal_completions WHERE user_id=? AND date=?').get([USER, today]) as { c: number }).c
    expect(todayCount).toBe(6)
  })
})
