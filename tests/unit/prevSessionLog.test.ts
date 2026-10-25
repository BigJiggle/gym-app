import { describe, it, expect } from 'vitest'
import { findPrevSessionLog } from '../../src/utils/prevSessionLog'
import type { WorkoutLog } from '../../src/types'

function log(partial: Partial<WorkoutLog> & { id: number; date: string }): WorkoutLog {
  return {
    status: 'completed',
    session_id: 1,
    started_at: `${partial.date} 10:00:00`,
    ended_at: `${partial.date} 11:00:00`,
    notes: null,
    sets: [],
    ...partial,
  } as WorkoutLog
}

describe('findPrevSessionLog', () => {
  it('returns the newest earlier completed log for the SAME session', () => {
    // history is newest-first (handler returns ORDER BY id DESC)
    const history: WorkoutLog[] = [
      log({ id: 5, date: '2026-03-10', session_id: 7 }),
      log({ id: 4, date: '2026-03-08', session_id: 7 }),
      log({ id: 3, date: '2026-03-05', session_id: 7 }),
      log({ id: 2, date: '2026-03-06', session_id: 9 }), // different session — ignored
    ]
    const current = history[0] // id 5, session 7
    const prev = findPrevSessionLog(history, current)
    expect(prev?.id).toBe(4)
  })

  it('ignores logs of a different session even when they are more recent', () => {
    const history: WorkoutLog[] = [
      log({ id: 3, date: '2026-03-10', session_id: 7 }),
      log({ id: 2, date: '2026-03-09', session_id: 9 }), // newer than the real match but wrong session
      log({ id: 1, date: '2026-03-01', session_id: 7 }),
    ]
    const prev = findPrevSessionLog(history, history[0])
    expect(prev?.id).toBe(1)
  })

  it('returns undefined when there is no earlier same-session log', () => {
    const history: WorkoutLog[] = [
      log({ id: 2, date: '2026-03-10', session_id: 7 }),
      log({ id: 1, date: '2026-03-05', session_id: 9 }),
    ]
    expect(findPrevSessionLog(history, history[0])).toBeUndefined()
  })

  // Regression: after a plan regeneration (phase-boundary auto-refresh) every
  // historical completed log has session_id = NULL. A bare `===` match then treats
  // two unrelated null-session logs as the "same session" (null === null), drawing
  // a wrong progression arrow. The current log's session being unknown must yield
  // NO predecessor, not a spurious cross-session match.
  it('does NOT match two different null-session logs as the same session', () => {
    const history: WorkoutLog[] = [
      log({ id: 2, date: '2026-03-10', session_id: null }),
      log({ id: 1, date: '2026-03-08', session_id: null }),
    ]
    expect(findPrevSessionLog(history, history[0])).toBeUndefined()
  })

  it('does not match an in-progress or same-date earlier log', () => {
    const history: WorkoutLog[] = [
      log({ id: 3, date: '2026-03-10', session_id: 7 }),
      log({ id: 2, date: '2026-03-10', session_id: 7 }), // same date — not strictly earlier
      log({ id: 1, date: '2026-03-09', session_id: 7, status: 'in_progress' }), // not completed
    ]
    expect(findPrevSessionLog(history, history[0])).toBeUndefined()
  })
})
