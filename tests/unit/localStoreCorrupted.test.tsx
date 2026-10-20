// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import PosingWidget from '../../src/components/widgets/PosingWidget'
import SleepWidget from '../../src/components/widgets/SleepWidget'
import SupplementWidget from '../../src/components/widgets/SupplementWidget'
import ConditionWidget from '../../src/components/widgets/ConditionWidget'
import { createLocalStore } from '../../src/components/widgets/localStore'
import {
  posingStore, sleepStore, conditionStore,
  supplementListStore, supplementLogStore,
} from '../../src/components/widgets/competitionLogs'

beforeEach(() => {
  localStorage.clear()
  posingStore.reset(); sleepStore.reset(); conditionStore.reset()
  supplementListStore.reset(); supplementLogStore.reset()
  ;(window as unknown as { api: unknown }).api = {
    getExerciseLibrary: vi.fn().mockResolvedValue([]),
  }
})

afterEach(() => cleanup())

describe('createLocalStore — corrupted / hand-edited localStorage', () => {
  // Valid JSON of the WRONG shape (not malformed) slips past JSON.parse without
  // throwing, so the try/catch never fires. The store must still hand consumers a
  // value of the fallback shape instead of null / an object / a number.
  it('returns the array fallback when stored value is valid JSON but not an array', () => {
    const store = createLocalStore<number[]>('corrupt_probe', () => [])
    for (const bad of ['null', '{}', '5', '"hello"', 'true']) {
      localStorage.setItem('corrupt_probe', bad)
      store.reset()
      const snap = store.getSnapshot()
      expect(Array.isArray(snap)).toBe(true)
    }
  })

  it('preserves a valid stored array', () => {
    const store = createLocalStore<number[]>('good_probe', () => [])
    localStorage.setItem('good_probe', '[1,2,3]')
    store.reset()
    expect(store.getSnapshot()).toEqual([1, 2, 3])
  })

  it('competition widgets survive non-array corrupted logs (no crash)', () => {
    localStorage.setItem('posing_log', 'null')
    localStorage.setItem('sleep_log', '{}')
    localStorage.setItem('supplement_log', '5')
    localStorage.setItem('supplement_list', '"oops"')
    localStorage.setItem('condition_log', 'true')
    posingStore.reset(); sleepStore.reset(); conditionStore.reset()
    supplementListStore.reset(); supplementLogStore.reset()

    expect(() => render(<PosingWidget />)).not.toThrow()
    expect(() => render(<SleepWidget />)).not.toThrow()
    expect(() => render(<SupplementWidget />)).not.toThrow()
    expect(() => render(<ConditionWidget />)).not.toThrow()
    expect(screen.getByText('Posing Practice')).toBeTruthy()
    expect(screen.getByText('Sleep')).toBeTruthy()
    expect(screen.getByText('Supplements')).toBeTruthy()
    expect(screen.getByText('Daily Condition')).toBeTruthy()
  })

  // The top-level guard above only rejects a non-array. A VALID array can still
  // carry a corrupt ENTRY (a `null`, or an object missing a required field) which
  // previously slipped through and crashed the widget's `.date`/`.tags`/`.taken`
  // access — killing the whole dashboard (no error boundary). The per-store entry
  // sanitizers drop those so the widgets always see the declared shape.
  it('competition widgets survive corrupt ENTRIES inside a valid array (no crash)', () => {
    localStorage.setItem('posing_log', '[null]')
    localStorage.setItem('sleep_log', '[{"date":"2026-10-20"}]')          // missing hours
    localStorage.setItem('condition_log', '[{"date":"2026-10-20"}]')      // missing tags/note
    localStorage.setItem('supplement_log', '[{"date":"2026-10-20"}]')     // missing taken
    localStorage.setItem('supplement_list', '[null, "Creatine", 5]')      // mixed junk
    posingStore.reset(); sleepStore.reset(); conditionStore.reset()
    supplementListStore.reset(); supplementLogStore.reset()

    expect(() => render(<PosingWidget />)).not.toThrow()
    expect(() => render(<SleepWidget />)).not.toThrow()
    expect(() => render(<SupplementWidget />)).not.toThrow()
    expect(() => render(<ConditionWidget />)).not.toThrow()
    // Corrupt entries are dropped; the one valid string in the list survives.
    expect(posingStore.getSnapshot()).toEqual([])
    expect(sleepStore.getSnapshot()).toEqual([])
    expect(conditionStore.getSnapshot()).toEqual([])
    expect(supplementLogStore.getSnapshot()).toEqual([])
    expect(supplementListStore.getSnapshot()).toEqual(['Creatine'])
  })

  // Well-formed entries pass through the sanitizer unchanged (regression guard so
  // the filter never over-rejects real logs).
  it('keeps well-formed entries, dropping only the bad ones', () => {
    localStorage.setItem('posing_log', JSON.stringify([
      { date: '2026-10-19', focus: 'Full Routine', minutes: 15 },  // valid
      { date: '2026-10-20', focus: 'QT' },                          // missing minutes → dropped
    ]))
    localStorage.setItem('sleep_log', JSON.stringify([
      { date: '2026-10-19', hours: 7.5 },                          // valid
      null,                                                        // dropped
    ]))
    posingStore.reset(); sleepStore.reset()
    expect(posingStore.getSnapshot()).toEqual([{ date: '2026-10-19', focus: 'Full Routine', minutes: 15 }])
    expect(sleepStore.getSnapshot()).toEqual([{ date: '2026-10-19', hours: 7.5 }])
  })
})
