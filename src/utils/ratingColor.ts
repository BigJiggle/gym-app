// Shared good/medium/bad color scale for 1–5 wellbeing ratings.
//
// Stress is better when LOW; sleep and energy are better when HIGH. All three
// should read with the same green (good) / yellow (medium) / red (bad) scale so
// they're consistent wherever they're shown (Check-in inputs, Progress summary).

export type RatingDirection = 'higher' | 'lower'
export type RatingTone = 'good' | 'medium' | 'bad'

/** Classify a 1–5 rating as good/medium/bad given which direction is better. */
export function ratingTone(value: number, direction: RatingDirection): RatingTone {
  const good = direction === 'lower' ? value <= 2 : value >= 4
  if (good) return 'good'
  if (value === 3) return 'medium'
  return 'bad'
}

/** Tailwind text color class for a rating value. */
export function ratingTextClass(value: number, direction: RatingDirection): string {
  const tone = ratingTone(value, direction)
  return tone === 'good' ? 'text-green-400' : tone === 'medium' ? 'text-yellow-400' : 'text-red-400'
}

/** Tailwind background color class (filled bars/buttons) for a rating value. */
export function ratingBgClass(value: number, direction: RatingDirection): string {
  const tone = ratingTone(value, direction)
  return tone === 'good'
    ? 'bg-green-600 text-white'
    : tone === 'medium'
      ? 'bg-yellow-600 text-white'
      : 'bg-red-600 text-white'
}
