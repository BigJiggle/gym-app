// Unit conversion utilities — storage is always metric (kg, cm).
// These helpers convert for display only.

export type UnitSystem = 'metric' | 'imperial'

export function displayWeight(kg: number, units: UnitSystem): { value: string; unit: string } {
  if (units === 'imperial') {
    return { value: (kg / 0.453592).toFixed(1), unit: 'lbs' }
  }
  return { value: kg.toFixed(1).replace(/\.0$/, ''), unit: 'kg' }
}

export function displayLength(cm: number, units: UnitSystem): { value: string; unit: string } {
  if (units === 'imperial') {
    return { value: (cm / 2.54).toFixed(1), unit: 'in' }
  }
  return { value: cm.toFixed(1).replace(/\.0$/, ''), unit: 'cm' }
}

export function displayHeight(cm: number, units: UnitSystem): string {
  if (units === 'imperial') {
    // Round to whole inches FIRST, then split — otherwise a remainder that
    // rounds up to 12 (e.g. 181.9 cm ≈ 71.6 in) renders "5'12"" instead of 6'0".
    const totalInches = Math.round(cm / 2.54)
    const feet = Math.floor(totalInches / 12)
    const inches = totalInches % 12
    return `${feet}'${inches}"`
  }
  return `${Math.round(cm)} cm`
}

export function weightLabel(units: UnitSystem): string {
  return units === 'imperial' ? 'lbs' : 'kg'
}

export function lengthLabel(units: UnitSystem): string {
  return units === 'imperial' ? 'in' : 'cm'
}
