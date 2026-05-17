import { useEffect, useState } from 'react'
import Button from '../../components/ui/Button'
import type { Exercise, ExerciseLibraryItem } from '../../types'

interface Props {
  sessionId: number
  sessionName: string
  initialExercises: Exercise[]
  onSave: (exercises: Exercise[]) => void
  onClose: () => void
}

export default function SessionEditor({ sessionId, sessionName, initialExercises, onSave, onClose }: Props) {
  const [exercises, setExercises] = useState<Exercise[]>([...initialExercises])
  const [library, setLibrary] = useState<ExerciseLibraryItem[]>([])
  const [showPicker, setShowPicker] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')
  const [pickerFilter, setPickerFilter] = useState<string>('all')
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    window.api.getExerciseLibrary().then(setLibrary)
  }, [])

  const muscleGroups = ['all', ...Array.from(new Set(library.map((e) => e.muscleGroup))).sort()]

  const filteredLibrary = library.filter((e) => {
    const matchSearch = e.name.toLowerCase().includes(pickerSearch.toLowerCase()) ||
      e.muscle.toLowerCase().includes(pickerSearch.toLowerCase())
    const matchFilter = pickerFilter === 'all' || e.muscleGroup === pickerFilter
    return matchSearch && matchFilter
  })

  function moveExercise(idx: number, dir: -1 | 1) {
    const newEx = [...exercises]
    const swapIdx = idx + dir
    if (swapIdx < 0 || swapIdx >= newEx.length) return
    ;[newEx[idx], newEx[swapIdx]] = [newEx[swapIdx], newEx[idx]]
    setExercises(newEx)
  }

  function removeExercise(idx: number) {
    setExercises(exercises.filter((_, i) => i !== idx))
  }

  function addFromLibrary(item: ExerciseLibraryItem) {
    const newExercise: Exercise = {
      name: item.name,
      sets: 4,
      reps: '8-12',
      rir: 2,
      notes: item.isCompound ? 'Focus on progressive overload' : 'Control the eccentric'
    }
    setExercises([...exercises, newExercise])
    setShowPicker(false)
    setPickerSearch('')
  }

  function updateExerciseField(idx: number, field: keyof Exercise, value: string | number) {
    setExercises(exercises.map((ex, i) => i === idx ? { ...ex, [field]: value } : ex))
  }

  async function handleSave() {
    setSaving(true)
    try {
      await window.api.updateSession(sessionId, exercises)
      onSave(exercises)
    } catch (e) {
      console.error('Failed to save session:', e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-gray-950 z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-900 flex-shrink-0">
        <button onClick={onClose} className="text-gray-400 hover:text-gray-200 text-sm">← Back</button>
        <div className="text-center">
          <p className="font-semibold text-gray-100 text-sm">Edit Session</p>
          <p className="text-xs text-gray-500">{sessionName}</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-brand-400 hover:text-brand-300 text-sm font-semibold disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {/* Exercise list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-gray-200">{exercises.length} exercises</p>
          <button
            onClick={() => setShowPicker(true)}
            className="text-sm text-brand-400 hover:text-brand-300 border border-brand-800/50 hover:border-brand-700 rounded-lg px-3 py-1.5 transition-colors"
          >
            + Add Exercise
          </button>
        </div>

        {exercises.map((ex, idx) => (
          <div key={idx} className="bg-gray-900 border border-gray-800 rounded-xl p-3">
            <div className="flex items-start gap-2">
              {/* Reorder buttons */}
              <div className="flex flex-col gap-0.5 flex-shrink-0 mt-1">
                <button onClick={() => moveExercise(idx, -1)} disabled={idx === 0}
                  className="w-6 h-5 text-gray-600 hover:text-gray-400 disabled:opacity-20 text-xs flex items-center justify-center">↑</button>
                <button onClick={() => moveExercise(idx, 1)} disabled={idx === exercises.length - 1}
                  className="w-6 h-5 text-gray-600 hover:text-gray-400 disabled:opacity-20 text-xs flex items-center justify-center">↓</button>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-medium text-gray-100 text-sm truncate">{ex.name}</p>
                  <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                    <button
                      onClick={() => setEditingIdx(editingIdx === idx ? null : idx)}
                      className="text-xs text-gray-500 hover:text-brand-400 border border-gray-700 rounded px-1.5 py-0.5"
                    >
                      {editingIdx === idx ? 'Done' : '✏'}
                    </button>
                    <button
                      onClick={() => removeExercise(idx)}
                      className="text-xs text-gray-500 hover:text-red-400 border border-gray-700 rounded px-1.5 py-0.5"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {editingIdx === idx ? (
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    <div>
                      <label className="text-xs text-gray-500 mb-0.5 block">Sets</label>
                      <input
                        type="number"
                        min={1}
                        max={12}
                        value={ex.sets}
                        onChange={(e) => updateExerciseField(idx, 'sets', parseInt(e.target.value) || 1)}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 text-center"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-0.5 block">Reps</label>
                      <input
                        type="text"
                        value={ex.reps}
                        onChange={(e) => updateExerciseField(idx, 'reps', e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 text-center"
                        placeholder="8-12"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-0.5 block">RIR</label>
                      <select
                        value={ex.rir}
                        onChange={(e) => updateExerciseField(idx, 'rir', parseInt(e.target.value))}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200"
                      >
                        {[0,1,2,3,4].map((v) => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">{ex.sets} sets × {ex.reps} @ RIR {ex.rir}</p>
                )}
              </div>
            </div>
          </div>
        ))}

        {exercises.length === 0 && (
          <div className="py-12 text-center text-gray-600 text-sm">
            No exercises. Tap "+ Add Exercise" to build your session.
          </div>
        )}
      </div>

      {/* Exercise Picker Modal */}
      {showPicker && (
        <div className="fixed inset-0 bg-black/70 z-60 flex items-end justify-center">
          <div className="bg-gray-900 border border-gray-800 rounded-t-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 flex-shrink-0">
              <h3 className="font-semibold text-gray-100 text-sm">Add Exercise</h3>
              <button onClick={() => setShowPicker(false)} className="text-gray-500 hover:text-gray-300">✕</button>
            </div>
            <div className="px-4 py-2 flex-shrink-0">
              <input
                type="text"
                placeholder="Search exercises..."
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 mb-2"
                autoFocus
              />
              <div className="flex gap-1 overflow-x-auto pb-1">
                {muscleGroups.slice(0, 8).map((mg) => (
                  <button
                    key={mg}
                    onClick={() => setPickerFilter(mg)}
                    className={`px-2 py-0.5 rounded-full text-xs whitespace-nowrap flex-shrink-0 border transition-colors ${
                      pickerFilter === mg
                        ? 'bg-brand-600 border-brand-500 text-white'
                        : 'border-gray-700 text-gray-500 hover:border-gray-600'
                    }`}
                  >
                    {mg === 'all' ? 'All' : mg}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              {filteredLibrary.map((item) => {
                const alreadyAdded = exercises.some((ex) => ex.name === item.name)
                return (
                  <div
                    key={item.name}
                    className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0"
                  >
                    <div>
                      <p className="text-sm text-gray-200">{item.name}</p>
                      <p className="text-xs text-gray-500 capitalize">{item.muscleGroup} · {item.isCompound ? 'Compound' : 'Isolation'}</p>
                    </div>
                    <button
                      onClick={() => !alreadyAdded && addFromLibrary(item)}
                      disabled={alreadyAdded}
                      className={`text-xs px-2 py-1 rounded-lg border transition-colors flex-shrink-0 ml-3 ${
                        alreadyAdded
                          ? 'border-gray-700 text-gray-600 cursor-not-allowed'
                          : 'border-brand-700 text-brand-400 hover:bg-brand-900/30'
                      }`}
                    >
                      {alreadyAdded ? '✓ Added' : '+ Add'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
