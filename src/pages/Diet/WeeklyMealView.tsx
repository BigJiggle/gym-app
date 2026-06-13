import { useEffect, useState } from 'react'
import { useUserStore } from '../../store/userStore'
import { usePlanStore } from '../../store/planStore'
import type { MealCompletion } from '../../types'
import { localDateStr } from '../../utils/dates'

function getWeekBounds(weekOffset: number): { start: string; end: string; days: Date[] } {
  const now = new Date()
  const dayOfWeek = now.getDay() // 0=Sun
  const monday = new Date(now)
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) + weekOffset * 7)
  monday.setHours(0, 0, 0, 0)
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
  return { start: localDateStr(days[0]), end: localDateStr(days[6]), days }
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

interface Props {
  mealCount: number
  meals: { name: string; time: string; calories: number; protein_g: number; carbs_g: number; fat_g: number; foods: string[] }[]
}

export default function WeeklyMealView({ mealCount, meals }: Props) {
  const { user } = useUserStore()
  const { mealCompletions, loadMealCompletions, logMealCompletion, unlogMealCompletion } = usePlanStore()

  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedDate, setSelectedDate] = useState(() => localDateStr())

  const { start, end, days } = getWeekBounds(weekOffset)

  useEffect(() => {
    if (!user) return
    loadMealCompletions(user.id, start, end)
  }, [user?.id, weekOffset])

  // When week changes, select today if in range, else first day of week
  useEffect(() => {
    const today = localDateStr()
    if (today >= start && today <= end) {
      setSelectedDate(today)
    } else {
      setSelectedDate(start)
    }
  }, [start, end])

  if (!user || !meals.length) {
    return (
      <div className="py-12 text-center text-gray-500 text-sm">
        Generate a nutrition plan first to use the weekly view.
      </div>
    )
  }

  function isCompleted(date: string, mealIndex: number): boolean {
    return mealCompletions.some((c) => c.date === date && c.meal_index === mealIndex)
  }

  function completedCountForDay(date: string): number {
    return mealCompletions.filter((c) => c.date === date).length
  }

  function dayMacros(date: string): { cal: number; protein: number } {
    const loggedIndices = mealCompletions
      .filter((c) => c.date === date)
      .map((c) => c.meal_index)
    return loggedIndices.reduce(
      (acc, idx) => {
        const meal = meals[idx]
        return meal ? { cal: acc.cal + meal.calories, protein: acc.protein + meal.protein_g } : acc
      },
      { cal: 0, protein: 0 }
    )
  }

  async function toggleMeal(date: string, mealIndex: number, mealName: string) {
    if (!user) return
    if (isCompleted(date, mealIndex)) {
      await unlogMealCompletion(user.id, date, mealIndex)
    } else {
      await logMealCompletion(user.id, date, mealIndex, mealName)
    }
  }

  const todayStr = localDateStr()
  const isFutureDateSelected = selectedDate > todayStr
  const selectedMeals = meals
  const completedToday = completedCountForDay(selectedDate)
  const progressPct = meals.length > 0 ? Math.round((completedToday / meals.length) * 100) : 0

  // Format week label
  const monthFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
  const weekLabel = `${monthFmt.format(days[0])} – ${monthFmt.format(days[6])}`

  return (
    <div className="space-y-4">
      {/* Week navigation */}
      <div className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
        <button
          onClick={() => setWeekOffset((w) => w - 1)}
          className="text-gray-400 hover:text-gray-200 text-sm px-2 py-1 rounded-lg hover:bg-gray-800 transition-colors"
        >
          &larr; Prev
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold text-gray-200">Week of {weekLabel}</p>
          {weekOffset === 0 && <p className="text-xs text-brand-400">Current week</p>}
          {weekOffset < 0 && <p className="text-xs text-gray-500">{Math.abs(weekOffset)} week{Math.abs(weekOffset) > 1 ? 's' : ''} ago</p>}
          {weekOffset > 0 && <p className="text-xs text-gray-500">{weekOffset} week{weekOffset > 1 ? 's' : ''} ahead</p>}
        </div>
        <button
          onClick={() => setWeekOffset((w) => w + 1)}
          disabled={weekOffset >= 0}
          className="text-gray-400 hover:text-gray-200 disabled:opacity-30 text-sm px-2 py-1 rounded-lg hover:bg-gray-800 transition-colors disabled:cursor-not-allowed"
        >
          Next &rarr;
        </button>
      </div>

      {/* Day selector */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((day, i) => {
          const dateStr = localDateStr(day)
          const isSelected = dateStr === selectedDate
          const isToday = dateStr === todayStr
          const isFutureDay = dateStr > todayStr
          const done = completedCountForDay(dateStr)
          const hasMeals = done > 0
          const { cal, protein } = hasMeals ? dayMacros(dateStr) : { cal: 0, protein: 0 }
          const calLabel = cal >= 1000 ? `${(cal / 1000).toFixed(1)}k` : `${cal}`

          return (
            <button
              key={dateStr}
              onClick={() => !isFutureDay && setSelectedDate(dateStr)}
              disabled={isFutureDay}
              className={`flex flex-col items-center py-2 px-1 rounded-xl border transition-colors ${
                isFutureDay
                  ? 'border-gray-800 text-gray-700 opacity-30 cursor-not-allowed'
                  : isSelected
                  ? 'border-brand-500 bg-brand-900/30 text-brand-400'
                  : isToday
                  ? 'border-brand-800/40 bg-brand-950/20 text-gray-300'
                  : 'border-gray-800 text-gray-500 hover:border-gray-700 hover:text-gray-300'
              }`}
            >
              <span className="text-xs font-medium">{DAY_LABELS[i]}</span>
              <span className={`text-base font-bold mt-0.5 ${isSelected ? 'text-brand-400' : isToday ? 'text-gray-200' : 'text-gray-500'}`}>
                {day.getDate()}
              </span>
              {hasMeals ? (
                <>
                  <span className="text-xs text-green-400 mt-0.5 font-medium">{done}/{meals.length}</span>
                  <span className="text-[10px] leading-none text-brand-400 mt-0.5">{calLabel}</span>
                  <span className="text-[10px] leading-none text-purple-400">{protein}g P</span>
                </>
              ) : (
                <>
                  <span className="text-xs text-transparent mt-0.5">-</span>
                  <span className="text-[10px] leading-none text-transparent mt-0.5">-</span>
                  <span className="text-[10px] leading-none text-transparent">-</span>
                </>
              )}
            </button>
          )
        })}
      </div>

      {/* Selected day meals */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-200 text-sm">
            {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric'
            })}
          </h3>
          {completedToday > 0 && (
            <span className="text-xs text-green-400">
              {completedToday}/{meals.length} meals logged
            </span>
          )}
        </div>

        {/* Future date notice */}
        {isFutureDateSelected && (
          <div className="text-center py-2 mb-2">
            <p className="text-xs text-gray-600">Meal logging is not available for future dates.</p>
          </div>
        )}

        {/* Progress bar */}
        {meals.length > 0 && !isFutureDateSelected && (
          <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden mb-4">
            <div
              className="h-full bg-green-500 transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        )}

        <div className="space-y-2">
          {selectedMeals.map((meal, idx) => {
            const done = isCompleted(selectedDate, idx)
            return (
              <div
                key={idx}
                className={`bg-gray-900 border rounded-xl p-4 transition-all ${
                  done ? 'border-green-900/40 bg-green-950/10' : 'border-gray-800'
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Checkbox — disabled for future dates */}
                  <button
                    onClick={() => !isFutureDateSelected && toggleMeal(selectedDate, idx, meal.name)}
                    disabled={isFutureDateSelected}
                    className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 border-2 transition-colors ${
                      isFutureDateSelected
                        ? 'border-gray-700 opacity-30 cursor-not-allowed'
                        : done
                        ? 'border-green-500 bg-green-500 text-white'
                        : 'border-gray-600 hover:border-green-500'
                    }`}
                  >
                    {done && !isFutureDateSelected && <span className="text-xs font-bold">&#10003;</span>}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-600 font-mono">{meal.time}</span>
                        <h4 className={`text-sm font-semibold ${done ? 'text-gray-500 line-through' : 'text-gray-200'}`}>
                          {meal.name}
                        </h4>
                      </div>
                      <div className="flex gap-2 text-xs flex-shrink-0 ml-2">
                        <span className="text-brand-400">{meal.calories} kcal</span>
                        <span className="text-green-400">P{meal.protein_g}g</span>
                        <span className="text-blue-400">C{meal.carbs_g}g</span>
                        <span className="text-yellow-400">F{meal.fat_g}g</span>
                      </div>
                    </div>
                    <div className={`flex flex-wrap gap-1 ${done ? 'opacity-40' : ''}`}>
                      {meal.foods.map((food, fi) => (
                        <span key={fi} className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-md">
                          {food}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {meals.length === 0 && (
          <div className="py-8 text-center text-gray-600 text-sm">
            No meals in your current plan.
          </div>
        )}
      </div>
    </div>
  )
}
