import { describe, it, expect } from 'vitest'
import { displayHeight, displayWeight, displayLength } from '../../src/utils/units'

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
