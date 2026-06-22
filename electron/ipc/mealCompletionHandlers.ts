import { IpcMain } from 'electron'
import { getDb } from '../database/db'

// Clears meal completions that no longer map to a valid meal after a diet plan
// is regenerated with a different meal_count. Completions are keyed by positional
// meal_index, so when meal_count shrinks (e.g. 6→4), completions at index 4/5
// become orphans that the Diet page can't render but still inflate "meals eaten"
// and adherence counts. We only purge today and future dates (the editable window);
// historical days are left untouched as a record of what was logged at the time.
export function clearOrphanedMealCompletions(
  db: ReturnType<typeof getDb>,
  userId: number,
  newMealCount: number
): void {
  const today = new Date().toLocaleDateString('en-CA')
  db.prepare(
    'DELETE FROM meal_completions WHERE user_id=? AND date>=? AND meal_index>=?'
  ).run([userId, today, newMealCount])
}

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
