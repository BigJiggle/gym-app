import { useCallback, useSyncExternalStore } from 'react'

export type WidgetId =
  // Dashboard content widgets (extracted from the old inline cards)
  | 'quick-stats' | 'todays-macros' | 'next-meal' | 'daily-weigh-in' | 'peak-week'
  | 'prep-pace' | 'weekly-scorecard' | 'todays-session' | 'checkin-feedback'
  | 'prep-guidance' | 'todays-meals' | 'recent-checkins' | 'training-volume' | 'muscle-coverage'
  // Logging / summary widgets
  | 'water' | 'cardio' | 'sessions-week' | 'weekly-volume'
  // Competition-only widgets
  | 'posing' | 'supplements' | 'sleep' | 'condition'

// Canonical order widgets appear in the Add Widgets catalog. Competition-only
// widgets are included but hidden by WidgetZone/AddWidgets until a show exists.
export const ALL_WIDGET_IDS: WidgetId[] = [
  'quick-stats', 'todays-macros', 'next-meal', 'daily-weigh-in',
  'prep-pace', 'weekly-scorecard', 'todays-session', 'checkin-feedback',
  'prep-guidance', 'todays-meals', 'recent-checkins', 'training-volume', 'muscle-coverage',
  'peak-week',
  'water', 'cardio', 'sessions-week', 'weekly-volume',
  'posing', 'supplements', 'sleep', 'condition',
]

// A clean, minimal set shown on a fresh install so the dashboard isn't a wall of
// cards. Everything else is one tap away in the Add Widgets catalog.
export const DEFAULT_WIDGET_IDS: WidgetId[] = [
  'quick-stats', 'todays-macros', 'next-meal', 'daily-weigh-in', 'sessions-week',
]

export const STORAGE_KEY = 'dashboard_widgets'
// One-time migration marker. Before the dashboard was fully widgetized, an
// existing user's stored list held only the small log widgets; the big cards were
// inline. Folding the core content widgets into their list once keeps those cards
// from silently disappearing when they became widgets.
export const MIGRATION_KEY = 'dashboard_widgets_v2'

function read(): WidgetId[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw == null) return [...DEFAULT_WIDGET_IDS]
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return [...DEFAULT_WIDGET_IDS]
    // Keep only known ids, preserving stored order, and de-dupe so corrupted or
    // hand-edited storage can't produce duplicate React keys / repeated widgets.
    const known = parsed.filter((id): id is WidgetId => (ALL_WIDGET_IDS as string[]).includes(id))
    return [...new Set(known)]
  } catch {
    return [...DEFAULT_WIDGET_IDS]
  }
}

// Simple external store so multiple mounted consumers stay in sync.
const listeners = new Set<() => void>()
let cache: WidgetId[] | null = null

function getSnapshot(): WidgetId[] {
  if (cache == null) {
    if (localStorage.getItem(MIGRATION_KEY) == null) {
      // Existing user (has a stored list) → fold in any missing core content
      // widgets at the front. Fresh install (no stored list) just takes defaults.
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored != null) {
        const cur = read()
        const merged = [...DEFAULT_WIDGET_IDS.filter((id) => !cur.includes(id)), ...cur]
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
      }
      localStorage.setItem(MIGRATION_KEY, '1')
    }
    cache = read()
  }
  return cache
}

function write(next: WidgetId[]) {
  cache = next
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  listeners.forEach((l) => l())
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

// Test-only: drop the cached snapshot so the next read reflects a cleared/seeded
// localStorage. Not used by the app (the cache is a per-load singleton).
export function __resetWidgetsForTest() {
  cache = null
}

export function useWidgets() {
  const enabledIds = useSyncExternalStore(subscribe, getSnapshot)

  const enable = useCallback((id: WidgetId) => {
    const cur = getSnapshot()
    if (cur.includes(id)) return
    write([...cur, id])
  }, [])

  const disable = useCallback((id: WidgetId) => {
    write(getSnapshot().filter((x) => x !== id))
  }, [])

  const reorder = useCallback((from: number, to: number) => {
    const cur = [...getSnapshot()]
    if (from < 0 || from >= cur.length || to < 0 || to >= cur.length) return
    const [moved] = cur.splice(from, 1)
    cur.splice(to, 0, moved)
    write(cur)
  }, [])

  return { enabledIds, enable, disable, reorder }
}
