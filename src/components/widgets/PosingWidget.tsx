import { useState } from 'react'
import { posingStore } from './competitionLogs'

const POSING_FOCUSES = ['Full Routine', 'Quarter Turns', 'Front Double', 'Side Poses', 'Symmetry Round', 'Mandatory Poses']
const QUICK_PRESETS: [string, number][] = [['Full Routine', 15], ['Full Routine', 20], ['Quarter Turns', 15], ['Mandatory Poses', 20]]

function presetLabel(f: string, m: number) {
  const short = f === 'Full Routine' ? 'Full' : f === 'Quarter Turns' ? 'QT' : 'Mandatory'
  return `${short} ${m}m`
}

export default function PosingWidget() {
  const posingLog = posingStore.useValue()
  const todayStr = new Date().toLocaleDateString('en-CA')
  const [inputOpen, setInputOpen] = useState(false)
  const [focus, setFocus] = useState('Full Routine')
  const [minutes, setMinutes] = useState('')

  const jsDay = new Date().getDay()
  const daysFromMon = jsDay === 0 ? 6 : jsDay - 1
  const weekStart = new Date(Date.now() - daysFromMon * 86400000).toLocaleDateString('en-CA')
  const weekEntries = posingLog.filter((e) => e.date >= weekStart && e.date <= todayStr)
  const todayEntry = posingLog.find((e) => e.date === todayStr)
  const weekMins = weekEntries.reduce((s, e) => s + e.minutes, 0)

  function logPosing() {
    const mins = parseInt(minutes, 10)
    if (!focus || isNaN(mins) || mins <= 0) return
    posingStore.set([...posingLog.filter((e) => e.date !== todayStr), { date: todayStr, focus, minutes: mins }])
    setInputOpen(false)
    setMinutes('')
  }
  function quickLog(f: string, m: number) {
    posingStore.set([...posingLog.filter((e) => e.date !== todayStr), { date: todayStr, focus: f, minutes: m }])
  }
  function removeToday() {
    posingStore.set(posingLog.filter((e) => e.date !== todayStr))
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-100">Posing Practice</h2>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>{weekEntries.length} session{weekEntries.length !== 1 ? 's' : ''} this week</span>
          {weekMins > 0 && <span>· {weekMins} min</span>}
        </div>
      </div>
      {todayEntry ? (
        <div className="flex items-center justify-between bg-purple-950/20 border border-purple-800/40 rounded-xl px-3 py-2.5 mb-3">
          <div>
            <span className="text-purple-400 font-semibold text-sm">{todayEntry.focus}</span>
            <span className="text-gray-400 text-sm ml-2">{todayEntry.minutes} min</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setFocus(todayEntry.focus); setMinutes(String(todayEntry.minutes)); setInputOpen(true) }}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >Edit</button>
            <button onClick={removeToday} aria-label="Delete today's posing session" title="Delete" className="text-xs text-red-500 hover:text-red-400 transition-colors">✕</button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-500 mb-3">No posing logged today.</p>
      )}
      {inputOpen ? (
        <div className="space-y-2">
          <div className="flex gap-1.5 flex-wrap">
            {POSING_FOCUSES.map((f) => (
              <button
                key={f}
                onClick={() => setFocus(f)}
                className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${focus === f ? 'bg-purple-600/20 border-purple-500 text-purple-400' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'}`}
              >{f}</button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={120}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              placeholder="Minutes"
              className="w-24 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-sm text-gray-100 focus:outline-none focus:border-purple-500"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && logPosing()}
            />
            <span className="text-xs text-gray-500">min</span>
            <button onClick={logPosing} className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-1 rounded-lg transition-colors font-medium">Save</button>
            <button onClick={() => { setInputOpen(false); setMinutes('') }} className="text-xs text-gray-500 hover:text-gray-400 transition-colors">Cancel</button>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {QUICK_PRESETS.map(([f, m]) => (
              <button
                key={`${f}-${m}`}
                onClick={() => { quickLog(f, m); setInputOpen(false); setMinutes('') }}
                className="text-xs px-2 py-1 bg-gray-800 border border-gray-700 rounded-lg text-gray-400 hover:border-purple-700 hover:text-purple-400 transition-colors"
              >{presetLabel(f, m)}</button>
            ))}
          </div>
        </div>
      ) : !todayEntry ? (
        <div className="space-y-2">
          <div className="flex gap-1.5 flex-wrap">
            {QUICK_PRESETS.map(([f, m]) => (
              <button
                key={`${f}-${m}`}
                onClick={() => quickLog(f, m)}
                className="text-xs font-medium px-3 py-1.5 bg-gray-800 border border-gray-700 text-gray-400 hover:bg-purple-900/20 hover:border-purple-700 hover:text-purple-400 rounded-lg transition-colors"
              >{presetLabel(f, m)}</button>
            ))}
          </div>
          <button
            onClick={() => { setFocus('Full Routine'); setMinutes(''); setInputOpen(true) }}
            className="w-full py-1.5 rounded-xl border border-dashed border-gray-700 text-gray-500 hover:border-purple-700 hover:text-purple-400 text-xs transition-colors"
          >
            + Custom duration
          </button>
        </div>
      ) : (
        <button
          onClick={() => { setFocus('Full Routine'); setMinutes(''); setInputOpen(true) }}
          className="w-full py-2 rounded-xl border border-dashed border-gray-700 text-gray-500 hover:border-purple-700 hover:text-purple-400 text-sm transition-colors"
        >
          + Log another posing session
        </button>
      )}
    </div>
  )
}
