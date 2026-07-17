import { useSyncExternalStore } from 'react'

// Reactive localStorage-backed JSON value shared across every consumer that
// mounts the returned hook — same external-store shape as useWidgets, so a
// widget writing a log and the Dashboard scorecard reading it stay in sync
// without a full page reload.
export function createLocalStore<T>(key: string, fallback: () => T) {
  const listeners = new Set<() => void>()
  let cache: T
  let hasCache = false

  function read(): T {
    try {
      const raw = localStorage.getItem(key)
      if (raw == null) return fallback()
      const parsed = JSON.parse(raw)
      const fb = fallback()
      // Valid JSON of the WRONG shape (hand-edited / corrupted storage) — e.g.
      // `null`, `{}`, `5`, `"x"` where an array is expected — slips past JSON.parse
      // without throwing, so the catch never fires. Returning it blindly would crash
      // consumers calling .map/.filter/.find on it. Fall back when the top-level
      // shape doesn't match the fallback (mirrors createWidgetStore/useWidgets).
      if (parsed == null || Array.isArray(parsed) !== Array.isArray(fb)) return fb
      return parsed as T
    } catch {
      return fallback()
    }
  }

  // getSnapshot must return a stable reference between renders when nothing has
  // changed, so cache the parsed value and only replace it on set().
  function getSnapshot(): T {
    if (!hasCache) { cache = read(); hasCache = true }
    return cache
  }

  function set(next: T) {
    cache = next
    hasCache = true
    localStorage.setItem(key, JSON.stringify(next))
    listeners.forEach((l) => l())
  }

  function subscribe(cb: () => void) {
    listeners.add(cb)
    return () => listeners.delete(cb)
  }

  // Test-only: drop the cached snapshot so the next read reflects a
  // cleared/seeded localStorage (the cache is a per-load singleton).
  function reset() { hasCache = false }

  function useValue(): T {
    return useSyncExternalStore(subscribe, getSnapshot)
  }

  return { getSnapshot, set, subscribe, useValue, reset }
}
