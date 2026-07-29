import { Link } from 'react-router-dom'
import { useUserStore } from '../../store/userStore'
import { usePlanStore } from '../../store/planStore'
import Button from '../ui/Button'
import { localDateStr } from '../../utils/dates'

export default function TodaysMealsWidget() {
  const { user } = useUserStore()
  const { dietPlan, mealCompletions, logMealCompletion, unlogMealCompletion } = usePlanStore()
  const todayStr = localDateStr()
  if (!user) return null

  const isMealDone = (idx: number) => mealCompletions.some(c => c.date === todayStr && c.meal_index === idx)
  function handleToggleMeal(idx: number, name: string) {
    if (isMealDone(idx)) unlogMealCompletion(user!.id, todayStr, idx)
    else logMealCompletion(user!.id, todayStr, idx, name)
  }

  return (
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
                <div className={`w-5 h-5 rounded-full flex-shrink-0 border-2 flex items-center justify-center transition-colors ${done ? 'border-green-500 bg-green-500 text-white' : 'border-gray-600'}`}>
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
          {(dietPlan.meals?.length ?? 0) > 0 && (() => {
            const eatenIndices = new Set(mealCompletions.filter(c => c.date === todayStr).map(c => c.meal_index))
            const meals = dietPlan.meals ?? []
            const eatenCals = meals.reduce((sum, m, i) => sum + (eatenIndices.has(i) ? m.calories : 0), 0)
            const eatenProtein = meals.reduce((sum, m, i) => sum + (eatenIndices.has(i) ? m.protein_g : 0), 0)
            // Guard the denominators: a stored plan can carry calories_target=0 /
            // protein_g=0 (a legacy/pre-sanitize row — plan:recalculateMacros floors
            // calories only locally and never writes calories_target back, so a 0
            // persists until a check-in heals it). Unguarded, 0 meals → 0/0 = NaN →
            // width:"NaN%" (invalid CSS, blank bar); ≥1 meal → x/0 = Infinity →
            // min(100, Infinity) = 100 (a bar falsely reading fully complete).
            // Mirror the sibling TodaysMacrosWidget / Diet "Today's Intake" guard.
            const calPct = Math.min(100, dietPlan.calories_target > 0 ? Math.round((eatenCals / dietPlan.calories_target) * 100) : 0)
            const proteinPct = Math.min(100, dietPlan.protein_g > 0 ? Math.round((eatenProtein / dietPlan.protein_g) * 100) : 0)
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
                    <div className="h-full bg-brand-500 transition-all duration-300" style={{ width: `${calPct}%` }} />
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
                    <div className={`h-full transition-all duration-300 ${proteinPct >= 80 ? 'bg-green-500' : proteinPct >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${proteinPct}%` }} />
                  </div>
                </div>
                <p className="text-xs text-gray-600 text-right">{eatenIndices.size}/{meals.length} meals logged</p>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}
