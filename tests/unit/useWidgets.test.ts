// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWidgets, ALL_WIDGET_IDS, STORAGE_KEY, __resetWidgetsForTest } from '../../src/components/widgets/useWidgets'

describe('useWidgets', () => {
  beforeEach(() => {
    localStorage.clear()
    __resetWidgetsForTest()
  })

  it('defaults to all widget ids in order when storage is empty', () => {
    const { result } = renderHook(() => useWidgets())
    expect(result.current.enabledIds).toEqual([...ALL_WIDGET_IDS])
  })

  it('disable removes an id and persists', () => {
    const { result } = renderHook(() => useWidgets())
    act(() => result.current.disable(ALL_WIDGET_IDS[0]))
    expect(result.current.enabledIds).not.toContain(ALL_WIDGET_IDS[0])
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(result.current.enabledIds)
  })

  it('enable appends a previously-disabled id', () => {
    const { result } = renderHook(() => useWidgets())
    const id = ALL_WIDGET_IDS[0]
    act(() => result.current.disable(id))
    act(() => result.current.enable(id))
    expect(result.current.enabledIds[result.current.enabledIds.length - 1]).toBe(id)
  })

  it('reorder moves an id from one index to another', () => {
    const { result } = renderHook(() => useWidgets())
    const first = result.current.enabledIds[0]
    act(() => result.current.reorder(0, 2))
    expect(result.current.enabledIds[2]).toBe(first)
  })

  it('ignores unknown ids stored in localStorage', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['bogus', ALL_WIDGET_IDS[0]]))
    const { result } = renderHook(() => useWidgets())
    expect(result.current.enabledIds).toEqual([ALL_WIDGET_IDS[0]])
  })
})
