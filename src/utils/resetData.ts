// Data-reset helpers. A reset wipes ALL app-local data EXCEPT the user's
// weigh-in history (the daily weight log) and their water intake logs. The
// check-in weight history lives in the SQLite `weekly_checkins` table, which the
// main-process reset cascades away — so those weigh-ins are snapshotted before
// the delete and folded into the surviving daily weight log here.

export interface WeighIn {
  date: string
  weight_kg: number
}

const WEIGHT_LOG_KEY = 'daily_weight_log'
const WATER_TARGET_KEY = 'water_target_ml'
const WATER_LOG_PREFIX = 'water_ml_'

/**
 * localStorage keys that survive a data reset: the weigh-in history and the
 * water intake logs/target. Everything else is app-local data that gets wiped.
 */
export function isPreservedKey(key: string): boolean {
  return (
    key === WEIGHT_LOG_KEY ||
    key === WATER_TARGET_KEY ||
    key.startsWith(WATER_LOG_PREFIX)
  )
}

function isValidWeighIn(w: unknown): w is WeighIn {
  if (!w || typeof w !== 'object') return false
  const { date, weight_kg } = w as Record<string, unknown>
  return (
    typeof date === 'string' &&
    date.length > 0 &&
    typeof weight_kg === 'number' &&
    Number.isFinite(weight_kg) &&
    weight_kg > 0
  )
}

/**
 * Merge preserved check-in weigh-ins into the daily weight log, keeping one
 * entry per date. Existing daily-log entries win over check-in weights when
 * they share a date. Invalid entries (bad date / non-finite / non-positive
 * weight) are dropped. Result is sorted ascending by date.
 */
export function mergeWeighIns(existing: WeighIn[], checkins: WeighIn[]): WeighIn[] {
  const byDate = new Map<string, WeighIn>()
  // Seed with check-in weights first so a same-date daily entry overrides them.
  for (const c of checkins ?? []) {
    if (isValidWeighIn(c)) byDate.set(c.date, { date: c.date, weight_kg: c.weight_kg })
  }
  for (const e of existing ?? []) {
    if (isValidWeighIn(e)) byDate.set(e.date, { date: e.date, weight_kg: e.weight_kg })
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Reset all app-local localStorage data, preserving only the weigh-in history
 * and water intake. Any preserved check-in weigh-ins are folded into the daily
 * weight log first so the full weigh-in history survives.
 */
export function resetLocalData(storage: Storage, checkinWeights: WeighIn[] = []): void {
  // 1. Read the surviving daily weight log.
  let existing: WeighIn[] = []
  try {
    const parsed = JSON.parse(storage.getItem(WEIGHT_LOG_KEY) ?? '[]')
    if (Array.isArray(parsed)) existing = parsed
  } catch {
    existing = []
  }
  const merged = mergeWeighIns(existing, checkinWeights)

  // 2. Remove every key that is not preserved. Collect first, then delete, so we
  //    don't mutate the store while iterating its index.
  const toRemove: string[] = []
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    if (key !== null && !isPreservedKey(key)) toRemove.push(key)
  }
  for (const key of toRemove) storage.removeItem(key)

  // 3. Persist the merged weigh-in history (may now include check-in dates).
  storage.setItem(WEIGHT_LOG_KEY, JSON.stringify(merged))
}
