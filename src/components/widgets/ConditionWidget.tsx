import { useState } from 'react'
import { conditionStore } from './competitionLogs'

const CONDITION_TAGS = ['Full', 'Flat', 'Dry', 'Watery', 'Tight', 'Vascular', 'Bloated', 'Smooth']
const TAG_STYLE: Record<string, string> = {
  Full:    'text-green-400 bg-green-900/20 border-green-700/50',
  Flat:    'text-amber-400 bg-amber-900/20 border-amber-700/50',
  Dry:     'text-blue-400 bg-blue-900/20 border-blue-700/50',
  Watery:  'text-cyan-400 bg-cyan-900/20 border-cyan-700/50',
  Tight:   'text-green-400 bg-green-900/20 border-green-700/50',
  Vascular:'text-red-400 bg-red-900/20 border-red-700/50',
  Bloated: 'text-orange-400 bg-orange-900/20 border-orange-700/50',
  Smooth:  'text-gray-400 bg-gray-800 border-gray-600',
}

export default function ConditionWidget() {
  const conditionLog = conditionStore.useValue()
  const todayStr = new Date().toLocaleDateString('en-CA')
  const [inputOpen, setInputOpen] = useState(false)
  const [note, setNote] = useState('')

  const todayEntry = conditionLog.find((e) => e.date === todayStr)
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    const dateStr = d.toLocaleDateString('en-CA')
    return {
      dateStr,
      label: d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1) + d.getDate(),
      entry: conditionLog.find((e) => e.date === dateStr),
    }
  })

  function toggleTag(tag: string) {
    const existing = conditionLog.find((e) => e.date === todayStr) ?? { date: todayStr, tags: [], note: '' }
    const tags = existing.tags.includes(tag)
      ? existing.tags.filter((t) => t !== tag)
      : [...existing.tags, tag]
    conditionStore.set([...conditionLog.filter((e) => e.date !== todayStr), { ...existing, tags }])
  }
  function saveNote() {
    const existing = conditionLog.find((e) => e.date === todayStr) ?? { date: todayStr, tags: [], note: '' }
    conditionStore.set([...conditionLog.filter((e) => e.date !== todayStr), { ...existing, note }])
    setInputOpen(false)
    setNote('')
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-100">Daily Condition</h2>
        <span className="text-xs text-gray-600">how do you look today?</span>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {CONDITION_TAGS.map((tag) => {
          const selected = todayEntry?.tags.includes(tag)
          return (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                selected ? TAG_STYLE[tag] : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
              }`}
            >
              {tag}
            </button>
          )
        })}
      </div>
      {inputOpen ? (
        <div className="flex items-center gap-2 mb-3">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveNote()}
            placeholder="e.g. great separation, looking full after refeed..."
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-brand-500"
            autoFocus
          />
          <button onClick={saveNote} className="text-xs bg-brand-600 hover:bg-brand-500 text-white px-3 py-1.5 rounded-lg transition-colors font-medium">Save</button>
          <button onClick={() => setInputOpen(false)} className="text-xs text-gray-500 hover:text-gray-400 transition-colors">✕</button>
        </div>
      ) : (
        <button
          onClick={() => { setNote(todayEntry?.note ?? ''); setInputOpen(true) }}
          className="w-full mb-3 py-1.5 rounded-xl border border-dashed border-gray-700 text-gray-500 hover:border-brand-700 hover:text-brand-400 text-xs transition-colors"
        >
          {todayEntry?.note ? `"${todayEntry.note}"` : '+ Add condition note'}
        </button>
      )}
      <div className="flex gap-1">
        {last7.map(({ dateStr, label, entry }) => {
          const isToday = dateStr === todayStr
          const hasTags = (entry?.tags.length ?? 0) > 0
          return (
            <div
              key={dateStr}
              className={`flex-1 rounded-lg py-1.5 text-center ${
                isToday ? 'bg-brand-900/20 border border-brand-800/40' : 'bg-gray-800/60'
              }`}
            >
              <p className={`text-xs font-medium ${isToday ? 'text-brand-400' : 'text-gray-600'}`}>{label}</p>
              {hasTags ? (
                <p className="text-xs text-gray-400 mt-0.5 truncate px-0.5" title={entry!.tags.join(', ')}>
                  {entry!.tags[0]}
                </p>
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
