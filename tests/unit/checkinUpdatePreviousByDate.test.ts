// Reproduces the "checkin:update picks the previous check-in / trend window by
// insertion id, not by date" bug.
//
// submit (ORDER BY week_number DESC) and submitMissed (WHERE check_in_date < ?
// ORDER BY check_in_date DESC) both select the CHRONOLOGICALLY-previous check-in
// to feed the adaptive calorie engine. checkin:update instead used
// `WHERE id < checkinId ORDER BY id DESC`. Insertion id only matches date order
// when every check-in was logged live, in order — but submitMissed is a
// first-class feature that inserts a retroactive weigh-in with the HIGHEST id and
// an OLD date. Once such a row exists, id order ≠ date order, so editing a
// check-in could compare it against a chronologically-LATER weigh-in, producing
// the wrong weight-change signal and storing wrong coach feedback + a wrong
// calorie delta on that check-in.
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

describe('checkin:update — previous / trend window are chosen by date, not insertion id', () => {
  let handlers: Map<string, Handler>
  const USER = 1

  beforeEach(() => {
    testDb = buildDb()
    testDb.prepare(
      `INSERT INTO users (id, name, age, sex, height_cm, weight_kg, goal)
       VALUES (?, 'Test', 30, 'male', 180, 80, 'cut')`
    ).run([USER])
    // energy/sleep/stress default to 3 and adherence to 100, so ONLY the weight
    // branch drives the adjustment — keeps the assertion about the weight signal.
    const ins = (week: number, date: string, kg: number) =>
      testDb.prepare(
        `INSERT INTO weekly_checkins (user_id, week_number, check_in_date, weight_kg, adjustments)
         VALUES (?, ?, ?, ?, '{}')`
      ).run([USER, week, date, kg])
    // Insertion order (and thus id) ≠ date order: the 07-15 row is inserted LAST
    // (highest id) but sits chronologically BETWEEN the two live weigh-ins —
    // exactly what submitMissed produces when a user back-fills a missed slot.
    ins(1, '2026-07-01', 80.0) // id=1 (live)
    ins(3, '2026-07-29', 86.0) // id=2 (live, later — a big water-weight spike)
    ins(2, '2026-07-15', 79.0) // id=3 (retroactive fill: highest id, middle date)
    handlers = collectHandlers()
  })

  it('edits the back-filled check-in against its DATE-previous weigh-in, not a later/higher-id one', () => {
    const update = handlers.get('checkin:update')!
    const id = (testDb
      .prepare("SELECT id FROM weekly_checkins WHERE check_in_date='2026-07-15'")
      .get([]) as { id: number }).id
    expect(id).toBe(3) // sanity: the back-fill is the highest id

    // Re-save the 07-15 weigh-in unchanged (79.0 kg) to recompute its adjustment.
    const saved = update({}, id, { weight_kg: 79.0 }) as {
      adjustments: { calories_delta: number; notes: string[] }
    }

    // Chronologically, 07-15 (79.0) follows 07-01 (80.0): a textbook ~0.6 %/wk
    // loss → "on track", no calorie change. The buggy id-based lookup instead
    // compared it against the later 07-29 (86.0) row, read a weight INCREASE, and
    // wrongly cut 100 kcal with a "stalling" note.
    expect(saved.adjustments.calories_delta).toBe(0)
    expect(saved.adjustments.notes.some((n) => n.toLowerCase().includes('on track'))).toBe(true)
    expect(saved.adjustments.notes.some((n) => n.toLowerCase().includes('stalling'))).toBe(false)
  })
})
