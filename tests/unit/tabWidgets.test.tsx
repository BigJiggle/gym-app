// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { createWidgetStore } from '../../src/components/widgets/createWidgetStore'
import TabWidgetControls from '../../src/components/widgets/TabWidgetControls'
import type { TabWidgetMeta } from '../../src/components/widgets/TabWidgetControls'

const KEY = 'test_tab_widgets'
const IDS = ['a', 'b', 'c']
const META: TabWidgetMeta[] = [
  { id: 'a', title: 'Alpha', description: 'first' },
  { id: 'b', title: 'Beta', description: 'second' },
  { id: 'c', title: 'Gamma', description: 'third' },
]

describe('createWidgetStore', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults to all ids in order when storage is empty', () => {
    const store = createWidgetStore(KEY, IDS)
    store.reset()
    expect(store.getSnapshot()).toEqual(['a', 'b', 'c'])
  })

  it('disable removes an id and persists to its own key', () => {
    const store = createWidgetStore(KEY, IDS)
    store.reset()
    store.disable('b')
    expect(store.getSnapshot()).toEqual(['a', 'c'])
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(['a', 'c'])
  })

  it('enable re-adds a previously-disabled id at the end', () => {
    const store = createWidgetStore(KEY, IDS)
    store.reset()
    store.disable('a')
    store.enable('a')
    expect(store.getSnapshot()).toEqual(['b', 'c', 'a'])
  })

  it('enable is a no-op for an already-enabled id', () => {
    const store = createWidgetStore(KEY, IDS)
    store.reset()
    store.enable('a')
    expect(store.getSnapshot()).toEqual(['a', 'b', 'c'])
  })

  it('defaults to a trimmed subset when provided, keeping the rest addable', () => {
    const store = createWidgetStore(KEY, IDS, ['a', 'c'])
    store.reset()
    expect(store.getSnapshot()).toEqual(['a', 'c'])
    // A non-default id is still known, so it can be added from the catalog
    store.enable('b')
    expect(store.getSnapshot()).toEqual(['a', 'c', 'b'])
  })

  it('drops unknown ids and de-dupes corrupted storage', () => {
    localStorage.setItem(KEY, JSON.stringify(['b', 'bogus', 'b', 'a']))
    const store = createWidgetStore(KEY, IDS)
    store.reset()
    expect(store.getSnapshot()).toEqual(['b', 'a'])
  })

  it('falls back to all ids on non-array / malformed storage', () => {
    localStorage.setItem(KEY, '{"not":"an array"}')
    const store = createWidgetStore(KEY, IDS)
    store.reset()
    expect(store.getSnapshot()).toEqual(['a', 'b', 'c'])
  })

  it('two stores with different keys stay independent', () => {
    const s1 = createWidgetStore('key_one', IDS)
    const s2 = createWidgetStore('key_two', IDS)
    s1.reset(); s2.reset()
    s1.disable('a')
    expect(s1.getSnapshot()).toEqual(['b', 'c'])
    expect(s2.getSnapshot()).toEqual(['a', 'b', 'c'])
  })
})

describe('TabWidgetControls', () => {
  beforeEach(() => { localStorage.clear() })
  afterEach(() => cleanup())

  it('shows the count and toggles items via the customize panel', () => {
    const store = createWidgetStore(KEY, IDS)
    store.reset()
    render(<TabWidgetControls store={store} items={META} />)

    expect(screen.getByText('3/3 shown')).toBeTruthy()

    // Open the customize panel and remove one section
    fireEvent.click(screen.getByText('Customize'))
    const removeButtons = screen.getAllByText('Remove')
    fireEvent.click(removeButtons[0])

    expect(screen.getByText('2/3 shown')).toBeTruthy()
    expect(store.getSnapshot()).toEqual(['b', 'c'])

    // Re-add it
    fireEvent.click(screen.getByText('+ Add'))
    expect(screen.getByText('3/3 shown')).toBeTruthy()
  })
})
