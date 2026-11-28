// Peak-week carb-load target from bodyweight, for the Education tab's "Carb Load
// Calculator".
//
// The calculator's Bodyweight field is a free `<input type="number">` with no
// `min`, so the browser never blocks a typed negative or zero (HTML `min` doesn't
// block typed/pasted values, and this input has none anyway). The old inline guard
// was `carbWeight && !isNaN(parseFloat(carbWeight))`:
//   • a negative bodyweight (e.g. "-80") is a non-empty, truthy string AND parses
//     to a finite number, so it passed the guard and rendered NONSENSICAL negative
//     carb targets — "−640–−960g" total, "≈ −213–−320g per day".
//   • "0" is a TRUTHY string (only "" is falsy), so a typed 0 also passed and
//     rendered a meaningless "0–0g".
// Both are reachable user-input boundary cases that produce absurd on-screen
// numbers for a prep athlete relying on the figure.
//
// Returns null for any non-finite or non-positive bodyweight so the calculator
// renders nothing (exactly as for an empty field) instead of a bogus target; any
// positive weight behaves precisely as before. Centralising the math here also
// makes it unit-testable without mounting the whole Education page.
export interface CarbLoadResult {
  low: number
  high: number
  perDayLow: number
  perDayHigh: number
}

export function computeCarbLoad(rawWeight: string | number, isImperial: boolean): CarbLoadResult | null {
  const parsed = typeof rawWeight === 'number' ? rawWeight : parseFloat(rawWeight)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  const kg = isImperial ? parsed * 0.453592 : parsed
  const low = Math.round(kg * 8)
  const high = Math.round(kg * 12)
  return { low, high, perDayLow: Math.round(low / 3), perDayHigh: Math.round(high / 3) }
}
