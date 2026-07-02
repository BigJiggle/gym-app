import { useState } from 'react'
import { useCardioStore } from '../../store/cardioStore'
import type { CardioEntry } from '../../store/cardioStore'

const CARDIO_TYPES = ['LISS', 'HIIT', 'Stairs', 'Bike', 'Other']
const QUICK_PRESETS: [string, number][] = [['LISS', 30], ['LISS', 45], ['HIIT', 20], ['HIIT', 25]]

export default function CardioWidget() {
  const { cardioLog, addEntry, updateEntry, removeEntry } = useCardioStore()
  const todayStr = new Date().toLocaleDateString('en-CA')
  const [inputOpen, setInputOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [cardioType, setCardioType] = useState('LISS')
  const [cardioMinutes, setCardioMinutes] = useState('')

  const jsDay = new Date().getDay()
  const daysFromMon = jsDay === 0 ? 6 : jsDay - 1
  const weekStart = new Date(Date.now() - daysFromMon * 86400000).toLocaleDateString('en-CA')
  const weekEntries = cardioLog.filter((e) => e.date >= weekStart && e.date <= todayStr)
  const todayEntries = cardioLog.filter((e) => e.date === todayStr)
  const weekMins = weekEntries.reduce((s, e) => s + e.minutes, 0)

  function openAdd() {
    setEditingId(null)
    setCardioType('LISS')
    setCardioMinutes('')
    setInputOpen(true)
  }
  function openEdit(entry: CardioEntry) {
    setEditingId(entry.id)
    setCardioType(entry.type)
    setCardioMinutes(String(entry.minutes))
    setInputOpen(true)
  }
  function closeInput() {
    setInputOpen(false)
    setEditingId(null)
    setCardioMinutes('')
  }
  function save() {
    const mins = parseInt(cardioMinutes, 10)
    if (!cardioType || isNaN(mins) || mins <= 0) return
    if (editingId) updateEntry(editingId, cardioType, mins)
    else addEntry(cardioType, mins)
    closeInput()
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-100">Cardio</h2>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>{weekEntries.length} session{weekEntries.length !== 1 ? 's' : ''} this week</span>
          {weekMins > 0 && <span>· {weekMins} min</span>}
        </div>
      </div>

      {todayEntries.length > 0 ? (
        <div className="space-y-1.5 mb-3">
          {todayEntries.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between bg-green-950/20 border border-green-800/40 rounded-xl px-3 py-2.5">
              <div>
                <span className="text-green-400 font-semibold text-sm">{entry.type}</span>
                <span className="text-gray-400 text-sm ml-2">{entry.minutes} min</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => openEdit(entry)}
                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                >Edit</button>
                <button
                  onClick={() => removeEntry(entry.id)}
                  aria-label="Delete this cardio session"
                  title="Delete"
                  className="text-xs text-red-500 hover:text-red-400 transition-colors"
                >✕</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500 mb-3">No cardio logged today.</p>
      )}

      {inputOpen ? (
        <div className="space-y-2">
          <div className="flex gap-1.5 flex-wrap">
            {CARDIO_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setCardioType(t)}
                className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${cardioType === t ? 'bg-brand-600/20 border-brand-500 text-brand-400' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'}`}
              >{t}</button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number" min={1} max={180} value={cardioMinutes}
              onChange={(e) => setCardioMinutes(e.target.value)}
              placeholder="Minutes"
              className="w-24 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-sm text-gray-100 focus:outline-none focus:border-brand-500"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && save()}
            />
            <span className="text-xs text-gray-500">min</span>
            <button onClick={save} className="text-xs bg-brand-600 hover:bg-brand-500 text-white px-3 py-1 rounded-lg transition-colors font-medium">
              {editingId ? 'Save' : 'Add'}
            </button>
            <button onClick={closeInput} className="text-xs text-gray-500 hover:text-gray-400 transition-colors">Cancel</button>
          </div>
          {!editingId && (
            <div className="flex gap-1.5">
              {QUICK_PRESETS.map(([t, m]) => (
                <button
                  key={`${t}-${m}`}
                  onClick={() => { addEntry(t, m); closeInput() }}
                  className="text-xs px-2 py-1 bg-gray-800 border border-gray-700 rounded-lg text-gray-400 hover:border-brand-700 hover:text-brand-400 transition-colors"
                >{t} {m}m</button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-1.5 flex-wrap">
            {QUICK_PRESETS.map(([t, m]) => (
              <button
                key={`${t}-${m}`}
                onClick={() => addEntry(t, m)}
                className="text-xs font-medium px-3 py-1.5 bg-gray-800 border border-gray-700 text-gray-400 hover:bg-brand-900/20 hover:border-brand-700 hover:text-brand-400 rounded-lg transition-colors"
              >{t} {m}m</button>
            ))}
          </div>
          <button
            onClick={openAdd}
            className="w-full py-1.5 rounded-xl border border-dashed border-gray-700 text-gray-500 hover:border-brand-700 hover:text-brand-400 text-xs transition-colors"
          >
            {todayEntries.length > 0 ? '+ Log another cardio' : '+ Custom duration'}
          </button>
        </div>
      )}
    </div>
  )
}
