import { create } from 'zustand'
import type { TrainingPlan, DietPlan, CheckIn, ProgressEntry, WorkoutLog, ExerciseLogEntry, MealCompletion } from '../types'

interface PlanStore {
  trainingPlan: TrainingPlan | null
  dietPlan: DietPlan | null
  checkinHistory: CheckIn[]
  latestCheckin: CheckIn | null
  progressEntries: ProgressEntry[]
  loading: boolean
  error: string | null
  activeWorkout: WorkoutLog | null
  workoutHistory: WorkoutLog[]
  mealCompletions: MealCompletion[]
  lastRefreshMessage: string | null

  loadTrainingPlan: (userId: number) => Promise<void>
  generateTrainingPlan: (userId: number) => Promise<void>
  loadDietPlan: (userId: number) => Promise<void>
  generateDietPlan: (userId: number) => Promise<void>
  loadCheckinHistory: (userId: number) => Promise<void>
  submitCheckin: (data: Parameters<Window['api']['submitCheckin']>[0]) => Promise<CheckIn>
  loadProgressEntries: (userId: number) => Promise<void>
  startWorkout: (userId: number, sessionId: number | null) => Promise<WorkoutLog>
  logSet: (workoutLogId: number, data: Omit<ExerciseLogEntry, 'id' | 'workout_log_id'>) => Promise<ExerciseLogEntry>
  completeWorkout: (workoutLogId: number, notes?: string) => Promise<void>
  skipWorkout: (workoutLogId: number) => Promise<void>
  loadActiveWorkout: (userId: number) => Promise<void>
  loadWorkoutHistory: (userId: number) => Promise<void>
  loadMealCompletions: (userId: number, startDate: string, endDate: string) => Promise<void>
  logMealCompletion: (userId: number, date: string, mealIndex: number, mealName: string) => Promise<void>
  unlogMealCompletion: (userId: number, date: string, mealIndex: number) => Promise<void>
  recalculateMacros: (userId: number) => Promise<void>
  startupRefresh: (userId: number) => Promise<void>
  clearRefreshMessage: () => void
}

export const usePlanStore = create<PlanStore>((set) => ({
  trainingPlan: null,
  dietPlan: null,
  checkinHistory: [],
  latestCheckin: null,
  progressEntries: [],
  loading: false,
  error: null,
  activeWorkout: null,
  workoutHistory: [],
  mealCompletions: [],
  lastRefreshMessage: null,

  loadTrainingPlan: async (userId) => {
    const plan = await window.api.getTrainingPlan(userId)
    set({ trainingPlan: plan })
  },

  generateTrainingPlan: async (userId) => {
    set({ loading: true })
    try {
      const plan = await window.api.generateTrainingPlan(userId)
      set({ trainingPlan: plan, loading: false })
    } catch (e) {
      set({ error: String(e), loading: false })
    }
  },

  loadDietPlan: async (userId) => {
    const plan = await window.api.getDietPlan(userId)
    set({ dietPlan: plan })
  },

  generateDietPlan: async (userId) => {
    set({ loading: true })
    try {
      const plan = await window.api.generateDietPlan(userId)
      set({ dietPlan: plan, loading: false })
    } catch (e) {
      set({ error: String(e), loading: false })
    }
  },

  loadCheckinHistory: async (userId) => {
    const [history, latest] = await Promise.all([
      window.api.getCheckinHistory(userId),
      window.api.getLatestCheckin(userId)
    ])
    set({ checkinHistory: history, latestCheckin: latest })
  },

  submitCheckin: async (data) => {
    set({ loading: true })
    try {
      const checkin = await window.api.submitCheckin(data)
      set((s) => ({
        checkinHistory: [checkin, ...s.checkinHistory],
        latestCheckin: checkin,
        loading: false
      }))
      // Cascade: reload diet plan since macros were recalculated by the backend
      try {
        const userId = (data as any).user_id
        const updatedDiet = await window.api.getDietPlan(userId)
        if (updatedDiet) set({ dietPlan: updatedDiet })
      } catch { /* non-fatal */ }
      return checkin
    } catch (e) {
      set({ error: String(e), loading: false })
      throw e
    }
  },

  loadProgressEntries: async (userId) => {
    const entries = await window.api.getProgressEntries(userId)
    set({ progressEntries: entries })
  },

  loadActiveWorkout: async (userId) => {
    const w = await window.api.getActiveWorkout(userId)
    set({ activeWorkout: w })
  },

  startWorkout: async (userId, sessionId) => {
    const w = await window.api.startWorkout(userId, sessionId)
    set({ activeWorkout: w })
    return w
  },

  logSet: async (workoutLogId, data) => {
    const result = await window.api.logSet(workoutLogId, data)
    // Keep activeWorkout.sets in sync so the UI reflects logged sets without
    // requiring a full reload. Insert if new, replace if the user edited a set.
    set((s) => {
      if (!s.activeWorkout) return s
      const exists = s.activeWorkout.sets.some((sv) => sv.id === result.id)
      const sets = exists
        ? s.activeWorkout.sets.map((sv) => (sv.id === result.id ? result : sv))
        : [...s.activeWorkout.sets, result]
      return { activeWorkout: { ...s.activeWorkout, sets } }
    })
    return result
  },

  completeWorkout: async (workoutLogId, notes) => {
    await window.api.completeWorkout(workoutLogId, notes)
    set({ activeWorkout: null })
  },

  skipWorkout: async (workoutLogId) => {
    await window.api.skipWorkout(workoutLogId)
    set({ activeWorkout: null })
  },

  loadWorkoutHistory: async (userId) => {
    const history = await window.api.getWorkoutHistory(userId)
    set({ workoutHistory: history })
  },

  loadMealCompletions: async (userId, startDate, endDate) => {
    const completions = await window.api.getMealCompletions(userId, startDate, endDate)
    set({ mealCompletions: completions })
  },

  logMealCompletion: async (userId, date, mealIndex, mealName) => {
    // Handler now returns the persisted DB record — use the real id so there
    // are no duplicate-key collisions if the same meal is logged twice quickly.
    const record = await window.api.logMealCompletion(userId, date, mealIndex, mealName) as MealCompletion
    set((s) => ({
      mealCompletions: [
        ...s.mealCompletions.filter((c) => !(c.date === date && c.meal_index === mealIndex)),
        record
      ]
    }))
  },

  unlogMealCompletion: async (userId, date, mealIndex) => {
    await window.api.unlogMealCompletion(userId, date, mealIndex)
    set((s) => ({
      mealCompletions: s.mealCompletions.filter(
        (c) => !(c.date === date && c.meal_index === mealIndex)
      )
    }))
  },

  recalculateMacros: async (userId) => {
    set({ loading: true })
    try {
      const plan = await window.api.recalculateMacros(userId)
      set({ dietPlan: plan, loading: false })
    } catch (e) {
      set({ error: String(e), loading: false })
    }
  },

  startupRefresh: async (userId) => {
    try {
      const result = await window.api.startupRefresh(userId) as {
        showTransitioned: boolean
        trainingUpdated: boolean
        dietUpdated: boolean
        message: string | null
      }
      if (result.trainingUpdated) {
        const training = await window.api.getTrainingPlan(userId)
        set({ trainingPlan: training })
      }
      if (result.dietUpdated) {
        const diet = await window.api.getDietPlan(userId)
        set({ dietPlan: diet })
      }
      if (result.message) {
        set({ lastRefreshMessage: result.message })
      }
    } catch (e) {
      console.error('[startupRefresh] failed:', e)
    }
  },

  clearRefreshMessage: () => set({ lastRefreshMessage: null }),
}))
