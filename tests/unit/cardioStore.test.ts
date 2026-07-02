// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { useCardioStore } from '../../src/store/cardioStore'

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
})
