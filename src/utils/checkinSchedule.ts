/**
 * Pure schedule-logic helpers shared between the renderer and the main process.
 * No DB, no IPC — only date arithmetic.
 */

import type { CheckIn } from '../types'

export interface MissedSlot {
  expected_date: string
  expected_label: string
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function getDaysBetween(dateA: string, dateB: string): number {
  return Math.round(
    (new Date(dateB + 'T12:00:00').getTime() - new Date(dateA + 'T12:00:00').getTime())
    / 86400000
  )
}

function countMissedBetween(dateA: string, dateB: string, interval: number): number {
  const days = getDaysBetween(dateA, dateB)
  return Math.max(0, Math.floor(days / interval) - 1)
}

function missedLabel(
  dateStr: string,
  schedType: 'day' | 'interval',
  intervalDays: number
): string {
  const d = new Date(dateStr + 'T12:00:00')
  const formatted = d.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  })
  if (schedType === 'interval') {
    const freq =
      intervalDays === 1 ? 'Daily' :
      intervalDays === 7 ? 'Weekly' :
      `Every ${intervalDays} days`
    return `Missed — Expected ${formatted} (${freq})`
  }
  return `Missed — Expected ${formatted}`
}

function addMissedFrom(
  into: MissedSlot[],
  fromDate: string,
  count: number,
  interval: number,
  schedType: 'day' | 'interval',
  checkinDay: number
): void {
  let probe = fromDate
  for (let k = 0; k < count; k++) {
    const d = new Date(probe + 'T12:00:00')
    if (schedType === 'interval') {
      d.setDate(d.getDate() + interval)
    } else {
      // Day mode steps by the effective cadence (7 weekly, 14 biweekly) then
      // re-aligns to the correct day-of-week.
      d.setDate(d.getDate() + interval)
      let guard = 0
      while (d.getDay() !== checkinDay && guard++ < 7) d.setDate(d.getDate() + 1)
    }
    probe = d.toLocaleDateString('en-CA')
    into.push({ expected_date: probe, expected_label: missedLabel(probe, schedType, interval) })
  }
}

// Effective interval (in days) for a check-in's cadence. Day-based cadence is
// defined by day-of-week / biweekly — NOT by the interval_days column, which
// stays at its default in day mode (the interval input only appears in interval
// mode). Using interval_days there made biweekly (14-day) users see a phantom
// "missed" slot in the middle of every real 14-day gap.
function effectiveInterval(
  schedType: 'day' | 'interval',
  storedIntervalDays: number | undefined,
  currentIntervalDays: number,
  biweekly: boolean
): number {
  if (schedType === 'day') return biweekly ? 14 : 7
  return storedIntervalDays ?? currentIntervalDays
}

export function computeMissedSlots(
  history: Pick<CheckIn, 'check_in_date' | 'week_number' | 'schedule_type' | 'interval_days'>[],
  currentScheduleType: 'day' | 'interval',
  checkinDay: number,
  currentIntervalDays: number,
  biweekly = false
): MissedSlot[] {
  if (history.length === 0) return []

  const sorted = [...history].sort((a, b) =>
    a.check_in_date.localeCompare(b.check_in_date)
  )
  const missed: MissedSlot[] = []

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]
    const b = sorted[i + 1]
    const schedType = (a.schedule_type  ?? currentScheduleType) as 'day' | 'interval'
    const interval  = effectiveInterval(schedType, a.interval_days, currentIntervalDays, biweekly)
    const missedCount = countMissedBetween(a.check_in_date, b.check_in_date, interval)
    if (missedCount > 0) {
      addMissedFrom(missed, a.check_in_date, missedCount, interval, schedType, checkinDay)
    }
  }

  const last = sorted[sorted.length - 1]
  const today = new Date().toLocaleDateString('en-CA')
  const lastSchedType = (last.schedule_type  ?? currentScheduleType) as 'day' | 'interval'
  const lastInterval  = effectiveInterval(lastSchedType, last.interval_days, currentIntervalDays, biweekly)
  const missedFromLast = countMissedBetween(last.check_in_date, today, lastInterval)
  if (missedFromLast > 0) {
    addMissedFrom(missed, last.check_in_date, missedFromLast, lastInterval, lastSchedType, checkinDay)
  }

  return missed
}
