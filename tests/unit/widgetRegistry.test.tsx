import { describe, it, expect } from 'vitest'
import { WIDGETS } from '../../src/components/widgets/registry'
import { ALL_WIDGET_IDS } from '../../src/components/widgets/useWidgets'

describe('widget registry', () => {
  it('every id in ALL_WIDGET_IDS has exactly one registry entry with a Component', () => {
    for (const id of ALL_WIDGET_IDS) {
      const matches = WIDGETS.filter((w) => w.id === id)
      expect(matches).toHaveLength(1)
      expect(typeof matches[0].Component).toBe('function')
      expect(matches[0].title.length).toBeGreaterThan(0)
    }
  })

  it('registry order matches ALL_WIDGET_IDS', () => {
    expect(WIDGETS.map((w) => w.id)).toEqual([...ALL_WIDGET_IDS])
  })
})
