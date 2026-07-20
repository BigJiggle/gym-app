export interface CheckinInput {
  weight_kg: number
  training_adherence: number
  diet_adherence: number
  energy_level: number
  sleep_quality: number
  stress_level: number
  notes?: string
  // The date this weigh-in is for (YYYY-MM-DD). Used to normalize the weight
  // trend to a true per-week rate regardless of the check-in cadence (weekly,
  // biweekly, every-3-days, daily). Optional for backward compatibility.
  check_in_date?: string
}

export interface PreviousCheckin {
  weight_kg: number
  week_number: number
  check_in_date?: string
}

export interface Adjustments {
  calories_delta: number
  cardio_change: string
  training_volume_change: string
  notes: string[]
}

// Elapsed weeks between two YYYY-MM-DD check-in dates. Returns null when either
// date is missing/unparseable or the span is non-positive, so callers can fall
// back to their prior cadence assumption. Parsed at local noon to stay immune to
// DST / UTC-boundary shifts (mirrors the rest of the app's date math).
function weeksBetweenDates(fromDate: string | undefined, toDate: string | undefined): number | null {
  if (!fromDate || !toDate) return null
  const from = new Date(fromDate + 'T12:00:00').getTime()
  const to = new Date(toDate + 'T12:00:00').getTime()
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null
  const weeks = (to - from) / (7 * 24 * 60 * 60 * 1000)
  return weeks > 0 ? weeks : null
}

function weightTrend(
  current: number,
  currentDate: string | undefined,
  previous: PreviousCheckin | null,
  bodyweight: number
): number {
  if (!previous) return 0
  // Guard against a 0 / non-finite bodyweight which would make pctChange NaN/Infinity
  // and silently break every downstream calorie-adjustment branch.
  if (!Number.isFinite(bodyweight) || bodyweight <= 0) return 0
  // Normalize to a per-week rate using the actual gap between check-in dates so a
  // biweekly / every-3-days schedule isn't misread as a weekly change. Falls back
  // to a 1-week assumption when dates are unavailable (unchanged legacy behavior).
  const weeksDiff = weeksBetweenDates(previous.check_in_date, currentDate) ?? 1
  const change = (current - previous.weight_kg) / weeksDiff
  return (change / bodyweight) * 100
}

// Number of most-recent prior check-ins folded into the trend window (plus the
// just-submitted one). Four priors ≈ up to a month of data — long enough to
// average out water/glycogen noise, short enough to stay responsive.
const TREND_WINDOW = 4

// Smoothed multi-check-in weight trend: average per-interval % of bodyweight
// change across the recent window, so a single noisy weigh-in (water, sodium,
// glycogen) can't whipsaw the calorie target on its own.
// `recentCheckins` are the PRIOR check-ins (not including `current`), most-recent
// first — exactly as returned by the history query. Returns null when there is
// too little history to form a trend, so the caller falls back to the single-week
// delta and behavior is unchanged for early check-ins.
function weightTrendPct(
  currentWeight: number,
  currentDate: string | undefined,
  recentCheckins: PreviousCheckin[],
  bodyweight: number
): number | null {
  if (!Number.isFinite(currentWeight) || !Number.isFinite(bodyweight) || bodyweight <= 0) return null
  const priors = recentCheckins
    .filter((c) => Number.isFinite(c.weight_kg))
    .slice(0, TREND_WINDOW)
  // Need at least two priors so the window spans ≥2 intervals — otherwise it's
  // just the single-week delta and offers no smoothing.
  if (priors.length < 2) return null
  // priors are most-recent-first, so the last one is the oldest anchor. The series
  // runs oldest → … → current. Normalize by the ACTUAL weeks elapsed between the
  // oldest anchor and the current weigh-in so non-weekly cadences (biweekly,
  // every-3-days) aren't misread; fall back to the interval count when dates are
  // unavailable (unchanged legacy behavior — intervals ≈ weeks for weekly users).
  const oldest = priors[priors.length - 1]
  const weeks = weeksBetweenDates(oldest.check_in_date, currentDate) ?? priors.length
  const change = (currentWeight - oldest.weight_kg) / weeks
  return (change / bodyweight) * 100
}

export function calculateAdjustments(
  current: CheckinInput,
  previous: PreviousCheckin | null,
  currentCalories: number,
  goal: string,
  recentCheckins: PreviousCheckin[] = []
): Adjustments {
  const notes: string[] = []
  let calories_delta = 0
  let cardio_change = 'no change'
  let training_volume_change = 'no change'

  // Prefer the smoothed multi-check-in trend; fall back to the single-week delta
  // until there's enough history to form one.
  const trendPct = weightTrendPct(current.weight_kg, current.check_in_date, recentCheckins, current.weight_kg)
  const usingTrend = trendPct !== null
  const pctChange = usingTrend ? (trendPct as number) : weightTrend(current.weight_kg, current.check_in_date, previous, current.weight_kg)
  // "Weight" vs "Weight trend" so the note reflects which signal drove the change.
  const w = usingTrend ? 'Weight trend' : 'Weight'

  if (goal === 'cut' || goal === 'recomp') {
    if (pctChange < -1.5) {
      calories_delta = 150
      notes.push(`${w} dropping too fast — added 150 kcal to preserve muscle mass.`)
    } else if (pctChange > -0.1 && (previous || usingTrend)) {
      if (currentCalories > 1400) {
        calories_delta = -100
        notes.push(`${w} stalling — reduced calories by 100 kcal.`)
      } else {
        cardio_change = '+1 session per week (20 min moderate intensity)'
        notes.push('Calories already low — added a cardio session to increase deficit.')
      }
    } else if (pctChange >= -1.0 && pctChange <= -0.3) {
      notes.push(`${usingTrend ? 'Weight trend' : 'Weight loss'} on track (0.3–1% per week). Keep current approach.`)
    }
  }

  const recoveryScore = (current.energy_level + current.sleep_quality) / 2
  if (recoveryScore < 2.5) {
    training_volume_change = 'Reduce working sets by 20% this week'
    if (calories_delta <= 0) calories_delta += 100
    notes.push('Recovery is low — volume reduced and calories adjusted to support recovery.')
  } else if (recoveryScore >= 4) {
    notes.push('Recovery is excellent. Consider pushing intensity slightly.')
  }

  if (current.stress_level >= 4) {
    notes.push('High stress detected — prioritize sleep and recovery. Consider a deload if this persists.')
  }

  if (current.training_adherence < 60) {
    notes.push('Training adherence low this week. Review scheduling and time commitments.')
  }

  if (current.diet_adherence < 60) {
    notes.push('Diet adherence low. Review meal prep strategy and identify barriers.')
  }

  if (notes.length === 0) {
    notes.push('Good week overall. Stay consistent and keep executing the plan.')
  }

  return {
    calories_delta,
    cardio_change,
    training_volume_change,
    notes
  }
}
