import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { join } from 'path'
import { initDb, closeDb } from './database/db'
import { registerUserHandlers } from './ipc/userHandlers'
import { registerPlanHandlers } from './ipc/planHandlers'
import { registerCheckinHandlers } from './ipc/checkinHandlers'
import { registerProgressHandlers } from './ipc/progressHandlers'
import { registerSettingsHandlers } from './ipc/settingsHandlers'
import { registerWorkoutHandlers } from './ipc/workoutHandlers'
import { registerMealCompletionHandlers } from './ipc/mealCompletionHandlers'
import { registerShowHandlers } from './ipc/showHandlers'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#111827',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerAllHandlers(): void {
  registerUserHandlers(ipcMain)
  registerPlanHandlers(ipcMain)
  registerCheckinHandlers(ipcMain)
  registerProgressHandlers(ipcMain)
  registerSettingsHandlers(ipcMain)
  registerWorkoutHandlers(ipcMain)
  registerMealCompletionHandlers(ipcMain)
  registerShowHandlers(ipcMain)
  ipcMain.handle('shell:openExternal', (_event, url: string) => shell.openExternal(url))
}

app.whenReady().then(() => {
  initDb()          // fully initialize DB before window or IPC handlers can fire
  registerAllHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  closeDb()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  closeDb()
})
