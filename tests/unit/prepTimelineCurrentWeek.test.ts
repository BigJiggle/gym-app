// Regression test for buildPrepTimeline dropping the current week for far-out shows.
//
// buildPrepTimeline capped its window with `startWeek = Math.min(currentWeek + 2, 24)`
// and only ever flagged `isCurrentWeek: w === currentWeek` inside a `w = startWeek..0`
// loop. When a show is 25+ weeks out (`currentWeek > 24`) the loop never reaches
// `currentWeek`, so NO item is flagged `isCurrentWeek`. Both consumers of the
// timeline then break:
//   - `PrepGuidanceWidget` does `timeline.find(w => w.isCurrentWeek) ?? null` and
//     renders nothing — a competition-only widget the user explicitly enabled
//     (they have a show) silently disappears.
//   - the Education prep timeline loses its current-week highlight + auto-expand.
//
// A bodybuilding off-season / full prep is commonly planned 6+ months out, so a
// show 25+ weeks away is a normal, reachable state.

import { describe, it, expect, afterEach, vi } from 'vitest'
import { buildPrepTimeline } from '../../src/data/competitionPrep'

function showDateDaysFromNow(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  // Local YYYY-MM-DD (the format shows are stored in).
  return d.toLocaleDateString('en-CA')
}

describe('buildPrepTimeline — current week is always flagged, even beyond the display cap', () => {
  afterEach(() => vi.useRealTimers())

  it('flags the current week for a show ~30 weeks out (currentWeek > 24 cap)', () => {
    // Fix the clock to a stable mid-morning so the midnight-based math is deterministic.
    vi.setSystemTime(new Date('2026-01-15T09:00:00'))
    // ~30 weeks out: 30 * 7 = 210 days. Use 211 so Math.floor(totalDays/7) === 30.
    const timeline = buildPrepTimeline(showDateDaysFromNow(211))
    const current = timeline.find((w) => w.isCurrentWeek)
    expect(current).toBeDefined()
    expect(current!.weeksOut).toBe(30)
    // Exactly one item should be flagged as the current week.
    expect(timeline.filter((w) => w.isCurrentWeek)).toHaveLength(1)
    // The current week is in the future, not past.
    expect(current!.isPast).toBe(false)
    // Its guidance resolves to real (off-season) content, not undefined.
    expect(current!.guidance.phase).toBeTruthy()
  })

  it('keeps the normal (<=24 weeks out) behaviour unchanged — current week flagged inside the window', () => {
    vi.setSystemTime(new Date('2026-01-15T09:00:00'))
    // 10 weeks out: 10 * 7 = 70 days, +1 for the floor.
    const timeline = buildPrepTimeline(showDateDaysFromNow(71))
    const current = timeline.find((w) => w.isCurrentWeek)
    expect(current).toBeDefined()
    expect(current!.weeksOut).toBe(10)
    expect(timeline.filter((w) => w.isCurrentWeek)).toHaveLength(1)
    // 2 weeks of past context above the current week are shown (weeksOut 12).
    expect(timeline[0].weeksOut).toBe(12)
    expect(timeline[0].isPast).toBe(true)
    // Week 0 (peak week) is always the last row.
    expect(timeline[timeline.length - 1].weeksOut).toBe(0)
  })

  it('flags the current week right at the boundary (25 weeks out)', () => {
    vi.setSystemTime(new Date('2026-01-15T09:00:00'))
    const timeline = buildPrepTimeline(showDateDaysFromNow(25 * 7 + 1))
    const current = timeline.find((w) => w.isCurrentWeek)
    expect(current).toBeDefined()
    expect(current!.weeksOut).toBe(25)
    expect(timeline.filter((w) => w.isCurrentWeek)).toHaveLength(1)
  })
})
