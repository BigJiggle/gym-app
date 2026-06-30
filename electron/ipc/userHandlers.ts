import { IpcMain } from 'electron'
import { getDb, namedParams } from '../database/db'

// meal_count/snack_count are stored unclamped otherwise — a plan generated from a
// clamped value still reads the raw stored value next time (e.g. AI profile payloads,
// `user.meal_count ?? 4` fallbacks), and an unreachable count (NaN, 0, 1, 50) can
// reach the meal-template `mainSets[mealCount]` lookup downstream.
function clampMealCount(value: unknown): number | undefined {
  if (value === undefined) return undefined
  const n = Math.round(Number(value))
  return Number.isFinite(n) ? Math.max(3, Math.min(6, n)) : 4
}
function clampSnackCount(value: unknown): number | undefined {
  if (value === undefined) return undefined
  const n = Math.round(Number(value))
  return Number.isFinite(n) ? Math.max(0, Math.min(6, n)) : 0
}
// body_fat_pct has no DB constraint and flows straight into trend charts —
// clamp to a physiologically plausible range instead of storing -5 or 150 as-is.
function clampBodyFatPct(value: unknown): number | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(3, Math.min(60, n)) : null
}

export function registerUserHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('user:create', (_event, data) => {
    const db = getDb()
    const stmt = db.prepare(`
      INSERT INTO users (
        name, age, sex, height_cm, weight_kg, body_fat_pct,
        training_experience_years, competition_history, division, show_date,
        goal, dietary_preference, dietary_restrictions, training_frequency,
        equipment_access, activity_level, recovery_notes, is_natural, meal_count,
        split_preference, food_preferences, food_exclusions, cooking_time_pref, meal_prep_style,
        include_snacks, snack_count, culture_pref, exercises_per_session, sets_per_exercise
      ) VALUES (
        @name, @age, @sex, @height_cm, @weight_kg, @body_fat_pct,
        @training_experience_years, @competition_history, @division, @show_date,
        @goal, @dietary_preference, @dietary_restrictions, @training_frequency,
        @equipment_access, @activity_level, @recovery_notes, @is_natural, @meal_count,
        @split_preference, @food_preferences, @food_exclusions, @cooking_time_pref, @meal_prep_style,
        @include_snacks, @snack_count, @culture_pref, @exercises_per_session, @sets_per_exercise
      )
    `)
    const result = stmt.run(namedParams({
      ...data,
      competition_history: JSON.stringify(data.competition_history ?? []),
      dietary_restrictions: JSON.stringify(data.dietary_restrictions ?? []),
      is_natural: data.is_natural ? 1 : 0,
      include_snacks: data.include_snacks ? 1 : 0,
      meal_count: clampMealCount(data.meal_count) ?? 4,
      snack_count: clampSnackCount(data.snack_count) ?? 0,
      body_fat_pct: clampBodyFatPct(data.body_fat_pct) ?? null,
      food_preferences: JSON.stringify(data.food_preferences ?? []),
      food_exclusions: JSON.stringify(data.food_exclusions ?? []),
      culture_pref: data.culture_pref ?? 'any',
      exercises_per_session: data.exercises_per_session ?? 6,
      sets_per_exercise: data.sets_per_exercise ?? 4
    }))
    const created = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid) as Record<string, unknown>
    return parseUser(created)
  })

  ipcMain.handle('user:get', () => {
    const db = getDb()
    const user = db.prepare('SELECT * FROM users ORDER BY id DESC LIMIT 1').get() as Record<string, unknown> | undefined
    if (!user) return null
    return parseUser(user)
  })

  ipcMain.handle('user:update', (_event, data) => {
    const db = getDb()
    // Serialize all JSON array and boolean fields before binding — node-sqlite3-wasm
    // rejects raw arrays and booleans; they must be strings/integers.
    const serialized: Record<string, unknown> = {
      ...data,
      competition_history: data.competition_history !== undefined
        ? JSON.stringify(data.competition_history) : undefined,
      dietary_restrictions: data.dietary_restrictions !== undefined
        ? JSON.stringify(data.dietary_restrictions) : undefined,
      food_preferences: data.food_preferences !== undefined
        ? JSON.stringify(data.food_preferences) : undefined,
      food_exclusions: data.food_exclusions !== undefined
        ? JSON.stringify(data.food_exclusions) : undefined,
      is_natural: data.is_natural !== undefined ? (data.is_natural ? 1 : 0) : undefined,
      include_snacks: data.include_snacks !== undefined ? (data.include_snacks ? 1 : 0) : undefined,
      meal_count: clampMealCount(data.meal_count),
      snack_count: clampSnackCount(data.snack_count),
      body_fat_pct: clampBodyFatPct(data.body_fat_pct),
    }
    // Drop undefined entries so they don't appear as UPDATE fields
    const cleanData = Object.fromEntries(
      Object.entries(serialized).filter(([, v]) => v !== undefined)
    )
    const fields = Object.keys(cleanData)
      .filter((k) => k !== 'id')
      .map((k) => `${k} = @${k}`)
      .join(', ')
    db.prepare(`UPDATE users SET ${fields}, updated_at = datetime('now') WHERE id = @id`)
      .run(namedParams(cleanData))
    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(data.id) as Record<string, unknown>
    return parseUser(updated)
  })

  ipcMain.handle('user:resetAll', () => {
    const db = getDb()
    // Deleting all users cascades to every linked table (plans, checkins, shows, workouts, etc.)
    db.prepare('DELETE FROM users').run([])
    return { success: true }
  })
}

function parseUser(user: Record<string, unknown>) {
  return {
    ...user,
    competition_history: JSON.parse((user.competition_history as string) ?? '[]'),
    dietary_restrictions: JSON.parse((user.dietary_restrictions as string) ?? '[]'),
    is_natural: user.is_natural === 1,
    include_snacks: user.include_snacks === 1,
    snack_count: (user.snack_count as number) ?? 0,
    food_preferences: JSON.parse((user.food_preferences as string) ?? '[]'),
    food_exclusions: JSON.parse((user.food_exclusions as string) ?? '[]'),
    culture_pref: (user.culture_pref as string) ?? 'any',
    exercises_per_session: (user.exercises_per_session as number) ?? 6,
    sets_per_exercise: (user.sets_per_exercise as number) ?? 4
  }
}
