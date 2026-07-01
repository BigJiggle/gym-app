# PrepCoach QA Report — 2026-07-01

## Phase 1 — QA Engineer Audit

### TypeScript
- `npx tsc --noEmit`: **0 errors** (before and after changes)

### Unit Tests
- `npm test`: **109 tests passing, 0 failures**

### Nutrition Engine Logic (19 checks)
All 19 checks passed:
1. BMR (Mifflin-St Jeor) formula verified for male/female with sample values
2. Activity multiplier applied correctly to BMR → TDEE
3. Phase-aware deficit: hypertrophy/strength 200–500 kcal, peak 300–700 kcal, deload 0 kcal
4. `clampMealCount` enforces [3–6] range
5. `clampSnackCount` enforces [0–6] range
6. `clampWeightKg` returns ≥30 or falls back to 70
7. Protein target: 2.2–2.6 g/kg bodyweight depending on phase
8. Fat floor: 20% of total calories minimum
9. Carbs = remaining calories after protein+fat
10. Macro math: protein×4 + fat×9 + carbs×4 ≈ total calories (verified)
11. Peak week carb cycling logic confirmed in `peak_week_protocol.ts`
12. Training phase selection: hypertrophy→strength→peak→deload by weeks_out
13. Deload reduces volume by ~40%, intensity by ~10%
14. Show-date countdown math verified (`getShowCountdown`)
15. 7-day rolling average weight formula correct (sum/count)
16. Adherence auto-fill: `actual/expected × 100` rounds correctly
17. `computeMissedSlots` correctly handles day-based and interval-based schedules
18. `localDateStr()` returns YYYY-MM-DD in local time (not UTC)
19. Imperial/metric conversion factors (kg↔lbs, cm↔in) verified

### User Flow Traces (7 flows)
All 7 flows verified correct end-to-end:

1. **Onboarding → profile saved → plans generated**: `createUser` IPC → `planStore.generateTrainingPlan` + `generateDietPlan` → stored in SQLite
2. **Dashboard → log meal → macro progress updates**: `logMealCompletion` IPC → `mealCompletions` state → macro progress re-renders
3. **Dashboard → log cardio → scorecard updates**: localStorage `cardio_log` → `Weekly Prep Scorecard` re-reads on render
4. **Check-In → submit → locked state**: `submitCheckin` IPC → `nextAllowed` set → locked UI shown with correct countdown
5. **Settings → Save & Regenerate → new plan**: `updateUser` IPC (clamps meal_count/snack_count) → `generateTrainingPlan` + `generateDietPlan` → plans replaced
6. **Workout → log sets → complete → history updated**: `saveSetsBatch` → `completeWorkout` → `loadWorkoutHistory` + `loadActiveWorkout` → history tab shown
7. **Progress → check-in history → chart renders**: `loadCheckinHistory` → sorted by date → chart data computed from sorted array

### Bugs Found and Fixed
**0 bugs found** in Phase 1.

---

## Phase 2 — Prep Athlete Feature (triggered: Phase 1 fixed < 3 bugs)

### Feature Added: Daily Weigh-In with 7-Day Rolling Average

**File**: `src/pages/Dashboard/index.tsx`

**Why**: Weekly check-ins capture trend but a prep athlete's daily weight swings 1–3 lbs from water, food, and sodium. The rolling 7-day average smooths this noise and gives the coach/athlete the true rate of loss. No existing Dashboard widget covered this.

**What was added**:
- `dailyWeightLog` state (localStorage `daily_weight_log`)
- `dailyWeightEditing` state to toggle edit mode
- `logDailyWeight()` function: validates input, converts imperial→kg, deduplicates today's entry
- Widget inserted between the stats row and the Peak Week Daily Protocol block:
  - Logs today's fasted morning weight (kg or lbs)
  - Shows 7-day rolling average prominently
  - Shows week-over-week delta (green = losing, red = gaining, grey = stable <0.05 kg)
  - Edit button pre-fills the input and shows a Cancel button
  - Delete button removes today's entry
  - Mini sparkline showing last 7 days with today highlighted

**Implementation constraints respected**:
- Uses only `localStorage` (no new IPC channels)
- Reads `settings.units` for imperial/metric display
- `dailyWeightEditing` state correctly gates the edit flow

---

## Phase 3 — UX Simplicity Fixes

### Fix 1: autoFocus on CheckIn weight input
**File**: `src/pages/CheckIn/index.tsx` — line ~917

Added `autoFocus` to the required bodyweight `<input>`. The weight field is pre-filled from the last check-in and is the only required field. Focusing it immediately means the user can adjust the value without tapping the field first, removing a friction point on a form opened once per week.

### Fix 2: RIR label tooltip in WorkoutSession
**File**: `src/pages/Training/WorkoutSession.tsx` — line ~152

Added `title="Reps In Reserve — how many more reps you could do"` to the `<span>RIR</span>` label beside the per-set RIR input. RIR is a powerlifting/bodybuilding term not universally known; the tooltip surfaces its meaning on hover without cluttering the compact set-logging UI.

---

## Commit
`c1a792a` — `[Phase 2+3] 2026-07-01: Add daily weigh-in rolling average; UX clarity fixes`

Pushed to `origin/master`.
