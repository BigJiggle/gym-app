// Reproduces a backend defect in the AI diet-refine path (`plan:refineDietWithPrompt`).
//
// The handler persisted the model's top-level macro targets with
//   `r.protein_g ?? currentPlan.protein_g` (same for carbs_g / fat_g).
// `??` only falls back on null/undefined, so a model that returns protein_g / carbs_g /
// fat_g as 0 — or a negative / non-finite / string value — persists it VERBATIM as the
// stored macro target. A 0-gram protein/fat target is both nonsensical and dangerous: the
// Diet page then shows the athlete a "0g" goal and the macro-adherence widgets read back
// "0% of goal" even after they log protein. The sibling write seam (`plan:generateDiet`)
// already routes the identical model fields through `sanitizeMacroGrams`; the refine seam
// did not — the gap the 2026-10-23 run flagged as a lead.
//
// Fix: route r.protein_g / r.carbs_g / r.fat_g through sanitizeMacroGrams (model value →
// summed per-meal grams → previous plan's valid target), mirroring plan:generateDiet, so a
// 0 / negative / non-finite model macro can never persist as the stored target.
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
vi.mock('../../electron/services/claudeService', () => ({
  refineDietPlan: (...args: unknown[]) => refineDietPlanMock(...args),
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

// 3 meals: protein sums to 120, carbs to 120, fat to 45.
const mkMeal = (i: number) => ({ name: `Meal ${i}`, time: '12:00', calories: 500, protein_g: 40, carbs_g: 40, fat_g: 15, foods: [`food ${i}`] })

describe('plan:refineDietWithPrompt — macro sanitization at the write seam', () => {
  let handlers: Map<string, Handler>
  const USER = 1

  beforeEach(() => {
    testDb = buildDb()
    refineDietPlanMock.mockReset()
    testDb.prepare(
      `INSERT INTO users (id, name, age, sex, height_cm, weight_kg, goal, meal_count)
       VALUES (?, 'Test', 30, 'male', 180, 85, 'cut', 3)`
    ).run([USER])
    testDb.prepare(
      `INSERT INTO diet_plans (id, user_id, name, calories_target, protein_g, carbs_g, fat_g, meal_count, meals, phase)
       VALUES (1, ?, 'Plan', 3000, 240, 240, 90, 3, ?, 'deficit')`
    ).run([USER, JSON.stringify(Array.from({ length: 3 }, (_, i) => mkMeal(i)))])
    testDb.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('claude_api_key', 'test-key')`).run([])
    handlers = collectHandlers()
  })

  it('does not persist a 0-gram macro target the model returned — falls back to summed per-meal grams', async () => {
    // Model returns valid meals but 0 for every top-level macro (the `??` hole).
    refineDietPlanMock.mockResolvedValue({
      meals: Array.from({ length: 3 }, (_, i) => mkMeal(i)),
      protein_g: 0, carbs_g: 0, fat_g: 0,
    })
    const saved = await handlers.get('plan:refineDietWithPrompt')!({}, USER, 'swap the chicken for fish')

    // Must NOT be 0 (before the fix `0 ?? 240` persisted 0). Falls back to the summed
    // per-meal grams the refined meals carry (120 / 120 / 45).
    expect((saved as any).protein_g).toBe(120)
    expect((saved as any).carbs_g).toBe(120)
    expect((saved as any).fat_g).toBe(45)
    const row = testDb.prepare('SELECT protein_g, carbs_g, fat_g FROM diet_plans WHERE id=1').get([]) as { protein_g: number; carbs_g: number; fat_g: number }
    expect(row.protein_g).toBe(120)
    expect(row.carbs_g).toBe(120)
    expect(row.fat_g).toBe(45)
  })

  it('does not persist a negative or non-finite macro target', async () => {
    refineDietPlanMock.mockResolvedValue({
      meals: Array.from({ length: 3 }, (_, i) => mkMeal(i)),
      protein_g: -50, carbs_g: NaN, fat_g: 'abc',
    })
    const saved = await handlers.get('plan:refineDietWithPrompt')!({}, USER, 'swap the rice for potatoes')

    // All invalid → summed per-meal grams, never the raw bad value.
    expect((saved as any).protein_g).toBe(120)
    expect((saved as any).carbs_g).toBe(120)
    expect((saved as any).fat_g).toBe(45)
  })

  it('still honors a valid macro target the model returns', async () => {
    refineDietPlanMock.mockResolvedValue({
      meals: Array.from({ length: 3 }, (_, i) => mkMeal(i)),
      protein_g: 210, carbs_g: 300, fat_g: 80,
    })
    const saved = await handlers.get('plan:refineDietWithPrompt')!({}, USER, 'more carbs please')

    expect((saved as any).protein_g).toBe(210)
    expect((saved as any).carbs_g).toBe(300)
    expect((saved as any).fat_g).toBe(80)
  })
})
