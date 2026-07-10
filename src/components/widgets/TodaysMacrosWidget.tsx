import { usePlanStore } from '../../store/planStore'
import { localDateStr } from '../../utils/dates'

export default function TodaysMacrosWidget() {
  const { dietPlan, mealCompletions } = usePlanStore()
  const todayStr = localDateStr()
  const meals = dietPlan?.meals ?? []
  if (!dietPlan || meals.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Today's Macros</p>
        <p className="text-sm text-gray-600">No meal plan yet.</p>
      </div>
    )
  }
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
}
