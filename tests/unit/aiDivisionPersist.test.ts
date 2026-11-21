// Reproduces the "AI assistant changes my division, but it silently reverts on the
// next launch" data-loss / DB↔UI-desync bug.
//
// plan:applyAIRequest whitelists `division` in ALLOWED_COLUMNS and writes it straight
// to the USERS row. But users.division is a DERIVED column — syncPrimaryToNearest and
// plan:startupRefresh rebuild it from the nearest upcoming show on EVERY launch. So a
// division change the AI applies WITHOUT also setting a show_date is written only to
// the users row and is reverted on the next launch: back to the backing show's OLD
// division when a show exists (losing the user's edit), or to NULL when none does.
// Sibling aiShowDatePersist.test.ts already covers the show_date half of this seam;
// this covers the division-without-show_date half.
//
// The fix (persistProfileDivision) stamps the new division onto the nearest upcoming
// show so the launch derivation reproduces it, mirroring persistProfileShowDate.
// Exercises the REAL exported helper against an in-memory node-sqlite3-wasm database
// with an injected `today`.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Database } from 'node-sqlite3-wasm'
import { SCHEMA_SQL, MIGRATIONS } from '../../electron/database/schema'

let testDb: Database
vi.mock('../../electron/database/db', () => ({
  getDb: () => testDb,
  namedParams: (obj: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(obj).map(([k, v]) => [`@${k}`, v ?? null])),
}))

import { syncPrimaryToNearest, persistProfileDivision } from '../../electron/ipc/showHandlers'

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

function seedUser(division: string | null, showDate: string | null): void {
  testDb.prepare(
    `INSERT INTO users (id, name, age, sex, height_cm, weight_kg, goal, show_date, division)
     VALUES (?, 'Test', 30, 'male', 180, 85, 'cut', ?, ?)`
  ).run([USER, showDate, division])
}

function seedShow(showDate: string, division: string | null): void {
  testDb.prepare(
    "INSERT INTO shows (user_id, name, show_date, division, federation, notes, is_primary) VALUES (?, 'Competition', ?, ?, NULL, NULL, 1)"
  ).run([USER, showDate, division])
}

function userDivision(): string | null {
  return (testDb.prepare('SELECT division FROM users WHERE id=?').get([USER]) as { division: string | null }).division
}
function showDivision(): string | null {
  const row = testDb.prepare('SELECT division FROM shows WHERE user_id=? ORDER BY show_date ASC LIMIT 1').get([USER]) as { division: string | null } | undefined
  return row?.division ?? null
}
function showCount(): number {
  return (testDb.prepare('SELECT COUNT(*) as c FROM shows WHERE user_id=?').get([USER]) as { c: number }).c
}

describe('AI-set division must persist through startup sync (plan:applyAIRequest)', () => {
  beforeEach(() => {
    testDb = buildDb()
  })

  it('reproduces the data loss: a users-only division write is reverted to the show division by the next launch sync', () => {
    seedUser("Men's Physique", FUTURE)
    seedShow(FUTURE, "Men's Physique")

    // The OLD plan:applyAIRequest behavior — write the AI division to the users row
    // only, never touching the backing show row.
    testDb.prepare('UPDATE users SET division=? WHERE id=?').run(['Classic Physique', USER])
    expect(userDivision()).toBe('Classic Physique')

    // Next app launch runs the same sync plan:startupRefresh uses.
    syncPrimaryToNearest(testDb, USER, TODAY)

    // BUG: the user's division change silently reverts to the show's old division.
    expect(userDivision()).toBe("Men's Physique")
  })

  it('persistProfileDivision stamps the new division on the nearest show so it survives the next launch', () => {
    seedUser("Men's Physique", FUTURE)
    seedShow(FUTURE, "Men's Physique")

    persistProfileDivision(testDb, USER, 'Classic Physique', TODAY)

    // Applied to both users row and the backing show, no duplicate show created.
    expect(userDivision()).toBe('Classic Physique')
    expect(showDivision()).toBe('Classic Physique')
    expect(showCount()).toBe(1)

    // …and still set after the next launch's sync (no silent revert).
    syncPrimaryToNearest(testDb, USER, TODAY)
    expect(userDivision()).toBe('Classic Physique')
  })

  it('with no upcoming show, drops the orphaned division instead of leaving a value that vanishes next launch', () => {
    // User wrote a division but has no backing show (e.g. the raw users-row write).
    seedUser('Bikini', null)

    persistProfileDivision(testDb, USER, 'Bikini', TODAY)

    // No show to back it → syncPrimaryToNearest nulls it, matching the eventual derived
    // state (no flash-then-vanish on the next launch).
    expect(showCount()).toBe(0)
    expect(userDivision()).toBeNull()

    // Still null after the next launch — stable, no desync.
    syncPrimaryToNearest(testDb, USER, TODAY)
    expect(userDivision()).toBeNull()
  })

  it('ignores a PAST show when stamping the division (syncs off the nearest UPCOMING show only)', () => {
    // A past show must not receive the new division, and with no upcoming show the
    // orphaned division is dropped.
    seedUser('Wellness', null)
    seedShow('2026-01-01', 'Figure') // past relative to TODAY

    persistProfileDivision(testDb, USER, 'Wellness', TODAY)

    expect(showDivision()).toBe('Figure') // past show untouched
    expect(userDivision()).toBeNull() // no upcoming show → derived null
  })
})
