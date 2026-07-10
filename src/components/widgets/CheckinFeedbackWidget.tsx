import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useUserStore } from '../../store/userStore'
import { usePlanStore } from '../../store/planStore'
import { useSettingsStore } from '../../store/settingsStore'
import Button from '../ui/Button'
import { displayWeight } from '../../utils/units'

export default function CheckinFeedbackWidget() {
  const { user } = useUserStore()
  const { latestCheckin } = usePlanStore()
  const { settings } = useSettingsStore()
  const [nextCheckinAt, setNextCheckinAt] = useState<Date | null>(null)

  useEffect(() => {
    if (!user) return
    let active = true
    window.api.getNextCheckinDate(user.id)
      .then((iso: string | null) => { if (active) setNextCheckinAt(iso ? new Date(iso) : null) })
      .catch(() => { if (active) setNextCheckinAt(null) })
    return () => { active = false }
  }, [user?.id, latestCheckin])

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <h2 className="font-semibold text-gray-100 mb-3">Check-In Feedback</h2>
      {(() => {
        const now = new Date()
        const isOpen = latestCheckin && (!nextCheckinAt || nextCheckinAt <= now)
        if (!latestCheckin || (!isOpen && !nextCheckinAt)) return null
        if (isOpen) {
          return (
            <Link to="/checkin" className="block mb-3">
              <div className="flex items-center gap-2 text-xs font-medium text-green-400 bg-green-900/20 border border-green-800/40 rounded-lg px-3 py-1.5 hover:border-green-700/60 transition-colors">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
                Check-in is open — log this week's weigh-in →
              </div>
            </Link>
          )
        }
        const msLeft = nextCheckinAt!.getTime() - now.getTime()
        const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24))
        return (
          <div className="mb-3 text-xs text-gray-500">
            Next check-in {daysLeft <= 1 ? 'opens tomorrow' : `opens in ${daysLeft} days`} · {nextCheckinAt!.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </div>
        )
      })()}
      {latestCheckin ? (
        <div className="space-y-2">
          <div className="flex gap-2 text-sm">
            <span className="text-gray-500">Week {latestCheckin.week_number}:</span>
            <span className="text-gray-300">
              {(() => { const w = displayWeight(latestCheckin.weight_kg, settings.units); return `${w.value} ${w.unit}` })()}
            </span>
          </div>
          <div className="space-y-1.5">
            {latestCheckin.adjustments.notes.map((note, i) => (
              <div key={i} className="flex gap-2 text-sm">
                <span className="text-brand-500 mt-0.5 flex-shrink-0">›</span>
                <span className="text-gray-400">{note}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="py-4 text-center space-y-2">
          <p className="text-gray-500 text-sm">No check-ins yet. Log your weight to start tracking progress.</p>
          <Link to="/checkin">
            <Button size="sm" variant="secondary">Log First Weigh-In →</Button>
          </Link>
        </div>
      )}
    </div>
  )
}
