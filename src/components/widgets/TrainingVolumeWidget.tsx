import { Link } from 'react-router-dom'
import { useUserStore } from '../../store/userStore'
import { usePlanStore } from '../../store/planStore'
import { useSettingsStore } from '../../store/settingsStore'
import { localDateStr } from '../../utils/dates'

// "This Week's Volume" — sets logged, total weight moved, and estimated training
// kcal burned this week. (Distinct from the MEV-coverage 'weekly-volume' widget.)
export default function TrainingVolumeWidget() {
  const { user } = useUserStore()
  const { workoutHistory, trainingPlan, dietPlan, latestCheckin } = usePlanStore()
  const { settings } = useSettingsStore()
  if (!user) return null
  const todayStr = localDateStr()

  const isImperial = settings.units === 'imperial'
  const wUnit = isImperial ? 'lbs' : 'kg'
  const jsDay = new Date().getDay()
  const daysFromMon = jsDay === 0 ? 6 : jsDay - 1
  const weekStartStr = new Date(Date.now() - daysFromMon * 86400000).toLocaleDateString('en-CA')
  const thisWeekLogs = workoutHistory.filter(
    (log) => log.status === 'completed' && log.date >= weekStartStr && log.date <= todayStr
  )
  if (thisWeekLogs.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">This Week's Volume</p>
        <p className="text-sm text-gray-600">No completed workouts logged yet this week.</p>
      </div>
    )
  }
  const totalSets = thisWeekLogs.reduce((acc, log) =>
    acc + (log.sets?.filter((s) => !s.skipped && s.reps_actual != null).length ?? 0), 0
  )
  const totalVolumeKg = thisWeekLogs.reduce((acc, log) =>
    acc + (log.sets?.reduce((s, set) =>
      s + (!set.skipped && set.weight_kg != null && set.reps_actual != null ? set.weight_kg * set.reps_actual : 0), 0) ?? 0), 0
  )
  const displayVol = isImperial ? Math.round(totalVolumeKg * 2.20462).toLocaleString() : Math.round(totalVolumeKg).toLocaleString()
  const totalPlanned = trainingPlan?.sessions?.length ?? 0

  const currentWeightKg = latestCheckin?.weight_kg ?? user.weight_kg
  const MET = 5.5
  const totalKcalBurned = thisWeekLogs.reduce((acc, log) => {
    if (!log.started_at || !log.ended_at) return acc
    const durationHours = (new Date(log.ended_at).getTime() - new Date(log.started_at).getTime()) / (1000 * 60 * 60)
    return acc + Math.round(durationHours * MET * currentWeightKg)
  }, 0)
  const sessionsWithDuration = thisWeekLogs.filter(l => l.started_at && l.ended_at).length

  return (
    <Link to="/training" className="block">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-gray-500 uppercase tracking-wider">This Week's Volume</p>
          <span className="text-xs text-brand-400 hover:text-brand-300">View Stats →</span>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-xl font-bold text-gray-100">{thisWeekLogs.length}{totalPlanned > 0 ? `/${totalPlanned}` : ''}</p>
            <p className="text-xs text-gray-500 mt-0.5">sessions</p>
          </div>
          <div>
            <p className="text-xl font-bold text-gray-100">{totalSets}</p>
            <p className="text-xs text-gray-500 mt-0.5">sets logged</p>
          </div>
          <div>
            <p className="text-xl font-bold text-brand-400">{displayVol}</p>
            <p className="text-xs text-gray-500 mt-0.5">{wUnit} moved</p>
          </div>
        </div>
        {sessionsWithDuration > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-800 flex items-center justify-between">
            <span className="text-xs text-gray-500">Est. training kcal burned</span>
            <span className="text-sm font-bold text-orange-400">
              ~{totalKcalBurned.toLocaleString()} kcal
              {dietPlan && (
                <span className="text-xs font-normal text-gray-500 ml-1.5">
                  · net ~{Math.round(dietPlan.calories_target - totalKcalBurned / thisWeekLogs.length).toLocaleString()} kcal/day
                </span>
              )}
            </span>
          </div>
        )}
      </div>
    </Link>
  )
}
