import { useState, useCallback } from 'react'
import type { WorkoutLog, ExerciseLogEntry, Exercise } from '../../types'
import { useSettingsStore } from '../../store/settingsStore'
import { clampSetCount } from '../../utils/clampSetCount'

interface Props {
  workoutLog: WorkoutLog
  sessionExercises?: Exercise[]
  onClose: () => void
  onSaved: () => void
}

interface SetRow {
  key: string
  dbId: number | null   // null = not yet in DB
  exerciseName: string
  setNumber: number
  weight: string
  reps: string
  rir: string
  isSkipped: boolean    // ✕ = unchecked/not logged yet; ✓ = completed
  saving: boolean
}

function buildRows(workoutLog: WorkoutLog, sessionExercises?: Exercise[]): SetRow[] {
  const rows: SetRow[] = []

  // Add all logged sets
  for (const s of workoutLog.sets ?? []) {
    rows.push({
      key: `logged-${s.id}`,
      dbId: s.id,
      exerciseName: s.exercise_name,
      setNumber: s.set_number,
      weight: s.weight_kg != null ? String(s.weight_kg) : '',
      reps: s.reps_actual != null ? String(s.reps_actual) : '',
      rir: s.rir_actual != null ? String(s.rir_actual) : '',
      isSkipped: s.skipped,
      saving: false,
    })
  }

  // Add empty rows for exercises not yet logged (from the session plan)
  if (sessionExercises) {
    const loggedNames = new Set((workoutLog.sets ?? []).map((s) => s.exercise_name))
    for (const ex of sessionExercises) {
      if (!loggedNames.has(ex.name)) {
        // Clamp so a stored huge/negative `sets` can't spawn ~1M pending rows (OOM)
        // or zero rows. See clampSetCount.
        const count = clampSetCount(ex.sets)
        for (let i = 0; i < count; i++) {
          rows.push({
            key: `pending-${ex.name}-${i}`,
            dbId: null,
            exerciseName: ex.name,
            setNumber: i + 1,
            weight: '',
            reps: '',
            rir: '',
            isSkipped: true,  // shown as unchecked — user checks to log
            saving: false,
          })
        }
      }
    }
  }

  return rows
}

function getExerciseOrder(sessionExercises?: Exercise[], rows?: SetRow[]): string[] {
  const fromSession = sessionExercises?.map((e) => e.name) ?? []
  const fromRows = [...new Set((rows ?? []).map((r) => r.exerciseName))]
  return [
    ...fromSession,
    ...fromRows.filter((n) => !fromSession.includes(n)),
  ]
}

export default function WorkoutLogEditor({ workoutLog, sessionExercises, onClose, onSaved }: Props) {
  const { settings } = useSettingsStore()
  const isImperial = settings.units === 'imperial'
  const weightUnit = isImperial ? 'lbs' : 'kg'
  const weightStep = isImperial ? 5 : 0.5

  // Convert kg from DB to display unit when building rows
  const [rows, setRows] = useState<SetRow[]>(() => {
    const built = buildRows(workoutLog, sessionExercises)
    if (!isImperial) return built
    return built.map(r => ({
      ...r,
      weight: r.weight ? String(Math.round(parseFloat(r.weight) * 2.20462 * 10) / 10) : r.weight,
    }))
  })

  const exerciseOrder = getExerciseOrder(sessionExercises, rows)

  function updateRow(key: string, updates: Partial<SetRow>) {
    setRows((prev) => prev.map((r) => r.key === key ? { ...r, ...updates } : r))
  }

  // Auto-save an existing logged set on field blur — converts display unit → kg for storage
  const autoSave = useCallback(async (key: string) => {
    setRows((prev) => {
      const row = prev.find((r) => r.key === key)
      if (!row || row.dbId === null || row.isSkipped || row.saving) return prev
      const displayWeight = row.weight ? parseFloat(row.weight) : null
      const weightKg = displayWeight === null ? undefined
        : isImperial ? Math.round(displayWeight * 0.453592 * 100) / 100
        : displayWeight
      window.api.updateWorkoutSet(row.dbId, {
        weight_kg: weightKg,
        reps_actual: row.reps ? parseInt(row.reps) : undefined,
        rir_actual: row.rir !== '' ? parseInt(row.rir) : undefined,
      }).catch((e: unknown) => console.error('Auto-save failed:', e))
      return prev
    })
  }, [isImperial])

  // Toggle ✓/✕ — logs a pending set or flips skipped on an existing one
  async function toggleRow(key: string) {
    const row = rows.find((r) => r.key === key)
    if (!row || row.saving) return

    if (row.dbId === null) {
      // Pending set: log it into DB as completed
      updateRow(key, { saving: true })
      try {
        const result = await window.api.logSet(workoutLog.id, {
          exercise_name: row.exerciseName,
          set_number: row.setNumber,
          reps_prescribed: null,
          reps_actual: row.reps ? parseInt(row.reps) : null,
          weight_kg: row.weight ? (isImperial ? Math.round(parseFloat(row.weight) * 0.453592 * 100) / 100 : parseFloat(row.weight)) : null,
          rir_actual: row.rir !== '' ? parseInt(row.rir) : null,
          skipped: false,
          notes: null,
        }) as ExerciseLogEntry
        // Replace temp key with a stable DB-backed key
        setRows((prev) => prev.map((r) =>
          r.key === key
            ? { ...r, key: `logged-${result.id}`, dbId: result.id, isSkipped: false, saving: false }
            : r
        ))
      } catch (e) {
        console.error('Failed to log set:', e)
        updateRow(key, { saving: false })
      }
    } else {
      // Existing set: toggle skipped
      const newSkipped = !row.isSkipped
      updateRow(key, { isSkipped: newSkipped, saving: true })
      try {
        await window.api.updateWorkoutSet(row.dbId, { skipped: newSkipped })
      } catch (e) {
        console.error('Toggle skipped failed:', e)
        updateRow(key, { isSkipped: !newSkipped })
      }
      updateRow(key, { saving: false })
    }
  }

  async function deleteRow(key: string) {
    const row = rows.find((r) => r.key === key)
    if (!row) return
    if (row.dbId === null) {
      setRows((prev) => prev.filter((r) => r.key !== key))
      return
    }
    if (!confirm('Delete this set?')) return
    updateRow(key, { saving: true })
    try {
      await window.api.deleteWorkoutSet(row.dbId)
      setRows((prev) => prev.filter((r) => r.key !== key))
    } catch (e) {
      console.error('Delete failed:', e)
      updateRow(key, { saving: false })
    }
  }

  function addSetForExercise(exerciseName: string) {
    const exerciseRows = rows.filter((r) => r.exerciseName === exerciseName)
    const last = exerciseRows[exerciseRows.length - 1]
    const nextNumber = exerciseRows.length + 1
    setRows((prev) => [...prev, {
      key: `pending-${exerciseName}-${Date.now()}`,
      dbId: null,
      exerciseName,
      setNumber: nextNumber,
      weight: last?.weight ?? '',
      reps: last?.reps ?? '',
      rir: last?.rir ?? '',
      isSkipped: true,
      saving: false,
    }])
  }

  const duration = workoutLog.ended_at && workoutLog.started_at
    ? Math.round((new Date(workoutLog.ended_at).getTime() - new Date(workoutLog.started_at).getTime()) / 60000)
    : null

  const completedCount = rows.filter((r) => r.dbId !== null && !r.isSkipped).length
  const pendingCount = rows.filter((r) => r.dbId === null).length

  return (
    <div className="fixed inset-0 bg-gray-950 z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-900 flex-shrink-0">
        <button onClick={onClose} className="text-gray-400 hover:text-gray-200 text-sm">← Back</button>
        <div className="text-center">
          <p className="font-semibold text-gray-100 text-sm">Edit Workout Log</p>
          <p className="text-xs text-gray-500">
            {new Date(workoutLog.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            {duration != null && ` · ${duration} min`}
            {' · '}<span className="text-green-400">{completedCount} sets</span>
            {pendingCount > 0 && <span className="text-gray-600"> · {pendingCount} unlogged</span>}
          </p>
        </div>
        <button onClick={() => { onSaved(); onClose() }} className="text-brand-400 hover:text-brand-300 text-sm font-semibold">
          Done
        </button>
      </div>

      {sessionExercises && pendingCount > 0 && (
        <div className="px-4 py-2 bg-amber-900/10 border-b border-amber-800/20 text-xs text-amber-500">
          {pendingCount} set{pendingCount !== 1 ? 's' : ''} from your session plan not yet logged — fill in data and tap ✓ to log them.
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {exerciseOrder.map((exerciseName) => {
          const exerciseRows = rows.filter((r) => r.exerciseName === exerciseName)
          if (exerciseRows.length === 0) return null
          const allPending = exerciseRows.every((r) => r.dbId === null)

          return (
            <div
              key={exerciseName}
              className={`bg-gray-900 border rounded-xl p-4 ${allPending ? 'border-gray-700/50 opacity-70' : 'border-gray-800'}`}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-100 text-sm">{exerciseName}</h3>
                {allPending && <span className="text-xs text-gray-600 italic">Not logged</span>}
              </div>

              <div className="space-y-2">
                {exerciseRows.map((row) => {
                  const isPending = row.dbId === null
                  return (
                    <div key={row.key} className={`flex items-center gap-2 ${row.isSkipped && !isPending ? 'opacity-40' : ''}`}>
                      <span className="text-xs text-gray-600 w-10 flex-shrink-0">Set {row.setNumber}</span>

                      {/* ✓/✕ toggle */}
                      <button
                        onClick={() => toggleRow(row.key)}
                        disabled={row.saving}
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-colors border disabled:opacity-40 ${
                          row.isSkipped || isPending
                            ? 'bg-gray-800 border-gray-600 text-gray-500 hover:bg-green-900/30 hover:border-green-700 hover:text-green-400'
                            : 'bg-green-900/30 border-green-700 text-green-400 hover:bg-red-900/20 hover:border-red-700 hover:text-red-400'
                        }`}
                        title={row.isSkipped ? (isPending ? 'Tap to log this set' : 'Mark as completed') : 'Mark as skipped'}
                      >
                        {row.saving ? '·' : row.isSkipped ? '✕' : '✓'}
                      </button>

                      {/* Weight */}
                      <input
                        type="number"
                        step={weightStep}
                        min="0"
                        max="9999"
                        value={row.weight}
                        onChange={(e) => updateRow(row.key, { weight: e.target.value })}
                        onBlur={() => autoSave(row.key)}
                        placeholder={weightUnit}
                        disabled={!isPending && row.isSkipped}
                        className="w-16 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 text-center disabled:opacity-30"
                      />
                      <span className="text-gray-600 text-xs">{weightUnit} ×</span>

                      {/* Reps */}
                      <input
                        type="number"
                        min="0"
                        max="9999"
                        value={row.reps}
                        onChange={(e) => updateRow(row.key, { reps: e.target.value })}
                        onBlur={() => autoSave(row.key)}
                        placeholder="reps"
                        disabled={!isPending && row.isSkipped}
                        className="w-14 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 text-center disabled:opacity-30"
                      />

                      {/* RIR */}
                      <span className="text-gray-600 text-xs">RIR</span>
                      <select
                        value={row.rir}
                        onChange={(e) => updateRow(row.key, { rir: e.target.value })}
                        onBlur={() => autoSave(row.key)}
                        disabled={!isPending && row.isSkipped}
                        className="w-12 bg-gray-800 border border-gray-700 rounded px-1 py-1 text-xs text-gray-200 disabled:opacity-30"
                      >
                        <option value="">-</option>
                        {[0, 1, 2, 3, 4].map((v) => <option key={v} value={v}>{v}</option>)}
                      </select>

                      {/* Delete */}
                      <button
                        onClick={() => deleteRow(row.key)}
                        disabled={row.saving}
                        className="ml-auto text-xs px-2 py-1 rounded bg-red-900/20 border border-red-900/40 text-red-400 hover:bg-red-900/40 disabled:opacity-30 transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  )
                })}
              </div>

              {/* Add Set */}
              <button
                onClick={() => addSetForExercise(exerciseName)}
                className="mt-3 w-full text-xs text-brand-400 hover:text-brand-300 border border-brand-800/40 hover:border-brand-700 rounded-lg py-1.5 transition-colors"
              >
                + Add Set
              </button>
            </div>
          )
        })}

        {rows.length === 0 && (
          <div className="py-12 text-center text-gray-600 text-sm">No sets to display.</div>
        )}
      </div>
    </div>
  )
}
