import { IpcMain } from 'electron'
import { getDb } from '../database/db'

export function registerWorkoutHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('workout:start', (_event, userId: number, sessionId: number | null) => {
    const db = getDb()
    // Use Node's local date (not SQLite date('now') which is UTC and shifts overnight workouts)
    const localDate = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD in system local timezone
    const result = db
      .prepare(`INSERT INTO workout_logs (user_id, session_id, date) VALUES (?, ?, ?)`)
      .run([userId, sessionId ?? null, localDate])
    return db.prepare('SELECT * FROM workout_logs WHERE id = ?').get(result.lastInsertRowid)
  })

  ipcMain.handle('workout:logSet', (_event, workoutLogId: number, data: Record<string, unknown>) => {
    const db = getDb()
    const result = db
      .prepare(`
        INSERT INTO exercise_logs
          (workout_log_id, exercise_name, set_number, reps_prescribed, reps_actual, weight_kg, rir_actual, skipped, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run([
        workoutLogId,
        data.exercise_name as string,
        data.set_number as number,
        (data.reps_prescribed as number | null) ?? null,
        (data.reps_actual as number | null) ?? null,
        (data.weight_kg as number | null) ?? null,
        (data.rir_actual as number | null) ?? null,
        data.skipped ? 1 : 0,
        (data.notes as string | null) ?? null
      ])
    return db.prepare('SELECT * FROM exercise_logs WHERE id = ?').get(result.lastInsertRowid)
  })

  ipcMain.handle('workout:complete', (_event, workoutLogId: number, notes?: string) => {
    const db = getDb()
    db.prepare(`UPDATE workout_logs SET status='completed', ended_at=datetime('now'), notes=? WHERE id=?`)
      .run([notes ?? null, workoutLogId])
    return db.prepare('SELECT * FROM workout_logs WHERE id = ?').get(workoutLogId)
  })

  ipcMain.handle('workout:skip', (_event, workoutLogId: number) => {
    const db = getDb()
    db.prepare(`UPDATE workout_logs SET status='skipped', ended_at=datetime('now') WHERE id=?`)
      .run([workoutLogId])
    return db.prepare('SELECT * FROM workout_logs WHERE id = ?').get(workoutLogId)
  })

  ipcMain.handle('workout:active', (_event, userId: number) => {
    const db = getDb()
    const log = db
      .prepare(`SELECT * FROM workout_logs WHERE user_id=? AND status='in_progress' ORDER BY id DESC LIMIT 1`)
      .get(userId) as Record<string, unknown> | null
    if (!log) return null
    const sets = db.prepare('SELECT * FROM exercise_logs WHERE workout_log_id=?').all([log.id as number]) as Record<string, unknown>[]
    return { ...log, sets: sets.map(parseLog) }
  })

  ipcMain.handle('workout:history', (_event, userId: number, limitArg?: number | null) => {
    const db = getDb()
    const limit = (typeof limitArg === 'number' && limitArg > 0) ? limitArg : 200
    const logs = db
      .prepare(`SELECT * FROM workout_logs WHERE user_id=? AND status != 'in_progress' ORDER BY id DESC LIMIT ?`)
      .all([userId, limit]) as Record<string, unknown>[]
    return logs.map((log) => {
      const sets = db.prepare('SELECT * FROM exercise_logs WHERE workout_log_id=?').all([log.id as number]) as Record<string, unknown>[]
      return { ...log, sets: sets.map(parseLog) }
    })
  })

  ipcMain.handle('workout:sessionSummary', (_event, workoutLogId: number) => {
    const db = getDb()
    const log = db.prepare('SELECT * FROM workout_logs WHERE id=?').get(workoutLogId) as Record<string, unknown>
    const sets = db.prepare('SELECT * FROM exercise_logs WHERE workout_log_id=?').all(workoutLogId) as Record<string, unknown>[]
    return { ...log, sets: sets.map(parseLog) }
  })

  ipcMain.handle('workout:updateSet', (_event, setId: number, data: Record<string, unknown>) => {
    const db = getDb()
    const allowed = ['reps_actual', 'weight_kg', 'rir_actual', 'notes', 'skipped']
    const updates = Object.entries(data).filter(([k]) => allowed.includes(k))
    if (!updates.length) return null
    const values = updates.map(([k, v]) => k === 'skipped' ? (v ? 1 : 0) : v as string | number | null)
    const sql = `UPDATE exercise_logs SET ${updates.map(([k]) => `${k}=?`).join(', ')} WHERE id=?`
    db.prepare(sql).run([...values, setId])
    return db.prepare('SELECT * FROM exercise_logs WHERE id=?').get([setId])
  })

  ipcMain.handle('workout:deleteSet', (_event, setId: number) => {
    const db = getDb()
    db.prepare('DELETE FROM exercise_logs WHERE id=?').run([setId])
    return { success: true }
  })

  // Bulk-save all sets atomically at workout completion — avoids race conditions from fire-and-forget
  ipcMain.handle('workout:saveSetsBatch', (_event, workoutLogId: number, sets: Record<string, unknown>[]) => {
    const db = getDb()
    db.prepare('DELETE FROM exercise_logs WHERE workout_log_id=?').run([workoutLogId])
    const stmt = db.prepare(`
      INSERT INTO exercise_logs
        (workout_log_id, exercise_name, set_number, reps_prescribed, reps_actual, weight_kg, rir_actual, skipped, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    for (const s of sets) {
      stmt.run([
        workoutLogId,
        s.exercise_name as string,
        s.set_number as number,
        (s.reps_prescribed as number | null) ?? null,
        (s.reps_actual as number | null) ?? null,
        (s.weight_kg as number | null) ?? null,
        (s.rir_actual as number | null) ?? null,
        s.skipped ? 1 : 0,
        (s.notes as string | null) ?? null,
      ])
    }
    return { count: sets.length }
  })

  // Cancel (abort) an in-progress workout — deletes the log entirely, no history entry
  ipcMain.handle('workout:cancelWorkout', (_event, workoutLogId: number) => {
    const db = getDb()
    db.prepare('DELETE FROM workout_logs WHERE id=?').run([workoutLogId])
    return { success: true }
  })
}

function parseLog(row: Record<string, unknown>) {
  return { ...row, skipped: row.skipped === 1 }
}
