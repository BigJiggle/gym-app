// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PosingWidget from '../../src/components/widgets/PosingWidget'
import SleepWidget from '../../src/components/widgets/SleepWidget'
import SupplementWidget from '../../src/components/widgets/SupplementWidget'
import ConditionWidget from '../../src/components/widgets/ConditionWidget'
import WidgetZone from '../../src/components/widgets/WidgetZone'
import AddWidgets from '../../src/pages/AddWidgets/index'
import { __resetWidgetsForTest, STORAGE_KEY, MIGRATION_KEY } from '../../src/components/widgets/useWidgets'
import { posingStore, sleepStore, conditionStore, supplementListStore, supplementLogStore } from '../../src/components/widgets/competitionLogs'
import { useUserStore } from '../../src/store/userStore'
import { usePlanStore } from '../../src/store/planStore'
import { useCardioStore } from '../../src/store/cardioStore'

function setShow(has: boolean) {
  useUserStore.setState({ shows: has ? ([{ id: 1 }] as never) : [], user: null } as never)
}

beforeEach(() => {
  localStorage.clear()
  __resetWidgetsForTest()
  posingStore.reset(); sleepStore.reset(); conditionStore.reset()
  supplementListStore.reset(); supplementLogStore.reset()
  ;(window as unknown as { api: unknown }).api = {
    getExerciseLibrary: vi.fn().mockResolvedValue([]),
  }
  usePlanStore.setState({ trainingPlan: null, workoutHistory: [] } as never)
  useCardioStore.setState({ cardioLog: [] })
  setShow(false)
})

afterEach(() => cleanup())

describe('competition widgets', () => {
  it('each renders standalone without crashing', () => {
    render(<PosingWidget />)
    render(<SleepWidget />)
    render(<SupplementWidget />)
    render(<ConditionWidget />)
    expect(screen.getByText('Posing Practice')).toBeTruthy()
    expect(screen.getByText('Sleep')).toBeTruthy()
    expect(screen.getByText('Supplements')).toBeTruthy()
    expect(screen.getByText('Daily Condition')).toBeTruthy()
  })

  it('logging a posing session persists and is reflected via the shared store', () => {
    render(<PosingWidget />)
    fireEvent.click(screen.getByText('Full 15m'))
    expect(posingStore.getSnapshot().some((e) => e.minutes === 15)).toBe(true)
  })

  it('WidgetZone hides competition widgets when no show is selected', () => {
    localStorage.setItem(MIGRATION_KEY, '1')
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['posing', 'sleep']))
    __resetWidgetsForTest()
    setShow(false)
    render(<MemoryRouter><WidgetZone /></MemoryRouter>)
    expect(screen.queryByText('Posing Practice')).toBeNull()
    expect(screen.queryByText('Sleep')).toBeNull()
    // With only competition widgets enabled and no show, the zone is empty.
    expect(screen.getByText('No widgets on your dashboard.')).toBeTruthy()
  })

  it('WidgetZone shows competition widgets once a show exists', () => {
    localStorage.setItem(MIGRATION_KEY, '1')
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['posing', 'sleep']))
    __resetWidgetsForTest()
    setShow(true)
    render(<MemoryRouter><WidgetZone /></MemoryRouter>)
    expect(screen.getByText('Posing Practice')).toBeTruthy()
    expect(screen.getByText('Sleep')).toBeTruthy()
  })

  it('AddWidgets catalog omits competition widgets without a show, offers them with one', () => {
    setShow(false)
    const { unmount } = render(<MemoryRouter><AddWidgets /></MemoryRouter>)
    expect(screen.queryByText('Posing Practice')).toBeNull()
    expect(screen.getAllByText('Water Intake').length).toBeGreaterThan(0)
    unmount()

    setShow(true)
    render(<MemoryRouter><AddWidgets /></MemoryRouter>)
    expect(screen.getAllByText('Posing Practice').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Daily Condition').length).toBeGreaterThan(0)
  })
})
