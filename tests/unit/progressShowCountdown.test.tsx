// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useUserStore } from '../../src/store/userStore'
import { usePlanStore } from '../../src/store/planStore'
import { useSettingsStore } from '../../src/store/settingsStore'
import Progress from '../../src/pages/Progress/index'
import { getShowCountdown } from '../../src/utils/dates'

// Local YYYY-MM-DD at local midnight, n days from the faked clock — matches the
// way getShowCountdown rolls days/months.
function shiftDays(n: number): string {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + n).toLocaleDateString('en-CA')
}

// Two check-ins 14 days apart so computeWeeklyWeightRate() yields a non-null
// weekly rate → the "Weight Trend" card (which hosts the Show Countdown tile)
// renders. Newest-first, as the history query returns them.
function seed(showDate: string) {
  const newest = shiftDays(0)
  const oldest = shiftDays(-14)
  const checkinHistory = [
    { id: 2, week_number: 2, check_in_date: newest, weight_kg: 83, waist_cm: null, chest_cm: null, hip_cm: null, arm_cm: null, thigh_cm: null, training_adherence: 90, diet_adherence: 90, energy_level: 3, sleep_quality: 3, stress_level: 2, notes: null, adjustments: { calories_delta: 0, cardio_change: 'no change', training_volume_change: 'no change', notes: [] } },
    { id: 1, week_number: 1, check_in_date: oldest, weight_kg: 85, waist_cm: null, chest_cm: null, hip_cm: null, arm_cm: null, thigh_cm: null, training_adherence: 90, diet_adherence: 90, energy_level: 3, sleep_quality: 3, stress_level: 2, notes: null, adjustments: { calories_delta: 0, cardio_change: 'no change', training_volume_change: 'no change', notes: [] } },
  ]
  const progressEntries = [
    { week_number: 1, check_in_date: oldest, weight_kg: 85, waist_cm: null, chest_cm: null, hip_cm: null, arm_cm: null, thigh_cm: null },
    { week_number: 2, check_in_date: newest, weight_kg: 83, waist_cm: null, chest_cm: null, hip_cm: null, arm_cm: null, thigh_cm: null },
  ]
  useUserStore.setState({
    user: {
      id: 1, name: 'T', weight_kg: 83, sex: 'male', height_cm: 180, age: 30,
      goal: 'cut', training_frequency: 4, division: 'Classic', show_date: showDate,
    } as never,
    shows: [],
  } as never)
  usePlanStore.setState({
    trainingPlan: null, dietPlan: null, latestCheckin: checkinHistory[0],
    checkinHistory, progressEntries, mealCompletions: [], workoutHistory: [],
    loadProgressEntries: vi.fn(), loadCheckinHistory: vi.fn(),
  } as never)
  useSettingsStore.setState({ settings: { units: 'metric', target_weight_kg: '' } as never, loaded: true, setSetting: vi.fn() } as never)
}

// recharts' ResponsiveContainer needs ResizeObserver, which jsdom lacks. Stub it
// so the Progress page (which hosts several charts) can mount in the test env.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  localStorage.clear()
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub
  vi.useFakeTimers()
  // Mid-afternoon so the fractional weeks-until value sits above .0 (the window
  // in which ceil vs floor diverge most clearly).
  vi.setSystemTime(new Date(2026, 0, 10, 15, 30, 0))
  ;(window as unknown as { api: unknown }).api = {
    getProgressPhotos: vi.fn().mockResolvedValue([]),
    getMealCompletions: vi.fn().mockResolvedValue([]),
    addProgressPhoto: vi.fn().mockResolvedValue({}),
  }
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Progress "Show Countdown" tile uses the canonical floor-based weeks-out', () => {
  it('shows floor(weeks) for a 38-day-out show (5 wks), not ceil (6 wks)', () => {
    const showDate = shiftDays(38) // 5 weeks + 3 days
    // Sanity: the canonical helper floors to 5, the old ceil-of-fractional would be 6.
    expect(getShowCountdown(showDate).weeks).toBe(5)
    seed(showDate)

    render(<MemoryRouter><Progress /></MemoryRouter>)

    expect(screen.getByText('Show Countdown')).toBeTruthy()
    // The tile must agree with the Training tab / engine (5 wks), not overstate to 6.
    expect(screen.getByText('5 wks')).toBeTruthy()
    expect(screen.queryByText('6 wks')).toBeNull()
  })

  it('a show an exact number of weeks out is unchanged (35 days → 5 wks)', () => {
    const showDate = shiftDays(35) // exactly 5 weeks
    expect(getShowCountdown(showDate).weeks).toBe(5)
    seed(showDate)

    render(<MemoryRouter><Progress /></MemoryRouter>)
    expect(screen.getByText('5 wks')).toBeTruthy()
  })
})
