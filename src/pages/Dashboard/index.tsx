import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useUserStore } from '../../store/userStore'
import { usePlanStore } from '../../store/planStore'
import { useSettingsStore } from '../../store/settingsStore'
import { StatCard } from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import { localDateStr, getShowCountdown } from '../../utils/dates'
import { displayWeight } from '../../utils/units'
import { buildPrepTimeline } from '../../data/competitionPrep'
import type { ExerciseLibraryItem } from '../../types'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MUSCLE_GROUPS = ['chest', 'back', 'shoulders', 'triceps', 'biceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core']
const MUSCLE_LABEL: Record<string, string> = {
  chest: 'Chest', back: 'Back', shoulders: 'Delts', triceps: 'Tris',
  biceps: 'Bis', quads: 'Quads', hamstrings: 'Hams', glutes: 'Glutes',
  calves: 'Calves', core: 'Core',
}

export default function Dashboard() {
  const { user, shows } = useUserStore()
  const { settings } = useSettingsStore()
  const {
    trainingPlan,
    dietPlan,
    latestCheckin,
    checkinHistory,
    mealCompletions,
    workoutHistory,
    lastRefreshMessage,
    loadTrainingPlan,
    loadDietPlan,
    loadCheckinHistory,
    loadMealCompletions,
    loadWorkoutHistory,
    logMealCompletion,
    unlogMealCompletion,
    clearRefreshMessage,
  } = usePlanStore()

  const todayStr = localDateStr()
  const [exerciseLibrary, setExerciseLibrary] = useState<ExerciseLibraryItem[]>([])
  const [waterMl, setWaterMl] = useState(0)
  const [waterTargetMl, setWaterTargetMl] = useState(3000)
  const [editingWaterTarget, setEditingWaterTarget] = useState(false)
  const [waterTargetInput, setWaterTargetInput] = useState('')
  const [nextCheckinAt, setNextCheckinAt] = useState<Date | null>(null)
  const [checkedMilestones, setCheckedMilestones] = useState<boolean[]>([])

  interface CardioEntry { date: string; type: string; minutes: number }
  const [cardioLog, setCardioLog] = useState<CardioEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem('cardio_log') ?? '[]') } catch { return [] }
  })
  const [cardioInputOpen, setCardioInputOpen] = useState(false)
  const [cardioType, setCardioType] = useState('LISS')
  const [cardioMinutes, setCardioMinutes] = useState('')

  function saveCardioLog(entries: CardioEntry[]) {
    setCardioLog(entries)
    localStorage.setItem('cardio_log', JSON.stringify(entries))
  }

  function logCardio() {
    const mins = parseInt(cardioMinutes, 10)
    if (!cardioType || isNaN(mins) || mins <= 0) return
    const updated = [...cardioLog.filter(e => e.date !== todayStr), { date: todayStr, type: cardioType, minutes: mins }]
    saveCardioLog(updated)
    setCardioInputOpen(false)
    setCardioMinutes('')
  }

  function removeCardioToday() {
    saveCardioLog(cardioLog.filter(e => e.date !== todayStr))
  }

  function quickLogCardio(type: string, minutes: number) {
    const updated = [...cardioLog.filter(e => e.date !== todayStr), { date: todayStr, type, minutes }]
    saveCardioLog(updated)
  }

  useEffect(() => {
    if (!user) return
    loadTrainingPlan(user.id)
    loadDietPlan(user.id)
    loadCheckinHistory(user.id)
    // Load 60 days of completions (not just today) so the adherence streak
    // below can look back over recent history.
    const streakWindowStart = (() => { const d = new Date(); d.setDate(d.getDate() - 60); return localDateStr(d) })()
    loadMealCompletions(user.id, streakWindowStart, todayStr)
    loadWorkoutHistory(user.id)
  }, [user?.id])

  // Refresh the next-check-in date whenever the latest check-in changes
  // (e.g. right after submitting one) so the Dashboard status stays current.
  useEffect(() => {
    if (!user) return
    window.api.getNextCheckinDate(user.id)
      .then((iso: string | null) => setNextCheckinAt(iso ? new Date(iso) : null))
      .catch(() => setNextCheckinAt(null))
  }, [user?.id, latestCheckin])

  useEffect(() => {
    window.api.getExerciseLibrary().then(setExerciseLibrary)
  }, [])

  useEffect(() => {
    const stored = parseInt(localStorage.getItem(`water_ml_${todayStr}`) ?? '0', 10)
    setWaterMl(isNaN(stored) ? 0 : stored)
    const storedTarget = parseInt(localStorage.getItem('water_target_ml') ?? '0', 10)
    if (storedTarget > 0) setWaterTargetMl(storedTarget)
    else setWaterTargetMl(settings.units === 'imperial' ? 3785 : 3000)
  }, [todayStr])

  // Nearest upcoming show + this week's prep guidance — drives both the
  // "This Week in Prep" card and its persisted milestone checklist below.
  const nearestShow = [...shows]
    .filter(s => s.show_date >= todayStr)
    .sort((a, b) => a.show_date.localeCompare(b.show_date))[0]
  const currentPrepWeek = nearestShow
    ? buildPrepTimeline(nearestShow.show_date).find(w => w.isCurrentWeek) ?? null
    : null
  const milestoneStorageKey = nearestShow && currentPrepWeek
    ? `milestones_${nearestShow.id}_${currentPrepWeek.weeksOut}`
    : null

  // Load this week's checked-off milestones whenever the relevant show/week changes
  useEffect(() => {
    if (!milestoneStorageKey) { setCheckedMilestones([]); return }
    try {
      const stored = JSON.parse(localStorage.getItem(milestoneStorageKey) ?? '[]')
      setCheckedMilestones(Array.isArray(stored) ? stored : [])
    } catch {
      setCheckedMilestones([])
    }
  }, [milestoneStorageKey])

  function toggleMilestone(index: number) {
    if (!milestoneStorageKey) return
    const next = [...checkedMilestones]
    next[index] = !next[index]
    setCheckedMilestones(next)
    localStorage.setItem(milestoneStorageKey, JSON.stringify(next))
  }

  if (!user) return null

  const isMealDone = (idx: number) => mealCompletions.some(c => c.date === todayStr && c.meal_index === idx)

  // Adherence streak — consecutive days (counting backward from yesterday,
  // since today is still in progress) where every planned meal was logged
  // AND any scheduled training session that day was completed. Derived
  // entirely from already-loaded mealCompletions/workoutHistory/trainingPlan
  // — no new IPC calls or persisted state needed.
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

  async function handleToggleMeal(idx: number, name: string) {
    if (isMealDone(idx)) {
      unlogMealCompletion(user!.id, todayStr, idx)
    } else {
      logMealCompletion(user!.id, todayStr, idx, name)
    }
  }

  function addWater(ml: number) {
    const newVal = Math.max(0, waterMl + ml)
    setWaterMl(newVal)
    localStorage.setItem(`water_ml_${todayStr}`, String(newVal))
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

  const lastPerformanceMap = (() => {
    const map = new Map<string, { weight_kg: number; reps: number }>()
    const sorted = [...workoutHistory]
      .filter(l => l.status === 'completed')
      .sort((a, b) => b.date.localeCompare(a.date))
    for (const log of sorted) {
      for (const set of log.sets ?? []) {
        if (set.skipped || set.weight_kg == null || set.reps_actual == null) continue
        if (!map.has(set.exercise_name)) {
          const best = (log.sets ?? [])
            .filter(s => s.exercise_name === set.exercise_name && !s.skipped && s.weight_kg != null && s.reps_actual != null)
            .reduce<{ weight_kg: number; reps: number } | null>(
              (b, s) => !b || s.weight_kg! > b.weight_kg ? { weight_kg: s.weight_kg!, reps: s.reps_actual! } : b,
              null
            )
          if (best) map.set(set.exercise_name, best)
        }
      }
    }
    return map
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

      {/* Today's Macros — consumed vs target at a glance */}
      {dietPlan && (() => {
        const meals = dietPlan.meals ?? []
        if (meals.length === 0) return null
        const todayDone = mealCompletions.filter(c => c.date === todayStr)
        const mealsEaten = todayDone.length
        const totalMeals = meals.length
        const consumedCal = todayDone.reduce((s, c) => s + (meals[c.meal_index]?.calories ?? 0), 0)
        const consumedPro = todayDone.reduce((s, c) => s + (meals[c.meal_index]?.protein_g ?? 0), 0)
        const consumedCarb = todayDone.reduce((s, c) => s + (meals[c.meal_index]?.carbs_g ?? 0), 0)
        const consumedFat = todayDone.reduce((s, c) => s + (meals[c.meal_index]?.fat_g ?? 0), 0)
        const calPct = Math.min(100, dietPlan.calories_target > 0 ? Math.round(consumedCal / dietPlan.calories_target * 100) : 0)
        const proPct = Math.min(100, dietPlan.protein_g > 0 ? Math.round(consumedPro / dietPlan.protein_g * 100) : 0)
        const carbPct = Math.min(100, dietPlan.carbs_g > 0 ? Math.round(consumedCarb / dietPlan.carbs_g * 100) : 0)
        const fatPct = Math.min(100, dietPlan.fat_g > 0 ? Math.round(consumedFat / dietPlan.fat_g * 100) : 0)
        const remaining = dietPlan.calories_target - consumedCal
        return (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Today's Macros</p>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${mealsEaten === totalMeals ? 'bg-green-900/30 text-green-400' : 'bg-gray-800 text-gray-500'}`}>
                {mealsEaten}/{totalMeals} meals
              </span>
            </div>
            {[
              { label: 'Calories', consumed: consumedCal, target: dietPlan.calories_target, pct: calPct, unit: 'kcal', color: calPct >= 100 ? 'bg-green-500' : 'bg-brand-500', textColor: calPct >= 100 ? 'text-green-400' : 'text-brand-400' },
              { label: 'Protein', consumed: consumedPro, target: dietPlan.protein_g, pct: proPct, unit: 'g', color: proPct >= 100 ? 'bg-green-500' : 'bg-green-600', textColor: proPct >= 100 ? 'text-green-400' : 'text-green-300' },
              { label: 'Carbs', consumed: consumedCarb, target: dietPlan.carbs_g, pct: carbPct, unit: 'g', color: carbPct >= 100 ? 'bg-green-500' : 'bg-blue-500', textColor: carbPct >= 100 ? 'text-green-400' : 'text-blue-400' },
              { label: 'Fat', consumed: consumedFat, target: dietPlan.fat_g, pct: fatPct, unit: 'g', color: fatPct >= 100 ? 'bg-green-500' : 'bg-yellow-500', textColor: fatPct >= 100 ? 'text-green-400' : 'text-yellow-400' },
            ].map(({ label, consumed, target, pct, unit, color, textColor }) => (
              <div key={label}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-500">{label}</span>
                  <span className={textColor}>{consumed}{unit === 'kcal' ? '' : 'g'} / {target}{unit === 'kcal' ? ' kcal' : 'g'}</span>
                </div>
                <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-300 ${color}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            ))}
            {mealsEaten > 0 && remaining > 0 && (
              <p className="text-xs text-gray-600 pt-0.5">{remaining} kcal remaining · {Math.max(0, dietPlan.protein_g - consumedPro)}g protein left</p>
            )}
          </div>
        )
      })()}

      {/* Next Meal — upcoming un-eaten meal quick-glance */}
      {dietPlan && (() => {
        const nowDate = new Date()
        const nowMins = nowDate.getHours() * 60 + nowDate.getMinutes()
        const meals = dietPlan.meals ?? []
        const todayMealsDone = new Set(
          mealCompletions.filter(c => c.date === todayStr).map(c => c.meal_index)
        )
        const allDone = meals.length > 0 && meals.every((_, idx) => todayMealsDone.has(idx))
        if (allDone) {
          return (
            <div className="bg-green-950/20 border border-green-800/40 rounded-xl p-4 flex items-center gap-3">
              <span className="text-green-500 text-lg">✓</span>
              <div>
                <p className="text-sm font-semibold text-green-400">All meals logged for today!</p>
                <p className="text-xs text-gray-500">Great work hitting your nutrition targets.</p>
              </div>
            </div>
          )
        }
        const unloggedMeals = meals
          .map((meal, idx) => ({ meal, idx }))
          .filter(({ idx }) => !todayMealsDone.has(idx))
        const next = unloggedMeals.find(({ meal }) => {
            const [h, m] = meal.time.split(':').map(Number)
            return h * 60 + m > nowMins
          }) ?? unloggedMeals[0] ?? null
        if (!next) return null
        const { meal, idx } = next
        const [mealH, mealM] = meal.time.split(':').map(Number)
        const diffMins = mealH * 60 + mealM - nowMins
        const countdownStr = diffMins <= 0
          ? 'not yet logged'
          : diffMins < 60
            ? `in ${diffMins} min`
            : `in ${Math.floor(diffMins / 60)}h${diffMins % 60 > 0 ? ` ${diffMins % 60}m` : ''}`
        return (
          <div className="bg-gray-900 border border-brand-900/40 rounded-xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Next Meal</p>
                <div className="flex items-baseline gap-2 mb-0.5">
                  <p className="text-base font-semibold text-gray-100">{meal.name}</p>
                  <span className="text-xs text-gray-600">{meal.time}</span>
                </div>
                <p className={`text-sm font-medium mb-2 ${diffMins <= 0 ? 'text-amber-400' : 'text-brand-400'}`}>{countdownStr}</p>
                {meal.foods.length > 0 && (
                  <div className="space-y-0.5 mb-2">
                    {meal.foods.slice(0, 3).map((food, i) => (
                      <p key={i} className="text-xs text-gray-300 truncate">· {food}</p>
                    ))}
                    {meal.foods.length > 3 && (
                      <p className="text-xs text-gray-400">+{meal.foods.length - 3} more items</p>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-gray-300 font-medium">{meal.calories} kcal</span>
                  <span className="text-blue-400">{meal.protein_g}g protein</span>
                </div>
              </div>
              <button
                onClick={() => handleToggleMeal(idx, meal.name)}
                className="flex-shrink-0 text-xs font-medium px-3 py-1.5 bg-brand-900/30 border border-brand-700/50 text-brand-400 rounded-lg hover:bg-brand-900/50 transition-colors"
              >
                Mark Eaten
              </button>
            </div>
          </div>
        )
      })()}

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
                <p className={`text-lg font-bold ${
                  user.goal === 'bulk'
                    ? (weeklyRateKg > 0 ? 'text-green-400' : weeklyRateKg < 0 ? 'text-amber-400' : 'text-gray-300')
                    : (weeklyRateKg < 0 ? 'text-green-400' : weeklyRateKg > 0 ? 'text-amber-400' : 'text-gray-300')
                }`}>
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

      {/* This Week in Prep — shown when there's an upcoming show */}
      {(() => {
        if (!nearestShow || !currentPrepWeek) return null
        const { guidance } = currentPrepWeek
        const PHASE_BADGE: Record<string, string> = {
          green:  'bg-green-900/30 text-green-400 border-green-800/50',
          brand:  'bg-brand-900/30 text-brand-400 border-brand-800/50',
          blue:   'bg-blue-900/30 text-blue-400 border-blue-800/50',
          yellow: 'bg-yellow-900/20 text-yellow-400 border-yellow-800/50',
          orange: 'bg-orange-900/20 text-orange-400 border-orange-800/50',
          red:    'bg-red-900/20 text-red-400 border-red-800/50',
        }
        return (
          <Link to="/education" className="block">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-gray-500 uppercase tracking-wider">This Week in Prep</p>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${PHASE_BADGE[guidance.phaseColor]}`}>
                  {guidance.phase}
                </span>
              </div>
              <p className="text-sm text-gray-300 mb-3 leading-snug">{guidance.focus}</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs mb-3">
                <div className="bg-gray-800/60 rounded-lg px-3 py-2">
                  <p className="text-gray-500 mb-1 font-semibold uppercase tracking-wide" style={{ fontSize: 10 }}>Training</p>
                  <p className="text-gray-300 leading-snug">{guidance.training[0]}</p>
                </div>
                <div className="bg-gray-800/60 rounded-lg px-3 py-2">
                  <p className="text-gray-500 mb-1 font-semibold uppercase tracking-wide" style={{ fontSize: 10 }}>Nutrition</p>
                  <p className="text-gray-300 leading-snug">{guidance.nutrition[0]}</p>
                </div>
                <div className="bg-gray-800/60 rounded-lg px-3 py-2">
                  <p className="text-blue-500 mb-1 font-semibold uppercase tracking-wide" style={{ fontSize: 10 }}>Cardio</p>
                  <p className="text-gray-300 leading-snug">{guidance.cardio}</p>
                </div>
              </div>
              {guidance.milestones.length > 0 && (
                <div className="border-t border-gray-800 pt-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs text-gray-600">This week's milestones</p>
                    {checkedMilestones.filter(Boolean).length > 0 && (
                      <p className="text-xs text-gray-600">
                        {checkedMilestones.filter(Boolean).length}/{guidance.milestones.length} done
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    {guidance.milestones.map((m, i) => {
                      const checked = !!checkedMilestones[i]
                      return (
                        <div
                          key={i}
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleMilestone(i) }}
                          className="flex items-start gap-1.5 text-xs cursor-pointer group"
                        >
                          <span className={checked ? 'text-green-500' : 'text-gray-700 group-hover:text-gray-500'}>
                            {checked ? '☑' : '□'}
                          </span>
                          <span className={checked ? 'text-gray-600 line-through' : 'text-gray-400 group-hover:text-gray-300'}>
                            {m}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
              <p className="text-xs text-brand-500 mt-2">View full prep timeline →</p>
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
              {workoutHistory.some(l => l.status === 'completed' && l.date === todayStr) ? (
                <div className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-green-900/20 border border-green-800/40 text-green-400 text-sm font-medium">
                  <span>✓</span> Workout Complete
                </div>
              ) : (
                <Link to="/training">
                  <Button className="w-full">
                    ▶ Start Today's Workout
                  </Button>
                </Link>
              )}
              <div className="space-y-1.5 pt-1">
                {todaySession.exercises.slice(0, 5).map((ex, i) => {
                  const lp = lastPerformanceMap.get(ex.name)
                  const lastStr = lp
                    ? settings.units === 'imperial'
                      ? `${Math.round(lp.weight_kg * 2.20462 * 2) / 2}lbs × ${lp.reps}`
                      : `${lp.weight_kg}kg × ${lp.reps}`
                    : null
                  return (
                    <div key={i} className="flex items-start justify-between text-sm gap-2">
                      <div className="min-w-0">
                        <span className="text-gray-300">{ex.name}</span>
                        {lastStr && (
                          <p className="text-xs text-gray-600 mt-0.5">last: {lastStr}</p>
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
                        ? settings.units === 'imperial'
                          ? `${Math.round(lp.weight_kg * 2.20462 * 2) / 2}lbs×${lp.reps}`
                          : `${lp.weight_kg}kg×${lp.reps}`
                        : null
                      return (
                        <div key={i} className="flex items-start justify-between text-xs gap-2">
                          <div className="min-w-0">
                            <span className="text-gray-500">{ex.name}</span>
                            {lastStr && (
                              <p className="text-xs text-gray-700 mt-0.5">last: {lastStr}</p>
                            )}
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

        {/* Latest check-in feedback */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h2 className="font-semibold text-gray-100 mb-3">Check-In Feedback</h2>
          {(() => {
            const now = new Date()
            const isOpen = latestCheckin && (!nextCheckinAt || nextCheckinAt <= now)
            if (!latestCheckin || !isOpen && !nextCheckinAt) return null
            if (isOpen) {
              return (
                <Link to="/checkin" className="block mb-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-green-400 bg-green-900/20 border border-green-800/40 rounded-lg px-3 py-1.5 hover:border-green-700/60 transition-colors">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
                    Check-in is open — log this week's weigh-in →
                  </div>
                </Link>
              )
            }
            const msLeft = nextCheckinAt!.getTime() - now.getTime()
            const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24))
            return (
              <div className="mb-3 text-xs text-gray-500">
                Next check-in {daysLeft <= 1 ? 'opens tomorrow' : `opens in ${daysLeft} days`} · {nextCheckinAt!.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </div>
            )
          })()}
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
                    onClick={() => handleToggleMeal(idx, meal.name)}
                    className={`flex items-center gap-3 py-1.5 px-2 rounded-lg transition-colors cursor-pointer ${done ? 'bg-green-950/20 hover:bg-red-950/20' : 'hover:bg-gray-800'}`}
                    title={done ? 'Click to unmark' : undefined}
                  >
                    <div
                      className={`w-5 h-5 rounded-full flex-shrink-0 border-2 flex items-center justify-center transition-colors ${
                        done ? 'border-green-500 bg-green-500 text-white' : 'border-gray-600'
                      }`}
                    >
                      {done && <span className="text-xs">✓</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className={`text-sm ${done ? 'text-gray-500 line-through' : 'text-gray-200'}`}>{meal.name}</span>
                        <span className="text-xs text-gray-500 ml-2 flex-shrink-0">{meal.calories} kcal</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-600">{meal.time}</span>
                        <span className={`text-xs ml-2 flex-shrink-0 ${done ? 'text-gray-600' : 'text-blue-400/70'}`}>{meal.protein_g}g P</span>
                      </div>
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

      {/* Water Intake */}
      {(() => {
        const isImp = settings.units === 'imperial'
        const waterPct = waterTargetMl > 0 ? Math.min(100, Math.round((waterMl / waterTargetMl) * 100)) : 0
        const displayCurrent = isImp
          ? `${Math.round(waterMl / 29.5735)} oz`
          : waterMl >= 1000
            ? `${(waterMl / 1000).toFixed(1)} L`
            : `${waterMl} ml`
        const displayTarget = isImp
          ? `${Math.round(waterTargetMl / 29.5735)} oz`
          : waterTargetMl >= 1000
            ? `${(waterTargetMl / 1000).toFixed(1)} L`
            : `${waterTargetMl} ml`
        const quickAdds = isImp
          ? [{ ml: 237, label: '8oz' }, { ml: 355, label: '12oz' }, { ml: 473, label: '16oz' }, { ml: 946, label: '32oz' }]
          : [{ ml: 200, label: '200ml' }, { ml: 350, label: '350ml' }, { ml: 500, label: '500ml' }, { ml: 750, label: '750ml' }]
        return (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-100">Water Intake</h2>
              {!editingWaterTarget ? (
                <button
                  onClick={() => {
                    setWaterTargetInput(isImp
                      ? String(Math.round(waterTargetMl / 29.5735))
                      : String(waterTargetMl))
                    setEditingWaterTarget(true)
                  }}
                  className="text-xs text-gray-500 hover:text-brand-400 transition-colors"
                >
                  Target: {displayTarget}
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    value={waterTargetInput}
                    onChange={e => setWaterTargetInput(e.target.value)}
                    className="w-20 bg-gray-800 border border-gray-700 rounded-lg px-2 py-0.5 text-xs text-gray-200 focus:outline-none focus:border-brand-500"
                    autoFocus
                  />
                  <span className="text-xs text-gray-500">{isImp ? 'oz' : 'ml'}</span>
                  <button
                    onClick={() => {
                      const v = parseInt(waterTargetInput, 10)
                      if (!isNaN(v) && v > 0) {
                        const ml = isImp ? Math.round(v * 29.5735) : v
                        setWaterTargetMl(ml)
                        localStorage.setItem('water_target_ml', String(ml))
                      }
                      setEditingWaterTarget(false)
                    }}
                    className="text-xs bg-brand-600 hover:bg-brand-500 text-white px-2 py-0.5 rounded-lg transition-colors"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingWaterTarget(false)}
                    className="text-xs text-gray-500 hover:text-gray-400 transition-colors"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
            <div className="mb-3">
              <div className="flex justify-between items-end mb-1.5">
                <span className={`text-2xl font-bold ${waterPct >= 100 ? 'text-blue-400' : 'text-gray-100'}`}>
                  {displayCurrent}
                </span>
                <span className="text-xs text-gray-500">{waterPct}% of goal</span>
              </div>
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${waterPct >= 100 ? 'bg-blue-400' : 'bg-blue-500'}`}
                  style={{ width: `${waterPct}%` }}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {quickAdds.map(({ ml, label }) => (
                <button
                  key={ml}
                  onClick={() => addWater(ml)}
                  className="text-xs font-medium px-2.5 py-1.5 bg-blue-900/20 border border-blue-800/40 text-blue-400 rounded-lg hover:bg-blue-900/40 transition-colors"
                >
                  +{label}
                </button>
              ))}
              {waterMl > 0 && (
                <button
                  onClick={() => addWater(-waterMl)}
                  className="text-xs text-gray-600 hover:text-gray-400 ml-auto transition-colors"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        )
      })()}

      {/* Cardio Tracker */}
      {(() => {
        const jsDay = new Date().getDay()
        const daysFromMon = jsDay === 0 ? 6 : jsDay - 1
        const weekStart = new Date(Date.now() - daysFromMon * 86400000).toLocaleDateString('en-CA')
        const weekEntries = cardioLog.filter(e => e.date >= weekStart && e.date <= todayStr)
        const todayEntry = cardioLog.find(e => e.date === todayStr)
        const weekMins = weekEntries.reduce((s, e) => s + e.minutes, 0)
        const CARDIO_TYPES = ['LISS', 'HIIT', 'Stairs', 'Bike', 'Other']
        return (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-100">Cardio</h2>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>{weekEntries.length} session{weekEntries.length !== 1 ? 's' : ''} this week</span>
                {weekMins > 0 && <span>· {weekMins} min</span>}
              </div>
            </div>
            {todayEntry ? (
              <div className="flex items-center justify-between bg-green-950/20 border border-green-800/40 rounded-xl px-3 py-2.5 mb-3">
                <div>
                  <span className="text-green-400 font-semibold text-sm">{todayEntry.type}</span>
                  <span className="text-gray-400 text-sm ml-2">{todayEntry.minutes} min</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setCardioType(todayEntry.type); setCardioMinutes(String(todayEntry.minutes)); setCardioInputOpen(true) }}
                    className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                  >Edit</button>
                  <button onClick={removeCardioToday} className="text-xs text-red-500 hover:text-red-400 transition-colors">✕</button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-600 mb-3">No cardio logged today.</p>
            )}
            {cardioInputOpen ? (
              <div className="space-y-2">
                <div className="flex gap-1.5 flex-wrap">
                  {CARDIO_TYPES.map(t => (
                    <button
                      key={t}
                      onClick={() => setCardioType(t)}
                      className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${cardioType === t ? 'bg-brand-600/20 border-brand-500 text-brand-400' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'}`}
                    >{t}</button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={180}
                    value={cardioMinutes}
                    onChange={e => setCardioMinutes(e.target.value)}
                    placeholder="Minutes"
                    className="w-24 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-sm text-gray-100 focus:outline-none focus:border-brand-500"
                    autoFocus
                    onKeyDown={e => e.key === 'Enter' && logCardio()}
                  />
                  <span className="text-xs text-gray-500">min</span>
                  <button onClick={logCardio} className="text-xs bg-brand-600 hover:bg-brand-500 text-white px-3 py-1 rounded-lg transition-colors font-medium">Save</button>
                  <button onClick={() => { setCardioInputOpen(false); setCardioMinutes('') }} className="text-xs text-gray-500 hover:text-gray-400 transition-colors">Cancel</button>
                </div>
                <div className="flex gap-1.5">
                  {[['LISS', 30], ['LISS', 45], ['HIIT', 20], ['HIIT', 25]].map(([t, m]) => (
                    <button
                      key={`${t}-${m}`}
                      onClick={() => { quickLogCardio(t as string, Number(m)); setCardioInputOpen(false); setCardioMinutes('') }}
                      className="text-xs px-2 py-1 bg-gray-800 border border-gray-700 rounded-lg text-gray-400 hover:border-brand-700 hover:text-brand-400 transition-colors"
                    >{t} {m}m</button>
                  ))}
                </div>
              </div>
            ) : !todayEntry ? (
              <div className="space-y-2">
                <div className="flex gap-1.5 flex-wrap">
                  {[['LISS', 30], ['LISS', 45], ['HIIT', 20], ['HIIT', 25]].map(([t, m]) => (
                    <button
                      key={`${t}-${m}`}
                      onClick={() => quickLogCardio(t as string, Number(m))}
                      className="text-xs font-medium px-3 py-1.5 bg-gray-800 border border-gray-700 text-gray-400 hover:bg-brand-900/20 hover:border-brand-700 hover:text-brand-400 rounded-lg transition-colors"
                    >{t} {m}m</button>
                  ))}
                </div>
                <button
                  onClick={() => { setCardioType('LISS'); setCardioMinutes(''); setCardioInputOpen(true) }}
                  className="w-full py-1.5 rounded-xl border border-dashed border-gray-700 text-gray-500 hover:border-brand-700 hover:text-brand-400 text-xs transition-colors"
                >
                  + Custom duration
                </button>
              </div>
            ) : (
              <button
                onClick={() => { setCardioType('LISS'); setCardioMinutes(''); setCardioInputOpen(true) }}
                className="w-full py-2 rounded-xl border border-dashed border-gray-700 text-gray-500 hover:border-brand-700 hover:text-brand-400 text-sm transition-colors"
              >
                + Log another cardio
              </button>
            )}
          </div>
        )
      })()}

      {/* This Week's Volume */}
      {(() => {
        const isImperial = settings.units === 'imperial'
        const wUnit = isImperial ? 'lbs' : 'kg'
        const jsDay = new Date().getDay()
        const daysFromMon = jsDay === 0 ? 6 : jsDay - 1
        const weekStartStr = new Date(Date.now() - daysFromMon * 86400000).toLocaleDateString('en-CA')
        const thisWeekLogs = workoutHistory.filter(
          (log) => log.status === 'completed' && log.date >= weekStartStr && log.date <= todayStr
        )
        if (thisWeekLogs.length === 0) return null
        const totalSets = thisWeekLogs.reduce((acc, log) =>
          acc + (log.sets?.filter((s) => !s.skipped && s.reps_actual != null).length ?? 0), 0
        )
        const totalVolumeKg = thisWeekLogs.reduce((acc, log) =>
          acc + (log.sets?.reduce((s, set) =>
            s + (!set.skipped && set.weight_kg != null && set.reps_actual != null
              ? set.weight_kg * set.reps_actual : 0), 0) ?? 0), 0
        )
        const displayVol = isImperial
          ? Math.round(totalVolumeKg * 2.20462).toLocaleString()
          : Math.round(totalVolumeKg).toLocaleString()
        const totalPlanned = trainingPlan?.sessions?.length ?? 0

        // Estimated kcal burned: MET 5.5 for resistance training × bodyweight × hours
        // Uses actual session duration from started_at / ended_at when available
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
                  <p className="text-xl font-bold text-gray-100">
                    {thisWeekLogs.length}{totalPlanned > 0 ? `/${totalPlanned}` : ''}
                  </p>
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
      })()}

      {/* Weekly Muscle Coverage */}
      {exerciseLibrary.length > 0 && workoutHistory.some(l => l.status === 'completed') && (() => {
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
                    <div key={grp} className={`text-center py-2 px-1 rounded-lg border transition-colors ${
                      hit ? 'bg-brand-900/20 border-brand-800/40' : 'bg-gray-800/40 border-gray-800'
                    }`}>
                      <p className={`text-sm font-bold ${hit ? 'text-brand-400' : 'text-gray-600'}`}>
                        {sets > 0 ? sets : '—'}
                      </p>
                      <p className={`text-xs mt-0.5 ${hit ? 'text-gray-400' : 'text-gray-600'}`}>
                        {MUSCLE_LABEL[grp] ?? grp}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          </Link>
        )
      })()}

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
