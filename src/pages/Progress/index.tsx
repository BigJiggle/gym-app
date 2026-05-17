import { useEffect } from 'react'
import { useUserStore } from '../../store/userStore'
import { usePlanStore } from '../../store/planStore'
import { useSettingsStore } from '../../store/settingsStore'
import WeightChart from '../../components/charts/WeightChart'
import { StatCard } from '../../components/ui/Card'
import { displayWeight, displayLength, weightLabel, lengthLabel } from '../../utils/units'

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
          return (
            <StatCard
              label="Total Change"
              value={changeVal ? `${parseFloat(changeVal) > 0 ? '+' : ''}${changeVal}` : '—'}
              unit={wUnit}
              delta={weeksCompleted > 0 ? `over ${weeksCompleted} weeks` : 'no data yet'}
              color={changeVal && parseFloat(changeVal) < 0 ? 'green' : 'brand'}
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

      {/* Weight chart */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h2 className="font-semibold text-gray-100 mb-4">Weight Over Time</h2>
        <WeightChart entries={progressEntries} startWeight={user.weight_kg} units={settings.units} />
      </div>

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
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          <p className="text-gray-500">No progress data yet.</p>
          <p className="text-gray-600 text-sm mt-1">Submit weekly check-ins to start tracking your progress.</p>
        </div>
      )}
    </div>
  )
}
