import { describe, it, expect } from 'vitest'
import { cardioMinutesOn, nextCardioLog } from '../../src/utils/cardio'

// Regression guard for the Diet-page cardio stepper silently undercounting — and, on
// a +/- tap, DESTROYING — the multi-session-per-day data the dashboard CardioWidget
// (`cardioStore`) writes into the shared `cardio_log` localStorage key.
//
// The dashboard allows MULTIPLE cardio sessions per day (each with its own id). The
// Diet page used `log.find(e => e.date === day)?.minutes` — only the FIRST session —
// so a day with [LISS 30, HIIT 20] read back as 30 (not 50), undercounting today's
// and the week's totals. Worse, its stepper write (`log.filter(date !== today)` + one
// new entry) collapsed ALL of today's sessions into a single entry sized from that
// wrong 30 baseline, so a "+5" tap stored 35 — permanently losing 15 real minutes.
describe('cardioMinutesOn — sums every session logged on a day', () => {
  const log = [
    { id: 'a', date: '2026-10-27', type: 'LISS', minutes: 30 },
    { id: 'b', date: '2026-10-27', type: 'HIIT', minutes: 20 },
    { id: 'c', date: '2026-10-26', type: 'Bike', minutes: 40 },
  ]

  it('sums multiple same-day sessions (30 + 20 → 50, NOT the first entry 30)', () => {
    expect(cardioMinutesOn(log, '2026-10-27')).toBe(50)
  })

  it('returns a single-session day unchanged', () => {
    expect(cardioMinutesOn(log, '2026-10-26')).toBe(40)
  })

  it('returns 0 for a day with no sessions', () => {
    expect(cardioMinutesOn(log, '2026-10-25')).toBe(0)
  })

  it('treats a non-array / corrupt log as 0 minutes (no throw)', () => {
    expect(cardioMinutesOn(null, '2026-10-27')).toBe(0)
    expect(cardioMinutesOn('nope', '2026-10-27')).toBe(0)
    expect(cardioMinutesOn([null, 5, 'x'], '2026-10-27')).toBe(0)
  })

  it('ignores non-finite / non-positive minutes in an entry (hand-edited storage)', () => {
    const bad = [
      { date: '2026-10-27', minutes: '30' as unknown as number },
      { date: '2026-10-27', minutes: NaN },
      { date: '2026-10-27', minutes: -10 },
      { date: '2026-10-27', minutes: 25 },
    ]
    // only the finite, positive 25 counts (the "30" string is coerced then counted too)
    expect(cardioMinutesOn(bad, '2026-10-27')).toBe(55)
  })
})

describe('nextCardioLog — adjusts today total without losing minutes or other days', () => {
  const log = [
    { id: 'a', date: '2026-10-27', type: 'LISS', minutes: 30 },
    { id: 'b', date: '2026-10-27', type: 'HIIT', minutes: 20 },
    { id: 'c', date: '2026-10-26', type: 'Bike', minutes: 40 },
  ]

  it('+5 bumps the TRUE 50-min total to 55 (old code produced 35, losing 15 min)', () => {
    const { log: out, total } = nextCardioLog(log, '2026-10-27', 5)
    expect(total).toBe(55)
    const today = out.filter((e) => e.date === '2026-10-27')
    expect(today).toHaveLength(1) // today's sessions collapse into one total-bearing entry
    expect(today[0].minutes).toBe(55)
  })

  it('preserves every OTHER day untouched', () => {
    const { log: out } = nextCardioLog(log, '2026-10-27', 5)
    const other = out.filter((e) => e.date === '2026-10-26')
    expect(other).toEqual([{ id: 'c', date: '2026-10-26', type: 'Bike', minutes: 40 }])
  })

  it('-5 removes 5 from the correct 50 total → 45 (not from the stale 30)', () => {
    const { total } = nextCardioLog(log, '2026-10-27', -5)
    expect(total).toBe(45)
  })

  it('clamps the total to [0, 120]', () => {
    expect(nextCardioLog(log, '2026-10-27', 1000).total).toBe(120)
    expect(nextCardioLog(log, '2026-10-27', -1000).total).toBe(0)
  })

  it('drops today entirely when the total reaches 0', () => {
    const { log: out, total } = nextCardioLog(log, '2026-10-27', -50)
    expect(total).toBe(0)
    expect(out.some((e) => e.date === '2026-10-27')).toBe(false)
    expect(out.some((e) => e.date === '2026-10-26')).toBe(true)
  })

  it('reuses an existing session id and type so the store need not re-migrate', () => {
    const { log: out } = nextCardioLog(log, '2026-10-27', 5)
    const today = out.find((e) => e.date === '2026-10-27')!
    expect(today.id).toBe('a')
    expect(today.type).toBe('LISS')
  })

  it('creates a fresh today entry (default LISS) when the day had none', () => {
    const { log: out, total } = nextCardioLog(log, '2026-10-25', 10)
    expect(total).toBe(10)
    const today = out.find((e) => e.date === '2026-10-25')!
    expect(today.type).toBe('LISS')
    expect(today.minutes).toBe(10)
  })

  it('treats a corrupt / non-array log as empty (no throw)', () => {
    expect(nextCardioLog(null, '2026-10-27', 5)).toEqual({ log: [{ date: '2026-10-27', type: 'LISS', minutes: 5 }], total: 5 })
  })
})
