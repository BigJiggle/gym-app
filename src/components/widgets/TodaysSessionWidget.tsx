import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { usePlanStore } from '../../store/planStore'
import { useSettingsStore } from '../../store/settingsStore'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import { localDateStr } from '../../utils/dates'
import type { ExerciseLibraryItem } from '../../types'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function TodaysSessionWidget() {
  const { trainingPlan, workoutHistory } = usePlanStore()
  const { settings } = useSettingsStore()
  const [exerciseLibrary, setExerciseLibrary] = useState<ExerciseLibraryItem[]>([])
  useEffect(() => {
    let active = true
    window.api.getExerciseLibrary().then((lib) => { if (active) setExerciseLibrary(lib) })
    return () => { active = false }
  }, [])

  const todayStr = localDateStr()
  const jsDay = new Date().getDay()
  const todayDow = jsDay === 0 ? 7 : jsDay
  const todaySession = trainingPlan?.sessions?.find((s) => s.day_of_week === todayDow)

  const nextSession = (() => {
    if (!trainingPlan?.sessions?.length) return null
    const sorted = [...trainingPlan.sessions].sort((a, b) => a.day_of_week - b.day_of_week)
    return sorted.find(s => s.day_of_week > todayDow) ?? sorted[0]
  })()

  const lastPerformanceMap = (() => {
    const map = new Map<string, { weight_kg: number; reps: number }>()
    const sorted = [...workoutHistory].filter(l => l.status === 'completed').sort((a, b) => b.date.localeCompare(a.date))
    for (const log of sorted) {
      for (const set of log.sets ?? []) {
        if (set.skipped || set.weight_kg == null || set.reps_actual == null) continue
        if (!map.has(set.exercise_name)) {
          const best = (log.sets ?? [])
            .filter(s => s.exercise_name === set.exercise_name && !s.skipped && s.weight_kg != null && s.reps_actual != null)
            .reduce<{ weight_kg: number; reps: number } | null>(
              (b, s) => !b || s.weight_kg! > b.weight_kg ? { weight_kg: s.weight_kg!, reps: s.reps_actual! } : b, null)
          if (best) map.set(set.exercise_name, best)
        }
      }
    }
    return map
  })()

  const isCompoundMap = new Map<string, boolean>(exerciseLibrary.map(e => [e.name, e.isCompound]))

  function progressionTarget(exerciseName: string, phase: string): string | null {
    if (phase === 'deload') return null
    const lp = lastPerformanceMap.get(exerciseName)
    if (!lp || lp.weight_kg <= 0) return null
    const isImperial = settings.units === 'imperial'
    const isCompound = isCompoundMap.get(exerciseName) ?? true
    const incrementKg = isCompound ? 2.5 : 1.25
    const rawKg = lp.weight_kg + incrementKg
    const cappedKg = Math.min(rawKg, lp.weight_kg * 1.05)
    if (isImperial) {
      const lbs = Math.round(cappedKg * 2.20462 / 2.5) * 2.5
      return `${lbs}lbs`
    }
    return `${Math.round(cappedKg * 4) / 4}kg`
  }

  const todayWorkoutLog = workoutHistory.find(l => l.status === 'completed' && l.date === todayStr)
  const todayPRs = (() => {
    if (!todayWorkoutLog) return [] as Array<{ exercise: string; weight_kg: number; reps: number }>
    const historyPRMap = new Map<string, number>()
    for (const log of workoutHistory.filter(l => l.status === 'completed' && l.date !== todayStr)) {
      for (const set of log.sets ?? []) {
        if (set.skipped || set.weight_kg == null || set.reps_actual == null) continue
        const prev = historyPRMap.get(set.exercise_name)
        if (prev == null || set.weight_kg > prev) historyPRMap.set(set.exercise_name, set.weight_kg)
      }
    }
    const todayBests = new Map<string, { weight_kg: number; reps: number }>()
    for (const set of todayWorkoutLog.sets ?? []) {
      if (set.skipped || set.weight_kg == null || set.reps_actual == null) continue
      const prev = todayBests.get(set.exercise_name)
      if (!prev || set.weight_kg > prev.weight_kg) todayBests.set(set.exercise_name, { weight_kg: set.weight_kg, reps: set.reps_actual })
    }
    const prs: Array<{ exercise: string; weight_kg: number; reps: number }> = []
    for (const [exercise, best] of todayBests) {
      const historicalBest = historyPRMap.get(exercise)
      if (historicalBest == null || best.weight_kg > historicalBest) prs.push({ exercise, weight_kg: best.weight_kg, reps: best.reps })
    }
    return prs
  })()

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-100">Today — {DAY_NAMES[jsDay]}</h2>
        {todaySession ? <Badge variant="brand">Training Day</Badge> : <Badge variant="default">Rest Day</Badge>}
      </div>
      {todaySession ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-brand-400">{todaySession.session_name}</p>
          {workoutHistory.some(l => l.status === 'completed' && l.date === todayStr) ? (
            <>
              <div className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-green-900/20 border border-green-800/40 text-green-400 text-sm font-medium">
                <span>✓</span> Workout Complete
              </div>
              {todayPRs.length > 0 && (
                <div className="bg-yellow-900/20 border border-yellow-800/40 rounded-lg p-2">
                  <p className="text-xs font-semibold text-yellow-400 mb-1.5">🏆 New PRs Today!</p>
                  <div className="space-y-0.5">
                    {todayPRs.map((pr, i) => (
                      <p key={i} className="text-xs text-yellow-300">
                        {pr.exercise}: {settings.units === 'imperial' ? `${Math.round(pr.weight_kg * 2.20462 * 2) / 2}lbs` : `${pr.weight_kg}kg`} × {pr.reps}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <Link to="/training"><Button className="w-full">▶ Start Today's Workout</Button></Link>
          )}
          <div className="space-y-1.5 pt-1">
            {todaySession.exercises.slice(0, 5).map((ex, i) => {
              const lp = lastPerformanceMap.get(ex.name)
              const lastStr = lp
                ? settings.units === 'imperial' ? `${Math.round(lp.weight_kg * 2.20462 * 2) / 2}lbs × ${lp.reps}` : `${lp.weight_kg}kg × ${lp.reps}`
                : null
              const target = progressionTarget(ex.name, trainingPlan?.phase ?? '')
              return (
                <div key={i} className="flex items-start justify-between text-sm gap-2">
                  <div className="min-w-0">
                    <span className="text-gray-300">{ex.name}</span>
                    {lastStr && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        last: {lastStr}
                        {target && <span className="text-brand-400 ml-1.5">→ target: {target}</span>}
                      </p>
                    )}
                  </div>
                  <span className="text-gray-500 flex-shrink-0">{ex.sets} × {ex.reps} @ RIR {ex.rir}</span>
                </div>
              )
            })}
            {(todaySession.exercises.length ?? 0) > 5 && (
              <p className="text-xs text-gray-600">+{todaySession.exercises.length - 5} more exercises</p>
            )}
          </div>
        </div>
      ) : (
        <div className="py-2">
          <p className="text-gray-500 text-sm text-center">Rest & recovery today.</p>
          <p className="text-gray-600 text-xs mt-1 text-center">Focus on sleep, nutrition, and mobility.</p>
          {nextSession && (
            <div className="mt-3 pt-3 border-t border-gray-800">
              <p className="text-xs text-gray-500 mb-1.5">Next Training Day</p>
              <p className="text-sm font-medium text-brand-400">
                {DAY_NAMES[nextSession.day_of_week === 7 ? 0 : nextSession.day_of_week]} — {nextSession.session_name}
              </p>
              <div className="mt-1.5 space-y-1">
                {nextSession.exercises.slice(0, 4).map((ex, i) => {
                  const lp = lastPerformanceMap.get(ex.name)
                  const lastStr = lp
                    ? settings.units === 'imperial' ? `${Math.round(lp.weight_kg * 2.20462 * 2) / 2}lbs×${lp.reps}` : `${lp.weight_kg}kg×${lp.reps}`
                    : null
                  return (
                    <div key={i} className="flex items-start justify-between text-xs gap-2">
                      <div className="min-w-0">
                        <span className="text-gray-500">{ex.name}</span>
                        {lastStr && <p className="text-xs text-gray-700 mt-0.5">last: {lastStr}</p>}
                      </div>
                      <span className="text-gray-700 flex-shrink-0">{ex.sets}×{ex.reps}</span>
                    </div>
                  )
                })}
                {nextSession.exercises.length > 4 && (
                  <p className="text-xs text-gray-700">+{nextSession.exercises.length - 4} more</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
