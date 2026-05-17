import { useEffect, useState } from 'react'
import Modal from './ui/Modal'

interface Props {
  open: boolean
  userId: number
  onClose: () => void
  onGoalSelected: (goal: string) => void
}

const GOALS = [
  {
    value: 'bulk',
    label: 'Bulk',
    sub: 'Off-season muscle build',
    description: 'Lean calorie surplus to maximise muscle growth while minimising fat gain.',
    color: 'green',
  },
  {
    value: 'maintain',
    label: 'Maintain',
    sub: 'Hold current condition',
    description: 'Eat at maintenance to preserve muscle and body composition.',
    color: 'blue',
  },
  {
    value: 'cut',
    label: 'Cut',
    sub: 'Reduce body fat',
    description: 'Calorie deficit to strip body fat while keeping as much muscle as possible.',
    color: 'orange',
  },
  {
    value: 'recomp',
    label: 'Recomp',
    sub: 'Lose fat, build muscle',
    description: 'Moderate deficit to slowly improve body composition simultaneously.',
    color: 'purple',
  },
] as const

const COLOR_MAP = {
  green:  { border: 'border-green-500',  bg: 'bg-green-500/10',  text: 'text-green-400',  badge: 'bg-green-500/20 text-green-300' },
  blue:   { border: 'border-blue-500',   bg: 'bg-blue-500/10',   text: 'text-blue-400',   badge: 'bg-blue-500/20 text-blue-300' },
  orange: { border: 'border-orange-500', bg: 'bg-orange-500/10', text: 'text-orange-400', badge: 'bg-orange-500/20 text-orange-300' },
  purple: { border: 'border-purple-500', bg: 'bg-purple-500/10', text: 'text-purple-400', badge: 'bg-purple-500/20 text-purple-300' },
}

export default function GoalPickerModal({ open, userId, onClose, onGoalSelected }: Props) {
  const [calories, setCalories] = useState<Record<string, number> | null>(null)
  const [selecting, setSelecting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setCalories(null)
    setError(null)
    window.api.previewGoalCalories(userId)
      .then((data: Record<string, number>) => setCalories(data))
      .catch(() => setError('Could not load calorie preview.'))
  }, [open, userId])

  async function handleSelect(goal: string) {
    setSelecting(goal)
    try {
      await window.api.selectOffSeasonGoal(userId, goal)
      onGoalSelected(goal)
    } catch {
      setError('Failed to update goal. Please try again.')
      setSelecting(null)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="What's your off-season goal?" maxWidth="max-w-xl">
      <p className="text-sm text-gray-400 mb-5">
        Your show has been cancelled. Choose your goal and we'll set your nutrition accordingly.
      </p>

      {error && (
        <p className="text-sm text-red-400 mb-4">{error}</p>
      )}

      <div className="grid grid-cols-2 gap-3">
        {GOALS.map((g) => {
          const c = COLOR_MAP[g.color]
          const isSelecting = selecting === g.value
          const disabled = selecting !== null

          return (
            <button
              key={g.value}
              onClick={() => !disabled && handleSelect(g.value)}
              disabled={disabled}
              className={`text-left rounded-xl border p-4 transition-all ${
                isSelecting
                  ? `${c.border} ${c.bg}`
                  : disabled
                  ? 'border-gray-700 bg-gray-800/40 opacity-50 cursor-not-allowed'
                  : `border-gray-700 bg-gray-800 hover:${c.border} hover:${c.bg} cursor-pointer`
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`text-sm font-semibold ${c.text}`}>{g.label}</span>
                {calories?.[g.value] && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.badge}`}>
                    ~{calories[g.value].toLocaleString()} kcal
                  </span>
                )}
              </div>
              <p className="text-xs font-medium text-gray-300 mb-1">{g.sub}</p>
              <p className="text-xs text-gray-500 leading-relaxed">{g.description}</p>
              {isSelecting && (
                <p className="text-xs mt-2 text-gray-400">Updating...</p>
              )}
            </button>
          )
        })}
      </div>

      <p className="text-xs text-gray-600 mt-4 text-center">
        You can change your goal anytime in Settings.
      </p>
    </Modal>
  )
}
