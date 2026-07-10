import { useUserStore } from '../../store/userStore'
import { usePlanStore } from '../../store/planStore'
import { localDateStr } from '../../utils/dates'

export default function NextMealWidget() {
  const { user } = useUserStore()
  const { dietPlan, mealCompletions, logMealCompletion, unlogMealCompletion } = usePlanStore()
  const todayStr = localDateStr()
  if (!user || !dietPlan) return null

  const isMealDone = (idx: number) => mealCompletions.some(c => c.date === todayStr && c.meal_index === idx)
  function handleToggleMeal(idx: number, name: string) {
    if (isMealDone(idx)) unlogMealCompletion(user!.id, todayStr, idx)
    else logMealCompletion(user!.id, todayStr, idx, name)
  }

  const nowDate = new Date()
  const nowMins = nowDate.getHours() * 60 + nowDate.getMinutes()
  const meals = dietPlan.meals ?? []
  const todayMealsDone = new Set(mealCompletions.filter(c => c.date === todayStr).map(c => c.meal_index))
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
  const unloggedMeals = meals.map((meal, idx) => ({ meal, idx })).filter(({ idx }) => !todayMealsDone.has(idx))
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
}
