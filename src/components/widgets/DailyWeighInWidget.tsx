import { useState } from 'react'
import { useSettingsStore } from '../../store/settingsStore'
import { localDateStr } from '../../utils/dates'

interface DailyWeightEntry { date: string; weight_kg: number }

export default function DailyWeighInWidget() {
  const { settings } = useSettingsStore()
  const todayStr = localDateStr()
  const [dailyWeightLog, setDailyWeightLog] = useState<DailyWeightEntry[]>(() => {
    // Guard against valid-JSON-but-wrong-shape storage (hand-edited / corrupted:
    // `null`, `{}`, `5`, …) — it parses without throwing, so try/catch alone
    // won't catch it, and .find()/.filter() on a non-array crashes the widget.
    try {
      const parsed = JSON.parse(localStorage.getItem('daily_weight_log') ?? '[]')
      return Array.isArray(parsed) ? parsed : []
    } catch { return [] }
  })
  const [dailyWeightInput, setDailyWeightInput] = useState('')
  const [dailyWeightEditing, setDailyWeightEditing] = useState(false)

  function logDailyWeight() {
    const isImp = settings.units === 'imperial'
    const raw = parseFloat(dailyWeightInput)
    if (isNaN(raw) || raw <= 0) return
    const weight_kg = isImp ? Math.round((raw / 2.20462) * 1000) / 1000 : raw
    const updated = [...dailyWeightLog.filter(e => e.date !== todayStr), { date: todayStr, weight_kg }]
    setDailyWeightLog(updated)
    localStorage.setItem('daily_weight_log', JSON.stringify(updated))
    setDailyWeightInput('')
    setDailyWeightEditing(false)
  }

  const isImp = settings.units === 'imperial'
  const wUnit = isImp ? 'lbs' : 'kg'
  const toDisplay = (kg: number) => isImp ? Math.round(kg * 2.20462 * 10) / 10 : Math.round(kg * 10) / 10
  const todayEntry = dailyWeightLog.find(e => e.date === todayStr)
  const last7 = (Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - i)
    return dailyWeightLog.find(e => e.date === d.toLocaleDateString('en-CA')) ?? null
  }).filter(Boolean)) as DailyWeightEntry[]
  const avg7 = last7.length >= 2 ? last7.reduce((s, e) => s + e.weight_kg, 0) / last7.length : null
  const prev7 = (Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - 7 - i)
    return dailyWeightLog.find(e => e.date === d.toLocaleDateString('en-CA')) ?? null
  }).filter(Boolean)) as DailyWeightEntry[]
  const avgPrev7 = prev7.length >= 2 ? prev7.reduce((s, e) => s + e.weight_kg, 0) / prev7.length : null
  const weeklyChange = avg7 !== null && avgPrev7 !== null ? avg7 - avgPrev7 : null

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-100">Daily Weigh-In</h2>
        {avg7 !== null && (
          <div className="text-right">
            <p className="text-xs text-gray-500">7-day avg</p>
            <div className="flex items-center gap-1.5 justify-end">
              <span className="text-sm font-bold text-gray-200">{toDisplay(avg7)} {wUnit}</span>
              {weeklyChange !== null && (
                <span className={`text-xs font-medium ${Math.abs(weeklyChange) < 0.05 ? 'text-gray-500' : weeklyChange < 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {weeklyChange > 0 ? '+' : ''}{isImp ? Math.round(weeklyChange * 2.20462 * 10) / 10 : Math.round(weeklyChange * 10) / 10}/wk
                </span>
              )}
            </div>
          </div>
        )}
      </div>
      {(todayEntry && !dailyWeightEditing) ? (
        <div className="flex items-center justify-between bg-gray-800/50 rounded-xl px-3 py-2.5 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-green-400 text-sm">✓</span>
            <span className="text-gray-100 font-semibold">{toDisplay(todayEntry.weight_kg)} {wUnit}</span>
            <span className="text-xs text-gray-500">today</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { setDailyWeightInput(String(toDisplay(todayEntry.weight_kg))); setDailyWeightEditing(true) }} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">Edit</button>
            <button onClick={() => { const next = dailyWeightLog.filter(e => e.date !== todayStr); setDailyWeightLog(next); localStorage.setItem('daily_weight_log', JSON.stringify(next)) }} className="text-xs text-red-500 hover:text-red-400 transition-colors" aria-label="Delete today's weigh-in">✕</button>
          </div>
        </div>
      ) : (
        <div className="mb-3">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={isImp ? 66 : 30}
              max={isImp ? 660 : 300}
              step={0.1}
              value={dailyWeightInput}
              onChange={e => setDailyWeightInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') logDailyWeight() }}
              placeholder={isImp ? 'lbs' : 'kg'}
              className="w-28 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-brand-500"
            />
            <span className="text-xs text-gray-500">{wUnit}</span>
            <button
              onClick={logDailyWeight}
              disabled={!dailyWeightInput.trim()}
              className="px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-medium transition-colors disabled:opacity-40"
            >Save</button>
            {dailyWeightEditing && (
              <button onClick={() => { setDailyWeightEditing(false); setDailyWeightInput('') }} className="text-xs text-gray-500 hover:text-gray-400 transition-colors">Cancel</button>
            )}
          </div>
          <p className="text-xs text-gray-600 mt-1.5">Log fasted morning weight — 7-day avg smooths daily fluctuations</p>
        </div>
      )}
      {last7.length >= 3 && (
        <div className="border-t border-gray-800 pt-2.5">
          <div className="flex gap-1 flex-wrap">
            {[...last7].reverse().map((e, i) => (
              <div key={i} className={`text-center px-2 py-1 rounded-lg text-xs ${e.date === todayStr ? 'bg-brand-900/30 border border-brand-700/50' : 'bg-gray-800'}`}>
                <p className={`font-medium ${e.date === todayStr ? 'text-brand-300' : 'text-gray-300'}`}>{toDisplay(e.weight_kg)}</p>
                <p className="text-gray-600" style={{ fontSize: 10 }}>{e.date.slice(5)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
