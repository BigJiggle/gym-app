// Reproduces a crash at the check-in DATA-READ seam. `weekly_checkins.adjustments`
// is `TEXT NOT NULL DEFAULT '{}'`, so a row written without an explicit value — or a
// legacy / hand-edited / corrupt cell — can hold '{}' or non-JSON text. The read
// handlers (`checkin:history`, `checkin:latest`, and the submit/update returns) used a
// raw `JSON.parse(row.adjustments)` and handed the result straight to consumers.
//
// Two failure modes, both before the fix:
//   1. '{}'  → JSON.parse returns `{}`, whose `.notes` is undefined. The Dashboard's
//      CheckinFeedbackWidget and the Check-In success screen call `adjustments.notes
//      .map(...)` → `undefined.map` → TypeError that crashes the component (there is
//      no error boundary — the same crash class a prior run fixed for localStorage).
//   2. non-JSON text → JSON.parse THROWS, so the ENTIRE checkin:history / checkin:latest
//      handler rejects and Progress + Check-In can't load any check-in data at all.
//
// Fix: a single `parseAdjustments` normalizer at the read seam that never throws and
// always returns a well-formed Adjustments ({ notes: string[], calories_delta: number,
// cardio_change, training_volume_change }), so no downstream consumer can crash.
//
// Exercises the REAL checkin:history / checkin:latest handlers against an in-memory
// node-sqlite3-wasm DB, with the bad cells planted via direct SQL (the hand-edited /
// schema-default scenario), plus direct coverage of the pure normalizer.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Database } from 'node-sqlite3-wasm'
import { SCHEMA_SQL, MIGRATIONS } from '../../electron/database/schema'
import { parseAdjustments } from '../../electron/services/checkinEngine'

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
  const fakeIpc = { handle: (channel: string, fn: Handler) => handlers.set(channel, fn) }
  registerCheckinHandlers(fakeIpc as any)
  return handlers
}

// Simulates the consumer path (CheckinFeedbackWidget / Check-In success screen) that
// crashed before the fix: `adjustments.notes.map(...)`.
function renderNotes(adjustments: { notes: string[] }): string[] {
  return adjustments.notes.map((n) => n)
}

const USER = 1

describe('check-in adjustments read seam — corrupt / default adjustments cell', () => {
  let handlers: Map<string, Handler>

  beforeEach(() => {
    testDb = buildDb()
    testDb.prepare(
      `INSERT INTO users (id, name, age, sex, height_cm, weight_kg, goal)
       VALUES (?, 'Test', 30, 'male', 180, 85, 'cut')`
    ).run([USER])
    handlers = collectHandlers()
  })

  // Insert a check-in row with a caller-controlled `adjustments` cell via direct SQL —
  // the hand-edited / schema-default scenario the app's own INSERTs never produce.
  const insertCheckin = (weekNumber: number, date: string, adjustments: string) => {
    testDb.prepare(
      `INSERT INTO weekly_checkins (user_id, week_number, check_in_date, weight_kg, adjustments)
       VALUES (?, ?, ?, 85, ?)`
    ).run([USER, weekNumber, date, adjustments])
  }

  it("checkin:latest on a '{}' adjustments cell yields a notes ARRAY (consumer does not crash)", () => {
    insertCheckin(1, '2026-01-01', '{}') // schema DEFAULT shape

    const latest = handlers.get('checkin:latest')!({}, USER)
    expect(latest).not.toBeNull()
    // Before the fix `adjustments` was `{}` and `.notes` undefined — this threw.
    expect(Array.isArray(latest.adjustments.notes)).toBe(true)
    expect(() => renderNotes(latest.adjustments)).not.toThrow()
    expect(latest.adjustments.calories_delta).toBe(0)
    expect(latest.adjustments.cardio_change).toBe('no change')
  })

  it('checkin:history does NOT throw on a non-JSON adjustments cell (handler stays up)', () => {
    insertCheckin(1, '2026-01-01', 'not valid json')

    // Before the fix the raw JSON.parse threw here, failing the whole handler.
    let rows: any[] = []
    expect(() => { rows = handlers.get('checkin:history')!({}, USER) }).not.toThrow()
    expect(rows).toHaveLength(1)
    expect(Array.isArray(rows[0].adjustments.notes)).toBe(true)
    expect(() => renderNotes(rows[0].adjustments)).not.toThrow()
  })

  it('round-trips a valid adjustments cell unchanged (regression guard)', () => {
    const valid = {
      calories_delta: -100,
      cardio_change: '+1 session per week',
      training_volume_change: 'no change',
      notes: ['Weight trend stalling — reduced calories by 100 kcal.'],
    }
    insertCheckin(1, '2026-01-01', JSON.stringify(valid))

    const latest = handlers.get('checkin:latest')!({}, USER)
    expect(latest.adjustments).toEqual(valid)
  })
})

describe('parseAdjustments (pure normalizer)', () => {
  it("returns a notes array for the schema-default '{}' cell", () => {
    const a = parseAdjustments('{}')
    expect(a.notes).toEqual([])
    expect(a.calories_delta).toBe(0)
    expect(a.cardio_change).toBe('no change')
    expect(a.training_volume_change).toBe('no change')
    // The exact crash the guard prevents.
    expect(() => a.notes.map((n) => n)).not.toThrow()
  })

  it('never throws on malformed / non-object / null input', () => {
    for (const bad of ['not json', '', 'null', '[1,2,3]', '42', null, undefined, 123]) {
      const a = parseAdjustments(bad as unknown)
      expect(Array.isArray(a.notes)).toBe(true)
      expect(typeof a.calories_delta).toBe('number')
    }
  })

  it('drops non-string notes and non-finite calorie deltas', () => {
    const a = parseAdjustments(JSON.stringify({ notes: ['ok', 5, null, 'also ok'], calories_delta: Infinity }))
    expect(a.notes).toEqual(['ok', 'also ok'])
    expect(a.calories_delta).toBe(0)
  })

  it('preserves a fully-formed adjustments object', () => {
    const valid = { calories_delta: 150, cardio_change: 'no change', training_volume_change: 'Reduce working sets by 20% this week', notes: ['a', 'b'] }
    expect(parseAdjustments(JSON.stringify(valid))).toEqual(valid)
  })
})
