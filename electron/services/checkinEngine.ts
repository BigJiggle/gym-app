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

// Defensively parse a stored `weekly_checkins.adjustments` cell into a well-formed
// Adjustments. The column is `TEXT NOT NULL DEFAULT '{}'`, so a row written without
// an explicit value — or a legacy / hand-edited / corrupt cell — can hold '{}' or
// non-JSON text. Every consumer reads `adjustments.notes` (CheckinFeedbackWidget and
// the Check-In success screen call `.notes.map(...)`) and `adjustments.calories_delta`.
// A raw `JSON.parse` yields `{}` whose `.notes` is undefined → `.notes.map(...)`
// crashes the Dashboard (no error boundary) and the success screen; a non-JSON cell
// makes `JSON.parse` THROW and takes down the whole checkin:history/latest handler, so
// Progress and Check-In can't load any check-in data. Normalizing here (the single
// read seam) guarantees the shape so no downstream consumer can crash on a bad cell.
export function parseAdjustments(raw: unknown): Adjustments {
  let obj: Record<string, unknown> = {}
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') obj = parsed as Record<string, unknown>
    } catch { /* malformed JSON — fall through to safe defaults */ }
  } else if (raw && typeof raw === 'object') {
    obj = raw as Record<string, unknown>
  }
  return {
    calories_delta:
      typeof obj.calories_delta === 'number' && Number.isFinite(obj.calories_delta) ? obj.calories_delta : 0,
    cardio_change: typeof obj.cardio_change === 'string' ? obj.cardio_change : 'no change',
    training_volume_change:
      typeof obj.training_volume_change === 'string' ? obj.training_volume_change : 'no change',
    notes: Array.isArray(obj.notes) ? obj.notes.filter((n): n is string => typeof n === 'string') : [],
  }
}

// The STORED check-in weight (weekly_checkins.weight_kg) is read verbatim by the
// Progress "Current Weight" tile + weight chart and folded raw into the smoothed
// weight trend. The Check-In page's toKg only rejects <= 0 (no upper bound), so a
// fat-fingered 850 (meant 85.0, or an lbs value typed into a kg field) persists an
// 850 kg row that spikes the Progress chart and whipsaws the trend/calorie
// adaptation. clampWeightKg already bounds the MACRO derivation (plan recalc), but
// the stored/charted/trended weight itself was left unbounded — the 2026-07-30 run
// closed the macro end and explicitly flagged this write-boundary gap as a lead.
// Clamp to the same 30-300 kg range Onboarding/Settings (clampWeightKgField) use so
// the displayed and trended weight agree with the plausible-weight invariant the
// rest of the app enforces. Returns the clamped weight, or null when the value is
// non-finite / <= 0 so the caller can reject it (weekly_checkins.weight_kg is NOT
// NULL and the Check-In UI already blocks that case).
export const CHECKIN_WEIGHT_MIN_KG = 30
export const CHECKIN_WEIGHT_MAX_KG = 300
export function clampCheckinWeightKg(value: unknown): number | null {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.max(CHECKIN_WEIGHT_MIN_KG, Math.min(CHECKIN_WEIGHT_MAX_KG, n))
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

// Smoothed multi-check-in weight trend: the Theil–Sen median of the per-week
// slopes between every pair of weigh-ins in the window (oldest priors → current),
// expressed as % of bodyweight per week. Taking the MEDIAN of all pairwise slopes
// reads every point in the window and is robust to a single noisy weigh-in
// (water, sodium, glycogen) on ANY slot — newest, oldest, or interior — so one
// off day can't whipsaw the calorie target. (A plain endpoint slope or an average
// of consecutive deltas both collapse to (newest − oldest)/span and ignore the
// interior points entirely, so either endpoint's noise drives the whole signal.)
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
  // priors are most-recent-first; reverse to run oldest → … → newest-prior, then
  // append the current weigh-in as the last point.
  const oldestFirst = [...priors].reverse()
  const weights = [...oldestFirst.map((c) => c.weight_kg), currentWeight]
  const dates = [...oldestFirst.map((c) => c.check_in_date), currentDate]

  // x-positions in weeks-from-anchor so each pairwise slope is a true per-week
  // rate regardless of cadence (weekly, biweekly, every-3-days, daily). Use real
  // dates when every point has a parseable, strictly-later date than the anchor;
  // otherwise fall back to the interval index (1 week per interval — unchanged
  // legacy assumption, and intervals ≈ weeks for weekly users).
  const anchor = dates[0]
  let xs: number[] | null = anchor ? [0] : null
  if (xs) {
    for (let i = 1; i < dates.length; i++) {
      const w = weeksBetweenDates(anchor, dates[i])
      if (w === null) {
        xs = null
        break
      }
      xs.push(w)
    }
  }
  const x = xs ?? weights.map((_, i) => i)

  // Theil–Sen: median of the slope between every pair of points. Pairs with a
  // non-positive x-gap (same-day duplicate entries) are skipped so a hand-edited
  // or double-submitted same-day weigh-in can't divide by zero → Infinity.
  const slopes: number[] = []
  for (let i = 0; i < weights.length; i++) {
    for (let j = i + 1; j < weights.length; j++) {
      const dx = x[j] - x[i]
      if (dx <= 0) continue
      slopes.push((weights[j] - weights[i]) / dx)
    }
  }
  if (slopes.length === 0) return null
  slopes.sort((a, b) => a - b)
  const mid = Math.floor(slopes.length / 2)
  const slope = slopes.length % 2 === 0 ? (slopes[mid - 1] + slopes[mid]) / 2 : slopes[mid]
  return (slope / bodyweight) * 100
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
