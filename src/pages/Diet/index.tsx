import { useEffect, useState } from 'react'
import { useUserStore } from '../../store/userStore'
import { usePlanStore } from '../../store/planStore'
import { useSettingsStore } from '../../store/settingsStore'
import { StatCard } from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import WeeklyMealView from './WeeklyMealView'
import GroceryList from './GroceryList'
import { FOODS } from '../../data/foods'
import { localDateStr } from '../../utils/dates'
import type { Meal, MealCompletion } from '../../types'

type DietTab = 'plan' | 'weekly' | 'grocery'

export default function Diet() {
  const { user, updateUser } = useUserStore()
  const { dietPlan, loadDietPlan, generateDietPlan, recalculateMacros, loading, mealCompletions, loadMealCompletions, logMealCompletion, unlogMealCompletion } = usePlanStore()
  const { settings } = useSettingsStore()

  const [tab, setTab] = useState<DietTab>('plan')
  const [swapTarget, setSwapTarget] = useState<{ mealIndex: number; meal: Meal } | null>(null)
  const [swapping, setSwapping] = useState(false)
  const [swapError, setSwapError] = useState<string | null>(null)
  const [excludePending, setExcludePending] = useState<string | null>(null)
  const [aiRefinePrompt, setAiRefinePrompt] = useState('')
  const [aiRefining, setAiRefining] = useState(false)
  const [aiRefineError, setAiRefineError] = useState<string | null>(null)
  const [aiRefineSuccess, setAiRefineSuccess] = useState<string | null>(null)
  const [aiRefineInfo, setAiRefineInfo] = useState<string | null>(null)
  const [recalcDone, setRecalcDone] = useState(false)
  const [recalcLoading, setRecalcLoading] = useState(false)
  const [regenLoading, setRegenLoading] = useState(false)
  const [regenDone, setRegenDone] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [streakCompletions, setStreakCompletions] = useState<MealCompletion[]>([])

  // Food preferences panel state
  const [prefsOpen, setPrefsOpen] = useState(false)
  const [prefsCookTime, setPrefsCookTime] = useState<'quick' | 'medium' | 'chef'>('medium')
  const [prefsPrepStyle, setPrefsPrepStyle] = useState<'daily' | 'batch' | 'mixed'>('daily')
  const [prefsSnackCount, setPrefsSnackCount] = useState(0)
  const [prefsExclusions, setPrefsExclusions] = useState<string[]>([])
  const [prefsPreferences, setPrefsPreferences] = useState<string[]>([])
  const [prefsExcludeSearch, setPrefsExcludeSearch] = useState('')
  const [prefsPreferSearch, setPrefsPreferSearch] = useState('')
  const [prefsSaving, setPrefsSaving] = useState(false)
  const [prefsRestrictions, setPrefsRestrictions] = useState<string[]>([])
  const [refeedDayOfWeek, setRefeedDayOfWeekState] = useState<number | null>(() => {
    const stored = localStorage.getItem('refeed_day')
    if (stored === null) return null
    const n = parseInt(stored, 10)
    return !isNaN(n) && n >= 0 && n <= 6 ? n : null
  })
  const [refeedPanelOpen, setRefeedPanelOpen] = useState(false)

  // Water intake tracker — syncs with Dashboard via shared localStorage keys (water_ml_${todayStr})
  // Displays in glasses (250ml each) for a quick tap-to-add UI; Dashboard shows the same data in ml.
  const ML_PER_GLASS = 250
  const [waterGlasses, setWaterGlasses] = useState<number>(() => {
    const ml = parseInt(localStorage.getItem(`water_ml_${localDateStr()}`) ?? '0', 10)
    return Math.round((isNaN(ml) ? 0 : ml) / ML_PER_GLASS)
  })
  const [waterTarget, setWaterTarget] = useState<number>(() => {
    const ml = parseInt(localStorage.getItem('water_target_ml') ?? '3000', 10)
    const glasses = Math.round((isNaN(ml) ? 3000 : ml) / ML_PER_GLASS)
    return Math.max(4, Math.min(20, glasses))
  })

  const CARDIO_STEP = 5
  const [cardioMin, setCardioMin] = useState<number>(() => {
    try {
      const log: Array<{ date: string; minutes: number }> = JSON.parse(localStorage.getItem('cardio_log') ?? '[]')
      return log.find(e => e.date === localDateStr())?.minutes ?? 0
    } catch { return 0 }
  })
  const [cardioTarget, setCardioTarget] = useState<number>(() => {
    const stored = parseInt(localStorage.getItem('cardio_target_min') ?? '30', 10)
    return [30, 45, 60].includes(stored) ? stored : 30
  })

  function updateWater(delta: number) {
    setWaterGlasses(prev => {
      const next = Math.max(0, Math.min(20, prev + delta))
      localStorage.setItem(`water_ml_${todayStr}`, String(next * ML_PER_GLASS))
      return next
    })
  }

  function cycleWaterTarget() {
    setWaterTarget(prev => {
      const next = prev === 8 ? 10 : prev === 10 ? 12 : 8
      localStorage.setItem('water_target_ml', String(next * ML_PER_GLASS))
      return next
    })
  }

  function updateCardio(delta: number) {
    setCardioMin(prev => {
      const next = Math.max(0, Math.min(120, prev + delta))
      try {
        const log: Array<{ date: string; type: string; minutes: number }> = JSON.parse(localStorage.getItem('cardio_log') ?? '[]')
        const existing = log.find(e => e.date === todayStr)
        const filtered = log.filter(e => e.date !== todayStr)
        const updated = next > 0
          ? [...filtered, { date: todayStr, type: existing?.type ?? 'LISS', minutes: next }]
          : filtered
        localStorage.setItem('cardio_log', JSON.stringify(updated))
      } catch {}
      return next
    })
  }

  function cycleCardioTarget() {
    setCardioTarget(prev => {
      const next = prev === 30 ? 45 : prev === 45 ? 60 : 30
      localStorage.setItem('cardio_target_min', String(next))
      return next
    })
  }

  const todayStr = localDateStr()
  const jsDay = new Date().getDay()
  const monday = new Date()
  monday.setDate(monday.getDate() - (jsDay === 0 ? 6 : jsDay - 1))
  const mondayStr = localDateStr(monday)
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return { dateStr: localDateStr(d), label: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'][i] }
  })

  useEffect(() => {
    if (!user?.id) return
    loadDietPlan(user.id)
  }, [user?.id])

  // Reload completions for current week whenever the plan tab is re-activated.
  // The Weekly View loads its own week's completions into the shared store; without
  // this refresh, returning from a previous-week view would show stale (empty) data
  // in the Today's Intake and This Week's Diet sections.
  useEffect(() => {
    if (!user?.id || tab !== 'plan') return
    loadMealCompletions(user.id, mondayStr, todayStr)
  }, [user?.id, tab])

  // Load 30 days of completions for streak calculation (kept in local state to
  // avoid polluting the shared store's date range which the Weekly View depends on).
  useEffect(() => {
    if (!user?.id) return
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    window.api.getMealCompletions(user.id, localDateStr(thirtyDaysAgo), todayStr).then((data) => {
      setStreakCompletions(data ?? [])
    })
  }, [user?.id])

  // Sync prefs panel state from user when panel opens
  useEffect(() => {
    if (prefsOpen && user) {
      setPrefsCookTime((user.cooking_time_pref as 'quick' | 'medium' | 'chef') ?? 'medium')
      setPrefsPrepStyle((user.meal_prep_style as 'daily' | 'batch' | 'mixed') ?? 'daily')
      setPrefsSnackCount(user.snack_count ?? 0)
      setPrefsExclusions(user.food_exclusions ?? [])
      setPrefsPreferences(user.food_preferences ?? [])
      setPrefsRestrictions(user.dietary_restrictions ?? [])
    }
  }, [prefsOpen])

  if (!user) return null

  async function handleExcludeFood(foodLabel: string) {
    const foodId = foodLabel
      .replace(/\s*\(.*?\)/g, '')   // Remove (portions) FIRST before any other replacement
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .trim()
    const current = user!.food_exclusions ?? []
    if (current.includes(foodId)) return
    const updated = [...current, foodId]
    await updateUser({ id: user!.id, food_exclusions: updated })
    generateDietPlan(user!.id)
    setExcludePending(null)
  }

  async function togglePrefsRestriction(restriction: string) {
    if (!user) return
    const current = user.dietary_restrictions ?? []
    const updated = current.includes(restriction)
      ? current.filter((r: string) => r !== restriction)
      : [...current, restriction]
    setPrefsRestrictions(updated)
    await updateUser({ id: user.id, dietary_restrictions: updated } as any)
    generateDietPlan(user.id)
  }

  async function handleSavePrefs() {
    if (!user) return
    setPrefsSaving(true)
    try {
      await updateUser({
        id: user.id,
        cooking_time_pref: prefsCookTime,
        meal_prep_style: prefsPrepStyle,
        snack_count: prefsSnackCount,
        food_exclusions: prefsExclusions,
        food_preferences: prefsPreferences,
      })
      await generateDietPlan(user.id)
      setPrefsOpen(false)
    } finally {
      setPrefsSaving(false)
    }
  }

  function setRefeedDay(day: number | null) {
    if (day === null) {
      localStorage.removeItem('refeed_day')
    } else {
      localStorage.setItem('refeed_day', String(day))
    }
    setRefeedDayOfWeekState(day)
  }

  function togglePrefsExclusion(id: string) {
    if (prefsExclusions.includes(id)) {
      setPrefsExclusions(prefsExclusions.filter((x) => x !== id))
    } else {
      setPrefsExclusions([...prefsExclusions, id])
      setPrefsPreferences(prefsPreferences.filter((x) => x !== id))
    }
  }

  function togglePrefsPreference(id: string) {
    if (prefsExclusions.includes(id)) return
    if (prefsPreferences.includes(id)) {
      setPrefsPreferences(prefsPreferences.filter((x) => x !== id))
    } else {
      setPrefsPreferences([...prefsPreferences, id])
    }
  }

  async function handleAiRefine() {
    if (!user || !aiRefinePrompt.trim()) return
    setAiRefining(true)
    setAiRefineError(null)
    setAiRefineSuccess(null)
    setAiRefineInfo(null)
    const prompt = aiRefinePrompt.trim()
    try {
      const result = await window.api.applyAIRequest(user.id, prompt, 'diet')
      if (result.action === 'reject') {
        setAiRefineError(result.message)
      } else if ((result.action as string) === 'explain') {
        setAiRefinePrompt('')
        setAiRefineInfo(result.message)
      } else {
        setAiRefinePrompt('')
        setAiRefineSuccess(result.message)
        await loadDietPlan(user.id)
        const freshUser = await window.api.getUser()
        if (freshUser) {
          const { useUserStore: us } = await import('../../store/userStore')
          us.setState({ user: freshUser })
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setAiRefineError(msg.replace(/Error invoking remote method '[^']+': /, '').trim())
    } finally {
      setAiRefining(false)
    }
  }

  if (!dietPlan) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-100 mb-6">Nutrition Plan</h1>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          <p className="text-gray-400 mb-4">No nutrition plan generated yet.</p>
          <Button onClick={() => generateDietPlan(user.id)} disabled={loading}>
            {loading ? 'Generating...' : 'Generate Nutrition Plan'}
          </Button>
        </div>
      </div>
    )
  }

  const _macroKcal = dietPlan.protein_g * 4 + dietPlan.carbs_g * 4 + dietPlan.fat_g * 9
  const proteinPct = _macroKcal > 0 ? Math.round((dietPlan.protein_g * 4 / _macroKcal) * 100) : 0
  const carbsPct = _macroKcal > 0 ? Math.round((dietPlan.carbs_g * 4 / _macroKcal) * 100) : 0
  const fatPct = 100 - proteinPct - carbsPct

  // Today's intake progress
  const todayCompletions = mealCompletions.filter((c) => c.date === todayStr)
  const mealsEaten = todayCompletions.length
  const totalMeals = dietPlan.meals?.length ?? 0
  const consumedCalories = todayCompletions.reduce((acc, c) => acc + (dietPlan.meals?.[c.meal_index]?.calories ?? 0), 0)
  const consumedProtein = todayCompletions.reduce((acc, c) => acc + (dietPlan.meals?.[c.meal_index]?.protein_g ?? 0), 0)
  const consumedCarbs = todayCompletions.reduce((acc, c) => acc + (dietPlan.meals?.[c.meal_index]?.carbs_g ?? 0), 0)
  const consumedFat = todayCompletions.reduce((acc, c) => acc + (dietPlan.meals?.[c.meal_index]?.fat_g ?? 0), 0)
  const calPct = Math.min(100, dietPlan.calories_target > 0 ? Math.round((consumedCalories / dietPlan.calories_target) * 100) : 0)
  const protPct = Math.min(100, dietPlan.protein_g > 0 ? Math.round((consumedProtein / dietPlan.protein_g) * 100) : 0)
  const carbPct = Math.min(100, dietPlan.carbs_g > 0 ? Math.round((consumedCarbs / dietPlan.carbs_g) * 100) : 0)
  const fatIntakePct = Math.min(100, dietPlan.fat_g > 0 ? Math.round((consumedFat / dietPlan.fat_g) * 100) : 0)

  const REFEED_DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const isRefeedDay = refeedDayOfWeek !== null && jsDay === refeedDayOfWeek
  const refeedCarbBoostG = 100
  const refeedCalBoost = refeedCarbBoostG * 4

  function isMealEaten(mealIndex: number) {
    return todayCompletions.some((c) => c.meal_index === mealIndex)
  }

  function toggleMealEaten(mealIndex: number, mealName: string) {
    if (!user) return
    if (isMealEaten(mealIndex)) {
      unlogMealCompletion(user.id, todayStr, mealIndex)
    } else {
      logMealCompletion(user.id, todayStr, mealIndex, mealName)
    }
  }

  // First uneaten meal by scheduled time — used to mark "Next" / "Due" in the timeline and meal cards.
  const activeMealIndex: number | null = (() => {
    const meals = dietPlan.meals ?? []
    const uneaten = meals
      .map((m, i) => ({ i, mins: Number(m.time.split(':')[0]) * 60 + Number(m.time.split(':')[1]) }))
      .filter(({ i }) => !isMealEaten(i))
      .sort((a, b) => a.mins - b.mins)
    return uneaten.length > 0 ? uneaten[0].i : null
  })()

  // Consecutive days where every scheduled meal was logged.
  // Counts backwards from today; today counts only if all meals are done.
  const mealAdherenceStreak = (() => {
    if (!dietPlan?.meals?.length) return 0
    const required = dietPlan.meals.length
    let streak = 0
    const base = new Date()
    for (let i = 0; i <= 30; i++) {
      const d = new Date(base)
      d.setDate(base.getDate() - i)
      const ds = localDateStr(d)
      const logged = streakCompletions.filter((c) => c.date === ds).length
      if (logged >= required) {
        streak++
      } else {
        break
      }
    }
    return streak
  })()

  const filteredForExclude = FOODS.filter((f) =>
    f.name.toLowerCase().includes(prefsExcludeSearch.toLowerCase())
  )
  const filteredForPrefer = FOODS.filter(
    (f) =>
      !prefsExclusions.includes(f.id) &&
      f.name.toLowerCase().includes(prefsPreferSearch.toLowerCase())
  )

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Nutrition Plan</h1>
          <p className="text-gray-500 mt-0.5 text-sm">{dietPlan.name}</p>
          {/* Active restriction badges — visible immediately without opening prefs */}
          {((user.dietary_restrictions?.length ?? 0) > 0 || (user.food_exclusions?.length ?? 0) > 0) && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {(user.dietary_restrictions ?? []).map((r: string) => (
                <span key={r} className="text-xs bg-red-900/20 text-red-400 border border-red-800/40 rounded-full px-2 py-0.5">
                  {r}
                </span>
              ))}
              {(user.food_exclusions?.length ?? 0) > 0 && (
                <span className="text-xs bg-gray-800 text-gray-400 border border-gray-700 rounded-full px-2 py-0.5">
                  +{user.food_exclusions!.length} food{user.food_exclusions!.length !== 1 ? 's' : ''} excluded
                </span>
              )}
            </div>
          )}
        </div>
        <Badge variant={dietPlan.phase === 'deficit' ? 'warning' : dietPlan.phase === 'surplus' ? 'success' : 'default'}>
          {dietPlan.phase}
        </Badge>
      </div>

      {/* Tabs + Regenerate */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
          {(['plan', 'weekly', 'grocery'] as DietTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${
                tab === t ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {t === 'plan' ? 'Meal Plan' : t === 'weekly' ? 'Weekly View' : 'Grocery List'}
            </button>
          ))}
        </div>
        {tab === 'plan' && (
          <>
            <button
              onClick={async () => {
                setRecalcLoading(true)
                try {
                  await recalculateMacros(user.id)
                  setRecalcDone(true)
                  setTimeout(() => setRecalcDone(false), 2500)
                } finally {
                  setRecalcLoading(false)
                }
              }}
              disabled={recalcLoading || regenLoading}
              title="Recalculate macro targets from current body weight — keeps your meal structure"
              className="text-xs text-gray-500 hover:text-green-400 border border-gray-700 hover:border-green-700 rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-40"
            >
              {recalcDone ? '✓ Updated' : recalcLoading ? '⟳ Updating...' : '⟳ Recalculate Macros'}
            </button>
            <button
              onClick={async () => {
                if (!window.confirm('Regenerate your meal plan? This replaces all current meals and any swaps you have made.')) return
                setRegenLoading(true)
                try {
                  await generateDietPlan(user.id)
                  setRegenDone(true)
                  setTimeout(() => setRegenDone(false), 2500)
                } finally {
                  setRegenLoading(false)
                }
              }}
              disabled={recalcLoading || regenLoading}
              title="Regenerate meal plan with current settings"
              className="text-xs text-amber-500 font-medium bg-amber-900/20 hover:bg-amber-900/40 border border-amber-800/60 hover:border-amber-700 rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-40"
            >
              {regenDone ? '✓ Done' : regenLoading ? 'Regenerating...' : '⚠ Regenerate Meals'}
            </button>
          </>
        )}
      </div>
      {tab === 'plan' && (
        <p className="text-xs text-gray-400 -mt-3">⟳ updates targets from latest weigh-in &nbsp;·&nbsp; <span className="text-amber-500 font-medium">⚠ rebuilds plan, erases swaps</span></p>
      )}

      {/* ─── MEAL PLAN TAB ─── */}
      {tab === 'plan' && (
        <>
          {/* Macro summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Calories" value={dietPlan.calories_target} unit="kcal" color="brand" />
            <StatCard label="Protein" value={dietPlan.protein_g} unit={`g (${proteinPct}%)`} color="green" />
            <StatCard label="Carbs" value={dietPlan.carbs_g} unit={`g (${carbsPct}%)`} color="blue" />
            <StatCard label="Fat" value={dietPlan.fat_g} unit={`g (${fatPct}%)`} />
          </div>

          {/* Today's intake progress */}
          {totalMeals > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-200">Today's Intake</p>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${mealsEaten === totalMeals ? 'bg-green-900/30 text-green-400' : 'bg-gray-800 text-gray-400'}`}>
                  {mealsEaten}/{totalMeals} meals
                </span>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-gray-500">Calories</span>
                  <span className={calPct >= 100 ? 'text-green-400' : 'text-brand-400'}>
                    {consumedCalories} / {dietPlan.calories_target} kcal
                  </span>
                </div>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${calPct >= 100 ? 'bg-green-500' : 'bg-brand-500'}`}
                    style={{ width: `${calPct}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-gray-500">Protein</span>
                  <span className={protPct >= 100 ? 'text-green-400' : 'text-green-300'}>
                    {consumedProtein}g / {dietPlan.protein_g}g
                  </span>
                </div>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${protPct >= 100 ? 'bg-green-500' : 'bg-green-600'}`}
                    style={{ width: `${protPct}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-gray-500">Carbs</span>
                  <span className={carbPct >= 100 ? 'text-green-400' : 'text-blue-400'}>
                    {consumedCarbs}g / {dietPlan.carbs_g}g
                  </span>
                </div>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${carbPct >= 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                    style={{ width: `${carbPct}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-gray-500">Fat</span>
                  <span className={fatIntakePct >= 100 ? 'text-green-400' : 'text-yellow-400'}>
                    {consumedFat}g / {dietPlan.fat_g}g
                  </span>
                </div>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${fatIntakePct >= 100 ? 'bg-green-500' : 'bg-yellow-500'}`}
                    style={{ width: `${fatIntakePct}%` }}
                  />
                </div>
              </div>
              {mealsEaten === totalMeals && (
                <p className="text-xs text-green-400 font-medium">All meals hit today — great work!</p>
              )}
              {mealsEaten < totalMeals && (consumedCalories < dietPlan.calories_target || consumedProtein < dietPlan.protein_g) && (
                <div className="bg-brand-900/20 border border-brand-800/30 rounded-lg px-3 py-2 flex items-center justify-between">
                  <span className="text-xs text-gray-400 font-medium">Still to eat:</span>
                  <span className="text-xs font-semibold">
                    <span className="text-brand-300">{dietPlan.calories_target - consumedCalories} kcal</span>
                    <span className="text-gray-600 mx-1">·</span>
                    <span className="text-green-300">{Math.max(0, dietPlan.protein_g - consumedProtein)}g P</span>
                    <span className="text-gray-600 mx-1">·</span>
                    <span className="text-blue-400">{Math.max(0, dietPlan.carbs_g - consumedCarbs)}g C</span>
                    <span className="text-gray-600 mx-1">·</span>
                    <span className="text-yellow-400">{Math.max(0, dietPlan.fat_g - consumedFat)}g F</span>
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Water Intake Tracker */}
          {totalMeals > 0 && (() => {
            const waterPct = Math.min(100, Math.round((waterGlasses / waterTarget) * 100))
            const waterMl = waterGlasses * 250
            const done = waterGlasses >= waterTarget
            return (
              <div className={`bg-gray-900 border rounded-xl p-4 ${done ? 'border-cyan-800/50' : 'border-gray-800'}`}>
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-semibold ${done ? 'text-cyan-300' : 'text-gray-200'}`}>Water Intake</span>
                    {done && <span className="text-xs bg-cyan-900/30 text-cyan-400 border border-cyan-800/50 rounded-full px-2 py-0.5">target hit</span>}
                  </div>
                  <button
                    onClick={cycleWaterTarget}
                    title="Cycle water target (8 / 10 / 12 glasses)"
                    className="text-xs text-gray-600 hover:text-cyan-400 transition-colors tabular-nums"
                  >
                    target: {waterTarget} glasses
                  </button>
                </div>
                {/* Glass dots */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {Array.from({ length: waterTarget }, (_, i) => (
                    <button
                      key={i}
                      onClick={() => updateWater(i < waterGlasses ? -(waterGlasses - i) : i + 1 - waterGlasses)}
                      title={`Set to ${i + 1} glass${i !== 0 ? 'es' : ''}`}
                      className={`w-7 h-7 rounded-md border text-sm transition-colors ${
                        i < waterGlasses
                          ? 'bg-cyan-700/40 border-cyan-600 text-cyan-300'
                          : 'bg-gray-800 border-gray-700 text-gray-700 hover:border-cyan-700 hover:text-cyan-500'
                      }`}
                    >
                      {i < waterGlasses ? '▪' : '·'}
                    </button>
                  ))}
                </div>
                {/* Progress bar */}
                <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden mb-2">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${done ? 'bg-cyan-400' : 'bg-cyan-600'}`}
                    style={{ width: `${waterPct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">
                    <span className={done ? 'text-cyan-400 font-semibold' : 'text-cyan-300 font-semibold'}>{waterGlasses}</span>
                    <span className="text-gray-600"> / {waterTarget} glasses</span>
                    <span className="text-gray-700"> · {waterMl}ml</span>
                  </span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => updateWater(-1)}
                      disabled={waterGlasses === 0}
                      className="w-7 h-7 rounded-lg border border-gray-700 text-gray-400 hover:border-red-800 hover:text-red-400 transition-colors disabled:opacity-30 text-sm"
                    >−</button>
                    <button
                      onClick={() => updateWater(1)}
                      disabled={waterGlasses >= 20}
                      className="w-7 h-7 rounded-lg border border-gray-700 text-gray-400 hover:border-cyan-700 hover:text-cyan-400 transition-colors disabled:opacity-30 text-sm font-bold"
                    >+</button>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Cardio Tracker */}
          {totalMeals > 0 && (() => {
            const cardioPct = Math.min(100, cardioTarget > 0 ? Math.round((cardioMin / cardioTarget) * 100) : 0)
            const cardioDone = cardioMin >= cardioTarget
            const weeklyCardio = (() => {
              try {
                const log: Array<{ date: string; minutes: number }> = JSON.parse(localStorage.getItem('cardio_log') ?? '[]')
                return weekDays
                  .filter(({ dateStr }) => dateStr <= todayStr)
                  .reduce((sum, { dateStr }) => sum + (log.find(e => e.date === dateStr)?.minutes ?? 0), 0)
              } catch { return 0 }
            })()
            return (
              <div className={`bg-gray-900 border rounded-xl p-4 ${cardioDone ? 'border-purple-800/50' : 'border-gray-800'}`}>
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-semibold ${cardioDone ? 'text-purple-300' : 'text-gray-200'}`}>Cardio</span>
                    {cardioDone && <span className="text-xs bg-purple-900/30 text-purple-400 border border-purple-800/50 rounded-full px-2 py-0.5">target hit</span>}
                  </div>
                  <button
                    onClick={cycleCardioTarget}
                    title="Cycle cardio target (30 / 45 / 60 min)"
                    className="text-xs text-gray-600 hover:text-purple-400 transition-colors tabular-nums"
                  >
                    target: {cardioTarget} min
                  </button>
                </div>
                <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden mb-3">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${cardioDone ? 'bg-purple-400' : 'bg-purple-600'}`}
                    style={{ width: `${cardioPct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">
                    <span className={cardioDone ? 'text-purple-400 font-semibold' : 'text-purple-300 font-semibold'}>{cardioMin}</span>
                    <span className="text-gray-600"> / {cardioTarget} min</span>
                    {weeklyCardio > 0 && <span className="text-gray-700"> · {weeklyCardio} min this week</span>}
                  </span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => updateCardio(-CARDIO_STEP)}
                      disabled={cardioMin === 0}
                      className="w-7 h-7 rounded-lg border border-gray-700 text-gray-400 hover:border-red-800 hover:text-red-400 transition-colors disabled:opacity-30 text-sm"
                    >−</button>
                    <button
                      onClick={() => updateCardio(CARDIO_STEP)}
                      disabled={cardioMin >= 120}
                      className="w-7 h-7 rounded-lg border border-gray-700 text-gray-400 hover:border-purple-700 hover:text-purple-400 transition-colors disabled:opacity-30 text-sm font-bold"
                    >+</button>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Refeed Day Planner */}
          {(() => {
            const dayPickerRow = (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {REFEED_DAY_NAMES.map((name, d) => (
                  <button
                    key={d}
                    onClick={() => setRefeedDay(d === refeedDayOfWeek ? null : d)}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-colors font-medium ${
                      d === refeedDayOfWeek
                        ? 'bg-amber-700/40 border-amber-600 text-amber-300'
                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-amber-700 hover:text-amber-400'
                    }`}
                  >{name}</button>
                ))}
              </div>
            )

            if (isRefeedDay) {
              return (
                <div className="bg-amber-900/20 border border-amber-700/50 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-amber-400 font-bold text-sm">Refeed Day</span>
                      <span className="text-xs bg-amber-800/40 text-amber-300 border border-amber-700/50 rounded-full px-2 py-0.5">
                        {REFEED_DAY_NAMES[jsDay]}
                      </span>
                    </div>
                    <button
                      onClick={() => setRefeedPanelOpen(v => !v)}
                      className="text-xs text-amber-600 hover:text-amber-400 transition-colors"
                    >
                      {refeedPanelOpen ? '▲ done' : '▼ change day'}
                    </button>
                  </div>
                  <p className="text-xs text-amber-300/80 mb-3 leading-relaxed">
                    Add ~{refeedCarbBoostG}g carbs above your normal plan (rice, oats, fruit, potato). Protein and fat stay the same. Refeeds restore glycogen and briefly boost leptin — stay in control and hit the adjusted targets below.
                  </p>
                  <div className="flex items-start gap-6 text-xs">
                    <div>
                      <p className="text-gray-500 mb-0.5">Calories today</p>
                      <p className="text-amber-400 font-bold text-base">{dietPlan.calories_target + refeedCalBoost} kcal</p>
                      <p className="text-gray-600">+{refeedCalBoost} vs plan</p>
                    </div>
                    <div>
                      <p className="text-gray-500 mb-0.5">Carbs today</p>
                      <p className="text-amber-400 font-bold text-base">{dietPlan.carbs_g + refeedCarbBoostG}g</p>
                      <p className="text-gray-600">+{refeedCarbBoostG}g vs plan</p>
                    </div>
                    <div>
                      <p className="text-gray-500 mb-0.5">Protein</p>
                      <p className="text-green-400 font-bold text-base">{dietPlan.protein_g}g</p>
                      <p className="text-gray-600">unchanged</p>
                    </div>
                  </div>
                  {refeedPanelOpen && (
                    <div className="mt-3 pt-3 border-t border-amber-800/40">
                      <p className="text-xs text-gray-500 mb-1">Weekly refeed day:</p>
                      {dayPickerRow}
                    </div>
                  )}
                </div>
              )
            }

            return (
              <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 flex items-center justify-between">
                <div>
                  <span className="text-xs font-medium text-gray-400">Refeed Day</span>
                  {refeedDayOfWeek !== null ? (
                    <span className="ml-2 text-xs text-amber-500 font-semibold">{REFEED_DAY_NAMES[refeedDayOfWeek]}</span>
                  ) : (
                    <span className="ml-2 text-xs text-gray-600">not set</span>
                  )}
                </div>
                <button
                  onClick={() => setRefeedPanelOpen(v => !v)}
                  className="text-xs text-gray-500 hover:text-amber-400 transition-colors"
                >
                  {refeedPanelOpen ? '▲' : refeedDayOfWeek !== null ? '▼ edit' : '▼ set'}
                </button>
                {refeedPanelOpen && (
                  <div className="absolute left-0 right-0 mt-2" />
                )}
              </div>
            )
          })()}
          {refeedPanelOpen && !isRefeedDay && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 -mt-4">
              <p className="text-xs text-gray-500 mb-1">Pick your weekly refeed day — targets will automatically adjust on that day:</p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {REFEED_DAY_NAMES.map((name, d) => (
                  <button
                    key={d}
                    onClick={() => { setRefeedDay(d === refeedDayOfWeek ? null : d); setRefeedPanelOpen(false) }}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-colors font-medium ${
                      d === refeedDayOfWeek
                        ? 'bg-amber-700/40 border-amber-600 text-amber-300'
                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-amber-700 hover:text-amber-400'
                    }`}
                  >{name}</button>
                ))}
                {refeedDayOfWeek !== null && (
                  <button
                    onClick={() => { setRefeedDay(null); setRefeedPanelOpen(false) }}
                    className="text-xs px-2 py-1.5 rounded-lg border border-gray-700 text-gray-600 hover:border-red-800 hover:text-red-400 transition-colors"
                  >Remove</button>
                )}
              </div>
            </div>
          )}

          {/* Meal adherence streak */}
          {totalMeals > 0 && (
            <div className={`bg-gray-900 border rounded-xl p-4 flex items-center gap-4 ${mealAdherenceStreak > 0 ? 'border-brand-800/50' : 'border-gray-800'}`}>
              <div className={`text-4xl font-black min-w-[3.5rem] text-center tabular-nums ${mealAdherenceStreak > 0 ? 'text-brand-400' : 'text-gray-600'}`}>
                {mealAdherenceStreak}
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-200">
                  {mealAdherenceStreak === 1
                    ? '1-day on-plan streak'
                    : mealAdherenceStreak > 1
                      ? `${mealAdherenceStreak}-day on-plan streak`
                      : 'Start your streak today'}
                </p>
                <p className="text-xs text-gray-500">
                  {mealAdherenceStreak > 0
                    ? `${mealAdherenceStreak} consecutive day${mealAdherenceStreak !== 1 ? 's' : ''} with every meal logged`
                    : 'Log all meals to start a new streak'}
                </p>
              </div>
              {mealAdherenceStreak >= 7 && (
                <div className="text-right">
                  <p className="text-sm font-bold text-amber-400">{Math.floor(mealAdherenceStreak / 7)}wk+</p>
                  <p className="text-xs text-gray-600">streak</p>
                </div>
              )}
            </div>
          )}

          {/* This Week — day-by-day meal completion + weekly totals */}
          {(() => {
            const totalMealsPerDay = dietPlan.meals?.length ?? 0
            if (totalMealsPerDay === 0) return null
            const pastOrToday = weekDays.filter(({ dateStr }) => dateStr <= todayStr)
            // Per-day completion counts
            const dayData = weekDays.map(({ dateStr, label }) => {
              const logged = mealCompletions.filter((c) => c.date === dateStr).length
              const isPast = dateStr < todayStr
              const isToday = dateStr === todayStr
              const isFuture = dateStr > todayStr
              const allDone = logged >= totalMealsPerDay
              return { dateStr, label, logged, isPast, isToday, isFuture, allDone }
            })
            const daysFullyLogged = dayData.filter((d) => !d.isFuture && d.allDone).length
            const activeDays = pastOrToday.length
            // Weekly totals: sum all completions this week
            const weeklyCalories = mealCompletions
              .filter((c) => c.date >= mondayStr && c.date <= todayStr)
              .reduce((sum, c) => sum + (dietPlan.meals?.[c.meal_index]?.calories ?? 0), 0)
            const weeklyProtein = mealCompletions
              .filter((c) => c.date >= mondayStr && c.date <= todayStr)
              .reduce((sum, c) => sum + (dietPlan.meals?.[c.meal_index]?.protein_g ?? 0), 0)
            const weeklyCalTarget = dietPlan.calories_target * activeDays
            const weeklyProTarget = dietPlan.protein_g * activeDays
            const dayMacros = weekDays.map(({ dateStr }) => {
              if (dateStr > todayStr) return { cals: null as number | null, pro: null as number | null }
              const dayCompletions = mealCompletions.filter((c) => c.date === dateStr)
              const cals = dayCompletions.reduce((s, c) => s + (dietPlan.meals?.[c.meal_index]?.calories ?? 0), 0)
              const pro = dayCompletions.reduce((s, c) => s + (dietPlan.meals?.[c.meal_index]?.protein_g ?? 0), 0)
              return { cals, pro }
            })

            return (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-gray-200">This Week</p>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    activeDays > 0 && daysFullyLogged === activeDays
                      ? 'bg-green-900/30 text-green-400'
                      : 'bg-gray-800 text-gray-500'
                  }`}>
                    {daysFullyLogged}/{activeDays} days on plan
                  </span>
                </div>
                {/* Day dots */}
                <div className="flex gap-1 mb-3">
                  {dayData.map(({ label, logged, isFuture, allDone, isToday }) => (
                    <div key={label} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-xs text-gray-600">{label}</span>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border ${
                        isFuture
                          ? 'border-gray-800 bg-gray-900 text-gray-700'
                          : allDone
                            ? 'border-green-600 bg-green-900/40 text-green-400'
                            : logged > 0
                              ? 'border-brand-600 bg-brand-900/40 text-brand-400'
                              : 'border-gray-700 bg-gray-800 text-gray-600'
                      } ${isToday ? 'ring-1 ring-brand-500/50' : ''}`}>
                        {isFuture ? '' : allDone ? '✓' : logged > 0 ? logged : '—'}
                      </div>
                    </div>
                  ))}
                </div>
                {/* Per-day macro compliance — kcal and protein under each day dot */}
                {activeDays > 0 && (
                  <div className="flex gap-1 mb-2">
                    {weekDays.map(({ label }, i) => {
                      const { cals, pro } = dayMacros[i]
                      const hasData = cals !== null && cals > 0
                      const calHit = hasData && cals! >= dietPlan.calories_target * 0.9
                      const proHit = hasData && pro! >= dietPlan.protein_g * 0.9
                      return (
                        <div key={label} className="flex-1 flex flex-col items-center gap-0.5">
                          {hasData ? (
                            <>
                              <span className={`text-[9px] font-medium leading-none tabular-nums ${calHit ? 'text-green-400' : 'text-brand-400'}`}>
                                {Math.round(cals! / 10) * 10}
                              </span>
                              <span className={`text-[9px] leading-none tabular-nums ${proHit ? 'text-green-400' : 'text-gray-500'}`}>
                                {Math.round(pro!)}P
                              </span>
                            </>
                          ) : (
                            <span className="text-[9px] text-gray-800">—</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
                {/* Weekly totals */}
                {activeDays > 0 && (
                  <div className="grid grid-cols-2 gap-2 border-t border-gray-800 pt-2">
                    <div>
                      <p className="text-xs text-gray-600">Calories this week</p>
                      <p className="text-sm font-semibold text-brand-400">
                        {weeklyCalories.toLocaleString()} <span className="text-xs text-gray-600">/ {weeklyCalTarget.toLocaleString()} kcal</span>
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">Protein this week</p>
                      <p className="text-sm font-semibold text-green-400">
                        {weeklyProtein}g <span className="text-xs text-gray-600">/ {weeklyProTarget}g</span>
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* ── Meal Schedule Timeline ── */}
          {totalMeals > 0 && dietPlan.meals && (() => {
            const START_MIN = 5 * 60   // 5 am
            const TOTAL_MINS = 17 * 60 // 5 am – 10 pm
            const now = new Date()
            const nowMinutes = now.getHours() * 60 + now.getMinutes()
            const nowPct = Math.max(0, Math.min(100, ((nowMinutes - START_MIN) / TOTAL_MINS) * 100))

            const missedMeals = (dietPlan.meals ?? []).filter((meal, i) => {
              if (isMealEaten(i) || i === activeMealIndex) return false
              const [h, m] = meal.time.split(':').map(Number)
              return (h * 60 + m) < nowMinutes
            })

            const tickHours = [6, 9, 12, 15, 18, 21]
            const tickLabels: Record<number, string> = { 6: '6am', 9: '9am', 12: '12pm', 15: '3pm', 18: '6pm', 21: '9pm' }

            return (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-gray-200">Meal Schedule</p>
                  {mealsEaten === totalMeals ? (
                    <span className="text-xs text-green-400 font-medium">All meals done today</span>
                  ) : activeMealIndex !== null ? (
                    <span className="text-xs text-brand-400">
                      Next: <span className="font-semibold">{dietPlan.meals[activeMealIndex].name}</span> at {dietPlan.meals[activeMealIndex].time}
                    </span>
                  ) : null}
                </div>

                {/* Timeline bar */}
                <div className="relative h-6 mb-1">
                  <div className="absolute inset-0 bg-gray-800 rounded-full" />
                  {tickHours.map((hour) => {
                    const pct = ((hour * 60 - START_MIN) / TOTAL_MINS) * 100
                    return (
                      <div key={hour} className="absolute top-0 bottom-0 w-px bg-gray-700/60" style={{ left: `${pct}%` }} />
                    )
                  })}
                  {nowPct > 0 && nowPct < 100 && (
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-white/30 rounded-full z-10"
                      style={{ left: `${nowPct}%` }}
                    />
                  )}
                  {dietPlan.meals.map((meal, i) => {
                    const [h, m] = meal.time.split(':').map(Number)
                    const mealMin = h * 60 + m
                    const pct = Math.max(2, Math.min(98, ((mealMin - START_MIN) / TOTAL_MINS) * 100))
                    const eaten = isMealEaten(i)
                    const isActive = i === activeMealIndex && !eaten
                    const isMissed = !eaten && !isActive && mealMin < nowMinutes
                    return (
                      <div
                        key={i}
                        title={`${meal.name} — ${meal.time}`}
                        className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-20 flex items-center justify-center rounded-full border-2 text-[9px] font-bold cursor-default ${
                          eaten
                            ? 'w-5 h-5 bg-green-700 border-green-400 text-green-200'
                            : isActive
                              ? 'w-6 h-6 bg-brand-600 border-brand-300 text-white ring-2 ring-brand-400/40'
                              : isMissed
                                ? 'w-5 h-5 bg-amber-900/60 border-amber-600 text-amber-300'
                                : 'w-5 h-5 bg-gray-700 border-gray-500 text-gray-400'
                        }`}
                        style={{ left: `${pct}%` }}
                      >
                        {i + 1}
                      </div>
                    )
                  })}
                </div>

                {/* Hour labels */}
                <div className="relative h-4">
                  {tickHours.map((hour) => {
                    const pct = ((hour * 60 - START_MIN) / TOTAL_MINS) * 100
                    return (
                      <span
                        key={hour}
                        className="absolute text-[10px] text-gray-600 -translate-x-1/2"
                        style={{ left: `${pct}%` }}
                      >
                        {tickLabels[hour]}
                      </span>
                    )
                  })}
                </div>

                {/* Legend */}
                <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-500">
                  <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-green-700 border border-green-400" />eaten</span>
                  <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-brand-600 border border-brand-300" />next</span>
                  <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-amber-900/60 border border-amber-600" />missed</span>
                  <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-gray-700 border border-gray-500" />upcoming</span>
                  <span className="flex items-center gap-1 ml-auto"><span className="inline-block w-0.5 h-3 bg-white/30 rounded" />now</span>
                </div>

                {/* Missed meal alert */}
                {missedMeals.length > 0 && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-400 bg-amber-900/20 border border-amber-800/40 rounded-lg px-3 py-1.5">
                    <span>⚠</span>
                    <span>
                      {missedMeals.length === 1
                        ? `${missedMeals[0].name} (${missedMeals[0].time}) was missed — eat it when you can.`
                        : `${missedMeals.length} meals past their scheduled time — eat them when you can.`
                      }
                    </span>
                  </div>
                )}
              </div>
            )
          })()}

          {/* Meals */}
          <div>
            {(() => {
              const snackCount = (dietPlan.meals ?? []).filter(m => m.name.toLowerCase().includes('snack')).length
              const mainCount = (dietPlan.meals?.length ?? 0) - snackCount
              return (
                <h2 className="text-lg font-semibold text-gray-100 mb-3">
                  Daily Meals ({mainCount} meal{mainCount !== 1 ? 's' : ''}
                  {snackCount > 0 ? ` + ${snackCount} snack${snackCount !== 1 ? 's' : ''}` : ''})
                </h2>
              )
            })()}
            <div className="space-y-1">
              {dietPlan.meals?.map((meal, i) => {
                const snack = meal.name.toLowerCase().includes('snack')
                return (
                  <div key={i}>
                    {/* Drop zone before each card */}
                    {dragIndex !== null && dragIndex !== i && (
                      <div
                        className={`transition-all rounded-full mx-2 mb-1 ${dragOverIndex === i ? 'h-3 bg-orange-500/50' : 'h-1 bg-transparent'}`}
                        onDragOver={(e) => { e.preventDefault(); setDragOverIndex(i) }}
                        onDragLeave={() => setDragOverIndex(null)}
                        onDrop={async (e) => {
                          e.preventDefault()
                          if (dragIndex === null || !user || !dietPlan) return
                          const meals = [...dietPlan.meals]
                          const [moved] = meals.splice(dragIndex, 1)
                          const insertAt = dragOverIndex !== null && dragOverIndex > dragIndex ? i - 1 : i
                          meals.splice(Math.max(0, insertAt), 0, moved)
                          setDragIndex(null); setDragOverIndex(null)
                          await window.api.reorderMeals(user.id, meals)
                          await loadDietPlan(user.id)
                        }}
                      />
                    )}
                    <div
                      className={`rounded-xl p-4 mb-2 ${
                        isMealEaten(i)
                          ? 'bg-gray-900/50 border border-gray-800/50'
                          : i === activeMealIndex
                            ? 'bg-brand-950/30 border border-brand-600/60'
                            : snack
                              ? 'bg-orange-900/10 border border-orange-800/40'
                              : 'bg-gray-900 border border-gray-800'
                      } ${dragIndex === i ? 'opacity-30' : ''}`}
                      draggable={snack ? true : undefined}
                      onDragStart={snack ? (e) => { setDragIndex(i); e.dataTransfer.effectAllowed = 'move' } : undefined}
                      onDragEnd={snack ? () => { setDragIndex(null); setDragOverIndex(null) } : undefined}
                    >
                      {/* Content fades when eaten; buttons stay fully visible so undo is discoverable */}
                      <div className={`transition-opacity ${isMealEaten(i) ? 'opacity-40' : ''}`}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {snack && (
                              <span className="text-gray-600 cursor-grab select-none text-base leading-none">⠿</span>
                            )}
                            <span className={`text-xs font-mono ${i === activeMealIndex && !isMealEaten(i) ? 'text-brand-400 font-semibold' : 'text-gray-600'}`}>{meal.time}</span>
                            <h3 className="text-sm font-semibold text-gray-200">{meal.name}</h3>
                            {i === activeMealIndex && !isMealEaten(i) && (() => {
                              const [mh, mm] = meal.time.split(':').map(Number)
                              const isPast = (mh * 60 + mm) <= (new Date().getHours() * 60 + new Date().getMinutes())
                              return (
                                <span className={`text-xs rounded-full px-2 py-0.5 leading-none font-semibold ${
                                  isPast
                                    ? 'bg-amber-900/20 text-amber-400 border border-amber-700/50'
                                    : 'bg-brand-600/20 text-brand-400 border border-brand-600/50'
                                }`}>
                                  {isPast ? 'Due' : 'Next'}
                                </span>
                              )
                            })()}
                            {snack && (
                              <span className="text-xs bg-orange-900/30 text-orange-400 border border-orange-800/40 rounded-full px-2 py-0.5 leading-none">Snack</span>
                            )}
                          </div>
                          <div className="flex gap-3 text-xs text-gray-500">
                            <span className="text-brand-400 font-medium">{meal.calories} kcal</span>
                            <span className="text-green-400">P {meal.protein_g}g</span>
                            <span className="text-blue-400">C {meal.carbs_g}g</span>
                            <span className="text-yellow-400">F {meal.fat_g}g</span>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {meal.foods.map((food, fi) => (
                            <span key={fi} className="flex items-center gap-1 text-xs bg-gray-800 text-gray-400 px-2 py-1 rounded-md">
                              {food}
                              <button
                                onClick={() => setExcludePending(food)}
                                className="opacity-40 hover:opacity-100 text-gray-500 hover:text-red-400 transition-opacity ml-0.5 flex-shrink-0"
                                title="Exclude this food from future plans"
                              >
                                &#10005;
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-800/60">
                        <button
                          onClick={() => { setSwapError(null); setSwapTarget({ mealIndex: i, meal }) }}
                          className="text-xs text-gray-400 hover:text-brand-300 border border-gray-700 hover:border-brand-700 rounded-lg px-2.5 py-1 transition-colors flex items-center gap-1"
                        >
                          &#8635; {snack ? 'Swap Snack' : 'Swap Meal'}
                        </button>
                        <button
                          onClick={() => toggleMealEaten(i, meal.name)}
                          title={isMealEaten(i) ? 'Click to mark as not eaten' : undefined}
                          className={`text-sm font-medium rounded-lg px-3 py-1.5 transition-colors flex items-center gap-1 ${
                            isMealEaten(i)
                              ? 'bg-green-900/30 border border-green-800/50 text-green-400 hover:bg-red-900/20 hover:border-red-800/50 hover:text-red-400'
                              : 'bg-brand-900/20 border border-brand-700 text-brand-400 hover:bg-brand-900/40'
                          }`}
                        >
                          {isMealEaten(i) ? '✓ Eaten' : 'Mark Eaten'}
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
              {/* Trailing drop zone */}
              {dragIndex !== null && (
                <div
                  className={`transition-all rounded-full mx-2 ${dragOverIndex === (dietPlan.meals?.length ?? 0) ? 'h-3 bg-orange-500/50' : 'h-1 bg-transparent'}`}
                  onDragOver={(e) => { e.preventDefault(); setDragOverIndex(dietPlan.meals?.length ?? 0) }}
                  onDragLeave={() => setDragOverIndex(null)}
                  onDrop={async (e) => {
                    e.preventDefault()
                    if (dragIndex === null || !user || !dietPlan) return
                    const meals = [...dietPlan.meals]
                    const [moved] = meals.splice(dragIndex, 1)
                    meals.push(moved)
                    setDragIndex(null); setDragOverIndex(null)
                    await window.api.reorderMeals(user.id, meals)
                    await loadDietPlan(user.id)
                  }}
                />
              )}
            </div>
            {(user.snack_count ?? 0) > 0 && (
              <p className="text-xs text-gray-600 mt-2">Drag snack cards (⠿) to reorder them between meals.</p>
            )}
          </div>

          {/* Disclaimer */}
          <div className="bg-amber-900/10 border border-amber-800/30 rounded-lg p-3 text-xs text-amber-600">
            <strong className="text-amber-500">Note:</strong> Food items are examples. Weigh portions for accuracy. Click &#10005; on any food to exclude it from future plans.
          </div>

          {/* Weekly meal compliance strip */}
          {totalMeals > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">This Week's Diet</p>
                {(() => {
                  const pastDays = weekDays.filter(d => d.dateStr <= todayStr)
                  const fullDays = pastDays.filter(d =>
                    mealCompletions.filter(c => c.date === d.dateStr).length >= totalMeals
                  ).length
                  return (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      fullDays === pastDays.length && pastDays.length > 0 ? 'bg-green-900/30 text-green-400' :
                      fullDays > 0 ? 'bg-yellow-900/20 text-yellow-400' :
                      'bg-gray-800 text-gray-500'
                    }`}>
                      {fullDays}/{pastDays.length} days on track
                    </span>
                  )
                })()}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {weekDays.map(({ dateStr, label }) => {
                  const completed = mealCompletions.filter(c => c.date === dateStr).length
                  const isFuture = dateStr > todayStr
                  const isToday = dateStr === todayStr
                  const isFull = !isFuture && completed >= totalMeals
                  const isPartial = !isFuture && completed > 0 && completed < totalMeals
                  return (
                    <div
                      key={dateStr}
                      className={`flex flex-col items-center py-1.5 rounded-lg text-center ${
                        isFuture ? 'opacity-25' :
                        isFull ? 'bg-green-900/30' :
                        isPartial ? 'bg-yellow-900/20' :
                        'bg-gray-800/60'
                      } ${isToday ? 'ring-1 ring-brand-500' : ''}`}
                    >
                      <span className="text-xs text-gray-500">{label}</span>
                      <span className={`text-xs font-bold mt-0.5 leading-none ${
                        isFuture ? 'text-gray-700' :
                        isFull ? 'text-green-400' :
                        isPartial ? 'text-yellow-400' :
                        'text-gray-600'
                      }`}>
                        {isFuture ? '—' : `${completed}/${totalMeals}`}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Weekly macro totals — calories, protein, carbs, and fat hit across all logged days this week */}
          {totalMeals > 0 && (() => {
            const pastDays = weekDays.filter(d => d.dateStr <= todayStr)
            const daysWithMeals = pastDays.filter(({ dateStr }) => mealCompletions.some(c => c.date === dateStr)).length
            const weekCals = pastDays.reduce((acc, { dateStr }) =>
              acc + (dietPlan.meals ?? []).reduce((sum, m, idx) =>
                sum + (mealCompletions.some(c => c.date === dateStr && c.meal_index === idx) ? m.calories : 0), 0
              ), 0
            )
            const weekProtein = pastDays.reduce((acc, { dateStr }) =>
              acc + (dietPlan.meals ?? []).reduce((sum, m, idx) =>
                sum + (mealCompletions.some(c => c.date === dateStr && c.meal_index === idx) ? m.protein_g : 0), 0
              ), 0
            )
            const weekCarbs = pastDays.reduce((acc, { dateStr }) =>
              acc + (dietPlan.meals ?? []).reduce((sum, m, idx) =>
                sum + (mealCompletions.some(c => c.date === dateStr && c.meal_index === idx) ? m.carbs_g : 0), 0
              ), 0
            )
            const weekFat = pastDays.reduce((acc, { dateStr }) =>
              acc + (dietPlan.meals ?? []).reduce((sum, m, idx) =>
                sum + (mealCompletions.some(c => c.date === dateStr && c.meal_index === idx) ? m.fat_g : 0), 0
              ), 0
            )
            const targetWeekCals = dietPlan.calories_target * pastDays.length
            const targetWeekProtein = dietPlan.protein_g * pastDays.length
            const targetWeekCarbs = dietPlan.carbs_g * pastDays.length
            const targetWeekFat = dietPlan.fat_g * pastDays.length
            const weekCalPct = targetWeekCals > 0 ? Math.min(100, Math.round((weekCals / targetWeekCals) * 100)) : 0
            const weekProtPct = targetWeekProtein > 0 ? Math.min(100, Math.round((weekProtein / targetWeekProtein) * 100)) : 0
            const weekCarbPct = targetWeekCarbs > 0 ? Math.min(100, Math.round((weekCarbs / targetWeekCarbs) * 100)) : 0
            const weekFatPct = targetWeekFat > 0 ? Math.min(100, Math.round((weekFat / targetWeekFat) * 100)) : 0
            return (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-200">Weekly Macro Totals</p>
                  <span className="text-xs text-gray-500">{daysWithMeals}/{pastDays.length} day{pastDays.length !== 1 ? 's' : ''} fed</span>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-gray-500">Calories this week</span>
                    <span className={weekCalPct >= 90 ? 'text-green-400' : 'text-brand-400'}>
                      {weekCals.toLocaleString()} / {targetWeekCals.toLocaleString()} kcal ({weekCalPct}%)
                    </span>
                  </div>
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-300 ${weekCalPct >= 90 ? 'bg-green-500' : 'bg-brand-500'}`} style={{ width: `${weekCalPct}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-gray-500">Protein this week</span>
                    <span className={weekProtPct >= 90 ? 'text-green-400' : 'text-green-300'}>
                      {Math.round(weekProtein)}g / {Math.round(targetWeekProtein)}g ({weekProtPct}%)
                    </span>
                  </div>
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-300 ${weekProtPct >= 90 ? 'bg-green-500' : 'bg-green-600'}`} style={{ width: `${weekProtPct}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-gray-500">Carbs this week</span>
                    <span className={weekCarbPct >= 90 ? 'text-green-400' : 'text-blue-400'}>
                      {Math.round(weekCarbs)}g / {Math.round(targetWeekCarbs)}g ({weekCarbPct}%)
                    </span>
                  </div>
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-300 ${weekCarbPct >= 90 ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${weekCarbPct}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-gray-500">Fat this week</span>
                    <span className={weekFatPct >= 90 ? 'text-green-400' : 'text-yellow-400'}>
                      {Math.round(weekFat)}g / {Math.round(targetWeekFat)}g ({weekFatPct}%)
                    </span>
                  </div>
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-300 ${weekFatPct >= 90 ? 'bg-green-500' : 'bg-yellow-500'}`} style={{ width: `${weekFatPct}%` }} />
                  </div>
                </div>
                {/* Average daily deficit/surplus — only shown once there are logged meals this week */}
                {weekCals > 0 && pastDays.length > 0 && (() => {
                  const avgDailyCals = Math.round(weekCals / pastDays.length)
                  const dailyDelta = avgDailyCals - dietPlan.calories_target
                  const isImperial = settings.units === 'imperial'
                  // 1 lb fat ≈ 3500 kcal, 1 kg fat ≈ 7700 kcal
                  const weeklyChange = Math.abs(dailyDelta) * 7 / (isImperial ? 3500 : 7700)
                  const isDeficit = dailyDelta < 0
                  const isSurplus = dailyDelta > 0

                  const avgDailyProtein = Math.round(weekProtein / pastDays.length)
                  const proteinTarget = dietPlan.protein_g
                  const proteinPctAvg = proteinTarget > 0 ? Math.round((avgDailyProtein / proteinTarget) * 100) : 0
                  // Protein streak: consecutive days ending today where logged protein >= 90% of target
                  let proStreak = 0
                  for (let i = pastDays.length - 1; i >= 0; i--) {
                    const { dateStr } = pastDays[i]
                    const dayProtein = (dietPlan.meals ?? []).reduce((sum, m, idx) =>
                      sum + (mealCompletions.some(c => c.date === dateStr && c.meal_index === idx) ? m.protein_g : 0), 0
                    )
                    if (dayProtein >= proteinTarget * 0.9) proStreak++
                    else break
                  }

                  return (
                    <div className="pt-2 border-t border-gray-800 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-500">Avg daily calories</span>
                        <div className="text-right">
                          <span className={isDeficit ? 'text-green-400' : isSurplus ? 'text-amber-400' : 'text-gray-400'}>
                            {avgDailyCals.toLocaleString()} kcal/day
                          </span>
                          {dailyDelta !== 0 && (
                            <span className="text-gray-600 ml-1.5">
                              ({isDeficit ? '−' : '+'}{Math.abs(dailyDelta)} kcal → ~{weeklyChange.toFixed(1)} {isImperial ? 'lbs' : 'kg'}/wk)
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-500">Avg daily protein</span>
                        <div className="flex items-center gap-2">
                          {proStreak >= 2 && (
                            <span className="bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded text-[10px] font-semibold">
                              {proStreak}d streak
                            </span>
                          )}
                          <span className={proteinPctAvg >= 90 ? 'text-green-400' : proteinPctAvg >= 75 ? 'text-amber-400' : 'text-red-400'}>
                            {avgDailyProtein}g / {proteinTarget}g ({proteinPctAvg}%)
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </div>
            )
          })()}

          {/* Macro bar */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-sm font-medium text-gray-300 mb-3">Macro Distribution</p>
            <div className="h-4 rounded-full overflow-hidden flex gap-0.5">
              <div className="bg-green-500" style={{ width: `${proteinPct}%` }} />
              <div className="bg-blue-500" style={{ width: `${carbsPct}%` }} />
              <div className="bg-yellow-500" style={{ width: `${fatPct}%` }} />
            </div>
            <div className="flex gap-4 mt-2">
              <span className="text-xs text-green-400"><span className="font-medium">Protein</span> {proteinPct}%</span>
              <span className="text-xs text-blue-400"><span className="font-medium">Carbs</span> {carbsPct}%</span>
              <span className="text-xs text-yellow-400"><span className="font-medium">Fat</span> {fatPct}%</span>
            </div>
          </div>

          {/* ── Food Preferences Panel ── */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <button
              onClick={() => setPrefsOpen(!prefsOpen)}
              className="w-full flex items-center justify-between px-4 py-3 text-left"
            >
              <div>
                <p className="font-semibold text-gray-200 text-sm">Food Preferences</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {user.cooking_time_pref === 'quick'
                    ? 'Quick prep'
                    : user.cooking_time_pref === 'chef'
                    ? 'Chef-style prep'
                    : 'Medium prep'}{' '}
                  &middot;
                  {user.dietary_restrictions?.length
                    ? ` ${user.dietary_restrictions.join(', ')}`
                    : ''}
                  {user.food_exclusions?.length
                    ? ` · ${user.food_exclusions.length} food${user.food_exclusions.length !== 1 ? 's' : ''} excluded`
                    : ''}
                  {!user.dietary_restrictions?.length && !user.food_exclusions?.length ? ' No exclusions' : ''}
                  {(user.snack_count ?? 0) > 0 ? ` · ${user.snack_count} snack${user.snack_count !== 1 ? 's' : ''}` : ''}
                </p>
              </div>
              <span className="text-gray-500 text-xs">{prefsOpen ? '▲ Close' : '▼ Customize'}</span>
            </button>

            {prefsOpen && (
              <div className="px-4 pb-4 space-y-4 border-t border-gray-800">
                {/* Dietary restrictions toggles */}
                <div className="pt-3">
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 block">
                    Dietary Restrictions
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {(['Dairy-free', 'No pork', 'No shellfish', 'Nut allergy', 'Gluten-free', 'Low FODMAP'] as const).map((r) => {
                      const active = prefsRestrictions.includes(r)
                      return (
                        <button
                          key={r}
                          type="button"
                          onClick={() => togglePrefsRestriction(r)}
                          className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                            active
                              ? 'bg-brand-600/20 border-brand-500 text-brand-400'
                              : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
                          }`}
                        >
                          {r}
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-xs text-gray-600 mt-1.5">Tap to toggle — plan regenerates immediately.</p>
                </div>

                {/* Cook time */}
                <div className="pt-3">
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 block">
                    Cook Time Per Meal
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: 'quick', label: 'Quick', desc: '<15 min' },
                      { value: 'medium', label: 'Medium', desc: '15–30 min' },
                      { value: 'chef', label: 'Chef', desc: '30+ min' },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setPrefsCookTime(opt.value as 'quick' | 'medium' | 'chef')}
                        className={`p-2 rounded-lg border text-left transition-colors ${
                          prefsCookTime === opt.value
                            ? 'border-brand-500 bg-brand-600/20 text-brand-400'
                            : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
                        }`}
                      >
                        <p className="text-xs font-semibold">{opt.label}</p>
                        <p className="text-xs text-gray-500">{opt.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Prep style */}
                <div>
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 block">
                    Meal Prep Style
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: 'daily', label: 'Daily', desc: 'Fresh each day' },
                      { value: 'batch', label: 'Batch', desc: 'Weekly prep' },
                      { value: 'mixed', label: 'Mixed', desc: 'Combination' },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setPrefsPrepStyle(opt.value as 'daily' | 'batch' | 'mixed')}
                        className={`p-2 rounded-lg border text-left transition-colors ${
                          prefsPrepStyle === opt.value
                            ? 'border-brand-500 bg-brand-600/20 text-brand-400'
                            : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
                        }`}
                      >
                        <p className="text-xs font-semibold">{opt.label}</p>
                        <p className="text-xs text-gray-500">{opt.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Snacks count */}
                <div>
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 block">
                    Snacks/Day (~200 kcal each)
                  </label>
                  <div className="flex gap-2">
                    {[0, 1, 2, 3].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setPrefsSnackCount(n)}
                        className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-colors ${
                          prefsSnackCount === n
                            ? 'border-brand-500 bg-brand-600/20 text-brand-400'
                            : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
                        }`}
                      >
                        {n === 0 ? 'None' : n}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Food exclusions */}
                <div>
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1 block">
                    Foods to Exclude
                  </label>
                  {prefsExclusions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {prefsExclusions.map((id) => {
                        const food = FOODS.find((f) => f.id === id)
                        // Always render — fall back to prettified ID if not in FOODS database
                        const label = food?.name ?? id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
                        return (
                          <span
                            key={id}
                            onClick={() => togglePrefsExclusion(id)}
                            className="text-xs bg-red-900/30 text-red-400 border border-red-800/40 rounded-full px-2 py-0.5 cursor-pointer hover:bg-red-900/50"
                          >
                            {label} &times;
                          </span>
                        )
                      })}
                    </div>
                  )}
                  <input
                    type="text"
                    placeholder="Search foods to exclude..."
                    value={prefsExcludeSearch}
                    onChange={(e) => setPrefsExcludeSearch(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 mb-1"
                  />
                  <div className="bg-gray-800 border border-gray-700 rounded-lg max-h-28 overflow-y-auto">
                    {filteredForExclude.slice(0, 20).map((food) => (
                      <div
                        key={food.id}
                        onClick={() => togglePrefsExclusion(food.id)}
                        className={`flex items-center justify-between px-3 py-1.5 cursor-pointer hover:bg-gray-700 border-b border-gray-700 last:border-0 ${
                          prefsExclusions.includes(food.id) ? 'bg-red-900/20' : ''
                        }`}
                      >
                        <span className="text-xs text-gray-300">{food.name}</span>
                        <span
                          className={`text-xs ${
                            prefsExclusions.includes(food.id) ? 'text-red-400' : 'text-gray-600'
                          }`}
                        >
                          {prefsExclusions.includes(food.id) ? '✗' : '+'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Food preferences */}
                <div>
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1 block">
                    Foods You Enjoy{' '}
                    <span className="text-gray-600 font-normal">(optional)</span>
                  </label>
                  {prefsPreferences.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {prefsPreferences.map((id) => {
                        const food = FOODS.find((f) => f.id === id)
                        return food ? (
                          <span
                            key={id}
                            onClick={() => togglePrefsPreference(id)}
                            className="text-xs bg-green-900/30 text-green-400 border border-green-800/40 rounded-full px-2 py-0.5 cursor-pointer hover:bg-green-900/50"
                          >
                            {food.name} &times;
                          </span>
                        ) : null
                      })}
                    </div>
                  )}
                  <input
                    type="text"
                    placeholder="Search foods you enjoy..."
                    value={prefsPreferSearch}
                    onChange={(e) => setPrefsPreferSearch(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 mb-1"
                  />
                  <div className="bg-gray-800 border border-gray-700 rounded-lg max-h-28 overflow-y-auto">
                    {filteredForPrefer.slice(0, 20).map((food) => (
                      <div
                        key={food.id}
                        onClick={() => togglePrefsPreference(food.id)}
                        className={`flex items-center justify-between px-3 py-1.5 cursor-pointer hover:bg-gray-700 border-b border-gray-700 last:border-0 ${
                          prefsPreferences.includes(food.id) ? 'bg-green-900/20' : ''
                        }`}
                      >
                        <span className="text-xs text-gray-300">{food.name}</span>
                        <span
                          className={`text-xs ${
                            prefsPreferences.includes(food.id) ? 'text-green-400' : 'text-gray-600'
                          }`}
                        >
                          {prefsPreferences.includes(food.id) ? '★' : '+'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Save button */}
                <Button onClick={handleSavePrefs} disabled={prefsSaving} className="w-full">
                  {prefsSaving ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />{' '}
                      Saving &amp; Regenerating...
                    </>
                  ) : (
                    'Save & Regenerate Plan'
                  )}
                </Button>
              </div>
            )}
          </div>

          {/* AI Diet Refine — only shown when Claude API key is configured */}
          {(settings?.claude_api_key ?? '') && tab === 'plan' && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold text-brand-400 uppercase tracking-wider">AI Refinement</span>
                <span className="text-xs text-green-400">● Claude active</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={aiRefinePrompt}
                  onChange={(e) => setAiRefinePrompt(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !aiRefining && handleAiRefine()}
                  placeholder="e.g. more vegetarian options, add Korean foods, less chicken..."
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600"
                />
                <button
                  onClick={handleAiRefine}
                  disabled={aiRefining || !aiRefinePrompt.trim()}
                  className="px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium transition-colors disabled:opacity-40"
                >
                  {aiRefining ? 'Refining...' : 'Refine'}
                </button>
              </div>
              {aiRefineError && <p className="text-xs text-red-400 mt-1">{aiRefineError}</p>}
              {aiRefineSuccess && <p className="text-xs text-green-400 mt-1">{aiRefineSuccess}</p>}
              {aiRefineInfo && <p className="text-xs text-amber-400 mt-1">{aiRefineInfo}</p>}
              <p className="text-xs text-gray-600 mt-1.5">Press Enter or click Refine — Claude will adjust your meal plan.</p>
            </div>
          )}
        </>
      )}

      {/* ─── WEEKLY VIEW TAB ─── */}
      {tab === 'weekly' && (
        <WeeklyMealView mealCount={dietPlan.meal_count} meals={dietPlan.meals ?? []} />
      )}

      {/* ─── GROCERY LIST TAB ─── */}
      {tab === 'grocery' && (
        <GroceryList key={dietPlan.id} planId={dietPlan.id} meals={dietPlan.meals ?? []} />
      )}

      {/* Exclude confirmation modal */}
      {excludePending && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 max-w-sm w-full">
            <h3 className="font-bold text-gray-100 mb-2">Exclude Food?</h3>
            <p className="text-sm text-gray-400 mb-4">
              Remove <strong className="text-gray-200">"{excludePending}"</strong> from all future meal plans?
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setExcludePending(null)} className="flex-1">
                Cancel
              </Button>
              <Button onClick={() => handleExcludeFood(excludePending)} className="flex-1">
                Exclude
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Swap meal sheet */}
      {swapTarget && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center">
          <div className="bg-gray-900 border border-gray-800 rounded-t-2xl p-6 w-full max-w-lg">
            <h3 className="font-bold text-gray-100 mb-1">Swap {swapTarget.meal.name}</h3>
            <p className="text-xs text-gray-500 mb-4">Choose a replacement meal (~{swapTarget.meal.calories} kcal, {swapTarget.meal.protein_g}g protein). You can swap again anytime.</p>
            <div className="space-y-2 mb-4">
              {(() => {
                const alternatives = getSwapAlternatives(swapTarget.meal, user.dietary_preference, user.food_exclusions ?? [])
                if (alternatives.length === 0) {
                  return (
                    <p className="text-xs text-gray-500 text-center py-4">
                      No swap options match your current food exclusions. Close this and scroll to the "Food Preferences" panel to remove some exclusions, then try again.
                    </p>
                  )
                }
                return alternatives.map((alt, i) => (
                  <div
                    key={i}
                    onClick={async () => {
                      if (swapping) return
                      setSwapping(true)
                      setSwapError(null)
                      try {
                        await window.api.swapMeal(user.id, swapTarget.mealIndex, alt)
                        await loadDietPlan(user.id)
                        setSwapTarget(null)
                      } catch (e: unknown) {
                        setSwapError(e instanceof Error ? e.message : 'Swap failed — please try again.')
                      } finally {
                        setSwapping(false)
                      }
                    }}
                    className={`bg-gray-800 border border-gray-700 rounded-xl p-3 transition-colors ${swapping ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-gray-600'}`}
                  >
                    <div className="mb-1">
                      <span className="text-xs text-gray-300 font-medium">
                        {alt[0]?.replace(/\s*\(.*?\)/g, '').replace(/\s*x\d+/g, '').trim() ?? `Option ${i + 1}`}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {alt.map((food, fi) => (
                        <span key={fi} className="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded-md">
                          {food}
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              })()}
            </div>
            {swapError && (
              <p className="text-xs text-red-400 mb-3">{swapError}</p>
            )}
            <Button variant="secondary" onClick={() => !swapping && setSwapTarget(null)} className="w-full">
              {swapping ? 'Saving...' : 'Cancel'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// Generates alternative food combos for a given meal slot, filtered by exclusions.
// Portions are computed dynamically from meal.calories to match the nutrition engine.
function getSwapAlternatives(meal: Meal, dietary: string, exclusions: string[] = []): string[][] {
  const isExcluded = (foods: string[]) =>
    foods.some((food) =>
      exclusions.some((ex) => food.toLowerCase().includes(ex.replace(/_/g, ' ')))
    )

  const isVegan = dietary === 'vegan'
  const isVeg = dietary === 'vegetarian'
  const mealName = meal.name.toLowerCase()
  const mc = meal.calories

  // Returns gram amount scaled to mealCal * fraction, rounded to nearest 5g, clamped to [min, max]
  const pg = (calPer100g: number, fraction: number, min = 30, max = 280): number => {
    const g = Math.round((mc * fraction / calPer100g) * 100 / 5) * 5
    return Math.max(min, Math.min(max, g))
  }

  let candidates: string[][]

  if (mealName.includes('breakfast')) {
    candidates = isVegan
      ? [
          [`Tofu Scramble (${pg(76, 0.45)}g)`, `Oats (${pg(389, 0.35)}g dry)`, 'Blueberries (100g)'],
          ['Soy Protein Shake (30g)', 'Banana (100g)', `Almond Butter (${pg(614, 0.15, 5, 30)}g)`],
          [`Cream of Rice (${pg(380, 0.35)}g dry)`, 'Pea Protein Shake (30g)', 'Mixed Berries (100g)'],
        ]
      : [
          [`Greek Yogurt (${pg(59, 0.45)}g)`, `Oats (${pg(389, 0.35)}g dry)`, 'Mixed Berries (100g)'],
          ['Egg Whites x6', `Sweet Potato (${pg(86, 0.35)}g)`, 'Spinach (100g)'],
          ['Whey Protein Shake (30g)', `Oats (${pg(389, 0.35)}g dry)`, 'Banana (100g)'],
        ]
  } else if (mealName.includes('snack')) {
    candidates = isVegan
      ? [
          ['Rice Cakes x2', 'Pea Protein Shake (30g)'],
          ['Apple (100g)', 'Almond Butter (16g)'],
          ['Edamame (100g)'],
        ]
      : [
          [`Greek Yogurt (${pg(59, 0.45, 100, 250)}g)`, 'Apple (100g)'],
          [`Cottage Cheese (${pg(98, 0.45, 100, 250)}g)`, 'Rice Cakes x2'],
          ['Whey Protein Shake (30g)', 'Banana (100g)'],
        ]
  } else if (isVegan) {
    candidates = [
      [`Tempeh (${pg(195, 0.45)}g)`, `Brown Rice (${pg(111, 0.35)}g cooked)`, 'Broccoli (120g)', `Walnuts (${pg(654, 0.15, 5, 30)}g)`],
      [`Tofu (${pg(76, 0.45)}g)`, `Quinoa (${pg(120, 0.35)}g cooked)`, 'Mixed Veg (120g)', `Avocado (${pg(160, 0.15, 20, 80)}g)`],
      ['Edamame (120g)', `Sweet Potato (${pg(86, 0.35)}g)`, 'Kale (100g)', `Almond Butter (${pg(614, 0.15, 5, 30)}g)`],
    ]
  } else if (isVeg) {
    candidates = [
      [`Cottage Cheese (${pg(98, 0.45)}g)`, `Sweet Potato (${pg(86, 0.35)}g)`, 'Green Beans (120g)', `Almonds (${pg(579, 0.15, 5, 30)}g)`],
      [`Greek Yogurt (${pg(59, 0.45)}g)`, `Quinoa (${pg(120, 0.35)}g cooked)`, 'Spinach (100g)', `Almonds (${pg(579, 0.15, 5, 30)}g)`],
      ['Eggs x3', `Brown Rice (${pg(111, 0.35)}g cooked)`, 'Broccoli (120g)', `Almonds (${pg(579, 0.15, 5, 30)}g)`],
    ]
  } else {
    candidates = [
      [`Turkey Breast (${pg(157, 0.45)}g)`, `White Rice (${pg(130, 0.35)}g cooked)`, 'Asparagus (150g)', `Almonds (${pg(579, 0.15, 5, 30)}g)`],
      [`Salmon Fillet (${pg(208, 0.45)}g)`, `Sweet Potato (${pg(86, 0.35)}g)`, 'Spinach (100g)', `Almonds (${pg(579, 0.15, 5, 30)}g)`],
      [`Lean Ground Beef (${pg(176, 0.45)}g)`, `Quinoa (${pg(120, 0.35)}g cooked)`, 'Bell Pepper (150g)', `Almonds (${pg(579, 0.15, 5, 30)}g)`],
    ]
  }

  return candidates.filter((alt) => !isExcluded(alt))
}
