// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { __sidebarStore, toggleSidebar } from '../../src/components/Layout/useSidebar'

describe('sidebar collapse store', () => {
  beforeEach(() => {
    localStorage.clear()
    __sidebarStore.reset()
  })

  it('defaults to expanded (not collapsed)', () => {
    expect(__sidebarStore.getSnapshot()).toBe(false)
  })

  it('toggle flips the state and persists to localStorage', () => {
    toggleSidebar()
    expect(__sidebarStore.getSnapshot()).toBe(true)
    expect(JSON.parse(localStorage.getItem('sidebar_collapsed')!)).toBe(true)
    toggleSidebar()
    expect(__sidebarStore.getSnapshot()).toBe(false)
    expect(JSON.parse(localStorage.getItem('sidebar_collapsed')!)).toBe(false)
  })

  it('reads a persisted collapsed state on load', () => {
    localStorage.setItem('sidebar_collapsed', 'true')
    __sidebarStore.reset()
    expect(__sidebarStore.getSnapshot()).toBe(true)
  })
})
