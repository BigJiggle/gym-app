// Cardio logging shares the `cardio_log` localStorage key across two screens with
// DIFFERENT models: the dashboard Cardio widget (`cardioStore`) stores MULTIPLE
// sessions per day, each with its own id (e.g. a morning LISS + an evening HIIT),
// and sums them; the Diet page shows a single "today's cardio minutes" stepper.
//
// The Diet page used `log.find(e => e.date === day)?.minutes` — only the FIRST
// session — so a day with [LISS 30, HIIT 20] read back as 30 instead of 50,
// undercounting today's and the week's totals. Its stepper write then rebuilt the
// day from that wrong baseline and collapsed every same-day session into one entry,
// so a "+5" tap stored 35 and permanently lost 15 real minutes.
//
// These helpers mirror the water-tracker fix (`nextWaterMl`): read the TRUE stored
// total so the two screens agree, and write non-destructively — other days are left
// exactly as they were. (A single-number stepper can only express a day total, so an
// explicit +/- tap does consolidate that day's sessions into one entry carrying the
// correct new total; it never silently drops minutes the way the old read did.)

export interface CardioLogEntry {
  id?: string
  date?: string
  type?: string
  minutes?: number
}

function entriesOf(log: unknown): CardioLogEntry[] {
  return Array.isArray(log)
    ? (log.filter((e) => !!e && typeof e === 'object') as CardioLogEntry[])
    : []
}

function minutesOf(e: CardioLogEntry): number {
  const m = Number(e.minutes)
  return Number.isFinite(m) && m > 0 ? m : 0
}

// Total cardio minutes logged on `date`, summed across every session that day.
// A non-array / corrupt log, or entries with non-finite / non-positive minutes,
// contribute 0 (no throw).
export function cardioMinutesOn(log: unknown, date: string): number {
  return entriesOf(log)
    .filter((e) => e.date === date)
    .reduce((sum, e) => sum + minutesOf(e), 0)
}

// Apply a ±minute delta to `date`'s TOTAL cardio, clamped to [0, maxMin]. Every
// entry on a DIFFERENT day is preserved verbatim; the target day collapses to a
// single entry carrying the new total (reusing an existing session's id/type so
// the store needn't re-migrate, defaulting to a fresh LISS entry). A zero total
// removes the day's entries. Returns the rewritten log and the new total.
export function nextCardioLog(
  log: unknown,
  date: string,
  deltaMin: number,
  maxMin = 120,
): { log: CardioLogEntry[]; total: number } {
  const entries = entriesOf(log)
  const others = entries.filter((e) => e.date !== date)
  const todays = entries.filter((e) => e.date === date)
  const current = todays.reduce((sum, e) => sum + minutesOf(e), 0)
  const total = Math.max(0, Math.min(maxMin, current + deltaMin))
  if (total <= 0) return { log: others, total: 0 }
  const id = todays.find((e) => typeof e.id === 'string')?.id
  const type = todays.find((e) => typeof e.type === 'string')?.type ?? 'LISS'
  const todayEntry: CardioLogEntry = id
    ? { id, date, type, minutes: total }
    : { date, type, minutes: total }
  return { log: [...others, todayEntry], total }
}
