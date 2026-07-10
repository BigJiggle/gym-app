import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { usePlanStore } from '../../store/planStore'
import { localDateStr } from '../../utils/dates'
import type { ExerciseLibraryItem } from '../../types'

const MUSCLE_GROUPS = ['chest', 'back', 'shoulders', 'triceps', 'biceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core']
const MUSCLE_LABEL: Record<string, string> = {
  chest: 'Chest', back: 'Back', shoulders: 'Delts', triceps: 'Tris',
  biceps: 'Bis', quads: 'Quads', hamstrings: 'Hams', glutes: 'Glutes',
  calves: 'Calves', core: 'Core',
}

export default function MuscleCoverageWidget() {
  const { workoutHistory } = usePlanStore()
  const [exerciseLibrary, setExerciseLibrary] = useState<ExerciseLibraryItem[]>([])
  useEffect(() => {
    let active = true
    window.api.getExerciseLibrary().then((lib) => { if (active) setExerciseLibrary(lib) })
    return () => { active = false }
  }, [])

  const todayStr = localDateStr()
  if (exerciseLibrary.length === 0 || !workoutHistory.some(l => l.status === 'completed')) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">This Week's Muscle Coverage</p>
        <p className="text-sm text-gray-600">Complete a workout to see muscle coverage.</p>
      </div>
    )
  }
  const jsDay2 = new Date().getDay()
  const daysFromMon2 = jsDay2 === 0 ? 6 : jsDay2 - 1
  const weekStartStr = new Date(Date.now() - daysFromMon2 * 86400000).toLocaleDateString('en-CA')
  const nameToGroup = new Map(exerciseLibrary.map((e) => [e.name, e.muscleGroup]))
  const setsPerGroup = new Map<string, number>()
  for (const log of workoutHistory) {
    if (log.status !== 'completed' || log.date < weekStartStr || log.date > todayStr) continue
    for (const s of log.sets ?? []) {
      if (s.skipped) continue
      const grp = nameToGroup.get(s.exercise_name)
      if (grp) setsPerGroup.set(grp, (setsPerGroup.get(grp) ?? 0) + 1)
    }
  }
  const activeGroups = MUSCLE_GROUPS.filter((g) => setsPerGroup.has(g) || exerciseLibrary.some(e => e.muscleGroup === g))
  if (activeGroups.length === 0) return null
  return (
    <Link to="/training" className="block">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors">
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">This Week's Muscle Coverage</p>
        <div className="grid grid-cols-5 gap-2">
          {activeGroups.map((grp) => {
            const sets = setsPerGroup.get(grp) ?? 0
            const hit = sets > 0
            return (
              <div key={grp} className={`text-center py-2 px-1 rounded-lg border transition-colors ${hit ? 'bg-brand-900/20 border-brand-800/40' : 'bg-gray-800/40 border-gray-800'}`}>
                <p className={`text-sm font-bold ${hit ? 'text-brand-400' : 'text-gray-600'}`}>{sets > 0 ? sets : '—'}</p>
                <p className={`text-xs mt-0.5 ${hit ? 'text-gray-400' : 'text-gray-600'}`}>{MUSCLE_LABEL[grp] ?? grp}</p>
              </div>
            )
          })}
        </div>
      </div>
    </Link>
  )
}
