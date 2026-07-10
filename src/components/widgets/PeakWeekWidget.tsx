import { Link } from 'react-router-dom'
import { useUserStore } from '../../store/userStore'
import { getShowCountdown } from '../../utils/dates'
import { PEAK_WEEK_PROTOCOL } from '../../data/competitionPrep'

// Peak-week daily protocol — only meaningful in the 7 days before a show, so it's
// registered competitionOnly and self-hides (returns null) outside that window.
export default function PeakWeekWidget() {
  const { user } = useUserStore()
  const showCountdown = user?.show_date ? getShowCountdown(user.show_date) : null
  if (showCountdown === null || showCountdown.totalDays < 0 || showCountdown.totalDays > 7) return null

  const daysOut = Math.max(1, showCountdown.totalDays)
  const todayProtocol = PEAK_WEEK_PROTOCOL.days.find(d => d.daysOut === daysOut)
  if (!todayProtocol) return null
  const isShowDay = showCountdown.totalDays === 0
  return (
    <div className="bg-red-950/20 border border-red-700/50 rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="text-xs font-bold text-red-400 uppercase tracking-wider">
            {isShowDay ? 'SHOW DAY!' : `PEAK WEEK · ${showCountdown.totalDays} day${showCountdown.totalDays !== 1 ? 's' : ''} out`}
          </span>
          <p className="text-sm font-semibold text-gray-100 mt-0.5">{todayProtocol.label}</p>
        </div>
        <Link to="/education" className="text-xs text-red-400 hover:text-red-300 flex-shrink-0 mt-0.5 transition-colors">
          Full protocol →
        </Link>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-gray-900/80 rounded-lg p-2.5">
          <p className="text-gray-500 font-semibold uppercase mb-1" style={{ fontSize: 10 }}>Water</p>
          <p className="text-xs text-blue-400 font-medium leading-snug">{todayProtocol.water}</p>
        </div>
        <div className="bg-gray-900/80 rounded-lg p-2.5">
          <p className="text-gray-500 font-semibold uppercase mb-1" style={{ fontSize: 10 }}>Sodium</p>
          <p className="text-xs text-amber-400 font-medium leading-snug">{todayProtocol.sodium.split(':')[0]}</p>
        </div>
        <div className="bg-gray-900/80 rounded-lg p-2.5">
          <p className="text-gray-500 font-semibold uppercase mb-1" style={{ fontSize: 10 }}>Training</p>
          <p className="text-xs text-green-400 font-medium leading-snug">{todayProtocol.training.split(':')[0].split('.')[0]}</p>
        </div>
      </div>
      <div className="bg-gray-900/60 rounded-lg px-3 py-2.5">
        <p className="text-gray-500 font-semibold uppercase mb-1.5" style={{ fontSize: 10 }}>Nutrition Today</p>
        <p className="text-xs text-gray-300 leading-snug">{todayProtocol.nutrition}</p>
      </div>
      {todayProtocol.notes.length > 0 && (
        <div className="space-y-1.5">
          {todayProtocol.notes.slice(0, 3).map((note, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <span className="text-red-500 flex-shrink-0 text-xs mt-0.5">›</span>
              <span className="text-xs text-gray-400 leading-snug">{note}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
