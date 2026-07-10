// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useUserStore } from '../../src/store/userStore'
import { usePlanStore } from '../../src/store/planStore'
import { WIDGETS } from '../../src/components/widgets/registry'

const DASHBOARD_IDS = [
  'quick-stats', 'todays-macros', 'next-meal', 'daily-weigh-in', 'peak-week',
  'prep-pace', 'weekly-scorecard', 'todays-session', 'checkin-feedback',
  'prep-guidance', 'todays-meals', 'recent-checkins', 'training-volume', 'muscle-coverage',
]

beforeEach(() => {
  localStorage.clear()
  ;(window as unknown as { api: unknown }).api = {
    getExerciseLibrary: vi.fn().mockResolvedValue([]),
    getNextCheckinDate: vi.fn().mockResolvedValue(null),
  }
  useUserStore.setState({
    user: { id: 1, name: 'Test User', weight_kg: 80, sex: 'male', height_cm: 180, age: 30, goal: 'cut', training_frequency: 4, division: 'Classic' } as never,
    shows: [],
  } as never)
  usePlanStore.setState({
    trainingPlan: null, dietPlan: null, latestCheckin: null, checkinHistory: [],
    mealCompletions: [], workoutHistory: [],
  } as never)
})

afterEach(() => cleanup())

describe('dashboard widget render smoke tests', () => {
  it('every dashboard widget mounts without crashing (empty data)', async () => {
    for (const id of DASHBOARD_IDS) {
      const def = WIDGETS.find((w) => w.id === id)
      expect(def, `registry entry for ${id}`).toBeTruthy()
      const Component = def!.Component
      // Should not throw on mount with empty stores / no show.
      expect(() => render(<MemoryRouter><Component /></MemoryRouter>)).not.toThrow()
    }
    await act(async () => {}) // flush async library / next-checkin fetches
  })
})
