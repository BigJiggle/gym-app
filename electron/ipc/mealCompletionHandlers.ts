import { IpcMain } from 'electron'
import { getDb } from '../database/db'

export function registerMealCompletionHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('meals:logCompletion', (_event, userId: number, date: string, mealIndex: number, mealName: string) => {
    const db = getDb()
    const result = db.prepare(`
      INSERT OR REPLACE INTO meal_completions (user_id, date, meal_index, meal_name, completed)
      VALUES (?, ?, ?, ?, 1)
    `).run([userId, date, mealIndex, mealName])
    // Return the persisted record so the store can use the real DB id
    return db.prepare('SELECT * FROM meal_completions WHERE id=?').get(result.lastInsertRowid)
  })

  ipcMain.handle('meals:unlogCompletion', (_event, userId: number, date: string, mealIndex: number) => {
    const db = getDb()
    db.prepare('DELETE FROM meal_completions WHERE user_id=? AND date=? AND meal_index=?')
      .run([userId, date, mealIndex])
    return { success: true }
  })

  ipcMain.handle('meals:getCompletions', (_event, userId: number, startDate: string, endDate: string) => {
    const db = getDb()
    return db.prepare(
      'SELECT * FROM meal_completions WHERE user_id=? AND date>=? AND date<=? ORDER BY date ASC, meal_index ASC'
    ).all([userId, startDate, endDate])
  })
}
