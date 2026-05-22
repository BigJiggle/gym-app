import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // User
  createUser: (data: unknown) => ipcRenderer.invoke('user:create', data),
  getUser: () => ipcRenderer.invoke('user:get'),
  updateUser: (data: unknown) => ipcRenderer.invoke('user:update', data),

  // Training plans
  generateTrainingPlan: (userId: number) => ipcRenderer.invoke('plan:generateTraining', userId),
  getTrainingPlan: (userId: number) => ipcRenderer.invoke('plan:getTraining', userId),
  getTrainingSessions: (planId: number, weekNumber: number) =>
    ipcRenderer.invoke('plan:getSessions', planId, weekNumber),

  // Diet plans
  generateDietPlan: (userId: number) => ipcRenderer.invoke('plan:generateDiet', userId),
  getDietPlan: (userId: number) => ipcRenderer.invoke('plan:getDiet', userId),
  swapMeal: (userId: number, mealIndex: number, newFoods: string[]) =>
    ipcRenderer.invoke('plan:swapMeal', userId, mealIndex, newFoods),

  // Check-ins
  submitCheckin: (data: unknown) => ipcRenderer.invoke('checkin:submit', data),
  updateCheckin: (checkinId: number, data: unknown) => ipcRenderer.invoke('checkin:update', checkinId, data),
  getCheckinHistory: (userId: number) => ipcRenderer.invoke('checkin:history', userId),
  getLatestCheckin: (userId: number) => ipcRenderer.invoke('checkin:latest', userId),

  // Progress
  getProgressEntries: (userId: number) => ipcRenderer.invoke('progress:entries', userId),
  addProgressPhoto: (data: unknown) => ipcRenderer.invoke('progress:addPhoto', data),
  getProgressPhotos: (userId: number) => ipcRenderer.invoke('progress:photos', userId),

  // Settings
  getSetting: (key: string) => ipcRenderer.invoke('settings:get', key),
  setSetting: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value),
  getAllSettings: () => ipcRenderer.invoke('settings:getAll'),

  // Workout
  startWorkout: (userId: number, sessionId: number | null) => ipcRenderer.invoke('workout:start', userId, sessionId),
  logSet: (workoutLogId: number, data: unknown) => ipcRenderer.invoke('workout:logSet', workoutLogId, data),
  completeWorkout: (workoutLogId: number, notes?: string) => ipcRenderer.invoke('workout:complete', workoutLogId, notes),
  skipWorkout: (workoutLogId: number) => ipcRenderer.invoke('workout:skip', workoutLogId),
  getActiveWorkout: (userId: number) => ipcRenderer.invoke('workout:active', userId),
  getWorkoutHistory: (userId: number, limit?: number) => ipcRenderer.invoke('workout:history', userId, limit),
  getWorkoutSummary: (workoutLogId: number) => ipcRenderer.invoke('workout:sessionSummary', workoutLogId),

  // Check-in scheduling
  getNextCheckinDate: (userId: number) => ipcRenderer.invoke('checkin:nextAllowed', userId),
  submitMissedCheckin: (data: unknown) => ipcRenderer.invoke('checkin:submitMissed', data),

  // Meal completion tracking
  logMealCompletion: (userId: number, date: string, mealIndex: number, mealName: string) =>
    ipcRenderer.invoke('meals:logCompletion', userId, date, mealIndex, mealName),
  unlogMealCompletion: (userId: number, date: string, mealIndex: number) =>
    ipcRenderer.invoke('meals:unlogCompletion', userId, date, mealIndex),
  getMealCompletions: (userId: number, startDate: string, endDate: string) =>
    ipcRenderer.invoke('meals:getCompletions', userId, startDate, endDate),

  // Session & plan management
  updateSession: (sessionId: number, exercises: unknown[]) =>
    ipcRenderer.invoke('plan:updateSession', sessionId, exercises),
  getExerciseLibrary: () => ipcRenderer.invoke('plan:getExerciseLibrary'),
  regeneratePlans: (userId: number) => ipcRenderer.invoke('plan:regenerateAll', userId),

  // Workout log editing
  updateWorkoutSet: (setId: number, data: unknown) =>
    ipcRenderer.invoke('workout:updateSet', setId, data),
  deleteWorkoutSet: (setId: number) => ipcRenderer.invoke('workout:deleteSet', setId),
  saveSetsBatch: (workoutLogId: number, sets: unknown[]) =>
    ipcRenderer.invoke('workout:saveSetsBatch', workoutLogId, sets),
  cancelWorkout: (workoutLogId: number) => ipcRenderer.invoke('workout:cancelWorkout', workoutLogId),

  // Reset all user data (clears user and all cascaded data)
  resetAllData: () => ipcRenderer.invoke('user:resetAll'),

  // Startup plan refresh — auto-transitions shows, updates plans based on weeks_out
  startupRefresh: (userId: number) => ipcRenderer.invoke('plan:startupRefresh', userId),

  // Shows (multiple competitions)
  listShows: (userId: number) => ipcRenderer.invoke('shows:list', userId),
  addShow: (userId: number, data: unknown) => ipcRenderer.invoke('shows:add', userId, data),
  updateShow: (showId: number, data: unknown) => ipcRenderer.invoke('shows:update', showId, data),
  deleteShow: (showId: number) => ipcRenderer.invoke('shows:delete', showId),
  cancelShow: (showId: number) => ipcRenderer.invoke('shows:cancelShow', showId),
  setPrimaryShow: (showId: number, userId: number) => ipcRenderer.invoke('shows:setPrimary', showId, userId),

  // Shell
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),

  // AI-powered plan operations
  recalculateMacros: (userId: number) => ipcRenderer.invoke('plan:recalculateMacros', userId),
  refineDietWithPrompt: (userId: number, prompt: string) => ipcRenderer.invoke('plan:refineDietWithPrompt', userId, prompt),
  refineWorkoutWithPrompt: (userId: number, prompt: string) => ipcRenderer.invoke('plan:refineWorkoutWithPrompt', userId, prompt),
  applyAIRequest: (userId: number, request: string, domain: 'training' | 'diet' | 'general') => ipcRenderer.invoke('plan:applyAIRequest', userId, request, domain),

  // Off-season goal selection (after show cancellation)
  selectOffSeasonGoal: (userId: number, goal: string) => ipcRenderer.invoke('plan:selectOffSeasonGoal', userId, goal),
  previewGoalCalories: (userId: number) => ipcRenderer.invoke('plan:previewGoalCalories', userId),
}

contextBridge.exposeInMainWorld('api', api)
