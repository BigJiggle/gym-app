// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useUserStore } from '../../src/store/userStore'
import { usePlanStore } from '../../src/store/planStore'
import { useSettingsStore } from '../../src/store/settingsStore'
import Settings from '../../src/pages/Settings/index'
import type { Show } from '../../src/types'

// Build a local YYYY-MM-DD offset n days from the (faked) current clock, at local
// midnight so it rolls over months/days the same way getShowCountdown does.
function shiftDays(n: number): string {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + n).toLocaleDateString('en-CA')
}

function makeShow(overrides: Partial<Show>): Show {
  return {
    id: 1, user_id: 1, name: 'Regional Classic', show_date: '', division: 'Classic Physique',
    federation: 'NPC', notes: null, is_primary: 1,
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
  // Fake clock: the athlete's actual show day, mid-afternoon (after local noon) —
  // the exact window in which the old hand-rolled `isPast` misfired.
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 5, 20, 15, 30, 0)) // Jun 20 2026, 15:30 local
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

describe('Settings "My Shows" — a show happening TODAY is not labelled Past', () => {
  it('does not show a "Past" badge or hide the Cancel Show button on show-day afternoon', () => {
    // listShows must echo the seeded row so the on-mount loadShows effect does not
    // clobber it; set it before rendering.
    const show = makeShow({ show_date: shiftDays(0), is_primary: 1 })
    ;(window.api as { listShows: ReturnType<typeof vi.fn> }).listShows.mockResolvedValue([show])
    seed([show])

    render(<MemoryRouter><Settings /></MemoryRouter>)
    // The show row renders …
    expect(screen.getByText('Regional Classic')).toBeTruthy()
    // … but it must NOT carry the "Past" badge (the bug: exact-text span), and the
    // Cancel Show action must stay available. (Use exact-text queries so the API-key
    // help text "Paste it below" isn't mistaken for a "Past" badge.)
    expect(screen.queryByText('Past')).toBeNull()
    expect(screen.queryByText('Cancel Show')).not.toBeNull()
  })

  it('still labels a genuinely past (yesterday) show as Past', () => {
    const show = makeShow({ id: 2, show_date: shiftDays(-1), is_primary: 0 })
    ;(window.api as { listShows: ReturnType<typeof vi.fn> }).listShows.mockResolvedValue([show])
    seed([show])

    render(<MemoryRouter><Settings /></MemoryRouter>)
    expect(screen.getByText('Regional Classic')).toBeTruthy()
    // A strictly-before-today show keeps its "Past" badge (exact-text span).
    expect(screen.queryByText('Past')).not.toBeNull()
  })
})
