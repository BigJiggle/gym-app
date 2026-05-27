import { useEffect, useState, useMemo } from 'react'
import { useUserStore } from '../../store/userStore'
import { usePlanStore } from '../../store/planStore'
import { useSettingsStore } from '../../store/settingsStore'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import WorkoutSession from './WorkoutSession'
import SessionEditor from './SessionEditor'
import WorkoutLogEditor from './WorkoutLogEditor'
import WorkoutStats from './WorkoutStats'
import type { TrainingSession, ExerciseLibraryItem } from '../../types'
import { parseLocalDate } from '../../utils/dates'

const DAY_NAMES = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const PHASE_COLOR: Record<string, string> = {
  hypertrophy: 'text-brand-400',
  strength: 'text-blue-400',
  peak: 'text-red-400',
  deload: 'text-green-400',
}

export default function Training() {
  const { user } = useUserStore()
  const {
    trainingPlan,
    loadTrainingPlan,
    generateTrainingPlan,
    loading,
    activeWorkout,
    workoutHistory,
    startWorkout,
    loadActiveWorkout,
    loadWorkoutHistory,
  } = usePlanStore()
  const { settings } = useSettingsStore()

  const [tab, setTab] = useState<'plan' | 'history'>('plan')
  const [historyTab, setHistoryTab] = useState<'logs' | 'stats'>('logs')
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiRefining, setAiRefining] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiSuccess, setAiSuccess] = useState<string | null>(null)
  const [aiInfo, setAiInfo] = useState<string | null>(null)
  const [expandedSession, setExpandedSession] = useState<number | null>(null)
  const [sessionToStart, setSessionToStart] = useState<TrainingSession | null>(null)
  const [editingSession, setEditingSession] = useState<{id: number; name: string; exercises: import('../../types').Exercise[]} | null>(null)
  const [editingLog, setEditingLog] = useState<import('../../types').WorkoutLog | null>(null)
  const [editingLogExercises, setEditingLogExercises] = useState<import('../../types').Exercise[] | null>(null)
  const [exerciseLibrary, setExerciseLibrary] = useState<ExerciseLibraryItem[]>([])

  useEffect(() => {
    if (!user?.id) return
    loadTrainingPlan(user.id)
    loadActiveWorkout(user.id)
    loadWorkoutHistory(user.id)
    window.api.getExerciseLibrary().then(setExerciseLibrary)
  }, [user?.id])

  // Auto-resume: if there's an active workout from a previous session, find its matching
  // plan session and restore the WorkoutSession overlay so the user can continue or cancel.
  useEffect(() => {
    if (!activeWorkout || sessionToStart || !trainingPlan?.sessions) return
    const matched = (trainingPlan.sessions as any[]).find(
      (s: any) => s.id === activeWorkout.session_id
    )
    if (matched) setSessionToStart(matched as TrainingSession)
  }, [activeWorkout?.id, trainingPlan?.id])

  // Auto-expand today's session so a returning user immediately sees their workout plan.
  useEffect(() => {
    if (!trainingPlan?.sessions) return
    const dow = new Date().getDay() === 0 ? 7 : new Date().getDay()
    const todaySession = trainingPlan.sessions.find((s) => s.day_of_week === dow)
    if (todaySession) setExpandedSession(dow)
  }, [trainingPlan?.id])

  if (!user) return null

  const todayDow = new Date().getDay() === 0 ? 7 : new Date().getDay()
  const todayDateStr = new Date().toLocaleDateString('en-CA')

  // Compute muscle group set counts for a given date range
  function computeMuscleSets(fromStr: string, toStr: string): Map<string, number> {
    const nameToGroup = new Map(exerciseLibrary.map((e) => [e.name, e.muscleGroup]))
    const result = new Map<string, number>()
    for (const log of workoutHistory) {
      if (log.status !== 'completed' || log.date < fromStr || log.date > toStr) continue
      for (const s of log.sets ?? []) {
        if (s.skipped) continue
        const group = nameToGroup.get(s.exercise_name)
        if (group) result.set(group, (result.get(group) ?? 0) + 1)
      }
    }
    return result
  }

  // This week (Mon–today) and last week (Mon–Sun)
  const weeklyMuscleSets: Map<string, number> = (() => {
    const today = new Date()
    const jsDay = today.getDay()
    const daysFromMon = jsDay === 0 ? 6 : jsDay - 1
    const monday = new Date(today)
    monday.setDate(today.getDate() - daysFromMon)
    return computeMuscleSets(monday.toLocaleDateString('en-CA'), today.toLocaleDateString('en-CA'))
  })()

  const lastWeekMuscleSets: Map<string, number> = (() => {
    const today = new Date()
    const jsDay = today.getDay()
    const daysFromMon = jsDay === 0 ? 6 : jsDay - 1
    const thisMonday = new Date(today)
    thisMonday.setDate(today.getDate() - daysFromMon)
    const lastMonday = new Date(thisMonday)
    lastMonday.setDate(thisMonday.getDate() - 7)
    const lastSunday = new Date(thisMonday)
    lastSunday.setDate(thisMonday.getDate() - 1)
    return computeMuscleSets(lastMonday.toLocaleDateString('en-CA'), lastSunday.toLocaleDateString('en-CA'))
  })()

  // All muscle groups in a fixed display order
  const ALL_MUSCLE_GROUPS = ['chest', 'back', 'shoulders', 'triceps', 'biceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core']

  // Minimum effective volume (sets/week) to maintain muscle during a cut
  const MEV: Record<string, number> = {
    chest: 8, back: 10, shoulders: 8, triceps: 6, biceps: 6,
    quads: 8, hamstrings: 6, glutes: 6, calves: 6, core: 6,
  }

  // Personal records: best top-set weight for each exercise across all completed workouts
  const exercisePRs = useMemo(() => {
    const bests = new Map<string, { weightKg: number; reps: number; date: string }>()
    for (const log of workoutHistory) {
      if (log.status !== 'completed') continue
      for (const s of log.sets ?? []) {
        if (s.skipped || !s.weight_kg || s.weight_kg === 0 || !s.reps_actual) continue
        const existing = bests.get(s.exercise_name)
        if (!existing || s.weight_kg > existing.weightKg) {
          bests.set(s.exercise_name, { weightKg: s.weight_kg, reps: s.reps_actual, date: log.date })
        }
      }
    }
    return bests
  }, [workoutHistory])

  const isImperial = settings.units === 'imperial'

  // If there is an active workout and a session to track, show the overlay
  if (activeWorkout && sessionToStart) {
    return (
      <WorkoutSession
        session={sessionToStart}
        workoutLog={activeWorkout}
        onComplete={() => {
          setSessionToStart(null)
          loadWorkoutHistory(user.id)
          loadActiveWorkout(user.id)
          setTab('history')
        }}
        onClose={() => {
          setSessionToStart(null)
          loadActiveWorkout(user.id)
        }}
      />
    )
  }

  async function handleRefineWorkout() {
    if (!user || !aiPrompt.trim()) return
    setAiRefining(true)
    setAiError(null)
    setAiSuccess(null)
    setAiInfo(null)
    const prompt = aiPrompt.trim()
    try {
      const result = await window.api.applyAIRequest(user.id, prompt, 'training')
      if (result.action === 'reject') {
        setAiError(result.message)
      } else if ((result.action as string) === 'explain') {
        setAiPrompt('')
        setAiInfo(result.message)
      } else {
        setAiPrompt('')
        setAiSuccess(result.message)
        loadTrainingPlan(user.id)
        // Sync updated user settings into the store
        const freshUser = await window.api.getUser()
        if (freshUser) {
          const { useUserStore: us } = await import('../../store/userStore')
          us.setState({ user: freshUser })
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setAiError(msg.replace(/Error invoking remote method '[^']+': /, '').trim())
    } finally {
      setAiRefining(false)
    }
  }

  async function handleStartWorkout(session: TrainingSession) {
    if (!user || !trainingPlan) return
    const sessionDbId = trainingPlan.sessions?.find(
      (s) => s.day_of_week === session.day_of_week
    ) as unknown as { id?: number }
    try {
      await startWorkout(user.id, (sessionDbId as any)?.id ?? null)
      setSessionToStart(session)
    } catch (e) {
      setAiError(`Failed to start workout: ${String(e)}`)
    }
  }

  if (!trainingPlan) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-100 mb-6">Training</h1>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          <p className="text-gray-400 mb-4">No training plan generated yet.</p>
          <Button onClick={() => generateTrainingPlan(user.id)} disabled={loading}>
            {loading ? 'Generating...' : 'Generate Training Plan'}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Session editor overlay */}
      {editingSession && (
        <SessionEditor
          sessionId={editingSession.id}
          sessionName={editingSession.name}
          initialExercises={editingSession.exercises}
          onSave={() => {
            setEditingSession(null)
            if (user?.id) loadTrainingPlan(user.id)
          }}
          onClose={() => setEditingSession(null)}
        />
      )}

      {/* Workout log editor overlay */}
      {editingLog && (
        <WorkoutLogEditor
          workoutLog={editingLog}
          sessionExercises={editingLogExercises ?? undefined}
          onClose={() => { setEditingLog(null); setEditingLogExercises(null) }}
          onSaved={() => { if (user?.id) loadWorkoutHistory(user.id) }}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Training</h1>
          <p className="text-gray-500 mt-0.5 text-sm">{trainingPlan.name}</p>
        </div>
        <Badge variant="brand" className="capitalize">{trainingPlan.phase}</Badge>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
        {(['plan', 'history'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${
              tab === t ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {t === 'plan' ? 'My Plan' : 'History'}
          </button>
        ))}
      </div>

      {tab === 'plan' && (
        <>
          {/* Phase summary */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider">Phase</p>
                <p className={`text-sm font-semibold mt-1 capitalize ${PHASE_COLOR[trainingPlan.phase] ?? 'text-gray-200'}`}>
                  {trainingPlan.phase}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider">Duration</p>
                <p className="text-sm font-semibold text-gray-200 mt-1">{trainingPlan.weeks_total} weeks</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider">Sessions/Week</p>
                <p className="text-sm font-semibold text-gray-200 mt-1">{trainingPlan.sessions?.length ?? 0}</p>
              </div>
            </div>
          </div>

          {/* Weekly sessions completion tracker */}
          {(() => {
            const today = new Date()
            const jsDay = today.getDay()
            const daysFromMon = jsDay === 0 ? 6 : jsDay - 1
            const weekStartStr = new Date(today.getTime() - daysFromMon * 86400000).toLocaleDateString('en-CA')
            const completedThisWeek = workoutHistory.filter(
              (log) => log.status === 'completed' && log.date >= weekStartStr && log.date <= todayDateStr
            )
            const totalSessions = trainingPlan.sessions?.length ?? 0
            const completedDows = new Set(
              completedThisWeek.map((log) => {
                const d = new Date(log.date + 'T12:00:00')
                return d.getDay() === 0 ? 7 : d.getDay()
              })
            )
            const doneCount = completedDows.size
            if (totalSessions === 0) return null
            return (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2.5">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Sessions This Week</p>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    doneCount === totalSessions ? 'bg-green-900/30 text-green-400' :
                    doneCount > 0 ? 'bg-brand-900/20 text-brand-400' :
                    'bg-gray-800 text-gray-500'
                  }`}>
                    {doneCount}/{totalSessions}
                  </span>
                </div>
                <div className="flex gap-1.5">
                  {[...(trainingPlan.sessions ?? [])].sort((a, b) => a.day_of_week - b.day_of_week).map((session) => {
                    const dow = session.day_of_week
                    const done = completedDows.has(dow)
                    const isToday = dow === todayDow
                    return (
                      <div
                        key={dow}
                        title={session.session_name}
                        className={`flex-1 h-9 rounded-lg flex flex-col items-center justify-center text-xs font-semibold transition-colors ${
                          done
                            ? 'bg-green-700 text-white'
                            : isToday
                              ? 'bg-brand-600/30 border border-brand-500 text-brand-400'
                              : 'bg-gray-800 text-gray-600'
                        }`}
                      >
                        <span>{done ? '✓' : DAY_NAMES[dow]}</span>
                        {!done && <span className="text-xs leading-none opacity-60 mt-0.5 truncate max-w-full px-0.5">{session.session_name.split(' ')[0]}</span>}
                      </div>
                    )
                  })}
                </div>
                {doneCount === totalSessions && (
                  <p className="text-xs text-green-400 mt-2 font-medium">All sessions done this week — great prep!</p>
                )}
              </div>
            )
          })()}

          {/* Weekly calorie burn estimate from completed workouts */}
          {(() => {
            const today = new Date()
            const jsDay = today.getDay()
            const daysFromMon = jsDay === 0 ? 6 : jsDay - 1
            const weekStartStr = new Date(today.getTime() - daysFromMon * 86400000).toLocaleDateString('en-CA')
            const weekCompleted = workoutHistory.filter(
              (log) => log.status === 'completed' && log.date >= weekStartStr && log.date <= todayDateStr && log.started_at && log.ended_at
            )
            if (weekCompleted.length === 0) return null
            // MET 5.5 for vigorous weight training (ACSM standard)
            const MET = 5.5
            const weightKg = user.weight_kg
            let weeklyBurn = 0
            const burns = weekCompleted.map((log) => {
              const hrs = (new Date(log.ended_at!).getTime() - new Date(log.started_at).getTime()) / 3600000
              const kcal = Math.round(MET * weightKg * hrs)
              weeklyBurn += kcal
              return { date: log.date, kcal, mins: Math.round(hrs * 60) }
            })
            const todayBurn = burns.find(b => b.date === todayDateStr)
            return (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">This Week's Calorie Burn</p>
                  <span className="text-xs text-gray-600">MET 5.5 estimate</span>
                </div>
                <div className="flex items-end gap-4 mb-3">
                  <div>
                    <p className="text-2xl font-black text-brand-400">~{weeklyBurn.toLocaleString()}</p>
                    <p className="text-xs text-gray-500">kcal burned training</p>
                  </div>
                  {todayBurn && (
                    <div className="border-l border-gray-700 pl-4">
                      <p className="text-base font-bold text-green-400">~{todayBurn.kcal}</p>
                      <p className="text-xs text-gray-500">kcal today ({todayBurn.mins} min)</p>
                    </div>
                  )}
                </div>
                {burns.length > 1 && (
                  <div className="flex gap-1.5 flex-wrap">
                    {burns.map((b, i) => (
                      <span key={i} className={`text-xs px-2 py-0.5 rounded-full ${b.date === todayDateStr ? 'bg-green-900/30 text-green-400' : 'bg-gray-800 text-gray-500'}`}>
                        {b.date.slice(5)} ~{b.kcal}
                      </span>
                    ))}
                  </div>
                )}
                <p className="text-xs text-gray-700 mt-2">Estimated from workout duration × bodyweight. Actual burn varies by intensity and exercise selection.</p>
              </div>
            )
          })()}

          {/* This Week's Muscle Coverage + vs Last Week + MEV indicator */}
          {exerciseLibrary.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">This Week's Volume</p>
                  <p className="text-xs text-gray-600 mt-0.5">Bar shows progress toward minimum effective volume (MEV)</p>
                </div>
                {lastWeekMuscleSets.size > 0 && (
                  <p className="text-xs text-gray-600">vs last week</p>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {ALL_MUSCLE_GROUPS.map((group) => {
                  const sets = weeklyMuscleSets.get(group) ?? 0
                  const lastSets = lastWeekMuscleSets.get(group) ?? 0
                  const trained = sets > 0
                  const delta = sets - lastSets
                  const hasLastWeek = lastWeekMuscleSets.size > 0
                  const mev = MEV[group] ?? 6
                  const pct = Math.min(100, Math.round((sets / mev) * 100))
                  const barColor = pct >= 100 ? 'bg-green-500' : pct >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                  return (
                    <div
                      key={group}
                      className={`px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                        trained
                          ? 'bg-brand-900/40 border border-brand-700/50'
                          : 'bg-gray-800 border border-gray-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className={`capitalize ${trained ? 'text-brand-300' : 'text-gray-600'}`}>{group}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className={`font-bold ${trained ? 'text-brand-400' : 'text-gray-700'}`}>
                            {sets}/{mev}
                          </span>
                          {hasLastWeek && trained && delta !== 0 && (
                            <span className={`font-medium ${delta > 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {delta > 0 ? `+${delta}` : delta}
                            </span>
                          )}
                          {hasLastWeek && !trained && lastSets > 0 && (
                            <span className="text-gray-600">{lastSets}↓</span>
                          )}
                        </div>
                      </div>
                      <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
              {weeklyMuscleSets.size === 0 && (
                <p className="text-xs text-gray-600 mt-1">No workouts logged yet this week.</p>
              )}
            </div>
          )}

          {/* AI refine — only shown when Claude API key is set */}
          {(settings.claude_api_key ?? '') && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !aiRefining && handleRefineWorkout()}
                  placeholder="AI: adjust plan — e.g. 'more shoulder work' or 'replace barbell with dumbbells'"
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600"
                />
                <button
                  onClick={handleRefineWorkout}
                  disabled={aiRefining || !aiPrompt.trim()}
                  className="px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-medium transition-colors disabled:opacity-40"
                >
                  {aiRefining ? '...' : 'Ask AI'}
                </button>
              </div>
              {aiError && <p className="text-xs text-red-400">{aiError}</p>}
              {aiSuccess && <p className="text-xs text-green-400">{aiSuccess}</p>}
              {aiInfo && <p className="text-xs text-amber-400">{aiInfo}</p>}
            </div>
          )}

          <div className="bg-amber-900/10 border border-amber-800/30 rounded-lg p-3 text-xs text-amber-600">
            <strong className="text-amber-500">RIR:</strong> Reps In Reserve — stop each set with the indicated reps still in the tank. e.g. RIR 2 = 2 reps left before failure.
          </div>

          {/* Session cards — today's session first, then remaining in day order */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[...(trainingPlan.sessions ?? [])].sort((a, b) => {
              if (a.day_of_week === todayDow) return -1
              if (b.day_of_week === todayDow) return 1
              return a.day_of_week - b.day_of_week
            }).map((session) => {
              const isToday = session.day_of_week === todayDow
              const isExpanded = expandedSession === session.day_of_week
              const isDoneToday = workoutHistory.some(
                (log) => log.date === todayDateStr && log.status === 'completed' && log.session_id === (session as any).id
              )
              return (
                <div
                  key={session.day_of_week}
                  className={`bg-gray-900 border rounded-xl p-4 transition-colors ${
                    isExpanded
                      ? 'border-brand-500/50'
                      : isToday
                        ? 'border-brand-500 bg-brand-950/10'
                        : 'border-gray-800'
                  }`}
                >
                  <div
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => setExpandedSession(isExpanded ? null : session.day_of_week)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded font-mono">
                        {DAY_NAMES[session.day_of_week]}
                      </span>
                      {isToday && (
                        <span className="text-xs font-semibold text-brand-400">Today</span>
                      )}
                      {isDoneToday && (
                        <span className="text-xs font-semibold text-green-400">✓ Done</span>
                      )}
                      <h3 className="text-sm font-semibold text-gray-200">{session.session_name}</h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleStartWorkout(session) }}
                        className={`font-bold transition-colors rounded-lg ${
                          isDoneToday
                            ? 'text-xs px-3 py-1 border border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-400'
                            : isToday
                              ? 'bg-brand-600 hover:bg-brand-500 text-white text-sm px-4 py-2'
                              : 'text-xs px-3 py-1 border border-gray-700 text-gray-400 hover:border-brand-700 hover:text-brand-400'
                        }`}
                      >
                        {isDoneToday ? '↺ Redo' : '▶ Start Workout'}
                      </button>
                      <span className="text-xs text-gray-500">{session.exercises.length} ex</span>
                      <span className="text-gray-600 text-xs">{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {/* Exercise preview when collapsed */}
                  {!isExpanded && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {session.exercises.slice(0, 3).map((ex, i) => (
                        <span key={i} className="text-xs text-gray-600">
                          {ex.name}
                          {i < 2 && session.exercises.length > i + 1 ? ',' : i === 2 && session.exercises.length > 3 ? '...' : ''}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Full exercise list when expanded */}
                  {isExpanded && (
                    <div className="mt-3 space-y-1.5 border-t border-gray-800 pt-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleStartWorkout(session)
                        }}
                        className="w-full py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-sm font-bold transition-colors"
                      >
                        ▶ Start Workout
                      </button>
                      {session.exercises.map((ex, i) => {
                        const pr = exercisePRs.get(ex.name)
                        const prDisplay = pr
                          ? `${isImperial ? Math.round(pr.weightKg * 2.20462 * 10) / 10 : pr.weightKg}${isImperial ? 'lbs' : 'kg'} × ${pr.reps}`
                          : null
                        return (
                          <div key={i} className="flex justify-between items-start text-sm">
                            <div>
                              <span className="text-gray-200">{ex.name}</span>
                              {ex.notes && <p className="text-xs text-gray-600 mt-0.5">{ex.notes}</p>}
                              {prDisplay && (
                                <p className="text-xs text-amber-400/80 mt-0.5">PR: {prDisplay}</p>
                              )}
                            </div>
                            <span className="text-gray-400 font-mono text-xs ml-3 flex-shrink-0">
                              {ex.sets}×{ex.reps} RIR{ex.rir}
                            </span>
                          </div>
                        )
                      })}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          const dbSession = trainingPlan.sessions?.find(s => s.day_of_week === session.day_of_week)
                          if (dbSession?.id) {
                            setEditingSession({ id: dbSession.id as number, name: session.session_name, exercises: session.exercises })
                          }
                        }}
                        className="w-full mt-1.5 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:border-brand-700 hover:text-brand-400 text-xs transition-colors"
                      >
                        ✏ Edit Session
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

        </>
      )}

      {tab === 'history' && (
        <div className="space-y-4">
          {/* History sub-tabs */}
          <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
            {(['logs', 'stats'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setHistoryTab(t)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors capitalize ${
                  historyTab === t ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {t === 'logs' ? 'Workout Logs' : 'Stats & PRs'}
              </button>
            ))}
          </div>

          {historyTab === 'stats' && (
            <WorkoutStats
              history={workoutHistory}
              sessionsPerWeek={trainingPlan.sessions?.length ?? 3}
              units={settings.units}
              exerciseLibrary={exerciseLibrary}
            />
          )}

          {historyTab === 'logs' && (
            workoutHistory.length === 0 ? (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center space-y-3">
                <p className="text-gray-500 text-sm">No completed workouts yet.</p>
                <p className="text-gray-600 text-xs">Complete a workout to see your history here.</p>
                <button
                  onClick={() => setTab('plan')}
                  className="mt-1 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold transition-colors"
                >
                  View Training Plan →
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {workoutHistory.map((log) => {
                  const totalSets = log.sets?.filter((s) => !s.skipped).length ?? 0
                  const skippedExercises = new Set(
                    log.sets?.filter((s) => s.skipped).map((s) => s.exercise_name)
                  ).size
                  const duration =
                    log.ended_at && log.started_at
                      ? Math.round(
                          (new Date(log.ended_at).getTime() - new Date(log.started_at).getTime()) / 60000
                        )
                      : null

                  // Find the matching plan session (for Edit Session button)
                  const matchingSession = (trainingPlan.sessions as any[])?.find(
                    (s) => s.id === log.session_id
                  ) as any | undefined

                  // Top set (max weight) per exercise for this log
                  const topSets = new Map<string, { weightKg: number; reps: number }>()
                  for (const s of log.sets ?? []) {
                    if (s.skipped || !s.weight_kg || !s.reps_actual) continue
                    const ex = topSets.get(s.exercise_name)
                    if (!ex || s.weight_kg > ex.weightKg) {
                      topSets.set(s.exercise_name, { weightKg: s.weight_kg, reps: s.reps_actual })
                    }
                  }
                  // Previous completed log for the same session (for progression arrows)
                  const prevLog = workoutHistory.find(
                    (h) => h.id !== log.id && h.status === 'completed' && h.session_id === log.session_id && h.date < log.date
                  )
                  const prevTopSets = new Map<string, number>()
                  if (prevLog) {
                    for (const s of prevLog.sets ?? []) {
                      if (s.skipped || !s.weight_kg) continue
                      const prev = prevTopSets.get(s.exercise_name)
                      if (!prev || s.weight_kg > prev) prevTopSets.set(s.exercise_name, s.weight_kg)
                    }
                  }
                  const topSetsArr = [...topSets.entries()].slice(0, 5)
                  const extraExCount = topSets.size > 5 ? topSets.size - 5 : 0

                  return (
                    <div key={log.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-gray-200">
                            {parseLocalDate(log.date).toLocaleDateString('en-US', {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                            })}
                            {(matchingSession as any)?.session_name && (
                              <span className="text-gray-500 font-normal ml-2 text-xs">
                                {(matchingSession as any).session_name}
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {totalSets} sets logged
                            {skippedExercises > 0 && ` · ${skippedExercises} exercises skipped`}
                            {duration !== null && ` · ${duration} min`}
                          </p>
                          {topSetsArr.length > 0 && (
                            <div className="mt-2 space-y-0.5">
                              {topSetsArr.map(([name, { weightKg, reps }]) => {
                                const displayW = isImperial ? Math.round(weightKg * 2.20462 * 10) / 10 : weightKg
                                const prevW = prevTopSets.get(name)
                                const delta = prevW != null ? weightKg - prevW : null
                                const isPR = exercisePRs.get(name)?.weightKg === weightKg
                                return (
                                  <div key={name} className="flex items-center justify-between text-xs">
                                    <span className="text-gray-500 truncate mr-2">{name}</span>
                                    <span className="flex items-center gap-1 flex-shrink-0 font-medium tabular-nums">
                                      <span className="text-gray-300">{displayW}{isImperial ? 'lbs' : 'kg'}×{reps}</span>
                                      {isPR && <span className="text-amber-400 font-bold">PR</span>}
                                      {!isPR && delta !== null && delta > 0 && <span className="text-green-400">↑</span>}
                                      {!isPR && delta !== null && delta < 0 && <span className="text-red-400">↓</span>}
                                    </span>
                                  </div>
                                )
                              })}
                              {extraExCount > 0 && (
                                <p className="text-xs text-gray-700">+{extraExCount} more exercises</p>
                              )}
                            </div>
                          )}
                          {log.notes && (
                            <p className="text-xs text-gray-500 mt-1.5 italic border-t border-gray-800/60 pt-1.5">
                              "{log.notes}"
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span
                            className={`text-xs font-medium px-2 py-1 rounded-full ${
                              log.status === 'completed'
                                ? 'bg-green-900/30 text-green-400'
                                : 'bg-gray-800 text-gray-500'
                            }`}
                          >
                            {log.status}
                          </span>
                          <button
                            onClick={() => {
                              setEditingLog(log)
                              const session = matchingSession as any
                              setEditingLogExercises(session?.exercises ?? null)
                            }}
                            className="text-xs text-gray-500 hover:text-brand-400 border border-gray-700 hover:border-brand-700 rounded-lg px-2 py-1 transition-colors"
                          >
                            View Log
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}
