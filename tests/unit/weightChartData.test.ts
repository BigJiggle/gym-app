import { describe, it, expect } from 'vitest'
import { buildWeightChartData } from '../../src/components/charts/WeightChart'
import type { ProgressEntry } from '../../src/types'

// Minimal ProgressEntry factory — only the fields the chart reads matter.
function entry(week: number, kg: number, date: string): ProgressEntry {
  return { week_number: week, weight_kg: kg, check_in_date: date } as ProgressEntry
}

const entries = [
  entry(1, 90, '2026-01-05'),
  entry(2, 89, '2026-01-12'),
  entry(3, 88, '2026-01-19'),
]

describe('buildWeightChartData — projected trajectory', () => {
  it('has no projected values when no projection is supplied', () => {
    const data = buildWeightChartData(entries, 'metric')
    expect(data).toHaveLength(3)
    expect(data.every((d) => d.projected === null)).toBe(true)
  })

  it('seeds the projected series so the dashed line has TWO endpoints (the bug: previously only one)', () => {
    const data = buildWeightChartData(entries, 'metric', 82, 6)
    // A projected "Show Day" row is appended.
    expect(data).toHaveLength(4)
    expect(data[data.length - 1].week).toBe('Show Day')
    expect(data[data.length - 1].projected).toBe(82)

    // The critical assertion: connectNulls needs >= 2 non-null points to draw a
    // line. Before the fix only the Show-Day row was non-null, so the projected
    // line never rendered (just a lone dot).
    const projectedPoints = data.filter((d) => d.projected !== null)
    expect(projectedPoints).toHaveLength(2)

    // The line must start at the LAST actual weigh-in, seeded to its own weight,
    // so the segment runs last-actual -> show-day.
    const lastActual = data[2]
    expect(lastActual.weight).toBe(88)
    expect(lastActual.projected).toBe(88)
  })

  it('converts both the seed and the projection to imperial consistently', () => {
    const data = buildWeightChartData(entries, 'imperial', 82, 6)
    const lastActual = data[2]
    const showDay = data[3]
    // 88 kg -> lbs and its projected seed must match (both display units).
    expect(lastActual.projected).toBe(lastActual.weight)
    expect(showDay.projected).toBe(Math.round(82 * 2.20462 * 10) / 10)
  })

  it('does not project when weeksToShow is zero/negative or the projection is missing', () => {
    expect(buildWeightChartData(entries, 'metric', 82, 0).every((d) => d.projected === null)).toBe(true)
    expect(buildWeightChartData(entries, 'metric', 82, -2).every((d) => d.projected === null)).toBe(true)
    expect(buildWeightChartData(entries, 'metric', undefined, 6).every((d) => d.projected === null)).toBe(true)
  })

  it('returns an empty array (no crash / no phantom show-day row) with no entries', () => {
    expect(buildWeightChartData([], 'metric', 82, 6)).toEqual([])
  })
})
