import { usePlanStore } from '../../store/planStore'
import { useCardioStore } from '../../store/cardioStore'
import { posingStore, sleepStore } from './competitionLogs'
import { localDateStr } from '../../utils/dates'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function WeeklyScorecardWidget() {
  const { dietPlan, trainingPlan, workoutHistory, mealCompletions } = usePlanStore()
  const { cardioLog } = useCardioStore()
  const posingLog = posingStore.useValue()
  const sleepLog = sleepStore.useValue()

  if (!dietPlan && !trainingPlan) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Weekly Prep Scorecard</p>
        <p className="text-sm text-gray-600">No plan yet.</p>
      </div>
    )
  }

  const today = new Date()
  const dow = today.getDay()
  const daysSinceMon = dow === 0 ? 6 : dow - 1
  const weekDates: string[] = []
  for (let i = daysSinceMon; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    weekDates.push(localDateStr(d))
  }
  const daysElapsed = weekDates.length

  const sessions = trainingPlan?.sessions ?? []
  const scheduledThisWeek = weekDates.filter(dateStr => {
    const d = new Date(dateStr + 'T12:00:00')
    const dDow = d.getDay() === 0 ? 7 : d.getDay()
    return sessions.some(s => s.day_of_week === dDow)
  })
  const completedThisWeek = scheduledThisWeek.filter(dateStr =>
    workoutHistory.some(l => l.status === 'completed' && l.date === dateStr)
  )
  const trainingScore = scheduledThisWeek.length > 0 ? Math.round(completedThisWeek.length / scheduledThisWeek.length * 100) : null

  const totalMealsPerDay = dietPlan?.meals?.length ?? 0
  const expectedMeals = daysElapsed * totalMealsPerDay
  const loggedMeals = mealCompletions.filter(c => weekDates.includes(c.date)).length
  const mealScore = expectedMeals > 0 ? Math.min(100, Math.round(loggedMeals / expectedMeals * 100)) : null

  const cardioDays = weekDates.filter(d => cardioLog.some(e => e.date === d)).length
  const posingDays = weekDates.filter(d => posingLog.some(e => e.date === d)).length
  const goodSleepDays = weekDates.filter(d => sleepLog.some(e => e.date === d && e.hours >= 7)).length

  function pillColor(val: number, outOf: number) {
    const pct = outOf > 0 ? val / outOf * 100 : 0
    if (pct >= 80) return { text: 'text-green-400', bg: 'bg-green-900/20 border-green-800/40' }
    if (pct >= 50) return { text: 'text-amber-400', bg: 'bg-amber-900/20 border-amber-800/40' }
    return { text: 'text-red-400', bg: 'bg-red-900/20 border-red-800/40' }
  }
  const noData = 'bg-gray-800/40 border-gray-700/50'
  const dayLabel = `Mon–${DAY_NAMES[dow === 0 ? 0 : dow].slice(0, 3)}`
  const trainC = trainingScore !== null ? pillColor(trainingScore, 100) : null
  const mealC = mealScore !== null ? pillColor(mealScore, 100) : null
  const cardioC = pillColor(cardioDays, daysElapsed)
  const posingC = pillColor(posingDays, daysElapsed)
  const sleepC = pillColor(goodSleepDays, daysElapsed)

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Weekly Prep Scorecard</p>
        <span className="text-xs text-gray-600">{dayLabel}</span>
      </div>
      <div className="grid grid-cols-5 gap-2 text-center">
        <div className={`rounded-lg border p-2 ${trainC ? trainC.bg : noData}`}>
          <p className={`text-lg font-bold leading-none mb-1 ${trainC ? trainC.text : 'text-gray-600'}`}>
            {trainingScore !== null ? `${trainingScore}%` : '—'}
          </p>
          <p className="text-xs text-gray-500 leading-tight">Training</p>
          <p className="text-xs text-gray-700 mt-0.5">
            {scheduledThisWeek.length > 0 ? `${completedThisWeek.length}/${scheduledThisWeek.length} sessions` : sessions.length > 0 ? 'not yet' : 'no plan'}
          </p>
        </div>
        <div className={`rounded-lg border p-2 ${mealC ? mealC.bg : noData}`}>
          <p className={`text-lg font-bold leading-none mb-1 ${mealC ? mealC.text : 'text-gray-600'}`}>
            {mealScore !== null ? `${mealScore}%` : '—'}
          </p>
          <p className="text-xs text-gray-500 leading-tight">Meals</p>
          <p className="text-xs text-gray-700 mt-0.5">
            {expectedMeals > 0 ? `${loggedMeals}/${expectedMeals}` : 'no plan'}
          </p>
        </div>
        <div className={`rounded-lg border p-2 ${cardioDays > 0 ? cardioC.bg : noData}`}>
          <p className={`text-lg font-bold leading-none mb-1 ${cardioDays > 0 ? cardioC.text : 'text-gray-600'}`}>{cardioDays}</p>
          <p className="text-xs text-gray-500 leading-tight">Cardio</p>
          <p className="text-xs text-gray-700 mt-0.5">days</p>
        </div>
        <div className={`rounded-lg border p-2 ${posingDays > 0 ? posingC.bg : noData}`}>
          <p className={`text-lg font-bold leading-none mb-1 ${posingDays > 0 ? posingC.text : 'text-gray-600'}`}>{posingDays}</p>
          <p className="text-xs text-gray-500 leading-tight">Posing</p>
          <p className="text-xs text-gray-700 mt-0.5">days</p>
        </div>
        <div className={`rounded-lg border p-2 ${goodSleepDays > 0 ? sleepC.bg : noData}`}>
          <p className={`text-lg font-bold leading-none mb-1 ${goodSleepDays > 0 ? sleepC.text : 'text-gray-600'}`}>{goodSleepDays}</p>
          <p className="text-xs text-gray-500 leading-tight">Sleep</p>
          <p className="text-xs text-gray-700 mt-0.5">≥7h days</p>
        </div>
      </div>
    </div>
  )
}
