// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import DailyWeighInWidget from '../../src/components/widgets/DailyWeighInWidget'

// The Daily Weigh-In widget keeps its log in localStorage under
// 'daily_weight_log' and rebuilds it in a useState initializer with a raw
// JSON.parse guarded only by try/catch. Valid JSON of the WRONG shape
// (hand-edited / corrupted storage: `null`, `{}`, `5`, `"x"`, `true`) parses
// without throwing, so the catch never fires — then .find()/.filter() on a
// non-array value crashes the widget (and, with no error boundary, the whole
// dashboard tab). The initializer must fall back to [] when the parsed value
// isn't an array. Mirrors the createLocalStore shape-guard from the
// competition-widget corruption fix.
beforeEach(() => {
  localStorage.clear()
})
afterEach(() => cleanup())

describe('DailyWeighInWidget — corrupted / hand-edited localStorage', () => {
  it('survives non-array daily_weight_log without crashing', () => {
    for (const bad of ['null', '{}', '5', '"oops"', 'true']) {
      cleanup()
      localStorage.setItem('daily_weight_log', bad)
      expect(() => render(<DailyWeighInWidget />), `bad value ${bad}`).not.toThrow()
      expect(screen.getByText('Daily Weigh-In')).toBeTruthy()
    }
  })

  it('preserves a valid stored array', () => {
    localStorage.setItem(
      'daily_weight_log',
      JSON.stringify([{ date: '2026-07-20', weight_kg: 80 }]),
    )
    expect(() => render(<DailyWeighInWidget />)).not.toThrow()
    expect(screen.getByText('Daily Weigh-In')).toBeTruthy()
  })
})
