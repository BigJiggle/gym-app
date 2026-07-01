// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { useCardioStore } from '../../src/store/cardioStore'

const TODAY = new Date().toLocaleDateString('en-CA')

describe('cardioStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useCardioStore.setState({ cardioLog: [] })
  })

  it('logToday adds/replaces today\'s entry and persists', () => {
    useCardioStore.getState().logToday('LISS', 30)
    const { cardioLog } = useCardioStore.getState()
    expect(cardioLog).toEqual([{ date: TODAY, type: 'LISS', minutes: 30 }])
    expect(JSON.parse(localStorage.getItem('cardio_log')!)).toEqual(cardioLog)
  })

  it('logToday replaces an existing entry for today', () => {
    useCardioStore.getState().logToday('LISS', 30)
    useCardioStore.getState().logToday('HIIT', 20)
    const { cardioLog } = useCardioStore.getState()
    expect(cardioLog.filter((e) => e.date === TODAY)).toHaveLength(1)
    expect(cardioLog[0]).toEqual({ date: TODAY, type: 'HIIT', minutes: 20 })
  })

  it('removeToday clears today\'s entry', () => {
    useCardioStore.getState().logToday('LISS', 30)
    useCardioStore.getState().removeToday()
    expect(useCardioStore.getState().cardioLog).toEqual([])
  })
})
