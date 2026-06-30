# PrepCoach QA Report — 2026-06-30

## Phase 1 — QA Engineer

### TypeScript Check
`npx tsc --noEmit` — **CLEAN** (0 errors)

### Unit Tests
All **105 tests passed** across nutrition engine, food database, and supporting utilities.

### Nutrition Engine Audit
| Check | Result |
|---|---|
| `getPhaseAwareDeficit` phase boundaries (≤3/≤8/≤16/>16 weeks) | ✅ Correct |
| `MEAL_CAL_FRACTIONS` sum (0.45 + 0.35 + 0.15 = 0.95, 0.05 buffer) | ✅ Intentional |
| `calcPortionStr` role-fixed portions (veg 120g, fruit 100g, powder 30g) | ✅ Correct |
| `safeWeightKg` guard (finite + ≥30) | ✅ Present |
| `resolvedSnackCount` fallback | ✅ Correct |
| Meal count clamped [3, 6] | ✅ Correct |
| Meal templates sorted by time before delivery | ✅ Correct |
| Culture food lookups (`getCultureFood`) — all 8 cultures | ✅ |
| `generateNutritionPlan` off-season vs deficit logic | ✅ Correct |

### Food Database Audit
| Check | Result |
|---|---|
| `FOOD_CALORIES_PER_100G` covers all template + culture foods | ✅ |
| `FOOD_SUBSTITUTES` chains are non-circular | ✅ |
| `FOOD_CATEGORY` values are valid ('protein'/'carb'/'fat'/'veg') | ✅ |
| `SNACK_ONLY_FOODS` set vs main-meal logic | ✅ |
| `EXCLUSION_ALIASES` map completeness | ✅ |

### IPC / Logic Audit
| Check | Result |
|---|---|
| `determinePhase` boundary conditions (undefined/null, ≤3, ≤8, ≤16, >16) | ✅ |
| DAY_SCHEDULES freq clamp [2, 6] | ✅ |
| Deload reduces sets by 1 (`Math.max(1, sets - 1)`) | ✅ |
| Same-day check-in duplicate guard (`DUPLICATE_CHECKIN:date`) | ✅ |
| Early check-in guard (`EARLY_CHECKIN:ISO`) | ✅ |
| `meal_completions` UNIQUE constraint respected by upsert logic | ✅ |
| Schema migrations v1–v13 sequential and idempotent | ✅ |
| `syncPrimaryToNearest` + `setPrimary` past-show guard | ✅ |
| weeks_out calculation (`Math.max(0, Math.floor(ms / week_ms))`) | ✅ |

### User Flow Tracing (7 flows)
1. **Onboarding → Plan generation**: `createUser` → `generateTrainingPlan` + `generateDietPlan` ✅
2. **Weekly check-in**: duplicate guard, cascade diet update on calorie delta ✅
3. **Workout session**: start → logSet → complete (batch saveSetsBatch) ✅
4. **Meal logging**: logMealCompletion upsert, unlogMealCompletion filter ✅
5. **Show management**: add/setPrimary/delete cascade, off-season transition ✅
6. **Settings save**: `handleSaveProfile(regenerate=true)` regenerates both plans ✅
7. **Progress/weight chart**: empty state, single check-in, 2+ check-ins, projected show-day weight ✅

### Bugs Found
**0 bugs found.** Codebase was in clean condition entering this session.

---

## Phase 2 — Prep Athlete Feature

**Feature implemented:** Pre-workout last-session reference in expanded plan session card

**Rationale:** Athletes check the plan card before starting a workout to know what to lift. The workout overlay already showed last-session performance (weight × reps) per exercise once a session was started, but before tapping "Start Workout" the plan view showed only prescribed sets/reps/RIR with no historical reference. An athlete had to either remember or start the workout just to check. This was the clearest daily-use gap across all pages.

**What was built:**
- `lastPerfBySession` useMemo (after `exerciseTrend`) — for each plan session, finds the most recent completed `WorkoutLog` with that `session_id`, then maps each exercise name to its top-set weight and reps from that log
- "Last session: Mon, Jun 23" date header shown in expanded session cards when history exists
- Per-exercise "Last: X kg × N reps" annotation in cyan, visible without starting the workout
- ★PR badge appears on the exercise line when last-session weight equals the all-time PR
- Trend arrow (↑↓→) shown alongside last-session or PR line for overall strength direction
- Zero new IPC calls — uses `workoutHistory` already loaded by `loadWorkoutHistory`

**Files changed:** `src/pages/Training/index.tsx`  
**Commit:** `[FEATURE] 2026-06-30: pre-workout last-session reference`

---

## Phase 3 — UX Simplicity Review

### Issues Found & Fixed

**Fix 1 — Raw IPC error message on check-in submit (CheckIn page)**
- **Issue:** `handleSubmit` catch block formatted errors as `` `Submission failed: ${msg}` `` where `msg` was the raw Electron string: `Error invoking remote method 'checkin:submit': Error: DUPLICATE_CHECKIN:2026-06-30`. This exposed internal error codes and the full Electron IPC call name to users.
- `DUPLICATE_CHECKIN` was also not handled specifically — it fell through as a generic error showing the raw sentinel string.
- **Fix:** Added a specific `DUPLICATE_CHECKIN` branch with a friendly message ("You already submitted a check-in today. Edit it from the locked screen.") and stripped the IPC method prefix from all other errors using the same regex pattern already used on Diet and Training pages.
- File: `src/pages/CheckIn/index.tsx`

**Fix 2 — Raw IPC error message on locked-screen edit save (CheckIn page)**
- **Issue:** The `saveEdit` function (editing a past check-in from the locked state) did `setEditError(String(e))` with no cleanup — identical problem: raw Electron IPC prefix shown to user on any save error.
- **Fix:** Applied the same IPC-prefix strip regex to the `saveEdit` catch block so edit errors are also user-readable.
- File: `src/pages/CheckIn/index.tsx`

**Commit:** `[UX] 2026-06-30: CheckIn error clarity — strip raw IPC prefix and handle DUPLICATE_CHECKIN`

---

## Summary

| Phase | Outcome |
|---|---|
| Phase 1 — QA | 0 bugs found · 105 tests pass · TypeScript clean |
| Phase 2 — Feature | Pre-workout last-session reference in Training plan card |
| Phase 3 — UX | 2 error-clarity fixes in CheckIn page |
| Push | ✅ Pushed to `origin/master` (commits b603a47, 32d7222) |
