import { describe, it, expect } from 'vitest'
import { clampSetCount, MAX_SET_COUNT } from '../../src/utils/clampSetCount'

describe('clampSetCount', () => {
  it('passes legitimate set counts through unchanged', () => {
    for (const n of [1, 2, 3, 4, 5, 8, 12, 20]) {
      expect(clampSetCount(n)).toBe(n)
    }
  })

  it('clamps 0 and negatives up to 1 so an exercise is never a dead, zero-set entry', () => {
    // Array.from({ length: -3 }) yields [] → an uncompletable exercise; guard to 1.
    expect(clampSetCount(0)).toBe(1)
    expect(clampSetCount(-3)).toBe(1)
    expect(clampSetCount(-999999)).toBe(1)
  })

  it('caps huge values so the set list can never OOM / freeze the renderer', () => {
    // A hand-typed 999999 in SessionEditor would build ~1M set rows without this.
    expect(clampSetCount(999999)).toBe(MAX_SET_COUNT)
    expect(clampSetCount(21)).toBe(MAX_SET_COUNT)
  })

  it('coerces and rounds string input (SessionEditor onChange sends e.target.value)', () => {
    expect(clampSetCount('4')).toBe(4)
    expect(clampSetCount('12')).toBe(12)
    expect(clampSetCount('3.6')).toBe(4)
    expect(clampSetCount('999999')).toBe(MAX_SET_COUNT)
    expect(clampSetCount('-3')).toBe(1)
  })

  it('falls back to 1 for empty / non-numeric / nullish', () => {
    expect(clampSetCount('')).toBe(1)
    expect(clampSetCount('abc')).toBe(1)
    expect(clampSetCount(NaN)).toBe(1)
    expect(clampSetCount(undefined)).toBe(1)
    expect(clampSetCount(null)).toBe(1)
  })
})
