// Reproduces the "editing a check-in's date desyncs week_number from date order"
// bug. checkin:update let a user move a check-in's date but never renumbered
// week_number, so the row kept its old chronological rank. progress:entries
// (ORDER BY week_number) and the Progress page's first→latest / "Current Weight"
// math all assume week_number == chronological rank — the invariant submit and
// submitMissed both maintain. A date edit that reorders check-ins broke it,
// producing a weight chart that zig-zags in time and a "Current Weight" taken
// from an older weigh-in.
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

describe('checkin:update — week_number stays in chronological order after a date edit', () => {
  let handlers: Map<string, Handler>
  const USER = 1

  beforeEach(() => {
    testDb = buildDb()
    testDb.prepare(
      `INSERT INTO users (id, name, age, sex, height_cm, weight_kg, goal)
       VALUES (?, 'Test', 30, 'male', 180, 85, 'cut')`
    ).run([USER])
    const ins = (week: number, date: string, kg: number) =>
      testDb.prepare(
        `INSERT INTO weekly_checkins (user_id, week_number, check_in_date, weight_kg, adjustments)
         VALUES (?, ?, ?, ?, '{}')`
      ).run([USER, week, date, kg])
    ins(1, '2026-07-01', 86)
    ins(2, '2026-07-08', 85)
    ins(3, '2026-07-15', 84)
    handlers = collectHandlers()
  })

  it('renumbers week_number so ordering by week_number matches ordering by date', () => {
    const update = handlers.get('checkin:update')!
    const id3 = (testDb
      .prepare("SELECT id FROM weekly_checkins WHERE check_in_date='2026-07-15'")
      .get([]) as { id: number }).id

    // Correct a typo: the latest weigh-in was actually 07-02, before the 07-08 one.
    update({}, id3, { check_in_date: '2026-07-02' })

    const rows = testDb
      .prepare('SELECT week_number, check_in_date FROM weekly_checkins WHERE user_id=? ORDER BY week_number ASC')
      .all([USER]) as { week_number: number; check_in_date: string }[]

    // Invariant: ordering by week_number == ordering by check_in_date.
    const dates = rows.map((r) => r.check_in_date)
    expect(dates).toEqual([...dates].sort())
    // Concretely: 07-01 → wk1, 07-02 → wk2, 07-08 → wk3.
    expect(rows).toEqual([
      { week_number: 1, check_in_date: '2026-07-01' },
      { week_number: 2, check_in_date: '2026-07-02' },
      { week_number: 3, check_in_date: '2026-07-08' },
    ])
    // week_numbers stay a dense 1..N sequence with no gaps/dupes.
    expect(rows.map((r) => r.week_number)).toEqual([1, 2, 3])
  })

  it('leaves week_numbers untouched when the date is not changed', () => {
    const update = handlers.get('checkin:update')!
    const id2 = (testDb
      .prepare("SELECT id FROM weekly_checkins WHERE check_in_date='2026-07-08'")
      .get([]) as { id: number }).id

    // Edit only the weight — week_number ordering must be unchanged.
    update({}, id2, { weight_kg: 84.5 })

    const rows = testDb
      .prepare('SELECT week_number, check_in_date, weight_kg FROM weekly_checkins WHERE user_id=? ORDER BY week_number ASC')
      .all([USER]) as { week_number: number; check_in_date: string; weight_kg: number }[]
    expect(rows.map((r) => `${r.week_number}:${r.check_in_date}`)).toEqual([
      '1:2026-07-01', '2:2026-07-08', '3:2026-07-15',
    ])
    expect(rows[1].weight_kg).toBe(84.5)
  })
})
