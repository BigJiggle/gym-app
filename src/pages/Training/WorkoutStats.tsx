import { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell
} from 'recharts'
import type { WorkoutLog } from '../../types'

interface Props {
  history: WorkoutLog[]
  sessionsPerWeek: number
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY_HEADERS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

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

export default function WorkoutStats({ history, sessionsPerWeek }: Props) {
  const now = new Date()
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth())

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
    </div>
  )
}
