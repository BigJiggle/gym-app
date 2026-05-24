# PrepCoach QA & UX Review — 2026-05-24

## Phase 1: QA Engineering

### TypeScript Health

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | **0 errors** |
| `npm test` | **84/84 tests passed** |

### User Flow Traces

Seven flows were walked end-to-end against the source code:

| Flow | Status | Notes |
|------|--------|-------|
| 1. Onboarding (6-step wizard → plan generation) | Pass | createUser → generateTrainingPlan → generateDietPlan sequence correct |
| 2. Diet tab — view plan, mark meals eaten, swap meal | **Bug found → fixed** | Swap modal showed blank list when all alternatives filtered by food exclusions |
| 3. Training — start session, log sets, complete workout | Pass | startWorkout → saveSetsBatch → completeWorkout pipeline intact |
| 4. Check-in form submit | Pass | Unit conversion to kg/cm before submit; schedule gating via getNextCheckinDate correct |
| 5. Dashboard load (user, plans, checkin, workout history) | Pass | All async loads guarded; volume stats correctly scoped to current ISO week |
| 6. Progress page — weight trend, measurements chart | Pass | Chart data ordered oldest-first (ORDER BY week_number ASC) matches left→right axis |
| 7. Settings — unit toggle, check-in schedule, API key | Pass | setSetting persists each field; unit label reactivity via useSettingsStore correct |

### Bugs Fixed (1)

#### 1. Diet / Swap Meal modal — empty alternatives state

**File:** `src/pages/Diet/index.tsx`  
**Severity:** Medium (confusing blank UI, no guidance)

When all swap alternatives were filtered out by the user's food exclusions, the Swap Meal modal rendered a title, blank space, and Cancel button with no explanation. Users had no indication why the list was empty or what to do.

**Fix:** Wrapped the alternatives `.map()` in an IIFE that checks `alternatives.length === 0` and renders an explanatory message: *"No alternatives available — remove some food exclusions in Food Preferences to see options."*

**Commit:** `af2a87c`

### False Positives Investigated and Ruled Out

- **Claude API key `??` check** — handles both `null` and empty string correctly; no bug.
- **`progressEntries` ordering** — `ORDER BY week_number ASC` matches chart's left→right chronology; no bug.
- **`setPrimaryShow` apparently unused in UI** — backend `syncPrimaryToNearest()` auto-assigns primary; redundant but harmless.
- **`planStore.logSet` sets access** — store method is never called from any component (WorkoutSession uses `window.api.saveSetsBatch` directly); non-issue.

---

## Phase 2: Bodybuilder User Feature

**Triggered** (1 bug fixed < 3 threshold).

### Estimated weekly training kcal burned — Dashboard volume card

**File:** `src/pages/Dashboard/index.tsx`  
**Commit:** `741835c`

A new row appears below the existing "This Week's Volume" grid (sessions / sets / tonnage) whenever at least one completed workout has duration data. It shows:

- **`~N kcal` burned** — calculated using the MET formula: MET 5.5 × bodyweight_kg × hours per session, summed across the week. Bodyweight uses the latest check-in weight when available, falling back to the profile weight.
- **`· net ~N kcal/day`** — diet calorie target minus average daily training burn, giving prep athletes a direct read on true net intake without leaving the dashboard.

**Constraints respected:** Frontend-only calculation; uses only existing `WorkoutLog` fields (`started_at`, `ended_at`) and `DietPlan.calories_target`. No new IPC calls, no DB schema changes, no Electron main process changes.

---

## Phase 3: UX Simplicity Review

### Change 1 — Workout abort button relabelled "End Early"

**File:** `src/pages/Training/WorkoutSession.tsx` line 422  
**Commit:** `201415e`

| | Before | After |
|-|--------|-------|
| Button label | `Cancel` | `End Early` |

`Cancel` implies navigation cancellation ("go back without saving"). The button actually discards the entire in-progress workout. `End Early` matches the destructive intent and sets correct expectations before the confirmation dialog.

### Change 2 — Session card exercise preview ellipsis logic

**File:** `src/pages/Training/index.tsx` line 485  
**Commit:** `201415e`

| | Before | After |
|-|--------|-------|
| Condition | `i === 2 ? '...' : ''` | `i === 2 && session.exercises.length > 3 ? '...' : ''` |

Previously, a session with exactly 3 exercises showed `Exercise A, Exercise B, Exercise C...` — implying more exercises existed when none did. The fix gates the ellipsis on `session.exercises.length > 3` so it only appears when exercises are genuinely truncated.

---

## Summary

| Category | Count |
|----------|-------|
| TypeScript errors | 0 (clean) |
| Tests passing | 84 / 84 |
| Bugs fixed (Phase 1) | 1 |
| Feature added (Phase 2) | 1 (kcal burn estimate on dashboard volume card) |
| UX improvements (Phase 3) | 2 (button label, ellipsis logic) |
| Commits this session | 3 |
