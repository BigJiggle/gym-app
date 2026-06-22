import { IpcMain } from 'electron'
import { getDb } from '../database/db'
import { generateTrainingPlan } from '../services/trainingEngine'
import { generateNutritionPlan } from '../services/nutritionEngine'
import { generateWorkoutWithClaude, refineWorkoutForSafety } from '../services/claudeService'
import { clearOrphanedMealCompletions } from './mealCompletionHandlers'

// Always keeps users.show_date pointing to the nearest upcoming show.
// Called after every add / delete / update so the state is always consistent.
function syncPrimaryToNearest(db: ReturnType<typeof getDb>, userId: number): void {
  const next = db.prepare(
    "SELECT * FROM shows WHERE user_id=? AND show_date >= date('now') ORDER BY show_date ASC LIMIT 1"
  ).get([userId]) as Record<string, unknown> | null

  db.prepare('UPDATE shows SET is_primary=0 WHERE user_id=?').run([userId])

  if (next) {
    db.prepare('UPDATE shows SET is_primary=1 WHERE id=?').run([next.id as number])
    db.prepare('UPDATE users SET show_date=?, division=? WHERE id=?').run([
      next.show_date as string | null,
      (next.division as string | null) ?? null,
      userId,
    ])
  } else {
    // No upcoming shows — clear show_date AND division so sidebar shows goal label only
    db.prepare('UPDATE users SET show_date=NULL, division=NULL WHERE id=?').run([userId])
  }
}

// Computes weeks_out from a show_date string. Returns undefined if no date.
function computeWeeksOut(showDate: string | null | undefined): number | undefined {
  if (!showDate) return undefined
  const days = Math.floor((new Date(showDate + 'T12:00:00').getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  return Math.max(0, Math.floor(days / 7))
}

// Immediately recalculates and saves a fresh diet plan using the current show context.
export function regenerateDietForGoal(
  db: ReturnType<typeof getDb>,
  userId: number,
  goal?: string,
  weeksOut?: number
): void {
  const user = db.prepare('SELECT * FROM users WHERE id=?').get([userId]) as Record<string, unknown> | null
  if (!user) return
  const effectiveGoal = goal ?? (user.goal as string)
  const newDiet = generateNutritionPlan({
    weight_kg: user.weight_kg as number,
    height_cm: user.height_cm as number,
    age: user.age as number,
    sex: user.sex as string,
    activity_level: user.activity_level as string,
    goal: effectiveGoal,
    dietary_preference: user.dietary_preference as string,
    meal_count: (user.meal_count as number) ?? 4,
    weeks_out: weeksOut,
    dietary_restrictions: (() => { try { return JSON.parse((user.dietary_restrictions as string) ?? '[]') } catch { return [] } })(),
    food_exclusions: (() => { try { return JSON.parse((user.food_exclusions as string) ?? '[]') } catch { return [] } })(),
    food_preferences: (() => { try { return JSON.parse((user.food_preferences as string) ?? '[]') } catch { return [] } })(),
    cooking_time_pref: (user.cooking_time_pref as string) ?? 'medium',
    snack_count: (user.snack_count as number) ?? 0,
    culture_pref: (user.culture_pref as string) ?? 'any',
  })
  const planLabel = weeksOut !== undefined
    ? `${newDiet.phase.charAt(0).toUpperCase() + newDiet.phase.slice(1)} Nutrition Plan`
    : effectiveGoal === 'bulk' ? 'Off-Season Bulk Plan'
    : effectiveGoal === 'maintain' ? 'Maintenance Nutrition Plan'
    : 'Off-Season Nutrition Plan'
  db.prepare('DELETE FROM diet_plans WHERE user_id=?').run([userId])
  clearOrphanedMealCompletions(db, userId, newDiet.meal_count)
  db.prepare(
    `INSERT INTO diet_plans (user_id, name, calories_target, protein_g, carbs_g, fat_g, meal_count, meals, phase, generated_at_weeks_out, engine_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run([
    userId, planLabel,
    newDiet.calories_target, newDiet.protein_g, newDiet.carbs_g, newDiet.fat_g,
    newDiet.meal_count, JSON.stringify(newDiet.meals), newDiet.phase, weeksOut ?? null, 3,
  ])
}

// Training-only portion of the off-season transition — does NOT touch diet.
export async function transitionTrainingToOffSeason(
  db: ReturnType<typeof getDb>,
  userId: number
): Promise<{ trainingUpdated: boolean; message: string }> {
  const user = db.prepare('SELECT * FROM users WHERE id=?').get([userId]) as Record<string, unknown> | null
  if (!user) return { trainingUpdated: false, message: 'Off-season.' }

  const lastTraining = db.prepare('SELECT * FROM training_plans WHERE user_id=? ORDER BY id DESC LIMIT 1').get([userId]) as Record<string, unknown> | null
  const userModified = (lastTraining?.user_modified as number) === 1

  if (userModified) {
    if (lastTraining) {
      db.prepare('UPDATE training_plans SET generated_at_weeks_out=NULL WHERE id=?').run([lastTraining.id as number])
    }
    return { trainingUpdated: false, message: 'Show cancelled. Your custom training plan has been kept.' }
  }

  const apiKeyRow = db.prepare("SELECT value FROM settings WHERE key='claude_api_key'").get([]) as { value: string } | null
  const claudeKey = apiKeyRow?.value?.trim() ?? ''

  const trainingInput = {
    training_frequency: user.training_frequency as number,
    training_experience_years: user.training_experience_years as number,
    equipment_access: user.equipment_access as string,
    goal: user.goal as string,
    split_preference: (user.split_preference as string) ?? 'auto',
    exercises_per_session: (user.exercises_per_session as number) ?? 6,
    sets_per_exercise: (user.sets_per_exercise as number) ?? 4,
    weeks_out: undefined,
    recovery_notes: (user.recovery_notes as string) || undefined,
  }

  let finalSessions: { day_of_week: number; session_name: string; exercises: unknown[] }[] | null = null
  let planName = 'Off-Season Strength Training'
  const planPhase = 'strength'

  if (claudeKey) {
    try {
      const result = await generateWorkoutWithClaude(claudeKey, {
        ...trainingInput,
        division: user.division,
        max_sets_per_exercise: (trainingInput.sets_per_exercise ?? 4) + 1,
      }) as any
      const valid = result?.sessions?.filter((s: any) => Array.isArray(s?.exercises) && s.exercises.length > 0)
      if (valid?.length) {
        finalSessions = valid
        planName = result.name ?? planName
        if (user.recovery_notes) {
          const refined = await refineWorkoutForSafety(
            claudeKey,
            finalSessions as any[],
            `CONSTRAINTS: ${user.recovery_notes}\nOff-season strength phase. Rep range 4-6 compounds, 8-12 isolation, RIR 1-2.`,
            trainingInput.sets_per_exercise ?? 4,
            (trainingInput.sets_per_exercise ?? 4) + 1
          )
          if (refined?.length) finalSessions = refined as typeof finalSessions
        }
      }
    } catch { /* fall through to rule-based */ }
  }

  if (!finalSessions) {
    const ruleResult = generateTrainingPlan(trainingInput)
    finalSessions = ruleResult.sessions
    planName = ruleResult.name
  }

  const existingT = db.prepare('SELECT id FROM training_plans WHERE user_id=?').get([userId]) as { id: number } | undefined
  if (existingT) {
    db.prepare('UPDATE workout_logs SET session_id = NULL WHERE session_id IN (SELECT id FROM training_sessions WHERE plan_id = ?)').run([existingT.id])
    db.prepare('DELETE FROM training_sessions WHERE plan_id=?').run([existingT.id])
    db.prepare('DELETE FROM training_plans WHERE id=?').run([existingT.id])
  }
  const tRes = db.prepare(
    `INSERT INTO training_plans (user_id, name, weeks_total, phase, generated_at_weeks_out, user_modified) VALUES (?, ?, ?, ?, NULL, 0)`
  ).run([userId, planName, 12, planPhase])
  const tId = tRes.lastInsertRowid
  const ins = db.prepare(`INSERT INTO training_sessions (plan_id, week_number, day_of_week, session_name, exercises) VALUES (?, ?, ?, ?, ?)`)
  for (const s of finalSessions) {
    ins.run([tId, 1, (s as any).day_of_week, (s as any).session_name, JSON.stringify((s as any).exercises)])
  }

  return { trainingUpdated: true, message: 'Show cancelled. Off-season strength training plan generated.' }
}

export function registerShowHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('shows:list', (_event, userId: number) => {
    const db = getDb()
    return db.prepare('SELECT * FROM shows WHERE user_id=? ORDER BY show_date ASC').all([userId])
  })

  ipcMain.handle('shows:add', async (_event, userId: number, data: Record<string, unknown>) => {
    const db = getDb()
    db.prepare(`
      INSERT INTO shows (user_id, name, show_date, division, federation, notes, is_primary)
      VALUES (?, ?, ?, ?, ?, ?, 0)
    `).run([
      userId,
      (data.name as string | undefined) ?? 'Competition',
      data.show_date as string,
      (data.division as string | null) ?? null,
      (data.federation as string | null) ?? null,
      (data.notes as string | null) ?? null,
    ])
    syncPrimaryToNearest(db, userId)

    // Immediately recalculate diet with the new show context
    const user = db.prepare('SELECT * FROM users WHERE id=?').get([userId]) as Record<string, unknown> | null
    if (user?.show_date) {
      const weeksOut = computeWeeksOut(user.show_date as string)
      regenerateDietForGoal(db, userId, user.goal as string, weeksOut)
    }

    return db.prepare('SELECT * FROM shows WHERE user_id=? ORDER BY show_date ASC').all([userId])
  })

  ipcMain.handle('shows:update', (_event, showId: number, data: Record<string, unknown>) => {
    const db = getDb()
    const show = db.prepare('SELECT * FROM shows WHERE id=?').get([showId]) as Record<string, unknown> | null
    if (!show) throw new Error('Show not found')
    const dateChanged = data.show_date && data.show_date !== show.show_date
    db.prepare('UPDATE shows SET name=?, show_date=?, division=?, federation=?, notes=? WHERE id=?').run([
      (data.name as string | undefined) ?? (show.name as string),
      (data.show_date as string | undefined) ?? (show.show_date as string),
      (data.division as string | null) ?? null,
      (data.federation as string | null) ?? null,
      (data.notes as string | null) ?? null,
      showId,
    ])
    syncPrimaryToNearest(db, show.user_id as number)

    // Immediately recalculate diet if the show date changed
    if (dateChanged) {
      const user = db.prepare('SELECT * FROM users WHERE id=?').get([show.user_id as number]) as Record<string, unknown> | null
      if (user?.show_date) {
        const weeksOut = computeWeeksOut(user.show_date as string)
        regenerateDietForGoal(db, show.user_id as number, user.goal as string, weeksOut)
      }
    }

    return db.prepare('SELECT * FROM shows WHERE user_id=? ORDER BY show_date ASC').all([show.user_id as number])
  })

  ipcMain.handle('shows:delete', async (_event, showId: number) => {
    const db = getDb()
    const show = db.prepare('SELECT * FROM shows WHERE id=?').get([showId]) as Record<string, unknown> | null
    if (!show) return { shows: [], message: null, needs_goal_selection: false }
    db.prepare('DELETE FROM shows WHERE id=?').run([showId])
    syncPrimaryToNearest(db, show.user_id as number)
    const remaining = db.prepare('SELECT * FROM shows WHERE user_id=? ORDER BY show_date ASC').all([show.user_id as number]) as Record<string, unknown>[]
    const today = new Date().toLocaleDateString('en-CA')
    const hasUpcoming = remaining.some(s => (s.show_date as string) >= today)

    if (!hasUpcoming) {
      // Transition training immediately; let user pick goal for diet
      const result = await transitionTrainingToOffSeason(db, show.user_id as number)
      return {
        shows: remaining,
        message: result.message,
        needs_goal_selection: true,
      }
    }

    return { shows: remaining, message: null, needs_goal_selection: false }
  })

  // Cancel a show — clearer UX messaging than delete for upcoming shows
  ipcMain.handle('shows:cancelShow', async (_event, showId: number) => {
    const db = getDb()
    const show = db.prepare('SELECT * FROM shows WHERE id=?').get([showId]) as Record<string, unknown> | null
    if (!show) return { shows: [], transitionType: 'offseason', message: null, needs_goal_selection: false }
    db.prepare('DELETE FROM shows WHERE id=?').run([showId])
    syncPrimaryToNearest(db, show.user_id as number)
    const remaining = db.prepare('SELECT * FROM shows WHERE user_id=? ORDER BY show_date ASC').all([show.user_id as number]) as Record<string, unknown>[]
    const today = new Date().toLocaleDateString('en-CA')
    const hasNextShow = remaining.some((s) => (s.show_date as string) >= today)

    if (!hasNextShow) {
      // Transition training immediately; let user pick goal for diet via goal picker
      const result = await transitionTrainingToOffSeason(db, show.user_id as number)
      return {
        shows: remaining,
        transitionType: 'offseason' as const,
        nextShowName: null,
        message: result.message,
        needs_goal_selection: true,
      }
    }

    // Another show coming — immediately recalculate diet for the next show
    const user = db.prepare('SELECT * FROM users WHERE id=?').get([show.user_id as number]) as Record<string, unknown> | null
    if (user?.show_date) {
      const weeksOut = computeWeeksOut(user.show_date as string)
      regenerateDietForGoal(db, show.user_id as number, user.goal as string, weeksOut)
    }

    return {
      shows: remaining,
      transitionType: 'next_show' as const,
      nextShowName: (remaining.find(s => (s.show_date as string) >= today) as any)?.name ?? null,
      message: null,
      needs_goal_selection: false,
    }
  })

  ipcMain.handle('shows:setPrimary', (_event, showId: number, userId: number) => {
    const db = getDb()
    const show = db.prepare('SELECT * FROM shows WHERE id=?').get([showId]) as Record<string, unknown> | null
    if (!show) throw new Error('Show not found')
    const today = new Date().toLocaleDateString('en-CA')
    if ((show.show_date as string) < today) throw new Error('Cannot set a past show as primary')
    db.prepare('UPDATE shows SET is_primary=0 WHERE user_id=?').run([userId])
    db.prepare('UPDATE shows SET is_primary=1 WHERE id=?').run([showId])
    db.prepare('UPDATE users SET show_date=?, division=? WHERE id=?').run([show.show_date, show.division ?? null, userId])
    return db.prepare('SELECT * FROM shows WHERE user_id=? ORDER BY show_date ASC').all([userId])
  })
}
