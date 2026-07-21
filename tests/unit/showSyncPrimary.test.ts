// Reproduces the "nearest upcoming show selected with SQLite's UTC date('now')"
// date-boundary bug. syncPrimaryToNearest (and the identical inline query in
// plan:startupRefresh, which runs on EVERY app launch) chose the nearest show
// with `show_date >= date('now')`. `date('now')` is the UTC date, which diverges
// from the LOCAL date the rest of the app uses (workoutHandlers, the countdown,
// every hasUpcoming check) in the evening for timezones behind UTC. On the
// athlete's own show-day evening in the US, the UTC date has already rolled to
// tomorrow, so the show dated "today" fails `>= date('now')` and gets dropped —
// nulling users.show_date / clearing the primary flag / hiding the peak-week
// protocol while the local-midnight UI countdown still shows the show as active.
//
// The fix binds the LOCAL date (localToday, injectable for tests) so the query
// agrees with the rest of the app. Exercises the REAL, now-exported handler helper
// against an in-memory node-sqlite3-wasm database with an injected `today`.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Database } from 'node-sqlite3-wasm'
import { SCHEMA_SQL, MIGRATIONS } from '../../electron/database/schema'
import { localToday } from '../../electron/services/showDates'

let testDb: Database
vi.mock('../../electron/database/db', () => ({
  getDb: () => testDb,
  namedParams: (obj: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(obj).map(([k, v]) => [`@${k}`, v ?? null])),
}))

import { syncPrimaryToNearest } from '../../electron/ipc/showHandlers'

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
    `INSERT INTO users (id, name, age, sex, height_cm, weight_kg, goal, show_date, division)
     VALUES (?, 'Test', 30, 'male', 180, 85, 'cut', NULL, NULL)`
  ).run([USER])
}

function addShow(name: string, date: string, division: string | null = null): number {
  const r = testDb.prepare(
    `INSERT INTO shows (user_id, name, show_date, division, is_primary) VALUES (?, ?, ?, ?, 0)`
  ).run([USER, name, date, division])
  return r.lastInsertRowid as number
}

function userShowDate(): string | null {
  return (testDb.prepare('SELECT show_date FROM users WHERE id=?').get([USER]) as { show_date: string | null }).show_date
}

function primaryShowName(): string | null {
  const row = testDb.prepare('SELECT name FROM shows WHERE user_id=? AND is_primary=1').get([USER]) as { name: string } | undefined
  return row?.name ?? null
}

describe('syncPrimaryToNearest — uses the local date, not UTC date(now)', () => {
  beforeEach(() => {
    testDb = buildDb()
    seedUser()
  })

  it("keeps a show dated TODAY (local) as the primary — the case UTC date('now') dropped on show-day evening", () => {
    // The exact failure instant: 9PM Jul 21 in Los Angeles → UTC is already Jul 22.
    const showDay = '2026-07-21'
    addShow('Regional Championships', showDay, 'Classic Physique')
    addShow('Nationals', '2026-09-15')

    // `today` is the LOCAL date on the athlete's show-day evening. Under the old
    // UTC query this would have been '2026-07-22', dropping the '2026-07-21' show.
    syncPrimaryToNearest(testDb, USER, showDay)

    expect(userShowDate()).toBe(showDay)         // show_date NOT nulled on show day
    expect(primaryShowName()).toBe('Regional Championships')
    // Division follows the primary show (drives sidebar / plan context).
    const div = (testDb.prepare('SELECT division FROM users WHERE id=?').get([USER]) as { division: string | null }).division
    expect(div).toBe('Classic Physique')
  })

  it('selects the nearest UPCOMING show and skips past ones', () => {
    addShow('Last Month (past)', '2026-06-10')
    addShow('Next Up', '2026-08-01')
    addShow('Later', '2026-10-01')

    syncPrimaryToNearest(testDb, USER, '2026-07-21')

    expect(primaryShowName()).toBe('Next Up')
    expect(userShowDate()).toBe('2026-08-01')
    // Exactly one primary flag set.
    const primaries = (testDb.prepare('SELECT COUNT(*) as c FROM shows WHERE user_id=? AND is_primary=1').get([USER]) as { c: number }).c
    expect(primaries).toBe(1)
  })

  it('nulls show_date and division and clears the primary flag when no upcoming show remains', () => {
    addShow('Done', '2026-06-10', 'Bikini')
    testDb.prepare('UPDATE shows SET is_primary=1 WHERE user_id=?').run([USER])
    testDb.prepare("UPDATE users SET show_date='2026-06-10', division='Bikini' WHERE id=?").run([USER])

    syncPrimaryToNearest(testDb, USER, '2026-07-21')

    expect(userShowDate()).toBeNull()
    expect(primaryShowName()).toBeNull()
    const div = (testDb.prepare('SELECT division FROM users WHERE id=?').get([USER]) as { division: string | null }).division
    expect(div).toBeNull()
  })

  it('a fixed instant maps to different calendar dates in UTC vs a behind-UTC zone — the desync the old query hit', () => {
    // Documents WHY `show_date >= date('now')` failed: at 9PM Jul 21 in Los Angeles
    // the UTC date has already rolled to Jul 22, so a show dated Jul 21 (still today
    // locally) fails the UTC comparison and is dropped. Uses explicit timeZone
    // options so it's deterministic regardless of the machine's own timezone.
    const inst = new Date('2026-07-22T04:00:00Z')
    const utcDate = inst.toLocaleDateString('en-CA', { timeZone: 'UTC' })
    const laDate = inst.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
    expect(utcDate).toBe('2026-07-22')          // what SQLite date('now') returns
    expect(laDate).toBe('2026-07-21')           // what the local-date convention returns
    expect(laDate).not.toBe(utcDate)            // same instant, different day → the bug class
    // localToday() delegates to the same local toLocaleDateString('en-CA') the rest
    // of the app uses, so it returns a well-formed YYYY-MM-DD in the machine's zone.
    expect(localToday(inst)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
