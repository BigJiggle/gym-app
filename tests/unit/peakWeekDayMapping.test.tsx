// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useUserStore } from '../../src/store/userStore'
import { usePlanStore } from '../../src/store/planStore'
import PeakWeekWidget from '../../src/components/widgets/PeakWeekWidget'

// The PEAK_WEEK_PROTOCOL keys each day by `daysOut`, counting the SHOW DAY as
// day 1 (inclusive countdown): "Depletion workout on Day 7 (Mon)" and carb
// loading on "Days 4, 3, and 2 before the show" (Thu/Fri/Sat). getShowCountdown's
// `totalDays`, by contrast, counts the show day as 0. So the correct map from
// days-remaining to protocol day is `daysOut = totalDays + 1`. These tests pin
// that the widget shows the protocol for the ACTUAL day, not the next day's.

function shiftDays(n: number): string {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + n).toLocaleDateString('en-CA')
}

function seedUser(showDate: string) {
  useUserStore.setState({
    user: {
      id: 1, name: 'T', weight_kg: 80, sex: 'male', height_cm: 180, age: 30,
      goal: 'cut', training_frequency: 4, division: 'Classic', show_date: showDate,
    } as never,
    shows: [],
  } as never)
  usePlanStore.setState({
    trainingPlan: null, dietPlan: null, latestCheckin: null, checkinHistory: [],
    mealCompletions: [], workoutHistory: [],
  } as never)
}

beforeEach(() => {
  localStorage.clear()
  ;(window as unknown as { api: unknown }).api = {
    getExerciseLibrary: vi.fn().mockResolvedValue([]),
    getNextCheckinDate: vi.fn().mockResolvedValue(null),
  }
})

afterEach(() => cleanup())

describe('PeakWeekWidget maps days-remaining to the correct protocol day', () => {
  it('shows the Show Day protocol on the actual show day (0 days out)', () => {
    seedUser(shiftDays(0))
    const { container } = render(<MemoryRouter><PeakWeekWidget /></MemoryRouter>)
    const txt = container.textContent ?? ''
    expect(txt).toContain('SHOW DAY')
    expect(txt).toContain('Show Day')
  })

  it('shows the Final Load / Tan day protocol one day out, NOT the Show Day protocol', () => {
    seedUser(shiftDays(1))
    const { container } = render(<MemoryRouter><PeakWeekWidget /></MemoryRouter>)
    const txt = container.textContent ?? ''
    // 1 day out = Saturday "Final Load & Tan Day" (daysOut 2), never show day.
    expect(txt).toContain('Final Load')
    expect(txt).not.toContain('Show Day')
    // Header still reports the literal days-out count.
    expect(txt).toContain('1 day')
  })

  it('shows the Monday depletion protocol six days out', () => {
    seedUser(shiftDays(6))
    const { container } = render(<MemoryRouter><PeakWeekWidget /></MemoryRouter>)
    const txt = container.textContent ?? ''
    // 6 days out = Monday "Depletion Training" (daysOut 7), the start of peak week.
    expect(txt).toContain('Depletion')
  })
})
