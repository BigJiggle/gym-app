import { useCallback, useSyncExternalStore } from 'react'

export type WidgetId = 'water' | 'cardio' | 'sessions-week' | 'weekly-volume'

// Canonical order widgets appear in when none have been reordered/added.
export const ALL_WIDGET_IDS: WidgetId[] = ['water', 'cardio', 'sessions-week', 'weekly-volume']
export const STORAGE_KEY = 'dashboard_widgets'

function read(): WidgetId[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw == null) return [...ALL_WIDGET_IDS]
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return [...ALL_WIDGET_IDS]
    // Keep only known ids, preserving stored order.
    return parsed.filter((id): id is WidgetId => (ALL_WIDGET_IDS as string[]).includes(id))
  } catch {
    return [...ALL_WIDGET_IDS]
  }
}

// Simple external store so multiple mounted consumers stay in sync.
const listeners = new Set<() => void>()
let cache: WidgetId[] | null = null

function getSnapshot(): WidgetId[] {
  if (cache == null) cache = read()
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
