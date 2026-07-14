import { IpcMain } from 'electron'
import { getDb, namedParams } from '../database/db'
import { clampMealCount, clampSnackCount, clampBodyFatPct, sanitizeUserUpdate } from './userSanitize'

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
    // Serialize JSON/boolean fields and drop unchanged/non-finite values (see
    // sanitizeUserUpdate) so a cleared numeric input can't NULL a required column.
    const cleanData = sanitizeUserUpdate(data)
    const fields = Object.keys(cleanData)
      .filter((k) => k !== 'id')
      .map((k) => `${k} = @${k}`)
      .join(', ')
    // If every updatable field was dropped, only bump updated_at (an empty SET
    // list would be invalid SQL).
    const setClause = fields ? `${fields}, updated_at = datetime('now')` : `updated_at = datetime('now')`
    db.prepare(`UPDATE users SET ${setClause} WHERE id = @id`)
      .run(namedParams(cleanData))
    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(data.id) as Record<string, unknown>
    return parseUser(updated)
  })

  ipcMain.handle('user:resetAll', () => {
    const db = getDb()
    // Preserve weigh-in history: snapshot each check-in's date + weight before the
    // cascade delete wipes weekly_checkins, so the renderer can fold them into the
    // persistent daily weight log. Everything else in the DB is intentionally wiped.
    const checkinWeights = (db
      .prepare('SELECT check_in_date, weight_kg FROM weekly_checkins ORDER BY check_in_date ASC')
      .all([]) as Array<{ check_in_date: string; weight_kg: number }>)
      .map((r) => ({ date: r.check_in_date, weight_kg: r.weight_kg }))
    // Deleting all users cascades to every linked table (plans, checkins, shows, workouts, etc.)
    db.prepare('DELETE FROM users').run([])
    return { success: true, checkinWeights }
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
