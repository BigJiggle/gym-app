// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { usePlanStore } from '../../src/store/planStore'
import { useSettingsStore } from '../../src/store/settingsStore'
import TodaysSessionWidget from '../../src/components/widgets/TodaysSessionWidget'
import { localDateStr } from '../../src/utils/dates'

// Regression: the dashboard "Today" widget must NOT surface a set logged with a
// weight but reps cleared to 0 as a "New PR Today". The live WorkoutSession stores
// such a set as `reps_actual: 0` (its reps input is `value={s.reps || ''}`, so
// clearing it makes `Number('') === 0`, and the ✓ button isn't rep-gated). Every
// other PR / top-set / last-performance surface in the app ignores a reps-0 set via
// the falsy `!reps_actual` guard (computePRs, exercisePRs, lastPerfBySession,
// WorkoutSession's lastPerformance/allTimePR, detectNewPRs); this widget used
// `reps_actual == null`, letting the 0 through — announcing a meaningless
// "100kg × 0" PR on the dashboard that no other surface recognized (a UI↔UI desync).

const todayStr = localDateStr()
const jsDay = new Date().getDay()
const todayDow = jsDay === 0 ? 7 : jsDay

beforeEach(() => {
  localStorage.clear()
  ;(window as unknown as { api: unknown }).api = {
    getExerciseLibrary: vi.fn().mockResolvedValue([]),
  }
  useSettingsStore.setState({ settings: { units: 'metric' } } as never)
  usePlanStore.setState({
    trainingPlan: {
      id: 1,
      phase: 'hypertrophy',
      sessions: [
        { id: 10, day_of_week: todayDow, session_name: 'Push', exercises: [
          { name: 'Bench Press', sets: 3, reps: '8-12', rir: 2 },
        ] },
      ],
    },
    workoutHistory: [
      {
        id: 100,
        user_id: 1,
        session_id: 10,
        date: todayStr,
        status: 'completed',
        started_at: `${todayStr}T10:00:00`,
        ended_at: `${todayStr}T11:00:00`,
        notes: null,
        // A heavy set with reps cleared to 0 — weight entered, reps blank.
        sets: [
          { id: 1, workout_log_id: 100, exercise_name: 'Bench Press', set_number: 1,
            reps_prescribed: '8-12', reps_actual: 0, weight_kg: 100, rir_actual: 2,
            skipped: false, notes: null },
        ],
      },
    ],
  } as never)
})

afterEach(() => cleanup())

describe('TodaysSessionWidget — reps-0 sets are not PRs', () => {
  it('does not announce a "X kg × 0" set as a new PR today', async () => {
    const { container } = render(<MemoryRouter><TodaysSessionWidget /></MemoryRouter>)
    await act(async () => {})
    const text = container.textContent ?? ''
    // The reps-0 set must not be announced as a record anywhere in the widget.
    expect(text).not.toContain('New PRs Today')
    expect(text).not.toMatch(/×\s*0\b/)
  })

  it('still announces a legitimate weighted PR with real reps', async () => {
    usePlanStore.setState((prev) => ({
      ...(prev as object),
      workoutHistory: [
        {
          id: 101,
          user_id: 1,
          session_id: 10,
          date: todayStr,
          status: 'completed',
          started_at: `${todayStr}T10:00:00`,
          ended_at: `${todayStr}T11:00:00`,
          notes: null,
          sets: [
            { id: 1, workout_log_id: 101, exercise_name: 'Bench Press', set_number: 1,
              reps_prescribed: '8-12', reps_actual: 8, weight_kg: 120, rir_actual: 1,
              skipped: false, notes: null },
          ],
        },
      ],
    }) as never)
    const { container } = render(<MemoryRouter><TodaysSessionWidget /></MemoryRouter>)
    await act(async () => {})
    const text = container.textContent ?? ''
    expect(text).toContain('New PRs Today')
    expect(text).toContain('120kg × 8')
  })
})
