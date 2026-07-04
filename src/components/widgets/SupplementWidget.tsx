import { useState } from 'react'
import { supplementListStore, supplementLogStore } from './competitionLogs'

export default function SupplementWidget() {
  const supplementList = supplementListStore.useValue()
  const supplementLog = supplementLogStore.useValue()
  const todayStr = new Date().toLocaleDateString('en-CA')
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)

  const todayTaken = new Set(supplementLog.find((e) => e.date === todayStr)?.taken ?? [])
  const takenCount = supplementList.filter((s) => todayTaken.has(s)).length
  const allTaken = supplementList.length > 0 && takenCount === supplementList.length
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    const dateStr = d.toLocaleDateString('en-CA')
    const entry = supplementLog.find((e) => e.date === dateStr)
    const count = entry ? supplementList.filter((s) => entry.taken.includes(s)).length : 0
    return {
      dateStr,
      label: d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1) + d.getDate(),
      pct: supplementList.length > 0 ? Math.round((count / supplementList.length) * 100) : 0,
      isToday: dateStr === todayStr,
    }
  })

  function toggle(name: string) {
    const existing = supplementLog.find((e) => e.date === todayStr) ?? { date: todayStr, taken: [] }
    const taken = existing.taken.includes(name)
      ? existing.taken.filter((t) => t !== name)
      : [...existing.taken, name]
    supplementLogStore.set([...supplementLog.filter((e) => e.date !== todayStr), { date: todayStr, taken }])
  }
  function add() {
    const name = newName.trim()
    if (!name || supplementList.includes(name)) return
    supplementListStore.set([...supplementList, name])
    setNewName('')
    setAdding(false)
  }
  function remove(name: string) {
    supplementListStore.set(supplementList.filter((s) => s !== name))
    supplementLogStore.set(supplementLog.map((e) => ({ ...e, taken: e.taken.filter((t) => t !== name) })))
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-100">Supplements</h2>
        {supplementList.length > 0 && (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${allTaken ? 'bg-green-900/30 text-green-400' : 'bg-gray-800 text-gray-500'}`}>
            {takenCount}/{supplementList.length} taken
          </span>
        )}
      </div>
      {supplementList.length === 0 && !adding && (
        <p className="text-sm text-gray-600 mb-3">Add your daily supplements to track them here.</p>
      )}
      <div className="flex flex-wrap gap-2 mb-3">
        {supplementList.map((name) => {
          const taken = todayTaken.has(name)
          return (
            <div key={name} className="flex items-center gap-1 group">
              <button
                onClick={() => toggle(name)}
                className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                  taken
                    ? 'bg-green-900/20 border-green-700/50 text-green-400'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300'
                }`}
              >
                {taken ? '✓ ' : ''}{name}
              </button>
              <button
                onClick={() => remove(name)}
                className="opacity-0 group-hover:opacity-100 text-gray-700 hover:text-red-400 text-xs w-4 h-4 flex items-center justify-center transition-all"
                title={`Remove ${name}`}
                aria-label={`Remove ${name}`}
              >
                ✕
              </button>
            </div>
          )
        })}
        {adding ? (
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') add(); if (e.key === 'Escape') { setAdding(false); setNewName('') } }}
              placeholder="Supplement name"
              autoFocus
              className="w-36 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-brand-500"
            />
            <button onClick={add} className="text-xs bg-brand-600 hover:bg-brand-500 text-white px-2 py-1 rounded-lg transition-colors">Add</button>
            <button onClick={() => { setAdding(false); setNewName('') }} className="text-xs text-gray-500 hover:text-gray-400 transition-colors">✕</button>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="text-xs px-3 py-1.5 rounded-lg border border-dashed border-gray-700 text-gray-600 hover:border-brand-700 hover:text-brand-400 transition-colors"
          >
            + Add
          </button>
        )}
      </div>
      {supplementList.length > 0 && <div className="flex gap-1">
        {last7.map(({ dateStr, label, pct, isToday }) => (
          <div
            key={dateStr}
            className={`flex-1 rounded-lg py-1.5 text-center ${isToday ? 'bg-brand-900/20 border border-brand-800/40' : 'bg-gray-800/60'}`}
          >
            <p className={`text-xs font-medium ${isToday ? 'text-brand-400' : 'text-gray-600'}`}>{label}</p>
            <p className={`text-xs mt-0.5 font-medium ${pct === 100 ? 'text-green-400' : pct >= 50 ? 'text-yellow-400' : pct > 0 ? 'text-gray-500' : 'text-gray-700'}`}>
              {pct > 0 ? `${pct}%` : '—'}
            </p>
          </div>
        ))}
      </div>}
    </div>
  )
}
