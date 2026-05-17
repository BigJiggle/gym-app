import { IpcMain } from 'electron'
import { getDb, namedParams } from '../database/db'
import { calculateAdjustments } from '../services/checkinEngine'

function getNextCheckinDate(
  lastDateStr: string,
  scheduleType: 'day' | 'interval',
  checkinDay: number,
  biweekly: boolean,
  intervalDays: number
): Date {
  // Parse the stored date at local noon to avoid DST/UTC boundary issues
  const last = new Date(lastDateStr + 'T12:00:00')

  let next: Date

  if (scheduleType === 'interval') {
    next = new Date(last)
    next.setDate(last.getDate() + intervalDays)
  } else if (!biweekly) {
    // Weekly day-based: start from TODAY, find the next occurrence of checkinDay.
    // Do NOT base this on lastDate — any wrong stored date (UTC artifact) would
    // push the result an extra 7 days. The preferred weekday itself enforces the
    // weekly cadence. We only block if the user already checked in today on their day.
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    next = new Date(today)
    let guard = 0
    while (next.getDay() !== checkinDay && guard++ < 7) {
      next.setDate(next.getDate() + 1)
    }

    // Prevent same-day double submission: if today IS the check-in day and the
    // stored date is also today, the user already checked in → advance one week.
    const todayStr = today.toLocaleDateString('en-CA')
    if (lastDateStr === todayStr && today.getDay() === checkinDay) {
      next.setDate(next.getDate() + 7)
    }
  } else {
    // Bi-weekly day-based: must wait 14 days after the last check-in,
    // then land on the next occurrence of checkinDay.
    const earliest = new Date(last)
    earliest.setDate(last.getDate() + 14)
    next = new Date(earliest)
    let guard = 0
    while (next.getDay() !== checkinDay && guard++ < 7) {
      next.setDate(next.getDate() + 1)
    }
  }

  // Unlock at the very START of the target day (00:00:00 local) so the user
  // can check in any time on that day — not just after noon.
  next.setHours(0, 0, 0, 0)
  return next
}

function readCheckinSettings(db: ReturnType<typeof getDb>): { scheduleType: 'day' | 'interval'; checkinDay: number; biweekly: boolean; intervalDays: number } {
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

    // Interval enforcement
    const lastCheckin = db
      .prepare('SELECT check_in_date FROM weekly_checkins WHERE user_id = ? ORDER BY id DESC LIMIT 1')
      .get(data.user_id) as { check_in_date: string } | null | undefined

    if (lastCheckin) {
      const s = readCheckinSettings(db)
      const nextAllowed = getNextCheckinDate(lastCheckin.check_in_date, s.scheduleType, s.checkinDay, s.biweekly, s.intervalDays)
      if (new Date() < nextAllowed) {
        throw new Error(`EARLY_CHECKIN:${nextAllowed.toISOString()}`)
      }
    }

    const previous = db
      .prepare(
        'SELECT weight_kg, week_number FROM weekly_checkins WHERE user_id = ? ORDER BY week_number DESC LIMIT 1'
      )
      .get(data.user_id) as { weight_kg: number; week_number: number } | undefined

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
      user.goal as string
    )

    const weekNumber = (previous?.week_number ?? 0) + 1

    const result = db
      .prepare(
        `INSERT INTO weekly_checkins (
          user_id, week_number, check_in_date, weight_kg,
          waist_cm, chest_cm, hip_cm, arm_cm, thigh_cm,
          training_adherence, diet_adherence, energy_level,
          sleep_quality, stress_level, notes, adjustments
        ) VALUES (
          @user_id, @week_number, @check_in_date, @weight_kg,
          @waist_cm, @chest_cm, @hip_cm, @arm_cm, @thigh_cm,
          @training_adherence, @diet_adherence, @energy_level,
          @sleep_quality, @stress_level, @notes, @adjustments
        )`
      )
      .run(namedParams({
        ...data,
        week_number: weekNumber,
        check_in_date: data.check_in_date ?? new Date().toLocaleDateString('en-CA'),
        adjustments: JSON.stringify(adjustments)
      }))

    if (adjustments.calories_delta !== 0 && dietPlan) {
      const newCalories = Math.max(1200, (dietPlan.calories_target as number) + adjustments.calories_delta)
      // Fixed macros: protein 2.3g/kg, fat 0.9g/kg; carbs fill the rest
      const weightKg = user.weight_kg as number
      const protein_g = Math.round(weightKg * 2.3)
      const fat_g = Math.round(weightKg * 0.9)
      const carbs_g = Math.max(0, Math.round((newCalories - protein_g * 4 - fat_g * 9) / 4))
      // Scale existing meals proportionally
      const currentPlanRow = db
        .prepare('SELECT meals FROM diet_plans WHERE user_id=? ORDER BY id DESC LIMIT 1')
        .get(data.user_id) as { meals: string } | undefined
      let mealsJson = currentPlanRow?.meals ?? '[]'
      try {
        const ratio = newCalories / (dietPlan.calories_target as number)
        const existingMeals = JSON.parse(mealsJson) as Array<Record<string, unknown>>
        const scaledMeals = existingMeals.map((m) => ({
          ...m,
          calories: Math.round((m.calories as number) * ratio),
          protein_g: Math.round((m.protein_g as number) * ratio),
          carbs_g: Math.round((m.carbs_g as number) * ratio),
          fat_g: Math.round((m.fat_g as number) * ratio),
        }))
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

  ipcMain.handle('checkin:nextAllowed', (_event, userId: number) => {
    const db = getDb()
    const last = db
      .prepare('SELECT check_in_date FROM weekly_checkins WHERE user_id = ? ORDER BY id DESC LIMIT 1')
      .get(userId) as { check_in_date: string } | null | undefined
    if (!last) return null
    const s = readCheckinSettings(db)
    const nextAllowed = getNextCheckinDate(last.check_in_date, s.scheduleType, s.checkinDay, s.biweekly, s.intervalDays)
    return nextAllowed.toISOString()
  })

  ipcMain.handle('checkin:history', (_event, userId: number) => {
    const db = getDb()
    const rows = db
      .prepare('SELECT * FROM weekly_checkins WHERE user_id = ? ORDER BY week_number DESC')
      .all(userId) as Record<string, unknown>[]
    return rows.map((r) => ({ ...r, adjustments: JSON.parse(r.adjustments as string) }))
  })

  ipcMain.handle('checkin:latest', (_event, userId: number) => {
    const db = getDb()
    const row = db
      .prepare('SELECT * FROM weekly_checkins WHERE user_id = ? ORDER BY week_number DESC LIMIT 1')
      .get(userId) as Record<string, unknown> | undefined
    if (!row) return null
    return { ...row, adjustments: JSON.parse(row.adjustments as string) }
  })

  ipcMain.handle('checkin:update', (_event, checkinId: number, data: Record<string, unknown>) => {
    const db = getDb()
    const existing = db.prepare('SELECT * FROM weekly_checkins WHERE id=?').get(checkinId) as Record<string, unknown> | undefined
    if (!existing) throw new Error('Check-in not found')

    const user = db.prepare('SELECT * FROM users WHERE id=?').get(existing.user_id) as Record<string, unknown>
    const dietPlan = db.prepare('SELECT calories_target FROM diet_plans WHERE user_id=? ORDER BY id DESC LIMIT 1').get(existing.user_id) as { calories_target: number } | undefined

    const previous = db.prepare(
      'SELECT weight_kg, week_number FROM weekly_checkins WHERE user_id=? AND id<? ORDER BY id DESC LIMIT 1'
    ).get([existing.user_id, checkinId]) as { weight_kg: number; week_number: number } | undefined

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
      user.goal as string
    )

    const allowed = new Set(['weight_kg', 'waist_cm', 'chest_cm', 'hip_cm', 'arm_cm', 'thigh_cm',
      'training_adherence', 'diet_adherence', 'energy_level', 'sleep_quality', 'stress_level', 'notes',
      'check_in_date'])
    // Only include allowed keys; convert undefined and NaN → null (SQLite rejects both)
    const updates: Array<[string, unknown]> = Object.entries(data)
      .filter(([k]) => allowed.has(k))
      .map(([k, v]) => {
        if (v === undefined || v === null) return [k, null]
        if (typeof v === 'number' && isNaN(v)) return [k, null]
        return [k, v]
      })
    if (!updates.length) throw new Error('No valid fields to update')
    const sql = `UPDATE weekly_checkins SET ${updates.map(([k]) => `${k}=?`).join(', ')}, adjustments=? WHERE id=?`
    db.prepare(sql).run([...updates.map(([, v]) => v), JSON.stringify(adjustments), checkinId])
    const saved = db.prepare('SELECT * FROM weekly_checkins WHERE id=?').get(checkinId) as Record<string, unknown>
    return { ...saved, adjustments: JSON.parse(saved.adjustments as string) }
  })

}
