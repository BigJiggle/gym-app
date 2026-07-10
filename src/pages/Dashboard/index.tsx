import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useUserStore } from '../../store/userStore'
import { usePlanStore } from '../../store/planStore'
import Button from '../../components/ui/Button'
import WidgetZone from '../../components/widgets/WidgetZone'
import { localDateStr } from '../../utils/dates'

export default function Dashboard() {
  const { user } = useUserStore()
  const {
    trainingPlan,
    dietPlan,
    latestCheckin,
    mealCompletions,
    workoutHistory,
    lastRefreshMessage,
    loadTrainingPlan,
    loadDietPlan,
    loadCheckinHistory,
    loadMealCompletions,
    loadWorkoutHistory,
    clearRefreshMessage,
  } = usePlanStore()

  const todayStr = localDateStr()
  const [nextCheckinAt, setNextCheckinAt] = useState<Date | null>(null)

  useEffect(() => {
    if (!user) return
    loadTrainingPlan(user.id)
    loadDietPlan(user.id)
    loadCheckinHistory(user.id)
    // Load 60 days of completions so the adherence streak below can look back.
    const streakWindowStart = (() => { const d = new Date(); d.setDate(d.getDate() - 60); return localDateStr(d) })()
    loadMealCompletions(user.id, streakWindowStart, todayStr)
    loadWorkoutHistory(user.id)
  }, [user?.id])

  // Refresh the next-check-in date whenever the latest check-in changes so the
  // header check-in button stays current.
  useEffect(() => {
    if (!user) return
    window.api.getNextCheckinDate(user.id)
      .then((iso: string | null) => setNextCheckinAt(iso ? new Date(iso) : null))
      .catch(() => setNextCheckinAt(null))
  }, [user?.id, latestCheckin])

  if (!user) return null

  // Adherence streak — consecutive days (counting back from yesterday) where every
  // planned meal was logged AND any scheduled session that day was completed.
  const adherenceStreak = (() => {
    const totalMeals = dietPlan?.meals?.length ?? 0
    const sessions = trainingPlan?.sessions ?? []
    if (totalMeals === 0) return 0
    let streak = 0
    for (let offset = 1; offset <= 60; offset++) {
      const d = new Date()
      d.setDate(d.getDate() - offset)
      const dateStr = localDateStr(d)
      const loggedCount = mealCompletions.filter(c => c.date === dateStr).length
      if (loggedCount < totalMeals) break
      const dow = d.getDay() === 0 ? 7 : d.getDay()
      const hadSession = sessions.some(s => s.day_of_week === dow)
      if (hadSession && !workoutHistory.some(l => l.status === 'completed' && l.date === dateStr)) break
      streak++
    }
    return streak
  })()

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">
            Welcome back, {user.name.split(' ')[0]}
          </h1>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-gray-500">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
            {adherenceStreak > 0 && (
              <span
                className="inline-flex items-center gap-1 text-xs font-semibold text-orange-400 bg-orange-900/20 border border-orange-800/40 rounded-full px-2 py-0.5"
                title="Consecutive days with every planned meal logged and any scheduled workout completed"
              >
                🔥 {adherenceStreak}-day streak
              </span>
            )}
          </div>
        </div>
        {(() => {
          const now = new Date()
          const locked = nextCheckinAt !== null && nextCheckinAt > now
          if (locked) {
            const daysLeft = Math.ceil((nextCheckinAt!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
            const openDateStr = nextCheckinAt!.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
            return (
              <div className="text-right">
                <Button size="sm" variant="secondary" disabled>
                  Opens {openDateStr}
                </Button>
                <p className="text-xs text-gray-600 mt-1">in {daysLeft} day{daysLeft !== 1 ? 's' : ''}</p>
              </div>
            )
          }
          return (
            <Link to="/checkin">
              <Button size="sm">+ Check-In</Button>
            </Link>
          )
        })()}
      </div>

      {/* Auto-refresh notification — shown when plans were updated on startup */}
      {lastRefreshMessage && (
        <div className="bg-brand-900/20 border border-brand-700/40 rounded-xl p-3 flex items-start justify-between gap-3">
          <p className="text-sm text-brand-300">{lastRefreshMessage}</p>
          <button
            onClick={clearRefreshMessage}
            aria-label="Dismiss notification"
            title="Dismiss"
            className="text-gray-500 hover:text-gray-300 text-xs flex-shrink-0 mt-0.5"
          >
            ✕
          </button>
        </div>
      )}

      {/* Everything on the dashboard is a widget — add, remove, and reorder from here. */}
      <WidgetZone />

      {/* Quick links */}
      <div className="flex flex-wrap gap-x-6 gap-y-2 px-1">
        {[
          { to: '/training', label: 'Training Plan' },
          { to: '/diet', label: 'Nutrition Plan' },
          { to: '/progress', label: 'Progress' },
          { to: '/education', label: 'Posing Guide' },
        ].map(({ to, label }) => (
          <Link key={to} to={to} className="text-sm text-brand-400 hover:text-brand-300 transition-colors">
            {label} →
          </Link>
        ))}
      </div>
    </div>
  )
}
