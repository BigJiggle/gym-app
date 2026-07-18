export interface TrainingInput {
  training_frequency: number
  training_experience_years: number
  equipment_access: string
  division?: string
  weeks_out?: number
  goal: string
  split_preference?: string  // 'auto'|'ppl'|'upper_lower'|'arnold'|'bro'|'full_body'
  exercises_per_session?: number  // user preference for number of exercises per session
  sets_per_exercise?: number  // user preference — overrides default when set
  max_sets_per_exercise?: number  // hard cap across all exercises
  recovery_notes?: string  // injury/recovery context passed to generation
}

export interface Exercise {
  name: string
  sets: number
  reps: string
  rir: number
  notes?: string
}

export interface TrainingSession {
  day_of_week: number
  session_name: string
  exercises: Exercise[]
}

export interface TrainingPlan {
  name: string
  weeks_total: number
  phase: 'hypertrophy' | 'strength' | 'peak' | 'deload'
  sessions: TrainingSession[]
}

type EquipmentTier = 'full_gym' | 'home' | 'minimal'

const DAY_SCHEDULES: Record<number, number[]> = {
  2: [1, 4],
  3: [1, 3, 5],
  4: [1, 2, 4, 5],
  5: [1, 2, 3, 4, 5],
  6: [1, 2, 3, 4, 5, 6],
}

interface ExerciseLibraryEntry {
  name: string
  muscle: string
  muscleGroup: 'chest' | 'back' | 'shoulders' | 'triceps' | 'biceps' | 'quads' | 'hamstrings' | 'glutes' | 'calves' | 'core'
  category: 'push' | 'pull' | 'legs' | 'core' | 'arms'
  equipment: EquipmentTier[]
  isCompound: boolean
  tutorialQuery?: string
}

const EXERCISE_LIBRARY: ExerciseLibraryEntry[] = [
  // PUSH — Chest
  { name: 'Barbell Bench Press', muscle: 'chest', muscleGroup: 'chest', category: 'push', equipment: ['full_gym'], isCompound: true, tutorialQuery: 'barbell bench press proper form tutorial' },
  { name: 'Dumbbell Bench Press', muscle: 'chest', muscleGroup: 'chest', category: 'push', equipment: ['full_gym', 'home'], isCompound: true },
  { name: 'Incline Barbell Press', muscle: 'chest', muscleGroup: 'chest', category: 'push', equipment: ['full_gym'], isCompound: true, tutorialQuery: 'incline bench press proper form tutorial' },
  { name: 'Incline Dumbbell Press', muscle: 'chest', muscleGroup: 'chest', category: 'push', equipment: ['full_gym', 'home'], isCompound: true },
  { name: 'Cable Fly', muscle: 'chest', muscleGroup: 'chest', category: 'push', equipment: ['full_gym'], isCompound: false },
  { name: 'Dumbbell Fly', muscle: 'chest', muscleGroup: 'chest', category: 'push', equipment: ['full_gym', 'home'], isCompound: false },
  { name: 'Push-Up', muscle: 'chest', muscleGroup: 'chest', category: 'push', equipment: ['full_gym', 'home', 'minimal'], isCompound: true },
  { name: 'Decline Dumbbell Press', muscle: 'chest', muscleGroup: 'chest', category: 'push', equipment: ['full_gym', 'home'], isCompound: true },
  // PUSH — Chest additions
  { name: 'Machine Chest Press', muscle: 'chest', muscleGroup: 'chest', category: 'push', equipment: ['full_gym'], isCompound: true },
  { name: 'Pec Deck Fly', muscle: 'chest', muscleGroup: 'chest', category: 'push', equipment: ['full_gym'], isCompound: false },
  { name: 'Low Cable Fly', muscle: 'chest', muscleGroup: 'chest', category: 'push', equipment: ['full_gym'], isCompound: false },
  { name: 'Chest Dip', muscle: 'chest', muscleGroup: 'chest', category: 'push', equipment: ['full_gym', 'home'], isCompound: true },
  // PUSH — Shoulders
  { name: 'Overhead Press (Barbell)', muscle: 'shoulders', muscleGroup: 'shoulders', category: 'push', equipment: ['full_gym'], isCompound: true, tutorialQuery: 'overhead press OHP proper form tutorial' },
  { name: 'Dumbbell Shoulder Press', muscle: 'shoulders', muscleGroup: 'shoulders', category: 'push', equipment: ['full_gym', 'home'], isCompound: true },
  { name: 'Lateral Raise', muscle: 'shoulders', muscleGroup: 'shoulders', category: 'push', equipment: ['full_gym', 'home'], isCompound: false, tutorialQuery: 'dumbbell lateral raise proper form tutorial' },
  { name: 'Cable Lateral Raise', muscle: 'shoulders', muscleGroup: 'shoulders', category: 'push', equipment: ['full_gym'], isCompound: false },
  { name: 'Rear Delt Fly', muscle: 'shoulders', muscleGroup: 'shoulders', category: 'push', equipment: ['full_gym', 'home'], isCompound: false },
  { name: 'Face Pull', muscle: 'shoulders', muscleGroup: 'shoulders', category: 'push', equipment: ['full_gym'], isCompound: false, tutorialQuery: 'face pull rear delts proper form tutorial' },
  // PUSH — Shoulders additions
  { name: 'Arnold Press', muscle: 'shoulders', muscleGroup: 'shoulders', category: 'push', equipment: ['full_gym', 'home'], isCompound: true },
  { name: 'Pike Push-Up', muscle: 'shoulders', muscleGroup: 'shoulders', category: 'push', equipment: ['full_gym', 'home', 'minimal'], isCompound: true, tutorialQuery: 'pike push-up shoulders proper form tutorial' },
  { name: 'Cable Front Raise', muscle: 'shoulders', muscleGroup: 'shoulders', category: 'push', equipment: ['full_gym'], isCompound: false },
  { name: 'Machine Shoulder Press', muscle: 'shoulders', muscleGroup: 'shoulders', category: 'push', equipment: ['full_gym'], isCompound: true },
  { name: 'Upright Row', muscle: 'shoulders', muscleGroup: 'shoulders', category: 'push', equipment: ['full_gym'], isCompound: false },
  // PUSH — Triceps
  { name: 'Tricep Pushdown (Cable)', muscle: 'triceps', muscleGroup: 'triceps', category: 'push', equipment: ['full_gym'], isCompound: false, tutorialQuery: 'cable tricep pushdown proper form tutorial' },
  { name: 'Skull Crushers', muscle: 'triceps', muscleGroup: 'triceps', category: 'push', equipment: ['full_gym', 'home'], isCompound: false, tutorialQuery: 'skull crushers EZ bar proper form tutorial' },
  { name: 'Close Grip Bench Press', muscle: 'triceps', muscleGroup: 'triceps', category: 'push', equipment: ['full_gym'], isCompound: true },
  { name: 'Overhead Tricep Extension (DB)', muscle: 'triceps', muscleGroup: 'triceps', category: 'push', equipment: ['full_gym', 'home'], isCompound: false },
  { name: 'Diamond Push-Up', muscle: 'triceps', muscleGroup: 'triceps', category: 'push', equipment: ['full_gym', 'home', 'minimal'], isCompound: false },
  // PUSH — Triceps additions
  { name: 'Cable Tricep Kickback', muscle: 'triceps', muscleGroup: 'triceps', category: 'push', equipment: ['full_gym'], isCompound: false },
  { name: 'Rope Pushdown', muscle: 'triceps', muscleGroup: 'triceps', category: 'push', equipment: ['full_gym'], isCompound: false },
  { name: 'Tricep Dip (Bench)', muscle: 'triceps', muscleGroup: 'triceps', category: 'push', equipment: ['full_gym', 'home', 'minimal'], isCompound: false },
  // PULL — Back
  { name: 'Barbell Row', muscle: 'back', muscleGroup: 'back', category: 'pull', equipment: ['full_gym'], isCompound: true, tutorialQuery: 'barbell row proper form tutorial' },
  { name: 'Dumbbell Row', muscle: 'back', muscleGroup: 'back', category: 'pull', equipment: ['full_gym', 'home'], isCompound: true },
  { name: 'Lat Pulldown', muscle: 'back', muscleGroup: 'back', category: 'pull', equipment: ['full_gym'], isCompound: true, tutorialQuery: 'lat pulldown proper form tutorial' },
  { name: 'Pull-Up', muscle: 'back', muscleGroup: 'back', category: 'pull', equipment: ['full_gym', 'home'], isCompound: true, tutorialQuery: 'pull-up chin-up proper form tutorial' },
  { name: 'Cable Row (Seated)', muscle: 'back', muscleGroup: 'back', category: 'pull', equipment: ['full_gym'], isCompound: true, tutorialQuery: 'seated cable row proper form tutorial' },
  { name: 'T-Bar Row', muscle: 'back', muscleGroup: 'back', category: 'pull', equipment: ['full_gym'], isCompound: true },
  { name: 'Straight Arm Pulldown', muscle: 'back', muscleGroup: 'back', category: 'pull', equipment: ['full_gym'], isCompound: false },
  { name: 'Inverted Row', muscle: 'back', muscleGroup: 'back', category: 'pull', equipment: ['full_gym', 'home', 'minimal'], isCompound: true },
  // PULL — Back additions
  { name: 'Rack Pull', muscle: 'back', muscleGroup: 'back', category: 'pull', equipment: ['full_gym'], isCompound: true },
  { name: 'Conventional Deadlift', muscle: 'back', muscleGroup: 'back', category: 'pull', equipment: ['full_gym'], isCompound: true, tutorialQuery: 'conventional deadlift proper form tutorial' },
  { name: 'Chest Supported Row', muscle: 'back', muscleGroup: 'back', category: 'pull', equipment: ['full_gym'], isCompound: true },
  { name: 'Single Arm Cable Row', muscle: 'back', muscleGroup: 'back', category: 'pull', equipment: ['full_gym'], isCompound: false },
  { name: 'Wide Grip Pull-Up', muscle: 'back', muscleGroup: 'back', category: 'pull', equipment: ['full_gym', 'home'], isCompound: true },
  { name: 'Machine Row', muscle: 'back', muscleGroup: 'back', category: 'pull', equipment: ['full_gym'], isCompound: true },
  // PULL — Biceps
  { name: 'Barbell Curl', muscle: 'biceps', muscleGroup: 'biceps', category: 'pull', equipment: ['full_gym'], isCompound: false },
  { name: 'Dumbbell Curl', muscle: 'biceps', muscleGroup: 'biceps', category: 'pull', equipment: ['full_gym', 'home'], isCompound: false, tutorialQuery: 'dumbbell bicep curl proper form tutorial' },
  { name: 'Hammer Curl', muscle: 'biceps', muscleGroup: 'biceps', category: 'pull', equipment: ['full_gym', 'home'], isCompound: false },
  { name: 'Cable Curl', muscle: 'biceps', muscleGroup: 'biceps', category: 'pull', equipment: ['full_gym'], isCompound: false },
  { name: 'Incline Dumbbell Curl', muscle: 'biceps', muscleGroup: 'biceps', category: 'pull', equipment: ['full_gym', 'home'], isCompound: false },
  { name: 'Chin-Up (Bicep Focus)', muscle: 'biceps', muscleGroup: 'biceps', category: 'pull', equipment: ['full_gym', 'home', 'minimal'], isCompound: true, tutorialQuery: 'chin-up bicep focus proper form tutorial' },
  { name: 'Towel/Band Curl', muscle: 'biceps', muscleGroup: 'biceps', category: 'pull', equipment: ['full_gym', 'home', 'minimal'], isCompound: false },
  // PULL — Biceps additions
  { name: 'Preacher Curl', muscle: 'biceps', muscleGroup: 'biceps', category: 'pull', equipment: ['full_gym'], isCompound: false },
  { name: 'Concentration Curl', muscle: 'biceps', muscleGroup: 'biceps', category: 'pull', equipment: ['full_gym', 'home'], isCompound: false },
  { name: 'Spider Curl', muscle: 'biceps', muscleGroup: 'biceps', category: 'pull', equipment: ['full_gym'], isCompound: false },
  { name: 'Cable Hammer Curl', muscle: 'biceps', muscleGroup: 'biceps', category: 'pull', equipment: ['full_gym'], isCompound: false },
  { name: 'Reverse Curl', muscle: 'biceps', muscleGroup: 'biceps', category: 'pull', equipment: ['full_gym', 'home'], isCompound: false },
  // LEGS
  { name: 'Barbell Squat', muscle: 'quads', muscleGroup: 'quads', category: 'legs', equipment: ['full_gym'], isCompound: true, tutorialQuery: 'barbell squat proper form tutorial' },
  { name: 'Hack Squat', muscle: 'quads', muscleGroup: 'quads', category: 'legs', equipment: ['full_gym'], isCompound: true },
  { name: 'Leg Press', muscle: 'quads', muscleGroup: 'quads', category: 'legs', equipment: ['full_gym'], isCompound: true, tutorialQuery: 'leg press proper form tutorial foot placement' },
  { name: 'Leg Extension', muscle: 'quads', muscleGroup: 'quads', category: 'legs', equipment: ['full_gym'], isCompound: false },
  { name: 'Romanian Deadlift', muscle: 'hamstrings', muscleGroup: 'hamstrings', category: 'legs', equipment: ['full_gym', 'home'], isCompound: true, tutorialQuery: 'romanian deadlift RDL proper form tutorial' },
  { name: 'Leg Curl (Lying)', muscle: 'hamstrings', muscleGroup: 'hamstrings', category: 'legs', equipment: ['full_gym'], isCompound: false, tutorialQuery: 'lying leg curl hamstrings proper form tutorial' },
  { name: 'Hip Thrust', muscle: 'glutes', muscleGroup: 'glutes', category: 'legs', equipment: ['full_gym', 'home'], isCompound: true, tutorialQuery: 'barbell hip thrust proper form glutes tutorial' },
  { name: 'Bulgarian Split Squat', muscle: 'quads', muscleGroup: 'quads', category: 'legs', equipment: ['full_gym', 'home'], isCompound: true, tutorialQuery: 'bulgarian split squat proper form tutorial' },
  { name: 'Calf Raise (Standing)', muscle: 'calves', muscleGroup: 'calves', category: 'legs', equipment: ['full_gym', 'home', 'minimal'], isCompound: false },
  { name: 'Calf Raise (Seated)', muscle: 'calves', muscleGroup: 'calves', category: 'legs', equipment: ['full_gym'], isCompound: false },
  { name: 'Goblet Squat', muscle: 'quads', muscleGroup: 'quads', category: 'legs', equipment: ['full_gym', 'home', 'minimal'], isCompound: true },
  { name: 'Sumo Deadlift', muscle: 'hamstrings', muscleGroup: 'hamstrings', category: 'legs', equipment: ['full_gym'], isCompound: true },
  // LEGS additions
  { name: 'Front Squat', muscle: 'quads', muscleGroup: 'quads', category: 'legs', equipment: ['full_gym'], isCompound: true },
  { name: 'Walking Lunge', muscle: 'quads', muscleGroup: 'quads', category: 'legs', equipment: ['full_gym', 'home', 'minimal'], isCompound: true },
  { name: 'Sissy Squat', muscle: 'quads', muscleGroup: 'quads', category: 'legs', equipment: ['full_gym', 'home', 'minimal'], isCompound: false },
  { name: 'Leg Curl (Seated)', muscle: 'hamstrings', muscleGroup: 'hamstrings', category: 'legs', equipment: ['full_gym'], isCompound: false },
  { name: 'Nordic Curl', muscle: 'hamstrings', muscleGroup: 'hamstrings', category: 'legs', equipment: ['full_gym', 'home', 'minimal'], isCompound: false, tutorialQuery: 'nordic hamstring curl proper form tutorial' },
  { name: 'Single-Leg Hip Hinge', muscle: 'hamstrings', muscleGroup: 'hamstrings', category: 'legs', equipment: ['full_gym', 'home', 'minimal'], isCompound: true },
  { name: 'Cable Pull-Through', muscle: 'glutes', muscleGroup: 'glutes', category: 'legs', equipment: ['full_gym'], isCompound: false },
  { name: 'Glute Bridge', muscle: 'glutes', muscleGroup: 'glutes', category: 'legs', equipment: ['full_gym', 'home', 'minimal'], isCompound: false },
  { name: 'Donkey Calf Raise', muscle: 'calves', muscleGroup: 'calves', category: 'legs', equipment: ['full_gym'], isCompound: false },
  { name: 'Leg Press Calf Raise', muscle: 'calves', muscleGroup: 'calves', category: 'legs', equipment: ['full_gym'], isCompound: false },
  // CORE
  { name: 'Cable Crunch', muscle: 'core', muscleGroup: 'core', category: 'core', equipment: ['full_gym'], isCompound: false, tutorialQuery: 'cable crunch abs proper form tutorial' },
  { name: 'Plank', muscle: 'core', muscleGroup: 'core', category: 'core', equipment: ['full_gym', 'home', 'minimal'], isCompound: false },
  { name: 'Hanging Leg Raise', muscle: 'core', muscleGroup: 'core', category: 'core', equipment: ['full_gym'], isCompound: false },
  { name: 'Ab Wheel Rollout', muscle: 'core', muscleGroup: 'core', category: 'core', equipment: ['full_gym', 'home'], isCompound: false },
  // CORE additions
  { name: 'Dragon Flag', muscle: 'core', muscleGroup: 'core', category: 'core', equipment: ['full_gym', 'home'], isCompound: false },
  { name: 'Weighted Sit-Up', muscle: 'core', muscleGroup: 'core', category: 'core', equipment: ['full_gym'], isCompound: false },
  { name: 'L-Sit Hold', muscle: 'core', muscleGroup: 'core', category: 'core', equipment: ['full_gym', 'home', 'minimal'], isCompound: false },
  { name: 'Pallof Press', muscle: 'core', muscleGroup: 'core', category: 'core', equipment: ['full_gym'], isCompound: false },
  // ARMS category (bro split arm day)
  { name: 'EZ Bar Curl', muscle: 'biceps', muscleGroup: 'biceps', category: 'arms', equipment: ['full_gym'], isCompound: false },
  { name: 'Zottman Curl', muscle: 'biceps', muscleGroup: 'biceps', category: 'arms', equipment: ['full_gym', 'home'], isCompound: false },
  { name: 'Cable Overhead Extension', muscle: 'triceps', muscleGroup: 'triceps', category: 'arms', equipment: ['full_gym'], isCompound: false },
  { name: 'JM Press', muscle: 'triceps', muscleGroup: 'triceps', category: 'arms', equipment: ['full_gym'], isCompound: false }
]

function getExercises(
  category: 'push' | 'pull' | 'legs' | 'core' | 'arms',
  equipment: EquipmentTier,
  count: number
): ExerciseLibraryEntry[] {
  const tier: EquipmentTier[] =
    equipment === 'full_gym'
      ? ['full_gym', 'home', 'minimal']
      : equipment === 'home'
        ? ['home', 'minimal']
        : ['minimal']

  const filtered = EXERCISE_LIBRARY.filter(
    (e) => e.category === category && e.equipment.some((eq) => tier.includes(eq))
  )
  const compounds = filtered.filter((e) => e.isCompound)
  const isolations = filtered.filter((e) => !e.isCompound)

  const result: ExerciseLibraryEntry[] = []
  let ci = 0
  let ii = 0
  for (let i = 0; i < count; i++) {
    if (i < Math.ceil(count / 2) && ci < compounds.length) {
      result.push(compounds[ci++])
    } else if (ii < isolations.length) {
      result.push(isolations[ii++])
    } else if (ci < compounds.length) {
      result.push(compounds[ci++])
    }
  }
  return result.slice(0, count)
}

function getExercisesByMuscleGroup(
  muscleGroup: string,
  equipment: EquipmentTier,
  count: number
): ExerciseLibraryEntry[] {
  const tier: EquipmentTier[] =
    equipment === 'full_gym' ? ['full_gym', 'home', 'minimal']
    : equipment === 'home' ? ['home', 'minimal']
    : ['minimal']
  const filtered = EXERCISE_LIBRARY.filter(
    (e) => e.muscleGroup === muscleGroup && e.equipment.some((eq) => tier.includes(eq))
  )
  const compounds = filtered.filter((e) => e.isCompound)
  const isolations = filtered.filter((e) => !e.isCompound)
  const result: ExerciseLibraryEntry[] = []
  let ci = 0, ii = 0
  for (let i = 0; i < count; i++) {
    if (i < Math.ceil(count / 2) && ci < compounds.length) result.push(compounds[ci++])
    else if (ii < isolations.length) result.push(isolations[ii++])
    else if (ci < compounds.length) result.push(compounds[ci++])
  }
  return result.slice(0, count)
}

export function determinePhase(weeksOut: number | undefined, goal: string): 'hypertrophy' | 'strength' | 'peak' | 'deload' {
  if (weeksOut === undefined) return goal === 'cut' ? 'strength' : 'hypertrophy'
  if (weeksOut > 16) return 'hypertrophy'
  if (weeksOut > 8) return 'strength'
  if (weeksOut > 3) return 'peak'
  return 'deload'
}

function getRepRange(phase: string, isCompound: boolean): string {
  if (phase === 'hypertrophy') return isCompound ? '8-12' : '12-15'
  if (phase === 'strength') return isCompound ? '4-6' : '8-12'
  if (phase === 'peak') return isCompound ? '3-5' : '8-10'
  return isCompound ? '10-15' : '15-20'
}

function getRIR(phase: string): number {
  if (phase === 'hypertrophy') return 2
  if (phase === 'strength') return 1
  if (phase === 'peak') return 0
  return 3
}

function getSets(phase: string, isCompound: boolean, exp: number, userDefault?: number, userMax?: number): number {
  let sets: number
  if (userDefault !== undefined) {
    // Respect user preference: compounds get +1 over default, isolations get default
    sets = isCompound ? userDefault + 1 : userDefault
  } else {
    const base = isCompound ? 4 : 3
    const expBonus = exp >= 3 ? 1 : 0
    sets = base + expBonus
  }
  if (phase === 'deload') sets = Math.max(1, sets - 1)
  // Enforce hard cap
  if (userMax !== undefined) sets = Math.min(sets, userMax)
  return sets
}

function buildExercises(
  entries: ExerciseLibraryEntry[],
  phase: string,
  exp: number,
  userDefault?: number,
  userMax?: number
): Exercise[] {
  return entries.map((e) => ({
    name: e.name,
    sets: getSets(phase, e.isCompound, exp, userDefault, userMax),
    reps: getRepRange(phase, e.isCompound),
    rir: getRIR(phase),
    notes: e.isCompound ? 'Focus on progressive overload' : 'Control the eccentric'
  }))
}

function buildPPLSessions(
  freq: number,
  equipment: EquipmentTier,
  phase: string,
  exp: number,
  exPerSession?: number,
  userDefault?: number,
  userMax?: number
): TrainingSession[] {
  const days = DAY_SCHEDULES[freq] ?? [1,2,3,4,5,6].slice(0, freq)
  const exCount = (cat: 'push' | 'pull' | 'legs') => exPerSession ?? (cat === 'legs' ? 6 : 5)

  const cycle: Array<{ name: string; cat: 'push' | 'pull' | 'legs'; variant: 'A' | 'B' }> = [
    { name: 'Push (Chest / Shoulders / Triceps)', cat: 'push', variant: 'A' },
    { name: 'Pull (Back / Biceps)', cat: 'pull', variant: 'A' },
    { name: 'Legs (Quads / Hamstrings / Glutes)', cat: 'legs', variant: 'A' },
    { name: 'Push B (Volume Focus)', cat: 'push', variant: 'B' },
    { name: 'Pull B (Volume Focus)', cat: 'pull', variant: 'B' },
    { name: 'Legs B (Volume Focus)', cat: 'legs', variant: 'B' },
  ]

  return cycle.slice(0, freq).map((s, i) => {
    const entries = getExercises(s.cat, equipment, exCount(s.cat))
    const coreEntries = getExercises('core', equipment, 2)
    return {
      day_of_week: days[i],
      session_name: s.name,
      exercises: buildExercises([...entries, ...(s.cat === 'legs' ? [] : coreEntries)], phase, exp, userDefault, userMax)
    }
  })
}

function buildUpperLowerSessions(
  freq: number,
  equipment: EquipmentTier,
  phase: string,
  exp: number,
  exPerSession?: number,
  userDefault?: number,
  userMax?: number
): TrainingSession[] {
  const days = DAY_SCHEDULES[freq] ?? [1,2,3,4,5,6].slice(0, freq)
  const half = exPerSession !== undefined ? Math.max(2, Math.floor(exPerSession / 2)) : 4

  const templates: Array<{ name: string; exercises: ExerciseLibraryEntry[] }> = [
    {
      name: 'Upper Body A',
      exercises: [
        ...getExercises('push', equipment, half),
        ...getExercises('pull', equipment, half)
      ]
    },
    {
      name: 'Lower Body A',
      exercises: getExercises('legs', equipment, exPerSession ?? 6)
    },
    {
      name: 'Upper Body B',
      exercises: [
        ...getExercisesByMuscleGroup('chest', equipment, Math.max(1, Math.floor(half / 2))),
        ...getExercisesByMuscleGroup('back', equipment, Math.max(1, Math.floor(half / 2))),
        ...getExercisesByMuscleGroup('shoulders', equipment, Math.max(1, Math.floor(half / 2))),
        ...getExercisesByMuscleGroup('triceps', equipment, 1),
        ...getExercisesByMuscleGroup('biceps', equipment, 1),
      ]
    },
    {
      name: 'Lower Body B',
      exercises: [
        ...getExercisesByMuscleGroup('quads', equipment, 2),
        ...getExercisesByMuscleGroup('hamstrings', equipment, 2),
        ...getExercisesByMuscleGroup('glutes', equipment, 1),
        ...getExercises('core', equipment, exPerSession !== undefined ? Math.max(1, exPerSession - 5) : 2),
      ]
    },
    {
      name: 'Upper Body C',
      exercises: [
        ...getExercisesByMuscleGroup('shoulders', equipment, 3),
        ...getExercisesByMuscleGroup('biceps', equipment, 2),
        ...getExercisesByMuscleGroup('triceps', equipment, 2),
        ...getExercises('core', equipment, 1),
      ]
    },
    {
      name: 'Lower Body C',
      exercises: [
        ...getExercisesByMuscleGroup('quads', equipment, 2),
        ...getExercisesByMuscleGroup('hamstrings', equipment, 1),
        ...getExercisesByMuscleGroup('calves', equipment, 1),
        ...getExercises('core', equipment, 2),
      ]
    },
  ]

  return templates.slice(0, freq).map((t, i) => ({
    day_of_week: days[i],
    session_name: t.name,
    exercises: buildExercises(t.exercises, phase, exp, userDefault, userMax)
  }))
}

// Rotate an exercise list by one (first element moves to the end) to build a
// "variant B" ordering that differs from variant A. Unlike a `.slice(1)`, this
// preserves length, so it never empties a session when a muscle group only has
// one available exercise (e.g. a low exercises_per_session collapses each
// group to a single lift — which previously left "Shoulders & Arms (B)" empty).
function rotateOne<T>(arr: T[]): T[] {
  return arr.length <= 1 ? arr : [...arr.slice(1), arr[0]]
}

function buildArnoldSplit(freq: number, equipment: EquipmentTier, phase: string, exp: number, exPerSession?: number, userDefault?: number, userMax?: number): TrainingSession[] {
  const days = DAY_SCHEDULES[freq] ?? [1,2,3,4,5,6].slice(0, freq)
  // Arnold splits two muscle groups per session; scale each half by exPerSession/2
  const half = exPerSession !== undefined ? Math.max(2, Math.round(exPerSession / 2)) : 5
  const armThird = exPerSession !== undefined ? Math.max(1, Math.round(exPerSession / 3)) : 4
  const chestA = getExercisesByMuscleGroup('chest', equipment, half)
  const backA = getExercisesByMuscleGroup('back', equipment, half)
  const shoulderA = getExercisesByMuscleGroup('shoulders', equipment, armThird)
  const biA = getExercisesByMuscleGroup('biceps', equipment, armThird)
  const triA = getExercisesByMuscleGroup('triceps', equipment, armThird)
  const legExercises = [...getExercises('legs', equipment, exPerSession ?? 7), ...getExercises('core', equipment, 2)]

  const cycle = [
    { name: 'Chest & Back', ex: [...chestA, ...backA] },
    { name: 'Shoulders & Arms', ex: [...shoulderA, ...biA, ...triA] },
    { name: 'Legs & Core', ex: legExercises },
    { name: 'Chest & Back (B)', ex: [...rotateOne(chestA), ...rotateOne(backA)] },
    { name: 'Shoulders & Arms (B)', ex: [...rotateOne(shoulderA), ...rotateOne(biA), ...rotateOne(triA)] },
    { name: 'Legs & Core (B)', ex: [...legExercises.slice(2), ...legExercises.slice(0, 2)] },
  ]

  return cycle.slice(0, freq).map((s, i) => ({
    day_of_week: days[i],
    session_name: s.name,
    exercises: buildExercises(s.ex, phase, exp, userDefault, userMax)
  }))
}

function buildBroSplit(freq: number, equipment: EquipmentTier, phase: string, exp: number, exPerSession?: number, userDefault?: number, userMax?: number): TrainingSession[] {
  const days = DAY_SCHEDULES[freq] ?? [1,2,3,4,5,6].slice(0, freq)
  const ex = exPerSession ?? 7
  const armHalf = Math.max(1, Math.floor(ex / 2))

  const allSessions = [
    { name: 'Chest Day', ex: getExercisesByMuscleGroup('chest', equipment, ex) },
    { name: 'Back Day', ex: getExercisesByMuscleGroup('back', equipment, ex) },
    { name: 'Shoulders Day', ex: getExercisesByMuscleGroup('shoulders', equipment, Math.max(1, ex - 1)) },
    { name: 'Arms Day', ex: [...getExercisesByMuscleGroup('biceps', equipment, armHalf), ...getExercisesByMuscleGroup('triceps', equipment, armHalf)] },
    { name: 'Legs Day', ex: getExercises('legs', equipment, ex) },
    { name: 'Weak Point & Core', ex: [...getExercises('core', equipment, Math.max(1, ex - 2)), ...getExercisesByMuscleGroup('shoulders', equipment, 2)] },
  ]

  let sessionPool = allSessions
  if (freq === 3) {
    const third = Math.max(1, Math.round(ex / 3))
    sessionPool = [
      { name: 'Chest & Arms', ex: [...getExercisesByMuscleGroup('chest', equipment, third + 1), ...getExercisesByMuscleGroup('biceps', equipment, third), ...getExercisesByMuscleGroup('triceps', equipment, third)] },
      { name: 'Back & Shoulders', ex: [...getExercisesByMuscleGroup('back', equipment, third + 1), ...getExercisesByMuscleGroup('shoulders', equipment, third + 1)] },
      { name: 'Legs', ex: getExercises('legs', equipment, ex) },
    ]
  } else if (freq === 4) {
    const third = Math.max(1, Math.round(ex / 3))
    sessionPool = [
      { name: 'Chest Day', ex: getExercisesByMuscleGroup('chest', equipment, ex) },
      { name: 'Back Day', ex: getExercisesByMuscleGroup('back', equipment, ex) },
      { name: 'Shoulders & Arms', ex: [...getExercisesByMuscleGroup('shoulders', equipment, third), ...getExercisesByMuscleGroup('biceps', equipment, third), ...getExercisesByMuscleGroup('triceps', equipment, third)] },
      { name: 'Legs Day', ex: getExercises('legs', equipment, ex) },
    ]
  }

  return sessionPool.slice(0, freq).map((s, i) => ({
    day_of_week: days[i],
    session_name: s.name,
    exercises: buildExercises(s.ex.filter(Boolean) as ExerciseLibraryEntry[], phase, exp, userDefault, userMax)
  }))
}

function buildFullBodySplit(freq: number, equipment: EquipmentTier, phase: string, exp: number, exPerSession?: number, userDefault?: number, userMax?: number): TrainingSession[] {
  const days = DAY_SCHEDULES[freq] ?? [1,2,3,4,5,6].slice(0, freq)
  // Default full-body session is 8 exercises (1+1+3+1+1+1); scale legs count if exPerSession set
  const legsCount = exPerSession !== undefined ? Math.max(1, exPerSession - 5) : 3
  const getSession = (day: number, variant: 'A' | 'B' | 'C'): TrainingSession => {
    const pushOffset = variant === 'A' ? 0 : variant === 'B' ? 1 : 2
    const pullOffset = variant === 'A' ? 0 : variant === 'B' ? 1 : 2
    return {
      day_of_week: day,
      session_name: `Full Body ${variant}`,
      exercises: buildExercises([
        getExercisesByMuscleGroup('chest', equipment, 3)[pushOffset % 3],
        getExercisesByMuscleGroup('back', equipment, 3)[pullOffset % 3],
        ...getExercises('legs', equipment, legsCount),
        getExercisesByMuscleGroup('shoulders', equipment, 2)[0],
        getExercisesByMuscleGroup('biceps', equipment, 2)[0],
        getExercisesByMuscleGroup('triceps', equipment, 2)[0],
      ].filter(Boolean) as ExerciseLibraryEntry[], phase, exp, userDefault, userMax)
    }
  }
  const variants: Array<'A' | 'B' | 'C'> = ['A', 'B', 'C', 'A', 'B', 'C']
  return days.map((day, i) => getSession(day, variants[i % 3]))
}

export function getExerciseLibraryForUI(): Array<{
  name: string
  muscle: string
  muscleGroup: string
  category: string
  equipment: string[]
  isCompound: boolean
  tutorialQuery?: string
}> {
  return EXERCISE_LIBRARY.map((e) => ({
    name: e.name,
    muscle: e.muscle,
    muscleGroup: e.muscleGroup,
    category: e.category,
    equipment: e.equipment,
    isCompound: e.isCompound,
    tutorialQuery: e.tutorialQuery
  }))
}

export function generateTrainingPlan(input: TrainingInput): TrainingPlan {
  const equipment = (input.equipment_access ?? 'full_gym') as EquipmentTier
  const exp = input.training_experience_years
  // Guard against NaN / non-finite / non-integer frequency: a garbage value
  // (e.g. NaN from a missing onboarding field) would otherwise slice() to an
  // empty session list and silently produce a training plan with zero workouts.
  const rawFreq = Math.round(Number(input.training_frequency))
  const freq = Number.isFinite(rawFreq) ? Math.min(6, Math.max(2, rawFreq)) : 4
  const phase = determinePhase(input.weeks_out, input.goal)
  const weeksTotal = input.weeks_out ? Math.min(input.weeks_out, 16) : 12
  const pref = input.split_preference ?? 'auto'
  // Guard against a non-positive / non-finite exercises-per-session. A hand-typed
  // 0 slips past the Settings input's min={3} (HTML min never blocks typed values)
  // and is finite, so it persists unclamped. The builders read it via
  // `exPerSession ?? default`, but `??` ignores 0 — so `getExercises(..., 0)`
  // returns [] and the Legs day (which excludes the core fallback) is saved empty,
  // yielding a dead, uncompletable workout. Fall back to undefined for any bad
  // value so each builder applies its own sensible default, exactly as when the
  // field was never set. Positive values (incl. 1–2) are left to the builders,
  // which already floor them.
  const rawExPerSession = Number(input.exercises_per_session)
  const exPerSession = Number.isFinite(rawExPerSession) && rawExPerSession > 0
    ? Math.round(rawExPerSession)
    : undefined
  // Guard against a non-positive / non-finite sets-per-exercise — the same hole
  // as exercises_per_session above, on the sibling field. A hand-typed 0 (or
  // negative) slips past the Settings input's min={2} (HTML min never blocks a
  // typed value) and is finite, so it persists unclamped and reaches here via
  // `user.sets_per_exercise ?? 4` (`??` ignores 0). getSets() then honors it
  // verbatim: isolations get `userDefault` sets (0 → zero) and compounds
  // `userDefault + 1`, so WorkoutSession builds those exercises with an EMPTY set
  // list (Array.from({length: <= 0}) → []) — un-loggable, uncompletable, shown as
  // "0 sets × … reps". Fall back to undefined for any bad value so getSets applies
  // its own experience-based default. Positive values (incl. 1) are preserved.
  const rawSetsPerEx = Number(input.sets_per_exercise)
  const userDefault = Number.isFinite(rawSetsPerEx) && rawSetsPerEx > 0
    ? Math.round(rawSetsPerEx)
    : undefined
  const userMax = input.max_sets_per_exercise

  let sessions: TrainingSession[]
  let splitName: string

  if (pref === 'upper_lower') {
    sessions = buildUpperLowerSessions(freq, equipment, phase, exp, exPerSession, userDefault, userMax)
    splitName = `${freq}-Day Upper / Lower`
  } else if (pref === 'arnold') {
    sessions = buildArnoldSplit(freq, equipment, phase, exp, exPerSession, userDefault, userMax)
    splitName = 'Arnold Split'
  } else if (pref === 'bro') {
    sessions = buildBroSplit(freq, equipment, phase, exp, exPerSession, userDefault, userMax)
    splitName = 'Bro Split'
  } else if (pref === 'full_body') {
    sessions = buildFullBodySplit(freq, equipment, phase, exp, exPerSession, userDefault, userMax)
    splitName = 'Full Body'
  } else {
    // 'ppl' or 'auto'
    sessions = buildPPLSessions(freq, equipment, phase, exp, exPerSession, userDefault, userMax)
    splitName = `${freq}-Day Push / Pull / Legs`
  }

  return {
    name: `${splitName} — ${phase.charAt(0).toUpperCase() + phase.slice(1)} Phase`,
    weeks_total: weeksTotal,
    phase,
    sessions
  }
}
