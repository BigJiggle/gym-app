import { describe, it, expect } from 'vitest'
import { nextWaterMl } from '../../src/utils/water'

// Regression guard for the Diet-page water tracker silently corrupting the ml value
// the Dashboard widget logs into the shared `water_ml_<date>` localStorage key.
// The old write (`glasses * 250`) quantized a Dashboard oz entry (e.g. 8 oz = 237 ml)
// to a 250 multiple; nextWaterMl applies the glass delta to the true stored ml instead.
describe('nextWaterMl — preserves the Dashboard ml amount through the Diet glasses tracker', () => {
  it('adds a glass by +250 ml without quantizing a non-250 stored value (237 + 1 → 487, not 500)', () => {
    expect(nextWaterMl(237, 1)).toBe(487)
  })

  it('a +1 / -1 round-trip is lossless — the original sub-glass ml survives', () => {
    const afterAdd = nextWaterMl(237, 1) // 487
    expect(nextWaterMl(afterAdd, -1)).toBe(237) // back to 237, NOT snapped to 250
  })

  it('preserves a 32 oz (946 ml) Dashboard entry when a glass is added', () => {
    expect(nextWaterMl(946, 1)).toBe(1196)
  })

  it('never goes below 0 (a -1 that would underflow clamps to 0)', () => {
    expect(nextWaterMl(100, -1)).toBe(0)
    expect(nextWaterMl(0, -1)).toBe(0)
  })

  it('clamps to the 20-glass ceiling (5000 ml)', () => {
    expect(nextWaterMl(4900, 1)).toBe(5000)
    expect(nextWaterMl(5000, 1)).toBe(5000)
  })

  it('treats a corrupted / non-finite stored value as 0', () => {
    expect(nextWaterMl(NaN, 1)).toBe(250)
    expect(nextWaterMl(Number('not-a-number'), 2)).toBe(500)
  })

  it('behaves identically to the old code for pure-Diet usage (250 multiples)', () => {
    expect(nextWaterMl(750, 1)).toBe(1000)
    expect(nextWaterMl(750, -1)).toBe(500)
    expect(nextWaterMl(0, 1)).toBe(250)
  })
})
