// Reproduces a DB↔UI desync in the "set as primary show" flow.
//
// A prep athlete registers two upcoming shows. The diet plan is generated for the
// PRIMARY show's weeks-out (which drives the phase + calorie deficit — see
// getPhaseAwareDeficit in nutritionEngine). When the athlete promotes the OTHER
// show to primary, `shows:setPrimary` re-points users.show_date/division at it —
// but (before the fix) left the stored diet_plan untouched. So the sidebar
// countdown / prep timeline show the NEW show's weeks-out while the Diet page keeps
// serving a plan generated for the OLD show's weeks-out: a value shown that no
// longer matches the show being prepped for.
//
// Every OTHER show-context change (shows:add, shows:update on a date change,
// shows:cancelShow → next show) already regenerates the diet. setPrimary was the
// lone path that didn't. The fix routes it through the same regenerateDietForGoal
// call, so the plan's generated_at_weeks_out (and phase/calories) follow the new
// primary show.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Database } from 'node-sqlite3-wasm'
import { SCHEMA_SQL, MIGRATIONS } from '../../electron/database/schema'

let testDb: Database
vi.mock('../../electron/database/db', () => ({
  getDb: () => testDb,
  namedParams: (obj: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(obj).map(([k, v]) => [`@${k}`, v ?? null])),
}))

import { setPrimaryShow } from '../../electron/ipc/showHandlers'

function buildDb(): Database {
  const db = new Database(':memory:')
  const run = (sql: string) => {
    for (const stmt of sql.split(';').map((s) => s.trim()).filter(Boolean)) db.prepare(stmt).run([])
  }
  run(SCHEMA_SQL)
  for (const m of MIGRATIONS) run(m.sql)
  return db
}

const USER = 1

function seedUser(): void {
  testDb.prepare(
    `INSERT INTO users (id, name, age, sex, height_cm, weight_kg, activity_level, goal, meal_count, show_date, division)
     VALUES (?, 'Test', 30, 'male', 180, 90, 'moderate', 'cut', 4, NULL, NULL)`
  ).run([USER])
}

function addShow(name: string, date: string, division: string | null = null): number {
  const r = testDb.prepare(
    `INSERT INTO shows (user_id, name, show_date, division, is_primary) VALUES (?, ?, ?, ?, 0)`
  ).run([USER, name, date, division])
  return r.lastInsertRowid as number
}

function dietPlan(): { generated_at_weeks_out: number | null; phase: string; calories_target: number } | undefined {
  return testDb
    .prepare('SELECT generated_at_weeks_out, phase, calories_target FROM diet_plans WHERE user_id=?')
    .get([USER]) as { generated_at_weeks_out: number | null; phase: string; calories_target: number } | undefined
}

describe('shows:setPrimary — regenerates the diet for the newly-primary show', () => {
  beforeEach(() => {
    testDb = buildDb()
    seedUser()
  })

  it('re-points the diet plan at the new primary show (no stale weeks-out / phase)', () => {
    // "Today" is fixed at 2026-01-01. Near show → ~2 weeks out (peak deficit);
    // far show → ~20 weeks out (early prep). The two produce DIFFERENT phases and
    // calorie targets, so a stale plan is observable.
    const today = '2026-01-01'
    const nearShow = addShow('Regional (near)', '2026-01-16', 'Classic Physique')  // ~2 weeks out
    const farShow = addShow('Nationals (far)', '2026-05-25', 'Mens Physique')      // ~20 weeks out

    // Start prepping for the near show — this is the plan the Diet page renders.
    setPrimaryShow(testDb, nearShow, USER, today)
    const nearPlan = dietPlan()
    expect(nearPlan).toBeDefined()
    const nearWeeksOut = nearPlan!.generated_at_weeks_out

    // Athlete decides to peak for Nationals instead → promote the far show.
    const shows = setPrimaryShow(testDb, farShow, USER, today)

    // Primary + user.show_date/division followed the new show...
    expect((testDb.prepare('SELECT show_date, division FROM users WHERE id=?').get([USER]) as any).show_date)
      .toBe('2026-05-25')
    expect((shows.find((s: any) => s.is_primary === 1) as any).name).toBe('Nationals (far)')

    // ...and so must the DIET PLAN. Before the fix it kept the near show's weeks-out.
    const farPlan = dietPlan()
    expect(farPlan).toBeDefined()
    expect(farPlan!.generated_at_weeks_out).not.toBe(nearWeeksOut)
    expect(farPlan!.generated_at_weeks_out).toBe(20) // 2026-01-01 → 2026-05-25 = 20 whole weeks
  })
})
