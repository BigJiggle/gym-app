// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, act, fireEvent, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useUserStore } from '../../src/store/userStore'
import { usePlanStore } from '../../src/store/planStore'
import { useSettingsStore } from '../../src/store/settingsStore'
import CheckIn from '../../src/pages/CheckIn'

// The most recent check-in (metric; only weight set so the edit panel's weight
// input is the sole field pre-filled with "85").
const ORIGINAL = {
  id: 7, user_id: 1, week_number: 3, weight_kg: 85, check_in_date: '2026-08-01',
  waist_cm: null, chest_cm: null, hip_cm: null, arm_cm: null, thigh_cm: null,
  training_adherence: 90, diet_adherence: 90, energy_level: 3, sleep_quality: 3, stress_level: 2,
  notes: null, schedule_type: 'day', interval_days: 7,
  adjustments: { notes: ['ok'], calories_delta: 0, cardio_change: 'no change', training_volume_change: 'no change' },
}
// What the DB holds after the user corrects the weight to 84 kg.
const CORRECTED = { ...ORIGINAL, weight_kg: 84 }

// A lock that is clearly in the future so the CheckIn page renders its LOCKED
// state (which is the only screen that exposes "Edit Last Check-In").
const futureIso = () => new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()

let history: typeof ORIGINAL[]

beforeEach(() => {
  localStorage.clear()
  history = [ORIGINAL]
  ;(window as unknown as { api: unknown }).api = {
    getNextCheckinDate: vi.fn().mockResolvedValue(futureIso()), // locked
    // Return the current (mutable) history so a post-edit reload reflects the fix.
    getCheckinHistory: vi.fn().mockImplementation(async () => history),
    getLatestCheckin: vi.fn().mockImplementation(async () => history[0]),
    getWorkoutHistory: vi.fn().mockResolvedValue([]),
    getTrainingPlan: vi.fn().mockResolvedValue(null),
    getDietPlan: vi.fn().mockResolvedValue(null),
    getMealCompletions: vi.fn().mockResolvedValue([]),
    // Persisting the edit updates the backing store the next reload reads.
    updateCheckin: vi.fn().mockImplementation(async () => { history = [CORRECTED]; return CORRECTED }),
  }
  useUserStore.setState({
    user: { id: 1, name: 'Test', weight_kg: 85, sex: 'male', height_cm: 180, age: 30,
      goal: 'cut', training_frequency: 4 } as never,
    shows: [],
  } as never)
  usePlanStore.setState({
    trainingPlan: null, dietPlan: null,
    latestCheckin: ORIGINAL, checkinHistory: [ORIGINAL],
    mealCompletions: [], workoutHistory: [],
  } as never)
  useSettingsStore.setState({ settings: { units: 'metric' } } as never)
})

afterEach(() => cleanup())

describe('CheckIn locked-screen edit refreshes the store', () => {
  it('reloads check-in history after a successful edit so the UI matches the DB', async () => {
    render(<MemoryRouter><CheckIn /></MemoryRouter>)
    await act(async () => {}) // flush mount effects → locked screen + initial history load

    const api = (window as unknown as { api: Record<string, ReturnType<typeof vi.fn>> }).api
    const loadsAfterMount = api.getCheckinHistory.mock.calls.length

    // Open "Edit Last Check-In", correct the weight 85 → 84, save.
    fireEvent.click(screen.getByText(/Edit Last Check-In/i))
    const weightInput = screen.getByDisplayValue('85') as HTMLInputElement
    fireEvent.change(weightInput, { target: { value: '84' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }))
    })

    // The store must be refreshed after the edit (as submit / missed-fill do),
    // or the locked screen + dashboard widgets keep showing the stale weigh-in
    // and re-opening the edit pre-fills the OLD value (looks like the save was
    // lost). Before the fix saveEdit only re-queried getNextCheckinDate.
    expect(api.updateCheckin).toHaveBeenCalledTimes(1)
    expect(api.getCheckinHistory.mock.calls.length).toBeGreaterThan(loadsAfterMount)
    // And the store now carries the corrected weight the DB holds.
    expect((usePlanStore.getState().latestCheckin as { weight_kg: number }).weight_kg).toBe(84)
  })
})
