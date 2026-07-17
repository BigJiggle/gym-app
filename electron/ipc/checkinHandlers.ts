import { IpcMain } from 'electron'
import { getDb, namedParams } from '../database/db'
import { calculateAdjustments } from '../services/checkinEngine'
import { getNextCheckinDate, computeMissedSlots } from '../services/checkinSchedule'
import { clampWeightKg } from '../services/nutritionEngine'

export { getNextCheckinDate, computeMissedSlots }

function readCheckinSettings(db: ReturnType<typeof getDb>): {
  scheduleType: 'day' | 'interval'
  checkinDay: number
  biweekly: boolean
  intervalDays: number
} {
  const get = (key: string, fallback: string) => {
    const row = db.prepare('SELECT value FROM settings WHERE key=?').get([key]) as { value: string } | null
    return row?.value ?? fallback
  }
  const scheduleType = get('checkin_schedule_type', 'day') as 'day' | 'interval'
  const checkinDay = parseInt(get('checkin_day', '1'), 10)
  const biweekly = get('checkin_biweekly', 'false') === 'true'
  const intervalDays = parseInt(get('checkin_interval_days', '7'), 10)
  return { scheduleType, checkinDay, biweekly, intervalDays }
}

export function registerCheckinHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('checkin:submit', (_event, data) => {
    const db = getDb()

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(data.user_id) as Record<string, unknown>
    if (!user) throw new Error('User not found')

    // Interval enforcement — ORDER BY check_in_date so retroactive inserts
    // (which have the highest id but an old date) don't break lock calculation.
    const lastCheckin = db
      .prepare('SELECT check_in_date FROM weekly_checkins WHERE user_id = ? ORDER BY check_in_date DESC LIMIT 1')
      .get(data.user_id) as { check_in_date: string } | null | undefined

    const s = readCheckinSettings(db)

    // Reject a second check-in on a date that already has one (e.g. interval_days=1
    // allows two same-day submits through the interval lock). One weigh-in per day
    // keeps week_numbers unique and the weight-trend chart correct.
    const submitDate = data.check_in_date ?? new Date().toLocaleDateString('en-CA')
    const sameDay = db
      .prepare('SELECT id FROM weekly_checkins WHERE user_id=? AND check_in_date=? LIMIT 1')
      .get([data.user_id, submitDate]) as { id: number } | undefined
    if (sameDay) {
      throw new Error(`DUPLICATE_CHECKIN:${submitDate}`)
    }

    if (lastCheckin) {
      const nextAllowed = getNextCheckinDate(
        lastCheckin.check_in_date,
        s.scheduleType,
        s.checkinDay,
        s.biweekly,
        s.intervalDays
      )
      if (new Date() < nextAllowed) {
        throw new Error(`EARLY_CHECKIN:${nextAllowed.toISOString()}`)
      }
    }

    const previous = db
      .prepare(
        'SELECT weight_kg, week_number FROM weekly_checkins WHERE user_id = ? ORDER BY week_number DESC LIMIT 1'
      )
      .get(data.user_id) as { weight_kg: number; week_number: number } | undefined

    // Recent prior check-ins (most-recent-first) feed the smoothed weight trend so
    // adaptation reflects the multi-week direction, not one noisy weigh-in.
    const recentCheckins = db
      .prepare(
        'SELECT weight_kg, week_number FROM weekly_checkins WHERE user_id = ? ORDER BY week_number DESC LIMIT 4'
      )
      .all(data.user_id) as { weight_kg: number; week_number: number }[]

    const dietPlan = db
      .prepare('SELECT calories_target FROM diet_plans WHERE user_id = ? ORDER BY id DESC LIMIT 1')
      .get(data.user_id) as { calories_target: number } | undefined

    const adjustments = calculateAdjustments(
      {
        weight_kg: data.weight_kg,
        training_adherence: data.training_adherence,
        diet_adherence: data.diet_adherence,
        energy_level: data.energy_level,
        sleep_quality: data.sleep_quality,
        stress_level: data.stress_level,
        notes: data.notes
      },
      previous ?? null,
      dietPlan?.calories_target ?? 2000,
      user.goal as string,
      recentCheckins
    )

    const weekNumber = (previous?.week_number ?? 0) + 1

    const result = db
      .prepare(
        `INSERT INTO weekly_checkins (
          user_id, week_number, check_in_date, weight_kg,
          waist_cm, chest_cm, hip_cm, arm_cm, thigh_cm,
          training_adherence, diet_adherence, energy_level,
          sleep_quality, stress_level, notes, adjustments,
          schedule_type, interval_days
        ) VALUES (
          @user_id, @week_number, @check_in_date, @weight_kg,
          @waist_cm, @chest_cm, @hip_cm, @arm_cm, @thigh_cm,
          @training_adherence, @diet_adherence, @energy_level,
          @sleep_quality, @stress_level, @notes, @adjustments,
          @schedule_type, @interval_days
        )`
      )
      .run(namedParams({
        ...data,
        week_number: weekNumber,
        check_in_date: submitDate,
        adjustments: JSON.stringify(adjustments),
        schedule_type: s.scheduleType,
        interval_days: s.intervalDays,
      }))

    if (dietPlan) {
      // Recalculate every check-in, not just ones with a non-zero calorie delta —
      // goals like bulk/maintain (and an "on track" cut) leave calories_delta at 0,
      // but protein/fat targets are derived straight from bodyweight and must still
      // track the athlete's latest weigh-in even when the calorie target doesn't move.
      const newCalories = Math.max(1200, (dietPlan.calories_target as number) + adjustments.calories_delta)
      // Use the just-submitted weigh-in (current bodyweight), not the stale onboarding
      // weight on the user record — protein/fat targets must track the athlete's
      // actual weight as it changes week to week through their cut. Guard against a
      // 0/negative/non-finite weigh-in falling straight through to 0g protein/fat.
      const weightKg = clampWeightKg(data.weight_kg as number, clampWeightKg(user.weight_kg as number))
      const protein_g = Math.round(weightKg * 2.3)
      const fat_g = Math.round(weightKg * 0.9)
      const carbs_g = Math.max(0, Math.round((newCalories - protein_g * 4 - fat_g * 9) / 4))
      const currentPlanRow = db
        .prepare('SELECT meals FROM diet_plans WHERE user_id=? ORDER BY id DESC LIMIT 1')
        .get(data.user_id) as { meals: string } | undefined
      let mealsJson = currentPlanRow?.meals ?? '[]'
      try {
        // Scale meal calories by calorie ratio; recalculate protein/fat/carbs
        // within each meal using new plan-level macro ratios so per-meal values
        // stay consistent with plan totals (protein fixed by body weight, not ratio).
        const ratio = newCalories / (dietPlan.calories_target as number)
        const proteinCalRatio = (protein_g * 4) / newCalories
        const fatCalRatio = (fat_g * 9) / newCalories
        const existingMeals = JSON.parse(mealsJson) as Array<Record<string, unknown>>
        const scaledMeals = existingMeals.map((m) => {
          const newMealCal = Math.round((m.calories as number) * ratio)
          const pro = Math.round((newMealCal * proteinCalRatio) / 4)
          const fat = Math.round((newMealCal * fatCalRatio) / 9)
          const carb = Math.max(0, Math.round((newMealCal - pro * 4 - fat * 9) / 4))
          return { ...m, calories: newMealCal, protein_g: pro, fat_g: fat, carbs_g: carb }
        })
        mealsJson = JSON.stringify(scaledMeals)
      } catch { /* keep existing meals if parsing fails */ }
      db.prepare(`
        UPDATE diet_plans
        SET calories_target=?, protein_g=?, carbs_g=?, fat_g=?, meals=?
        WHERE id = (SELECT id FROM diet_plans WHERE user_id=? ORDER BY id DESC LIMIT 1)
      `).run([newCalories, protein_g, carbs_g, fat_g, mealsJson, data.user_id])
    }

    const saved = db
      .prepare('SELECT * FROM weekly_checkins WHERE id = ?')
      .get(result.lastInsertRowid) as Record<string, unknown>
    return { ...saved, adjustments: JSON.parse(saved.adjustments as string) }
  })

  // ── Retroactive "fill in a missed slot" ────────────────────────────────
  ipcMain.handle('checkin:submitMissed', (_event, data) => {
    const db = getDb()

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(data.user_id) as Record<string, unknown>
    if (!user) throw new Error('User not found')

    if (!data.check_in_date || !/^\d{4}-\d{2}-\d{2}$/.test(data.check_in_date)) {
      throw new Error('check_in_date (YYYY-MM-DD) is required for a missed check-in')
    }

    const s = readCheckinSettings(db)

    // Reject a duplicate check-in on a date that already has one. Two rows sharing
    // a check_in_date would receive overlapping week_numbers (the new row gets
    // priorCount+1 while existing same-date rows are shifted), producing duplicate
    // week_numbers that make the "previous" lookup nondeterministic and corrupt the
    // weight-trend chart. One weigh-in per calendar day.
    const dupe = db
      .prepare('SELECT id FROM weekly_checkins WHERE user_id=? AND check_in_date=? LIMIT 1')
      .get([data.user_id, data.check_in_date]) as { id: number } | undefined
    if (dupe) {
      throw new Error(`DUPLICATE_CHECKIN:${data.check_in_date}`)
    }

    // Chronological week_number: count check-ins strictly before this date
    const priorCount = (db
      .prepare('SELECT COUNT(*) as cnt FROM weekly_checkins WHERE user_id=? AND check_in_date<?')
      .get([data.user_id, data.check_in_date]) as { cnt: number }).cnt
    const weekNumber = priorCount + 1

    // Make room: push all existing check-ins with a date >= provided date
    db.prepare(
      `UPDATE weekly_checkins SET week_number = week_number + 1
       WHERE user_id=? AND check_in_date>=?`
    ).run([data.user_id, data.check_in_date])

    // Find previous check-in for adjustment calculation
    const previous = db
      .prepare(
        'SELECT weight_kg, week_number FROM weekly_checkins WHERE user_id=? AND check_in_date<? ORDER BY check_in_date DESC LIMIT 1'
      )
      .get([data.user_id, data.check_in_date]) as { weight_kg: number; week_number: number } | undefined

    // Trend window uses the check-ins chronologically before this retroactive date.
    const recentCheckins = db
      .prepare(
        'SELECT weight_kg, week_number FROM weekly_checkins WHERE user_id=? AND check_in_date<? ORDER BY check_in_date DESC LIMIT 4'
      )
      .all([data.user_id, data.check_in_date]) as { weight_kg: number; week_number: number }[]

    const dietPlan = db
      .prepare('SELECT calories_target FROM diet_plans WHERE user_id=? ORDER BY id DESC LIMIT 1')
      .get(data.user_id) as { calories_target: number } | undefined

    const adjustments = calculateAdjustments(
      {
        weight_kg: data.weight_kg,
        training_adherence: data.training_adherence,
        diet_adherence: data.diet_adherence,
        energy_level: data.energy_level,
        sleep_quality: data.sleep_quality,
        stress_level: data.stress_level,
        notes: data.notes,
      },
      previous ?? null,
      dietPlan?.calories_target ?? 2000,
      user.goal as string,
      recentCheckins
    )

    const result = db
      .prepare(
        `INSERT INTO weekly_checkins (
          user_id, week_number, check_in_date, weight_kg,
          waist_cm, chest_cm, hip_cm, arm_cm, thigh_cm,
          training_adherence, diet_adherence, energy_level,
          sleep_quality, stress_level, notes, adjustments,
          schedule_type, interval_days
        ) VALUES (
          @user_id, @week_number, @check_in_date, @weight_kg,
          @waist_cm, @chest_cm, @hip_cm, @arm_cm, @thigh_cm,
          @training_adherence, @diet_adherence, @energy_level,
          @sleep_quality, @stress_level, @notes, @adjustments,
          @schedule_type, @interval_days
        )`
      )
      .run(namedParams({
        ...data,
        week_number: weekNumber,
        adjustments: JSON.stringify(adjustments),
        schedule_type: s.scheduleType,
        interval_days: s.intervalDays,
      }))

    const saved = db
      .prepare('SELECT * FROM weekly_checkins WHERE id = ?')
      .get(result.lastInsertRowid) as Record<string, unknown>
    return { ...saved, adjustments: JSON.parse(saved.adjustments as string) }
  })

  ipcMain.handle('checkin:nextAllowed', (_event, userId: number) => {
    const db = getDb()
    const last = db
      .prepare('SELECT check_in_date FROM weekly_checkins WHERE user_id = ? ORDER BY check_in_date DESC LIMIT 1')
      .get(userId) as { check_in_date: string } | null | undefined
    if (!last) return null
    const s = readCheckinSettings(db)
    const nextAllowed = getNextCheckinDate(
      last.check_in_date,
      s.scheduleType,
      s.checkinDay,
      s.biweekly,
      s.intervalDays
    )
    return nextAllowed.toISOString()
  })

  ipcMain.handle('checkin:history', (_event, userId: number) => {
    const db = getDb()
    const rows = db
      .prepare('SELECT * FROM weekly_checkins WHERE user_id = ? ORDER BY check_in_date DESC')
      .all(userId) as Record<string, unknown>[]
    return rows.map((r) => ({ ...r, adjustments: JSON.parse(r.adjustments as string) }))
  })

  ipcMain.handle('checkin:latest', (_event, userId: number) => {
    const db = getDb()
    const row = db
      .prepare('SELECT * FROM weekly_checkins WHERE user_id = ? ORDER BY check_in_date DESC LIMIT 1')
      .get(userId) as Record<string, unknown> | undefined
    if (!row) return null
    return { ...row, adjustments: JSON.parse(row.adjustments as string) }
  })

  ipcMain.handle('checkin:update', (_event, checkinId: number, data: Record<string, unknown>) => {
    const db = getDb()
    const existing = db.prepare('SELECT * FROM weekly_checkins WHERE id=?').get(checkinId) as Record<string, unknown> | undefined
    if (!existing) throw new Error('Check-in not found')

    // Guard the "one weigh-in per calendar day" invariant that submit/submitMissed
    // enforce. Moving a check-in's date onto a day that already has a DIFFERENT
    // check-in would create duplicate same-day rows — two points on the weight-trend
    // chart for one day and an ambiguous "previous"/week_number lookup.
    let dateChanged = false
    if (data.check_in_date != null) {
      const newDate = data.check_in_date as string
      if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
        throw new Error('check_in_date must be YYYY-MM-DD')
      }
      if (newDate !== existing.check_in_date) {
        dateChanged = true
        const clash = db
          .prepare('SELECT id FROM weekly_checkins WHERE user_id=? AND check_in_date=? AND id<>? LIMIT 1')
          .get([existing.user_id as number, newDate, checkinId]) as { id: number } | undefined
        if (clash) throw new Error(`DUPLICATE_CHECKIN:${newDate}`)
      }
    }

    const user = db.prepare('SELECT * FROM users WHERE id=?').get(existing.user_id as number) as Record<string, unknown>
    const dietPlan = db.prepare('SELECT calories_target FROM diet_plans WHERE user_id=? ORDER BY id DESC LIMIT 1').get(existing.user_id as number) as { calories_target: number } | undefined

    const previous = db.prepare(
      'SELECT weight_kg, week_number FROM weekly_checkins WHERE user_id=? AND id<? ORDER BY id DESC LIMIT 1'
    ).get([existing.user_id as number, checkinId]) as { weight_kg: number; week_number: number } | undefined

    // Trend window: the check-ins recorded before the one being edited.
    const recentCheckins = db.prepare(
      'SELECT weight_kg, week_number FROM weekly_checkins WHERE user_id=? AND id<? ORDER BY id DESC LIMIT 4'
    ).all([existing.user_id as number, checkinId]) as { weight_kg: number; week_number: number }[]

    const adjustments = calculateAdjustments(
      {
        weight_kg: (data.weight_kg ?? existing.weight_kg) as number,
        training_adherence: (data.training_adherence ?? existing.training_adherence) as number,
        diet_adherence: (data.diet_adherence ?? existing.diet_adherence) as number,
        energy_level: (data.energy_level ?? existing.energy_level) as number,
        sleep_quality: (data.sleep_quality ?? existing.sleep_quality) as number,
        stress_level: (data.stress_level ?? existing.stress_level) as number,
        notes: (data.notes ?? existing.notes) as string | undefined
      },
      previous ?? null,
      dietPlan?.calories_target ?? 2000,
      user.goal as string,
      recentCheckins
    )

    const allowed = new Set(['weight_kg', 'waist_cm', 'chest_cm', 'hip_cm', 'arm_cm', 'thigh_cm',
      'training_adherence', 'diet_adherence', 'energy_level', 'sleep_quality', 'stress_level', 'notes',
      'check_in_date'])
    const updates: Array<[string, unknown]> = Object.entries(data)
      .filter(([k]) => allowed.has(k))
      .map(([k, v]) => {
        if (v === undefined || v === null) return [k, null]
        if (typeof v === 'number' && isNaN(v)) return [k, null]
        return [k, v]
      })
    if (!updates.length) throw new Error('No valid fields to update')
    const sql = `UPDATE weekly_checkins SET ${updates.map(([k]) => `${k}=?`).join(', ')}, adjustments=? WHERE id=?`
    db.prepare(sql).run([...updates.map(([, v]) => v as string | number | null), JSON.stringify(adjustments), checkinId])

    // Editing a check-in's date can move it out of chronological order relative to
    // the other check-ins, but week_number is not part of the UPDATE — so the row
    // keeps its old rank. That desyncs week_number from date order, which
    // progress:entries (ORDER BY week_number) and the Progress page's
    // "Current Weight"/first→latest math all rely on. submit/submitMissed keep
    // week_number == chronological rank; a date edit must too. Renumber the user's
    // check-ins by (date, id) whenever the date actually changed.
    if (dateChanged) {
      const ordered = db
        .prepare('SELECT id FROM weekly_checkins WHERE user_id=? ORDER BY check_in_date ASC, id ASC')
        .all([existing.user_id as number]) as { id: number }[]
      ordered.forEach((row, i) => {
        db.prepare('UPDATE weekly_checkins SET week_number=? WHERE id=?').run([i + 1, row.id])
      })
    }

    const saved = db.prepare('SELECT * FROM weekly_checkins WHERE id=?').get(checkinId) as Record<string, unknown>
    return { ...saved, adjustments: JSON.parse(saved.adjustments as string) }
  })
}
