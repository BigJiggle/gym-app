// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useUserStore } from '../../src/store/userStore'
import { usePlanStore } from '../../src/store/planStore'
import { useSettingsStore } from '../../src/store/settingsStore'
import PrepPaceWidget from '../../src/components/widgets/PrepPaceWidget'

function shiftDays(n: number): string {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + n).toLocaleDateString('en-CA')
}

// Seed a cutting athlete with a show 8 weeks out and two check-ins two weeks
// apart (so computeWeeklyWeightRate returns a real non-null rate and the
// Show-Day projection block renders).
function seed(targetWeightKg: string) {
  const showDate = shiftDays(56) // 8 weeks out
  useUserStore.setState({
    user: {
      id: 1, name: 'T', weight_kg: 79, sex: 'male', height_cm: 180, age: 30,
      goal: 'cut', training_frequency: 4, division: 'Classic', show_date: showDate,
    } as never,
    shows: [{ id: 1, user_id: 1, name: 'Nats', show_date: showDate, is_primary: 1 }] as never,
  } as never)
  usePlanStore.setState({
    trainingPlan: null, dietPlan: null, latestCheckin: null,
    checkinHistory: [
      { check_in_date: shiftDays(-1), weight_kg: 79 },
      { check_in_date: shiftDays(-15), weight_kg: 81 },
    ],
    mealCompletions: [], workoutHistory: [],
  } as never)
  useSettingsStore.setState({
    settings: { ...useSettingsStore.getState().settings, units: 'metric', target_weight_kg: targetWeightKg },
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

describe('PrepPaceWidget target-weight guard', () => {
  it('a corrupt target_weight_kg does not render literal "NaN"', () => {
    seed('abc')
    const { container } = render(<MemoryRouter><PrepPaceWidget /></MemoryRouter>)
    // The projection must still show (the pace / show-day line renders), but the
    // bad target reads as "no target set" — no NaN leaks to the athlete.
    expect(container.textContent ?? '').toContain('Show day')
    expect(container.textContent ?? '').not.toContain('NaN')
  })

  it('a "0" target_weight_kg is treated as no target (no 0-kg goal line)', () => {
    seed('0')
    const { container } = render(<MemoryRouter><PrepPaceWidget /></MemoryRouter>)
    expect(container.textContent ?? '').toContain('Show day')
    // A 0-kg goal is nonsensical; the "… above/below target" comparison must not render.
    expect(container.textContent ?? '').not.toContain('target)')
  })

  it('a valid target_weight_kg still renders the comparison', () => {
    seed('72')
    const { container } = render(<MemoryRouter><PrepPaceWidget /></MemoryRouter>)
    const text = container.textContent ?? ''
    expect(text).toContain('Show day')
    // projected ~71 kg vs 72 kg target → within 0.5? 71 vs 72 is 1.0 → shows "(… below target)"
    expect(text).toMatch(/on target|target\)/)
    expect(text).not.toContain('NaN')
  })
})
