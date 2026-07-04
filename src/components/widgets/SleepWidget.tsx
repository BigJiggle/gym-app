import { useState } from 'react'
import { sleepStore } from './competitionLogs'

const QUICK_HOURS = [5, 6, 7, 8]

function sleepColor(h: number) {
  return h >= 7 ? 'text-green-400' : h >= 6 ? 'text-yellow-400' : 'text-red-400'
}

export default function SleepWidget() {
  const sleepLog = sleepStore.useValue()
  const todayStr = new Date().toLocaleDateString('en-CA')
  const [inputOpen, setInputOpen] = useState(false)
  const [hoursInput, setHoursInput] = useState('')

  const todayEntry = sleepLog.find((e) => e.date === todayStr)
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    const dateStr = d.toLocaleDateString('en-CA')
    return { dateStr, label: d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1) + d.getDate(), entry: sleepLog.find((e) => e.date === dateStr) }
  })
  const recentWithData = last7.filter((d) => d.entry)
  const avgHours = recentWithData.length > 0
    ? Math.round(recentWithData.reduce((s, d) => s + d.entry!.hours, 0) / recentWithData.length * 10) / 10
    : null

  function logSleep() {
    const hours = parseFloat(hoursInput)
    if (isNaN(hours) || hours <= 0 || hours > 24) return
    sleepStore.set([...sleepLog.filter((e) => e.date !== todayStr), { date: todayStr, hours }])
    setInputOpen(false)
    setHoursInput('')
  }
  function quickLog(hours: number) {
    sleepStore.set([...sleepLog.filter((e) => e.date !== todayStr), { date: todayStr, hours }])
  }
  function removeToday() {
    sleepStore.set(sleepLog.filter((e) => e.date !== todayStr))
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-100">Sleep</h2>
        {avgHours !== null && (
          <span className={`text-xs font-medium ${sleepColor(avgHours)}`}>
            {avgHours}h avg (7 days)
          </span>
        )}
      </div>
      {todayEntry ? (
        <div className="flex items-center justify-between bg-indigo-950/20 border border-indigo-800/40 rounded-xl px-3 py-2.5 mb-3">
          <div>
            <span className={`font-semibold text-sm ${sleepColor(todayEntry.hours)}`}>{todayEntry.hours}h</span>
            <span className="text-gray-400 text-sm ml-2">last night</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setHoursInput(String(todayEntry.hours)); setInputOpen(true) }}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >Edit</button>
            <button onClick={removeToday} aria-label="Delete last night's sleep log" title="Delete" className="text-xs text-red-500 hover:text-red-400 transition-colors">✕</button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-500 mb-3">No sleep logged for last night.</p>
      )}
      {inputOpen ? (
        <div className="flex items-center gap-2 mb-3">
          <input
            type="number"
            min={1}
            max={12}
            step={0.5}
            value={hoursInput}
            onChange={(e) => setHoursInput(e.target.value)}
            placeholder="Hours"
            className="w-24 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-sm text-gray-100 focus:outline-none focus:border-indigo-500"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && logSleep()}
          />
          <span className="text-xs text-gray-500">hours</span>
          <button onClick={logSleep} className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1 rounded-lg transition-colors font-medium">Save</button>
          <button onClick={() => { setInputOpen(false); setHoursInput('') }} className="text-xs text-gray-500 hover:text-gray-400 transition-colors">Cancel</button>
        </div>
      ) : !todayEntry ? (
        <div className="space-y-2">
          <div className="flex gap-1.5 flex-wrap">
            {QUICK_HOURS.map((h) => (
              <button
                key={h}
                onClick={() => quickLog(h)}
                className="text-xs font-medium px-3 py-1.5 bg-gray-800 border border-gray-700 text-gray-400 hover:bg-indigo-900/20 hover:border-indigo-700 hover:text-indigo-400 rounded-lg transition-colors"
              >{h}h</button>
            ))}
            <button
              onClick={() => { setHoursInput(''); setInputOpen(true) }}
              className="text-xs font-medium px-3 py-1.5 bg-gray-800 border border-gray-700 text-gray-400 hover:bg-indigo-900/20 hover:border-indigo-700 hover:text-indigo-400 rounded-lg transition-colors"
            >Custom</button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => { setHoursInput(''); setInputOpen(true) }}
          className="w-full py-1.5 rounded-xl border border-dashed border-gray-700 text-gray-500 hover:border-indigo-700 hover:text-indigo-400 text-xs transition-colors"
        >
          + Log another night
        </button>
      )}
      <div className="flex gap-1 mt-3">
        {last7.map(({ dateStr, label, entry }) => {
          const isToday = dateStr === todayStr
          const h = entry?.hours
          return (
            <div
              key={dateStr}
              className={`flex-1 rounded-lg py-1.5 text-center ${isToday ? 'bg-indigo-900/20 border border-indigo-800/40' : 'bg-gray-800/60'}`}
            >
              <p className={`text-xs font-medium ${isToday ? 'text-indigo-400' : 'text-gray-600'}`}>{label}</p>
              {h !== undefined ? (
                <p className={`text-xs mt-0.5 font-medium ${sleepColor(h)}`}>{h}h</p>
              ) : (
                <p className="text-xs text-gray-700 mt-0.5">—</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
