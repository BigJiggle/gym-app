// Minimum span (in weeks) required before we report a per-week weight rate.
// Below this, dividing a raw delta by a fraction-of-a-week extrapolates daily
// water/glycogen noise ~7x, which flips the on-track badge and blows up the
// show-day projection. The Measurement Changes card already floors at 1 week;
// this keeps the weight rate consistent with it.
const MIN_SPAN_WEEKS = 1
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000

type RateCheckin = { check_in_date: string; weight_kg: number }

/**
 * Average per-week weight change across the recent check-in window.
 *
 * `checkins` are newest-first (as the history query returns them). The window
 * starts at the `minWindow` most-recent entries for smoothing, then keeps
 * reaching further back until the span between the newest entry and the anchor
 * is at least one week — so a daily-cadence athlete gets a real weekly rate
 * instead of a noise-amplified extrapolation. Returns null when there is less
 * than one week of usable history (or fewer than 2 finite entries), so callers
 * fall back to their "collecting data" state rather than showing garbage.
 */
export function computeWeeklyWeightRate(
  checkins: RateCheckin[],
  minWindow = 4
): number | null {
  if (!checkins || checkins.length < 2) return null
  const newest = checkins[0]
  const newestTime = new Date(newest.check_in_date).getTime()
  if (!Number.isFinite(newest.weight_kg) || !Number.isFinite(newestTime)) return null

  // Begin at the edge of the recent window (unchanged behavior for weekly users:
  // the 4th most-recent check-in already spans ~3 weeks), then walk further back
  // only if that window is under one week.
  const startIdx = Math.min(Math.max(1, minWindow) - 1, checkins.length - 1)
  let anchor: RateCheckin | null = null
  let weeksDiff = 0
  for (let i = startIdx; i < checkins.length; i++) {
    const cand = checkins[i]
    const t = new Date(cand.check_in_date).getTime()
    if (!Number.isFinite(cand.weight_kg) || !Number.isFinite(t)) continue
    anchor = cand
    weeksDiff = (newestTime - t) / MS_PER_WEEK
    if (weeksDiff >= MIN_SPAN_WEEKS) break
  }

  if (!anchor || weeksDiff < MIN_SPAN_WEEKS) return null
  const rate = (newest.weight_kg - anchor.weight_kg) / weeksDiff
  return Number.isFinite(rate) ? rate : null
}
