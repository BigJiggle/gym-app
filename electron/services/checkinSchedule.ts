/**
 * Pure schedule-logic helpers — no DB, no IPC.
 * Extracted so they can be unit-tested independently of Electron.
 */

interface CheckIn {
  check_in_date: string
  week_number: number
  schedule_type?: 'day' | 'interval'
  interval_days?: number
}

// ── Next allowed check-in date ─────────────────────────────────────────────

/**
 * Compute the earliest date on which the user may submit their next check-in.
 *
 * Interval mode   : last_date + intervalDays
 * Day-based weekly: first occurrence of checkinDay at or after last_date + 7
 * Biweekly        : first occurrence of checkinDay at or after last_date + 14
 *
 * Key invariant: if the returned date is already in the past the caller
 * interprets it as "form open now" — there is NO extra lockout for missed
 * check-in deadlines. Users who are late can still submit.
 */
export function getNextCheckinDate(
  lastDateStr: string,
  scheduleType: 'day' | 'interval',
  checkinDay: number,
  biweekly: boolean,
  intervalDays: number
): Date {
  // Parse stored date at local noon to avoid DST / UTC-boundary issues
  const last = new Date(lastDateStr + 'T12:00:00')

  let next: Date

  if (scheduleType === 'interval') {
    next = new Date(last)
    next.setDate(last.getDate() + intervalDays)
  } else if (!biweekly) {
    // Find the most recent occurrence of checkinDay at or before lastDate (walk back).
    // Adding 7 to that anchor gives the correct next weekly slot — regardless of
    // whether the user checked in on the day itself, before it, or after it late.
    //
    // Walking forward from lastDate+7 was wrong: if the last check-in was Monday
    // and the check-in day is Wednesday, forward-walking landed on Wednesday of
    // NEXT week (9 days) instead of THIS week's Wednesday (2 days).
    const anchor = new Date(last)
    let guard = 0
    while (anchor.getDay() !== checkinDay && guard++ < 7) {
      anchor.setDate(anchor.getDate() - 1)
    }
    next = new Date(anchor)
    next.setDate(anchor.getDate() + 7)
    // Double-submit is handled naturally: if the user checked in ON their check-in
    // day, anchor === that day and next === 7 days later → form correctly locked.
  } else {
    // Bi-weekly: must wait 14 days from the actual check-in date, then land on
    // the next occurrence of checkinDay. The 14-day minimum is from lastDate
    // (not from an anchor) so late check-ins don't shrink the wait window.
    const earliest = new Date(last)
    earliest.setDate(last.getDate() + 14)
    next = new Date(earliest)
    let guard = 0
    while (next.getDay() !== checkinDay && guard++ < 7) {
      next.setDate(next.getDate() + 1)
    }
  }

  // Unlock at the very START of the target day (00:00:00 local)
  next.setHours(0, 0, 0, 0)
  return next
}

// ── Missed slot detection ──────────────────────────────────────────────────

export interface MissedSlot {
  expected_date: string   // YYYY-MM-DD
  expected_label: string  // e.g. "Missed — Expected Monday, May 12, 2026"
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function getDaysBetween(dateA: string, dateB: string): number {
  return Math.round(
    (new Date(dateB + 'T12:00:00').getTime() - new Date(dateA + 'T12:00:00').getTime())
    / 86400000
  )
}

/**
 * How many check-in intervals were entirely skipped between dateA and dateB?
 *
 * Uses floor(gap / interval) - 1:
 *  - A check-in submitted late (but within < interval days late) scores 0 missed.
 *    e.g. interval=7, gap=13 → floor(13/7)-1 = 0  → no false positive for "late" submissions.
 *  - Exactly one full interval skipped: gap=14 → floor(14/7)-1 = 1 → 1 missed.
 *  - Two intervals skipped:  gap=21 → 2 missed.
 */
function countMissedBetween(dateA: string, dateB: string, interval: number): number {
  const days = getDaysBetween(dateA, dateB)
  return Math.max(0, Math.floor(days / interval) - 1)
}

/** Build a human-readable label for a missed slot date. */
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

/** Walk forward from fromDate by N intervals and push each as a missed slot. */
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
      d.setDate(d.getDate() + 7)
      // re-align to the correct day-of-week
      let guard = 0
      while (d.getDay() !== checkinDay && guard++ < 7) d.setDate(d.getDate() + 1)
    }
    probe = d.toLocaleDateString('en-CA')
    into.push({ expected_date: probe, expected_label: missedLabel(probe, schedType, interval) })
  }
}

/**
 * Given the full check-in history (any order), compute dates that were
 * expected based on the schedule but have no corresponding check-in record.
 *
 * Rules:
 * 1. Per-period interval: the interval stored on check-in A is used for the
 *    gap between A and B. This preserves missed-slot detection across interval
 *    changes — old periods keep their original cadence.
 * 2. Late ≠ missed: a check-in is NOT missed if it arrives within one full
 *    interval of the expected date. Only fully-skipped intervals are shown.
 * 3. Post-last-check-in: missed slots after the most recent check-in up to
 *    today are also detected (using the last check-in's stored interval).
 *
 * Returns slots sorted oldest-first.
 */
export function computeMissedSlots(
  history: Pick<CheckIn, 'check_in_date' | 'week_number' | 'schedule_type' | 'interval_days'>[],
  currentScheduleType: 'day' | 'interval',
  checkinDay: number,
  currentIntervalDays: number
): MissedSlot[] {
  if (history.length === 0) return []

  const sorted = [...history].sort((a, b) =>
    a.check_in_date.localeCompare(b.check_in_date)
  )
  const missed: MissedSlot[] = []

  // ── Gaps between consecutive existing check-ins ──────────────────────────
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]
    const b = sorted[i + 1]

    // Use the interval that was active when check-in A was submitted.
    // Falls back to current settings for legacy rows without stored interval.
    const interval  = (a.interval_days  ?? currentIntervalDays)
    const schedType = (a.schedule_type  ?? currentScheduleType) as 'day' | 'interval'

    const missedCount = countMissedBetween(a.check_in_date, b.check_in_date, interval)
    if (missedCount > 0) {
      addMissedFrom(missed, a.check_in_date, missedCount, interval, schedType, checkinDay)
    }
  }

  // ── Gap from last check-in to today ──────────────────────────────────────
  // Uses the last check-in's stored interval so that an interval change is
  // respected: if the user switched to 2-day intervals, a 2-day skip shows up.
  const last = sorted[sorted.length - 1]
  const today = new Date().toLocaleDateString('en-CA')
  const lastInterval  = (last.interval_days  ?? currentIntervalDays)
  const lastSchedType = (last.schedule_type  ?? currentScheduleType) as 'day' | 'interval'

  const missedFromLast = countMissedBetween(last.check_in_date, today, lastInterval)
  if (missedFromLast > 0) {
    addMissedFrom(missed, last.check_in_date, missedFromLast, lastInterval, lastSchedType, checkinDay)
  }

  return missed
}
