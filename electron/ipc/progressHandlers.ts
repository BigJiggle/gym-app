import { IpcMain } from 'electron'
import { getDb, namedParams } from '../database/db'

export function registerProgressHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('progress:entries', (_event, userId: number) => {
    const db = getDb()
    return db
      .prepare(
        `SELECT week_number, check_in_date, weight_kg, waist_cm, chest_cm, hip_cm, arm_cm, thigh_cm
         FROM weekly_checkins WHERE user_id = ? ORDER BY week_number ASC`
      )
      .all(userId)
  })

  ipcMain.handle('progress:addPhoto', (_event, data) => {
    const db = getDb()
    const result = db
      .prepare(
        `INSERT INTO progress_photos (user_id, check_in_id, file_path, pose)
         VALUES (@user_id, @check_in_id, @file_path, @pose)`
      )
      .run(namedParams(data))
    return db.prepare('SELECT * FROM progress_photos WHERE id = ?').get(result.lastInsertRowid)
  })

  ipcMain.handle('progress:photos', (_event, userId: number) => {
    const db = getDb()
    return db
      .prepare('SELECT * FROM progress_photos WHERE user_id = ? ORDER BY taken_at DESC')
      .all(userId)
  })
}
