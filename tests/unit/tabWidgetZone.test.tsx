// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { createWidgetStore } from '../../src/components/widgets/createWidgetStore'
import TabWidgetZone from '../../src/components/widgets/TabWidgetZone'
import type { TabWidgetMeta } from '../../src/components/widgets/TabWidgetControls'

const KEY = 'test_zone_widgets'
const IDS = ['a', 'b', 'c']
const META: TabWidgetMeta[] = [
  { id: 'a', title: 'Alpha', description: 'first' },
  { id: 'b', title: 'Beta', description: 'second' },
  { id: 'c', title: 'Gamma', description: 'third' },
]

function nodesFor(ids: string[]): Record<string, any> {
  const out: Record<string, any> = {}
  for (const id of ids) out[id] = <div data-testid={`w-${id}`}>widget {id}</div>
  return out
}

// Rendered widget order as their id list, in DOM order.
function renderedOrder(): string[] {
  return screen.getAllByTestId(/^w-/).map((el) => el.getAttribute('data-testid')!.slice(2))
}

// The draggable card wrappers, in visible order.
function wrappers(): NodeListOf<Element> {
  return document.querySelectorAll('[draggable="true"]')
}

describe('TabWidgetZone', () => {
  beforeEach(() => { localStorage.clear() })
  afterEach(() => cleanup())

  it('renders enabled widgets in the stored order', () => {
    const store = createWidgetStore(KEY, IDS)
    store.reset()
    render(<TabWidgetZone store={store} items={META} nodes={nodesFor(IDS)} label="Plan widgets" />)
    expect(renderedOrder()).toEqual(['a', 'b', 'c'])
    expect(screen.getByText('3/3 shown')).toBeTruthy()
  })

  it('respects a non-canonical stored order', () => {
    localStorage.setItem(KEY, JSON.stringify(['c', 'a', 'b']))
    const store = createWidgetStore(KEY, IDS)
    store.reset()
    render(<TabWidgetZone store={store} items={META} nodes={nodesFor(IDS)} />)
    expect(renderedOrder()).toEqual(['c', 'a', 'b'])
  })

  it('drag-reorder persists the new order to the store', () => {
    const store = createWidgetStore(KEY, IDS)
    store.reset()
    render(<TabWidgetZone store={store} items={META} nodes={nodesFor(IDS)} />)

    fireEvent.click(screen.getByText('Rearrange'))
    const cards = wrappers()
    // Drag the third widget (c) onto the first slot (a).
    fireEvent.dragStart(cards[2])
    fireEvent.dragEnter(cards[0])
    fireEvent.dragOver(cards[0])
    fireEvent.drop(cards[0])

    expect(store.getSnapshot()).toEqual(['c', 'a', 'b'])
    // Persisted to localStorage under this store's own key.
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(['c', 'a', 'b'])
    // DOM reflects the new order after the store notifies.
    expect(renderedOrder()).toEqual(['c', 'a', 'b'])
  })

  it('skips a widget with no renderable node but keeps its stored slot so reorder indices stay aligned', () => {
    const store = createWidgetStore(KEY, IDS)
    store.reset()
    // 'a' has no content this render; 'b' and 'c' do.
    const nodes = { a: null, b: <div data-testid="w-b">b</div>, c: <div data-testid="w-c">c</div> }
    render(<TabWidgetZone store={store} items={META} nodes={nodes} />)
    expect(renderedOrder()).toEqual(['b', 'c'])

    fireEvent.click(screen.getByText('Rearrange'))
    const cards = wrappers() // visible = [b (real idx 1), c (real idx 2)]
    // Drag c onto b — must reorder using real stored indices (2 -> 1), not visible ones.
    fireEvent.dragStart(cards[1])
    fireEvent.drop(cards[0])

    // 'a' stays at the front; c and b swap.
    expect(store.getSnapshot()).toEqual(['a', 'c', 'b'])
  })

  it('hides the Rearrange toggle when only one widget is visible', () => {
    const store = createWidgetStore(KEY, IDS, ['a'])
    store.reset()
    render(<TabWidgetZone store={store} items={META} nodes={nodesFor(IDS)} />)
    expect(screen.queryByText('Rearrange')).toBeNull()
    // Customize (add/remove) is still available to bring more widgets in.
    expect(screen.getByText('Customize')).toBeTruthy()
  })
})
