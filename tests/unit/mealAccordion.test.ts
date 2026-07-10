import { describe, it, expect } from 'vitest'
import { isMealExpanded } from '../../src/pages/Diet/mealAccordion'

describe('meal accordion resolver', () => {
  it('defaults the active meal to expanded and others collapsed', () => {
    expect(isMealExpanded({}, 2, 2)).toBe(true)
    expect(isMealExpanded({}, 0, 2)).toBe(false)
    expect(isMealExpanded({}, 1, null)).toBe(false)
  })

  it('an explicit override wins over the active-meal default', () => {
    // collapse the active meal
    expect(isMealExpanded({ 2: false }, 2, 2)).toBe(false)
    // expand a non-active meal
    expect(isMealExpanded({ 0: true }, 0, 2)).toBe(true)
  })
})
