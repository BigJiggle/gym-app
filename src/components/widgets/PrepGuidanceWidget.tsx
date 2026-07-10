import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useUserStore } from '../../store/userStore'
import { localDateStr } from '../../utils/dates'
import { buildPrepTimeline } from '../../data/competitionPrep'

// "This Week in Prep" guidance — only meaningful with an upcoming show, so it's
// registered competitionOnly and self-hides otherwise.
export default function PrepGuidanceWidget() {
  const { shows } = useUserStore()
  const todayStr = localDateStr()
  const nearestShow = [...shows].filter(s => s.show_date >= todayStr).sort((a, b) => a.show_date.localeCompare(b.show_date))[0]
  const currentPrepWeek = nearestShow ? buildPrepTimeline(nearestShow.show_date).find(w => w.isCurrentWeek) ?? null : null
  const milestoneStorageKey = nearestShow && currentPrepWeek ? `milestones_${nearestShow.id}_${currentPrepWeek.weeksOut}` : null

  const [checkedMilestones, setCheckedMilestones] = useState<boolean[]>([])
  useEffect(() => {
    if (!milestoneStorageKey) { setCheckedMilestones([]); return }
    try {
      const stored = JSON.parse(localStorage.getItem(milestoneStorageKey) ?? '[]')
      setCheckedMilestones(Array.isArray(stored) ? stored : [])
    } catch { setCheckedMilestones([]) }
  }, [milestoneStorageKey])

  function toggleMilestone(index: number) {
    if (!milestoneStorageKey) return
    const next = [...checkedMilestones]
    next[index] = !next[index]
    setCheckedMilestones(next)
    localStorage.setItem(milestoneStorageKey, JSON.stringify(next))
  }

  if (!nearestShow || !currentPrepWeek) return null
  const { guidance } = currentPrepWeek
  const PHASE_BADGE: Record<string, string> = {
    green:  'bg-green-900/30 text-green-400 border-green-800/50',
    brand:  'bg-brand-900/30 text-brand-400 border-brand-800/50',
    blue:   'bg-blue-900/30 text-blue-400 border-blue-800/50',
    yellow: 'bg-yellow-900/20 text-yellow-400 border-yellow-800/50',
    orange: 'bg-orange-900/20 text-orange-400 border-orange-800/50',
    red:    'bg-red-900/20 text-red-400 border-red-800/50',
  }
  return (
    <Link to="/education" className="block">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-gray-500 uppercase tracking-wider">This Week in Prep</p>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${PHASE_BADGE[guidance.phaseColor]}`}>
            {guidance.phase}
          </span>
        </div>
        <p className="text-sm text-gray-300 mb-3 leading-snug">{guidance.focus}</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs mb-3">
          <div className="bg-gray-800/60 rounded-lg px-3 py-2">
            <p className="text-gray-500 mb-1 font-semibold uppercase tracking-wide" style={{ fontSize: 10 }}>Training</p>
            <p className="text-gray-300 leading-snug">{guidance.training[0]}</p>
          </div>
          <div className="bg-gray-800/60 rounded-lg px-3 py-2">
            <p className="text-gray-500 mb-1 font-semibold uppercase tracking-wide" style={{ fontSize: 10 }}>Nutrition</p>
            <p className="text-gray-300 leading-snug">{guidance.nutrition[0]}</p>
          </div>
          <div className="bg-gray-800/60 rounded-lg px-3 py-2">
            <p className="text-gray-500 mb-1 font-semibold uppercase tracking-wide" style={{ fontSize: 10 }}>Cardio</p>
            <p className="text-gray-300 leading-snug">{guidance.cardio}</p>
          </div>
        </div>
        {guidance.milestones.length > 0 && (
          <div className="border-t border-gray-800 pt-2">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs text-gray-600">This week's milestones</p>
              {checkedMilestones.filter(Boolean).length > 0 && (
                <p className="text-xs text-gray-600">
                  {checkedMilestones.filter(Boolean).length}/{guidance.milestones.length} done
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1">
              {guidance.milestones.map((m, i) => {
                const checked = !!checkedMilestones[i]
                return (
                  <div
                    key={i}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleMilestone(i) }}
                    className="flex items-start gap-1.5 text-xs cursor-pointer group"
                  >
                    <span className={checked ? 'text-green-500' : 'text-gray-700 group-hover:text-gray-500'}>
                      {checked ? '☑' : '□'}
                    </span>
                    <span className={checked ? 'text-gray-600 line-through' : 'text-gray-400 group-hover:text-gray-300'}>
                      {m}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
        <p className="text-xs text-brand-500 mt-2">View full prep timeline →</p>
      </div>
    </Link>
  )
}
