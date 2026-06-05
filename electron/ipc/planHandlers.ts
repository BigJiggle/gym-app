import { IpcMain } from 'electron'
import { getDb, namedParams } from '../database/db'
import { generateTrainingPlan, getExerciseLibraryForUI, determinePhase } from '../services/trainingEngine'
import { generateNutritionPlan, buildMealsPublic, calcBMR, getPhaseAwareDeficit, ACTIVITY_MULTIPLIERS } from '../services/nutritionEngine'
import { generateDietWithClaude, generateWorkoutWithClaude, refineDietPlan, refineWorkoutWithClaude, processAIRequest, refineWorkoutForSafety } from '../services/claudeService'
import { regenerateDietForGoal } from './showHandlers'

export function registerPlanHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('plan:generateTraining', async (_event, userId: number) => {
    const db = getDb()
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as Record<string, unknown>
    if (!user) throw new Error('User not found')

    const input = {
      training_frequency: user.training_frequency as number,
      training_experience_years: user.training_experience_years as number,
      equipment_access: user.equipment_access as string,
      division: user.division as string | undefined,
      weeks_out: user.show_date
        ? Math.max(0, Math.floor(
            (new Date((user.show_date as string) + 'T12:00:00').getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 7)
          ))
        : undefined,
      goal: user.goal as string,
      split_preference: (user.split_preference as string) ?? 'auto',
      exercises_per_session: (user.exercises_per_session as number) ?? 6,
      sets_per_exercise: (user.sets_per_exercise as number) ?? 4,
      recovery_notes: (user.recovery_notes as string) || undefined,
    }

    // Check-in-driven volume adjustment
    const latestCheckin = db
      .prepare('SELECT * FROM weekly_checkins WHERE user_id=? ORDER BY id DESC LIMIT 1')
      .get(userId) as Record<string,unknown> | null
    if (latestCheckin) {
      const energyAvg = (((latestCheckin.energy_level as number) ?? 3) + ((latestCheckin.sleep_quality as number) ?? 3)) / 2
      if (energyAvg < 2.5) {
        // Low recovery: force deload phase
        ;(input as any).weeks_out = 1
      } else if (((latestCheckin.training_adherence as number) ?? 80) > 90) {
        // High adherence: slight volume bump
        input.training_experience_years = Math.min(10, input.training_experience_years + 0.5)
      }
    }

    // Try Claude AI generation if API key is configured
    const apiKeyRow2 = db.prepare("SELECT value FROM settings WHERE key='claude_api_key'").get() as { value: string } | null
    const claudeKey2 = apiKeyRow2?.value?.trim() ?? ''
    if (claudeKey2) {
      const workoutProfile = {
        training_frequency: user.training_frequency, training_experience_years: user.training_experience_years,
        equipment_access: user.equipment_access, split_preference: user.split_preference,
        goal: user.goal, division: user.division, weeks_out: input.weeks_out,
        exercises_per_session: (user.exercises_per_session as number) ?? 6,
        sets_per_exercise: (user.sets_per_exercise as number) ?? 4,
        recovery_notes: (user.recovery_notes as string) || undefined,
        latest_checkin: latestCheckin ? {
          energy_level: latestCheckin.energy_level,
          training_adherence: latestCheckin.training_adherence,
        } : null,
      }
      const claudeWorkout = await generateWorkoutWithClaude(claudeKey2, workoutProfile)
      const cwRaw = claudeWorkout as any
      const validCwSessions = cwRaw?.sessions?.filter((s: any) => Array.isArray(s?.exercises) && s.exercises.length > 0)
      if (claudeWorkout && validCwSessions?.length) {
        const cw = { ...cwRaw, sessions: validCwSessions }
        const existing = db.prepare('SELECT id FROM training_plans WHERE user_id = ?').get(userId) as { id: number } | undefined
        if (existing) {
          db.prepare('UPDATE workout_logs SET session_id = NULL WHERE session_id IN (SELECT id FROM training_sessions WHERE plan_id = ?)').run([existing.id])
          db.prepare('DELETE FROM training_sessions WHERE plan_id = ?').run(existing.id)
          db.prepare('DELETE FROM training_plans WHERE id = ?').run(existing.id)
        }
        const planResult = db.prepare(
          `INSERT INTO training_plans (user_id, name, weeks_total, phase, generated_at_weeks_out) VALUES (?, ?, ?, ?, ?)`
        ).run([userId, cw.name ?? 'AI Training Plan', cw.weeks_total ?? 12, cw.phase ?? 'hypertrophy', input.weeks_out ?? null])
        const planId = planResult.lastInsertRowid
        const insertSession = db.prepare(
          `INSERT INTO training_sessions (plan_id, week_number, day_of_week, session_name, exercises) VALUES (?, ?, ?, ?, ?)`
        )
        for (const s of cw.sessions) {
          insertSession.run([planId, 1, s.day_of_week, s.session_name, JSON.stringify(s.exercises ?? [])])
        }
        const savedSessionsClaude = db.prepare(
          'SELECT * FROM training_sessions WHERE plan_id=? ORDER BY day_of_week'
        ).all(planId as number) as Record<string,unknown>[]
        return {
          ...db.prepare('SELECT * FROM training_plans WHERE id=?').get(planId),
          sessions: savedSessionsClaude.map(s => ({ ...s, exercises: JSON.parse(s.exercises as string) }))
        }
      }
    }
    // Fall back to rule-based engine

    const plan = generateTrainingPlan(input)

    const existing = db.prepare('SELECT id FROM training_plans WHERE user_id = ?').get(userId)
    if (existing) {
      const e = existing as Record<string, unknown>
      db.prepare('UPDATE workout_logs SET session_id = NULL WHERE session_id IN (SELECT id FROM training_sessions WHERE plan_id = ?)').run([e.id])
      db.prepare('DELETE FROM training_sessions WHERE plan_id = ?').run(e.id)
      db.prepare('DELETE FROM training_plans WHERE id = ?').run(e.id)
    }

    const planResult = db
      .prepare(`INSERT INTO training_plans (user_id, name, weeks_total, phase, generated_at_weeks_out) VALUES (?, ?, ?, ?, ?)`)
      .run([userId, plan.name, plan.weeks_total, plan.phase, input.weeks_out ?? null])
    const planId = planResult.lastInsertRowid

    const insertSession = db.prepare(
      `INSERT INTO training_sessions (plan_id, week_number, day_of_week, session_name, exercises)
       VALUES (?, ?, ?, ?, ?)`
    )
    for (const s of plan.sessions) {
      insertSession.run([planId, 1, s.day_of_week, s.session_name, JSON.stringify(s.exercises)])
    }

    const savedSessions = db.prepare(
      'SELECT * FROM training_sessions WHERE plan_id=? ORDER BY day_of_week'
    ).all(planId as number) as Record<string,unknown>[]
    return {
      ...db.prepare('SELECT * FROM training_plans WHERE id = ?').get(planId),
      sessions: savedSessions.map(s => ({ ...s, exercises: JSON.parse(s.exercises as string) }))
    }
  })

  ipcMain.handle('plan:getTraining', (_event, userId: number) => {
    const db = getDb()
    const plan = db
      .prepare('SELECT * FROM training_plans WHERE user_id = ? ORDER BY id DESC LIMIT 1')
      .get(userId) as Record<string, unknown> | undefined
    if (!plan) return null

    const sessions = db
      .prepare('SELECT * FROM training_sessions WHERE plan_id = ? AND week_number = 1 ORDER BY day_of_week')
      .all(plan.id) as Record<string, unknown>[]

    return {
      ...plan,
      sessions: sessions.map((s) => ({
        ...s,
        exercises: JSON.parse(s.exercises as string)
      }))
    }
  })

  ipcMain.handle('plan:getSessions', (_event, planId: number, weekNumber: number) => {
    const db = getDb()
    const sessions = db
      .prepare(
        'SELECT * FROM training_sessions WHERE plan_id = ? AND week_number = ? ORDER BY day_of_week'
      )
      .all([planId, weekNumber]) as Record<string, unknown>[]
    return sessions.map((s) => ({ ...s, exercises: JSON.parse(s.exercises as string) }))
  })

  ipcMain.handle('plan:generateDiet', async (_event, userId: number) => {
    const db = getDb()
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as Record<string, unknown>
    if (!user) throw new Error('User not found')

    // Try Claude AI generation if API key is configured
    const apiKeyRow = db.prepare("SELECT value FROM settings WHERE key='claude_api_key'").get() as { value: string } | null
    const claudeApiKey = apiKeyRow?.value?.trim() ?? ''
    if (claudeApiKey) {
      const dietWeeksOutClaude = user.show_date
        ? Math.max(0, Math.floor((new Date((user.show_date as string) + 'T12:00:00').getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 7)))
        : undefined
      const userProfile = {
        weight_kg: user.weight_kg, height_cm: user.height_cm, age: user.age, sex: user.sex,
        goal: user.goal, activity_level: user.activity_level,
        dietary_preference: user.dietary_preference, meal_count: user.meal_count ?? 4,
        culture_pref: (user.culture_pref as string) ?? 'any',
        food_exclusions: (() => { try { return JSON.parse((user.food_exclusions as string) ?? '[]') } catch { return [] } })(),
        food_preferences: (() => { try { return JSON.parse((user.food_preferences as string) ?? '[]') } catch { return [] } })(),
        snack_count: (user.snack_count as number) ?? 0,
        weeks_out: dietWeeksOutClaude,
      }
      const claudeResult = await generateDietWithClaude(claudeApiKey, userProfile)
      if (claudeResult && (claudeResult as any).meals) {
        const cr = claudeResult as any
        const planName = `AI Nutrition Plan (${cr.phase ?? 'deficit'})`
        db.prepare('DELETE FROM diet_plans WHERE user_id = ?').run(userId)
        const result = db.prepare(
          `INSERT INTO diet_plans (user_id, name, calories_target, protein_g, carbs_g, fat_g, meal_count, meals, phase)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run([userId, planName,
          cr.calories_target ?? Math.round((cr.meals ?? []).reduce((s: number, m: any) => s + (m.calories ?? 0), 0)),
          cr.protein_g ?? 0, cr.carbs_g ?? 0, cr.fat_g ?? 0,
          (cr.meals ?? []).length, JSON.stringify(cr.meals ?? []),
          cr.phase ?? 'deficit'
        ])
        const saved = db.prepare('SELECT * FROM diet_plans WHERE id = ?').get(result.lastInsertRowid) as Record<string, unknown>
        return { ...saved, meals: JSON.parse(saved.meals as string) }
      }
    }
    // Fall back to rule-based engine

    const dietWeeksOut = user.show_date
      ? Math.max(0, Math.floor((new Date((user.show_date as string) + 'T12:00:00').getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 7)))
      : undefined
    const plan = generateNutritionPlan({
      weight_kg: user.weight_kg as number,
      height_cm: user.height_cm as number,
      age: user.age as number,
      sex: user.sex as string,
      activity_level: user.activity_level as string,
      goal: user.goal as string,
      dietary_preference: user.dietary_preference as string,
      meal_count: (user.meal_count as number) ?? 4,
      weeks_out: dietWeeksOut,
      dietary_restrictions: (() => { try { return JSON.parse((user.dietary_restrictions as string) ?? '[]') } catch { return [] } })(),
      food_exclusions: (() => { try { return JSON.parse((user.food_exclusions as string) ?? '[]') } catch { return [] } })(),
      food_preferences: (() => { try { return JSON.parse((user.food_preferences as string) ?? '[]') } catch { return [] } })(),
      cooking_time_pref: (user.cooking_time_pref as string) ?? 'medium',
      meal_prep_style: (user.meal_prep_style as string) ?? 'daily',
      snack_count: (user.snack_count as number) ?? 0,
      culture_pref: 'any'
    })

    db.prepare('DELETE FROM diet_plans WHERE user_id = ?').run(userId)

    const planName = `${plan.phase.charAt(0).toUpperCase() + plan.phase.slice(1)} Nutrition Plan`
    const result = db
      .prepare(
        `INSERT INTO diet_plans (user_id, name, calories_target, protein_g, carbs_g, fat_g, meal_count, meals, phase, generated_at_weeks_out)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run([userId, planName, plan.calories_target, plan.protein_g, plan.carbs_g, plan.fat_g, plan.meal_count, JSON.stringify(plan.meals), plan.phase, dietWeeksOut ?? null])

    const saved = db.prepare('SELECT * FROM diet_plans WHERE id = ?').get(result.lastInsertRowid) as Record<string, unknown>
    return { ...saved, meals: JSON.parse(saved.meals as string) }
  })

  ipcMain.handle('plan:getDiet', (_event, userId: number) => {
    const db = getDb()
    const plan = db
      .prepare('SELECT * FROM diet_plans WHERE user_id = ? ORDER BY id DESC LIMIT 1')
      .get(userId) as Record<string, unknown> | undefined
    if (!plan) return null
    return { ...plan, meals: JSON.parse(plan.meals as string) }
  })

  ipcMain.handle('plan:updateSession', (_event, sessionId: number, exercises: unknown[]) => {
    const db = getDb()
    db.prepare('UPDATE training_sessions SET exercises=? WHERE id=?')
      .run([JSON.stringify(exercises), sessionId])
    // Mark the parent plan as user-modified so show cancellation preserves it
    db.prepare(
      'UPDATE training_plans SET user_modified=1 WHERE id=(SELECT plan_id FROM training_sessions WHERE id=?)'
    ).run([sessionId])
    const row = db.prepare('SELECT * FROM training_sessions WHERE id=?').get(sessionId) as Record<string, unknown>
    return { ...row, exercises: JSON.parse(row.exercises as string) }
  })

  ipcMain.handle('plan:getExerciseLibrary', () => {
    return getExerciseLibraryForUI()
  })

  ipcMain.handle('plan:regenerateAll', async (_event, userId: number) => {
    // Delegate to both generate handlers — used after show cancellation / off-season transition
    const db = getDb()
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as Record<string, unknown>
    if (!user) throw new Error('User not found')
    // Fire both handlers by re-invoking their logic inline
    // (Handlers can't call each other via IPC; call the shared helper functions directly)
    const weeksOut = user.show_date
      ? Math.max(0, Math.floor((new Date((user.show_date as string) + 'T12:00:00').getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 7)))
      : undefined

    // Re-generate training (rule-based only for reliability)
    const trainingInput = {
      training_frequency: user.training_frequency as number,
      training_experience_years: user.training_experience_years as number,
      equipment_access: user.equipment_access as string,
      goal: user.goal as string,
      split_preference: (user.split_preference as string) ?? 'auto',
      exercises_per_session: (user.exercises_per_session as number) ?? 6,
      sets_per_exercise: (user.sets_per_exercise as number) ?? 4,
      weeks_out: weeksOut,
      recovery_notes: (user.recovery_notes as string) || undefined,
    }
    const trainingPlan = generateTrainingPlan(trainingInput)
    const existingT = db.prepare('SELECT id FROM training_plans WHERE user_id = ?').get(userId) as { id: number } | undefined
    if (existingT) {
      db.prepare('UPDATE workout_logs SET session_id = NULL WHERE session_id IN (SELECT id FROM training_sessions WHERE plan_id = ?)').run([existingT.id])
      db.prepare('DELETE FROM training_sessions WHERE plan_id = ?').run(existingT.id)
      db.prepare('DELETE FROM training_plans WHERE id = ?').run(existingT.id)
    }
    const tResult = db.prepare(`INSERT INTO training_plans (user_id, name, weeks_total, phase, generated_at_weeks_out) VALUES (?, ?, ?, ?, ?)`).run([userId, trainingPlan.name, trainingPlan.weeks_total, trainingPlan.phase, weeksOut ?? null])
    const tPlanId = tResult.lastInsertRowid
    const insertS = db.prepare(`INSERT INTO training_sessions (plan_id, week_number, day_of_week, session_name, exercises) VALUES (?, ?, ?, ?, ?)`)
    for (const s of trainingPlan.sessions) insertS.run([tPlanId, 1, s.day_of_week, s.session_name, JSON.stringify(s.exercises)])

    // Re-generate diet
    const dietPlan = generateNutritionPlan({
      weight_kg: user.weight_kg as number,
      height_cm: user.height_cm as number,
      age: user.age as number,
      sex: user.sex as string,
      activity_level: user.activity_level as string,
      goal: user.goal as string,
      dietary_preference: user.dietary_preference as string,
      meal_count: (user.meal_count as number) ?? 4,
      weeks_out: weeksOut,
      dietary_restrictions: (() => { try { return JSON.parse((user.dietary_restrictions as string) ?? '[]') } catch { return [] } })(),
      food_exclusions: (() => { try { return JSON.parse((user.food_exclusions as string) ?? '[]') } catch { return [] } })(),
      food_preferences: (() => { try { return JSON.parse((user.food_preferences as string) ?? '[]') } catch { return [] } })(),
      cooking_time_pref: (user.cooking_time_pref as string) ?? 'medium',
      snack_count: (user.snack_count as number) ?? 0,
      culture_pref: 'any',
    })
    db.prepare('DELETE FROM diet_plans WHERE user_id = ?').run(userId)
    db.prepare(`INSERT INTO diet_plans (user_id, name, calories_target, protein_g, carbs_g, fat_g, meal_count, meals, phase, generated_at_weeks_out) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run([userId, `${dietPlan.phase.charAt(0).toUpperCase() + dietPlan.phase.slice(1)} Nutrition Plan`, dietPlan.calories_target, dietPlan.protein_g, dietPlan.carbs_g, dietPlan.fat_g, dietPlan.meal_count, JSON.stringify(dietPlan.meals), dietPlan.phase, weeksOut ?? null])

    return { trainingDone: true, dietDone: true }
  })

  // Startup refresh — runs on every app launch to auto-transition shows and update plans
  ipcMain.handle('plan:startupRefresh', async (_event, userId: number) => {
    const db = getDb()
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as Record<string, unknown> | null
    if (!user) return { showTransitioned: false, trainingUpdated: false, dietUpdated: false, message: null }

    // 1. Sync primary show to nearest — handles show date passing automatically
    const prevShowDate = user.show_date as string | null
    // Import syncPrimaryToNearest logic inline (can't import from showHandlers — circular)
    const nextShow = db.prepare(
      "SELECT * FROM shows WHERE user_id=? AND show_date >= date('now') ORDER BY show_date ASC LIMIT 1"
    ).get([userId]) as Record<string, unknown> | null
    db.prepare('UPDATE shows SET is_primary=0 WHERE user_id=?').run([userId])
    if (nextShow) {
      db.prepare('UPDATE shows SET is_primary=1 WHERE id=?').run([nextShow.id])
      db.prepare('UPDATE users SET show_date=?, division=? WHERE id=?').run([nextShow.show_date, nextShow.division ?? null, userId])
    } else {
      db.prepare('UPDATE users SET show_date=NULL, division=NULL WHERE id=?').run([userId])
    }

    const freshUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as Record<string, unknown>
    const newShowDate = freshUser.show_date as string | null
    const showTransitioned = prevShowDate !== newShowDate

    // 2. Compute current weeks_out
    const weeksOut = newShowDate
      ? Math.max(0, Math.floor((new Date(newShowDate + 'T12:00:00').getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 7)))
      : undefined

    // 3. Check training plan — regenerate only if phase boundary crossed OR show context changed
    const lastTraining = db.prepare('SELECT * FROM training_plans WHERE user_id=? ORDER BY id DESC LIMIT 1').get(userId) as Record<string, unknown> | null
    // Skip auto-refresh if user has never had a plan (brand new — onboarding generates it)
    if (!lastTraining && !showTransitioned) {
      return { showTransitioned: false, trainingUpdated: false, dietUpdated: false, message: null }
    }
    const storedTrainingWeeks = lastTraining?.generated_at_weeks_out as number | null | undefined
    const storedUserModified = (lastTraining?.user_modified as number) === 1
    const currentPhase = determinePhase(weeksOut, freshUser.goal as string)
    const storedPhase = determinePhase(storedTrainingWeeks ?? undefined, freshUser.goal as string)
    // Detect context change: stored weeks was null (no show) but now we have one, or vice versa
    const trainingContextChanged = (weeksOut !== undefined && (storedTrainingWeeks === null || storedTrainingWeeks === undefined))
      || (weeksOut === undefined && storedTrainingWeeks !== null && storedTrainingWeeks !== undefined)
    // When show just passed into off-season, respect user_modified — keep custom plans
    const justWentOffSeason = showTransitioned && !newShowDate
    let trainingUpdated = false
    if (justWentOffSeason && storedUserModified) {
      // User-modified plan: keep all sessions, just clear the weeks_out context marker
      if (lastTraining) {
        db.prepare('UPDATE training_plans SET generated_at_weeks_out=NULL WHERE id=?').run([lastTraining.id])
      }
    } else if (showTransitioned || currentPhase !== storedPhase || trainingContextChanged) {
      const trainingInput = {
        training_frequency: freshUser.training_frequency as number,
        training_experience_years: freshUser.training_experience_years as number,
        equipment_access: freshUser.equipment_access as string,
        goal: freshUser.goal as string,
        split_preference: (freshUser.split_preference as string) ?? 'auto',
        exercises_per_session: (freshUser.exercises_per_session as number) ?? 6,
        sets_per_exercise: (freshUser.sets_per_exercise as number) ?? 4,
        weeks_out: weeksOut,
        recovery_notes: (freshUser.recovery_notes as string) || undefined,
      }

      // Priority: Claude (safety-aware + phase-aware) > rule-based fallback
      const apiKeyRow = db.prepare("SELECT value FROM settings WHERE key='claude_api_key'").get([]) as { value: string } | null
      const claudeKey = apiKeyRow?.value?.trim() ?? ''
      let finalSessions: { day_of_week: number; session_name: string; exercises: unknown[] }[] | null = null
      let planName = ''
      let planPhase = currentPhase
      let planWeeksTotal = weeksOut !== undefined ? Math.min(weeksOut, 16) : 12

      if (claudeKey) {
        try {
          const workoutProfile = {
            ...trainingInput,
            division: freshUser.division,
            max_sets_per_exercise: trainingInput.sets_per_exercise + 1,
          }
          const claudeResult = await generateWorkoutWithClaude(claudeKey, workoutProfile) as any
          const validSessions = claudeResult?.sessions?.filter((s: any) =>
            Array.isArray(s?.exercises) && s.exercises.length > 0
          )
          if (validSessions?.length) {
            finalSessions = validSessions
            planName = claudeResult.name ?? `${currentPhase.charAt(0).toUpperCase() + currentPhase.slice(1)} Training`
            planPhase = claudeResult.phase ?? currentPhase
            planWeeksTotal = claudeResult.weeks_total ?? planWeeksTotal

            // Safety refinement pass — runs if user has ANY recovery/injury notes
            if (freshUser.recovery_notes) {
              const safetyInstruction = `CONSTRAINTS: ${freshUser.recovery_notes}
Current prep phase: ${currentPhase.toUpperCase()} (${weeksOut ?? 'off-season'} weeks out).
Rep guidance: ${currentPhase === 'hypertrophy' ? '8-12 reps @ RIR 2' : currentPhase === 'strength' ? '4-6 reps @ RIR 1' : currentPhase === 'peak' ? '3-5 reps @ RIR 0' : '10-15 reps @ RIR 3'}.
Ensure every exercise respects the constraints above while maintaining phase-appropriate intensity.`
              const defaultSets = (freshUser.sets_per_exercise as number) ?? 3
              const refined = await refineWorkoutForSafety(claudeKey, finalSessions as any[], safetyInstruction, defaultSets, defaultSets + 1)
              if (refined?.length) finalSessions = refined as typeof finalSessions
            }
          }
        } catch (e) {
          console.error('[startupRefresh] Claude training failed, falling back:', e)
        }
      }

      if (!finalSessions) {
        // Rule-based fallback — still respects recovery_notes via TrainingInput
        const ruleResult = generateTrainingPlan(trainingInput)
        finalSessions = ruleResult.sessions
        planName = ruleResult.name
        planPhase = ruleResult.phase
        planWeeksTotal = ruleResult.weeks_total
      }

      const existingT = db.prepare('SELECT id FROM training_plans WHERE user_id = ?').get(userId) as { id: number } | undefined
      if (existingT) {
        db.prepare('UPDATE workout_logs SET session_id = NULL WHERE session_id IN (SELECT id FROM training_sessions WHERE plan_id = ?)').run([existingT.id])
        db.prepare('DELETE FROM training_sessions WHERE plan_id = ?').run(existingT.id)
        db.prepare('DELETE FROM training_plans WHERE id = ?').run(existingT.id)
      }
      const tRes = db.prepare(`INSERT INTO training_plans (user_id, name, weeks_total, phase, generated_at_weeks_out) VALUES (?, ?, ?, ?, ?)`).run([userId, planName, planWeeksTotal, planPhase, weeksOut ?? null])
      const tId = tRes.lastInsertRowid
      const insertS = db.prepare(`INSERT INTO training_sessions (plan_id, week_number, day_of_week, session_name, exercises) VALUES (?, ?, ?, ?, ?)`)
      for (const s of finalSessions) insertS.run([tId, 1, (s as any).day_of_week, (s as any).session_name, JSON.stringify((s as any).exercises)])
      trainingUpdated = true
    }

    // 4. Check diet — recalculate macros if weeks_out changed by ≥1 OR show context changed
    const lastDiet = db.prepare('SELECT * FROM diet_plans WHERE user_id=? ORDER BY id DESC LIMIT 1').get(userId) as Record<string, unknown> | null
    const storedDietWeeks = lastDiet?.generated_at_weeks_out as number | null | undefined
    // Explicit condition matrix — avoid ternary ambiguity
    let weeksOutChanged = false
    if (showTransitioned || !lastDiet) {
      weeksOutChanged = true
    } else if (weeksOut !== undefined && (storedDietWeeks === null || storedDietWeeks === undefined)) {
      weeksOutChanged = true  // show was added since last diet generation
    } else if (weeksOut === undefined && storedDietWeeks !== null && storedDietWeeks !== undefined) {
      weeksOutChanged = true  // show was removed since last diet generation
    } else if (weeksOut !== undefined && storedDietWeeks !== null && storedDietWeeks !== undefined) {
      weeksOutChanged = Math.abs(weeksOut - (storedDietWeeks as number)) >= 1
    }
    let dietUpdated = false
    if (weeksOutChanged) {
      const newDiet = generateNutritionPlan({
        weight_kg: freshUser.weight_kg as number,
        height_cm: freshUser.height_cm as number,
        age: freshUser.age as number,
        sex: freshUser.sex as string,
        activity_level: freshUser.activity_level as string,
        goal: freshUser.goal as string,
        dietary_preference: freshUser.dietary_preference as string,
        meal_count: (freshUser.meal_count as number) ?? 4,
        weeks_out: weeksOut,
        dietary_restrictions: (() => { try { return JSON.parse((freshUser.dietary_restrictions as string) ?? '[]') } catch { return [] } })(),
        food_exclusions: (() => { try { return JSON.parse((freshUser.food_exclusions as string) ?? '[]') } catch { return [] } })(),
        food_preferences: (() => { try { return JSON.parse((freshUser.food_preferences as string) ?? '[]') } catch { return [] } })(),
        cooking_time_pref: (freshUser.cooking_time_pref as string) ?? 'medium',
        snack_count: (freshUser.snack_count as number) ?? 0,
        culture_pref: 'any',
      })
      db.prepare('DELETE FROM diet_plans WHERE user_id = ?').run(userId)
      db.prepare(`INSERT INTO diet_plans (user_id, name, calories_target, protein_g, carbs_g, fat_g, meal_count, meals, phase, generated_at_weeks_out) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run([userId, `${newDiet.phase.charAt(0).toUpperCase() + newDiet.phase.slice(1)} Nutrition Plan`, newDiet.calories_target, newDiet.protein_g, newDiet.carbs_g, newDiet.fat_g, newDiet.meal_count, JSON.stringify(newDiet.meals), newDiet.phase, weeksOut ?? null])
      dietUpdated = true
    }

    // 5. Build notification message
    let message: string | null = null
    const phaseLabel = (p: string) => p.charAt(0).toUpperCase() + p.slice(1)
    const weeksLabel = weeksOut !== undefined
      ? `${weeksOut} week${weeksOut !== 1 ? 's' : ''} out`
      : 'off-season'
    if (justWentOffSeason && storedUserModified) {
      message = 'Your show has passed. Your custom training plan has been kept. Nutrition updated for off-season.'
    } else if (showTransitioned && newShowDate) {
      const name = (nextShow?.name as string) ?? 'your next show'
      message = `Your previous show has passed. Prep updated for ${name} — ${weeksLabel}.`
    } else if (showTransitioned && !newShowDate) {
      message = 'Your show has passed. Off-season mode — training and nutrition updated.'
    } else if (trainingUpdated && dietUpdated) {
      message = `Plans updated to ${phaseLabel(currentPhase)} phase (${weeksLabel}). Macros adjusted.`
    } else if (trainingUpdated) {
      message = `Training updated to ${phaseLabel(currentPhase)} phase (${weeksLabel}).`
    } else if (dietUpdated) {
      message = `Nutrition macros updated (${weeksLabel}).`
    }

    return { showTransitioned, trainingUpdated, dietUpdated, message }
  })

  ipcMain.handle('plan:recalculateMacros', (_event, userId: number) => {
    const db = getDb()
    const currentPlan = db
      .prepare('SELECT * FROM diet_plans WHERE user_id=? ORDER BY id DESC LIMIT 1')
      .get(userId) as Record<string, unknown> | undefined
    if (!currentPlan) throw new Error('No diet plan found')
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(userId) as Record<string, unknown>
    const calories = currentPlan.calories_target as number
    // Use the most recent check-in weight when available — user.weight_kg is the
    // onboarding weight and goes stale as the athlete progresses through their cut.
    const latestCheckin = db
      .prepare('SELECT weight_kg FROM weekly_checkins WHERE user_id=? ORDER BY check_in_date DESC LIMIT 1')
      .get(userId) as { weight_kg: number } | undefined
    const weightKg = latestCheckin?.weight_kg ?? (user.weight_kg as number)
    const protein_g = Math.round(weightKg * 2.3)
    const fat_g = Math.round(weightKg * 0.9)
    const carbs_g = Math.max(0, Math.round((calories - protein_g * 4 - fat_g * 9) / 4))
    // Scale per-meal macros using new macro ratios without regenerating food lists,
    // so any food swaps the athlete made are preserved.
    const proteinCalRatio = (protein_g * 4) / calories
    const fatCalRatio = (fat_g * 9) / calories
    const existingMeals = JSON.parse(currentPlan.meals as string) as Array<Record<string, unknown>>
    const meals = existingMeals.map((m) => {
      const cal = m.calories as number
      const pro = Math.round((cal * proteinCalRatio) / 4)
      const fat = Math.round((cal * fatCalRatio) / 9)
      const carb = Math.max(0, Math.round((cal - pro * 4 - fat * 9) / 4))
      return { ...m, protein_g: pro, fat_g: fat, carbs_g: carb }
    })
    db.prepare(
      'UPDATE diet_plans SET protein_g=?, carbs_g=?, fat_g=?, meals=? WHERE user_id=? AND id=(SELECT id FROM diet_plans WHERE user_id=? ORDER BY id DESC LIMIT 1)'
    ).run([protein_g, carbs_g, fat_g, JSON.stringify(meals), userId, userId])
    const saved = db.prepare('SELECT * FROM diet_plans WHERE user_id=? ORDER BY id DESC LIMIT 1').get(userId) as Record<string,unknown>
    return { ...saved, meals: JSON.parse(saved.meals as string) }
  })

  ipcMain.handle('plan:refineDietWithPrompt', async (_event, userId: number, userPrompt: string) => {
    const db = getDb()
    const apiKeyRow = db.prepare("SELECT value FROM settings WHERE key='claude_api_key'").get() as { value: string } | null
    const claudeApiKey = apiKeyRow?.value?.trim() ?? ''
    if (!claudeApiKey) throw new Error('Claude API key not configured')
    const currentPlan = db.prepare('SELECT * FROM diet_plans WHERE user_id=? ORDER BY id DESC LIMIT 1').get(userId) as Record<string,unknown>
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(userId) as Record<string,unknown>
    const refined = await refineDietPlan(claudeApiKey, {
      currentPlan: { ...currentPlan, meals: JSON.parse(currentPlan.meals as string) },
      userProfile: { dietary_preference: user.dietary_preference, culture_pref: user.culture_pref },
      userRequest: userPrompt,
    })
    if (!refined || !(refined as any).meals) throw new Error('Claude did not return a valid plan')
    const r = refined as any
    db.prepare(
      'UPDATE diet_plans SET protein_g=?, carbs_g=?, fat_g=?, meals=? WHERE user_id=? AND id=(SELECT id FROM diet_plans WHERE user_id=? ORDER BY id DESC LIMIT 1)'
    ).run([r.protein_g ?? currentPlan.protein_g, r.carbs_g ?? currentPlan.carbs_g, r.fat_g ?? currentPlan.fat_g, JSON.stringify(r.meals), userId, userId])
    const saved = db.prepare('SELECT * FROM diet_plans WHERE user_id=? ORDER BY id DESC LIMIT 1').get(userId) as Record<string,unknown>
    return { ...saved, meals: JSON.parse(saved.meals as string) }
  })

  ipcMain.handle('plan:refineWorkoutWithPrompt', async (_event, userId: number, userPrompt: string) => {
    const db = getDb()
    const apiKeyRow = db.prepare("SELECT value FROM settings WHERE key='claude_api_key'").get() as { value: string } | null
    const claudeApiKey = apiKeyRow?.value?.trim() ?? ''
    if (!claudeApiKey) throw new Error('Claude API key not configured')
    const plan = db.prepare('SELECT * FROM training_plans WHERE user_id=? ORDER BY id DESC LIMIT 1').get(userId) as Record<string,unknown> | undefined
    if (!plan) throw new Error('No training plan found')
    const sessions = db.prepare('SELECT * FROM training_sessions WHERE plan_id=? ORDER BY day_of_week').all(plan.id as number) as Record<string,unknown>[]
    const sessionsWithExercises = sessions.map((s) => ({
      ...s,
      exercises: JSON.parse(s.exercises as string)
    }))
    // Strip DB-only fields so Claude receives clean, focused session data
    const sessionsForClaude = sessionsWithExercises.map((s: any) => ({
      day_of_week: s.day_of_week,
      session_name: s.session_name,
      exercises: s.exercises,
    }))
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(userId) as Record<string,unknown>
    const refined = await refineWorkoutWithClaude(claudeApiKey, {
      currentSessions: sessionsForClaude,
      userProfile: { equipment_access: user.equipment_access, split_preference: user.split_preference },
      userRequest: userPrompt,
    })
    if (!refined) throw new Error('Claude did not return updated sessions')
    for (const updatedSession of refined) {
      const s = updatedSession as any
      if (!Array.isArray(s?.exercises) || s.exercises.length === 0) continue
      const matching = sessions.find((orig) => orig.day_of_week === s.day_of_week)
      if (matching) {
        db.prepare('UPDATE training_sessions SET exercises=? WHERE id=?')
          .run([JSON.stringify(s.exercises), matching.id])
      }
    }
    const updatedSessions = db.prepare('SELECT * FROM training_sessions WHERE plan_id=? ORDER BY day_of_week').all(plan.id as number) as Record<string,unknown>[]
    return {
      ...plan,
      sessions: updatedSessions.map((s) => ({ ...s, exercises: JSON.parse(s.exercises as string) }))
    }
  })

  ipcMain.handle('plan:applyAIRequest', async (_event, userId: number, userRequest: string, domain: 'training' | 'diet' | 'general') => {
    const db = getDb()
    const apiKeyRow = db.prepare("SELECT value FROM settings WHERE key='claude_api_key'").get() as { value: string } | null
    const claudeApiKey = apiKeyRow?.value?.trim() ?? ''
    if (!claudeApiKey) throw new Error('Claude API key not configured')

    const user = db.prepare('SELECT * FROM users WHERE id=?').get(userId) as Record<string,unknown>
    if (!user) throw new Error('User not found')

    const result = await processAIRequest(claudeApiKey, {
      userRequest,
      currentUser: {
        goal: user.goal, weight_kg: user.weight_kg,
        training_frequency: user.training_frequency, split_preference: user.split_preference,
        exercises_per_session: user.exercises_per_session, sets_per_exercise: user.sets_per_exercise,
        dietary_preference: user.dietary_preference, meal_count: user.meal_count,
        snack_count: (user.snack_count as number) ?? 0, cooking_time_pref: user.cooking_time_pref,
        culture_pref: user.culture_pref, activity_level: user.activity_level,
        equipment_access: user.equipment_access,
        // Full context so AI can factor in injuries, show timeline, and division
        division: user.division ?? null,
        show_date: user.show_date ?? null,
        recovery_notes: user.recovery_notes ?? null,
        dietary_restrictions: (() => { try { return JSON.parse(user.dietary_restrictions as string ?? '[]') } catch { return [] } })(),
        food_exclusions: (() => { try { return JSON.parse(user.food_exclusions as string ?? '[]') } catch { return [] } })(),
        food_preferences: (() => { try { return JSON.parse(user.food_preferences as string ?? '[]') } catch { return [] } })(),
      },
      domain,
    })

    if (!result) throw new Error('AI could not process your request — Claude returned no parseable response. Check your API key or try rephrasing.')

    // Actions that require no DB changes
    if (result.action === 'reject') return { action: 'reject', message: result.message }
    if (result.action === 'explain') return { action: 'explain' as any, message: result.message }

    // Exercise-level refinement — modify existing sessions without full regeneration
    if (result.action === 'refine_workout') {
      const plan = db.prepare('SELECT * FROM training_plans WHERE user_id=? ORDER BY id DESC LIMIT 1').get(userId) as Record<string,unknown> | undefined
      if (!plan) return { action: 'explain' as any, message: 'No training plan found. Generate a plan first before refining it.' }
      const sessions = db.prepare('SELECT * FROM training_sessions WHERE plan_id=? ORDER BY day_of_week').all(plan.id as number) as Record<string,unknown>[]
      const sessionsForClaude = sessions.map((s: any) => ({
        day_of_week: s.day_of_week, session_name: s.session_name,
        exercises: JSON.parse(s.exercises as string),
      }))
      const refined = await refineWorkoutWithClaude(claudeApiKey, {
        currentSessions: sessionsForClaude,
        userProfile: { equipment_access: user.equipment_access, split_preference: user.split_preference },
        userRequest: userRequest,
      })
      if (!refined) return { action: 'explain' as any, message: result.message + ' (Could not generate specific changes — try being more specific about which exercises to swap.)' }
      for (const s of refined) {
        const session = s as any
        if (!Array.isArray(session?.exercises) || session.exercises.length === 0) continue
        const matching = sessions.find((orig) => orig.day_of_week === session.day_of_week)
        if (matching) {
          db.prepare('UPDATE training_sessions SET exercises=? WHERE id=?')
            .run([JSON.stringify(session.exercises), matching.id])
        }
      }
      const updatedSessions = db.prepare('SELECT * FROM training_sessions WHERE plan_id=? ORDER BY day_of_week').all(plan.id as number) as Record<string,unknown>[]
      const trainingPlan = { ...plan, sessions: updatedSessions.map((s) => ({ ...s, exercises: JSON.parse(s.exercises as string) })) }
      return { action: 'update', message: result.message, trainingPlan, dietPlan: null, updatedUser: user }
    }

    // Food-level refinement — swap foods without changing settings
    if (result.action === 'refine_diet') {
      const currentPlan = db.prepare('SELECT * FROM diet_plans WHERE user_id=? ORDER BY id DESC LIMIT 1').get(userId) as Record<string,unknown> | undefined
      if (!currentPlan) return { action: 'explain' as any, message: 'No diet plan found. Generate a plan first before refining it.' }
      const refined = await refineDietPlan(claudeApiKey, {
        currentPlan: { ...currentPlan, meals: JSON.parse(currentPlan.meals as string) },
        userProfile: { dietary_preference: user.dietary_preference, culture_pref: user.culture_pref },
        userRequest: userRequest,
      })
      if (!refined || !(refined as any).meals) return { action: 'explain' as any, message: result.message + ' (Could not generate specific food swaps — try being more specific, e.g. "replace chicken in dinner with salmon".)' }
      const r = refined as any
      db.prepare(
        'UPDATE diet_plans SET meals=? WHERE user_id=? AND id=(SELECT id FROM diet_plans WHERE user_id=? ORDER BY id DESC LIMIT 1)'
      ).run([JSON.stringify(r.meals), userId, userId])
      const saved = db.prepare('SELECT * FROM diet_plans WHERE user_id=? ORDER BY id DESC LIMIT 1').get(userId) as Record<string,unknown>
      const dietPlan = { ...saved, meals: JSON.parse(saved.meals as string) }
      return { action: 'update', message: result.message, trainingPlan: null, dietPlan, updatedUser: user }
    }

    // Whitelist of actual users table columns Claude is allowed to change
    const ALLOWED_COLUMNS = new Set([
      'training_frequency', 'split_preference', 'exercises_per_session', 'sets_per_exercise',
      'meal_count', 'snack_count', 'dietary_preference', 'cooking_time_pref', 'culture_pref',
      'activity_level', 'goal', 'dietary_restrictions', 'food_exclusions', 'food_preferences',
      'meal_prep_style', 'training_experience_years', 'equipment_access',
      'show_date', 'division', 'recovery_notes'
    ])
    // Columns stored as JSON arrays in SQLite
    const JSON_ARRAY_COLS = new Set(['dietary_restrictions', 'food_exclusions', 'food_preferences'])

    // Apply setting changes to user record — use namedParams for @param binding
    if (result.settingChanges && Object.keys(result.settingChanges).length > 0) {
      const raw = result.settingChanges as any
      const changes: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(raw)) {
        if (!ALLOWED_COLUMNS.has(k)) continue  // skip hallucinated column names
        if (JSON_ARRAY_COLS.has(k)) {
          // Merge with existing array if request is additive
          const existing = db.prepare(`SELECT ${k} FROM users WHERE id=?`).get(userId) as Record<string,unknown>
          const current: string[] = JSON.parse((existing[k] as string) ?? '[]')
          let next = Array.isArray(v) ? (v as string[]) : current
          // Handle add/remove sub-keys (e.g. dietary_restrictions_add)
          const toAdd = (raw[`${k}_add`] as string[] | undefined) ?? []
          const toRemove = (raw[`${k}_remove`] as string[] | undefined) ?? []
          if (toAdd.length || toRemove.length) {
            next = [...new Set([...current, ...toAdd].filter(x => !toRemove.includes(x)))]
          }
          changes[k] = JSON.stringify(next)
          continue
        }
        changes[k] = v
      }
      if (Object.keys(changes).length > 0) {
        const fields = Object.keys(changes).map(k => `${k} = @${k}`).join(', ')
        db.prepare(`UPDATE users SET ${fields}, updated_at = datetime('now') WHERE id = @id`)
          .run(namedParams({ ...changes, id: userId }))
      }
    }

    const updatedUser = db.prepare('SELECT * FROM users WHERE id=?').get(userId) as Record<string,unknown>
    let trainingPlan = null
    let dietPlan = null

    // Regenerate training plan — Claude first, rule-based engine as guaranteed fallback
    if (result.regenerateTraining) {
      let weeksOut: number | undefined
      if (updatedUser.show_date) {
        weeksOut = Math.max(0, Math.floor((new Date((updatedUser.show_date as string) + 'T12:00:00').getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 7)))
      }
      const maxSets = result.maxSetsOverride ?? undefined
      const engineInput = {
        training_frequency: updatedUser.training_frequency as number,
        training_experience_years: updatedUser.training_experience_years as number,
        equipment_access: updatedUser.equipment_access as string,
        split_preference: updatedUser.split_preference as string,
        goal: updatedUser.goal as string,
        division: updatedUser.division as string | undefined,
        weeks_out: weeksOut,
        exercises_per_session: (updatedUser.exercises_per_session as number) ?? 6,
        sets_per_exercise: (updatedUser.sets_per_exercise as number) ?? 4,
        max_sets_per_exercise: maxSets,
        recovery_notes: (updatedUser.recovery_notes as string) || undefined,
      }

      // Try Claude first
      let sessionsToSave: Array<{day_of_week: number; session_name: string; exercises: unknown[]}> | null = null
      let planMeta: {name: string; weeks_total: number; phase: string} | null = null

      try {
        const claudeWorkout = await generateWorkoutWithClaude(claudeApiKey, engineInput)
        const cwRaw = claudeWorkout as any
        const valid = cwRaw?.sessions?.filter((s: any) => Array.isArray(s?.exercises) && s.exercises.length > 0)
        if (valid?.length >= 2) {
          sessionsToSave = valid
          planMeta = { name: cwRaw.name ?? 'AI Training Plan', weeks_total: cwRaw.weeks_total ?? 12, phase: cwRaw.phase ?? 'hypertrophy' }
        }
      } catch { /* fall through to rule-based */ }

      // Rule-based fallback — always produces valid sessions
      if (!sessionsToSave?.length) {
        const rulePlan = generateTrainingPlan(engineInput)
        sessionsToSave = rulePlan.sessions as any
        planMeta = { name: rulePlan.name, weeks_total: rulePlan.weeks_total, phase: rulePlan.phase }
      }

      // Save plan to DB
      const existing = db.prepare('SELECT id FROM training_plans WHERE user_id = ?').get(userId) as { id: number } | undefined
      if (existing) {
        db.prepare('UPDATE workout_logs SET session_id = NULL WHERE session_id IN (SELECT id FROM training_sessions WHERE plan_id = ?)').run([existing.id])
        db.prepare('DELETE FROM training_sessions WHERE plan_id = ?').run(existing.id)
        db.prepare('DELETE FROM training_plans WHERE id = ?').run(existing.id)
      }
      const planResult = db.prepare(
        `INSERT INTO training_plans (user_id, name, weeks_total, phase) VALUES (?, ?, ?, ?)`
      ).run([userId, planMeta!.name, planMeta!.weeks_total, planMeta!.phase])
      const planId = planResult.lastInsertRowid
      const insertSession = db.prepare(`INSERT INTO training_sessions (plan_id, week_number, day_of_week, session_name, exercises) VALUES (?, ?, ?, ?, ?)`)
      for (const s of sessionsToSave!) {
        insertSession.run([planId, 1, (s as any).day_of_week, (s as any).session_name, JSON.stringify((s as any).exercises)])
      }
      let finalSessions = db.prepare('SELECT * FROM training_sessions WHERE plan_id=? ORDER BY day_of_week').all(planId as number) as Record<string,unknown>[]

      // Post-generation safety/constraint refinement (injuries, set caps, etc.)
      if (result.postRefinementInstruction) {
        const sessionsForRefinement = finalSessions.map((s: any) => ({
          day_of_week: s.day_of_week,
          session_name: s.session_name,
          exercises: JSON.parse(s.exercises as string),
        }))
        const defaultSets = (updatedUser.sets_per_exercise as number) ?? 3
        const hardMaxSets = result.maxSetsOverride ?? defaultSets + 1
        const refined = await refineWorkoutForSafety(
          claudeApiKey, sessionsForRefinement,
          result.postRefinementInstruction,
          defaultSets, hardMaxSets
        )
        if (refined?.length) {
          // Apply refined sessions — update DB in-place
          for (const s of refined) {
            const session = s as any
            if (!Array.isArray(session?.exercises) || session.exercises.length === 0) continue
            const matching = finalSessions.find((orig: any) => orig.day_of_week === session.day_of_week)
            if (matching) {
              db.prepare('UPDATE training_sessions SET exercises=? WHERE id=?')
                .run([JSON.stringify(session.exercises), matching.id])
            }
          }
          finalSessions = db.prepare('SELECT * FROM training_sessions WHERE plan_id=? ORDER BY day_of_week').all(planId as number) as Record<string,unknown>[]
        }
      }

      // Enforce hard max sets cap on all exercises (server-side guarantee)
      if (result.maxSetsOverride !== undefined) {
        const cap = result.maxSetsOverride
        for (const s of finalSessions) {
          const exercises = JSON.parse(s.exercises as string) as Array<{sets: number; [k: string]: unknown}>
          const clamped = exercises.map(ex => ({ ...ex, sets: Math.min(ex.sets, cap) }))
          if (clamped.some((ex, i) => ex.sets !== exercises[i].sets)) {
            db.prepare('UPDATE training_sessions SET exercises=? WHERE id=?')
              .run([JSON.stringify(clamped), s.id])
          }
        }
        finalSessions = db.prepare('SELECT * FROM training_sessions WHERE plan_id=? ORDER BY day_of_week').all(planId as number) as Record<string,unknown>[]
      }

      trainingPlan = {
        ...db.prepare('SELECT * FROM training_plans WHERE id=?').get(planId),
        sessions: finalSessions.map(s => ({ ...s, exercises: JSON.parse(s.exercises as string) }))
      }
    }

    // Regenerate diet plan if settings changed
    if (result.regenerateDiet) {
      const currentDiet = db.prepare('SELECT * FROM diet_plans WHERE user_id=? ORDER BY id DESC LIMIT 1').get(userId) as Record<string,unknown> | undefined
      if (currentDiet) {
        const meals = buildMealsPublic(
          currentDiet.calories_target as number,
          currentDiet.protein_g as number,
          currentDiet.carbs_g as number,
          currentDiet.fat_g as number,
          (updatedUser.meal_count as number) ?? 4,
          (updatedUser.dietary_preference as string) ?? 'omnivore',
          (() => { try { return JSON.parse((updatedUser.food_exclusions as string) ?? '[]') } catch { return [] } })(),
          (() => { try { return JSON.parse((updatedUser.food_preferences as string) ?? '[]') } catch { return [] } })(),
          (updatedUser.cooking_time_pref as string) ?? 'medium',
          (updatedUser.snack_count as number) ?? 0,
          'any',
          (() => { try { return JSON.parse((updatedUser.dietary_restrictions as string) ?? '[]') } catch { return [] } })()
        )
        db.prepare(
          'UPDATE diet_plans SET meals=? WHERE user_id=? AND id=(SELECT id FROM diet_plans WHERE user_id=? ORDER BY id DESC LIMIT 1)'
        ).run([JSON.stringify(meals), userId, userId])
        const saved = db.prepare('SELECT * FROM diet_plans WHERE user_id=? ORDER BY id DESC LIMIT 1').get(userId) as Record<string,unknown>
        dietPlan = { ...saved, meals: JSON.parse(saved.meals as string) }
      }
    }

    return { action: 'update', message: result.message, trainingPlan, dietPlan, updatedUser }
  })

  ipcMain.handle('plan:swapMeal', (_event, userId: number, mealIndex: number, newFoods: string[]) => {
    const db = getDb()
    const plan = db.prepare('SELECT * FROM diet_plans WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(userId) as Record<string, unknown> | undefined
    if (!plan) throw new Error('No diet plan found')
    const meals = JSON.parse(plan.meals as string) as Array<Record<string, unknown>>
    if (mealIndex < 0 || mealIndex >= meals.length) throw new Error('Invalid meal index')
    meals[mealIndex] = { ...meals[mealIndex], foods: newFoods }
    db.prepare('UPDATE diet_plans SET meals = ? WHERE id = ?').run([JSON.stringify(meals), plan.id])
    const saved = db.prepare('SELECT * FROM diet_plans WHERE id = ?').get(plan.id as number) as Record<string, unknown>
    return { ...saved, meals: JSON.parse(saved.meals as string) }
  })

  ipcMain.handle('plan:reorderMeals', (_event, userId: number, newMeals: unknown[]) => {
    const db = getDb()
    const plan = db.prepare('SELECT * FROM diet_plans WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(userId) as Record<string, unknown> | undefined
    if (!plan) throw new Error('No diet plan found')
    const existing = JSON.parse(plan.meals as string) as unknown[]
    if ((newMeals as unknown[]).length !== existing.length) throw new Error('Meal count mismatch')
    db.prepare('UPDATE diet_plans SET meals = ? WHERE id = ?').run([JSON.stringify(newMeals), plan.id])
    const saved = db.prepare('SELECT * FROM diet_plans WHERE id = ?').get(plan.id as number) as Record<string, unknown>
    return { ...saved, meals: JSON.parse(saved.meals as string) }
  })

  // Sets the user's off-season goal and immediately regenerates diet.
  ipcMain.handle('plan:selectOffSeasonGoal', (_event, userId: number, goal: string) => {
    const db = getDb()
    const valid = ['cut', 'maintain', 'recomp', 'bulk']
    if (!valid.includes(goal)) throw new Error(`Invalid goal: ${goal}`)
    db.prepare('UPDATE users SET goal=? WHERE id=?').run([goal, userId])
    regenerateDietForGoal(db, userId, goal, undefined)
    const diet = db.prepare('SELECT * FROM diet_plans WHERE user_id=? ORDER BY id DESC LIMIT 1').get([userId]) as Record<string, unknown>
    return { ...diet, meals: JSON.parse(diet.meals as string) }
  })

  // Returns calorie estimates for all 4 goals without generating full meal plans — used by GoalPickerModal.
  ipcMain.handle('plan:previewGoalCalories', (_event, userId: number) => {
    const db = getDb()
    const user = db.prepare('SELECT * FROM users WHERE id=?').get([userId]) as Record<string, unknown>
    if (!user) throw new Error('User not found')
    const bmr = calcBMR(
      user.weight_kg as number,
      user.height_cm as number,
      user.age as number,
      user.sex as string
    )
    const tdee = Math.round(bmr * (ACTIVITY_MULTIPLIERS[user.activity_level as string] ?? 1.55))
    const preview: Record<string, number> = {}
    for (const goal of ['bulk', 'maintain', 'cut', 'recomp']) {
      preview[goal] = Math.max(1200, tdee + getPhaseAwareDeficit(undefined, goal))
    }
    return preview
  })
}
