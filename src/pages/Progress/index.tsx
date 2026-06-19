import { useEffect, useState, type ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import { useUserStore } from '../../store/userStore'
import { usePlanStore } from '../../store/planStore'
import { useSettingsStore } from '../../store/settingsStore'
import WeightChart from '../../components/charts/WeightChart'
import MeasurementsChart from '../../components/charts/MeasurementsChart'
import { StatCard } from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import { displayWeight, displayLength, weightLabel, lengthLabel } from '../../utils/units'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line, CartesianGrid, Legend } from 'recharts'
import type { CheckIn, ProgressPhoto } from '../../types'

function computeWeeklyRate(checkins: CheckIn[]): number | null {
  // Need at least 2 entries; checkins are newest-first
  const recentCheckins = checkins.slice(0, 4)
  if (recentCheckins.length < 2) return null
  const newest = recentCheckins[0]
  const oldest = recentCheckins[recentCheckins.length - 1]
  const daysDiff =
    (new Date(newest.check_in_date).getTime() - new Date(oldest.check_in_date).getTime()) /
    (1000 * 60 * 60 * 24)
  const weeksDiff = daysDiff / 7
  if (weeksDiff <= 0) return null
  return (newest.weight_kg - oldest.weight_kg) / weeksDiff
}

function computeEstimatedBF(weightKg: number, waistCm: number, sex: 'male' | 'female' | 'other'): number {
  const weightLbs = weightKg * 2.20462
  const waistIn = waistCm / 2.54
  const bf = sex === 'female'
    ? ((4.15 * waistIn - 0.082 * weightLbs - 76.76) / weightLbs) * 100
    : ((4.15 * waistIn - 0.082 * weightLbs - 98.42) / weightLbs) * 100
  return Math.round(Math.max(3, Math.min(60, bf)) * 10) / 10
}

function weeksUntil(dateStr: string): number | null {
  const show = new Date(dateStr + 'T12:00:00')
  const now = new Date()
  const weeks = (show.getTime() - now.getTime()) / (7 * 24 * 60 * 60 * 1000)
  return weeks > 0 ? Math.round(weeks * 10) / 10 : null
}

export default function Progress() {
  const { user } = useUserStore()
  const { settings, setSetting } = useSettingsStore()
  const { progressEntries, checkinHistory, loadProgressEntries, loadCheckinHistory, dietPlan } = usePlanStore()

  // 8-week diet consistency data
  interface WeekConsistency { week: string; pct: number; meals: number; target: number }
  const [dietConsistency, setDietConsistency] = useState<WeekConsistency[]>([])
  const [targetEditStr, setTargetEditStr] = useState('')
  const [editingTarget, setEditingTarget] = useState(false)
  const [photos, setPhotos] = useState<ProgressPhoto[]>([])
  const [selectedPose, setSelectedPose] = useState<ProgressPhoto['pose']>('front')

  useEffect(() => {
    if (!user?.id) return
    loadProgressEntries(user.id)
    loadCheckinHistory(user.id)
  }, [user?.id])

  useEffect(() => {
    if (!user?.id) return
    window.api.getProgressPhotos(user.id).then(setPhotos).catch(() => {})
  }, [user?.id])

  useEffect(() => {
    if (!user?.id || !dietPlan?.meals?.length) return
    const mealCount = dietPlan.meals.length
    const today = new Date()
    const jsDay = today.getDay()
    const daysFromMon = jsDay === 0 ? 6 : jsDay - 1
    const thisMonday = new Date(today.getTime() - daysFromMon * 86400000)
    thisMonday.setHours(0, 0, 0, 0)
    const startMonday = new Date(thisMonday.getTime() - 7 * 7 * 86400000)
    const startDate = startMonday.toLocaleDateString('en-CA')
    const endDate = today.toLocaleDateString('en-CA')
    window.api.getMealCompletions(user.id, startDate, endDate).then((completions) => {
      const weeks: WeekConsistency[] = []
      for (let off = -7; off <= 0; off++) {
        const weekMon = new Date(thisMonday.getTime() + off * 7 * 86400000)
        const weekSun = new Date(weekMon.getTime() + 6 * 86400000)
        const weekMonStr = weekMon.toLocaleDateString('en-CA')
        const weekSunStr = weekSun.toLocaleDateString('en-CA')
        const actualEnd = off === 0 ? endDate : weekSunStr
        const daysElapsed = off === 0 ? daysFromMon + 1 : 7
        const target = mealCount * daysElapsed
        const logged = completions.filter(c => c.date >= weekMonStr && c.date <= actualEnd).length
        const pct = target > 0 ? Math.min(100, Math.round((logged / target) * 100)) : 0
        const label = `${weekMon.getMonth() + 1}/${weekMon.getDate()}`
        weeks.push({ week: label, pct, meals: logged, target })
      }
      setDietConsistency(weeks)
    }).catch(() => {})
  }, [user?.id, dietPlan?.id])

  if (!user) return null

  async function handlePhotoFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !user) return
    const filePath = (file as unknown as { path?: string }).path
    if (!filePath) return
    try {
      const photo = await window.api.addProgressPhoto({ user_id: user.id, file_path: filePath, pose: selectedPose })
      setPhotos(prev => [photo, ...prev])
    } catch { /* non-fatal */ } finally {
      e.target.value = ''
    }
  }

  if (checkinHistory.length === 0) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-gray-100">Progress Tracking</h1>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-10 text-center space-y-3">
          <p className="text-gray-300 font-semibold">No check-ins yet</p>
          <p className="text-gray-500 text-sm">Complete your first weekly check-in to start tracking weight, measurements, and trends.</p>
          <Link to="/checkin">
            <button className="mt-2 px-6 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold transition-colors">
              Go to Check-In →
            </button>
          </Link>
        </div>
        <PhotosSection photos={photos} selectedPose={selectedPose} setSelectedPose={setSelectedPose} onFileChange={handlePhotoFile} />
      </div>
    )
  }

  const first = progressEntries[0]
  const latest = progressEntries[progressEntries.length - 1]
  const totalChange = progressEntries.length >= 2 ? (latest.weight_kg - first.weight_kg).toFixed(1) : null
  const weeksCompleted = checkinHistory.length
  // Actual elapsed weeks between oldest and newest check-in (more accurate than check-in count)
  const elapsedWeeks = checkinHistory.length >= 2
    ? Math.round(
        (new Date(checkinHistory[0].check_in_date).getTime() -
         new Date(checkinHistory[checkinHistory.length - 1].check_in_date).getTime()) /
        (7 * 24 * 60 * 60 * 1000) * 10
      ) / 10
    : null

  // Trend computation
  const weeklyRateKg = computeWeeklyRate(checkinHistory)
  const weeksToShow = user.show_date ? weeksUntil(user.show_date) : null
  const currentWeightKg = checkinHistory[0]?.weight_kg ?? user.weight_kg
  const projectedWeightKg =
    weeklyRateKg !== null && weeksToShow !== null
      ? currentWeightKg + weeklyRateKg * weeksToShow
      : null
  const targetKg = settings.target_weight_kg ? parseFloat(settings.target_weight_kg) : null
  const requiredRateKg =
    targetKg !== null && weeksToShow !== null && weeksToShow > 0
      ? (targetKg - currentWeightKg) / weeksToShow
      : null
  const isImperial = settings.units === 'imperial'
  const toDisplay = (kg: number) =>
    isImperial ? Math.round(kg * 2.20462 * 10) / 10 : Math.round(kg * 10) / 10
  const wUnit = weightLabel(settings.units)

  // Status badge for cuts: ideal loss is 0.4–1% BW/week
  type TrendStatus = 'on_track' | 'too_fast' | 'too_slow' | 'gaining' | 'neutral'
  function trendStatus(): TrendStatus {
    if (weeklyRateKg === null) return 'neutral'
    const pctPerWeek = Math.abs(weeklyRateKg) / currentWeightKg
    if (user!.goal === 'cut') {
      if (weeklyRateKg >= 0) return 'gaining'
      if (pctPerWeek > 0.012) return 'too_fast'
      if (pctPerWeek < 0.003) return 'too_slow'
      return 'on_track'
    }
    if (user!.goal === 'bulk') {
      if (weeklyRateKg <= 0) return 'too_slow'
      if (pctPerWeek > 0.01) return 'too_fast'
      return 'on_track'
    }
    return 'neutral'
  }
  const STATUS_LABEL: Record<TrendStatus, string> = {
    on_track: 'On Track',
    too_fast: user.goal === 'bulk' ? 'Gaining Too Fast' : 'Losing Too Fast',
    too_slow: user.goal === 'bulk' ? 'Not Gaining' : 'Losing Too Slow',
    gaining: 'Weight Trending Up',
    neutral: 'Tracking',
  }
  const STATUS_COLOR: Record<TrendStatus, string> = {
    on_track: 'text-green-400 bg-green-900/20 border-green-800/40',
    too_fast: 'text-red-400 bg-red-900/20 border-red-800/40',
    too_slow: 'text-amber-400 bg-amber-900/20 border-amber-800/40',
    gaining: 'text-red-400 bg-red-900/20 border-red-800/40',
    neutral: 'text-gray-400 bg-gray-800 border-gray-700',
  }
  const status = trendStatus()

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-100">Progress Tracking</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(() => {
          const sw = displayWeight(first?.weight_kg ?? user.weight_kg, settings.units)
          return <StatCard label="Starting Weight" value={sw.value} unit={sw.unit} color="brand" />
        })()}
        {(() => {
          const cw = displayWeight(latest?.weight_kg ?? user.weight_kg, settings.units)
          return <StatCard label="Current Weight" value={cw.value} unit={cw.unit} color="green" />
        })()}
        {(() => {
          const wUnit = weightLabel(settings.units)
          const changeVal = totalChange
            ? settings.units === 'imperial'
              ? (parseFloat(totalChange) / 0.453592).toFixed(1)
              : totalChange
            : null
          const isLoss = changeVal !== null && parseFloat(changeVal) < 0
          const isGain = changeVal !== null && parseFloat(changeVal) > 0
          return (
            <StatCard
              label={isLoss ? 'Lost' : isGain ? 'Gained' : 'Total Change'}
              value={changeVal ? `${isLoss ? '↓ ' : isGain ? '↑ ' : ''}${Math.abs(parseFloat(changeVal)).toFixed(1)}` : '—'}
              unit={changeVal ? wUnit : undefined}
              delta={elapsedWeeks !== null ? `over ${elapsedWeeks} week${elapsedWeeks === 1 ? '' : 's'}` : weeksCompleted > 0 ? `${weeksCompleted} check-in${weeksCompleted === 1 ? '' : 's'}` : 'no data yet'}
              color={isLoss ? 'green' : isGain ? 'brand' : 'brand'}
            />
          )
        })()}
        <StatCard
          label="Weeks Tracked"
          value={weeksCompleted}
          unit="weeks"
          color="blue"
        />
      </div>

      {/* Weight trend + show projection — shown when there are at least 2 check-ins */}
      {weeklyRateKg !== null && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-100">Weight Trend</h2>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${STATUS_COLOR[status]}`}>
              {STATUS_LABEL[status]}
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="bg-gray-800/60 rounded-xl p-3">
              <p className="text-xs text-gray-500 mb-1">Weekly Rate</p>
              <p className={`text-lg font-bold ${weeklyRateKg < 0 ? 'text-green-400' : weeklyRateKg > 0 ? 'text-amber-400' : 'text-gray-300'}`}>
                {weeklyRateKg > 0 ? '+' : ''}{toDisplay(weeklyRateKg)} {wUnit}/wk
              </p>
              <p className="text-xs text-gray-600 mt-0.5">avg last {Math.min(checkinHistory.length, 4)} check-ins</p>
            </div>
            {weeksToShow !== null ? (
              <>
                <div className="bg-gray-800/60 rounded-xl p-3">
                  <p className="text-xs text-gray-500 mb-1">Show Countdown</p>
                  <p className="text-lg font-bold text-brand-400">{Math.ceil(weeksToShow)} wks</p>
                  <p className="text-xs text-gray-600 mt-0.5">until show day</p>
                </div>
                {projectedWeightKg !== null && (
                  <div className="bg-gray-800/60 rounded-xl p-3 col-span-2 md:col-span-1">
                    <p className="text-xs text-gray-500 mb-1">Projected Show Weight</p>
                    <p className="text-lg font-bold text-gray-100">{toDisplay(projectedWeightKg)} {wUnit}</p>
                    <p className="text-xs text-gray-600 mt-0.5">at current rate</p>
                  </div>
                )}
              </>
            ) : (
              <div className="bg-gray-800/60 rounded-xl p-3 col-span-2 md:col-span-1">
                <p className="text-xs text-gray-500 mb-1">Show Date</p>
                <p className="text-sm text-gray-500 mt-1">Not set — add a show in Settings to see projection</p>
              </div>
            )}
          </div>
          {/* Target stage weight goal */}
          <div className="mt-3 border-t border-gray-800/50 pt-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 font-medium">Stage Weight Goal</span>
              {!editingTarget && (
                <button
                  onClick={() => {
                    setTargetEditStr(targetKg !== null ? String(toDisplay(targetKg)) : '')
                    setEditingTarget(true)
                  }}
                  className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
                >
                  {targetKg !== null ? 'Edit' : 'Set goal'}
                </button>
              )}
            </div>
            {editingTarget ? (
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="number"
                  value={targetEditStr}
                  onChange={e => setTargetEditStr(e.target.value)}
                  className="w-24 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-sm text-gray-100 focus:outline-none focus:border-brand-500"
                  placeholder={wUnit}
                  autoFocus
                />
                <span className="text-xs text-gray-500">{wUnit}</span>
                <button
                  onClick={() => {
                    const v = parseFloat(targetEditStr)
                    if (!isNaN(v) && v > 0) {
                      const kg = isImperial ? Math.round(v / 2.20462 * 100) / 100 : v
                      setSetting('target_weight_kg', String(kg))
                    }
                    setEditingTarget(false)
                  }}
                  className="text-xs bg-brand-600 hover:bg-brand-500 text-white px-2.5 py-1 rounded-lg transition-colors"
                >
                  Save
                </button>
                {targetKg !== null && (
                  <button
                    onClick={() => { setSetting('target_weight_kg', ''); setEditingTarget(false) }}
                    className="text-xs text-gray-500 hover:text-gray-400 transition-colors"
                  >
                    Clear
                  </button>
                )}
                <button
                  onClick={() => setEditingTarget(false)}
                  className="text-xs text-gray-500 hover:text-gray-400 transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : targetKg !== null ? (
              <div className="mt-1">
                <p className="text-lg font-bold text-gray-100">{toDisplay(targetKg)} {wUnit}</p>
                {requiredRateKg !== null && weeklyRateKg !== null && (
                  <p className={`text-xs mt-0.5 ${
                    (requiredRateKg < 0 ? weeklyRateKg <= requiredRateKg : weeklyRateKg >= requiredRateKg)
                      ? 'text-green-400'
                      : 'text-amber-400'
                  }`}>
                    Need {requiredRateKg > 0 ? '+' : ''}{toDisplay(requiredRateKg)} {wUnit}/wk · current {weeklyRateKg > 0 ? '+' : ''}{toDisplay(weeklyRateKg)} {wUnit}/wk
                  </p>
                )}
                {requiredRateKg !== null && weeklyRateKg === null && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    Need {requiredRateKg > 0 ? '+' : ''}{toDisplay(requiredRateKg)} {wUnit}/wk to reach goal
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-600 mt-1">Not set — click "Set goal" to track your target stage weight</p>
            )}
          </div>
          {user.goal === 'cut' && weeklyRateKg !== null && (
            <p className="text-xs text-gray-600 mt-3">
              Healthy cut rate: 0.4–1% bodyweight/week
              {' '}({toDisplay(currentWeightKg * 0.004)}–{toDisplay(currentWeightKg * 0.01)} {wUnit}/wk for your current weight)
            </p>
          )}
        </div>
      )}

      {/* Measurement changes — instant snapshot of first→latest delta for each tracked site */}
      {checkinHistory.length >= 2 && (() => {
        const oldest = checkinHistory[checkinHistory.length - 1]
        const newest = checkinHistory[0]
        type MeasurementKey = 'waist_cm' | 'chest_cm' | 'hip_cm' | 'arm_cm' | 'thigh_cm'
        const fields: { label: string; key: MeasurementKey }[] = [
          { label: 'Waist', key: 'waist_cm' },
          { label: 'Chest', key: 'chest_cm' },
          { label: 'Hip', key: 'hip_cm' },
          { label: 'Arm', key: 'arm_cm' },
          { label: 'Thigh', key: 'thigh_cm' },
        ]
        const tracked = fields.filter(f => oldest[f.key] != null && newest[f.key] != null)
        if (tracked.length === 0) return null
        const mUnit = isImperial ? 'in' : 'cm'
        const toMDisplay = (cm: number) => isImperial ? Math.round(cm / 2.54 * 10) / 10 : Math.round(cm * 10) / 10
        const daysBetween = (new Date(newest.check_in_date).getTime() - new Date(oldest.check_in_date).getTime()) / (1000 * 60 * 60 * 24)
        const weeksBetween = daysBetween / 7
        return (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-100">Measurement Changes</h2>
              <span className="text-xs text-gray-500">Wk {oldest.week_number} → Wk {newest.week_number}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {tracked.map(({ label, key }) => {
                const oldVal = toMDisplay(oldest[key]!)
                const newVal = toMDisplay(newest[key]!)
                const delta = Math.round((newVal - oldVal) * 10) / 10
                const color = delta < 0 ? 'text-green-400' : delta > 0 ? 'text-amber-400' : 'text-gray-500'
                const arrow = delta < 0 ? '↓' : delta > 0 ? '↑' : '→'
                const weeklyRate = weeksBetween >= 1 ? Math.round((newVal - oldVal) / weeksBetween * 10) / 10 : null
                return (
                  <div key={label} className="bg-gray-800/50 rounded-xl p-3 text-center">
                    <p className="text-xs text-gray-500 mb-1">{label}</p>
                    <p className="text-base font-bold text-gray-100">{newVal}{mUnit}</p>
                    <p className={`text-xs font-semibold mt-0.5 ${color}`}>
                      {arrow} {Math.abs(delta).toFixed(1)}{mUnit}
                    </p>
                    <p className="text-xs text-gray-600 mt-0.5">{oldVal} → {newVal}</p>
                    {weeklyRate !== null && weeklyRate !== 0 && (
                      <p className={`text-xs mt-1 font-medium ${weeklyRate < 0 ? 'text-green-500/70' : 'text-amber-500/70'}`}>
                        {weeklyRate > 0 ? '+' : ''}{weeklyRate.toFixed(1)}{mUnit}/wk
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* Body composition estimate — shown when ≥1 check-in has waist measurement */}
      {(() => {
        const withWaist = [...checkinHistory].reverse().filter(c => c.waist_cm != null)
        if (withWaist.length === 0) return null
        const bfEntries = withWaist.map(c => {
          const bf = computeEstimatedBF(c.weight_kg, c.waist_cm!, user!.sex)
          const lbmKg = Math.round(c.weight_kg * (1 - bf / 100) * 10) / 10
          const fatKg = Math.round(c.weight_kg * (bf / 100) * 10) / 10
          return {
            label: `Wk ${c.week_number}`,
            bf,
            lbm: isImperial ? Math.round(lbmKg * 2.20462 * 10) / 10 : lbmKg,
            fat: isImperial ? Math.round(fatKg * 2.20462 * 10) / 10 : fatKg,
          }
        })
        const latest = bfEntries[bfEntries.length - 1]
        const bfChange = bfEntries.length >= 2 ? Math.round((latest.bf - bfEntries[0].bf) * 10) / 10 : null
        const lbmChange = bfEntries.length >= 2 ? Math.round((latest.lbm - bfEntries[0].lbm) * 10) / 10 : null
        return (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-semibold text-gray-100">Body Composition</h2>
              <span className="text-xs text-gray-600">YMCA estimate · directional only</span>
            </div>
            <p className="text-xs text-gray-600 mb-4">Estimated from waist and weight. Useful for tracking direction, not absolute accuracy.</p>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-gray-800/60 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500 mb-1">Est. Body Fat</p>
                <p className="text-xl font-bold text-brand-400">{latest.bf}%</p>
                {bfChange !== null && (
                  <p className={`text-xs font-semibold mt-0.5 ${bfChange < 0 ? 'text-green-400' : bfChange > 0 ? 'text-amber-400' : 'text-gray-500'}`}>
                    {bfChange > 0 ? '+' : ''}{bfChange}% since start
                  </p>
                )}
              </div>
              <div className="bg-gray-800/60 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500 mb-1">Lean Mass</p>
                <p className="text-xl font-bold text-green-400">{latest.lbm} {wUnit}</p>
                {lbmChange !== null && (
                  <p className={`text-xs font-semibold mt-0.5 ${lbmChange > 0 ? 'text-green-400' : lbmChange < 0 ? 'text-amber-400' : 'text-gray-500'}`}>
                    {lbmChange > 0 ? '+' : ''}{lbmChange} {wUnit}
                  </p>
                )}
              </div>
              <div className="bg-gray-800/60 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500 mb-1">Fat Mass</p>
                <p className="text-xl font-bold text-gray-300">{latest.fat} {wUnit}</p>
              </div>
            </div>
            {bfEntries.length >= 2 && (
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={bfEntries} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={{ stroke: '#374151' }} tickLine={false} />
                  <YAxis domain={['auto', 'auto']} tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={{ stroke: '#374151' }} tickLine={false} tickFormatter={(v: number) => `${v}%`} />
                  <Tooltip
                    formatter={(val: number) => [`${val}%`, 'Est. BF%']}
                    contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', fontSize: '12px' }}
                    labelStyle={{ color: '#9ca3af' }}
                  />
                  <Line type="monotone" dataKey="bf" stroke="#7c3aed" strokeWidth={2} dot={{ r: 3, fill: '#7c3aed', strokeWidth: 0 }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        )
      })()}

      {/* Weight chart — only rendered when there is data; empty state below handles the no-data case */}
      {progressEntries.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h2 className="font-semibold text-gray-100 mb-4">Weight Over Time</h2>
          <WeightChart
            entries={progressEntries}
            startWeight={user.weight_kg}
            units={settings.units}
            projectedWeightKg={projectedWeightKg ?? undefined}
            weeksToShow={weeksToShow}
          />
        </div>
      )}

      {/* 8-week diet consistency chart — shown when there is any logged meal data */}
      {dietConsistency.some(d => d.meals > 0) && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-100">8-Week Diet Consistency</h2>
            {(() => {
              const streak = [...dietConsistency].reverse().findIndex(d => d.pct < 80)
              const streakCount = streak === -1 ? dietConsistency.length : streak
              return streakCount >= 2 ? (
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-green-900/30 text-green-400 border border-green-800/40">
                  {streakCount}-wk streak
                </span>
              ) : null
            })()}
          </div>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={dietConsistency} margin={{ top: 0, right: 0, left: -28, bottom: 0 }}>
              <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v}%`} />
              <Tooltip
                formatter={(val: number, _: string, entry: { payload?: WeekConsistency }) =>
                  [`${val}% (${entry.payload?.meals ?? '?'}/${entry.payload?.target ?? '?'} meals)`, 'Diet adherence']
                }
                contentStyle={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, fontSize: 11 }}
                labelStyle={{ color: '#9ca3af' }}
                cursor={{ fill: '#1f2937' }}
              />
              <Bar dataKey="pct" radius={[3, 3, 0, 0]} maxBarSize={36}>
                {dietConsistency.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.pct >= 80 ? '#22c55e' : entry.pct >= 50 ? '#7c3aed' : entry.pct > 0 ? '#ef4444' : '#374151'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-600">
            <span><span className="text-green-400">■</span> ≥80% on track</span>
            <span><span className="text-brand-400">■</span> 50–79% moderate</span>
            <span><span className="text-red-400">■</span> &lt;50% missed</span>
          </div>
        </div>
      )}

      {/* Measurements trend chart — only shown when ≥2 check-ins have any measurement data */}
      {checkinHistory.length >= 2 && checkinHistory.some(c =>
        c.waist_cm != null || c.chest_cm != null || c.hip_cm != null || c.arm_cm != null || c.thigh_cm != null
      ) && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h2 className="font-semibold text-gray-100 mb-4">Measurements Over Time</h2>
          <MeasurementsChart checkins={checkinHistory} units={settings.units} />
        </div>
      )}

      {/* Measurement history */}
      {checkinHistory.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h2 className="font-semibold text-gray-100 mb-3">Measurement History</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-800">
                  <th className="text-left pb-2 pr-4">Week</th>
                  <th className="text-right pb-2 px-2">Weight ({weightLabel(settings.units)})</th>
                  <th className="text-right pb-2 px-2">Waist ({lengthLabel(settings.units)})</th>
                  <th className="text-right pb-2 px-2">Chest ({lengthLabel(settings.units)})</th>
                  <th className="text-right pb-2 px-2">Hip ({lengthLabel(settings.units)})</th>
                  <th className="text-right pb-2 px-2">Arm ({lengthLabel(settings.units)})</th>
                  <th className="text-right pb-2 pl-2">Thigh ({lengthLabel(settings.units)})</th>
                </tr>
              </thead>
              <tbody>
                {[...checkinHistory].reverse().map((c) => (
                  <tr key={c.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="py-2 pr-4 text-gray-400">
                      Wk {c.week_number}
                      <span className="text-xs text-gray-600 ml-2">{c.check_in_date}</span>
                    </td>
                    {[
                      c.weight_kg != null ? displayWeight(c.weight_kg, settings.units).value : null,
                      c.waist_cm != null ? displayLength(c.waist_cm, settings.units).value : null,
                      c.chest_cm != null ? displayLength(c.chest_cm, settings.units).value : null,
                      c.hip_cm != null ? displayLength(c.hip_cm, settings.units).value : null,
                      c.arm_cm != null ? displayLength(c.arm_cm, settings.units).value : null,
                      c.thigh_cm != null ? displayLength(c.thigh_cm, settings.units).value : null,
                    ].map((val, i) => (
                      <td key={i} className="py-2 px-2 text-right text-gray-300">
                        {val != null ? val : <span className="text-gray-700">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Weekly adherence */}
      {checkinHistory.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h2 className="font-semibold text-gray-100 mb-3">Weekly Adherence</h2>
          <div className="space-y-2">
            {[...checkinHistory].slice(0, 8).reverse().map((c) => (
              <div key={c.id} className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-12">Wk {c.week_number}</span>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-600 w-16">Training</span>
                    <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand-500 rounded-full"
                        style={{ width: `${c.training_adherence}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-400 w-8 text-right">{c.training_adherence}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-600 w-16">Diet</span>
                    <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 rounded-full"
                        style={{ width: `${c.diet_adherence}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-400 w-8 text-right">{c.diet_adherence}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Wellness trends — energy, sleep, stress over time */}
      {checkinHistory.length >= 2 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold text-gray-100">Wellness Trends</h2>
            <span className="text-xs text-gray-600">1 = low · 5 = high</span>
          </div>
          <p className="text-xs text-gray-600 mb-4">Energy and sleep higher is better. Stress lower is better.</p>
          {(() => {
            const wellnessData = [...checkinHistory].reverse().map((c) => ({
              label: `Wk ${c.week_number}`,
              energy: c.energy_level,
              sleep: c.sleep_quality,
              stress: c.stress_level,
            }))
            const latest = checkinHistory[0]
            const avgEnergy = Math.round(checkinHistory.reduce((a, c) => a + c.energy_level, 0) / checkinHistory.length * 10) / 10
            const avgSleep = Math.round(checkinHistory.reduce((a, c) => a + c.sleep_quality, 0) / checkinHistory.length * 10) / 10
            const avgStress = Math.round(checkinHistory.reduce((a, c) => a + c.stress_level, 0) / checkinHistory.length * 10) / 10
            return (
              <>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className="bg-gray-800/60 rounded-xl p-3 text-center">
                    <p className="text-xs text-gray-500 mb-1">Energy</p>
                    <p className={`text-lg font-bold ${latest.energy_level >= 4 ? 'text-green-400' : latest.energy_level <= 2 ? 'text-red-400' : 'text-yellow-400'}`}>
                      {latest.energy_level}/5
                    </p>
                    <p className="text-xs text-gray-600 mt-0.5">avg {avgEnergy}</p>
                  </div>
                  <div className="bg-gray-800/60 rounded-xl p-3 text-center">
                    <p className="text-xs text-gray-500 mb-1">Sleep</p>
                    <p className={`text-lg font-bold ${latest.sleep_quality >= 4 ? 'text-blue-400' : latest.sleep_quality <= 2 ? 'text-red-400' : 'text-yellow-400'}`}>
                      {latest.sleep_quality}/5
                    </p>
                    <p className="text-xs text-gray-600 mt-0.5">avg {avgSleep}</p>
                  </div>
                  <div className="bg-gray-800/60 rounded-xl p-3 text-center">
                    <p className="text-xs text-gray-500 mb-1">Stress</p>
                    <p className={`text-lg font-bold ${latest.stress_level <= 2 ? 'text-green-400' : latest.stress_level >= 4 ? 'text-red-400' : 'text-yellow-400'}`}>
                      {latest.stress_level}/5
                    </p>
                    <p className="text-xs text-gray-600 mt-0.5">avg {avgStress}</p>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={wellnessData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={{ stroke: '#374151' }} tickLine={false} />
                    <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={{ stroke: '#374151' }} tickLine={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', fontSize: '12px' }}
                      labelStyle={{ color: '#9ca3af' }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                    <Line type="monotone" dataKey="energy" name="Energy" stroke="#4ade80" strokeWidth={2} dot={{ r: 3, fill: '#4ade80', strokeWidth: 0 }} activeDot={{ r: 5 }} />
                    <Line type="monotone" dataKey="sleep" name="Sleep" stroke="#60a5fa" strokeWidth={2} dot={{ r: 3, fill: '#60a5fa', strokeWidth: 0 }} activeDot={{ r: 5 }} />
                    <Line type="monotone" dataKey="stress" name="Stress" stroke="#f87171" strokeWidth={2} dot={{ r: 3, fill: '#f87171', strokeWidth: 0 }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </>
            )
          })()}
        </div>
      )}

      <PhotosSection photos={photos} selectedPose={selectedPose} setSelectedPose={setSelectedPose} onFileChange={handlePhotoFile} />
    </div>
  )
}

interface PhotosSectionProps {
  photos: ProgressPhoto[]
  selectedPose: ProgressPhoto['pose']
  setSelectedPose: (p: ProgressPhoto['pose']) => void
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void
}

function PhotosSection({ photos, selectedPose, setSelectedPose, onFileChange }: PhotosSectionProps) {
  const POSES: ProgressPhoto['pose'][] = ['front', 'back', 'side', 'custom']
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-100">Progress Photos</h2>
        <div className="flex items-center gap-2">
          <select
            value={selectedPose}
            onChange={e => setSelectedPose(e.target.value as ProgressPhoto['pose'])}
            className="text-xs bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-gray-300 focus:outline-none focus:border-brand-500"
          >
            {POSES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
          </select>
          <label className="cursor-pointer text-xs font-medium px-3 py-1.5 bg-brand-900/30 border border-brand-700/50 text-brand-400 rounded-lg hover:bg-brand-900/50 transition-colors">
            + Add Photo
            <input type="file" accept="image/*" className="hidden" onChange={onFileChange} />
          </label>
        </div>
      </div>
      {photos.length === 0 ? (
        <p className="text-sm text-gray-600 text-center py-6">No photos yet — add your first to start tracking visual progress.</p>
      ) : (
        <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
          {photos.map(photo => (
            <div key={photo.id} className="relative rounded-lg overflow-hidden bg-gray-800 aspect-[3/4]">
              <img
                src={`file://${photo.file_path}`}
                alt={`${photo.pose} pose`}
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1.5">
                <p className="text-xs font-medium text-white capitalize">{photo.pose}</p>
                <p className="text-xs text-gray-400">
                  {new Date(photo.taken_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
