// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import TodaysMealsWidget from '../../src/components/widgets/TodaysMealsWidget'
import { useUserStore } from '../../src/store/userStore'
import { usePlanStore } from '../../src/store/planStore'
import { localDateStr } from '../../src/utils/dates'

// A stored diet plan can carry calories_target=0 / protein_g=0 — a legacy or
// AI-origin row. The engine floors new plans at MIN_CALORIE_TARGET and the AI
// write seams sanitize, but plan:recalculateMacros floors calories only LOCALLY
// and never writes calories_target back, so a pre-existing 0 persists. Every
// other nutrition surface (TodaysMacrosWidget, Diet index "Today's Intake")
// guards its `eaten / target` divisions with `target > 0 ? … : 0`. This widget
// must too, or the progress bars divide by zero.

function renderWidget() {
  return render(
    <MemoryRouter>
      <TodaysMealsWidget />
    </MemoryRouter>
  )
}

const meal = (over: Record<string, unknown>) => ({
  name: 'Meal 1', time: '8:00 AM', calories: 500, protein_g: 40, carbs_g: 50, fat_g: 15, foods: [], ...over,
})

beforeEach(() => {
  localStorage.clear()
  useUserStore.setState({ user: { id: 1, name: 'T', weight_kg: 80, goal: 'cut' } as never, shows: [] } as never)
})

afterEach(() => cleanup())

// Extract every inline `width: X%` from the rendered progress bars.
function barWidths(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll<HTMLElement>('div[style*="width"]'))
    .map((el) => el.style.width)
}

describe('TodaysMealsWidget with a corrupted calories_target=0 / protein_g=0 plan', () => {
  it('does not render a NaN% bar width when nothing is logged (0/0)', () => {
    usePlanStore.setState({
      dietPlan: { calories_target: 0, protein_g: 0, carbs_g: 0, fat_g: 0, meals: [meal({})] } as never,
      mealCompletions: [],
    } as never)
    const { container } = renderWidget()
    const widths = barWidths(container)
    // With no guard, 0/0 → NaN → `width: NaN%`, invalid CSS the DOM drops to '' —
    // a blank bar. Guarded, the bars clamp to a valid 0%.
    expect(widths.length).toBeGreaterThan(0)
    for (const w of widths) {
      expect(w.includes('NaN'), `bar width was "${w}"`).toBe(false)
      expect(w, 'expected a valid 0% width, not invalid/empty CSS').toBe('0%')
    }
  })

  it('does not render a falsely-100% bar when a meal is logged against a 0 target (x/0 → Infinity)', () => {
    usePlanStore.setState({
      dietPlan: { calories_target: 0, protein_g: 0, carbs_g: 0, fat_g: 0, meals: [meal({})] } as never,
      mealCompletions: [{ id: 1, user_id: 1, date: localDateStr(), meal_index: 0, meal_name: 'Meal 1', completed: 1 }],
    } as never)
    const { container } = renderWidget()
    const widths = barWidths(container)
    // Denominator 0 must clamp the bars to 0%, matching TodaysMacrosWidget — not
    // Infinity → min(100, Infinity) = 100 (a bar falsely reading fully complete).
    expect(widths.length).toBeGreaterThan(0)
    for (const w of widths) {
      expect(w.includes('NaN'), `bar width was "${w}"`).toBe(false)
      expect(w).toBe('0%')
    }
  })

  it('still computes a correct percentage for a valid plan', () => {
    usePlanStore.setState({
      dietPlan: { calories_target: 2000, protein_g: 160, carbs_g: 200, fat_g: 60, meals: [meal({ calories: 1000, protein_g: 80 }), meal({ name: 'Meal 2', calories: 1000, protein_g: 80 })] } as never,
      mealCompletions: [{ id: 1, user_id: 1, date: localDateStr(), meal_index: 0, meal_name: 'Meal 1', completed: 1 }],
    } as never)
    const { container } = renderWidget()
    const widths = barWidths(container)
    // 1000/2000 = 50% calories, 80/160 = 50% protein.
    expect(widths).toContain('50%')
    for (const w of widths) expect(w.includes('NaN')).toBe(false)
  })
})
