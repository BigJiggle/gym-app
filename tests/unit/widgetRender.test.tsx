// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import WaterWidget from '../../src/components/widgets/WaterWidget'
import CardioWidget from '../../src/components/widgets/CardioWidget'
import SessionsWeekWidget from '../../src/components/widgets/SessionsWeekWidget'
import WeeklyVolumeWidget from '../../src/components/widgets/WeeklyVolumeWidget'
import WidgetZone from '../../src/components/widgets/WidgetZone'
import { __resetWidgetsForTest, STORAGE_KEY, MIGRATION_KEY } from '../../src/components/widgets/useWidgets'
import { usePlanStore } from '../../src/store/planStore'
import { useCardioStore } from '../../src/store/cardioStore'

beforeEach(() => {
  localStorage.clear()
  __resetWidgetsForTest()
  ;(window as unknown as { api: unknown }).api = {
    getExerciseLibrary: vi.fn().mockResolvedValue([]),
  }
  usePlanStore.setState({ trainingPlan: null, workoutHistory: [] } as never)
  useCardioStore.setState({ cardioLog: [] })
})

afterEach(() => cleanup())

describe('widget render smoke tests', () => {
  it('renders each widget standalone without crashing', async () => {
    render(<WaterWidget />)
    render(<CardioWidget />)
    render(<SessionsWeekWidget />)
    render(<WeeklyVolumeWidget />)
    expect(screen.getByText('Water Intake')).toBeTruthy()
    expect(screen.getByText('Cardio')).toBeTruthy()
    expect(screen.getByText('Sessions This Week')).toBeTruthy()
    expect(screen.getByText('Weekly Volume')).toBeTruthy()
    await act(async () => {}) // flush WeeklyVolumeWidget's async library fetch
  })

  it('renders WidgetZone with the enabled widgets', async () => {
    localStorage.setItem(MIGRATION_KEY, '1')
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['water', 'weekly-volume']))
    __resetWidgetsForTest()
    render(<MemoryRouter><WidgetZone /></MemoryRouter>)
    expect(screen.getByText('My Widgets')).toBeTruthy()
    expect(screen.getByText('Rearrange')).toBeTruthy()
    expect(screen.getByText('+ Add Widgets')).toBeTruthy()
    expect(screen.getByText('Water Intake')).toBeTruthy()
    expect(screen.getByText('Weekly Volume')).toBeTruthy()
    await act(async () => {}) // flush WeeklyVolumeWidget's async library fetch
  })

  it('shows the empty state when no widgets are enabled', () => {
    localStorage.setItem(MIGRATION_KEY, '1')
    localStorage.setItem(STORAGE_KEY, JSON.stringify([]))
    __resetWidgetsForTest()
    render(<MemoryRouter><WidgetZone /></MemoryRouter>)
    expect(screen.getByText('No widgets on your dashboard.')).toBeTruthy()
  })

  it('SessionsWeekWidget handles an empty plan gracefully', () => {
    render(<SessionsWeekWidget />)
    expect(screen.getByText('No training plan yet')).toBeTruthy()
  })
})
