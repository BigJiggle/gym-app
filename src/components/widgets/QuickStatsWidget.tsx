import { useUserStore } from '../../store/userStore'
import { usePlanStore } from '../../store/planStore'
import { useSettingsStore } from '../../store/settingsStore'
import { StatCard } from '../ui/Card'
import { getShowCountdown } from '../../utils/dates'
import { displayWeight } from '../../utils/units'

export default function QuickStatsWidget() {
  const { user } = useUserStore()
  const { settings } = useSettingsStore()
  const { dietPlan, trainingPlan, latestCheckin } = usePlanStore()
  if (!user) return null
  const showCountdown = user.show_date ? getShowCountdown(user.show_date) : null
  const wt = displayWeight(latestCheckin?.weight_kg ?? user.weight_kg, settings.units)

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <StatCard
        label="Current Weight"
        value={wt.value}
        unit={wt.unit}
        delta={latestCheckin ? `Week ${latestCheckin.week_number}` : 'Starting weight'}
        color="brand"
      />
      <StatCard
        label="Daily Calories"
        value={dietPlan?.calories_target ?? '—'}
        unit="kcal"
        delta={`${dietPlan?.protein_g ?? '—'}g protein`}
        color="green"
      />
      {showCountdown !== null ? (
        <StatCard
          label="Show Countdown"
          value={(() => {
            const { weeks, days, totalDays } = showCountdown
            if (totalDays === 0) return 'Show Day!'
            if (weeks === 0) return `${days} day${days !== 1 ? 's' : ''}`
            if (days === 0) return `${weeks} week${weeks !== 1 ? 's' : ''}`
            return `${weeks} week${weeks !== 1 ? 's' : ''} ${days} day${days !== 1 ? 's' : ''}`
          })()}
          unit={showCountdown.totalDays > 0 ? 'out' : ''}
          delta={user.division ?? 'competition'}
          color="blue"
        />
      ) : (
        <StatCard label="Phase" value={trainingPlan?.phase ?? '—'} delta="current training phase" color="blue" />
      )}
      <StatCard
        label="Training Days"
        value={user.training_frequency}
        unit="/ week"
        delta={trainingPlan?.name?.split('—')[0]?.trim() ?? '—'}
        color="brand"
      />
    </div>
  )
}
