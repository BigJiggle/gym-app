const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000

type TrackedCheckin = { check_in_date: string }

/**
 * "Weeks Tracked" = the real calendar span from the earliest check-in to the
 * most recent, in whole weeks — NOT the number of check-ins.
 *
 * A daily-cadence (or otherwise more-than-weekly) athlete logs many check-ins
 * per week, so counting rows overstates the span: 20 daily weigh-ins over three
 * weeks would read as "20 weeks tracked". Measuring the actual first→last span
 * keeps the stat honest regardless of check-in cadence or duplicate same-week
 * entries. Order-independent (uses min/max), rounds to the nearest whole week,
 * skips non-finite dates, and returns 0 for fewer than 2 usable entries.
 */
export function computeWeeksTracked(checkins: TrackedCheckin[]): number {
  if (!checkins || checkins.length < 2) return 0
  const times = checkins
    .map(c => new Date(c.check_in_date).getTime())
    .filter(t => Number.isFinite(t))
  if (times.length < 2) return 0
  const spanMs = Math.max(...times) - Math.min(...times)
  return Math.max(0, Math.round(spanMs / MS_PER_WEEK))
}
