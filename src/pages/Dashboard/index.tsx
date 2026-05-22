import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useUserStore } from '../../store/userStore'
import { usePlanStore } from '../../store/planStore'
import { useSettingsStore } from '../../store/settingsStore'
import { StatCard } from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import { localDateStr, getShowCountdown } from '../../utils/dates'
import { displayWeight } from '../../utils/units'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function Dashboard() {
  const { user } = useUserStore()
  const { settings } = useSettingsStore()
  const {
    trainingPlan,
    dietPlan,
    latestCheckin,
    checkinHistory,
    mealCompletions,
    lastRefreshMessage,
    loadTrainingPlan,
    loadDietPlan,
    loadCheckinHistory,
    loadMealCompletions,
    logMealCompletion,
    unlogMealCompletion,
    clearRefreshMessage,
  } = usePlanStore()

  const todayStr = localDateStr()

  useEffect(() => {
    if (!user) return
    loadTrainingPlan(user.id)
    loadDietPlan(user.id)
    loadCheckinHistory(user.id)
    loadMealCompletions(user.id, todayStr, todayStr)
  }, [user?.id])

  if (!user) return null

  const isMealDone = (idx: number) => mealCompletions.some(c => c.date === todayStr && c.meal_index === idx)

  async function handleToggleMeal(idx: number, name: string) {
    if (isMealDone(idx)) {
      unlogMealCompletion(user!.id, todayStr, idx)
    } else {
      logMealCompletion(user!.id, todayStr, idx, name)
    }
  }

  // ISO weekday: Mon=1 … Sun=7 — matches day_of_week in training sessions
  const jsDay = new Date().getDay()
  const todayDow = jsDay === 0 ? 7 : jsDay
  const todaySession = trainingPlan?.sessions?.find((s) => s.day_of_week === todayDow)
  const showCountdown = user.show_date ? getShowCountdown(user.show_date) : null

  // Next training session after today (for rest-day preview)
  const nextSession = (() => {
    if (!trainingPlan?.sessions?.length) return null
    const sorted = [...trainingPlan.sessions].sort((a, b) => a.day_of_week - b.day_of_week)
    return sorted.find(s => s.day_of_week > todayDow) ?? sorted[0]
  })()

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">
            Welcome back, {user.name.split(' ')[0]}
          </h1>
          <p className="text-gray-500 mt-0.5">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <Link to="/checkin">
          <Button size="sm">+ Check-In</Button>
        </Link>
      </div>

      {/* Auto-refresh notification — shown when plans were updated on startup */}
      {lastRefreshMessage && (
        <div className="bg-brand-900/20 border border-brand-700/40 rounded-xl p-3 flex items-start justify-between gap-3">
          <p className="text-sm text-brand-300">{lastRefreshMessage}</p>
          <button
            onClick={clearRefreshMessage}
            className="text-gray-500 hover:text-gray-300 text-xs flex-shrink-0 mt-0.5"
          >
            ✕
          </button>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(() => {
          const wt = displayWeight(latestCheckin?.weight_kg ?? user.weight_kg, settings.units)
          return (
            <StatCard
              label="Current Weight"
              value={wt.value}
              unit={wt.unit}
              delta={latestCheckin ? `Week ${latestCheckin.week_number}` : 'Starting weight'}
              color="brand"
            />
          )
        })()}
        <StatCard
          label="Daily Calories"
          value={dietPlan?.calories_target ?? '—'}
          unit="kcal"
          delta={`${dietPlan?.protein_g ?? '—'}g protein`}
          color="green"
        />
        {showCountdown !== null ? (
          <StatCard
            label="Show Countdown"
            value={(() => {
              const { weeks, days, totalDays } = showCountdown
              if (totalDays === 0) return 'Show Day!'
              if (weeks === 0) return `${days} day${days !== 1 ? 's' : ''}`
              if (days === 0) return `${weeks} week${weeks !== 1 ? 's' : ''}`
              return `${weeks} week${weeks !== 1 ? 's' : ''} ${days} day${days !== 1 ? 's' : ''}`
            })()}
            unit={showCountdown.totalDays > 0 ? 'out' : ''}
            delta={user.division ?? 'competition'}
            color="blue"
          />
        ) : (
          <StatCard label="Phase" value={trainingPlan?.phase ?? '—'} delta="current training phase" color="blue" />
        )}
        <StatCard
          label="Training Days"
          value={user.training_frequency}
          unit="/ week"
          delta={trainingPlan?.name?.split('—')[0]?.trim() ?? '—'}
          color="brand"
        />
      </div>

      {/* Prep Pace — only shown when 2+ check-ins exist */}
      {checkinHistory.length >= 2 && (() => {
        const isImperial = settings.units === 'imperial'
        const wUnit = isImperial ? 'lbs' : 'kg'
        const recent = checkinHistory.slice(0, 4)
        const newest = recent[0]
        const oldest = recent[recent.length - 1]
        const daysDiff = (new Date(newest.check_in_date).getTime() - new Date(oldest.check_in_date).getTime()) / (1000 * 60 * 60 * 24)
        const weeksDiff = daysDiff / 7
        if (weeksDiff <= 0) return null
        const weeklyRateKg = (newest.weight_kg - oldest.weight_kg) / weeksDiff
        const weeklyRateDisplay = isImperial
          ? Math.round(weeklyRateKg * 2.20462 * 10) / 10
          : Math.round(weeklyRateKg * 10) / 10
        const currentWeightKg = checkinHistory[0].weight_kg
        const pctPerWeek = currentWeightKg > 0 ? Math.abs(weeklyRateKg) / currentWeightKg : 0
        type Status = 'on_track' | 'too_fast' | 'too_slow' | 'gaining' | 'neutral'
        let status: Status = 'neutral'
        if (user.goal === 'cut') {
          if (weeklyRateKg >= 0) status = 'gaining'
          else if (pctPerWeek > 0.012) status = 'too_fast'
          else if (pctPerWeek < 0.003) status = 'too_slow'
          else status = 'on_track'
        } else if (user.goal === 'bulk') {
          if (weeklyRateKg <= 0) status = 'too_slow'
          else if (pctPerWeek > 0.01) status = 'too_fast'
          else status = 'on_track'
        }
        const STATUS_LABEL: Record<Status, string> = {
          on_track: 'On Track',
          too_fast: user.goal === 'bulk' ? 'Gaining Too Fast' : 'Losing Too Fast',
          too_slow: user.goal === 'bulk' ? 'Not Gaining' : 'Losing Too Slow',
          gaining: 'Weight Trending Up',
          neutral: 'Tracking',
        }
        const STATUS_COLOR: Record<Status, string> = {
          on_track: 'text-green-400 bg-green-900/20 border-green-800/40',
          too_fast: 'text-red-400 bg-red-900/20 border-red-800/40',
          too_slow: 'text-amber-400 bg-amber-900/20 border-amber-800/40',
          gaining: 'text-red-400 bg-red-900/20 border-red-800/40',
          neutral: 'text-gray-400 bg-gray-800 border-gray-700',
        }
        return (
          <Link to="/progress" className="block">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between hover:border-gray-700 transition-colors">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Prep Pace</p>
                <p className={`text-lg font-bold ${weeklyRateKg < 0 ? 'text-green-400' : weeklyRateKg > 0 ? 'text-amber-400' : 'text-gray-300'}`}>
                  {weeklyRateDisplay > 0 ? '+' : ''}{weeklyRateDisplay} {wUnit}/wk
                </p>
                <p className="text-xs text-gray-600 mt-0.5">avg last {Math.min(checkinHistory.length, 4)} check-ins · tap for full chart</p>
              </div>
              <span className={`text-xs font-medium px-3 py-1.5 rounded-full border ${STATUS_COLOR[status]}`}>
                {STATUS_LABEL[status]}
              </span>
            </div>
          </Link>
        )
      })()}

      {/* Today's workout + Latest check-in */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Today */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-100">Today — {DAY_NAMES[jsDay]}</h2>
            {todaySession ? (
              <Badge variant="brand">Training Day</Badge>
            ) : (
              <Badge variant="default">Rest Day</Badge>
            )}
          </div>
          {todaySession ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-brand-400">{todaySession.session_name}</p>
              <div className="space-y-1">
                {todaySession.exercises.slice(0, 5).map((ex, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-gray-300">{ex.name}</span>
                    <span className="text-gray-500">{ex.sets} × {ex.reps} @RIR{ex.rir}</span>
                  </div>
                ))}
                {(todaySession.exercises.length ?? 0) > 5 && (
                  <p className="text-xs text-gray-600">+{todaySession.exercises.length - 5} more exercises</p>
                )}
              </div>
              <Link to="/training">
                <Button size="sm" className="w-full mt-2">
                  ▶ Start Today's Workout
                </Button>
              </Link>
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
                  <div className="mt-1.5 space-y-0.5">
                    {nextSession.exercises.slice(0, 4).map((ex, i) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className="text-gray-500">{ex.name}</span>
                        <span className="text-gray-700">{ex.sets}×{ex.reps}</span>
                      </div>
                    ))}
                    {nextSession.exercises.length > 4 && (
                      <p className="text-xs text-gray-700">+{nextSession.exercises.length - 4} more</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Latest check-in feedback */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h2 className="font-semibold text-gray-100 mb-3">Coach Notes</h2>
          {latestCheckin ? (
            <div className="space-y-2">
              <div className="flex gap-2 text-sm">
                <span className="text-gray-500">Week {latestCheckin.week_number}:</span>
                <span className="text-gray-300">
                  {(() => { const w = displayWeight(latestCheckin.weight_kg, settings.units); return `${w.value} ${w.unit}` })()}
                </span>
              </div>
              <div className="space-y-1.5">
                {latestCheckin.adjustments.notes.map((note, i) => (
                  <div key={i} className="flex gap-2 text-sm">
                    <span className="text-brand-500 mt-0.5 flex-shrink-0">›</span>
                    <span className="text-gray-400">{note}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="py-4 text-center space-y-2">
              <p className="text-gray-500 text-sm">No check-ins yet.</p>
              <Link to="/checkin">
                <Button size="sm" variant="secondary">Submit First Check-In</Button>
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Today's Meals */}
      <div className="grid grid-cols-1 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-100">Today's Meals</h2>
            {dietPlan && (
              <Link to="/diet">
                <span className="text-xs text-brand-400 hover:text-brand-300">View Plan →</span>
              </Link>
            )}
          </div>

          {!dietPlan ? (
            <div className="py-3 text-center space-y-2">
              <p className="text-gray-500 text-sm">No nutrition plan yet.</p>
              <Link to="/diet">
                <Button size="sm" variant="secondary">Generate Plan →</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-1.5">
              {(dietPlan.meals ?? []).map((meal, idx) => {
                const done = isMealDone(idx)
                return (
                  <div
                    key={idx}
                    className={`flex items-center gap-3 py-1.5 px-2 rounded-lg transition-colors ${done ? 'bg-green-950/20' : 'hover:bg-gray-800'}`}
                  >
                    <button
                      onClick={() => handleToggleMeal(idx, meal.name)}
                      className={`w-5 h-5 rounded-full flex-shrink-0 border-2 flex items-center justify-center transition-colors ${
                        done ? 'border-green-500 bg-green-500 text-white' : 'border-gray-600 hover:border-green-500'
                      }`}
                    >
                      {done && <span className="text-xs">✓</span>}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className={`text-sm ${done ? 'text-gray-500 line-through' : 'text-gray-200'}`}>{meal.name}</span>
                        <span className="text-xs text-gray-500 ml-2 flex-shrink-0">{meal.calories} kcal</span>
                      </div>
                      <span className="text-xs text-gray-600">{meal.time}</span>
                    </div>
                  </div>
                )
              })}
              {/* Macro progress */}
              {(dietPlan.meals?.length ?? 0) > 0 && (() => {
                const eatenIndices = new Set(
                  mealCompletions.filter(c => c.date === todayStr).map(c => c.meal_index)
                )
                const meals = dietPlan.meals ?? []
                const eatenCals = meals.reduce((sum, m, i) => sum + (eatenIndices.has(i) ? m.calories : 0), 0)
                const eatenProtein = meals.reduce((sum, m, i) => sum + (eatenIndices.has(i) ? m.protein_g : 0), 0)
                const calPct = Math.min(100, Math.round((eatenCals / dietPlan.calories_target) * 100))
                const proteinPct = Math.min(100, Math.round((eatenProtein / dietPlan.protein_g) * 100))
                const remainingCals = dietPlan.calories_target - eatenCals
                const remainingProtein = dietPlan.protein_g - eatenProtein
                return (
                  <div className="mt-3 pt-3 border-t border-gray-800 space-y-2">
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-400">Calories</span>
                        <span className="text-gray-300">
                          <span className="text-brand-400 font-medium">{eatenCals}</span>
                          <span className="text-gray-600"> / {dietPlan.calories_target} kcal</span>
                          {remainingCals > 0 && <span className="text-gray-600"> · {remainingCals} left</span>}
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-brand-500 transition-all duration-300"
                          style={{ width: `${calPct}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-400">Protein</span>
                        <span className="text-gray-300">
                          <span className={`font-medium ${proteinPct >= 80 ? 'text-green-400' : proteinPct >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>{eatenProtein}g</span>
                          <span className="text-gray-600"> / {dietPlan.protein_g}g</span>
                          {remainingProtein > 0 && <span className="text-gray-600"> · {remainingProtein}g left</span>}
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${proteinPct >= 80 ? 'bg-green-500' : proteinPct >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`}
                          style={{ width: `${proteinPct}%` }}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-gray-600 text-right">{eatenIndices.size}/{meals.length} meals logged</p>
                  </div>
                )
              })()}
            </div>
          )}
        </div>
      </div>

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
