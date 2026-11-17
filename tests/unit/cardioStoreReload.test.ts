// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { useCardioStore } from '../../src/store/cardioStore'
import { nextCardioLog } from '../../src/utils/cardio'

const TODAY = new Date().toLocaleDateString('en-CA')

// The dashboard Cardio widget reads the zustand cardioStore (a module singleton
// that reads `cardio_log` only once, at load). The Diet page's cardio stepper
// writes the SAME `cardio_log` key DIRECTLY via localStorage (its single-total
// `nextCardioLog` write), never touching the store. Without reconciling the two,
// the store's in-memory `cardioLog` goes stale the moment the Diet page writes —
// and a later dashboard `addEntry` persists from that stale copy, permanently
// clobbering the Diet edit. `reloadFromStorage` re-reads the just-written key so
// the store stays the single source of truth. These tests pin that behavior.
describe('cardioStore ↔ Diet-page localStorage reconciliation', () => {
  beforeEach(() => {
    localStorage.clear()
    useCardioStore.setState({ cardioLog: [] })
  })

  it('reloadFromStorage re-reads a cardio_log the Diet page wrote directly', () => {
    useCardioStore.getState().addEntry('LISS', 30)
    expect(useCardioStore.getState().cardioLog).toHaveLength(1)

    // Simulate the Diet page's stepper: +5 min on today's total, written straight
    // to localStorage (collapsed to one entry) without going through the store.
    const { log } = nextCardioLog(
      JSON.parse(localStorage.getItem('cardio_log') ?? '[]'), TODAY, 5, 120,
    )
    localStorage.setItem('cardio_log', JSON.stringify(log))

    // Store is still stale until reconciled.
    expect(useCardioStore.getState().cardioLog.reduce((s, e) => s + e.minutes, 0)).toBe(30)

    useCardioStore.getState().reloadFromStorage()

    const total = useCardioStore.getState().cardioLog.reduce((s, e) => s + e.minutes, 0)
    expect(total).toBe(35)
    // Every reconciled entry is a well-formed CardioEntry (ids minted if needed).
    useCardioStore.getState().cardioLog.forEach((e) => {
      expect(typeof e.id).toBe('string')
      expect(Number.isFinite(e.minutes)).toBe(true)
    })
  })

  it('a dashboard addEntry after a reconciled Diet edit does NOT clobber it', () => {
    // 1. Dashboard logs a session.
    useCardioStore.getState().addEntry('LISS', 30)

    // 2. Diet page edits today's total to 35 (direct localStorage write) and the
    //    store is reconciled — exactly what the Diet stepper now does.
    const { log } = nextCardioLog(
      JSON.parse(localStorage.getItem('cardio_log') ?? '[]'), TODAY, 5, 120,
    )
    localStorage.setItem('cardio_log', JSON.stringify(log))
    useCardioStore.getState().reloadFromStorage()

    // 3. Back on the dashboard, the user logs another session.
    useCardioStore.getState().addEntry('HIIT', 20)

    // The Diet edit (35) survives: total is 35 + 20 = 55, NOT the stale 30 + 20 = 50
    // the pre-fix (stale-store) path produced.
    const total = useCardioStore.getState().cardioLog.reduce((s, e) => s + e.minutes, 0)
    expect(total).toBe(55)
    // localStorage and the in-memory store agree (no desync).
    const stored = JSON.parse(localStorage.getItem('cardio_log')!)
    expect(stored.reduce((s: number, e: { minutes: number }) => s + e.minutes, 0)).toBe(55)
    expect(stored).toEqual(useCardioStore.getState().cardioLog)
  })
})
