// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  useWidgets, ALL_WIDGET_IDS, DEFAULT_WIDGET_IDS, STORAGE_KEY, MIGRATION_KEY, __resetWidgetsForTest,
} from '../../src/components/widgets/useWidgets'

describe('useWidgets', () => {
  beforeEach(() => {
    localStorage.clear()
    __resetWidgetsForTest()
  })

  it('defaults to the clean default set on a fresh install', () => {
    const { result } = renderHook(() => useWidgets())
    expect(result.current.enabledIds).toEqual([...DEFAULT_WIDGET_IDS])
  })

  it('disable removes an id and persists', () => {
    localStorage.setItem(MIGRATION_KEY, '1')
    const { result } = renderHook(() => useWidgets())
    act(() => result.current.disable(DEFAULT_WIDGET_IDS[0]))
    expect(result.current.enabledIds).not.toContain(DEFAULT_WIDGET_IDS[0])
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(result.current.enabledIds)
  })

  it('enable appends a previously-disabled id', () => {
    localStorage.setItem(MIGRATION_KEY, '1')
    const { result } = renderHook(() => useWidgets())
    const id = DEFAULT_WIDGET_IDS[0]
    act(() => result.current.disable(id))
    act(() => result.current.enable(id))
    expect(result.current.enabledIds[result.current.enabledIds.length - 1]).toBe(id)
  })

  it('reorder moves an id from one index to another', () => {
    localStorage.setItem(MIGRATION_KEY, '1')
    const { result } = renderHook(() => useWidgets())
    const first = result.current.enabledIds[0]
    act(() => result.current.reorder(0, 2))
    expect(result.current.enabledIds[2]).toBe(first)
  })

  it('ignores unknown ids stored in localStorage', () => {
    localStorage.setItem(MIGRATION_KEY, '1')
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['bogus', ALL_WIDGET_IDS[0]]))
    const { result } = renderHook(() => useWidgets())
    expect(result.current.enabledIds).toEqual([ALL_WIDGET_IDS[0]])
  })

  it('de-dupes repeated ids from corrupted/hand-edited storage', () => {
    localStorage.setItem(MIGRATION_KEY, '1')
    const id = ALL_WIDGET_IDS[0]
    localStorage.setItem(STORAGE_KEY, JSON.stringify([id, id, ALL_WIDGET_IDS[1], id]))
    const { result } = renderHook(() => useWidgets())
    expect(result.current.enabledIds).toEqual([id, ALL_WIDGET_IDS[1]])
  })

  it('migrates a legacy list once, folding in missing core widgets without losing existing ones', () => {
    // Legacy user: only the small log widgets, no migration marker.
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['water', 'cardio', 'sessions-week']))
    const { result } = renderHook(() => useWidgets())
    const ids = result.current.enabledIds
    // Their originals are preserved…
    expect(ids).toContain('water')
    expect(ids).toContain('cardio')
    // …and the core content widgets they were missing are folded in.
    expect(ids).toContain('todays-macros')
    expect(ids).toContain('next-meal')
    // 'sessions-week' (a default they already had) is not duplicated.
    expect(ids.filter((x) => x === 'sessions-week')).toHaveLength(1)
    // Marker is set so it won't migrate again.
    expect(localStorage.getItem(MIGRATION_KEY)).toBe('1')
  })
})
