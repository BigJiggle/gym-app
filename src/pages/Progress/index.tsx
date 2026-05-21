import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useUserStore } from '../../store/userStore'
import { usePlanStore } from '../../store/planStore'
import { useSettingsStore } from '../../store/settingsStore'
import WeightChart from '../../components/charts/WeightChart'
import MeasurementsChart from '../../components/charts/MeasurementsChart'
import { StatCard } from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import { displayWeight, displayLength, weightLabel, lengthLabel } from '../../utils/units'
import type { CheckIn } from '../../types'

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

function weeksUntil(dateStr: string): number | null {
  const show = new Date(dateStr + 'T12:00:00')
  const now = new Date()
  const weeks = (show.getTime() - now.getTime()) / (7 * 24 * 60 * 60 * 1000)
  return weeks > 0 ? Math.round(weeks * 10) / 10 : null
}

export default function Progress() {
  const { user } = useUserStore()
  const { settings } = useSettingsStore()
  const { progressEntries, checkinHistory, loadProgressEntries, loadCheckinHistory } = usePlanStore()

  useEffect(() => {
    if (!user?.id) return
    loadProgressEntries(user.id)
    loadCheckinHistory(user.id)
  }, [user?.id])

  if (!user) return null

  const first = progressEntries[0]
  const latest = progressEntries[progressEntries.length - 1]
  const totalChange = first && latest ? (latest.weight_kg - first.weight_kg).toFixed(1) : null
  const weeksCompleted = checkinHistory.length

  // Trend computation
  const weeklyRateKg = computeWeeklyRate(checkinHistory)
  const weeksToShow = user.show_date ? weeksUntil(user.show_date) : null
  const currentWeightKg = checkinHistory[0]?.weight_kg ?? user.weight_kg
  const projectedWeightKg =
    weeklyRateKg !== null && weeksToShow !== null
      ? currentWeightKg + weeklyRateKg * weeksToShow
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
    if (user.goal === 'cut') {
      if (weeklyRateKg >= 0) return 'gaining'
      if (pctPerWeek > 0.012) return 'too_fast'
      if (pctPerWeek < 0.003) return 'too_slow'
      return 'on_track'
    }
    if (user.goal === 'bulk') {
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
              delta={weeksCompleted > 0 ? `over ${weeksCompleted} weeks` : 'no data yet'}
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
                return (
                  <div key={label} className="bg-gray-800/50 rounded-xl p-3 text-center">
                    <p className="text-xs text-gray-500 mb-1">{label}</p>
                    <p className="text-base font-bold text-gray-100">{newVal}{mUnit}</p>
                    <p className={`text-xs font-semibold mt-0.5 ${color}`}>
                      {arrow} {Math.abs(delta).toFixed(1)}{mUnit}
                    </p>
                    <p className="text-xs text-gray-600 mt-0.5">{oldVal} → {newVal}</p>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* Weight chart — only rendered when there is data; empty state below handles the no-data case */}
      {progressEntries.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h2 className="font-semibold text-gray-100 mb-4">Weight Over Time</h2>
          <WeightChart entries={progressEntries} startWeight={user.weight_kg} units={settings.units} />
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

      {checkinHistory.length === 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center space-y-3">
          <p className="text-gray-400 font-medium">No progress data yet.</p>
          <p className="text-gray-600 text-sm">Your weight chart appears here after your first weekly check-in.</p>
          <Link to="/checkin">
            <Button>Do First Check-In</Button>
          </Link>
        </div>
      )}
    </div>
  )
}
