// Reproduces the "clearing the check-in date field discards the whole edit" bug.
//
// On the locked Check-In screen, "Edit Last Check-In" pre-fills a `<input type=date>`
// that is NOT required and has no empty-value guard. Clearing it makes saveEdit send
// `check_in_date: editDate || null` → null. The update handler's date guard is
// `if (data.check_in_date != null)`, so a null date skips format validation entirely,
// but check_in_date is still in the generic `allowed` set — so the generic update loop
// writes `check_in_date = NULL`. Because the column is `TEXT NOT NULL`, SQLite rejects
// the whole UPDATE with "NOT NULL constraint failed", so the user's weight/measurement
// edits are silently lost behind a raw SQLite error.
//
// Fix: a null/empty check_in_date must be dropped from the update (the date is the
// chronological ordering/identity key and can never be null) so the rest of the edit
// still saves and the existing date is preserved.
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
  registerCheckinHandlers({ handle: (c: string, fn: Handler) => handlers.set(c, fn) } as any)
  return handlers
}

describe('checkin:update — a null/empty check_in_date must not discard the edit', () => {
  let handlers: Map<string, Handler>
  const USER = 1

  beforeEach(() => {
    testDb = buildDb()
    testDb.prepare(
      `INSERT INTO users (id, name, age, sex, height_cm, weight_kg, goal)
       VALUES (?, 'Test', 30, 'male', 180, 85, 'cut')`
    ).run([USER])
    testDb.prepare(
      `INSERT INTO weekly_checkins (user_id, week_number, check_in_date, weight_kg, adjustments)
       VALUES (?, 1, '2026-07-15', 84, '{}')`
    ).run([USER])
    handlers = collectHandlers()
  })

  it('applies the other field edits and preserves the existing date when check_in_date is null', () => {
    const update = handlers.get('checkin:update')!
    const id = (testDb
      .prepare("SELECT id FROM weekly_checkins WHERE check_in_date='2026-07-15'")
      .get([]) as { id: number }).id

    // The user changed their weight but cleared the date field → editDate || null → null.
    expect(() => update({}, id, { weight_kg: 80, check_in_date: null })).not.toThrow()

    const row = testDb
      .prepare('SELECT check_in_date, weight_kg FROM weekly_checkins WHERE id=?')
      .get([id]) as { check_in_date: string; weight_kg: number }

    expect(row.weight_kg).toBe(80)              // the real edit was saved
    expect(row.check_in_date).toBe('2026-07-15') // the date was preserved, not nulled
  })

  it('still rejects a non-empty malformed date with a clear message', () => {
    const update = handlers.get('checkin:update')!
    const id = (testDb
      .prepare("SELECT id FROM weekly_checkins WHERE check_in_date='2026-07-15'")
      .get([]) as { id: number }).id
    expect(() => update({}, id, { weight_kg: 80, check_in_date: 'not-a-date' }))
      .toThrow(/YYYY-MM-DD/)
  })
})
