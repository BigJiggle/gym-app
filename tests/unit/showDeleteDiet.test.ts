// Reproduces a DB↔UI desync in the "delete show" flow (the Settings "Delete"
// button, which is offered for EVERY upcoming show — including the primary — right
// next to "Cancel Show").
//
// A prep athlete registers two upcoming shows. The diet plan is generated for the
// PRIMARY show's weeks-out (which drives the phase + calorie deficit — see
// getPhaseAwareDeficit in nutritionEngine). When the athlete DELETES the primary
// show, `shows:delete` re-points users.show_date/division at the next upcoming show
// (via syncPrimaryToNearest) — but (before the fix) left the stored diet_plan
// untouched. So the sidebar countdown / prep timeline show the NEW show's weeks-out
// while the Diet page keeps serving a plan generated for the OLD (deleted) show's
// weeks-out: a value shown that no longer matches the show being prepped for.
//
// Every OTHER show-context change (shows:add, shows:update on a date change,
// shows:cancelShow → next show, shows:setPrimary) already regenerates the diet.
// shows:delete was the lone path that didn't. The fix routes it through the same
// regenerateDietForGoal call when the deleted show was the primary, so the plan's
// generated_at_weeks_out (and phase/calories) follow the new primary show.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Database } from 'node-sqlite3-wasm'
import type { IpcMain } from 'electron'
import { SCHEMA_SQL, MIGRATIONS } from '../../electron/database/schema'
import { weeksUntilShow } from '../../electron/services/showDates'

let testDb: Database
vi.mock('../../electron/database/db', () => ({
  getDb: () => testDb,
  namedParams: (obj: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(obj).map(([k, v]) => [`@${k}`, v ?? null])),
}))

import { registerShowHandlers, syncPrimaryToNearest, regenerateDietForGoal } from '../../electron/ipc/showHandlers'

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

// Capture the real registered handlers by feeding registerShowHandlers a fake ipcMain.
function captureHandlers(): Record<string, (...args: unknown[]) => unknown> {
  const handlers: Record<string, (...args: unknown[]) => unknown> = {}
  const fakeIpc = { handle: (name: string, fn: (...a: unknown[]) => unknown) => { handlers[name] = fn } } as unknown as IpcMain
  registerShowHandlers(fakeIpc)
  return handlers
}

// Dates relative to real "today" — the delete handler uses new Date() for its
// local-today comparison (not injectable), so upcoming shows must be genuinely
// in the future for hasUpcoming to hold.
function shiftDays(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toLocaleDateString('en-CA')
}

describe('shows:delete — regenerates the diet when the deleted show was primary and another remains', () => {
  beforeEach(() => {
    testDb = buildDb()
    seedUser()
  })

  it('re-points the diet plan at the next upcoming show (no stale weeks-out / phase)', async () => {
    const nearDate = shiftDays(14)   // ~2 weeks out → peak-ish deficit
    const farDate = shiftDays(126)   // ~18 weeks out → early prep
    const nearShow = addShow('Regional (near)', nearDate, 'Classic Physique')
    addShow('Nationals (far)', farDate, 'Mens Physique')

    // Establish the real starting state: near show is primary, diet generated for it.
    syncPrimaryToNearest(testDb, USER)
    regenerateDietForGoal(testDb, USER, 'cut', weeksUntilShow(nearDate))
    const nearPlan = dietPlan()
    expect(nearPlan).toBeDefined()
    expect(nearPlan!.generated_at_weeks_out).toBe(weeksUntilShow(nearDate))

    // Athlete deletes the near (primary) show — prep should transition to Nationals.
    const handlers = captureHandlers()
    await handlers['shows:delete'](null, nearShow)

    // Primary + user.show_date/division followed the next show...
    const u = testDb.prepare('SELECT show_date, division FROM users WHERE id=?').get([USER]) as { show_date: string; division: string }
    expect(u.show_date).toBe(farDate)
    expect(u.division).toBe('Mens Physique')

    // ...and so must the DIET PLAN. Before the fix it kept the deleted show's weeks-out.
    const farPlan = dietPlan()
    expect(farPlan).toBeDefined()
    expect(farPlan!.generated_at_weeks_out).toBe(weeksUntilShow(farDate))
    expect(farPlan!.generated_at_weeks_out).not.toBe(weeksUntilShow(nearDate))
  })

  it('leaves the diet untouched when a NON-primary show is deleted (no needless churn)', async () => {
    const nearDate = shiftDays(14)
    const farDate = shiftDays(126)
    addShow('Regional (near)', nearDate, 'Classic Physique')
    const farShow = addShow('Nationals (far)', farDate, 'Mens Physique')

    syncPrimaryToNearest(testDb, USER)                       // near is primary
    regenerateDietForGoal(testDb, USER, 'cut', weeksUntilShow(nearDate))
    const before = dietPlan()

    // Delete the FAR (non-primary) show → primary/diet context is unchanged.
    const handlers = captureHandlers()
    await handlers['shows:delete'](null, farShow)

    const u = testDb.prepare('SELECT show_date FROM users WHERE id=?').get([USER]) as { show_date: string }
    expect(u.show_date).toBe(nearDate)                        // still the near show
    const after = dietPlan()
    expect(after!.generated_at_weeks_out).toBe(before!.generated_at_weeks_out)
  })
})
