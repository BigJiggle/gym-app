// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import DailyWeighInWidget from '../../src/components/widgets/DailyWeighInWidget'

// The Daily Weigh-In widget logs a fasted morning weight to localStorage under
// 'daily_weight_log'. The input carries min/max hints (metric 30–300 kg,
// imperial 66–660 lbs) but those are cosmetic — the browser does NOT block a
// JS-submitted (Enter / Save-click) out-of-range value. logDailyWeight guarded
// only `raw <= 0`, so a fat-fingered extreme (e.g. `850` meant as `85.0`)
// persisted a 850 kg entry that then poisons the dashboard "7-day avg" and
// "weekly change" and survives a data reset (mergeWeighIns has no ceiling).
// The handler must reject values outside the widget's own declared bounds,
// mirroring the check-in weight clamp precedent.
beforeEach(() => {
  localStorage.clear()
})
afterEach(() => cleanup())

function saveWeight(value: string) {
  const input = screen.getByPlaceholderText('kg') as HTMLInputElement
  fireEvent.change(input, { target: { value } })
  fireEvent.click(screen.getByText('Save'))
}

describe('DailyWeighInWidget — out-of-range weight input', () => {
  it('rejects an absurd fat-fingered weight (850 kg) instead of storing it', () => {
    render(<DailyWeighInWidget />)
    saveWeight('850')
    // Nothing should have been persisted.
    expect(localStorage.getItem('daily_weight_log')).toBeNull()
    // ...and the "today" confirmation row must not appear.
    expect(screen.queryByText('today')).toBeNull()
  })

  it('rejects a below-floor weight (5 kg)', () => {
    render(<DailyWeighInWidget />)
    saveWeight('5')
    expect(localStorage.getItem('daily_weight_log')).toBeNull()
  })

  it('accepts and stores a sane weight (85 kg)', () => {
    render(<DailyWeighInWidget />)
    saveWeight('85')
    const stored = JSON.parse(localStorage.getItem('daily_weight_log') ?? '[]')
    expect(Array.isArray(stored)).toBe(true)
    expect(stored).toHaveLength(1)
    expect(stored[0].weight_kg).toBe(85)
    // The confirmation row now renders.
    expect(screen.getByText('today')).toBeTruthy()
  })
})
