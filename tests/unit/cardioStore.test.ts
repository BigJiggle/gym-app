// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { useCardioStore, loadInitial } from '../../src/store/cardioStore'

const TODAY = new Date().toLocaleDateString('en-CA')

describe('cardioStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useCardioStore.setState({ cardioLog: [] })
  })

  it('addEntry appends a session and persists', () => {
    useCardioStore.getState().addEntry('LISS', 30)
    const { cardioLog } = useCardioStore.getState()
    expect(cardioLog).toHaveLength(1)
    expect(cardioLog[0]).toMatchObject({ date: TODAY, type: 'LISS', minutes: 30 })
    expect(cardioLog[0].id).toBeTruthy()
    expect(JSON.parse(localStorage.getItem('cardio_log')!)).toEqual(cardioLog)
  })

  it('logging another session keeps both (does not replace)', () => {
    useCardioStore.getState().addEntry('LISS', 30)
    useCardioStore.getState().addEntry('HIIT', 20)
    const today = useCardioStore.getState().cardioLog.filter((e) => e.date === TODAY)
    expect(today).toHaveLength(2)
    expect(today.map((e) => e.type)).toEqual(['LISS', 'HIIT'])
    expect(new Set(today.map((e) => e.id)).size).toBe(2) // unique ids
  })

  it('updateEntry edits only the targeted session', () => {
    useCardioStore.getState().addEntry('LISS', 30)
    useCardioStore.getState().addEntry('HIIT', 20)
    const first = useCardioStore.getState().cardioLog[0]
    useCardioStore.getState().updateEntry(first.id, 'Bike', 45)
    const log = useCardioStore.getState().cardioLog
    expect(log[0]).toMatchObject({ id: first.id, type: 'Bike', minutes: 45 })
    expect(log[1]).toMatchObject({ type: 'HIIT', minutes: 20 })
  })

  it('removeEntry removes only the targeted session', () => {
    useCardioStore.getState().addEntry('LISS', 30)
    useCardioStore.getState().addEntry('HIIT', 20)
    const [a, b] = useCardioStore.getState().cardioLog
    useCardioStore.getState().removeEntry(a.id)
    const log = useCardioStore.getState().cardioLog
    expect(log).toHaveLength(1)
    expect(log[0].id).toBe(b.id)
  })

  describe('loadInitial — corrupted / hand-edited localStorage', () => {
    it('coerces string minutes and drops garbage so weekly sums stay numeric', () => {
      // Corrupt/hand-edited cardio_log: a string minutes, a null row, a legacy
      // row without id, and a non-numeric minutes.
      localStorage.setItem('cardio_log', JSON.stringify([
        { id: 'a', date: TODAY, type: 'LISS', minutes: 30 },
        { id: 'b', date: TODAY, type: 'HIIT', minutes: '20' }, // hand-edited string
        null,                                                   // garbage row
        { date: TODAY, type: 'Bike', minutes: 15 },            // legacy (no id)
        { id: 'c', date: TODAY, type: 'Junk', minutes: 'abc' },// unparseable minutes
      ]))

      const log = loadInitial()

      // null + unparseable-minutes dropped; the other three kept.
      expect(log).toHaveLength(3)
      // Every surviving entry has a finite numeric minutes and a string id.
      log.forEach((e) => {
        expect(Number.isFinite(e.minutes)).toBe(true)
        expect(typeof e.minutes).toBe('number')
        expect(typeof e.id).toBe('string')
      })
      // The exact reduce CardioWidget uses must now yield a NUMBER (65), not the
      // string-concatenated "3020..." the raw pass-through produced.
      const weekMins = log.reduce((s, e) => s + e.minutes, 0)
      expect(weekMins).toBe(65)
      // The "20" string was coerced, not dropped.
      expect(log.find((e) => e.id === 'b')?.minutes).toBe(20)
      // The repaired log is persisted back so storage is cleaned.
      expect(JSON.parse(localStorage.getItem('cardio_log')!)).toHaveLength(3)
    })

    it('leaves a well-formed log untouched (no needless rewrite)', () => {
      const clean = [{ id: 'x', date: TODAY, type: 'LISS', minutes: 40 }]
      localStorage.setItem('cardio_log', JSON.stringify(clean))
      const log = loadInitial()
      expect(log).toEqual(clean)
    })
  })
})
