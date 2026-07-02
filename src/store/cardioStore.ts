import { create } from 'zustand'

export interface CardioEntry {
  id: string
  date: string
  type: string
  minutes: number
}

interface CardioStore {
  cardioLog: CardioEntry[]
  /** Append a new cardio session for today (multiple per day allowed). */
  addEntry: (type: string, minutes: number) => void
  /** Edit an existing session by id. */
  updateEntry: (id: string, type: string, minutes: number) => void
  /** Remove a single session by id. */
  removeEntry: (id: string) => void
}

function genId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  return c?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

// Load persisted entries, migrating any legacy rows that predate per-entry ids
// (older format was { date, type, minutes }). Persist back if we had to add ids
// so the ids stay stable across reloads.
function loadInitial(): CardioEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem('cardio_log') ?? '[]')
    if (!Array.isArray(raw)) return []
    let changed = false
    const migrated: CardioEntry[] = raw.map((e) => {
      if (e && typeof e.id === 'string') return e as CardioEntry
      changed = true
      return { id: genId(), date: e?.date, type: e?.type, minutes: e?.minutes }
    })
    if (changed) localStorage.setItem('cardio_log', JSON.stringify(migrated))
    return migrated
  } catch {
    return []
  }
}

function persist(entries: CardioEntry[]) {
  localStorage.setItem('cardio_log', JSON.stringify(entries))
}

function today(): string {
  return new Date().toLocaleDateString('en-CA')
}

export const useCardioStore = create<CardioStore>((set) => ({
  cardioLog: loadInitial(),

  addEntry: (type, minutes) =>
    set((s) => {
      const next = [...s.cardioLog, { id: genId(), date: today(), type, minutes }]
      persist(next)
      return { cardioLog: next }
    }),

  updateEntry: (id, type, minutes) =>
    set((s) => {
      const next = s.cardioLog.map((e) => (e.id === id ? { ...e, type, minutes } : e))
      persist(next)
      return { cardioLog: next }
    }),

  removeEntry: (id) =>
    set((s) => {
      const next = s.cardioLog.filter((e) => e.id !== id)
      persist(next)
      return { cardioLog: next }
    }),
}))
