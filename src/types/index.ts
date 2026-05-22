export interface User {
  id: number
  name: string
  age: number
  sex: 'male' | 'female' | 'other'
  height_cm: number
  weight_kg: number
  body_fat_pct?: number
  training_experience_years: number
  competition_history: string[]
  division?: string
  show_date?: string
  goal: 'cut' | 'maintain' | 'recomp' | 'bulk'
  dietary_preference: 'omnivore' | 'vegetarian' | 'vegan'
  dietary_restrictions: string[]
  training_frequency: number
  equipment_access: 'full_gym' | 'home' | 'minimal'
  activity_level: 'sedentary' | 'light' | 'moderate' | 'active'
  recovery_notes?: string
  is_natural: boolean
  meal_count: number
  include_snacks: boolean
  split_preference: 'auto' | 'ppl' | 'upper_lower' | 'arnold' | 'bro' | 'full_body'
  food_preferences: string[]
  food_exclusions: string[]
  cooking_time_pref: 'quick' | 'medium' | 'chef'
  meal_prep_style: 'daily' | 'batch' | 'mixed'
  culture_pref: 'any' | 'mexican' | 'indian' | 'mediterranean' | 'asian' | 'west_african' | 'japanese' | 'korean' | 'middle_eastern'
  exercises_per_session: number
  sets_per_exercise: number
  created_at: string
  updated_at: string
}

export type CreateUserInput = Omit<User, 'id' | 'created_at' | 'updated_at'>

export interface Exercise {
  name: string
  sets: number
  reps: string
  rir: number
  notes?: string
}

export interface TrainingSession {
  id?: number
  plan_id?: number
  week_number: number
  day_of_week: number
  session_name: string
  exercises: Exercise[]
}

export interface TrainingPlan {
  id: number
  user_id: number
  name: string
  weeks_total: number
  current_week: number
  phase: 'hypertrophy' | 'strength' | 'peak' | 'deload'
  created_at: string
  sessions: TrainingSession[]
}

export interface Meal {
  name: string
  time: string
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  foods: string[]
}

export interface DietPlan {
  id: number
  user_id: number
  name: string
  calories_target: number
  protein_g: number
  carbs_g: number
  fat_g: number
  meal_count: number
  meals: Meal[]
  phase: 'deficit' | 'maintenance' | 'surplus'
  created_at: string
}

export interface CheckinAdjustments {
  calories_delta: number
  cardio_change: string
  training_volume_change: string
  notes: string[]
}

export interface CheckIn {
  id: number
  user_id: number
  week_number: number
  check_in_date: string
  weight_kg: number
  waist_cm?: number
  chest_cm?: number
  hip_cm?: number
  arm_cm?: number
  thigh_cm?: number
  training_adherence: number
  diet_adherence: number
  energy_level: number
  sleep_quality: number
  stress_level: number
  notes?: string
  adjustments: CheckinAdjustments
  schedule_type?: 'day' | 'interval'  // stored at submit time; undefined on legacy rows
  interval_days?: number               // stored at submit time; undefined on legacy rows
}

export type CreateCheckinInput = Omit<CheckIn, 'id' | 'week_number' | 'adjustments'>

export interface ProgressEntry {
  week_number: number
  check_in_date: string
  weight_kg: number
  waist_cm?: number
  chest_cm?: number
  hip_cm?: number
  arm_cm?: number
  thigh_cm?: number
}

export interface ProgressPhoto {
  id: number
  user_id: number
  check_in_id?: number
  file_path: string
  pose: 'front' | 'back' | 'side' | 'custom'
  taken_at: string
}

export interface AppSettings {
  theme: 'dark' | 'light'
  units: 'metric' | 'imperial'
  notifications_enabled: string
  checkin_day: string
  checkin_interval_days?: string
  checkin_schedule_type?: string   // 'day' | 'interval'
  checkin_biweekly?: string        // 'true' | 'false' (day-based mode only)
  ui_zoom?: string
  theme_name?: string
  claude_api_key?: string
}

export interface WorkoutLog {
  id: number
  user_id: number
  session_id: number | null
  date: string
  status: 'in_progress' | 'completed' | 'skipped'
  started_at: string
  ended_at: string | null
  notes: string | null
  sets: ExerciseLogEntry[]
}

export interface ExerciseLogEntry {
  id: number
  workout_log_id: number
  exercise_name: string
  set_number: number
  reps_prescribed: string | null
  reps_actual: number | null
  weight_kg: number | null
  rir_actual: number | null
  skipped: boolean
  notes: string | null
}

export interface Show {
  id: number
  user_id: number
  name: string
  show_date: string
  division: string | null
  federation: string | null
  notes: string | null
  is_primary: number  // 0 | 1
  created_at: string
}

export interface ExerciseLogUpdate {
  reps_actual?: number
  weight_kg?: number
  rir_actual?: number
  notes?: string
}

export interface ExerciseLibraryItem {
  name: string
  muscle: string
  muscleGroup: string
  category: string
  equipment: string[]
  isCompound: boolean
  tutorialQuery?: string
}

export interface MealCompletion {
  id: number
  user_id: number
  date: string
  meal_index: number
  meal_name: string
  completed: number
  logged_at: string
}

// Window API type declaration
declare global {
  interface Window {
    api: {
      createUser: (data: CreateUserInput) => Promise<User>
      getUser: () => Promise<User | null>
      updateUser: (data: Partial<User> & { id: number }) => Promise<User>
      generateTrainingPlan: (userId: number) => Promise<TrainingPlan>
      getTrainingPlan: (userId: number) => Promise<TrainingPlan | null>
      getTrainingSessions: (planId: number, weekNumber: number) => Promise<TrainingSession[]>
      generateDietPlan: (userId: number) => Promise<DietPlan>
      getDietPlan: (userId: number) => Promise<DietPlan | null>
      swapMeal: (userId: number, mealIndex: number, newFoods: string[]) => Promise<DietPlan>
      submitCheckin: (data: CreateCheckinInput) => Promise<CheckIn>
      updateCheckin: (id: number, data: Partial<CheckIn>) => Promise<CheckIn>
      getCheckinHistory: (userId: number) => Promise<CheckIn[]>
      getLatestCheckin: (userId: number) => Promise<CheckIn | null>
      getProgressEntries: (userId: number) => Promise<ProgressEntry[]>
      addProgressPhoto: (data: Omit<ProgressPhoto, 'id' | 'taken_at'>) => Promise<ProgressPhoto>
      getProgressPhotos: (userId: number) => Promise<ProgressPhoto[]>
      getSetting: (key: string) => Promise<string | null>
      setSetting: (key: string, value: string) => Promise<void>
      getAllSettings: () => Promise<AppSettings>
      startWorkout: (userId: number, sessionId: number | null) => Promise<WorkoutLog>
      logSet: (workoutLogId: number, data: Omit<ExerciseLogEntry, 'id' | 'workout_log_id'>) => Promise<ExerciseLogEntry>
      completeWorkout: (workoutLogId: number, notes?: string) => Promise<WorkoutLog>
      skipWorkout: (workoutLogId: number) => Promise<WorkoutLog>
      getActiveWorkout: (userId: number) => Promise<WorkoutLog | null>
      getWorkoutHistory: (userId: number, limit?: number) => Promise<WorkoutLog[]>
      getWorkoutSummary: (workoutLogId: number) => Promise<WorkoutLog>
      getNextCheckinDate: (userId: number) => Promise<string | null>
      submitMissedCheckin: (data: CreateCheckinInput & { check_in_date: string }) => Promise<CheckIn>
      logMealCompletion: (userId: number, date: string, mealIndex: number, mealName: string) => Promise<void>
      unlogMealCompletion: (userId: number, date: string, mealIndex: number) => Promise<void>
      getMealCompletions: (userId: number, startDate: string, endDate: string) => Promise<MealCompletion[]>
      openExternal: (url: string) => Promise<void>
      updateSession: (sessionId: number, exercises: unknown[]) => Promise<unknown>
      getExerciseLibrary: () => Promise<ExerciseLibraryItem[]>
      updateWorkoutSet: (setId: number, data: ExerciseLogUpdate) => Promise<unknown>
      deleteWorkoutSet: (setId: number) => Promise<{ success: boolean }>
      regeneratePlans: (userId: number) => Promise<{ trainingDone: boolean; dietDone: boolean }>
      recalculateMacros: (userId: number) => Promise<DietPlan>
      refineDietWithPrompt: (userId: number, prompt: string) => Promise<DietPlan>
      refineWorkoutWithPrompt: (userId: number, prompt: string) => Promise<TrainingPlan>
      applyAIRequest: (userId: number, request: string, domain: 'training' | 'diet' | 'general') => Promise<{
        action: 'update' | 'reject' | 'explain' | 'refine_workout' | 'refine_diet'
        message: string
        trainingPlan?: TrainingPlan | null
        dietPlan?: DietPlan | null
        updatedUser?: User
      }>
      // Shows
      listShows: (userId: number) => Promise<Show[]>
      addShow: (userId: number, data: Partial<Show>) => Promise<Show[]>
      updateShow: (showId: number, data: Partial<Show>) => Promise<Show[]>
      deleteShow: (showId: number) => Promise<{ shows: Show[]; message: string | null; needs_goal_selection?: boolean } | Show[]>
      cancelShow: (showId: number) => Promise<{ shows: Show[]; transitionType: string; nextShowName: string | null; message: string | null; needs_goal_selection?: boolean }>
      setPrimaryShow: (showId: number, userId: number) => Promise<Show[]>
      // Startup & plan refresh
      startupRefresh: (userId: number) => Promise<{ showTransitioned: boolean; trainingUpdated: boolean; dietUpdated: boolean; message: string | null }>
      // Workout batch operations
      saveSetsBatch: (workoutLogId: number, sets: unknown[]) => Promise<{ count: number }>
      cancelWorkout: (workoutLogId: number) => Promise<{ success: boolean }>
      // Data reset
      resetAllData: () => Promise<{ success: boolean }>
      // Off-season goal selection
      selectOffSeasonGoal: (userId: number, goal: string) => Promise<DietPlan>
      previewGoalCalories: (userId: number) => Promise<Record<string, number>>
    }
  }
}
