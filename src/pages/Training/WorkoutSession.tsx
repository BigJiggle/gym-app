import { useEffect, useState, useCallback, useMemo } from 'react'
import type { TrainingSession, WorkoutLog, Exercise } from '../../types'
import { useSettingsStore } from '../../store/settingsStore'
import { usePlanStore } from '../../store/planStore'

// ── helpers ──────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function parseRepMidpoint(repRange: string): number {
  const parts = repRange.split('-')
  if (parts.length === 2) return Math.round((parseInt(parts[0]) + parseInt(parts[1])) / 2)
  return parseInt(repRange) || 10
}

// ── types ─────────────────────────────────────────────────────────────────────

interface SetEntry {
  reps: number
  weight: number
  rir: number
  done: boolean
  skipped: boolean
}

interface ExerciseState {
  sets: SetEntry[]
  allSkipped: boolean
}

// ── ExerciseCard ─────────────────────────────────────────────────────────────

interface LastPerf { weight: number; reps: number }

interface ExerciseCardProps {
  exercise: Exercise
  state: ExerciseState
  isImperial: boolean
  lastPerf?: LastPerf
  pr?: LastPerf
  onSetUpdate: (setIdx: number, field: keyof Pick<SetEntry, 'reps' | 'weight' | 'rir'>, value: number) => void
  onSetDone: (setIdx: number) => void
  onRemoveSet: (setIdx: number) => void
  onSkipExercise: () => void
  onAddSet: () => void
}

function ExerciseCard({ exercise, state, isImperial, lastPerf, pr, onSetUpdate, onSetDone, onRemoveSet, onSkipExercise, onAddSet }: ExerciseCardProps) {
  const weightUnit = isImperial ? 'lbs' : 'kg'
  const weightStep = isImperial ? 5 : 2.5
  const allSetsDone = !state.allSkipped && state.sets.length > 0 && state.sets.every((s) => s.done)
  return (
    <div className={`bg-gray-900 border rounded-xl p-4 transition-colors ${
      state.allSkipped ? 'border-gray-700 opacity-50' :
      allSetsDone ? 'border-green-800/60' :
      'border-gray-800'
    }`}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-semibold text-gray-100 text-sm">{exercise.name}</p>
            <button
              onClick={(e) => {
                e.stopPropagation()
                window.api.openExternal(
                  'https://www.youtube.com/results?search_query=' +
                    encodeURIComponent(exercise.name + ' proper form tutorial')
                )
              }}
              className="text-xs text-red-400 hover:text-red-300 opacity-50 hover:opacity-100 transition-opacity flex-shrink-0"
              title="Watch tutorial on YouTube"
            >
              ▶
            </button>
          </div>
          <p className="text-xs text-gray-500">{exercise.sets} sets × {exercise.reps} @ RIR {exercise.rir}</p>
          {lastPerf && (
            <p className="text-xs text-amber-500/70 mt-0.5">
              Last: {lastPerf.weight} {weightUnit} × {lastPerf.reps}
            </p>
          )}
          {pr && pr.weight > (lastPerf?.weight ?? 0) && (
            <p className="text-xs text-purple-400/70 mt-0.5">
              PR: {pr.weight} {weightUnit} × {pr.reps}
            </p>
          )}
        </div>
        {allSetsDone && <span className="text-xs text-green-400 font-medium">✓ Done</span>}
        {!state.allSkipped && !allSetsDone && (
          <button
            onClick={onSkipExercise}
            className="text-xs text-gray-500 hover:text-red-400 border border-gray-700 hover:border-red-800 rounded-lg px-2 py-1 transition-colors"
          >
            Skip Exercise
          </button>
        )}
        {state.allSkipped && <span className="text-xs text-gray-600 italic">Skipped</span>}
      </div>

      {!state.allSkipped && (
        <div className="space-y-2">
          {state.sets.map((s, i) => (
            <div key={i} className={`flex items-center gap-2 ${s.done ? 'opacity-60' : ''}`}>
              <span className="text-xs text-gray-600 w-8">Set {i + 1}</span>
              <input
                type="number"
                value={s.reps || ''}
                onChange={(e) => onSetUpdate(i, 'reps', Number(e.target.value))}
                placeholder="Reps"
                disabled={s.done}
                className="w-16 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-sm text-gray-200 text-center"
              />
              <span className="text-gray-600 text-xs">×</span>
              <input
                type="number"
                step={weightStep}
                value={s.weight || ''}
                onChange={(e) => onSetUpdate(i, 'weight', Number(e.target.value))}
                placeholder={weightUnit}
                disabled={s.done}
                className="w-16 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-sm text-gray-200 text-center"
              />
              <span className="text-gray-600 text-xs">{weightUnit}</span>
              <button
                onClick={() => onSetDone(i)}
                disabled={s.done}
                className={`ml-auto w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                  s.done
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-green-900 hover:text-green-400 border border-gray-700'
                }`}
              >
                ✓
              </button>
              {!s.done && state.sets.length > 1 && (
                <button
                  onClick={() => onRemoveSet(i)}
                  className="w-6 h-6 rounded flex items-center justify-center text-gray-700 hover:text-red-400 hover:bg-red-900/20 transition-colors text-xs"
                  title="Remove set"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <button
            onClick={(e) => { e.stopPropagation(); onAddSet() }}
            className="text-xs text-brand-400 hover:text-brand-300 border border-brand-800/50 hover:border-brand-700 rounded-lg px-3 py-1.5 mt-2 transition-colors w-full"
          >
            + Add Set
          </button>
        </div>
      )}
    </div>
  )
}

// ── WorkoutSession ────────────────────────────────────────────────────────────

interface WorkoutSessionProps {
  session: TrainingSession
  workoutLog: WorkoutLog
  onComplete: () => void
  onClose: () => void
}

type Phase = 'active' | 'summary'

function buildInitialStates(session: TrainingSession, lastPerf?: Map<string, LastPerf>): Map<string, ExerciseState> {
  const map = new Map<string, ExerciseState>()
  for (const ex of session.exercises) {
    const count = typeof ex.sets === 'number' ? ex.sets : 1
    const defaultReps = parseRepMidpoint(ex.reps)
    const last = lastPerf?.get(ex.name)
    const sets: SetEntry[] = Array.from({ length: count }, () => ({
      reps: defaultReps,
      weight: last?.weight ?? 0,
      rir: ex.rir,
      done: false,
      skipped: false,
    }))
    map.set(ex.name, { sets, allSkipped: false })
  }
  return map
}

export default function WorkoutSession({ session, workoutLog, onComplete, onClose }: WorkoutSessionProps) {
  const { settings } = useSettingsStore()
  const { workoutHistory } = usePlanStore()
  const isImperial = settings.units === 'imperial'

  // Build a per-exercise "last session" lookup from the most recent completed log for this session.
  // Weights are converted to the user's display unit so they match what gets typed into the inputs.
  const lastPerformance = useMemo<Map<string, LastPerf>>(() => {
    const result = new Map<string, LastPerf>()
    const sessionId = (session as unknown as { id?: number }).id
    if (!sessionId) return result
    const lastLog = [...workoutHistory]
      .filter(log => log.status === 'completed' && log.session_id === sessionId)
      .sort((a, b) => b.date.localeCompare(a.date))[0]
    if (!lastLog?.sets) return result
    for (const s of lastLog.sets) {
      if (s.skipped || !s.weight_kg || s.weight_kg === 0 || !s.reps_actual) continue
      const displayWeight = isImperial
        ? Math.round(s.weight_kg * 2.20462 * 10) / 10
        : Math.round(s.weight_kg * 10) / 10
      const existing = result.get(s.exercise_name)
      if (!existing || displayWeight > existing.weight) {
        result.set(s.exercise_name, { weight: displayWeight, reps: s.reps_actual })
      }
    }
    return result
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])  // intentionally run once at mount — history is already loaded by parent

  // All-time PRs across every completed session — gives the athlete a true progress baseline.
  // Runs once at mount so it reflects the history snapshot at session start.
  const allTimePR = useMemo<Map<string, LastPerf>>(() => {
    const result = new Map<string, LastPerf>()
    for (const log of workoutHistory) {
      if (log.status !== 'completed') continue
      for (const s of log.sets ?? []) {
        if (s.skipped || !s.weight_kg || s.weight_kg === 0 || !s.reps_actual) continue
        const displayWeight = isImperial
          ? Math.round(s.weight_kg * 2.20462 * 10) / 10
          : Math.round(s.weight_kg * 10) / 10
        const existing = result.get(s.exercise_name)
        if (!existing || displayWeight > existing.weight) {
          result.set(s.exercise_name, { weight: displayWeight, reps: s.reps_actual })
        }
      }
    }
    return result
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [phase, setPhase] = useState<Phase>('active')
  const [exerciseStates, setExerciseStates] = useState<Map<string, ExerciseState>>(
    () => buildInitialStates(session, lastPerformance)
  )
  const [summaryStats, setSummaryStats] = useState<{ sets: number; exercises: number; volume: number } | null>(null)
  const [newPRs, setNewPRs] = useState<{ exerciseName: string; weight: number; reps: number }[]>([])
  const [saving, setSaving] = useState(false)
  const [sessionNotes, setSessionNotes] = useState('')
  const [notesOpen, setNotesOpen] = useState(false)

  // ── Rest timer ──────────────────────────────────────────────────────────────
  const [restSecsLeft, setRestSecsLeft] = useState<number | null>(null)
  const [restTarget, setRestTarget] = useState(90)

  useEffect(() => {
    if (restSecsLeft === null || restSecsLeft <= 0) return
    const id = setInterval(() => setRestSecsLeft((s) => (s !== null && s > 0 ? s - 1 : 0)), 1000)
    return () => clearInterval(id)
  }, [restSecsLeft !== null && restSecsLeft > 0])

  const startRest = useCallback(() => {
    setRestSecsLeft(restTarget)
  }, [restTarget])

  useEffect(() => {
    if (phase === 'summary') return
    const id = setInterval(() => setElapsedSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [phase])

  // ── state helpers — no DB writes during workout ────────────────────────────

  const updateSet = useCallback(
    (exerciseName: string, setIdx: number, field: keyof Pick<SetEntry, 'reps' | 'weight' | 'rir'>, value: number) => {
      setExerciseStates((prev) => {
        const next = new Map(prev)
        const exState = next.get(exerciseName)
        if (!exState) return prev
        const updatedSets = exState.sets.map((s, i) => (i === setIdx ? { ...s, [field]: value } : s))
        next.set(exerciseName, { ...exState, sets: updatedSets })
        return next
      })
    },
    []
  )

  const markSetDone = useCallback((exerciseName: string, setIdx: number) => {
    setExerciseStates((prev) => {
      const next = new Map(prev)
      const exState = next.get(exerciseName)
      if (!exState) return prev
      const set = exState.sets[setIdx]
      if (!set || set.done) return prev
      const updatedSets = exState.sets.map((s, i) => (i === setIdx ? { ...s, done: true } : s))
      next.set(exerciseName, { ...exState, sets: updatedSets })
      return next
    })
  }, [])

  const skipExercise = useCallback((exerciseName: string) => {
    setExerciseStates((prev) => {
      const next = new Map(prev)
      const state = next.get(exerciseName)
      if (!state) return prev
      next.set(exerciseName, { ...state, allSkipped: true })
      return next
    })
  }, [])

  const addSet = useCallback((exerciseName: string) => {
    setExerciseStates((prev) => {
      const next = new Map(prev)
      const exState = next.get(exerciseName)
      if (!exState) return prev
      const exercise = session.exercises.find((e) => e.name === exerciseName)
      const lastSet = exState.sets[exState.sets.length - 1]
      const newSet: SetEntry = {
        reps: lastSet?.reps ?? parseRepMidpoint(exercise?.reps ?? '10'),
        weight: lastSet?.weight ?? 0,
        rir: lastSet?.rir ?? (exercise?.rir ?? 2),
        done: false,
        skipped: false,
      }
      next.set(exerciseName, { ...exState, sets: [...exState.sets, newSet] })
      return next
    })
  }, [session.exercises])

  const removeSet = useCallback((exerciseName: string, setIdx: number) => {
    setExerciseStates((prev) => {
      const next = new Map(prev)
      const exState = next.get(exerciseName)
      if (!exState || exState.sets.length <= 1) return prev
      const updatedSets = exState.sets.filter((_, i) => i !== setIdx)
      next.set(exerciseName, { ...exState, sets: updatedSets })
      return next
    })
  }, [])

  // ── complete: batch-save all sets then mark workout done ──────────────────

  const handleComplete = useCallback(async () => {
    const currentStates = Array.from(exerciseStates.entries())

    // Snapshot summary stats before async work
    const doneSets = currentStates.reduce((acc, [, s]) => acc + s.sets.filter((x) => x.done).length, 0)
    const doneExercises = currentStates.filter(([, s]) => s.sets.some((x) => x.done)).length
    // Total volume in the user's display unit (lbs or kg) — excludes bodyweight sets (weight=0)
    const volume = currentStates.reduce((total, [, s]) =>
      total + s.sets.reduce((acc, x) => x.done && x.weight > 0 ? acc + x.weight * x.reps : acc, 0)
    , 0)
    setSummaryStats({ sets: doneSets, exercises: doneExercises, volume: Math.round(volume) })

    // Detect new personal records — only when there's previous session data to compare against
    if (lastPerformance.size > 0) {
      const prs: { exerciseName: string; weight: number; reps: number }[] = []
      for (const [exerciseName, exState] of currentStates) {
        if (exState.allSkipped) continue
        const doneSetsForEx = exState.sets.filter((s) => s.done && s.weight > 0)
        if (doneSetsForEx.length === 0) continue
        const bestWeight = Math.max(...doneSetsForEx.map((s) => s.weight))
        const bestReps = doneSetsForEx.find((s) => s.weight === bestWeight)?.reps ?? 0
        const prev = lastPerformance.get(exerciseName)
        if (prev && bestWeight > prev.weight) {
          prs.push({ exerciseName, weight: bestWeight, reps: bestReps })
        }
      }
      setNewPRs(prs)
    }

    setSaving(true)

    // Build the full set list to persist
    const setsToSave: Record<string, unknown>[] = []
    for (const [exerciseName, exState] of currentStates) {
      const exercise = session.exercises.find((e) => e.name === exerciseName)
      if (exState.allSkipped) {
        exState.sets.forEach((_, i) => {
          setsToSave.push({
            exercise_name: exerciseName,
            set_number: i + 1,
            reps_prescribed: exercise?.reps ?? null,
            reps_actual: null,
            weight_kg: null,
            rir_actual: null,
            skipped: true,
            notes: null,
          })
        })
      } else {
        exState.sets.forEach((s, i) => {
          if (s.done) {
            // Convert entered weight to kg for DB storage
            const rawWeight = s.weight === 0 ? null : s.weight
            const weightKg = rawWeight === null ? null
              : isImperial ? Math.round(rawWeight * 0.453592 * 100) / 100
              : rawWeight
            setsToSave.push({
              exercise_name: exerciseName,
              set_number: i + 1,
              reps_prescribed: exercise?.reps ?? null,
              reps_actual: s.reps,
              weight_kg: weightKg,
              rir_actual: s.rir,
              skipped: false,
              notes: null,
            })
          }
        })
      }
    }

    try {
      await window.api.saveSetsBatch(workoutLog.id, setsToSave)
      await window.api.completeWorkout(workoutLog.id, sessionNotes.trim() || undefined)
      setPhase('summary')
    } catch (err) {
      console.error('Complete workout error:', err)
    } finally {
      setSaving(false)
    }
  }, [workoutLog.id, exerciseStates, session.exercises, isImperial, sessionNotes, lastPerformance])

  // ── end early = cancel entirely, no history entry ─────────────────────────

  const handleEndEarly = useCallback(() => {
    const confirmed = window.confirm('Cancel this workout? No data will be saved.')
    if (!confirmed) return
    window.api.cancelWorkout(workoutLog.id)
      .catch((err: unknown) => console.error('cancelWorkout error:', err))
      .finally(() => onClose())
  }, [workoutLog.id, onClose])

  // ── derived ────────────────────────────────────────────────────────────────

  const doneCount = session.exercises.filter((ex) => {
    const state = exerciseStates.get(ex.name)
    if (!state) return false
    return state.allSkipped || state.sets.some((s) => s.done)
  }).length

  const canComplete = session.exercises.some((ex) => {
    const state = exerciseStates.get(ex.name)
    return state ? state.sets.some((s) => s.done) : false
  })

  const completedCount = session.exercises.filter((ex) => {
    const state = exerciseStates.get(ex.name)
    return state ? state.sets.some((s) => s.done) : false
  }).length

  const totalSetsLogged = Array.from(exerciseStates.values()).reduce(
    (acc, state) => acc + state.sets.filter((s) => s.done).length,
    0
  )

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 bg-gray-950 z-50 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-900">
        <div className="w-16" />
        <div className="text-center">
          <p className="font-semibold text-gray-100 text-sm">{session.session_name}</p>
          <p className="text-xs text-brand-400 font-mono">{formatTime(elapsedSeconds)}</p>
        </div>
        <button onClick={handleEndEarly} className="text-red-400 hover:text-red-300 text-sm w-16 text-right">
          Abandon
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {session.exercises.map((ex) => (
          <ExerciseCard
            key={ex.name}
            exercise={ex}
            state={exerciseStates.get(ex.name)!}
            isImperial={isImperial}
            lastPerf={lastPerformance.get(ex.name)}
            pr={allTimePR.get(ex.name)}
            onSetUpdate={(setIdx, field, value) => updateSet(ex.name, setIdx, field, value)}
            onSetDone={(setIdx) => { markSetDone(ex.name, setIdx); startRest() }}
            onRemoveSet={(setIdx) => removeSet(ex.name, setIdx)}
            onSkipExercise={() => skipExercise(ex.name)}
            onAddSet={() => addSet(ex.name)}
          />
        ))}
      </div>

      <div className="border-t border-gray-800 bg-gray-900 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-gray-400">
            {doneCount}/{session.exercises.length} exercises done
          </p>
          <div className="w-32 h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-500"
              style={{ width: `${(doneCount / session.exercises.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Rest target selector — always visible so athletes can set duration before first set */}
        {restSecsLeft === null && (
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xs text-gray-600">Rest:</span>
            {[60, 90, 120, 180].map((s) => (
              <button
                key={s}
                onClick={() => setRestTarget(s)}
                className={`text-xs px-2 py-0.5 rounded-lg border transition-colors ${
                  restTarget === s ? 'border-brand-500 text-brand-400 bg-brand-900/30' : 'border-gray-800 text-gray-600 hover:border-gray-700 hover:text-gray-500'
                }`}
              >
                {s < 120 ? `${s}s` : `${s / 60}m`}
              </button>
            ))}
          </div>
        )}
        {/* Rest timer — shows after each set is logged */}
        {restSecsLeft !== null && restSecsLeft > 0 && (
          <div className="mb-3 flex items-center justify-between bg-brand-900/30 border border-brand-700/50 rounded-xl px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 uppercase tracking-wider">Rest</span>
              <span className={`font-mono font-bold text-lg tabular-nums ${restSecsLeft <= 10 ? 'text-red-400 animate-pulse' : 'text-brand-400'}`}>
                {formatTime(restSecsLeft)}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-600 mr-0.5">Set:</span>
              {[60, 90, 120, 180].map((s) => (
                <button
                  key={s}
                  onClick={() => { setRestTarget(s); setRestSecsLeft(s) }}
                  className={`text-xs px-2 py-0.5 rounded-lg border transition-colors ${
                    restTarget === s ? 'border-brand-500 text-brand-400 bg-brand-900/30' : 'border-gray-700 text-gray-500 hover:border-gray-600'
                  }`}
                >
                  {s < 120 ? `${s}s` : `${s / 60}m`}
                </button>
              ))}
              <button
                onClick={() => setRestSecsLeft(null)}
                className="ml-1 text-xs text-gray-400 hover:text-gray-200 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-700/60 transition-colors"
                title="Dismiss timer"
              >
                ✕
              </button>
            </div>
          </div>
        )}
        {restSecsLeft === 0 && (
          <div className="mb-3 flex items-center justify-between bg-green-900/30 border border-green-700/50 rounded-xl px-3 py-2">
            <span className="text-sm font-semibold text-green-400">Rest done — go!</span>
            <button
              onClick={() => setRestSecsLeft(null)}
              className="text-xs text-gray-500 hover:text-gray-300"
            >
              ✕
            </button>
          </div>
        )}

        {notesOpen ? (
          <textarea
            value={sessionNotes}
            onChange={(e) => setSessionNotes(e.target.value)}
            placeholder="How did it feel? Any PRs, injuries, or observations..."
            rows={2}
            autoFocus
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-300 placeholder-gray-600 resize-none mb-2 focus:outline-none focus:border-brand-600"
          />
        ) : (
          <button
            onClick={() => setNotesOpen(true)}
            className="w-full text-left text-xs text-gray-600 hover:text-gray-400 px-1 py-1 mb-2 transition-colors"
          >
            + Add session notes
          </button>
        )}
        <button
          onClick={handleComplete}
          disabled={!canComplete || saving}
          className="w-full py-3 rounded-xl font-bold text-white bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? 'Saving...' : !canComplete ? 'Log at least 1 set to finish' : 'Complete Workout ✓'}
        </button>
      </div>

      {phase === 'summary' && (
        <div className="absolute inset-0 bg-gray-950 flex flex-col items-center justify-center p-8">
          <div className="text-6xl mb-4">🏆</div>
          <h2 className="text-2xl font-black text-gray-100 mb-1">Workout Complete!</h2>
          <p className="text-gray-400 mb-6">Great work today</p>
          <div className="grid grid-cols-2 gap-4 w-full max-w-sm mb-8">
            <div className="bg-gray-900 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-brand-400">{formatTime(elapsedSeconds)}</p>
              <p className="text-xs text-gray-500 mt-1">Duration</p>
            </div>
            <div className="bg-gray-900 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-green-400">{summaryStats?.exercises ?? completedCount}</p>
              <p className="text-xs text-gray-500 mt-1">Exercises</p>
            </div>
            <div className="bg-gray-900 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-gray-400">{summaryStats?.sets ?? totalSetsLogged}</p>
              <p className="text-xs text-gray-500 mt-1">Sets logged</p>
            </div>
            <div className="bg-gray-900 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-yellow-400">
                {summaryStats?.volume
                  ? summaryStats.volume.toLocaleString()
                  : '—'}
              </p>
              <p className="text-xs text-gray-500 mt-1">Volume ({isImperial ? 'lbs' : 'kg'})</p>
            </div>
          </div>
          {newPRs.length > 0 && (
            <div className="w-full max-w-sm bg-brand-900/20 border border-brand-700/40 rounded-xl p-3 mb-4 text-left">
              <p className="text-xs font-semibold text-brand-400 uppercase tracking-wider mb-2">🏆 New Personal Records</p>
              <div className="space-y-1">
                {newPRs.map((pr, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-sm text-gray-300 truncate mr-2">{pr.exerciseName}</span>
                    <span className="text-sm font-bold text-brand-300 flex-shrink-0">
                      {pr.weight} {isImperial ? 'lbs' : 'kg'} × {pr.reps}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {sessionNotes.trim() && (
            <div className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-xl p-3 mb-4 text-left">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Session Notes</p>
              <p className="text-sm text-gray-300">{sessionNotes.trim()}</p>
            </div>
          )}
          <button
            onClick={onComplete}
            className="w-full max-w-sm py-3 rounded-xl font-bold text-white bg-brand-600 hover:bg-brand-500"
          >
            Back to Training
          </button>
        </div>
      )}
    </div>
  )
}
