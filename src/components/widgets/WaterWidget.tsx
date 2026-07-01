import { useState } from 'react'
import { useSettingsStore } from '../../store/settingsStore'
import { useWaterLog } from './useWaterLog'

export default function WaterWidget() {
  const { settings } = useSettingsStore()
  const { waterMl, waterTargetMl, addWater, setTarget } = useWaterLog(settings.units)
  const [editingWaterTarget, setEditingWaterTarget] = useState(false)
  const [waterTargetInput, setWaterTargetInput] = useState('')

  const isImp = settings.units === 'imperial'
  const waterPct = waterTargetMl > 0 ? Math.min(100, Math.round((waterMl / waterTargetMl) * 100)) : 0
  const displayCurrent = isImp
    ? `${Math.round(waterMl / 29.5735)} oz`
    : waterMl >= 1000 ? `${(waterMl / 1000).toFixed(1)} L` : `${waterMl} ml`
  const displayTarget = isImp
    ? `${Math.round(waterTargetMl / 29.5735)} oz`
    : waterTargetMl >= 1000 ? `${(waterTargetMl / 1000).toFixed(1)} L` : `${waterTargetMl} ml`
  const quickAdds = isImp
    ? [{ ml: 237, label: '8oz' }, { ml: 355, label: '12oz' }, { ml: 473, label: '16oz' }, { ml: 946, label: '32oz' }]
    : [{ ml: 200, label: '200ml' }, { ml: 350, label: '350ml' }, { ml: 500, label: '500ml' }, { ml: 750, label: '750ml' }]

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-100">Water Intake</h2>
        {!editingWaterTarget ? (
          <button
            onClick={() => {
              setWaterTargetInput(isImp ? String(Math.round(waterTargetMl / 29.5735)) : String(waterTargetMl))
              setEditingWaterTarget(true)
            }}
            className="text-xs text-gray-500 hover:text-brand-400 transition-colors"
          >
            Target: {displayTarget}
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              value={waterTargetInput}
              onChange={(e) => setWaterTargetInput(e.target.value)}
              className="w-20 bg-gray-800 border border-gray-700 rounded-lg px-2 py-0.5 text-xs text-gray-200 focus:outline-none focus:border-brand-500"
              autoFocus
            />
            <span className="text-xs text-gray-500">{isImp ? 'oz' : 'ml'}</span>
            <button
              onClick={() => {
                const v = parseInt(waterTargetInput, 10)
                if (!isNaN(v) && v > 0) setTarget(isImp ? Math.round(v * 29.5735) : v)
                setEditingWaterTarget(false)
              }}
              className="text-xs bg-brand-600 hover:bg-brand-500 text-white px-2 py-0.5 rounded-lg transition-colors"
            >
              Save
            </button>
            <button onClick={() => setEditingWaterTarget(false)} className="text-xs text-gray-500 hover:text-gray-400 transition-colors">✕</button>
          </div>
        )}
      </div>
      <div className="mb-3">
        <div className="flex justify-between items-end mb-1.5">
          <span className={`text-2xl font-bold ${waterPct >= 100 ? 'text-blue-400' : 'text-gray-100'}`}>{displayCurrent}</span>
          <span className="text-xs text-gray-500">{waterPct}% of goal</span>
        </div>
        <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
          <div className={`h-full transition-all duration-300 ${waterPct >= 100 ? 'bg-blue-400' : 'bg-blue-500'}`} style={{ width: `${waterPct}%` }} />
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {quickAdds.map(({ ml, label }) => (
          <button
            key={ml}
            onClick={() => addWater(ml)}
            className="text-xs font-medium px-2.5 py-1.5 bg-blue-900/20 border border-blue-800/40 text-blue-400 rounded-lg hover:bg-blue-900/40 transition-colors"
          >
            +{label}
          </button>
        ))}
        {waterMl > 0 && (
          <button
            onClick={() => { if (window.confirm('Reset today\'s water to zero?')) addWater(-waterMl) }}
            className="text-xs text-gray-600 hover:text-gray-400 ml-auto transition-colors"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  )
}
