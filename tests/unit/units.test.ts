import { describe, it, expect } from 'vitest'
import { cmToFeetInches, displayHeight, displayWeight, displayLength } from '../../src/utils/units'

describe('cmToFeetInches', () => {
  it('splits an exact-foot height', () => {
    expect(cmToFeetInches(152.4)).toEqual({ feet: 5, inches: 0 })
  })

  it('carries a remainder that rounds up to 12 into the next foot', () => {
    // 182 cm ≈ 71.65 in → round 72 → 6'0". The onboarding ft/in seed used to
    // compute feet=floor(182/30.48)=5 and inches=round((182%30.48)/2.54)=12
    // independently, yielding the impossible "5 ft 12 in" (which then corrupted
    // height_cm to 213 cm once the feet field was edited while inches stayed 12).
    expect(cmToFeetInches(182)).toEqual({ feet: 6, inches: 0 })
    expect(cmToFeetInches(181.9)).toEqual({ feet: 6, inches: 0 })
  })

  it('splits a typical height without carry', () => {
    // 170 cm ≈ 66.9 in → round 67 → 5'7"
    expect(cmToFeetInches(170)).toEqual({ feet: 5, inches: 7 })
  })
})

describe('displayHeight', () => {
  it('shows metric height rounded to whole cm', () => {
    expect(displayHeight(180.4, 'metric')).toBe('180 cm')
    expect(displayHeight(180.6, 'metric')).toBe('181 cm')
  })

  it('converts to feet/inches for imperial', () => {
    // 152.4 cm == exactly 5 ft
    expect(displayHeight(152.4, 'imperial')).toBe("5'0\"")
    // 180 cm ≈ 70.87 in → 5'11"
    expect(displayHeight(180, 'imperial')).toBe("5'11\"")
  })

  it('carries a rounded-up 12" remainder into the next foot (no 5\'12")', () => {
    // 181.9 cm ≈ 71.6 in. Naively rounding the inch remainder gives 12,
    // which must roll over to 6'0" rather than render "5'12\"".
    expect(displayHeight(181.9, 'imperial')).toBe("6'0\"")
  })
})

describe('displayWeight', () => {
  it('converts kg to lbs for imperial', () => {
    expect(displayWeight(100, 'imperial')).toEqual({ value: '220.5', unit: 'lbs' })
  })
  it('trims a trailing .0 in metric', () => {
    expect(displayWeight(80, 'metric')).toEqual({ value: '80', unit: 'kg' })
  })
})

describe('displayLength', () => {
  it('converts cm to inches for imperial', () => {
    expect(displayLength(2.54, 'imperial')).toEqual({ value: '1.0', unit: 'in' })
  })
})
