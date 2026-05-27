import { useState, useEffect, useRef } from 'react'
import { useUserStore } from '../../store/userStore'
import { usePlanStore } from '../../store/planStore'
import { useSettingsStore } from '../../store/settingsStore'
import { Select } from '../../components/ui/Input'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import GoalPickerModal from '../../components/GoalPickerModal'
import { displayWeight, displayHeight } from '../../utils/units'
import { getShowCountdown } from '../../utils/dates'
import type { Show } from '../../types'

export default function Settings() {
  const { user, updateUser, shows, loadShows, addShow, deleteShow, setPrimaryShow, resetAllData } = useUserStore()
  const { generateTrainingPlan, generateDietPlan, startupRefresh } = usePlanStore()
  const { settings, setSetting } = useSettingsStore()
  const [claudeKeyDraft, setClaudeKeyDraft] = useState(settings.claude_api_key ?? '')
  const [claudeKeySaved, setClaudeKeySaved] = useState(false)
  const [showGoalPicker, setShowGoalPicker] = useState(false)

  // Shows
  const [showForm, setShowForm] = useState({ name: '', show_date: '', division: '', federation: '', notes: '' })
  const [showFormOpen, setShowFormOpen] = useState(false)
  const [showAdding, setShowAdding] = useState(false)
  const [showError, setShowError] = useState<string | null>(null)
  const showDateInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (user?.id) loadShows(user.id)
  }, [user?.id])

  // Focus the date input as soon as the add-show form opens
  useEffect(() => {
    if (showFormOpen) {
      // Small delay lets React finish the DOM update before focusing
      const t = setTimeout(() => showDateInputRef.current?.focus(), 50)
      return () => clearTimeout(t)
    }
  }, [showFormOpen])
  const isImperial = settings.units === 'imperial'
  const [editOpen, setEditOpen] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [editSaved, setEditSaved] = useState(false)
  const [editForm, setEditForm] = useState(() => ({
    name: user?.name ?? '',
    age: user?.age ?? 25,
    sex: user?.sex ?? 'male',
    height_cm: user?.height_cm ?? 170,
    weight_kg: user?.weight_kg ?? 75,
    body_fat_pct: user?.body_fat_pct ?? ('' as string | number),
    training_experience_years: user?.training_experience_years ?? 2,
    goal: user?.goal ?? 'cut',
    division: user?.division ?? '',
    show_date: user?.show_date ?? '',
    training_frequency: user?.training_frequency ?? 4,
    equipment_access: user?.equipment_access ?? 'full_gym',
    activity_level: user?.activity_level ?? 'moderate',
    split_preference: user?.split_preference ?? 'auto',
    exercises_per_session: user?.exercises_per_session ?? 6,
    sets_per_exercise: user?.sets_per_exercise ?? 4,
    dietary_preference: user?.dietary_preference ?? 'omnivore',
    meal_count: user?.meal_count ?? 4,
    include_snacks: user?.include_snacks ?? true,
    cooking_time_pref: user?.cooking_time_pref ?? 'medium',
    meal_prep_style: user?.meal_prep_style ?? 'daily',
    dietary_restrictions: (user?.dietary_restrictions ?? []) as string[],
  }))

  // Re-sync form from store every time the edit panel is opened so stale values never show
  useEffect(() => {
    if (editOpen && user) {
      setEditForm({
        name: user.name ?? '',
        age: user.age ?? 25,
        sex: user.sex ?? 'male',
        height_cm: user.height_cm ?? 170,
        weight_kg: user.weight_kg ?? 75,
        body_fat_pct: user.body_fat_pct ?? '',
        training_experience_years: user.training_experience_years ?? 2,
        goal: user.goal ?? 'cut',
        division: user.division ?? '',
        show_date: user.show_date ?? '',
        training_frequency: user.training_frequency ?? 4,
        equipment_access: user.equipment_access ?? 'full_gym',
        activity_level: user.activity_level ?? 'moderate',
        split_preference: user.split_preference ?? 'auto',
        exercises_per_session: user.exercises_per_session ?? 6,
        sets_per_exercise: user.sets_per_exercise ?? 4,
        dietary_preference: user.dietary_preference ?? 'omnivore',
        meal_count: user.meal_count ?? 4,
        include_snacks: user.include_snacks ?? true,
        cooking_time_pref: user.cooking_time_pref ?? 'medium',
        meal_prep_style: user.meal_prep_style ?? 'daily',
        dietary_restrictions: (user.dietary_restrictions ?? []) as string[],
      })
    }
  }, [editOpen])

  if (!user) return null

  async function handleSaveProfile(regenerate = false) {
    setEditSaving(true)
    try {
      await updateUser({
        id: user!.id,
        ...editForm,
        body_fat_pct: editForm.body_fat_pct !== '' ? Number(editForm.body_fat_pct) : undefined,
      } as any)
      if (regenerate) {
        generateTrainingPlan(user!.id)
        generateDietPlan(user!.id)
      }
      setEditSaved(true)
      setTimeout(() => setEditSaved(false), 2500)
      if (!regenerate) setEditOpen(false)
    } catch (e) {
      console.error('Failed to update profile:', e)
    } finally {
      setEditSaving(false)
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-100">Settings</h1>

      {/* Appearance */}
      <Card title="Appearance">
        <div className="space-y-4">
          {/* Theme selector */}
          <div>
            <label className="text-sm text-gray-300 mb-2 block font-medium">Theme</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'default', label: 'Default', desc: 'Orange & dark', preview: '🟠' },
                { id: 'monotone', label: 'Monotone', desc: 'Gray & dark', preview: '⬜' },
                { id: 'light', label: 'Light', desc: 'Light + orange', preview: '☀️' },
                { id: 'light-monotone', label: 'Light Gray', desc: 'Light + neutral', preview: '🩶' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSetting('theme_name' as keyof typeof settings, t.id)}
                  className={`p-2.5 rounded-xl border text-left transition-colors ${
                    (settings.theme_name ?? 'default') === t.id
                      ? 'border-brand-500 bg-brand-600/20 text-brand-400'
                      : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
                  }`}
                >
                  <span className="text-base block mb-0.5">{t.preview}</span>
                  <p className="text-xs font-bold">{t.label}</p>
                  <p className="text-xs text-gray-500">{t.desc}</p>
                </button>
              ))}
            </div>
          </div>
          <Select
            label="Units"
            value={settings.units}
            onChange={(e) => setSetting('units', e.target.value)}
            options={[
              { value: 'metric', label: 'Metric (kg, cm)' },
              { value: 'imperial', label: 'Imperial (lbs, in)' }
            ]}
          />
          {/* Compact zoom slider */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm text-gray-300">UI Zoom</label>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-brand-400">{settings.ui_zoom ?? '100'}%</span>
                {(settings.ui_zoom ?? '100') !== '100' && (
                  <button
                    onClick={() => setSetting('ui_zoom' as keyof typeof settings, '100')}
                    className="text-xs text-gray-500 hover:text-gray-300 underline"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
            <input
              type="range"
              min={50}
              max={300}
              step={25}
              value={parseInt(settings.ui_zoom ?? '100')}
              onChange={(e) => setSetting('ui_zoom' as keyof typeof settings, e.target.value)}
              className="w-full accent-brand-500 h-2"
            />
            <div className="flex justify-between text-xs text-gray-700 mt-0.5">
              <span>50%</span><span>100%</span><span>200%</span><span>300%</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Check-in schedule */}
      <Card title="Check-In Schedule">
        <div className="space-y-4">
          {/* Mode selector */}
          <div>
            <p className="text-sm font-medium text-gray-300 mb-2">Schedule Mode</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'day', label: 'Day-Based', desc: 'Every Monday, bi-weekly, etc.' },
                { id: 'interval', label: 'Interval-Based', desc: 'Every N days, no fixed day' },
              ].map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setSetting('checkin_schedule_type' as keyof typeof settings, mode.id)}
                  className={`p-3 rounded-xl border text-left transition-colors ${
                    (settings.checkin_schedule_type ?? 'day') === mode.id
                      ? 'border-brand-500 bg-brand-600/20 text-brand-400'
                      : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
                  }`}
                >
                  <p className="text-sm font-semibold">{mode.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{mode.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Day-based options */}
          {(settings.checkin_schedule_type ?? 'day') === 'day' && (
            <div className="space-y-3 border-t border-gray-800 pt-3">
              <Select
                label="Check-In Day"
                value={settings.checkin_day}
                onChange={(e) => setSetting('checkin_day', e.target.value)}
                options={[
                  { value: '1', label: 'Monday' },
                  { value: '2', label: 'Tuesday' },
                  { value: '3', label: 'Wednesday' },
                  { value: '4', label: 'Thursday' },
                  { value: '5', label: 'Friday' },
                  { value: '6', label: 'Saturday' },
                  { value: '0', label: 'Sunday' },
                ]}
              />
              <div>
                <p className="text-sm font-medium text-gray-300 mb-2">Frequency</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Weekly', desc: 'Every week on this day', value: 'false' },
                    { label: 'Bi-Weekly', desc: 'Every 2 weeks on this day', value: 'true' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setSetting('checkin_biweekly' as keyof typeof settings, opt.value)}
                      className={`p-2.5 rounded-lg border text-left transition-colors ${
                        (settings.checkin_biweekly ?? 'false') === opt.value
                          ? 'border-brand-500 bg-brand-600/20 text-brand-400'
                          : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
                      }`}
                    >
                      <p className="text-sm font-semibold">{opt.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-gray-600">
                {(settings.checkin_biweekly ?? 'false') === 'true'
                  ? `Check-in every other ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][parseInt(settings.checkin_day ?? '1')]}. Must wait 14 days between check-ins.`
                  : `Check-in every ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][parseInt(settings.checkin_day ?? '1')]}. Must wait 7 days between check-ins.`
                }
              </p>
            </div>
          )}

          {/* Interval-based options */}
          {(settings.checkin_schedule_type ?? 'day') === 'interval' && (
            <div className="space-y-3 border-t border-gray-800 pt-3">
              <div>
                <p className="text-sm font-medium text-gray-300 mb-2">Interval</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Daily', desc: 'Every day', value: '1' },
                    { label: 'Every 3 Days', desc: 'Twice a week roughly', value: '3' },
                    { label: 'Weekly', desc: 'Every 7 days', value: '7' },
                    { label: 'Bi-Weekly', desc: 'Every 14 days', value: '14' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setSetting('checkin_interval_days' as keyof typeof settings, opt.value)}
                      className={`p-2.5 rounded-lg border text-left transition-colors ${
                        (settings.checkin_interval_days ?? '7') === opt.value
                          ? 'border-brand-500 bg-brand-600/20 text-brand-400'
                          : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
                      }`}
                    >
                      <p className="text-sm font-semibold">{opt.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-gray-600">
                Next check-in unlocks exactly {settings.checkin_interval_days ?? '7'} days after your last one, any day of the week.
              </p>
            </div>
          )}

        </div>
      </Card>

      {/* Edit Profile */}
      <Card title="Edit Profile" subtitle="Update your data and regenerate plans">
        <button
          onClick={() => setEditOpen(!editOpen)}
          className="w-full flex items-center justify-between py-1 text-left"
        >
          <span className="text-sm text-gray-400">
            {editOpen ? 'Hide editor' : 'Tap to edit all profile fields'}
          </span>
          <span className="text-xs text-gray-600">{editOpen ? '▲' : '▼'}</span>
        </button>

        {editOpen && (
          <div className="mt-4 space-y-5 border-t border-gray-800 pt-4">
            {/* Personal */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Personal</p>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500 mb-1 block">Name</label>
                  <input value={editForm.name} onChange={(e) => setEditForm({...editForm, name: e.target.value})} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200" /></div>
                <div><label className="text-xs text-gray-500 mb-1 block">Age</label>
                  <input type="number" min={16} max={80} value={editForm.age} onChange={(e) => setEditForm({...editForm, age: parseInt(e.target.value)})} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200" /></div>
                <div><label className="text-xs text-gray-500 mb-1 block">Height ({isImperial ? 'in' : 'cm'})</label>
                  <input
                    type="number"
                    min={isImperial ? 48 : 100}
                    max={isImperial ? 96 : 250}
                    step={0.5}
                    value={isImperial ? Math.round(editForm.height_cm / 2.54 * 10) / 10 : editForm.height_cm}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value)
                      setEditForm({...editForm, height_cm: isImperial ? Math.round(v * 2.54 * 10) / 10 : v})
                    }}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200"
                  /></div>
                <div><label className="text-xs text-gray-500 mb-1 block">Weight ({isImperial ? 'lbs' : 'kg'})</label>
                  <input
                    type="number"
                    min={isImperial ? 66 : 30}
                    max={isImperial ? 660 : 300}
                    step={isImperial ? 0.5 : 0.1}
                    value={isImperial ? Math.round(editForm.weight_kg * 2.20462 * 10) / 10 : editForm.weight_kg}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value)
                      setEditForm({...editForm, weight_kg: isImperial ? Math.round(v / 2.20462 * 100) / 100 : v})
                    }}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200"
                  /></div>
                <div><label className="text-xs text-gray-500 mb-1 block">Body Fat %</label>
                  <input type="number" min={3} max={50} step={0.5} value={editForm.body_fat_pct} onChange={(e) => setEditForm({...editForm, body_fat_pct: e.target.value})} placeholder="optional" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200" /></div>
                <div><label className="text-xs text-gray-500 mb-1 block">Experience (yrs)</label>
                  <input type="number" min={0} max={30} step={0.5} value={editForm.training_experience_years} onChange={(e) => setEditForm({...editForm, training_experience_years: parseFloat(e.target.value)})} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200" /></div>
              </div>
            </div>

            {/* Goals */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Goals</p>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500 mb-1 block">Goal</label>
                  <select value={editForm.goal} onChange={(e) => setEditForm({...editForm, goal: e.target.value as any})} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200">
                    <option value="bulk">Bulk — Off-Season Build</option>
                    <option value="cut">Competition Cut</option>
                    <option value="maintain">Maintain</option>
                    <option value="recomp">Recomposition</option>
                  </select></div>
                <div><label className="text-xs text-gray-500 mb-1 block">Division</label>
                  <select value={editForm.division} onChange={(e) => setEditForm({...editForm, division: e.target.value})} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200">
                    <option value="">Not competing / Unsure</option>
                    <option value="Men's Physique">Men's Physique</option>
                    <option value="Classic Physique">Classic Physique</option>
                    <option value="Open Bodybuilding">Open Bodybuilding</option>
                    <option value="212 Bodybuilding">212 Bodybuilding</option>
                    <option value="Bikini">Bikini</option>
                    <option value="Wellness">Wellness</option>
                    <option value="Figure">Figure</option>
                    <option value="Women's Physique">Women's Physique</option>
                  </select></div>
                <div><label className="text-xs text-gray-500 mb-1 block">Show Date</label>
                  <input type="date" value={editForm.show_date} onChange={(e) => setEditForm({...editForm, show_date: e.target.value})} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200" /></div>
              </div>
            </div>

            {/* Training */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Training</p>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500 mb-1 block">Days/Week</label>
                  <input type="number" min={2} max={6} value={editForm.training_frequency} onChange={(e) => setEditForm({...editForm, training_frequency: parseInt(e.target.value)})} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200" /></div>
                <div><label className="text-xs text-gray-500 mb-1 block">Equipment</label>
                  <select value={editForm.equipment_access} onChange={(e) => setEditForm({...editForm, equipment_access: e.target.value as any})} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200">
                    <option value="full_gym">Full Gym</option>
                    <option value="home">Home Gym</option>
                    <option value="minimal">Minimal</option>
                  </select></div>
                <div><label className="text-xs text-gray-500 mb-1 block">Split</label>
                  <select value={editForm.split_preference} onChange={(e) => setEditForm({...editForm, split_preference: e.target.value as any})} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200">
                    <option value="auto">Auto</option>
                    <option value="ppl">Push/Pull/Legs</option>
                    <option value="upper_lower">Upper/Lower</option>
                    <option value="arnold">Arnold Split</option>
                    <option value="bro">Bro Split</option>
                    <option value="full_body">Full Body</option>
                  </select></div>
                <div><label className="text-xs text-gray-500 mb-1 block">Activity Level</label>
                  <select value={editForm.activity_level} onChange={(e) => setEditForm({...editForm, activity_level: e.target.value as any})} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200">
                    <option value="sedentary">Sedentary</option>
                    <option value="light">Light</option>
                    <option value="moderate">Moderate</option>
                    <option value="active">Active</option>
                  </select></div>
                <div><label className="text-xs text-gray-500 mb-1 block">Exercises/Session</label>
                  <input type="number" min={3} max={12} value={editForm.exercises_per_session} onChange={(e) => setEditForm({...editForm, exercises_per_session: parseInt(e.target.value)})} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200" /></div>
                <div><label className="text-xs text-gray-500 mb-1 block">Sets/Exercise</label>
                  <input type="number" min={2} max={8} value={editForm.sets_per_exercise} onChange={(e) => setEditForm({...editForm, sets_per_exercise: parseInt(e.target.value)})} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200" /></div>
              </div>
            </div>

            {/* Nutrition */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Nutrition</p>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500 mb-1 block">Diet Type</label>
                  <select value={editForm.dietary_preference} onChange={(e) => setEditForm({...editForm, dietary_preference: e.target.value as any})} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200">
                    <option value="omnivore">Omnivore</option>
                    <option value="vegetarian">Vegetarian</option>
                    <option value="vegan">Vegan</option>
                  </select></div>
                <div><label className="text-xs text-gray-500 mb-1 block">Meals/Day</label>
                  <input type="number" min={3} max={6} value={editForm.meal_count} onChange={(e) => setEditForm({...editForm, meal_count: parseInt(e.target.value)})} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200" /></div>
                <div><label className="text-xs text-gray-500 mb-1 block">Cook Time</label>
                  <select value={editForm.cooking_time_pref} onChange={(e) => setEditForm({...editForm, cooking_time_pref: e.target.value as any})} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200">
                    <option value="quick">Quick (&lt;15 min)</option>
                    <option value="medium">Medium (15–30 min)</option>
                    <option value="chef">Chef (30+ min)</option>
                  </select></div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 mb-1 block">Dietary Restrictions</label>
                  <div className="flex flex-wrap gap-1.5">
                    {(['Dairy-free', 'No pork', 'No shellfish', 'Nut allergy', 'Gluten-free', 'Low FODMAP'] as const).map((r) => {
                      const active = (editForm.dietary_restrictions as string[]).includes(r)
                      return (
                        <button
                          key={r}
                          type="button"
                          onClick={() => {
                            const prev = editForm.dietary_restrictions as string[]
                            setEditForm({ ...editForm, dietary_restrictions: active ? prev.filter(x => x !== r) : [...prev, r] })
                          }}
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
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 mb-1 block">Snacks</label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setEditForm({...editForm, include_snacks: true})} className={`flex-1 py-1.5 rounded-lg border text-xs transition-colors ${editForm.include_snacks ? 'bg-brand-600/20 border-brand-500 text-brand-400' : 'bg-gray-800 border-gray-700 text-gray-400'}`}>Include Snacks</button>
                    <button type="button" onClick={() => setEditForm({...editForm, include_snacks: false})} className={`flex-1 py-1.5 rounded-lg border text-xs transition-colors ${!editForm.include_snacks ? 'bg-brand-600/20 border-brand-500 text-brand-400' : 'bg-gray-800 border-gray-700 text-gray-400'}`}>Main Meals Only</button>
                  </div>
                </div>
              </div>
            </div>

            {/* Save buttons */}
            <p className="text-xs text-gray-600 pt-1">Changed weight, age, or body fat? Just save. Changed training days or diet type? Save &amp; regenerate.</p>
            <div className="flex gap-2">
              <button
                onClick={() => handleSaveProfile(false)}
                disabled={editSaving}
                title="Save profile data without regenerating training or nutrition plans"
                className="flex-1 py-2 rounded-xl border border-gray-700 text-sm text-gray-300 hover:border-gray-600 transition-colors disabled:opacity-50"
              >
                {editSaving ? 'Saving...' : editSaved ? '✓ Saved' : 'Save Only'}
              </button>
              <button
                onClick={() => handleSaveProfile(true)}
                disabled={editSaving}
                title="Save profile and rebuild your training and nutrition plans from scratch"
                className="flex-1 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold transition-colors disabled:opacity-50"
              >
                Save &amp; Regenerate Plans
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* Profile summary */}
      <Card title="Profile" subtitle="Your onboarding data">
        <div className="space-y-2">
          {[
            ['Name', user.name],
            ['Goal', user.goal],
            ['Division', user.division ?? '—'],
            ['Show Date', user.show_date ?? '—'],
            ['Weight', (() => { const w = displayWeight(user.weight_kg, settings.units); return `${w.value} ${w.unit}` })()],
            ['Height', displayHeight(user.height_cm, settings.units)],
            ['Training Days', `${user.training_frequency}/week`],
            ['Equipment', user.equipment_access.replace('_', ' ')],
            ['Diet Type', user.dietary_preference]
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between items-center py-1.5 border-b border-gray-800 last:border-0">
              <span className="text-sm text-gray-500">{label}</span>
              <span className="text-sm text-gray-200 capitalize">{value}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* AI Integration */}
      <Card title="AI Integration" subtitle="Optional — enhances plan generation with Claude AI">
        <div className="space-y-3">
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${(settings.claude_api_key ?? '') ? 'bg-green-500' : 'bg-gray-600'}`} />
            <span className="text-xs text-gray-500">
              {(settings.claude_api_key ?? '') ? 'Connected — AI generation active' : 'Not configured — rule-based generation'}
            </span>
          </div>
          <details className="text-xs">
            <summary className="cursor-pointer text-brand-400 hover:text-brand-300 select-none">How to get a Claude API key ›</summary>
            <ol className="mt-2 space-y-1 list-decimal list-inside text-gray-400">
              <li>Go to <button onClick={() => window.api.openExternal('https://console.anthropic.com')} className="text-brand-400 hover:text-brand-300 underline">console.anthropic.com</button></li>
              <li>Create an account or sign in</li>
              <li>Navigate to <strong>API Keys</strong> → <strong>Create Key</strong></li>
              <li>Copy the key starting with <code className="bg-gray-800 px-1 rounded font-mono">sk-ant-...</code></li>
              <li>Paste it below and click Save</li>
            </ol>
            <p className="mt-2 text-gray-600">Key is stored locally and only sent to Anthropic's API.</p>
          </details>
          <div className="flex gap-2">
            <input
              type="password"
              value={claudeKeyDraft}
              onChange={(e) => setClaudeKeyDraft(e.target.value)}
              placeholder="sk-ant-..."
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 font-mono"
            />
            <button
              onClick={() => {
                setSetting('claude_api_key' as keyof typeof settings, claudeKeyDraft)
                setClaudeKeySaved(true)
                setTimeout(() => setClaudeKeySaved(false), 2000)
              }}
              className="px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium transition-colors"
            >
              {claudeKeySaved ? '✓ Saved' : 'Save'}
            </button>
          </div>
        </div>
      </Card>

      {/* My Shows */}
      <Card title="My Shows" subtitle="Track multiple competitions and prep timelines">
        <div className="space-y-3">
          {/* Existing shows */}
          {shows.length === 0 && !showFormOpen && (
            <p className="text-sm text-gray-500">No shows added yet. Add your first competition below.</p>
          )}
          {shows.map((show: Show) => {
            const countdown = getShowCountdown(show.show_date)
            const isPrimary = show.is_primary === 1
            const isPast = countdown.totalDays === 0 && new Date(show.show_date + 'T12:00:00') < new Date()
            return (
              <div key={show.id} className={`border rounded-xl p-3 space-y-1 ${isPrimary ? 'border-brand-600/50 bg-brand-900/10' : 'border-gray-700'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-gray-200">{show.name}</p>
                      {isPrimary && <span className="text-xs bg-brand-600/30 text-brand-400 px-1.5 py-0.5 rounded">Primary</span>}
                      {isPast && <span className="text-xs text-gray-600">Past</span>}
                    </div>
                    <p className="text-xs text-gray-400">
                      {new Date(show.show_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}
                      {show.division && ` — ${show.division}`}
                      {show.federation && ` (${show.federation})`}
                    </p>
                    {!isPast && countdown.totalDays > 0 && (
                      <p className="text-xs text-brand-400 mt-0.5">
                        {countdown.weeks > 0 ? `${countdown.weeks} week${countdown.weeks !== 1 ? 's' : ''}` : ''}
                        {countdown.days > 0 ? ` ${countdown.days} day${countdown.days !== 1 ? 's' : ''}` : ''} out
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    {!isPast && (
                      <button
                        onClick={async () => {
                          const today = new Date().toLocaleDateString('en-CA')
                          const otherUpcoming = shows.filter(s => s.id !== show.id && s.show_date >= today)
                          const nextName = otherUpcoming.sort((a, b) => a.show_date.localeCompare(b.show_date))[0]?.name
                          const msg = nextName
                            ? `Cancel "${show.name}"? Your prep will transition to ${nextName}.`
                            : `Cancel "${show.name}"? You will enter off-season training.`
                          if (!confirm(msg)) return
                          try {
                            const result = await window.api.cancelShow(show.id) as any
                            if (user) {
                              await loadShows(user.id)
                              const freshUser = await window.api.getUser()
                              const { useUserStore: us } = await import('../../store/userStore')
                              if (freshUser) us.setState({ user: freshUser })
                              const training = await window.api.getTrainingPlan(user.id)
                              const { usePlanStore: ps } = await import('../../store/planStore')
                              if (result?.needs_goal_selection) {
                                ps.setState({ trainingPlan: training, lastRefreshMessage: result?.message ?? null })
                                setShowGoalPicker(true)
                              } else {
                                const diet = await window.api.getDietPlan(user.id)
                                ps.setState({ trainingPlan: training, dietPlan: diet, lastRefreshMessage: result?.message ?? null })
                              }
                            }
                          } catch (e) {
                            console.error('Failed to cancel show:', e)
                          }
                        }}
                        className="text-xs px-2 py-1 rounded bg-amber-900/20 border border-amber-800/40 text-amber-400 hover:bg-amber-900/40 transition-colors"
                      >
                        Cancel Show
                      </button>
                    )}
                    <button
                      onClick={async () => {
                        if (!confirm(`Delete "${show.name}"?`)) return
                        const result = await deleteShow(show.id)
                        if (result?.needs_goal_selection) setShowGoalPicker(true)
                      }}
                      className="text-xs px-2 py-1 rounded bg-red-900/20 border border-red-900/40 text-red-400 hover:bg-red-900/40 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            )
          })}

          {/* Add show form */}
          {showFormOpen ? (
            <div className="border border-gray-700 rounded-xl p-4 space-y-3 bg-gray-800/30">
              <p className="text-sm font-semibold text-gray-200">Add Competition</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 mb-1 block">Show Name</label>
                  <input
                    type="text"
                    value={showForm.name}
                    onChange={(e) => setShowForm({ ...showForm, name: e.target.value })}
                    placeholder="e.g. NPC Nationals 2026"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Show Date <span className="text-red-400">*</span></label>
                  <input
                    ref={showDateInputRef}
                    type="date"
                    value={showForm.show_date}
                    onChange={(e) => setShowForm({ ...showForm, show_date: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Division</label>
                  <input
                    type="text"
                    value={showForm.division}
                    onChange={(e) => setShowForm({ ...showForm, division: e.target.value })}
                    placeholder="e.g. Men's Physique"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Federation</label>
                  <input
                    type="text"
                    value={showForm.federation}
                    onChange={(e) => setShowForm({ ...showForm, federation: e.target.value })}
                    placeholder="e.g. NPC, IFBB, OCB"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Notes</label>
                  <input
                    type="text"
                    value={showForm.notes}
                    onChange={(e) => setShowForm({ ...showForm, notes: e.target.value })}
                    placeholder="Optional"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200"
                  />
                </div>
              </div>
              {showError && <p className="text-xs text-red-400">{showError}</p>}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={async () => {
                    if (!showForm.show_date) { setShowError('Show date is required'); return }
                    if (!user) return
                    setShowAdding(true); setShowError(null)
                    try {
                      const isFirst = shows.length === 0
                      await addShow(user.id, {
                        name: showForm.name || 'Competition',
                        show_date: showForm.show_date,
                        division: showForm.division || undefined,
                        federation: showForm.federation || undefined,
                        notes: showForm.notes || undefined,
                        is_primary: isFirst ? 1 : 0,
                      } as any)
                      setShowForm({ name: '', show_date: '', division: '', federation: '', notes: '' })
                      setShowFormOpen(false)
                    } catch (e) {
                      setShowError(String(e))
                    } finally {
                      setShowAdding(false)
                    }
                  }}
                  disabled={showAdding}
                  className="px-4 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium transition-colors disabled:opacity-40"
                >
                  {showAdding ? 'Adding...' : 'Add Show'}
                </button>
                <button
                  onClick={() => { setShowFormOpen(false); setShowError(null) }}
                  className="px-4 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-gray-200 text-sm transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowFormOpen(true)}
              className="w-full py-2 rounded-xl border border-dashed border-gray-700 text-gray-400 hover:border-brand-700 hover:text-brand-400 text-sm transition-colors"
            >
              + Add Competition
            </button>
          )}
        </div>
      </Card>

      {/* About */}
      <Card title="About PrepCoach">
        <div className="space-y-2 text-sm text-gray-400">
          <div className="flex justify-between">
            <span>Version</span>
            <Badge variant="default">1.0.0 MVP</Badge>
          </div>
          <div className="flex justify-between">
            <span>Database</span>
            <span className="text-gray-300">SQLite (local)</span>
          </div>
          <div className="flex justify-between">
            <span>Data location</span>
            <span className="text-gray-300">%AppData%\prepcoach-desktop</span>
          </div>
        </div>
        <div className="mt-4 bg-amber-900/10 border border-amber-800/30 rounded-lg p-3 text-xs text-amber-600">
          PrepCoach provides educational bodybuilding prep guidance only. It does not provide medical
          advice, diagnose conditions, or prescribe treatments. Always consult qualified professionals
          for medical, nutritional, and training decisions.
        </div>
      </Card>

      {/* Reset Data */}
      <Card title="Reset App Data">
        <p className="text-sm text-gray-400 mb-4">
          Permanently deletes your profile, plans, check-ins, workout logs, and all shows. App settings (theme, units, Claude key) are kept. Use this to restart onboarding.
        </p>
        <button
          onClick={async () => {
            const confirmed = window.confirm(
              'This will permanently delete ALL your data — profile, plans, check-ins, workouts, and shows.\n\nThis cannot be undone. Continue?'
            )
            if (!confirmed) return
            const confirmed2 = window.confirm('Are you absolutely sure? All data will be lost.')
            if (!confirmed2) return
            await resetAllData()
          }}
          className="px-4 py-2 rounded-lg bg-red-900/30 border border-red-800/50 text-red-400 hover:bg-red-900/50 text-sm font-medium transition-colors"
        >
          Reset All Data & Restart Onboarding
        </button>
      </Card>

      {user && (
        <GoalPickerModal
          open={showGoalPicker}
          userId={user.id}
          onClose={() => setShowGoalPicker(false)}
          onGoalSelected={async () => {
            setShowGoalPicker(false)
            const freshUser = await window.api.getUser()
            const { useUserStore: us } = await import('../../store/userStore')
            if (freshUser) us.setState({ user: freshUser })
            const diet = await window.api.getDietPlan(user.id)
            const { usePlanStore: ps } = await import('../../store/planStore')
            ps.setState({ dietPlan: diet })
          }}
        />
      )}
    </div>
  )
}
