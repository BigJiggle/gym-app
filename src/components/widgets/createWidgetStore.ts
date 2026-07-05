import { useSyncExternalStore } from 'react'

// Generic, reactive localStorage-backed "which widgets are enabled" store,
// factored out of the dashboard's useWidgets so any tab (Training, Nutrition, …)
// can have its own add/removable widget layout with a DISTINCT storage key.
//
// Semantics match the dashboard: empty/absent storage => all ids enabled in
// canonical order; unknown ids are dropped and duplicates de-duped so corrupted
// or hand-edited storage can't produce repeated widgets / duplicate React keys.
export interface WidgetStore<Id extends string> {
  useEnabledIds(): Id[]
  getSnapshot(): Id[]
  enable(id: Id): void
  disable(id: Id): void
  reorder(from: number, to: number): void
  // Test-only: drop the cached snapshot so the next read reflects cleared/seeded
  // localStorage (the cache is a per-load singleton).
  reset(): void
}

export function createWidgetStore<Id extends string>(
  storageKey: string,
  allIds: readonly Id[],
  // Which ids are enabled on a fresh install (no stored value). Defaults to the
  // full set; pass a trimmed subset to keep the default layout uncluttered while
  // the rest stay addable from the catalog.
  defaultIds: readonly Id[] = allIds,
): WidgetStore<Id> {
  const known = new Set<string>(allIds as readonly string[])
  const listeners = new Set<() => void>()
  let cache: Id[] | null = null

  function read(): Id[] {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw == null) return [...defaultIds]
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return [...defaultIds]
      const filtered = parsed.filter((id): id is Id => known.has(id))
      return [...new Set(filtered)]
    } catch {
      return [...defaultIds]
    }
  }

  function getSnapshot(): Id[] {
    if (cache == null) cache = read()
    return cache
  }

  function write(next: Id[]) {
    cache = next
    localStorage.setItem(storageKey, JSON.stringify(next))
    listeners.forEach((l) => l())
  }

  function subscribe(cb: () => void) {
    listeners.add(cb)
    return () => listeners.delete(cb)
  }

  return {
    useEnabledIds() {
      return useSyncExternalStore(subscribe, getSnapshot)
    },
    getSnapshot,
    enable(id: Id) {
      const cur = getSnapshot()
      if (cur.includes(id)) return
      write([...cur, id])
    },
    disable(id: Id) {
      write(getSnapshot().filter((x) => x !== id))
    },
    reorder(from: number, to: number) {
      const cur = [...getSnapshot()]
      if (from < 0 || from >= cur.length || to < 0 || to >= cur.length) return
      const [moved] = cur.splice(from, 1)
      cur.splice(to, 0, moved)
      write(cur)
    },
    reset() {
      cache = null
    },
  }
}
