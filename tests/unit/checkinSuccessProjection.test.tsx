// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, act, fireEvent, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useUserStore } from '../../src/store/userStore'
import { usePlanStore } from '../../src/store/planStore'
import { useSettingsStore } from '../../src/store/settingsStore'
import CheckIn from '../../src/pages/CheckIn'

// A show far enough out that weeksToShow > 0.
const SHOW_DATE = '2026-12-01'

function isoDaysAgo(days: number): string {
  const d = new Date('2026-08-01T12:00:00')
  d.setDate(d.getDate() - days)
  return d.toLocaleDateString('en-CA')
}

// Two prior check-ins spanning >1 week so computeWeeklyWeightRate returns a real
// rate (which is what makes the Show Day Projection block render post-submit).
const PRIOR_HISTORY = [
  { id: 2, user_id: 1, week_number: 2, weight_kg: 81, check_in_date: isoDaysAgo(8),
    training_adherence: 90, diet_adherence: 90, energy_level: 3, sleep_quality: 3, stress_level: 2,
    adjustments: { notes: ['ok'], calories_delta: 0, cardio_change: 'no change', training_volume_change: 'no change' } },
  { id: 1, user_id: 1, week_number: 1, weight_kg: 82, check_in_date: isoDaysAgo(16),
    training_adherence: 90, diet_adherence: 90, energy_level: 3, sleep_quality: 3, stress_level: 2,
    adjustments: { notes: ['ok'], calories_delta: 0, cardio_change: 'no change', training_volume_change: 'no change' } },
]

const SUBMITTED_CHECKIN = {
  id: 3, user_id: 1, week_number: 3, weight_kg: 80, check_in_date: '2026-08-01',
  training_adherence: 90, diet_adherence: 90, energy_level: 3, sleep_quality: 3, stress_level: 2,
  adjustments: { notes: ['Weight trend on track.'], calories_delta: 0, cardio_change: 'no change', training_volume_change: 'no change' },
}

beforeEach(() => {
  localStorage.clear()
  ;(window as unknown as { api: unknown }).api = {
    getNextCheckinDate: vi.fn().mockResolvedValue(null), // not locked → open form
    getCheckinHistory: vi.fn().mockResolvedValue(PRIOR_HISTORY),
    getLatestCheckin: vi.fn().mockResolvedValue(PRIOR_HISTORY[0]),
    getWorkoutHistory: vi.fn().mockResolvedValue([]),
    getTrainingPlan: vi.fn().mockResolvedValue(null),
    getDietPlan: vi.fn().mockResolvedValue(null),
    getMealCompletions: vi.fn().mockResolvedValue([]),
    submitCheckin: vi.fn().mockResolvedValue(SUBMITTED_CHECKIN),
  }
  useUserStore.setState({
    user: { id: 1, name: 'Test', weight_kg: 80, sex: 'male', height_cm: 180, age: 30,
      goal: 'cut', training_frequency: 4, division: 'Classic', show_date: SHOW_DATE } as never,
    shows: [],
  } as never)
  usePlanStore.setState({
    trainingPlan: null, dietPlan: null,
    latestCheckin: PRIOR_HISTORY[0], checkinHistory: PRIOR_HISTORY,
    mealCompletions: [], workoutHistory: [],
  } as never)
  useSettingsStore.setState({
    settings: { units: 'metric', target_weight_kg: '78' },
  } as never)
})

afterEach(() => cleanup())

describe('CheckIn success-state Show Day Projection', () => {
  it('renders the projection after submit without a ReferenceError', async () => {
    render(<MemoryRouter><CheckIn /></MemoryRouter>)
    // flush mount effects (load history / next-checkin) → open form
    await act(async () => {})

    // Fill required bodyweight and submit the check-in.
    const weightInput = screen.getByPlaceholderText('84.0') as HTMLInputElement
    fireEvent.change(weightInput, { target: { value: '80' } })

    const submitBtn = screen.getByRole('button', { name: /Submit Check-In/i })
    await act(async () => {
      fireEvent.click(submitBtn)
    })

    // Before the fix, rendering the success screen threw
    // "ReferenceError: recent is not defined" from the projection block.
    expect(screen.getByText(/Show Day Projection/i)).toBeTruthy()
    // The "Avg over N check-in(s)" caption references the smoothing window.
    expect(screen.getByText(/Avg over \d+ check-in/i)).toBeTruthy()
  })
})
