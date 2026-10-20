// Reproduces the "AI assistant sets a show date that silently vanishes on the next
// launch" data-loss bug.
//
// plan:applyAIRequest lets Claude's settingChanges carry a `show_date`
// ("my show is in 8 weeks") and whitelists show_date / division in ALLOWED_COLUMNS,
// then writes them straight to the USERS row. But shows live in the `shows` table,
// which is the single source of truth that syncPrimaryToNearest and
// plan:startupRefresh rebuild users.show_date from on EVERY launch. With no matching
// `shows` row, the next launch's sync finds nothing upcoming and nulls users.show_date
// (data loss) AND — because prevShowDate !== newShowDate — misfires the
// "your show has passed" off-season transition, regenerating both plans to off-season
// even though the show is weeks in the FUTURE.
//
// The fix routes an AI-set show_date through the `shows` table (persistProfileShowDate,
// mirroring shows:add) so it survives. Exercises the REAL exported helper against an
// in-memory node-sqlite3-wasm database with an injected `today`.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Database } from 'node-sqlite3-wasm'
import { SCHEMA_SQL, MIGRATIONS } from '../../electron/database/schema'

let testDb: Database
vi.mock('../../electron/database/db', () => ({
  getDb: () => testDb,
  namedParams: (obj: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(obj).map(([k, v]) => [`@${k}`, v ?? null])),
}))

import { syncPrimaryToNearest, persistProfileShowDate } from '../../electron/ipc/showHandlers'

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
const TODAY = '2026-10-20'
const FUTURE = '2026-12-15' // ~8 weeks out — comfortably upcoming relative to TODAY

function seedUser(): void {
  testDb.prepare(
    `INSERT INTO users (id, name, age, sex, height_cm, weight_kg, goal, show_date, division)
     VALUES (?, 'Test', 30, 'male', 180, 85, 'cut', NULL, NULL)`
  ).run([USER])
}

function userShowDate(): string | null {
  return (testDb.prepare('SELECT show_date FROM users WHERE id=?').get([USER]) as { show_date: string | null }).show_date
}
function userDivision(): string | null {
  return (testDb.prepare('SELECT division FROM users WHERE id=?').get([USER]) as { division: string | null }).division
}
function showCount(): number {
  return (testDb.prepare('SELECT COUNT(*) as c FROM shows WHERE user_id=?').get([USER]) as { c: number }).c
}

describe('AI-set show_date must persist through startup sync (plan:applyAIRequest)', () => {
  beforeEach(() => {
    testDb = buildDb()
    seedUser()
  })

  it('reproduces the data loss: a users-only show_date write is wiped by the next launch sync', () => {
    // The OLD plan:applyAIRequest behavior — write the AI date to the users row only,
    // never touching the shows table.
    testDb.prepare('UPDATE users SET show_date=? WHERE id=?').run([FUTURE, USER])
    expect(userShowDate()).toBe(FUTURE)

    // Next app launch runs the same sync plan:startupRefresh uses.
    syncPrimaryToNearest(testDb, USER, TODAY)

    // BUG: the future show date silently vanishes (and startupRefresh would see
    // prevShowDate !== newShowDate → false "show passed" + off-season regen).
    expect(userShowDate()).toBeNull()
    expect(showCount()).toBe(0)
  })

  it('persistProfileShowDate routes the AI show through the shows table so it survives the next launch', () => {
    persistProfileShowDate(testDb, USER, FUTURE, 'Classic Physique', TODAY)

    // Set correctly now…
    expect(userShowDate()).toBe(FUTURE)
    expect(userDivision()).toBe('Classic Physique')
    expect(showCount()).toBe(1)

    // …and still set after the next launch's sync (no data loss, no false transition).
    syncPrimaryToNearest(testDb, USER, TODAY)
    expect(userShowDate()).toBe(FUTURE)
    expect(userDivision()).toBe('Classic Physique')
  })

  it('does not duplicate a show when the AI re-sends the same date; refreshes its division', () => {
    persistProfileShowDate(testDb, USER, FUTURE, 'Classic Physique', TODAY)
    persistProfileShowDate(testDb, USER, FUTURE, "Men's Physique", TODAY)

    expect(showCount()).toBe(1) // same date → updated in place, not duplicated
    expect(userDivision()).toBe("Men's Physique")
  })

  it('ignores a malformed/empty AI date instead of corrupting the shows table', () => {
    persistProfileShowDate(testDb, USER, '', null, TODAY)
    persistProfileShowDate(testDb, USER, 'next summer', null, TODAY)

    expect(showCount()).toBe(0)
    expect(userShowDate()).toBeNull()
  })
})
