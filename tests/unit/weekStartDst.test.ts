import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { weekStartMonday, weekStartMondayStr, addDays } from '../../src/utils/dates'

// The weekly widgets (Cardio, Posing, Training volume, Muscle coverage, the
// Progress consistency chart, the Training page sessions/calorie-burn cards) all
// need the Monday of "this week" to filter logs by date. The OLD computation was
//   new Date(now - daysFromMon * 86400000).toLocaleDateString('en-CA')
// i.e. subtract N fixed 24-hour blocks from the current instant. Across a DST
// transition a calendar day is NOT 24h, so on the US fall-back Sunday the result
// lands a day late (a Tuesday instead of the Monday), silently dropping that
// Monday's entries from every "this week" total. weekStartMonday / addDays fix it
// with calendar-day arithmetic.

// Correctness assertions below are timezone-independent: the input dates are
// constructed at LOCAL noon, far from any midnight/DST boundary, so they resolve
// to the same weekday in any host timezone.
describe('weekStartMonday — Monday-of-this-week', () => {
  it('Monday maps to itself; mid-week and Sunday map back to that Monday', () => {
    expect(weekStartMondayStr(new Date('2025-10-27T12:00:00'))).toBe('2025-10-27') // Mon
    expect(weekStartMondayStr(new Date('2025-10-29T12:00:00'))).toBe('2025-10-27') // Wed
    expect(weekStartMondayStr(new Date('2025-11-01T12:00:00'))).toBe('2025-10-27') // Sat
    expect(weekStartMondayStr(new Date('2025-11-02T12:00:00'))).toBe('2025-10-27') // Sun
    expect(weekStartMondayStr(new Date('2025-11-03T12:00:00'))).toBe('2025-11-03') // next Mon
  })

  it('returns a local-midnight Monday Date', () => {
    const mon = weekStartMonday(new Date('2025-10-29T12:00:00')) // Wed → Mon Oct 27
    expect(mon.getDay()).toBe(1) // Monday
    expect(mon.getHours()).toBe(0)
    expect([mon.getFullYear(), mon.getMonth(), mon.getDate()]).toEqual([2025, 9, 27])
  })
})

describe('addDays — calendar day arithmetic', () => {
  it('rolls month/year boundaries correctly', () => {
    expect(addDays(new Date('2025-01-01T12:00:00'), -1).toLocaleDateString('en-CA')).toBe('2024-12-31')
    expect(addDays(new Date('2025-01-31T12:00:00'), 1).toLocaleDateString('en-CA')).toBe('2025-02-01')
  })

  it('an 8-week window stepped by addDays stays anchored to Mondays', () => {
    const thisMonday = weekStartMonday(new Date('2025-11-10T12:00:00')) // Mon Nov 10
    for (let off = -7; off <= 0; off++) {
      expect(addDays(thisMonday, off * 7).getDay(), `offset ${off}`).toBe(1)
    }
  })
})

// The DST-specific regression: ICU caches the timezone per vitest worker and
// can't be switched in-process, so run the REAL dates.ts source (transpiled with
// the esbuild already in node_modules) in a child node process under a real
// DST-observing TZ. This both reproduces the old bug and proves the fix, on the
// actual shipping code, independent of the host machine's timezone.
describe('weekStartMonday — DST fall-back Sunday (America/New_York)', () => {
  it('returns the Monday that began this week, where the old ms math returned the Tuesday', () => {
    const datesSrc = path.resolve(process.cwd(), 'src/utils/dates.ts')
    const child = `
      const fs = require('fs')
      const esbuild = require('esbuild')
      const { code } = esbuild.transformSync(fs.readFileSync(${JSON.stringify(datesSrc)}, 'utf8'), { loader: 'ts', format: 'cjs' })
      const mod = { exports: {} }
      new Function('exports', 'module', 'require', code)(mod.exports, mod, require)
      // Sun Nov 2 2025 23:30 America/New_York — the DST fall-back day.
      const now = new Date('2025-11-03T04:30:00Z')
      const jsDay = now.getDay()
      const daysFromMon = jsDay === 0 ? 6 : jsDay - 1
      const oldBuggy = new Date(now.getTime() - daysFromMon * 86400000).toLocaleDateString('en-CA')
      process.stdout.write(JSON.stringify({
        localNow: now.toLocaleDateString('en-CA'),
        oldBuggy,
        fixed: mod.exports.weekStartMondayStr(now),
      }))
    `
    const out = execFileSync(process.execPath, ['-e', child], {
      env: { ...process.env, TZ: 'America/New_York' },
      encoding: 'utf8',
    })
    const { localNow, oldBuggy, fixed } = JSON.parse(out)
    expect(localNow).toBe('2025-11-02')        // really the fall-back Sunday, local time
    expect(oldBuggy).toBe('2025-10-28')         // the defect: a Tuesday, one day too late
    expect(fixed).toBe('2025-10-27')            // the fix: the Monday this week actually began
  })
})
