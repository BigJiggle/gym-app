// Reproduces the "one corrupt user TEXT cell bricks the whole app on launch" bug.
//
// parseUser runs on every user:get (the first IPC call loadUser makes on launch) and
// on user:create / user:update. It previously did a RAW JSON.parse on four TEXT
// columns — competition_history, dietary_restrictions, food_preferences,
// food_exclusions — guarded only by `?? '[]'`, which covers NULL but NOT a corrupt /
// hand-edited / legacy non-JSON cell (e.g. a bare `Dairy-free` instead of
// `["Dairy-free"]`). Such a cell makes JSON.parse THROW, which rejects user:get;
// loadUser catches it into `error` and leaves user=null, so the app can't load and
// can't escape (user:get re-reads the same latest row and throws again).
//
// This is the exact per-cell hole normalizeMeals (diet) / normalizeExercises (training)
// already close at their read seams. Fix: parse each array column through safeJsonArray,
// which falls back to [] on any null / non-string / unparseable / non-array value while
// passing well-formed data through unchanged.
import { describe, it, expect, vi } from 'vitest'

// userHandlers imports ../database/db (which imports electron's `app`); mock it so the
// pure parse helpers can be imported in a node test environment. The `electron` import
// in userHandlers is type-only and is erased at compile, so nothing else needs mocking.
vi.mock('../../electron/database/db', () => ({
  getDb: () => {
    throw new Error('db not available in this unit test')
  },
  namedParams: (obj: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(obj).map(([k, v]) => [`@${k}`, v ?? null])),
}))

import { safeJsonArray, parseUser } from '../../electron/ipc/userHandlers'

describe('safeJsonArray', () => {
  it('parses a well-formed JSON array string', () => {
    expect(safeJsonArray('["Dairy-free","No pork"]')).toEqual(['Dairy-free', 'No pork'])
  })

  it('passes an already-parsed array through unchanged', () => {
    const arr = ['a', 'b']
    expect(safeJsonArray(arr)).toBe(arr)
  })

  it('falls back to [] for a corrupt / non-JSON string (the crash case)', () => {
    expect(safeJsonArray('Dairy-free')).toEqual([])
    expect(safeJsonArray('{not json')).toEqual([])
  })

  it('falls back to [] for null / undefined / non-array JSON', () => {
    expect(safeJsonArray(null)).toEqual([])
    expect(safeJsonArray(undefined)).toEqual([])
    expect(safeJsonArray('{"a":1}')).toEqual([]) // valid JSON, but an object, not an array
    expect(safeJsonArray('42')).toEqual([])
  })
})

describe('parseUser', () => {
  const base = {
    id: 1,
    name: 'Test',
    is_natural: 1,
    include_snacks: 1,
    competition_history: '[]',
    dietary_restrictions: '[]',
    food_preferences: '[]',
    food_exclusions: '[]',
  }

  it('does NOT throw on a corrupt array cell — degrades to [] instead of bricking user:get', () => {
    const corrupt = { ...base, dietary_restrictions: 'Dairy-free' }
    expect(() => parseUser(corrupt)).not.toThrow()
    const parsed = parseUser(corrupt)
    expect(parsed.dietary_restrictions).toEqual([])
    // Other well-formed cells still parse correctly.
    expect(parsed.competition_history).toEqual([])
  })

  it('parses well-formed array cells correctly', () => {
    const parsed = parseUser({
      ...base,
      dietary_restrictions: '["No pork"]',
      food_preferences: '["chicken","rice"]',
    })
    expect(parsed.dietary_restrictions).toEqual(['No pork'])
    expect(parsed.food_preferences).toEqual(['chicken', 'rice'])
  })

  it('coerces boolean/number fields and applies defaults', () => {
    const parsed = parseUser({ ...base, is_natural: 0, include_snacks: 0 })
    expect(parsed.is_natural).toBe(false)
    expect(parsed.include_snacks).toBe(false)
    expect(parsed.snack_count).toBe(0)
    expect(parsed.culture_pref).toBe('any')
    expect(parsed.exercises_per_session).toBe(6)
    expect(parsed.sets_per_exercise).toBe(4)
  })
})
