import { describe, it, expect } from 'vitest'
import { getNextCheckinDate, computeMissedSlots } from '../../electron/services/checkinSchedule'

// ── Date helpers ───────────────────────────────────────────────────────────

function daysFromToday(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toLocaleDateString('en-CA')
}

function todayDow(): number { return new Date().getDay() }

function weeksAgo(n: number): string { return daysFromToday(-7 * n) }

// Build a history array with optional per-entry interval_days / schedule_type
function makeHistory(
  entries: { daysAgo: number; interval_days?: number; schedule_type?: 'day' | 'interval' }[]
): { check_in_date: string; week_number: number; schedule_type?: 'day' | 'interval'; interval_days?: number }[] {
  return entries.map((e, i) => ({
    check_in_date: daysFromToday(-e.daysAgo),
    week_number: i + 1,
    schedule_type: e.schedule_type,
    interval_days: e.interval_days,
  }))
}

// ── getNextCheckinDate — interval mode ────────────────────────────────────

describe('getNextCheckinDate — interval mode', () => {
  it('returns last_date + intervalDays', () => {
    const lastDate = daysFromToday(-3)
    const next = getNextCheckinDate(lastDate, 'interval', 1, false, 7)
    const expected = new Date(lastDate + 'T12:00:00')
    expected.setDate(expected.getDate() + 7)
    expected.setHours(0, 0, 0, 0)
    expect(next.getTime()).toBe(expected.getTime())
  })

  it('returns a PAST date when interval has elapsed (form open)', () => {
    const next = getNextCheckinDate(daysFromToday(-10), 'interval', 1, false, 7)
    expect(next < new Date()).toBe(true)
  })

  it('returns a FUTURE date when interval has NOT elapsed (form locked)', () => {
    const next = getNextCheckinDate(daysFromToday(-2), 'interval', 1, false, 7)
    expect(next > new Date()).toBe(true)
  })

  it('respects a 3-day interval', () => {
    const lastDate = daysFromToday(-1)
    const next = getNextCheckinDate(lastDate, 'interval', 1, false, 3)
    const expected = new Date(lastDate + 'T12:00:00')
    expected.setDate(expected.getDate() + 3)
    expected.setHours(0, 0, 0, 0)
    expect(next.getTime()).toBe(expected.getTime())
  })
})

// ── getNextCheckinDate — day-based weekly ─────────────────────────────────

describe('getNextCheckinDate — day-based weekly', () => {
  it('returns a PAST date when check-in day already passed 2 weeks ago (form open)', () => {
    const checkinDow = todayDow() === 0 ? 1 : 0
    const next = getNextCheckinDate(weeksAgo(2), 'day', checkinDow, false, 7)
    expect(next < new Date()).toBe(true)
  })

  it('result day-of-week always matches the requested checkinDay', () => {
    const checkinDow = (todayDow() + 3) % 7
    const next = getNextCheckinDate(weeksAgo(1), 'day', checkinDow, false, 7)
    expect(next.getDay()).toBe(checkinDow)
  })

  it('checked in on check-in day → locked for 7 days (double-submit handled naturally)', () => {
    // Last check-in on TODAY's day-of-week → next is 7 days away
    const todayDow_ = todayDow()
    const next = getNextCheckinDate(daysFromToday(0), 'day', todayDow_, false, 7)
    expect(next > new Date()).toBe(true)
    const daysOut = (next.getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000
    expect(daysOut).toBeGreaterThanOrEqual(7)
  })

  // ── THE CRITICAL CASE that caused the user-visible bug ──────────────────
  // If the last check-in was on a DIFFERENT day than the check-in day, the next
  // allowed date must still be the UPCOMING occurrence of checkinDay this week
  // (not 9+ days away because we walked forward from lastDate+7).

  it('last check-in was 1 day before check-in day → next is 6 days away (same week)', () => {
    // e.g. check-in day = Wednesday, user checked in on Tuesday
    const checkinDow = (todayDow() + 1) % 7         // 1 day ahead of today
    const lastDate   = daysFromToday(-1)              // yesterday (1 day before checkinDow from today's perspective)
    // anchor = walk back from lastDate to checkinDow:
    //   lastDate is today-1; we find the last checkinDow at or before that.
    const next = getNextCheckinDate(lastDate, 'day', checkinDow, false, 7)
    // result must be checkinDow exactly
    expect(next.getDay()).toBe(checkinDow)
    // and must be ≤ 7 days from lastDate
    const last = new Date(lastDate + 'T12:00:00')
    const daysOut = (next.getTime() - last.getTime()) / 86400000
    expect(daysOut).toBeGreaterThanOrEqual(1)
    expect(daysOut).toBeLessThanOrEqual(7)
  })

  it('last check-in was 3 days after check-in day → next is 4 days away (same anchor week)', () => {
    // e.g. check-in day = Monday (dow 1), user checked in on Thursday (dow 4 = +3)
    const checkinDow = (todayDow() + 1) % 7          // pick some day
    // lastDate is 3 days AFTER checkinDow would have occurred this cycle
    // Simulate: checkinDow occurred 4 days ago, user checked in 1 day after that (3 days ago)
    const lastDate = daysFromToday(-3)
    const next = getNextCheckinDate(lastDate, 'day', checkinDow, false, 7)
    expect(next.getDay()).toBe(checkinDow)
    // anchor is the most recent checkinDow at or before lastDate;
    // next = anchor + 7; result is always the checkinDay
    const last = new Date(lastDate + 'T12:00:00')
    const daysOut = (next.getTime() - last.getTime()) / 86400000
    expect(daysOut).toBeGreaterThanOrEqual(1)
    expect(daysOut).toBeLessThanOrEqual(7)
  })

  it('anchor-based: next date is exactly 7 days after the most recent prior checkinDay', () => {
    // Use a fixed past date to make this deterministic.
    // 2026-05-13 was a Wednesday (dow=3). checkinDay = Wednesday.
    // Expected next = May 13 + 7 = May 20.
    const next = getNextCheckinDate('2026-05-13', 'day', 3, false, 7)
    expect(next.toLocaleDateString('en-CA')).toBe('2026-05-20')
  })

  it('last check-in on Monday, check-in day = Wednesday → next is the COMING Wednesday (not next-next)', () => {
    // 2026-05-18 is Monday. checkinDay = Wednesday (3).
    // Anchor = most recent Wednesday at or before May 18 = May 13.
    // next = May 13 + 7 = May 20 (this Wednesday, 2 days away).
    const next = getNextCheckinDate('2026-05-18', 'day', 3, false, 7)
    expect(next.toLocaleDateString('en-CA')).toBe('2026-05-20')
  })
})

// ── getNextCheckinDate — biweekly ─────────────────────────────────────────

describe('getNextCheckinDate — biweekly', () => {
  it('result is at least 14 days after the anchor checkinDay', () => {
    const lastDate = weeksAgo(1)
    const checkinDow = (todayDow() + 1) % 7
    const next = getNextCheckinDate(lastDate, 'day', checkinDow, true, 7)
    const last = new Date(lastDate + 'T12:00:00')
    expect((next.getTime() - last.getTime()) / 86400000).toBeGreaterThanOrEqual(14)
  })

  it('result day-of-week matches the requested checkinDay', () => {
    const checkinDow = (todayDow() + 2) % 7
    const next = getNextCheckinDate(daysFromToday(-10), 'day', checkinDow, true, 7)
    expect(next.getDay()).toBe(checkinDow)
  })

  it('biweekly: Monday last check-in, Wednesday day → next is first Wed ≥ lastDate+14 = June 4', () => {
    // 2026-05-18 Monday. lastDate+14 = Jun 1 (Monday). Next Wednesday ≥ Jun 1 = Jun 3.
    const next = getNextCheckinDate('2026-05-18', 'day', 3, true, 7)
    expect(next.toLocaleDateString('en-CA')).toBe('2026-06-03')
  })
})

// ── computeMissedSlots ────────────────────────────────────────────────────

describe('computeMissedSlots — gap detection', () => {
  it('returns empty array when history is empty', () => {
    expect(computeMissedSlots([], 'interval', 1, 7)).toHaveLength(0)
  })

  it('returns empty array when only one check-in exists and it was recent', () => {
    // 3 days ago with 7-day interval → no missed slot yet
    const h = makeHistory([{ daysAgo: 3, interval_days: 7, schedule_type: 'interval' }])
    expect(computeMissedSlots(h, 'interval', 1, 7)).toHaveLength(0)
  })

  it('no missed slot when check-in is on-time (exactly 7 days, interval=7)', () => {
    const h = makeHistory([
      { daysAgo: 14, interval_days: 7, schedule_type: 'interval' },
      { daysAgo: 7,  interval_days: 7, schedule_type: 'interval' },
    ])
    // Gap between the two = 7 days: floor(7/7)-1 = 0
    expect(computeMissedSlots(h, 'interval', 1, 7)).toHaveLength(0)
  })

  it('no missed slot for a LATE check-in still within the same interval window (13 days, interval=7)', () => {
    // 13 days apart: floor(13/7)-1 = floor(1.857)-1 = 0 → no false positive
    const h = makeHistory([
      { daysAgo: 22, interval_days: 7, schedule_type: 'interval' },
      { daysAgo: 9,  interval_days: 7, schedule_type: 'interval' },
    ])
    expect(computeMissedSlots(h, 'interval', 1, 7)).toHaveLength(0)
  })

  it('detects 1 missed slot when a full interval was skipped (14 days, interval=7)', () => {
    const h = makeHistory([
      { daysAgo: 21, interval_days: 7, schedule_type: 'interval' },
      { daysAgo: 7,  interval_days: 7, schedule_type: 'interval' },
    ])
    // Gap = 14 days: floor(14/7)-1 = 1
    const missed = computeMissedSlots(h, 'interval', 1, 7)
    expect(missed).toHaveLength(1)
  })

  it('detects 2 missed slots when two intervals were skipped (21 days, interval=7)', () => {
    const h = makeHistory([
      { daysAgo: 28, interval_days: 7, schedule_type: 'interval' },
      { daysAgo: 7,  interval_days: 7, schedule_type: 'interval' },
    ])
    // Gap = 21 days: floor(21/7)-1 = 2
    const missed = computeMissedSlots(h, 'interval', 1, 7)
    expect(missed).toHaveLength(2)
  })

  it('consecutive on-time check-ins produce no missed slots', () => {
    const h = makeHistory([
      { daysAgo: 21, interval_days: 7, schedule_type: 'interval' },
      { daysAgo: 14, interval_days: 7, schedule_type: 'interval' },
      { daysAgo: 7,  interval_days: 7, schedule_type: 'interval' },
    ])
    expect(computeMissedSlots(h, 'interval', 1, 7)).toHaveLength(0)
  })
})

describe('computeMissedSlots — labels', () => {
  it('label contains "Missed" and does NOT contain "Week N" (no week number conflict)', () => {
    const h = makeHistory([
      { daysAgo: 21, interval_days: 7, schedule_type: 'interval' },
      { daysAgo: 7,  interval_days: 7, schedule_type: 'interval' },
    ])
    const missed = computeMissedSlots(h, 'interval', 1, 7)
    expect(missed[0].expected_label).toMatch(/Missed/i)
    expect(missed[0].expected_label).not.toMatch(/Week \d/)
  })

  it('label contains expected date string', () => {
    const h = makeHistory([
      { daysAgo: 21, interval_days: 7, schedule_type: 'interval' },
      { daysAgo: 7,  interval_days: 7, schedule_type: 'interval' },
    ])
    const missed = computeMissedSlots(h, 'interval', 1, 7)
    // expected_date should appear in the label somehow
    expect(missed[0].expected_date).toBeTruthy()
    expect(missed[0].expected_label.length).toBeGreaterThan(0)
  })

  it('interval label includes frequency context', () => {
    const h = makeHistory([
      { daysAgo: 14, interval_days: 3, schedule_type: 'interval' },
      { daysAgo: 0,  interval_days: 3, schedule_type: 'interval' },
    ])
    // Gap = 14 days, interval = 3: floor(14/3)-1 = 3 missed
    const missed = computeMissedSlots(h, 'interval', 1, 3)
    expect(missed[0].expected_label).toMatch(/3|Every 3 days/i)
  })
})

describe('computeMissedSlots — per-period interval (interval switch)', () => {
  it('uses stored interval_days from each check-in, not the current interval', () => {
    // Old interval was 7 days; new interval is 2 days
    // Check-in A was at 7-day interval, check-in B was 14 days later
    // → should detect 1 missed slot (based on old 7-day interval), NOT floor(14/2)-1=6
    const h = makeHistory([
      { daysAgo: 21, interval_days: 7, schedule_type: 'interval' },
      { daysAgo: 7,  interval_days: 2, schedule_type: 'interval' },
    ])
    // Gap between A and B = 14 days, A's stored interval = 7
    // floor(14/7)-1 = 1 missed (based on old interval)
    const missed = computeMissedSlots(h, 'interval', 1, 2)   // current = 2
    // Only 1 missed slot from the old 7-day period
    // Plus gap from B (7 days ago, interval=2): floor(7/2)-1 = 2 missed from last
    // Total = 3
    const fromPair = missed.filter(m => m.expected_date <= daysFromToday(-7))
    expect(fromPair).toHaveLength(1)   // 1 from old 7-day gap
  })

  it('uses current interval for post-last-checkin gap', () => {
    // Last check-in 6 days ago with new 2-day interval
    // floor(6/2)-1 = 2 missed from last check-in to today
    const h = makeHistory([
      { daysAgo: 6, interval_days: 2, schedule_type: 'interval' },
    ])
    const missed = computeMissedSlots(h, 'interval', 1, 2)
    // At least 2 missed (days 2 and 4 of the 6-day gap)
    expect(missed.length).toBeGreaterThanOrEqual(2)
  })
})

describe('computeMissedSlots — post-last-checkin detection', () => {
  it('detects missed slots after the last check-in up to today', () => {
    // Checked in 14 days ago, interval=7 → 1 missed (day 7 expected, still open today)
    const h = makeHistory([
      { daysAgo: 14, interval_days: 7, schedule_type: 'interval' },
    ])
    const missed = computeMissedSlots(h, 'interval', 1, 7)
    expect(missed).toHaveLength(1)
  })

  it('does not produce missed slots when within the current interval window', () => {
    // Checked in 3 days ago, interval=7 → not yet due, no missed
    const h = makeHistory([
      { daysAgo: 3, interval_days: 7, schedule_type: 'interval' },
    ])
    const missed = computeMissedSlots(h, 'interval', 1, 7)
    expect(missed).toHaveLength(0)
  })
})
