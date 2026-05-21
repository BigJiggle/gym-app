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
import type { Meal } from '../../types'

type DietTab = 'plan' | 'weekly' | 'grocery'

export default function Diet() {
  const { user, updateUser } = useUserStore()
  const { dietPlan, loadDietPlan, generateDietPlan, loading, mealCompletions, loadMealCompletions, logMealCompletion, unlogMealCompletion } = usePlanStore()
  const { settings } = useSettingsStore()

  const [tab, setTab] = useState<DietTab>('plan')
  const [swapTarget, setSwapTarget] = useState<{ mealIndex: number; meal: Meal } | null>(null)
  const [excludePending, setExcludePending] = useState<string | null>(null)
  const [aiRefinePrompt, setAiRefinePrompt] = useState('')
  const [aiRefining, setAiRefining] = useState(false)
  const [aiRefineError, setAiRefineError] = useState<string | null>(null)
  const [aiRefineSuccess, setAiRefineSuccess] = useState<string | null>(null)
  const [aiRefineInfo, setAiRefineInfo] = useState<string | null>(null)

  // Food preferences panel state
  const [prefsOpen, setPrefsOpen] = useState(false)
  const [prefsCookTime, setPrefsCookTime] = useState<'quick' | 'medium' | 'chef'>('medium')
  const [prefsPrepStyle, setPrefsPrepStyle] = useState<'daily' | 'batch' | 'mixed'>('daily')
  const [prefsSnacks, setPrefsSnacks] = useState(true)
  const [prefsExclusions, setPrefsExclusions] = useState<string[]>([])
  const [prefsPreferences, setPrefsPreferences] = useState<string[]>([])
  const [prefsExcludeSearch, setPrefsExcludeSearch] = useState('')
  const [prefsPreferSearch, setPrefsPreferSearch] = useState('')
  const [prefsSaving, setPrefsSaving] = useState(false)
  const [prefsRestrictions, setPrefsRestrictions] = useState<string[]>([])

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

  // Sync prefs panel state from user when panel opens
  useEffect(() => {
    if (prefsOpen && user) {
      setPrefsCookTime((user.cooking_time_pref as 'quick' | 'medium' | 'chef') ?? 'medium')
      setPrefsPrepStyle((user.meal_prep_style as 'daily' | 'batch' | 'mixed') ?? 'daily')
      setPrefsSnacks(user.include_snacks ?? true)
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
        include_snacks: prefsSnacks,
        food_exclusions: prefsExclusions,
        food_preferences: prefsPreferences,
      })
      await generateDietPlan(user.id)
      setPrefsOpen(false)
    } finally {
      setPrefsSaving(false)
    }
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

  const proteinPct = Math.round((dietPlan.protein_g * 4 / dietPlan.calories_target) * 100)
  const carbsPct = Math.round((dietPlan.carbs_g * 4 / dietPlan.calories_target) * 100)
  const fatPct = Math.round((dietPlan.fat_g * 9 / dietPlan.calories_target) * 100)

  // Today's intake progress
  const todayCompletions = mealCompletions.filter((c) => c.date === todayStr)
  const mealsEaten = todayCompletions.length
  const totalMeals = dietPlan.meals?.length ?? 0
  const consumedCalories = todayCompletions.reduce((acc, c) => acc + (dietPlan.meals?.[c.meal_index]?.calories ?? 0), 0)
  const consumedProtein = todayCompletions.reduce((acc, c) => acc + (dietPlan.meals?.[c.meal_index]?.protein_g ?? 0), 0)
  const calPct = Math.min(100, dietPlan.calories_target > 0 ? Math.round((consumedCalories / dietPlan.calories_target) * 100) : 0)
  const protPct = Math.min(100, dietPlan.protein_g > 0 ? Math.round((consumedProtein / dietPlan.protein_g) * 100) : 0)

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

      {/* Tabs */}
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
              {mealsEaten === totalMeals && (
                <p className="text-xs text-green-400 font-medium">All meals hit today — great work!</p>
              )}
              {mealsEaten < totalMeals && calPct < 100 && (
                <p className="text-xs text-gray-400 font-medium">
                  <span className="text-brand-400">{dietPlan.calories_target - consumedCalories} kcal</span>
                  {' · '}
                  <span className="text-green-300">{Math.max(0, dietPlan.protein_g - consumedProtein)}g protein</span>
                  {' remaining today'}
                </p>
              )}
            </div>
          )}

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

          {/* Weekly macro totals — calories and protein hit across all logged days this week */}
          {totalMeals > 0 && (() => {
            const pastDays = weekDays.filter(d => d.dateStr <= todayStr)
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
            const targetWeekCals = dietPlan.calories_target * pastDays.length
            const targetWeekProtein = dietPlan.protein_g * pastDays.length
            const weekCalPct = targetWeekCals > 0 ? Math.min(100, Math.round((weekCals / targetWeekCals) * 100)) : 0
            const weekProtPct = targetWeekProtein > 0 ? Math.min(100, Math.round((weekProtein / targetWeekProtein) * 100)) : 0
            return (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-200">Weekly Macro Totals</p>
                  <span className="text-xs text-gray-500">{pastDays.length} day{pastDays.length !== 1 ? 's' : ''} logged</span>
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
          </div>

          {/* Meals */}
          <div>
            <h2 className="text-lg font-semibold text-gray-100 mb-3">Daily Meals ({dietPlan.meal_count} meals)</h2>
            <div className="space-y-3">
              {dietPlan.meals?.map((meal, i) => (
                <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-600 font-mono">{meal.time}</span>
                      <h3 className="text-sm font-semibold text-gray-200">{meal.name}</h3>
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
                      <span key={fi} className="group flex items-center gap-1 text-xs bg-gray-800 text-gray-400 px-2 py-1 rounded-md">
                        {food}
                        <button
                          onClick={() => setExcludePending(food)}
                          className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-opacity ml-0.5"
                          title="Exclude this food"
                        >
                          &#10005;
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-800">
                    <button
                      onClick={() => setSwapTarget({ mealIndex: i, meal })}
                      className="text-xs text-gray-400 hover:text-brand-300 border border-gray-700 hover:border-brand-700 rounded-lg px-2.5 py-1 transition-colors flex items-center gap-1"
                    >
                      &#8635; Swap Meal
                    </button>
                    <button
                      onClick={() => toggleMealEaten(i, meal.name)}
                      className={`text-xs font-medium rounded-lg px-2.5 py-1 transition-colors flex items-center gap-1 ${
                        isMealEaten(i)
                          ? 'bg-green-900/30 border border-green-800/50 text-green-400'
                          : 'bg-brand-900/20 border border-brand-700 text-brand-400 hover:bg-brand-900/40'
                      }`}
                    >
                      {isMealEaten(i) ? '✓ Eaten' : 'Mark Eaten'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Disclaimer */}
          <div className="bg-amber-900/10 border border-amber-800/30 rounded-lg p-3 text-xs text-amber-600">
            <strong className="text-amber-500">Note:</strong> Food items are examples. Weigh portions for accuracy. Click &#10005; on any food to exclude it from future plans.
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
                  {user.include_snacks ? ' · Snacks' : ''}
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

                {/* Snacks toggle */}
                <div>
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 block">
                    Snacks
                  </label>
                  <div className="flex gap-2">
                    {[
                      { value: true, label: 'Include Snacks', desc: 'Adds snack slots between meals' },
                      { value: false, label: 'Main Meals Only', desc: 'No snack slots' },
                    ].map((opt) => (
                      <button
                        key={String(opt.value)}
                        type="button"
                        onClick={() => setPrefsSnacks(opt.value)}
                        className={`flex-1 p-2 rounded-lg border text-left transition-colors ${
                          prefsSnacks === opt.value
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
                  {aiRefining ? '...' : 'Refine'}
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
        <GroceryList key={dietPlan.id} meals={dietPlan.meals ?? []} />
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
            <p className="text-xs text-gray-500 mb-4">Tap an option to replace your current foods (~{swapTarget.meal.calories} kcal, {swapTarget.meal.protein_g}g protein):</p>
            <div className="space-y-2 mb-4">
              {getSwapAlternatives(swapTarget.meal, user.dietary_preference).map((alt, i) => (
                <div
                  key={i}
                  onClick={() => {
                    if (dietPlan) {
                      const updatedMeals = dietPlan.meals?.map((m, idx) =>
                        idx === swapTarget.mealIndex ? { ...m, foods: alt } : m
                      )
                      usePlanStore.setState({ dietPlan: { ...dietPlan, meals: updatedMeals } })
                    }
                    setSwapTarget(null)
                  }}
                  className="bg-gray-800 border border-gray-700 rounded-xl p-3 cursor-pointer hover:border-gray-600"
                >
                  <div className="mb-1">
                    <span className="text-xs text-gray-300 font-medium">Option {i + 1}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {alt.map((food, fi) => (
                      <span key={fi} className="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded-md">
                        {food}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-600 mb-3">Updates your plan view until the plan is regenerated. To permanently exclude a food, tap ✕ on it in the meal card.</p>
            <Button variant="secondary" onClick={() => setSwapTarget(null)} className="w-full">
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// Generates 3 alternative food combos for a given meal slot
function getSwapAlternatives(meal: Meal, dietary: string): string[][] {
  const isVegan = dietary === 'vegan'
  const isVeg = dietary === 'vegetarian'
  const mealName = meal.name.toLowerCase()

  if (mealName.includes('breakfast')) {
    if (isVegan)
      return [
        ['Tofu Scramble (200g)', 'Oats (80g dry)', 'Blueberries (100g)'],
        ['Soy Protein Shake (35g)', 'Banana', 'Almond Butter (32g)'],
        ['Cream of Rice (50g dry)', 'Pea Protein Shake (35g)', 'Mixed Berries (150g)'],
      ]
    return [
      ['Greek Yogurt (200g)', 'Oats (80g dry)', 'Mixed Berries (150g)'],
      ['Egg Whites x6', 'Sweet Potato (200g)', 'Spinach (100g)'],
      ['Whey Protein Shake (35g)', 'Oats (80g dry)', 'Banana'],
    ]
  }

  if (mealName.includes('snack')) {
    if (isVegan)
      return [
        ['Rice Cakes x2', 'Pea Protein Shake (35g)'],
        ['Apple', 'Almond Butter (16g)'],
        ['Edamame (100g)'],
      ]
    return [
      ['Greek Yogurt (150g)', 'Apple'],
      ['Cottage Cheese (150g)', 'Rice Cakes x2'],
      ['Whey Protein Shake (35g)', 'Banana (half)'],
    ]
  }

  if (isVegan)
    return [
      ['Tempeh (150g)', 'Brown Rice (200g cooked)', 'Broccoli (200g)'],
      ['Tofu (200g)', 'Quinoa (185g cooked)', 'Mixed Veg (200g)'],
      ['Edamame (150g)', 'Sweet Potato (200g)', 'Kale (100g)'],
    ]
  if (isVeg)
    return [
      ['Cottage Cheese (200g)', 'Sweet Potato (200g)', 'Green Beans (150g)'],
      ['Greek Yogurt (200g)', 'Quinoa (185g cooked)', 'Spinach (100g)'],
      ['Eggs x3', 'Brown Rice (200g)', 'Broccoli (200g)'],
    ]
  return [
    ['Turkey Breast (150g)', 'White Rice (200g cooked)', 'Asparagus (150g)'],
    ['Salmon Fillet (180g)', 'Sweet Potato (200g)', 'Spinach (100g)'],
    ['Lean Ground Beef (150g)', 'Quinoa (185g cooked)', 'Bell Pepper (150g)'],
  ]
}
