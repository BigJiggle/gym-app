// Pure "new personal record" detection for a just-finished workout session.
//
// A set counts as a PR only when its best done, weighted set BEATS the athlete's
// prior ALL-TIME best for that exercise — not merely their most recent session.
// (WorkoutSession previously compared against last-session weights, so a lift
// above last time but below the true all-time PR was falsely announced as a PR.)

export interface PRSetLike {
  weight: number
  reps: number
  done: boolean
}

export interface PRExerciseState {
  sets: PRSetLike[]
  allSkipped: boolean
}

export interface PRPerf {
  weight: number
  reps: number
}

export interface NewPR {
  exerciseName: string
  weight: number
  reps: number
}

// currentStates: [exerciseName, state] pairs for the session just completed.
// priorPRs: the athlete's all-time best weight per exercise BEFORE this session.
// A PR is emitted only when a prior best exists AND the session strictly beats it.
export function detectNewPRs(
  currentStates: Array<[string, PRExerciseState]>,
  priorPRs: Map<string, PRPerf>,
): NewPR[] {
  const prs: NewPR[] = []
  for (const [exerciseName, exState] of currentStates) {
    if (exState.allSkipped) continue
    // A PR set needs a real weight AND a real rep count. The reps guard (> 0, which
    // also rejects NaN) matches every other PR / top-set / last-performance surface
    // in the app (computePRs, exercisePRs, lastPerformance, allTimePR — all use the
    // falsy `!reps` check). The live WorkoutSession reps input is `value={s.reps || ''}`
    // → clearing it makes `Number('') === 0` and ✓ marks the set done with a weight
    // entered but reps 0; without this guard a heavy such set was announced as a
    // nonsensical "X kg × 0" PR the Stats tab and next session's PR baseline both
    // disown — a UI↔UI desync.
    const doneSets = exState.sets.filter((s) => s.done && s.weight > 0 && s.reps > 0)
    if (doneSets.length === 0) continue
    const bestWeight = Math.max(...doneSets.map((s) => s.weight))
    const bestReps = doneSets.find((s) => s.weight === bestWeight)?.reps ?? 0
    const prev = priorPRs.get(exerciseName)
    if (prev && bestWeight > prev.weight) {
      prs.push({ exerciseName, weight: bestWeight, reps: bestReps })
    }
  }
  return prs
}
