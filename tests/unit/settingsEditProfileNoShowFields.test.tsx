// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useUserStore } from '../../src/store/userStore'
import { usePlanStore } from '../../src/store/planStore'
import { useSettingsStore } from '../../src/store/settingsStore'
import Settings from '../../src/pages/Settings/index'
import type { Show } from '../../src/types'

// users.show_date and users.division are DERIVED columns: plan:startupRefresh and
// syncPrimaryToNearest rebuild them from the `shows` table on EVERY launch, and the
// `user:update` handler (sanitizeUserUpdate) deliberately DROPS both — so a show
// date / division typed into the Settings "Edit Profile" form is silently discarded
// (never persisted, reverted on next launch). The form must therefore NOT expose
// editable Show Date / Division controls there at all; shows are managed in the
// dedicated "My Shows" section (and by onboarding / the AI assistant), which route
// through the shows table. This test guards against re-introducing those dead
// controls (the value-entered-isn't-stored desync).

function makeShow(overrides: Partial<Show>): Show {
  return {
    id: 1, user_id: 1, name: 'Regional Classic', show_date: '2026-09-01',
    division: 'Classic Physique', federation: 'NPC', notes: null, is_primary: 1,
    ...overrides,
  } as Show
}

function seed(shows: Show[]) {
  useUserStore.setState({
    user: {
      id: 1, name: 'T', weight_kg: 80, sex: 'male', height_cm: 180, age: 30,
      goal: 'cut', training_frequency: 4, division: 'Classic Physique',
      equipment_access: 'full_gym', dietary_preference: 'omnivore',
      activity_level: 'moderate', training_experience_years: 2,
      show_date: shows.find(s => s.is_primary === 1)?.show_date ?? null,
    } as never,
    shows,
  } as never)
  usePlanStore.setState({ trainingPlan: null, dietPlan: null } as never)
  useSettingsStore.setState({ settings: { units: 'metric' } as never, loaded: true } as never)
}

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 5, 20, 15, 30, 0))
  ;(window as unknown as { api: unknown }).api = {
    listShows: vi.fn().mockResolvedValue([]),
    getUser: vi.fn().mockResolvedValue(null),
    getTrainingPlan: vi.fn().mockResolvedValue(null),
    getDietPlan: vi.fn().mockResolvedValue(null),
    openExternal: vi.fn(),
  }
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Settings "Edit Profile" — no dead Show Date / Division inputs', () => {
  it('opening the profile editor exposes a Goal select but no editable Show Date or Division control', () => {
    const show = makeShow({})
    ;(window.api as { listShows: ReturnType<typeof vi.fn> }).listShows.mockResolvedValue([show])
    seed([show])

    render(<MemoryRouter><Settings /></MemoryRouter>)

    // Open the "Edit Profile" editor (closed by default). The "My Shows" add-show
    // form stays closed, so any editable show-date / division control still present
    // can only be the profile editor's.
    fireEvent.click(screen.getByText('Click to edit all profile fields'))

    // Editor is open: its Goal select renders (its distinctive option is present).
    expect(screen.queryByText('Bulk — Off-Season Build')).not.toBeNull()

    // The dead Division <select> must be gone — its options no longer render.
    // ("Open Bodybuilding" is unique to that select; "My Shows" uses a free-text
    // division input, not these options.)
    expect(screen.queryByText('Open Bodybuilding')).toBeNull()
    expect(screen.queryByText('Men’s Physique')).toBeNull()
    expect(screen.queryByText("Men's Physique")).toBeNull()

    // The dead Show Date <input type="date"> must be gone. With the My Shows
    // add-form closed, no date input should exist anywhere in Settings now.
    expect(document.querySelector('input[type="date"]')).toBeNull()
  })
})
