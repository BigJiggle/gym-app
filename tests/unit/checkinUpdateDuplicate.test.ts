// Reproduces the "duplicate same-day check-in via edit" bug: the checkin:update
// IPC handler let a user move a check-in's date onto a day that already has a
// DIFFERENT check-in, creating two rows with the same check_in_date — an
// invariant that checkin:submit and checkin:submitMissed both explicitly enforce.
//
// Exercises the REAL handler against an in-memory node-sqlite3-wasm database.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Database } from 'node-sqlite3-wasm'
import { SCHEMA_SQL, MIGRATIONS } from '../../electron/database/schema'

// Provide getDb (our in-memory instance) + a real namedParams; never load the
// real db.ts, which imports 'electron' (unavailable in the node test env).
let testDb: Database
vi.mock('../../electron/database/db', () => ({
  getDb: () => testDb,
  namedParams: (obj: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(obj).map(([k, v]) => [`@${k}`, v ?? null])),
}))

// Import AFTER the mock is registered.
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

describe('checkin:update — duplicate same-day guard', () => {
  let handlers: Map<string, Handler>
  const USER = 1

  beforeEach(() => {
    testDb = buildDb()
    testDb.prepare(
      `INSERT INTO users (id, name, age, sex, height_cm, weight_kg, goal)
       VALUES (?, 'Test', 30, 'male', 180, 85, 'cut')`
    ).run([USER])
    // Two distinct-day check-ins.
    const insert = (week: number, date: string, wkg: number) =>
      testDb.prepare(
        `INSERT INTO weekly_checkins (user_id, week_number, check_in_date, weight_kg, adjustments)
         VALUES (?, ?, ?, ?, '{}')`
      ).run([USER, week, date, wkg])
    insert(1, '2026-07-01', 86)
    insert(2, '2026-07-08', 85)
    handlers = collectHandlers()
  })

  it('rejects moving a check-in onto a date that already has another check-in', () => {
    const update = handlers.get('checkin:update')!
    const secondId = (testDb
      .prepare("SELECT id FROM weekly_checkins WHERE check_in_date='2026-07-08'")
      .get([]) as { id: number }).id

    // Move the 07-08 check-in back onto 07-01 (already occupied) — must be rejected.
    expect(() => update({}, secondId, { check_in_date: '2026-07-01' }))
      .toThrow(/DUPLICATE_CHECKIN/)

    // And no duplicate row was created: still exactly one check-in per day.
    const perDay = testDb
      .prepare('SELECT check_in_date, COUNT(*) AS c FROM weekly_checkins WHERE user_id=? GROUP BY check_in_date')
      .all([USER]) as { check_in_date: string; c: number }[]
    expect(perDay.every((r) => r.c === 1)).toBe(true)
  })

  it('still allows moving a check-in to a genuinely free date', () => {
    const update = handlers.get('checkin:update')!
    const secondId = (testDb
      .prepare("SELECT id FROM weekly_checkins WHERE check_in_date='2026-07-08'")
      .get([]) as { id: number }).id

    expect(() => update({}, secondId, { check_in_date: '2026-07-09' })).not.toThrow()
    const row = testDb.prepare('SELECT check_in_date FROM weekly_checkins WHERE id=?').get([secondId]) as { check_in_date: string }
    expect(row.check_in_date).toBe('2026-07-09')
  })
})
