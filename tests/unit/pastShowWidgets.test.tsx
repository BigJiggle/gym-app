// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useUserStore } from '../../src/store/userStore'
import { usePlanStore } from '../../src/store/planStore'
import PeakWeekWidget from '../../src/components/widgets/PeakWeekWidget'
import QuickStatsWidget from '../../src/components/widgets/QuickStatsWidget'

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

describe('past-show widgets no longer read as SHOW DAY', () => {
  it('PeakWeekWidget renders nothing for a show that was yesterday', () => {
    seedUser(shiftDays(-1))
    const { container } = render(<MemoryRouter><PeakWeekWidget /></MemoryRouter>)
    expect(container.textContent ?? '').not.toContain('SHOW DAY')
    expect(container.firstChild).toBeNull()
  })

  it('PeakWeekWidget still renders on the actual show day', () => {
    seedUser(shiftDays(0))
    const { container } = render(<MemoryRouter><PeakWeekWidget /></MemoryRouter>)
    expect(container.textContent ?? '').toContain('SHOW DAY')
  })

  it('QuickStatsWidget does not show "Show Day!" for a past show', () => {
    seedUser(shiftDays(-1))
    const { container } = render(<MemoryRouter><QuickStatsWidget /></MemoryRouter>)
    expect(container.textContent ?? '').not.toContain('Show Day!')
    // Falls back to the Phase card (matching the post-relaunch state).
    expect(container.textContent ?? '').toContain('Phase')
  })

  it('QuickStatsWidget still shows "Show Day!" on the actual show day', () => {
    seedUser(shiftDays(0))
    const { container } = render(<MemoryRouter><QuickStatsWidget /></MemoryRouter>)
    expect(container.textContent ?? '').toContain('Show Day!')
  })
})
