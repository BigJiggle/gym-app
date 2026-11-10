// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useUserStore } from '../../src/store/userStore'
import { usePlanStore } from '../../src/store/planStore'
import { useSettingsStore } from '../../src/store/settingsStore'
import PrepPaceWidget from '../../src/components/widgets/PrepPaceWidget'
import { getShowCountdown } from '../../src/utils/dates'

// Local YYYY-MM-DD at local midnight, n days from the faked clock — matches the
// way getShowCountdown rolls days/months.
function shiftDays(n: number): string {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + n).toLocaleDateString('en-CA')
}

// Two check-ins 14 days apart so computeWeeklyWeightRate() returns a non-null
// weekly rate → the widget renders its full body (incl. the "Show day (Nw)" line).
// Newest-first, as the history query returns them. 83 now vs 85 two weeks ago → a
// real downward cut trend, so the projection row mounts.
function seed(showDate: string) {
  const newest = shiftDays(0)
  const oldest = shiftDays(-14)
  const checkinHistory = [
    { id: 2, week_number: 2, check_in_date: newest, weight_kg: 83 },
    { id: 1, week_number: 1, check_in_date: oldest, weight_kg: 85 },
  ]
  useUserStore.setState({
    user: {
      id: 1, name: 'T', weight_kg: 83, sex: 'male', height_cm: 180, age: 30,
      goal: 'cut', training_frequency: 4,
    } as never,
    shows: [{ id: 1, user_id: 1, name: 'Show', show_date: showDate, division: null, federation: null, notes: null, is_primary: 1 }],
  } as never)
  usePlanStore.setState({ checkinHistory } as never)
  useSettingsStore.setState({ settings: { units: 'metric', target_weight_kg: '' } as never, loaded: true } as never)
}

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  // Mid-afternoon so the fractional weeks-until value sits above .0.
  vi.setSystemTime(new Date(2026, 0, 10, 15, 30, 0))
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('PrepPaceWidget "Show day" label uses the canonical floor-based weeks-out', () => {
  it('shows floor(weeks) for a 39-day-out show (5w), not Math.round (6w)', () => {
    const showDate = shiftDays(39) // 5 weeks + 4 days → floor 5, Math.round(5.57) = 6
    // Sanity: the canonical helper floors to 5; the fractional weeks ≈ 5.57 rounds to 6.
    expect(getShowCountdown(showDate).weeks).toBe(5)

    seed(showDate)
    render(<MemoryRouter><PrepPaceWidget /></MemoryRouter>)

    // The label must agree with the sidebar / QuickStats / Training tab (5w), not 6w.
    expect(screen.getByText(/Show day \(5w\):/)).toBeTruthy()
    expect(screen.queryByText(/Show day \(6w\):/)).toBeNull()
  })

  it('a show an exact number of weeks out is unchanged (35 days → 5w)', () => {
    const showDate = shiftDays(35) // exactly 5 weeks
    expect(getShowCountdown(showDate).weeks).toBe(5)

    seed(showDate)
    render(<MemoryRouter><PrepPaceWidget /></MemoryRouter>)
    expect(screen.getByText(/Show day \(5w\):/)).toBeTruthy()
  })
})
