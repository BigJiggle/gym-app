import { Link } from 'react-router-dom'
import { useUserStore } from '../../store/userStore'
import { usePlanStore } from '../../store/planStore'
import { useSettingsStore } from '../../store/settingsStore'
import { localDateStr } from '../../utils/dates'
import { computeWeeklyWeightRate } from '../../utils/weeklyRate'

export default function PrepPaceWidget() {
  const { user, shows } = useUserStore()
  const { checkinHistory } = usePlanStore()
  const { settings } = useSettingsStore()
  if (!user || checkinHistory.length < 2) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Prep Pace</p>
        <p className="text-sm text-gray-600">Log at least 2 check-ins to see your weekly pace.</p>
      </div>
    )
  }
  const todayStr = localDateStr()
  const nearestShow = [...shows].filter(s => s.show_date >= todayStr).sort((a, b) => a.show_date.localeCompare(b.show_date))[0]

  const isImperial = settings.units === 'imperial'
  const wUnit = isImperial ? 'lbs' : 'kg'
  const weeklyRateKg = computeWeeklyWeightRate(checkinHistory, 4)
  if (weeklyRateKg === null) return null
  const weeklyRateDisplay = isImperial ? Math.round(weeklyRateKg * 2.20462 * 10) / 10 : Math.round(weeklyRateKg * 10) / 10
  const currentWeightKg = checkinHistory[0].weight_kg
  const pctPerWeek = currentWeightKg > 0 ? Math.abs(weeklyRateKg) / currentWeightKg : 0
  type Status = 'on_track' | 'too_fast' | 'too_slow' | 'gaining' | 'neutral'
  let status: Status = 'neutral'
  if (user.goal === 'cut') {
    if (weeklyRateKg >= 0) status = 'gaining'
    else if (pctPerWeek > 0.012) status = 'too_fast'
    else if (pctPerWeek < 0.003) status = 'too_slow'
    else status = 'on_track'
  } else if (user.goal === 'bulk') {
    if (weeklyRateKg <= 0) status = 'too_slow'
    else if (pctPerWeek > 0.01) status = 'too_fast'
    else status = 'on_track'
  }
  const STATUS_LABEL: Record<Status, string> = {
    on_track: 'On Track',
    too_fast: user.goal === 'bulk' ? 'Gaining Too Fast' : 'Losing Too Fast',
    too_slow: user.goal === 'bulk' ? 'Not Gaining' : 'Losing Too Slow',
    gaining: 'Weight Trending Up',
    neutral: 'Tracking',
  }
  const STATUS_COLOR: Record<Status, string> = {
    on_track: 'text-green-400 bg-green-900/20 border-green-800/40',
    too_fast: 'text-red-400 bg-red-900/20 border-red-800/40',
    too_slow: 'text-amber-400 bg-amber-900/20 border-amber-800/40',
    gaining: 'text-red-400 bg-red-900/20 border-red-800/40',
    neutral: 'text-gray-400 bg-gray-800 border-gray-700',
  }
  return (
    <Link to="/progress" className="block">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between hover:border-gray-700 transition-colors">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Prep Pace</p>
          <p className={`text-lg font-bold ${
            user.goal === 'bulk'
              ? (weeklyRateKg > 0 ? 'text-green-400' : weeklyRateKg < 0 ? 'text-amber-400' : 'text-gray-300')
              : (weeklyRateKg < 0 ? 'text-green-400' : weeklyRateKg > 0 ? 'text-amber-400' : 'text-gray-300')
          }`}>
            {weeklyRateDisplay > 0 ? '+' : ''}{weeklyRateDisplay} {wUnit}/wk
          </p>
          <p className="text-xs text-gray-600 mt-0.5">avg last {Math.min(checkinHistory.length, 4)} check-ins · click for full chart</p>
          {(user.goal === 'cut' || user.goal === 'bulk') && (() => {
            const minKg = user.goal === 'cut' ? currentWeightKg * 0.003 : currentWeightKg * 0.002
            const maxKg = user.goal === 'cut' ? currentWeightKg * 0.012 : currentWeightKg * 0.010
            const fmt = (kg: number) => isImperial ? `${Math.round(kg * 2.20462 * 10) / 10}` : `${Math.round(kg * 10) / 10}`
            const showDateStr = nearestShow?.show_date
            const weeksToShow = showDateStr ? Math.max(0, (new Date(showDateStr + 'T12:00:00').getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 7)) : null
            const projectedKg = weeksToShow !== null ? currentWeightKg + weeklyRateKg * weeksToShow : null
            const targetKg = settings.target_weight_kg ? parseFloat(settings.target_weight_kg as string) : null
            return (
              <>
                <p className="text-xs text-gray-700 mt-0.5">
                  Target: {user.goal === 'cut' ? `-${fmt(maxKg)}–-${fmt(minKg)}` : `+${fmt(minKg)}–+${fmt(maxKg)}`} {wUnit}/wk
                </p>
                {projectedKg !== null && weeksToShow !== null && weeksToShow > 0 && (
                  <p className="text-xs mt-1">
                    <span className="text-gray-500">Show day ({Math.round(weeksToShow)}w): </span>
                    <span className="font-semibold text-gray-300">~{fmt(projectedKg)} {wUnit}</span>
                    {targetKg !== null && (
                      <span className={`ml-1.5 font-medium ${
                        Math.abs(projectedKg - targetKg) < 0.5
                          ? 'text-green-400'
                          : (user.goal === 'cut' ? projectedKg > targetKg : projectedKg < targetKg)
                            ? 'text-amber-400'
                            : 'text-green-400'
                      }`}>
                        {Math.abs(projectedKg - targetKg) < 0.5
                          ? '✓ on target'
                          : `(${fmt(Math.abs(projectedKg - targetKg))} ${wUnit} ${user.goal === 'cut' ? (projectedKg > targetKg ? 'above' : 'below') : (projectedKg < targetKg ? 'below' : 'above')} target)`}
                      </span>
                    )}
                  </p>
                )}
              </>
            )
          })()}
        </div>
        <span className={`text-xs font-medium px-3 py-1.5 rounded-full border ${STATUS_COLOR[status]}`}>
          {STATUS_LABEL[status]}
        </span>
      </div>
    </Link>
  )
}
