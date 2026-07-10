import { usePlanStore } from '../../store/planStore'
import { useSettingsStore } from '../../store/settingsStore'
import { displayWeight } from '../../utils/units'

export default function RecentCheckinsWidget() {
  const { checkinHistory } = usePlanStore()
  const { settings } = useSettingsStore()
  if (checkinHistory.length < 2) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Recent Check-Ins</p>
        <p className="text-sm text-gray-600">Log a couple of check-ins to see your history.</p>
      </div>
    )
  }
  const recent = checkinHistory.slice(0, 4)
  const avgTraining = Math.round(recent.reduce((s, c) => s + c.training_adherence, 0) / recent.length)
  const avgDiet = Math.round(recent.reduce((s, c) => s + c.diet_adherence, 0) / recent.length)
  function adherenceColor(pct: number) {
    return pct >= 85 ? 'text-green-400' : pct >= 70 ? 'text-yellow-400' : 'text-red-400'
  }
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Recent Check-Ins</p>
        <div className="flex items-center gap-3 text-xs">
          <span className={`font-medium ${adherenceColor(avgTraining)}`}>{avgTraining}% training avg</span>
          <span className={`font-medium ${adherenceColor(avgDiet)}`}>{avgDiet}% diet avg</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-600 border-b border-gray-800">
              <th className="text-left pb-1.5 font-medium">Week</th>
              <th className="text-right pb-1.5 font-medium">Weight</th>
              <th className="text-right pb-1.5 font-medium">Training</th>
              <th className="text-right pb-1.5 font-medium">Diet</th>
              <th className="text-right pb-1.5 font-medium">Adj.</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((c, i) => {
              const wt = displayWeight(c.weight_kg, settings.units)
              const delta = c.adjustments?.calories_delta ?? 0
              return (
                <tr key={c.id} className={i === 0 ? 'text-gray-200' : 'text-gray-500'}>
                  <td className="py-1.5 pr-2">Wk {c.week_number}</td>
                  <td className="py-1.5 text-right font-medium">{wt.value} {wt.unit}</td>
                  <td className={`py-1.5 text-right font-medium ${adherenceColor(c.training_adherence)}`}>{c.training_adherence}%</td>
                  <td className={`py-1.5 text-right font-medium ${adherenceColor(c.diet_adherence)}`}>{c.diet_adherence}%</td>
                  <td className={`py-1.5 text-right font-medium ${delta === 0 ? 'text-gray-600' : delta < 0 ? 'text-green-400' : 'text-amber-400'}`}>
                    {delta === 0 ? '—' : `${delta > 0 ? '+' : ''}${delta}`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-700 mt-2">Adj. = weekly calorie adjustment applied after each check-in</p>
    </div>
  )
}
