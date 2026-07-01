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
import { buildPrepTimeline, PEAK_WEEK_PROTOCOL } from '../../data/competitionPrep'
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

  interface PosingEntry { date: string; focus: string; minutes: number }
  const [posingLog, setPosingLog] = useState<PosingEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem('posing_log') ?? '[]') } catch { return [] }
  })
  const [posingInputOpen, setPosingInputOpen] = useState(false)
  const [posingFocus, setPosingFocus] = useState('Full Routine')
  const [posingMinutes, setPosingMinutes] = useState('')

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

  function savePosingLog(entries: PosingEntry[]) {
    setPosingLog(entries)
    localStorage.setItem('posing_log', JSON.stringify(entries))
  }

  function logPosing() {
    const mins = parseInt(posingMinutes, 10)
    if (!posingFocus || isNaN(mins) || mins <= 0) return
    const updated = [...posingLog.filter(e => e.date !== todayStr), { date: todayStr, focus: posingFocus, minutes: mins }]
    savePosingLog(updated)
    setPosingInputOpen(false)
    setPosingMinutes('')
  }

  function removePosingToday() {
    savePosingLog(posingLog.filter(e => e.date !== todayStr))
  }

  function quickLogPosing(focus: string, minutes: number) {
    const updated = [...posingLog.filter(e => e.date !== todayStr), { date: todayStr, focus, minutes }]
    savePosingLog(updated)
  }

  interface SleepEntry { date: string; hours: number }
  const [sleepLog, setSleepLog] = useState<SleepEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem('sleep_log') ?? '[]') } catch { return [] }
  })
  const [sleepInputOpen, setSleepInputOpen] = useState(false)
  const [sleepHoursInput, setSleepHoursInput] = useState('')

  function saveSleepLog(entries: SleepEntry[]) {
    setSleepLog(entries)
    localStorage.setItem('sleep_log', JSON.stringify(entries))
  }

  function logSleep() {
    const hours = parseFloat(sleepHoursInput)
    if (isNaN(hours) || hours <= 0 || hours > 24) return
    const updated = [...sleepLog.filter(e => e.date !== todayStr), { date: todayStr, hours }]
    saveSleepLog(updated)
    setSleepInputOpen(false)
    setSleepHoursInput('')
  }

  function removeSleepToday() {
    saveSleepLog(sleepLog.filter(e => e.date !== todayStr))
  }

  function quickLogSleep(hours: number) {
    const updated = [...sleepLog.filter(e => e.date !== todayStr), { date: todayStr, hours }]
    saveSleepLog(updated)
  }

  interface ConditionEntry { date: string; tags: string[]; note: string }
  const [conditionLog, setConditionLog] = useState<ConditionEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem('condition_log') ?? '[]') } catch { return [] }
  })
  const [conditionInputOpen, setConditionInputOpen] = useState(false)
  const [conditionNote, setConditionNote] = useState('')

  function saveConditionLog(entries: ConditionEntry[]) {
    setConditionLog(entries)
    localStorage.setItem('condition_log', JSON.stringify(entries))
  }

  function toggleConditionTag(tag: string) {
    const existing = conditionLog.find(e => e.date === todayStr) ?? { date: todayStr, tags: [], note: '' }
    const tags = existing.tags.includes(tag)
      ? existing.tags.filter(t => t !== tag)
      : [...existing.tags, tag]
    saveConditionLog([...conditionLog.filter(e => e.date !== todayStr), { ...existing, tags }])
  }

  function saveConditionNote() {
    const existing = conditionLog.find(e => e.date === todayStr) ?? { date: todayStr, tags: [], note: '' }
    saveConditionLog([...conditionLog.filter(e => e.date !== todayStr), { ...existing, note: conditionNote }])
    setConditionInputOpen(false)
    setConditionNote('')
  }

  const DEFAULT_SUPPLEMENTS = ['Creatine', 'Fish Oil', 'Vitamin D', 'Multi-Vitamin']
  interface SupplementLog { date: string; taken: string[] }
  const [supplementList, setSupplementList] = useState<string[]>(() => {
    try { const s = localStorage.getItem('supplement_list'); return s ? JSON.parse(s) : DEFAULT_SUPPLEMENTS } catch { return DEFAULT_SUPPLEMENTS }
  })
  const [supplementLog, setSupplementLog] = useState<SupplementLog[]>(() => {
    try { return JSON.parse(localStorage.getItem('supplement_log') ?? '[]') } catch { return [] }
  })
  const [newSupplementName, setNewSupplementName] = useState('')
  const [addingSupp, setAddingSupp] = useState(false)

  function saveSupplementLog(entries: SupplementLog[]) {
    setSupplementLog(entries)
    localStorage.setItem('supplement_log', JSON.stringify(entries))
  }

  function toggleSupplement(name: string) {
    const existing = supplementLog.find(e => e.date === todayStr) ?? { date: todayStr, taken: [] }
    const taken = existing.taken.includes(name)
      ? existing.taken.filter(t => t !== name)
      : [...existing.taken, name]
    saveSupplementLog([...supplementLog.filter(e => e.date !== todayStr), { date: todayStr, taken }])
  }

  function addSupplement() {
    const name = newSupplementName.trim()
    if (!name || supplementList.includes(name)) return
    const next = [...supplementList, name]
    setSupplementList(next)
    localStorage.setItem('supplement_list', JSON.stringify(next))
    setNewSupplementName('')
    setAddingSupp(false)
  }

  function removeSupplement(name: string) {
    const next = supplementList.filter(s => s !== name)
    setSupplementList(next)
    localStorage.setItem('supplement_list', JSON.stringify(next))
    saveSupplementLog(supplementLog.map(e => ({ ...e, taken: e.taken.filter(t => t !== name) })))
  }

  interface DailyWeightEntry { date: string; weight_kg: number }
  const [dailyWeightLog, setDailyWeightLog] = useState<DailyWeightEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem('daily_weight_log') ?? '[]') } catch { return [] }
  })
  const [dailyWeightInput, setDailyWeightInput] = useState('')
  const [dailyWeightEditing, setDailyWeightEditing] = useState(false)

  function logDailyWeight() {
    const isImp = settings.units === 'imperial'
    const raw = parseFloat(dailyWeightInput)
    if (isNaN(raw) || raw <= 0) return
    const weight_kg = isImp ? Math.round((raw / 2.20462) * 1000) / 1000 : raw
    const updated = [...dailyWeightLog.filter(e => e.date !== todayStr), { date: todayStr, weight_kg }]
    setDailyWeightLog(updated)
    localStorage.setItem('daily_weight_log', JSON.stringify(updated))
    setDailyWeightInput('')
    setDailyWeightEditing(false)
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

  // Build a quick name→isCompound lookup from the exercise library
  const isCompoundMap = new Map<string, boolean>(exerciseLibrary.map(e => [e.name, e.isCompound]))

  // Compute a suggested target weight for a given exercise based on last session performance.
  // Compounds: +2.5 kg (or +5 lbs); isolations: +1.25 kg (or +2.5 lbs).
  // Capped at +5% of last weight to avoid unrealistic jumps.
  // Returns null on deload weeks or when no previous data exists.
  function progressionTarget(exerciseName: string, phase: string): string | null {
    if (phase === 'deload') return null
    const lp = lastPerformanceMap.get(exerciseName)
    if (!lp || lp.weight_kg <= 0) return null
    const isImperial = settings.units === 'imperial'
    const isCompound = isCompoundMap.get(exerciseName) ?? true
    const incrementKg = isCompound ? 2.5 : 1.25
    const incrementLbs = isCompound ? 5 : 2.5
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
    if (!todayWorkoutLog) return []
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
      if (historicalBest == null || best.weight_kg > historicalBest) {
        prs.push({ exercise, weight_kg: best.weight_kg, reps: best.reps })
      }
    }
    return prs
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

      {/* Daily Weigh-In — rolling average gives accurate prep trend vs noisy daily reads */}
      {(() => {
        const isImp = settings.units === 'imperial'
        const wUnit = isImp ? 'lbs' : 'kg'
        const toDisplay = (kg: number) => isImp ? Math.round(kg * 2.20462 * 10) / 10 : Math.round(kg * 10) / 10
        const todayEntry = dailyWeightLog.find(e => e.date === todayStr)
        const last7 = (Array.from({ length: 7 }, (_, i) => {
          const d = new Date(); d.setDate(d.getDate() - i)
          return dailyWeightLog.find(e => e.date === d.toLocaleDateString('en-CA')) ?? null
        }).filter(Boolean)) as DailyWeightEntry[]
        const avg7 = last7.length >= 2 ? last7.reduce((s, e) => s + e.weight_kg, 0) / last7.length : null
        const prev7 = (Array.from({ length: 7 }, (_, i) => {
          const d = new Date(); d.setDate(d.getDate() - 7 - i)
          return dailyWeightLog.find(e => e.date === d.toLocaleDateString('en-CA')) ?? null
        }).filter(Boolean)) as DailyWeightEntry[]
        const avgPrev7 = prev7.length >= 2 ? prev7.reduce((s, e) => s + e.weight_kg, 0) / prev7.length : null
        const weeklyChange = avg7 !== null && avgPrev7 !== null ? avg7 - avgPrev7 : null
        return (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-100">Daily Weigh-In</h2>
              {avg7 !== null && (
                <div className="text-right">
                  <p className="text-xs text-gray-500">7-day avg</p>
                  <div className="flex items-center gap-1.5 justify-end">
                    <span className="text-sm font-bold text-gray-200">{toDisplay(avg7)} {wUnit}</span>
                    {weeklyChange !== null && (
                      <span className={`text-xs font-medium ${Math.abs(weeklyChange) < 0.05 ? 'text-gray-500' : weeklyChange < 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {weeklyChange > 0 ? '+' : ''}{isImp ? Math.round(weeklyChange * 2.20462 * 10) / 10 : Math.round(weeklyChange * 10) / 10}/wk
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
            {(todayEntry && !dailyWeightEditing) ? (
              <div className="flex items-center justify-between bg-gray-800/50 rounded-xl px-3 py-2.5 mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-green-400 text-sm">✓</span>
                  <span className="text-gray-100 font-semibold">{toDisplay(todayEntry.weight_kg)} {wUnit}</span>
                  <span className="text-xs text-gray-500">today</span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => { setDailyWeightInput(String(toDisplay(todayEntry.weight_kg))); setDailyWeightEditing(true) }} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">Edit</button>
                  <button onClick={() => { const next = dailyWeightLog.filter(e => e.date !== todayStr); setDailyWeightLog(next); localStorage.setItem('daily_weight_log', JSON.stringify(next)) }} className="text-xs text-red-500 hover:text-red-400 transition-colors" aria-label="Delete today's weigh-in">✕</button>
                </div>
              </div>
            ) : (
              <div className="mb-3">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={isImp ? 66 : 30}
                    max={isImp ? 660 : 300}
                    step={0.1}
                    value={dailyWeightInput}
                    onChange={e => setDailyWeightInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') logDailyWeight() }}
                    placeholder={isImp ? 'lbs' : 'kg'}
                    className="w-28 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-brand-500"
                  />
                  <span className="text-xs text-gray-500">{wUnit}</span>
                  <button
                    onClick={logDailyWeight}
                    disabled={!dailyWeightInput.trim()}
                    className="px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-medium transition-colors disabled:opacity-40"
                  >Save</button>
                  {dailyWeightEditing && (
                    <button onClick={() => { setDailyWeightEditing(false); setDailyWeightInput('') }} className="text-xs text-gray-500 hover:text-gray-400 transition-colors">Cancel</button>
                  )}
                </div>
                <p className="text-xs text-gray-600 mt-1.5">Log fasted morning weight — 7-day avg smooths daily fluctuations</p>
              </div>
            )}
            {last7.length >= 3 && (
              <div className="border-t border-gray-800 pt-2.5">
                <div className="flex gap-1 flex-wrap">
                  {[...last7].reverse().map((e, i) => (
                    <div key={i} className={`text-center px-2 py-1 rounded-lg text-xs ${e.date === todayStr ? 'bg-brand-900/30 border border-brand-700/50' : 'bg-gray-800'}`}>
                      <p className={`font-medium ${e.date === todayStr ? 'text-brand-300' : 'text-gray-300'}`}>{toDisplay(e.weight_kg)}</p>
                      <p className="text-gray-600" style={{ fontSize: 10 }}>{e.date.slice(5)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* Peak Week Daily Protocol — appears only during the 7 days before a show */}
      {showCountdown !== null && showCountdown.totalDays >= 0 && showCountdown.totalDays <= 7 && (() => {
        const daysOut = Math.max(1, showCountdown.totalDays)
        const todayProtocol = PEAK_WEEK_PROTOCOL.days.find(d => d.daysOut === daysOut)
        if (!todayProtocol) return null
        const isShowDay = showCountdown.totalDays === 0
        return (
          <div className="bg-red-950/20 border border-red-700/50 rounded-xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-red-400 uppercase tracking-wider">
                  {isShowDay ? 'SHOW DAY!' : `PEAK WEEK · ${showCountdown.totalDays} day${showCountdown.totalDays !== 1 ? 's' : ''} out`}
                </span>
                <p className="text-sm font-semibold text-gray-100 mt-0.5">{todayProtocol.label}</p>
              </div>
              <Link to="/education" className="text-xs text-red-400 hover:text-red-300 flex-shrink-0 mt-0.5 transition-colors">
                Full protocol →
              </Link>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-gray-900/80 rounded-lg p-2.5">
                <p className="text-gray-500 font-semibold uppercase mb-1" style={{ fontSize: 10 }}>Water</p>
                <p className="text-xs text-blue-400 font-medium leading-snug">{todayProtocol.water}</p>
              </div>
              <div className="bg-gray-900/80 rounded-lg p-2.5">
                <p className="text-gray-500 font-semibold uppercase mb-1" style={{ fontSize: 10 }}>Sodium</p>
                <p className="text-xs text-amber-400 font-medium leading-snug">{todayProtocol.sodium.split(':')[0]}</p>
              </div>
              <div className="bg-gray-900/80 rounded-lg p-2.5">
                <p className="text-gray-500 font-semibold uppercase mb-1" style={{ fontSize: 10 }}>Training</p>
                <p className="text-xs text-green-400 font-medium leading-snug">{todayProtocol.training.split(':')[0].split('.')[0]}</p>
              </div>
            </div>
            <div className="bg-gray-900/60 rounded-lg px-3 py-2.5">
              <p className="text-gray-500 font-semibold uppercase mb-1.5" style={{ fontSize: 10 }}>Nutrition Today</p>
              <p className="text-xs text-gray-300 leading-snug">{todayProtocol.nutrition}</p>
            </div>
            {todayProtocol.notes.length > 0 && (
              <div className="space-y-1.5">
                {todayProtocol.notes.slice(0, 3).map((note, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <span className="text-red-500 flex-shrink-0 text-xs mt-0.5">›</span>
                    <span className="text-xs text-gray-400 leading-snug">{note}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })()}

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
            {mealsEaten > 0 && (
              remaining > 0
                ? <p className="text-xs text-gray-600 pt-0.5">{remaining} kcal remaining · {Math.max(0, dietPlan.protein_g - consumedPro)}g protein left</p>
                : remaining < 0
                  ? <p className="text-xs text-amber-500 pt-0.5">{Math.abs(remaining)} kcal over target</p>
                  : null
            )}
          </div>
        )
      })()}

      {/* Daily Energy Balance — net deficit/surplus based on BMR + activity vs consumed */}
      {dietPlan && (() => {
        const wt = latestCheckin?.weight_kg ?? user.weight_kg
        const bmr = user.sex === 'male'
          ? Math.round(88.362 + 13.397 * wt + 5.677 * user.height_cm - 4.799 * user.age)
          : Math.round(447.593 + 9.247 * wt + 3.098 * user.height_cm - 4.330 * user.age)

        const todayWorkout = workoutHistory.find(
          l => l.status === 'completed' && l.date === todayStr && l.started_at && l.ended_at
        )
        const trainingBurn = todayWorkout
          ? Math.round(5.5 * wt * (new Date(todayWorkout.ended_at!).getTime() - new Date(todayWorkout.started_at).getTime()) / 3600000)
          : 0

        const todayCardioEntry = cardioLog.find(e => e.date === todayStr)
        const CARDIO_MET: Record<string, number> = { LISS: 4.5, HIIT: 8.0, Bike: 6.0, Stairs: 8.0, Other: 5.0 }
        const cardioBurn = todayCardioEntry
          ? Math.round((CARDIO_MET[todayCardioEntry.type] ?? 5.0) * wt * todayCardioEntry.minutes / 60)
          : 0

        const meals = dietPlan.meals ?? []
        const todayLogged = mealCompletions.filter(c => c.date === todayStr)
        const consumedCal = todayLogged.reduce((s, c) => s + (meals[c.meal_index]?.calories ?? 0), 0)

        const totalExpenditure = bmr + trainingBurn + cardioBurn
        const netBalance = consumedCal - totalExpenditure
        const isDeficit = netBalance < 0

        return (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Today's Energy Balance</p>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                consumedCal === 0
                  ? 'text-gray-500 bg-gray-800 border-gray-700'
                  : isDeficit
                    ? 'text-green-400 bg-green-900/20 border-green-800/40'
                    : 'text-red-400 bg-red-900/20 border-red-800/40'
              }`}>
                {consumedCal === 0
                  ? 'No meals logged'
                  : isDeficit
                    ? `${Math.abs(netBalance).toLocaleString()} kcal deficit`
                    : `+${netBalance.toLocaleString()} kcal surplus`}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center mb-2">
              <div>
                <p className="text-lg font-bold text-gray-200">{totalExpenditure.toLocaleString()}</p>
                <p className="text-xs text-gray-500 mt-0.5">Est. burned</p>
                <p className="text-xs text-gray-700 mt-0.5 truncate">
                  {bmr} BMR{trainingBurn > 0 ? ` +${trainingBurn}` : ''}{cardioBurn > 0 ? ` +${cardioBurn}` : ''}
                </p>
              </div>
              <div>
                <p className="text-lg font-bold text-brand-400">{consumedCal.toLocaleString()}</p>
                <p className="text-xs text-gray-500 mt-0.5">Consumed</p>
                <p className="text-xs text-gray-700 mt-0.5">{todayLogged.length}/{meals.length} meals</p>
              </div>
              <div>
                <p className={`text-lg font-bold ${
                  consumedCal === 0 ? 'text-gray-600' : isDeficit ? 'text-green-400' : 'text-red-400'
                }`}>
                  {consumedCal === 0 ? '—' : `${isDeficit ? '-' : '+'}${Math.abs(netBalance).toLocaleString()}`}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">Net balance</p>
                <p className="text-xs text-gray-700 mt-0.5">{isDeficit ? 'deficit' : consumedCal === 0 ? '—' : 'surplus'}</p>
              </div>
            </div>
            <p className="text-xs text-gray-700">Harris-Benedict BMR estimate · actual expenditure varies by exercise intensity</p>
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
                <p className="text-xs text-gray-600 mt-0.5">avg last {Math.min(checkinHistory.length, 4)} check-ins · click for full chart</p>
                {(user.goal === 'cut' || user.goal === 'bulk') && (() => {
                  const minKg = user.goal === 'cut' ? currentWeightKg * 0.003 : currentWeightKg * 0.002
                  const maxKg = user.goal === 'cut' ? currentWeightKg * 0.012 : currentWeightKg * 0.010
                  const fmt = (kg: number) => isImperial
                    ? `${Math.round(kg * 2.20462 * 10) / 10}`
                    : `${Math.round(kg * 10) / 10}`
                  const showDateStr = nearestShow?.show_date
                  const weeksToShow = showDateStr
                    ? Math.max(0, (new Date(showDateStr + 'T12:00:00').getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 7))
                    : null
                  const projectedKg = weeksToShow !== null ? currentWeightKg + weeklyRateKg * weeksToShow : null
                  const targetKg = settings.target_weight_kg ? parseFloat(settings.target_weight_kg as string) : null
                  return (
                    <>
                      <p className="text-xs text-gray-700 mt-0.5">
                        Target: {user.goal === 'cut' ? `-${fmt(maxKg)}–-${fmt(minKg)}` : `+${fmt(minKg)}–+${fmt(maxKg)}`} {wUnit}/wk
                      </p>
                      {projectedKg !== null && weeksToShow !== null && weeksToShow > 0 && (
                        <p className="text-xs mt-1">
                          <span className="text-gray-500">Show day ({Math.round(weeksToShow)}w): </span>
                          <span className="font-semibold text-gray-300">~{fmt(projectedKg)} {wUnit}</span>
                          {targetKg !== null && (
                            <span className={`ml-1.5 font-medium ${
                              Math.abs(projectedKg - targetKg) < 0.5
                                ? 'text-green-400'
                                : (user.goal === 'cut' ? projectedKg > targetKg : projectedKg < targetKg)
                                  ? 'text-amber-400'
                                  : 'text-green-400'
                            }`}>
                              {Math.abs(projectedKg - targetKg) < 0.5
                                ? '✓ on target'
                                : `(${fmt(Math.abs(projectedKg - targetKg))} ${wUnit} ${user.goal === 'cut' ? (projectedKg > targetKg ? 'above' : 'below') : (projectedKg < targetKg ? 'below' : 'above')} target)`}
                            </span>
                          )}
                        </p>
                      )}
                    </>
                  )
                })()}
              </div>
              <span className={`text-xs font-medium px-3 py-1.5 rounded-full border ${STATUS_COLOR[status]}`}>
                {STATUS_LABEL[status]}
              </span>
            </div>
          </Link>
        )
      })()}

      {/* Weekly Prep Scorecard — Mon–today adherence across all 5 pillars */}
      {(dietPlan || trainingPlan) && (() => {
        const today = new Date()
        const dow = today.getDay() // 0=Sun…6=Sat
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
        const trainingScore = scheduledThisWeek.length > 0
          ? Math.round(completedThisWeek.length / scheduledThisWeek.length * 100)
          : null

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
                <p className={`text-lg font-bold leading-none mb-1 ${cardioDays > 0 ? cardioC.text : 'text-gray-600'}`}>
                  {cardioDays}
                </p>
                <p className="text-xs text-gray-500 leading-tight">Cardio</p>
                <p className="text-xs text-gray-700 mt-0.5">days</p>
              </div>
              <div className={`rounded-lg border p-2 ${posingDays > 0 ? posingC.bg : noData}`}>
                <p className={`text-lg font-bold leading-none mb-1 ${posingDays > 0 ? posingC.text : 'text-gray-600'}`}>
                  {posingDays}
                </p>
                <p className="text-xs text-gray-500 leading-tight">Posing</p>
                <p className="text-xs text-gray-700 mt-0.5">days</p>
              </div>
              <div className={`rounded-lg border p-2 ${goodSleepDays > 0 ? sleepC.bg : noData}`}>
                <p className={`text-lg font-bold leading-none mb-1 ${goodSleepDays > 0 ? sleepC.text : 'text-gray-600'}`}>
                  {goodSleepDays}
                </p>
                <p className="text-xs text-gray-500 leading-tight">Sleep</p>
                <p className="text-xs text-gray-700 mt-0.5">≥7h days</p>
              </div>
            </div>
          </div>
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
                  <p className="text-gray-500 mb-1 font-semibold uppercase tracking-wide" style={{ fontSize: 10 }}>Cardio</p>
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
                            {pr.exercise}: {settings.units === 'imperial'
                              ? `${Math.round(pr.weight_kg * 2.20462 * 2) / 2}lbs`
                              : `${pr.weight_kg}kg`} × {pr.reps}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </>
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
              <p className="text-gray-500 text-sm">No check-ins yet. Log your weight to start tracking progress.</p>
              <Link to="/checkin">
                <Button size="sm" variant="secondary">Log First Weigh-In →</Button>
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Recent Check-Ins — last 4 weigh-ins: weight, adherence %, calorie adjustment */}
      {checkinHistory.length >= 2 && (() => {
        const recent = checkinHistory.slice(0, 4)
        const avgTraining = Math.round(recent.reduce((s, c) => s + c.training_adherence, 0) / recent.length)
        const avgDiet = Math.round(recent.reduce((s, c) => s + c.diet_adherence, 0) / recent.length)
        function adherenceColor(pct: number) {
          return pct >= 85 ? 'text-green-400' : pct >= 70 ? 'text-yellow-400' : 'text-red-400'
        }
        return (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Recent Check-Ins</p>
              <div className="flex items-center gap-3 text-xs">
                <span className={`font-medium ${adherenceColor(avgTraining)}`}>{avgTraining}% training avg</span>
                <span className={`font-medium ${adherenceColor(avgDiet)}`}>{avgDiet}% diet avg</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-600 border-b border-gray-800">
                    <th className="text-left pb-1.5 font-medium">Week</th>
                    <th className="text-right pb-1.5 font-medium">Weight</th>
                    <th className="text-right pb-1.5 font-medium">Training</th>
                    <th className="text-right pb-1.5 font-medium">Diet</th>
                    <th className="text-right pb-1.5 font-medium">Adj.</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((c, i) => {
                    const wt = displayWeight(c.weight_kg, settings.units)
                    const delta = c.adjustments?.calories_delta ?? 0
                    return (
                      <tr key={c.id} className={i === 0 ? 'text-gray-200' : 'text-gray-500'}>
                        <td className="py-1.5 pr-2">Wk {c.week_number}</td>
                        <td className="py-1.5 text-right font-medium">{wt.value} {wt.unit}</td>
                        <td className={`py-1.5 text-right font-medium ${adherenceColor(c.training_adherence)}`}>{c.training_adherence}%</td>
                        <td className={`py-1.5 text-right font-medium ${adherenceColor(c.diet_adherence)}`}>{c.diet_adherence}%</td>
                        <td className={`py-1.5 text-right font-medium ${delta === 0 ? 'text-gray-600' : delta < 0 ? 'text-green-400' : 'text-amber-400'}`}>
                          {delta === 0 ? '—' : `${delta > 0 ? '+' : ''}${delta}`}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-700 mt-2">Adj. = weekly calorie adjustment applied after each check-in</p>
          </div>
        )
      })()}

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
                  onClick={() => { if (window.confirm('Reset today\'s water to zero?')) addWater(-waterMl) }}
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
                  <button onClick={removeCardioToday} aria-label="Delete today's cardio session" title="Delete" className="text-xs text-red-500 hover:text-red-400 transition-colors">✕</button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500 mb-3">No cardio logged today.</p>
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

      {/* Posing Practice */}
      {(() => {
        const jsDay2 = new Date().getDay()
        const daysFromMon2 = jsDay2 === 0 ? 6 : jsDay2 - 1
        const weekStart = new Date(Date.now() - daysFromMon2 * 86400000).toLocaleDateString('en-CA')
        const weekEntries = posingLog.filter(e => e.date >= weekStart && e.date <= todayStr)
        const todayEntry = posingLog.find(e => e.date === todayStr)
        const weekMins = weekEntries.reduce((s, e) => s + e.minutes, 0)
        const POSING_FOCUSES = ['Full Routine', 'Quarter Turns', 'Front Double', 'Side Poses', 'Symmetry Round', 'Mandatory Poses']
        const QUICK_PRESETS: [string, number][] = [['Full Routine', 15], ['Full Routine', 20], ['Quarter Turns', 15], ['Mandatory Poses', 20]]
        const presetLabel = (f: string, m: number) => {
          const short = f === 'Full Routine' ? 'Full' : f === 'Quarter Turns' ? 'QT' : 'Mandatory'
          return `${short} ${m}m`
        }
        return (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-100">Posing Practice</h2>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>{weekEntries.length} session{weekEntries.length !== 1 ? 's' : ''} this week</span>
                {weekMins > 0 && <span>· {weekMins} min</span>}
              </div>
            </div>
            {todayEntry ? (
              <div className="flex items-center justify-between bg-purple-950/20 border border-purple-800/40 rounded-xl px-3 py-2.5 mb-3">
                <div>
                  <span className="text-purple-400 font-semibold text-sm">{todayEntry.focus}</span>
                  <span className="text-gray-400 text-sm ml-2">{todayEntry.minutes} min</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setPosingFocus(todayEntry.focus); setPosingMinutes(String(todayEntry.minutes)); setPosingInputOpen(true) }}
                    className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                  >Edit</button>
                  <button onClick={removePosingToday} aria-label="Delete today's posing session" title="Delete" className="text-xs text-red-500 hover:text-red-400 transition-colors">✕</button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500 mb-3">No posing logged today.</p>
            )}
            {posingInputOpen ? (
              <div className="space-y-2">
                <div className="flex gap-1.5 flex-wrap">
                  {POSING_FOCUSES.map(f => (
                    <button
                      key={f}
                      onClick={() => setPosingFocus(f)}
                      className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${posingFocus === f ? 'bg-purple-600/20 border-purple-500 text-purple-400' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'}`}
                    >{f}</button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={posingMinutes}
                    onChange={e => setPosingMinutes(e.target.value)}
                    placeholder="Minutes"
                    className="w-24 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-sm text-gray-100 focus:outline-none focus:border-purple-500"
                    autoFocus
                    onKeyDown={e => e.key === 'Enter' && logPosing()}
                  />
                  <span className="text-xs text-gray-500">min</span>
                  <button onClick={logPosing} className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-1 rounded-lg transition-colors font-medium">Save</button>
                  <button onClick={() => { setPosingInputOpen(false); setPosingMinutes('') }} className="text-xs text-gray-500 hover:text-gray-400 transition-colors">Cancel</button>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {QUICK_PRESETS.map(([f, m]) => (
                    <button
                      key={`${f}-${m}`}
                      onClick={() => { quickLogPosing(f, m); setPosingInputOpen(false); setPosingMinutes('') }}
                      className="text-xs px-2 py-1 bg-gray-800 border border-gray-700 rounded-lg text-gray-400 hover:border-purple-700 hover:text-purple-400 transition-colors"
                    >{presetLabel(f, m)}</button>
                  ))}
                </div>
              </div>
            ) : !todayEntry ? (
              <div className="space-y-2">
                <div className="flex gap-1.5 flex-wrap">
                  {QUICK_PRESETS.map(([f, m]) => (
                    <button
                      key={`${f}-${m}`}
                      onClick={() => quickLogPosing(f, m)}
                      className="text-xs font-medium px-3 py-1.5 bg-gray-800 border border-gray-700 text-gray-400 hover:bg-purple-900/20 hover:border-purple-700 hover:text-purple-400 rounded-lg transition-colors"
                    >{presetLabel(f, m)}</button>
                  ))}
                </div>
                <button
                  onClick={() => { setPosingFocus('Full Routine'); setPosingMinutes(''); setPosingInputOpen(true) }}
                  className="w-full py-1.5 rounded-xl border border-dashed border-gray-700 text-gray-500 hover:border-purple-700 hover:text-purple-400 text-xs transition-colors"
                >
                  + Custom duration
                </button>
              </div>
            ) : (
              <button
                onClick={() => { setPosingFocus('Full Routine'); setPosingMinutes(''); setPosingInputOpen(true) }}
                className="w-full py-2 rounded-xl border border-dashed border-gray-700 text-gray-500 hover:border-purple-700 hover:text-purple-400 text-sm transition-colors"
              >
                + Log another posing session
              </button>
            )}
          </div>
        )
      })()}

      {/* Sleep Tracker */}
      {(() => {
        const todayEntry = sleepLog.find(e => e.date === todayStr)
        const last7 = Array.from({ length: 7 }, (_, i) => {
          const d = new Date()
          d.setDate(d.getDate() - (6 - i))
          const dateStr = d.toLocaleDateString('en-CA')
          return { dateStr, label: d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1) + d.getDate(), entry: sleepLog.find(e => e.date === dateStr) }
        })
        const recentWithData = last7.filter(d => d.entry)
        const avgHours = recentWithData.length > 0
          ? Math.round(recentWithData.reduce((s, d) => s + d.entry!.hours, 0) / recentWithData.length * 10) / 10
          : null
        function sleepColor(h: number) {
          return h >= 7 ? 'text-green-400' : h >= 6 ? 'text-yellow-400' : 'text-red-400'
        }
        const QUICK_HOURS = [5, 6, 7, 8]
        return (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-100">Sleep</h2>
              {avgHours !== null && (
                <span className={`text-xs font-medium ${sleepColor(avgHours)}`}>
                  {avgHours}h avg (7 days)
                </span>
              )}
            </div>
            {todayEntry ? (
              <div className="flex items-center justify-between bg-indigo-950/20 border border-indigo-800/40 rounded-xl px-3 py-2.5 mb-3">
                <div>
                  <span className={`font-semibold text-sm ${sleepColor(todayEntry.hours)}`}>{todayEntry.hours}h</span>
                  <span className="text-gray-400 text-sm ml-2">last night</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setSleepHoursInput(String(todayEntry.hours)); setSleepInputOpen(true) }}
                    className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                  >Edit</button>
                  <button onClick={removeSleepToday} aria-label="Delete last night's sleep log" title="Delete" className="text-xs text-red-500 hover:text-red-400 transition-colors">✕</button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500 mb-3">No sleep logged for last night.</p>
            )}
            {sleepInputOpen ? (
              <div className="flex items-center gap-2 mb-3">
                <input
                  type="number"
                  min={1}
                  max={12}
                  step={0.5}
                  value={sleepHoursInput}
                  onChange={e => setSleepHoursInput(e.target.value)}
                  placeholder="Hours"
                  className="w-24 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-sm text-gray-100 focus:outline-none focus:border-indigo-500"
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && logSleep()}
                />
                <span className="text-xs text-gray-500">hours</span>
                <button onClick={logSleep} className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1 rounded-lg transition-colors font-medium">Save</button>
                <button onClick={() => { setSleepInputOpen(false); setSleepHoursInput('') }} className="text-xs text-gray-500 hover:text-gray-400 transition-colors">Cancel</button>
              </div>
            ) : !todayEntry ? (
              <div className="space-y-2">
                <div className="flex gap-1.5 flex-wrap">
                  {QUICK_HOURS.map(h => (
                    <button
                      key={h}
                      onClick={() => quickLogSleep(h)}
                      className="text-xs font-medium px-3 py-1.5 bg-gray-800 border border-gray-700 text-gray-400 hover:bg-indigo-900/20 hover:border-indigo-700 hover:text-indigo-400 rounded-lg transition-colors"
                    >{h}h</button>
                  ))}
                  <button
                    onClick={() => { setSleepHoursInput(''); setSleepInputOpen(true) }}
                    className="text-xs font-medium px-3 py-1.5 bg-gray-800 border border-gray-700 text-gray-400 hover:bg-indigo-900/20 hover:border-indigo-700 hover:text-indigo-400 rounded-lg transition-colors"
                  >Custom</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => { setSleepHoursInput(''); setSleepInputOpen(true) }}
                className="w-full py-1.5 rounded-xl border border-dashed border-gray-700 text-gray-500 hover:border-indigo-700 hover:text-indigo-400 text-xs transition-colors"
              >
                + Log another night
              </button>
            )}
            <div className="flex gap-1 mt-3">
              {last7.map(({ dateStr, label, entry }) => {
                const isToday = dateStr === todayStr
                const h = entry?.hours
                return (
                  <div
                    key={dateStr}
                    className={`flex-1 rounded-lg py-1.5 text-center ${isToday ? 'bg-indigo-900/20 border border-indigo-800/40' : 'bg-gray-800/60'}`}
                  >
                    <p className={`text-xs font-medium ${isToday ? 'text-indigo-400' : 'text-gray-600'}`}>{label}</p>
                    {h !== undefined ? (
                      <p className={`text-xs mt-0.5 font-medium ${sleepColor(h)}`}>{h}h</p>
                    ) : (
                      <p className="text-xs text-gray-700 mt-0.5">—</p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* Supplement Tracker */}
      {(() => {
        const todayTaken = new Set(supplementLog.find(e => e.date === todayStr)?.taken ?? [])
        const takenCount = supplementList.filter(s => todayTaken.has(s)).length
        const allTaken = supplementList.length > 0 && takenCount === supplementList.length
        const last7 = Array.from({ length: 7 }, (_, i) => {
          const d = new Date()
          d.setDate(d.getDate() - (6 - i))
          const dateStr = d.toLocaleDateString('en-CA')
          const entry = supplementLog.find(e => e.date === dateStr)
          const count = entry ? supplementList.filter(s => entry.taken.includes(s)).length : 0
          return {
            dateStr,
            label: d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1) + d.getDate(),
            pct: supplementList.length > 0 ? Math.round((count / supplementList.length) * 100) : 0,
            isToday: dateStr === todayStr,
          }
        })
        return (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-100">Supplements</h2>
              {supplementList.length > 0 && (
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${allTaken ? 'bg-green-900/30 text-green-400' : 'bg-gray-800 text-gray-500'}`}>
                  {takenCount}/{supplementList.length} taken
                </span>
              )}
            </div>
            {supplementList.length === 0 && !addingSupp && (
              <p className="text-sm text-gray-600 mb-3">Add your daily supplements to track them here.</p>
            )}
            <div className="flex flex-wrap gap-2 mb-3">
              {supplementList.map(name => {
                const taken = todayTaken.has(name)
                return (
                  <div key={name} className="flex items-center gap-1 group">
                    <button
                      onClick={() => toggleSupplement(name)}
                      className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                        taken
                          ? 'bg-green-900/20 border-green-700/50 text-green-400'
                          : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300'
                      }`}
                    >
                      {taken ? '✓ ' : ''}{name}
                    </button>
                    <button
                      onClick={() => removeSupplement(name)}
                      className="opacity-0 group-hover:opacity-100 text-gray-700 hover:text-red-400 text-xs w-4 h-4 flex items-center justify-center transition-all"
                      title={`Remove ${name}`}
                      aria-label={`Remove ${name}`}
                    >
                      ✕
                    </button>
                  </div>
                )
              })}
              {addingSupp ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={newSupplementName}
                    onChange={e => setNewSupplementName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addSupplement(); if (e.key === 'Escape') { setAddingSupp(false); setNewSupplementName('') } }}
                    placeholder="Supplement name"
                    autoFocus
                    className="w-36 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-brand-500"
                  />
                  <button onClick={addSupplement} className="text-xs bg-brand-600 hover:bg-brand-500 text-white px-2 py-1 rounded-lg transition-colors">Add</button>
                  <button onClick={() => { setAddingSupp(false); setNewSupplementName('') }} className="text-xs text-gray-500 hover:text-gray-400 transition-colors">✕</button>
                </div>
              ) : (
                <button
                  onClick={() => setAddingSupp(true)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-dashed border-gray-700 text-gray-600 hover:border-brand-700 hover:text-brand-400 transition-colors"
                >
                  + Add
                </button>
              )}
            </div>
            {supplementList.length > 0 && <div className="flex gap-1">
              {last7.map(({ dateStr, label, pct, isToday }) => (
                <div
                  key={dateStr}
                  className={`flex-1 rounded-lg py-1.5 text-center ${isToday ? 'bg-brand-900/20 border border-brand-800/40' : 'bg-gray-800/60'}`}
                >
                  <p className={`text-xs font-medium ${isToday ? 'text-brand-400' : 'text-gray-600'}`}>{label}</p>
                  <p className={`text-xs mt-0.5 font-medium ${pct === 100 ? 'text-green-400' : pct >= 50 ? 'text-yellow-400' : pct > 0 ? 'text-gray-500' : 'text-gray-700'}`}>
                    {pct > 0 ? `${pct}%` : '—'}
                  </p>
                </div>
              ))}
            </div>}
          </div>
        )
      })()}

      {/* Daily Condition */}
      {(() => {
        const todayEntry = conditionLog.find(e => e.date === todayStr)
        const CONDITION_TAGS = ['Full', 'Flat', 'Dry', 'Watery', 'Tight', 'Vascular', 'Bloated', 'Smooth']
        const TAG_STYLE: Record<string, string> = {
          Full:    'text-green-400 bg-green-900/20 border-green-700/50',
          Flat:    'text-amber-400 bg-amber-900/20 border-amber-700/50',
          Dry:     'text-blue-400 bg-blue-900/20 border-blue-700/50',
          Watery:  'text-cyan-400 bg-cyan-900/20 border-cyan-700/50',
          Tight:   'text-green-400 bg-green-900/20 border-green-700/50',
          Vascular:'text-red-400 bg-red-900/20 border-red-700/50',
          Bloated: 'text-orange-400 bg-orange-900/20 border-orange-700/50',
          Smooth:  'text-gray-400 bg-gray-800 border-gray-600',
        }
        const last7 = Array.from({ length: 7 }, (_, i) => {
          const d = new Date()
          d.setDate(d.getDate() - (6 - i))
          const dateStr = d.toLocaleDateString('en-CA')
          return {
            dateStr,
            label: d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1) + d.getDate(),
            entry: conditionLog.find(e => e.date === dateStr),
          }
        })
        return (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-100">Daily Condition</h2>
              <span className="text-xs text-gray-600">how do you look today?</span>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {CONDITION_TAGS.map(tag => {
                const selected = todayEntry?.tags.includes(tag)
                return (
                  <button
                    key={tag}
                    onClick={() => toggleConditionTag(tag)}
                    className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                      selected ? TAG_STYLE[tag] : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                    }`}
                  >
                    {tag}
                  </button>
                )
              })}
            </div>
            {conditionInputOpen ? (
              <div className="flex items-center gap-2 mb-3">
                <input
                  type="text"
                  value={conditionNote}
                  onChange={e => setConditionNote(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && saveConditionNote()}
                  placeholder="e.g. great separation, looking full after refeed..."
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-brand-500"
                  autoFocus
                />
                <button onClick={saveConditionNote} className="text-xs bg-brand-600 hover:bg-brand-500 text-white px-3 py-1.5 rounded-lg transition-colors font-medium">Save</button>
                <button onClick={() => setConditionInputOpen(false)} className="text-xs text-gray-500 hover:text-gray-400 transition-colors">✕</button>
              </div>
            ) : (
              <button
                onClick={() => { setConditionNote(todayEntry?.note ?? ''); setConditionInputOpen(true) }}
                className="w-full mb-3 py-1.5 rounded-xl border border-dashed border-gray-700 text-gray-500 hover:border-brand-700 hover:text-brand-400 text-xs transition-colors"
              >
                {todayEntry?.note ? `"${todayEntry.note}"` : '+ Add condition note'}
              </button>
            )}
            <div className="flex gap-1">
              {last7.map(({ dateStr, label, entry }) => {
                const isToday = dateStr === todayStr
                const hasTags = (entry?.tags.length ?? 0) > 0
                return (
                  <div
                    key={dateStr}
                    className={`flex-1 rounded-lg py-1.5 text-center ${
                      isToday ? 'bg-brand-900/20 border border-brand-800/40' : 'bg-gray-800/60'
                    }`}
                  >
                    <p className={`text-xs font-medium ${isToday ? 'text-brand-400' : 'text-gray-600'}`}>{label}</p>
                    {hasTags ? (
                      <p className="text-xs text-gray-400 mt-0.5 truncate px-0.5" title={entry!.tags.join(', ')}>
                        {entry!.tags[0]}
                      </p>
                    ) : (
                      <p className="text-xs text-gray-700 mt-0.5">—</p>
                    )}
                  </div>
                )
              })}
            </div>
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
