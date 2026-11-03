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

// Sanitize+migrate a raw parsed array into well-formed CardioEntry rows.
//
// cardio_log is shared across screens and user-editable, so — like every other
// log store (competitionLogs' validPosing/validSleep, localStore's `sanitize`) —
// a valid array can still carry a corrupt entry: a `null`, a hand-edited
// `minutes:"20"` string, or `minutes:"abc"`. Those slip past the top-level
// Array.isArray guard and then poison consumers: CardioWidget's
// `weekMins = reduce((s,e)=>s+e.minutes,0)` STRING-CONCATENATES a numeric total
// with a string minutes (`30 + "20"` → "3020"), rendering a nonsensical
// "· 3020 min". This mirrors cardio.ts `minutesOf`: coerce minutes with Number()
// and keep only finite values, drop entries without a usable date. Legacy rows
// (no per-entry id, older `{date,type,minutes}` format) are still migrated by
// minting an id. `changed` is true whenever anything was repaired/dropped so the
// cleaned log is persisted back.
function sanitizeEntries(raw: unknown[]): { entries: CardioEntry[]; changed: boolean } {
  let changed = false
  const entries: CardioEntry[] = []
  for (const e of raw) {
    if (!e || typeof e !== 'object') { changed = true; continue }
    const row = e as Record<string, unknown>
    if (typeof row.date !== 'string') { changed = true; continue }
    const minutes = Number(row.minutes)
    if (!Number.isFinite(minutes)) { changed = true; continue }
    const id = typeof row.id === 'string' ? row.id : genId()
    const type = typeof row.type === 'string' ? row.type : 'Other'
    if (id !== row.id || type !== row.type || minutes !== row.minutes) changed = true
    entries.push({ id, date: row.date, type, minutes })
  }
  return { entries, changed }
}

// Load persisted entries, sanitizing corrupt rows and migrating any legacy rows
// that predate per-entry ids (older format was { date, type, minutes }). Persists
// back whenever anything was repaired so the stored log stays clean and ids stay
// stable across reloads. Exported for unit testing the load seam.
export function loadInitial(): CardioEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem('cardio_log') ?? '[]')
    if (!Array.isArray(raw)) return []
    const { entries, changed } = sanitizeEntries(raw)
    if (changed) localStorage.setItem('cardio_log', JSON.stringify(entries))
    return entries
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
