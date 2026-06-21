export interface CheckinInput {
  weight_kg: number
  training_adherence: number
  diet_adherence: number
  energy_level: number
  sleep_quality: number
  stress_level: number
  notes?: string
}

export interface PreviousCheckin {
  weight_kg: number
  week_number: number
}

export interface Adjustments {
  calories_delta: number
  cardio_change: string
  training_volume_change: string
  notes: string[]
}

function weightTrend(current: number, previous: PreviousCheckin | null, bodyweight: number): number {
  if (!previous) return 0
  // Guard against a 0 / non-finite bodyweight which would make pctChange NaN/Infinity
  // and silently break every downstream calorie-adjustment branch.
  if (!Number.isFinite(bodyweight) || bodyweight <= 0) return 0
  const weeksDiff = 1
  const change = (current - previous.weight_kg) / weeksDiff
  return (change / bodyweight) * 100
}

export function calculateAdjustments(
  current: CheckinInput,
  previous: PreviousCheckin | null,
  currentCalories: number,
  goal: string
): Adjustments {
  const notes: string[] = []
  let calories_delta = 0
  let cardio_change = 'no change'
  let training_volume_change = 'no change'

  const pctChange = weightTrend(current.weight_kg, previous, current.weight_kg)

  if (goal === 'cut' || goal === 'recomp') {
    if (pctChange < -1.5) {
      calories_delta = 150
      notes.push('Weight dropping too fast — added 150 kcal to preserve muscle mass.')
    } else if (pctChange > -0.1 && previous) {
      if (currentCalories > 1400) {
        calories_delta = -100
        notes.push('Weight stalling — reduced calories by 100 kcal.')
      } else {
        cardio_change = '+1 session per week (20 min moderate intensity)'
        notes.push('Calories already low — added a cardio session to increase deficit.')
      }
    } else if (pctChange >= -1.0 && pctChange <= -0.3) {
      notes.push('Weight loss on track (0.3–1% per week). Keep current approach.')
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
