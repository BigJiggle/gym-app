import { useEffect, useState } from 'react'
import { usePlanStore } from '../../store/planStore'
import type { ExerciseLibraryItem } from '../../types'

const ALL_MUSCLE_GROUPS = ['chest', 'back', 'shoulders', 'triceps', 'biceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core']
const MEV: Record<string, number> = {
  chest: 8, back: 10, shoulders: 8, triceps: 6, biceps: 6,
  quads: 8, hamstrings: 6, glutes: 6, calves: 6, core: 6,
}

export default function WeeklyVolumeWidget() {
  const { workoutHistory } = usePlanStore()
  const [library, setLibrary] = useState<ExerciseLibraryItem[]>([])

  useEffect(() => {
    let active = true
    window.api.getExerciseLibrary().then((lib) => { if (active) setLibrary(lib) })
    return () => { active = false }
  }, [])

  const today = new Date()
  const jsDay = today.getDay()
  const daysFromMon = jsDay === 0 ? 6 : jsDay - 1
  const monday = new Date(today)
  monday.setDate(today.getDate() - daysFromMon)
  const fromStr = monday.toLocaleDateString('en-CA')
  const toStr = today.toLocaleDateString('en-CA')

  const nameToGroup = new Map(library.map((e) => [e.name, e.muscleGroup]))
  const setsByGroup = new Map<string, number>()
  for (const log of workoutHistory) {
    if (log.status !== 'completed' || log.date < fromStr || log.date > toStr) continue
    for (const s of log.sets ?? []) {
      if (s.skipped) continue
      const group = nameToGroup.get(s.exercise_name)
      if (group) setsByGroup.set(group, (setsByGroup.get(group) ?? 0) + 1)
    }
  }

  const totalSets = Array.from(setsByGroup.values()).reduce((a, b) => a + b, 0)
  const groupsAtMev = ALL_MUSCLE_GROUPS.filter((g) => (setsByGroup.get(g) ?? 0) >= (MEV[g] ?? 6)).length
  const trainedGroups = ALL_MUSCLE_GROUPS.filter((g) => (setsByGroup.get(g) ?? 0) > 0).length
  const pct = Math.round((groupsAtMev / ALL_MUSCLE_GROUPS.length) * 100)
  const barColor = pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-500'

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Weekly Volume</p>
        <span className="text-xs text-gray-600">vs MEV</span>
      </div>
      <div className="flex items-end gap-3 mb-2">
        <p className="text-3xl font-black text-gray-100">
          {groupsAtMev}<span className="text-lg font-bold text-gray-600">/{ALL_MUSCLE_GROUPS.length}</span>
        </p>
        <p className="text-xs text-gray-500 mb-1">muscle groups at MEV</p>
      </div>
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden mb-2">
        <div className={`h-full transition-all duration-300 ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-gray-500">
        {totalSets} working set{totalSets !== 1 ? 's' : ''} this week · {trainedGroups} group{trainedGroups !== 1 ? 's' : ''} trained
      </p>
    </div>
  )
}
