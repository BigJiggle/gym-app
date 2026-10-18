// Reproduces the "stored check-in weight is unbounded" bug flagged as a lead by
// the 2026-07-30 run. The Check-In page's toKg only rejects <= 0 (no upper bound),
// so a fat-fingered 850 (meant 85.0, or an lbs value typed into a kg field)
// persisted an 850 kg row into weekly_checkins.weight_kg — the value the Progress
// "Current Weight" tile + weight chart render verbatim and the smoothed weight
// trend folds in raw. The macro derivation was already bounded by clampWeightKg
// (2026-07-30), but the STORED/charted/trended weight was not, on all three write
// seams (submit, submitMissed, update).
//
// Exercises the REAL handlers against an in-memory node-sqlite3-wasm database,
// plus the pure clampCheckinWeightKg helper.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Database } from 'node-sqlite3-wasm'
import { SCHEMA_SQL, MIGRATIONS } from '../../electron/database/schema'
import { clampCheckinWeightKg } from '../../electron/services/checkinEngine'

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
    for (const stmt of sql.split(';').map((s) => s.trim()).filter(Boolean)) {
      db.prepare(stmt).run([])
    }
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

// A complete check-in payload (every INSERT column present so the named-param
// binding succeeds). Weight is overridden per test.
function payload(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    user_id: 1,
    weight_kg: 85,
    waist_cm: null, chest_cm: null, hip_cm: null, arm_cm: null, thigh_cm: null,
    training_adherence: 5, diet_adherence: 5,
    energy_level: 3, sleep_quality: 3, stress_level: 2,
    notes: null,
    ...overrides,
  }
}

describe('clampCheckinWeightKg (pure helper)', () => {
  it('clamps an implausibly high weight to the 300 kg ceiling', () => {
    expect(clampCheckinWeightKg(850)).toBe(300)
    expect(clampCheckinWeightKg(301)).toBe(300)
    expect(clampCheckinWeightKg(300)).toBe(300)
  })
  it('floors an implausibly low (but positive) weight to 30 kg', () => {
    expect(clampCheckinWeightKg(5)).toBe(30)
    expect(clampCheckinWeightKg(29)).toBe(30)
  })
  it('passes plausible weights through unchanged', () => {
    expect(clampCheckinWeightKg(85)).toBe(85)
    expect(clampCheckinWeightKg(120.5)).toBe(120.5)
  })
  it('returns null for non-finite / non-positive values so the caller can reject', () => {
    expect(clampCheckinWeightKg(0)).toBeNull()
    expect(clampCheckinWeightKg(-10)).toBeNull()
    expect(clampCheckinWeightKg(NaN)).toBeNull()
    expect(clampCheckinWeightKg(Infinity)).toBeNull()
    expect(clampCheckinWeightKg('abc')).toBeNull()
  })
})

describe('check-in weight is clamped at every write seam', () => {
  let handlers: Map<string, Handler>
  const USER = 1

  beforeEach(() => {
    testDb = buildDb()
    testDb.prepare(
      `INSERT INTO users (id, name, age, sex, height_cm, weight_kg, goal)
       VALUES (?, 'Test', 30, 'male', 180, 85, 'cut')`
    ).run([USER])
    // A diet plan so the submit path's macro recalc branch runs too.
    testDb.prepare(
      `INSERT INTO diet_plans (user_id, name, calories_target, protein_g, carbs_g, fat_g, meal_count, meals, phase)
       VALUES (?, 'P', 2200, 190, 250, 70, 4, '[]', 'deficit')`
    ).run([USER])
    handlers = collectHandlers()
  })

  function storedWeights(): number[] {
    return (testDb
      .prepare('SELECT weight_kg FROM weekly_checkins WHERE user_id=? ORDER BY check_in_date ASC')
      .all([USER]) as { weight_kg: number }[]).map((r) => r.weight_kg)
  }

  it('checkin:submit clamps a fat-fingered 850 kg down to 300', () => {
    handlers.get('checkin:submit')!({}, payload({ weight_kg: 850, check_in_date: '2026-07-01' }))
    expect(storedWeights()).toEqual([300])
  })

  it('checkin:submitMissed clamps a fat-fingered 850 kg down to 300', () => {
    handlers.get('checkin:submitMissed')!({}, payload({ weight_kg: 850, check_in_date: '2026-07-01' }))
    expect(storedWeights()).toEqual([300])
  })

  it('checkin:update clamps an edited 850 kg down to 300', () => {
    handlers.get('checkin:submit')!({}, payload({ weight_kg: 85, check_in_date: '2026-07-01' }))
    const id = (testDb.prepare('SELECT id FROM weekly_checkins WHERE user_id=?').get([USER]) as { id: number }).id
    handlers.get('checkin:update')!({}, id, { weight_kg: 850 })
    expect(storedWeights()).toEqual([300])
  })

  it('leaves a plausible weigh-in untouched and rejects a non-finite one', () => {
    handlers.get('checkin:submit')!({}, payload({ weight_kg: 92.5, check_in_date: '2026-07-01' }))
    expect(storedWeights()).toEqual([92.5])
    expect(() => handlers.get('checkin:submit')!({}, payload({ weight_kg: 0, check_in_date: '2026-07-08' })))
      .toThrow(/INVALID_WEIGHT/)
  })
})
