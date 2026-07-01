import { usePlanStore } from '../../store/planStore'

function localDateStr(d: Date): string {
  return d.toLocaleDateString('en-CA')
}

export default function SessionsWeekWidget() {
  const { trainingPlan, workoutHistory } = usePlanStore()

  const today = new Date()
  const dow = today.getDay() // 0=Sun…6=Sat
  const daysSinceMon = dow === 0 ? 6 : dow - 1
  const weekDates: string[] = []
  for (let i = daysSinceMon; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    weekDates.push(localDateStr(d))
  }

  const sessions = trainingPlan?.sessions ?? []
  const scheduledThisWeek = weekDates.filter((dateStr) => {
    const d = new Date(dateStr + 'T12:00:00')
    const dDow = d.getDay() === 0 ? 7 : d.getDay()
    return sessions.some((s) => s.day_of_week === dDow)
  })
  const completedThisWeek = scheduledThisWeek.filter((dateStr) =>
    workoutHistory.some((l) => l.status === 'completed' && l.date === dateStr)
  )
  const pct = scheduledThisWeek.length > 0
    ? Math.round((completedThisWeek.length / scheduledThisWeek.length) * 100)
    : null
  const color = pct === null ? 'text-gray-600' : pct >= 80 ? 'text-green-400' : pct >= 50 ? 'text-amber-400' : 'text-red-400'

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Sessions This Week</p>
        <span className="text-xs text-gray-600">Mon–today</span>
      </div>
      <div className="flex items-end gap-3">
        <p className="text-3xl font-black text-gray-100">
          {completedThisWeek.length}
          <span className="text-lg font-bold text-gray-600">/{scheduledThisWeek.length}</span>
        </p>
        {pct !== null && <p className={`text-sm font-bold ${color} mb-1`}>{pct}%</p>}
      </div>
      <p className="text-xs text-gray-500 mt-1">
        {sessions.length === 0
          ? 'No training plan yet'
          : scheduledThisWeek.length === 0
            ? 'No sessions scheduled so far this week'
            : `${completedThisWeek.length} of ${scheduledThisWeek.length} scheduled sessions completed`}
      </p>
    </div>
  )
}
