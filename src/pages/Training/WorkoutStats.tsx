import { useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, CartesianGrid, ReferenceLine
} from 'recharts'
import type { WorkoutLog, ExerciseLibraryItem } from '../../types'

interface Props {
  history: WorkoutLog[]
  sessionsPerWeek: number
  units?: 'metric' | 'imperial'
  exerciseLibrary?: ExerciseLibraryItem[]
}

interface PR {
  exerciseName: string
  weightKg: number
  reps: number
  date: string
}

function computePRs(history: WorkoutLog[]): PR[] {
  const bests = new Map<string, PR>()
  for (const log of history) {
    if (log.status !== 'completed') continue
    for (const s of log.sets ?? []) {
      if (s.skipped || s.weight_kg === null || s.weight_kg === 0 || s.reps_actual === null) continue
      const existing = bests.get(s.exercise_name)
      if (!existing || s.weight_kg > existing.weightKg) {
        bests.set(s.exercise_name, {
          exerciseName: s.exercise_name,
          weightKg: s.weight_kg,
          reps: s.reps_actual,
          date: log.date,
        })
      }
    }
  }
  return Array.from(bests.values()).sort((a, b) => a.exerciseName.localeCompare(b.exerciseName))
}

// Epley formula: normalises different rep ranges into a comparable strength number
function epley1RM(weight: number, reps: number): number {
  return Math.round(weight * (1 + reps / 30) * 10) / 10
}

interface ProgressionPoint {
  date: string
  label: string   // short date label for X-axis
  weight: number  // top-set weight in kg
  reps: number    // reps for that set
  e1rm: number    // estimated 1RM
}

function computeExerciseProgression(history: WorkoutLog[], exerciseName: string): ProgressionPoint[] {
  const byDate = new Map<string, { weight: number; reps: number; e1rm: number }>()
  for (const log of history) {
    if (log.status !== 'completed') continue
    for (const s of log.sets ?? []) {
      if (s.exercise_name !== exerciseName || s.skipped) continue
      if (!s.weight_kg || s.weight_kg === 0 || !s.reps_actual || s.reps_actual === 0) continue
      const e1rm = epley1RM(s.weight_kg, s.reps_actual)
      const existing = byDate.get(log.date)
      if (!existing || e1rm > existing.e1rm) {
        byDate.set(log.date, { weight: s.weight_kg, reps: s.reps_actual, e1rm })
      }
    }
  }
  return Array.from(byDate.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => ({
      date,
      label: date.slice(5),   // MM-DD
      ...v,
    }))
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY_HEADERS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const ALL_MUSCLE_GROUPS = ['chest', 'back', 'shoulders', 'triceps', 'biceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core']

function todayStr() {
  return new Date().toLocaleDateString('en-CA')
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

// Monday-based week offset (Mon=0 … Sun=6)
function monthStartOffset(year: number, month: number) {
  const day = new Date(year, month, 1).getDay() // 0=Sun…6=Sat
  return day === 0 ? 6 : day - 1
}

function monthlyAdherenceData(history: WorkoutLog[], sessionsPerWeek: number) {
  // Build last 6 months (oldest→newest)
  const now = new Date()
  const result: { month: string; adherence: number; completed: number; planned: number }[] = []

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const year = d.getFullYear()
    const month = d.getMonth()
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`
    const days = daysInMonth(year, month)

    const monthLogs = history.filter(
      (l) => l.date.startsWith(prefix) && l.status !== 'in_progress'
    )
    // Count unique days that have at least one completed workout
    const completedDays = new Set(
      monthLogs.filter((l) => l.status === 'completed').map((l) => l.date)
    ).size
    const weeks = days / 7
    const planned = Math.round(weeks * sessionsPerWeek)
    const adherence = planned > 0 ? Math.min(100, Math.round((completedDays / planned) * 100)) : 0

    result.push({ month: MONTH_NAMES[month], adherence, completed: completedDays, planned })
  }
  return result
}

// Returns the Monday of the week containing `date`, offset by `weekOffset` weeks back
function getMondayOfWeek(weekOffset: number): Date {
  const today = new Date()
  const jsDay = today.getDay()
  const daysFromMon = jsDay === 0 ? 6 : jsDay - 1
  const monday = new Date(today)
  monday.setDate(today.getDate() - daysFromMon - weekOffset * 7)
  monday.setHours(0, 0, 0, 0)
  return monday
}

function dateToStr(d: Date): string {
  return d.toLocaleDateString('en-CA')
}

function computeWeekMuscleSets(
  history: WorkoutLog[],
  nameToGroup: Map<string, string>,
  fromStr: string,
  toStr: string
): Map<string, number> {
  const result = new Map<string, number>()
  for (const log of history) {
    if (log.status !== 'completed' || log.date < fromStr || log.date > toStr) continue
    for (const s of log.sets ?? []) {
      if (s.skipped) continue
      const group = nameToGroup.get(s.exercise_name)
      if (group) result.set(group, (result.get(group) ?? 0) + 1)
    }
  }
  return result
}

export default function WorkoutStats({ history, sessionsPerWeek, units = 'metric', exerciseLibrary = [] }: Props) {
  const prs = computePRs(history)
  const toDisplay = (kg: number) =>
    units === 'imperial' ? Math.round(kg * 2.20462 * 10) / 10 : kg
  const weightUnit = units === 'imperial' ? 'lbs' : 'kg'
  const now = new Date()
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth())
  const [selectedExercise, setSelectedExercise] = useState<string>('')

  // Exercises with at least 2 data points (enough to draw a progression line)
  const trackableExercises = useMemo(() => {
    const counts = new Map<string, number>()
    for (const log of history) {
      if (log.status !== 'completed') continue
      const seen = new Set<string>()
      for (const s of log.sets ?? []) {
        if (!s.skipped && s.weight_kg && s.weight_kg > 0 && s.reps_actual && !seen.has(s.exercise_name)) {
          seen.add(s.exercise_name)
          counts.set(s.exercise_name, (counts.get(s.exercise_name) ?? 0) + 1)
        }
      }
    }
    return Array.from(counts.entries())
      .filter(([, n]) => n >= 2)
      .map(([name]) => name)
      .sort()
  }, [history])

  const progressionData = useMemo(() => {
    if (!selectedExercise) return []
    const raw = computeExerciseProgression(history, selectedExercise)
    return raw.map((p) => ({
      ...p,
      e1rm: toDisplay(p.e1rm),
      weight: toDisplay(p.weight),
    }))
  }, [selectedExercise, history, units])

  function prevMonth() {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11) }
    else setViewMonth((m) => m - 1)
  }
  function nextMonth() {
    const isCurrentMonth = viewYear === now.getFullYear() && viewMonth === now.getMonth()
    if (isCurrentMonth) return
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0) }
    else setViewMonth((m) => m + 1)
  }

  const prefix = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`
  const monthLogs = history.filter((l) => l.date.startsWith(prefix) && l.status !== 'in_progress')

  // Map date → log for calendar coloring
  const dateMap = new Map(monthLogs.map((l) => [l.date, l]))

  const days = daysInMonth(viewYear, viewMonth)
  const offset = monthStartOffset(viewYear, viewMonth)
  const today = todayStr()

  // Unique days with at least one completed / skipped workout
  const completedDays = new Set(
    monthLogs.filter((l) => l.status === 'completed').map((l) => l.date)
  ).size
  const skippedDays = new Set(
    monthLogs.filter((l) => l.status === 'skipped').map((l) => l.date)
  ).size
  const weeks = days / 7
  const planned = Math.max(1, Math.round(weeks * sessionsPerWeek))
  const adherence = Math.min(100, Math.round((completedDays / planned) * 100))

  const barData = monthlyAdherenceData(history, sessionsPerWeek)
  const isCurrentMonth = viewYear === now.getFullYear() && viewMonth === now.getMonth()

  // Total stats across all history — days-based
  const allCompletedDays = new Set(
    history.filter((l) => l.status === 'completed').map((l) => l.date)
  ).size
  const completedLogs = history.filter((l) => l.status === 'completed')
  const totalSetsAllTime = completedLogs
    .reduce((acc, l) => acc + (l.sets?.filter((s) => !s.skipped).length ?? 0), 0)
  const avgSets = completedLogs.length > 0 ? Math.round(totalSetsAllTime / completedLogs.length) : 0

  // 4-week volume trend: requires exercise library to map exercise → muscle group
  const nameToGroup = new Map(exerciseLibrary.map((e) => [e.name, e.muscleGroup]))
  const weekBounds = Array.from({ length: 4 }, (_, i) => {
    const offsetWeeks = 3 - i // 3, 2, 1, 0 (oldest → current)
    const mon = getMondayOfWeek(offsetWeeks)
    const sun = new Date(mon)
    sun.setDate(mon.getDate() + 6)
    const label = offsetWeeks === 0 ? 'This Wk'
      : offsetWeeks === 1 ? 'Last Wk'
      : `−${offsetWeeks}w`
    return { label, from: dateToStr(mon), to: dateToStr(sun) }
  })
  const weekSets = weekBounds.map(({ from, to }) =>
    computeWeekMuscleSets(history, nameToGroup, from, to)
  )
  // Only show muscle groups that appear in the exercise library AND have at least 1 set in any of the 4 weeks
  const activeMuscleGroups = exerciseLibrary.length > 0
    ? ALL_MUSCLE_GROUPS.filter((g) => weekSets.some((ws) => (ws.get(g) ?? 0) > 0))
    : []

  // Weekly tonnage: total (weight_kg × reps) across all completed sets — for progressive overload tracking
  function computeTonnageKg(fromStr: string, toStr: string): number {
    return history
      .filter((l) => l.status === 'completed' && l.date >= fromStr && l.date <= toStr)
      .reduce((total, l) =>
        total + (l.sets ?? []).reduce((sum, s) =>
          !s.skipped && s.weight_kg && s.reps_actual ? sum + s.weight_kg * s.reps_actual : sum, 0
        ), 0
      )
  }
  const thisWeekTonnageKg = computeTonnageKg(weekBounds[3].from, weekBounds[3].to)
  const lastWeekTonnageKg = computeTonnageKg(weekBounds[2].from, weekBounds[2].to)
  const thisWeekTonnage = Math.round(toDisplay(thisWeekTonnageKg))
  const lastWeekTonnage = Math.round(toDisplay(lastWeekTonnageKg))
  const tonnagePctDelta = lastWeekTonnageKg > 0
    ? Math.round(((thisWeekTonnageKg - lastWeekTonnageKg) / lastWeekTonnageKg) * 100)
    : null

  // 6-week tonnage trend for the bar chart (oldest → newest)
  const sixWeekTonnageData = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const offsetWeeks = 5 - i // 5, 4, 3, 2, 1, 0
      const mon = getMondayOfWeek(offsetWeeks)
      const sun = new Date(mon)
      sun.setDate(mon.getDate() + 6)
      const from = dateToStr(mon)
      const to = dateToStr(sun)
      const tonnageKg = computeTonnageKg(from, to)
      const label = offsetWeeks === 0 ? 'Now'
        : offsetWeeks === 1 ? '-1w'
        : `-${offsetWeeks}w`
      return {
        label,
        tonnage: Math.round(toDisplay(tonnageKg)),
        isCurrent: offsetWeeks === 0,
      }
    })
  }, [history, units])

  if (completedLogs.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center space-y-2">
        <p className="text-gray-400 font-medium">No workouts logged yet.</p>
        <p className="text-gray-600 text-sm">Complete your first workout from the Plan tab to unlock stats, personal records, and progress charts.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* All-time summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center">
          <p className="text-xl font-bold text-brand-400">{allCompletedDays}</p>
          <p className="text-xs text-gray-500 mt-0.5">Days Trained</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center">
          <p className="text-xl font-bold text-green-400">{avgSets}</p>
          <p className="text-xs text-gray-500 mt-0.5">Avg Sets / Session</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center">
          <p className="text-xl font-bold text-gray-200">{sessionsPerWeek}x</p>
          <p className="text-xs text-gray-500 mt-0.5">Plan Frequency</p>
        </div>
      </div>

      {/* Weekly tonnage — progressive overload tracker */}
      {(thisWeekTonnage > 0 || lastWeekTonnage > 0) && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Weekly Tonnage</p>
            <span className="text-xs text-gray-600">weight × reps</span>
          </div>
          <div className="flex items-center gap-5">
            <div>
              <p className="text-2xl font-black text-brand-400 tabular-nums">
                {thisWeekTonnage.toLocaleString()}
                <span className="text-sm font-medium ml-1 text-brand-300">{weightUnit}</span>
              </p>
              <p className="text-xs text-gray-500 mt-0.5">This week</p>
            </div>
            {lastWeekTonnage > 0 && (
              <>
                <div className="text-gray-700 text-sm">vs</div>
                <div>
                  <p className="text-lg font-bold text-gray-500 tabular-nums">
                    {lastWeekTonnage.toLocaleString()}
                    <span className="text-xs font-medium ml-1">{weightUnit}</span>
                  </p>
                  <p className="text-xs text-gray-600 mt-0.5">Last week</p>
                </div>
                {tonnagePctDelta !== null && (
                  <div className={`ml-auto text-base font-bold px-2.5 py-1 rounded-lg ${
                    tonnagePctDelta > 0 ? 'text-green-400 bg-green-900/20' :
                    tonnagePctDelta < 0 ? 'text-red-400 bg-red-900/20' :
                    'text-gray-400 bg-gray-800'
                  }`}>
                    {tonnagePctDelta > 0 ? '+' : ''}{tonnagePctDelta}%
                  </div>
                )}
              </>
            )}
          </div>
          <p className="text-xs text-gray-700 mt-2">Aim for 5–10% increase per week during hypertrophy phases.</p>
        </div>
      )}

      {/* 6-week volume load trend chart */}
      {sixWeekTonnageData.some((d) => d.tonnage > 0) && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">6-Week Volume Trend</p>
            <span className="text-xs text-gray-600">{weightUnit} moved (wt × reps)</span>
          </div>
          <ResponsiveContainer width="100%" height={110}>
            <BarChart data={sixWeekTonnageData} margin={{ top: 0, right: 0, left: -28, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false}
                tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
              <Tooltip
                formatter={(val: number) => [val.toLocaleString() + ' ' + weightUnit, 'Volume']}
                contentStyle={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, fontSize: 11 }}
                labelStyle={{ color: '#9ca3af' }}
                cursor={{ fill: '#1f2937' }}
              />
              <Bar dataKey="tonnage" radius={[3, 3, 0, 0]} maxBarSize={40}>
                {sixWeekTonnageData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.isCurrent ? '#7c3aed' : entry.tonnage === 0 ? '#374151' : '#4b5563'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-xs text-gray-700 mt-1">
            Purple bar = this week. Consistent upward trend indicates progressive overload.
          </p>
        </div>
      )}

      {/* 4-week muscle volume trend */}
      {activeMuscleGroups.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            4-Week Muscle Volume (sets)
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="text-left text-gray-600 pb-2 pr-3 font-medium w-24">Muscle</th>
                  {weekBounds.map(({ label }) => (
                    <th
                      key={label}
                      className={`text-center pb-2 px-1 font-medium w-14 ${
                        label === 'This Wk' ? 'text-brand-400' : 'text-gray-500'
                      }`}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeMuscleGroups.map((group) => (
                  <tr key={group} className="border-t border-gray-800/50">
                    <td className="py-1.5 pr-3 text-gray-400 capitalize">{group}</td>
                    {weekSets.map((ws, wi) => {
                      const count = ws.get(group) ?? 0
                      const isCurrentWeek = wi === 3
                      const cellColor = count === 0
                        ? 'text-red-500/60 bg-red-900/10'
                        : count >= 6
                          ? 'text-green-400 bg-green-900/20'
                          : 'text-yellow-400 bg-yellow-900/10'
                      return (
                        <td key={wi} className="py-1.5 px-1 text-center">
                          <span className={`inline-block rounded px-1.5 py-0.5 font-bold tabular-nums ${cellColor} ${isCurrentWeek ? 'ring-1 ring-brand-700' : ''}`}>
                            {count}
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-700 mt-2">
            <span className="text-green-400">6+</span> = strong &nbsp;
            <span className="text-yellow-400">1–5</span> = moderate &nbsp;
            <span className="text-red-500/70">0</span> = not trained
          </p>
        </div>
      )}

      {/* Monthly adherence bar chart */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <p className="text-xs font-medium text-gray-400 mb-3">Monthly Adherence (last 6 months)</p>
        <ResponsiveContainer width="100%" height={110}>
          <BarChart data={barData} margin={{ top: 0, right: 0, left: -28, bottom: 0 }}>
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
            <Tooltip
              formatter={(val: number, _name: string, entry: any) =>
                [`${val}% (${entry.payload.completed}/${entry.payload.planned})`, 'Adherence']
              }
              contentStyle={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, fontSize: 11 }}
              labelStyle={{ color: '#9ca3af' }}
              cursor={{ fill: '#1f2937' }}
            />
            <Bar dataKey="adherence" radius={[3, 3, 0, 0]} maxBarSize={36}>
              {barData.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.adherence >= 80 ? '#22c55e' : entry.adherence >= 50 ? '#7c3aed' : '#ef4444'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Calendar */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        {/* Month nav */}
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={prevMonth}
            className="text-gray-400 hover:text-gray-200 px-2 py-1 rounded transition-colors"
          >
            ←
          </button>
          <p className="text-sm font-semibold text-gray-200">
            {MONTH_NAMES[viewMonth]} {viewYear}
          </p>
          <button
            onClick={nextMonth}
            disabled={isCurrentMonth}
            className="text-gray-400 hover:text-gray-200 px-2 py-1 rounded transition-colors disabled:opacity-30"
          >
            →
          </button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 mb-1">
          {DAY_HEADERS.map((d) => (
            <div key={d} className="text-center text-xs text-gray-600 py-1">{d}</div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-0.5">
          {Array.from({ length: offset }, (_, i) => (
            <div key={`pad-${i}`} />
          ))}
          {Array.from({ length: days }, (_, i) => {
            const day = i + 1
            const dateKey = `${prefix}-${String(day).padStart(2, '0')}`
            const log = dateMap.get(dateKey)
            const isToday = dateKey === today
            const isCompleted = log?.status === 'completed'
            const isSkipped = log?.status === 'skipped'
            const setCount = log?.sets?.filter((s) => !s.skipped).length ?? 0

            return (
              <div
                key={day}
                className={`flex flex-col items-center justify-center rounded-lg py-1.5 ${
                  isToday ? 'ring-1 ring-brand-500' : ''
                } ${
                  isCompleted ? 'bg-green-900/20' : isSkipped ? 'bg-red-900/10' : ''
                }`}
              >
                <span className={`text-xs ${isToday ? 'text-brand-400 font-bold' : 'text-gray-400'}`}>
                  {day}
                </span>
                {isCompleted && (
                  <span className="text-green-500 text-xs leading-none">●</span>
                )}
                {isSkipped && (
                  <span className="text-red-700 text-xs leading-none">–</span>
                )}
                {isCompleted && setCount > 0 && (
                  <span className="text-gray-600 text-xs leading-none" style={{ fontSize: 9 }}>{setCount}s</span>
                )}
              </div>
            )
          })}
        </div>

        {/* Month summary */}
        <div className="mt-3 pt-3 border-t border-gray-800 flex items-center justify-between text-xs">
          <div className="flex gap-3">
            <span className="text-green-400">{completedDays} day{completedDays !== 1 ? 's' : ''} trained</span>
            {skippedDays > 0 && <span className="text-red-400">{skippedDays} skipped</span>}
          </div>
          <span className={`font-semibold ${adherence >= 80 ? 'text-green-400' : adherence >= 50 ? 'text-brand-400' : 'text-red-400'}`}>
            {adherence}% adherence
          </span>
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-xs text-gray-500 px-1">
        <span className="flex items-center gap-1"><span className="text-green-500">●</span> Completed</span>
        <span className="flex items-center gap-1"><span className="text-red-700">–</span> Skipped</span>
        <span className="flex items-center gap-1"><span className="text-gray-600">○</span> Rest day</span>
      </div>

      {/* Lift Progression Chart */}
      {trackableExercises.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Lift Progression</p>
            <span className="text-xs text-gray-600">e1RM = estimated 1-rep max</span>
          </div>
          <select
            value={selectedExercise}
            onChange={(e) => setSelectedExercise(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 mb-3"
          >
            <option value="">— Select an exercise —</option>
            {trackableExercises.map((ex) => (
              <option key={ex} value={ex}>{ex}</option>
            ))}
          </select>
          {selectedExercise && progressionData.length >= 2 && (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={progressionData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={{ stroke: '#374151' }} tickLine={false} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={{ stroke: '#374151' }} tickLine={false} domain={['auto', 'auto']} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const d = payload[0].payload as typeof progressionData[0]
                      return (
                        <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs">
                          <p className="text-gray-400 mb-1">{d.date}</p>
                          <p className="text-brand-400 font-bold">e1RM: {d.e1rm} {weightUnit}</p>
                          <p className="text-gray-400">Top set: {d.weight} {weightUnit} × {d.reps} reps</p>
                        </div>
                      )
                    }}
                  />
                  <ReferenceLine y={progressionData[0]?.e1rm} stroke="#4b5563" strokeDasharray="4 2" />
                  <Line
                    type="monotone"
                    dataKey="e1rm"
                    stroke="#f97316"
                    strokeWidth={2}
                    dot={{ fill: '#f97316', r: 4, strokeWidth: 0 }}
                    activeDot={{ r: 6, fill: '#fb923c' }}
                  />
                </LineChart>
              </ResponsiveContainer>
              <div className="flex justify-between text-xs mt-2">
                <span className="text-gray-600">Start: {progressionData[0]?.e1rm} {weightUnit}</span>
                <span className={`font-semibold ${
                  progressionData[progressionData.length - 1]?.e1rm >= progressionData[0]?.e1rm
                    ? 'text-green-400' : 'text-red-400'
                }`}>
                  Now: {progressionData[progressionData.length - 1]?.e1rm} {weightUnit}
                  {' '}({progressionData[progressionData.length - 1]?.e1rm >= progressionData[0]?.e1rm ? '+' : ''}
                  {(progressionData[progressionData.length - 1]?.e1rm - progressionData[0]?.e1rm).toFixed(1)})
                </span>
              </div>
            </>
          )}
          {selectedExercise && progressionData.length < 2 && (
            <p className="text-xs text-gray-600 text-center py-4">Log at least 2 sessions with weight to see progression.</p>
          )}
          {!selectedExercise && (
            <p className="text-xs text-gray-600 text-center py-4">Pick an exercise to chart your strength over time.</p>
          )}
        </div>
      )}

      {/* Personal Records */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">Personal Records</p>
        {prs.length > 0 ? (
          <div className="space-y-2">
            {prs.map((pr) => (
              <div key={pr.exerciseName} className="flex items-center justify-between py-1 border-b border-gray-800 last:border-0">
                <p className="text-sm text-gray-300 truncate pr-3">{pr.exerciseName}</p>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-sm font-bold text-brand-400">
                    {toDisplay(pr.weightKg)}{weightUnit} × {pr.reps}
                  </span>
                  <span className="text-xs text-gray-600 hidden sm:inline">{pr.date}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-600 text-center py-2">Log workouts with weights to see your records.</p>
        )}
      </div>
    </div>
  )
}
