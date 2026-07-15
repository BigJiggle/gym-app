// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useUserStore } from '../../src/store/userStore'

// resetAllData wipes the DB (main process) + app-local localStorage, then must
// HARD-RELOAD so every in-memory store (planStore plans/history, cardioStore,
// the competition-log and widget-layout localStorage caches) re-initializes from
// the cleared state. Without the reload the soft reset leaves those singletons
// holding the just-deleted data, which re-appears on the dashboard and gets
// re-persisted (resurrected) on the next log. These tests pin that contract.

const CHECKIN_WEIGHTS = [{ date: '2026-01-01', weight_kg: 80 }]

describe('userStore.resetAllData', () => {
  let reload: ReturnType<typeof vi.fn>
  const origLocation = window.location

  beforeEach(() => {
    localStorage.clear()
    // Seed data the reset is supposed to remove, plus a preserved key.
    localStorage.setItem('cardio_log', JSON.stringify([{ id: 'a', date: '2026-01-02', type: 'LISS', minutes: 30 }]))
    localStorage.setItem('posing_log', JSON.stringify([{ date: '2026-01-02', focus: 'Full Routine', minutes: 15 }]))
    localStorage.setItem('dashboard_widgets', JSON.stringify(['water']))
    localStorage.setItem('daily_weight_log', JSON.stringify([{ date: '2026-01-03', weight_kg: 79 }]))

    ;(window as unknown as { api: unknown }).api = {
      resetAllData: vi.fn().mockResolvedValue({ success: true, checkinWeights: CHECKIN_WEIGHTS }),
    }

    reload = vi.fn()
    // jsdom's location.reload is non-configurable, so swap the whole location.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...origLocation, reload },
    })
    useUserStore.setState({ user: { id: 1 } as never, shows: [{ id: 9 } as never] })
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: origLocation })
    vi.restoreAllMocks()
  })

  it('reloads the app after the reset so in-memory stores cannot keep stale data', async () => {
    await useUserStore.getState().resetAllData()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('wipes non-preserved localStorage while keeping/merging weigh-ins', async () => {
    await useUserStore.getState().resetAllData()
    expect(localStorage.getItem('cardio_log')).toBeNull()
    expect(localStorage.getItem('posing_log')).toBeNull()
    expect(localStorage.getItem('dashboard_widgets')).toBeNull()
    // Daily weigh-in kept and the preserved check-in weight folded in.
    const log = JSON.parse(localStorage.getItem('daily_weight_log')!)
    expect(log).toEqual([
      { date: '2026-01-01', weight_kg: 80 },
      { date: '2026-01-03', weight_kg: 79 },
    ])
  })

  it('clears the in-store user/shows before reloading', async () => {
    await useUserStore.getState().resetAllData()
    expect(useUserStore.getState().user).toBeNull()
    expect(useUserStore.getState().shows).toEqual([])
  })
})
