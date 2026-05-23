# PrepCoach QA & UX Review — 2026-05-23

## Phase 1: QA Engineering

### TypeScript Health

| Check | Result |
|-------|--------|
| `tsc --project tsconfig.web.json --noEmit` (renderer) | **0 errors** (was 8 before fixes) |
| `npx vitest run` | **84/84 tests passed** |
| `tsc --project tsconfig.node.json --noEmit` (main process) | 164 lines of pre-existing errors — all SQLite JSValue binding issues in IPC handlers; unchanged by this review |

### Bugs Fixed (5)

#### 1. `ExerciseLogUpdate` missing `skipped` field — `src/types/index.ts`
**Severity:** Medium (runtime type mismatch, TypeScript error TS2353)
The `toggleRow` function in `WorkoutLogEditor.tsx` called `window.api.updateWorkoutSet(id, { skipped: newSkipped })`. The `ExerciseLogUpdate` interface lacked `skipped?`. The IPC handler already accepted it; only the TypeScript type was missing.
**Fix:** Added `skipped?: boolean` to `ExerciseLogUpdate`.

#### 2. `null` assigned to `number | undefined` in `autoSave` — `src/pages/Training/WorkoutLogEditor.tsx`
**Severity:** Medium (TypeScript error TS2322, incorrect values sent to IPC)
`autoSave` passed `null` for missing weight/reps/rir, but `ExerciseLogUpdate` uses `undefined` for optional fields. Passing `null` would serialise and potentially overwrite stored values.
**Fix:** Changed `null` → `undefined` for `weight_kg`, `reps_actual`, and `rir_actual`.

#### 3. Duplicate `const fatPct` declaration — `src/pages/Diet/index.tsx`
**Severity:** High (TypeScript error TS2451, compilation failure)
`fatPct` was declared twice in the same function scope: once for macro distribution percentages and once for today's fat intake progress bar.
**Fix:** Renamed the intake-progress variable to `fatIntakePct` and updated its 3 usages.

#### 4. `user` possibly null inside nested `trendStatus` — `src/pages/Progress/index.tsx`
**Severity:** Low (TypeScript error TS18047)
The outer `if (!user) return null` guard cannot narrow `user` inside the nested `trendStatus()` function under strict mode.
**Fix:** Added `user!.goal` non-null assertions for the two inner references.

#### 5. Cross-project TypeScript import (TS6307) — `src/pages/CheckIn/index.tsx`
**Severity:** High (compilation failure)
`CheckIn/index.tsx` imported `computeMissedSlots` from `../../../electron/services/checkinSchedule`, which is outside the `src/**/*` include boundary of `tsconfig.web.json`. This causes TS6307 ("File is not under 'rootDir'") and breaks incremental builds.
**Fix:** Created `src/utils/checkinSchedule.ts` containing the pure `computeMissedSlots` function and `MissedSlot` interface within the web project boundary. Updated the import in `CheckIn/index.tsx`.

### User Flow Traces

Seven flows were walked end-to-end against the source code:

| Flow | Status | Notes |
|------|--------|-------|
| 1. Onboarding (6-step wizard → plan generation) | Pass | All steps guarded; createUser → generateTrainingPlan → generateDietPlan sequence correct |
| 2. Diet tab — view plan, mark meals eaten, swap meal | Pass | toggleMealEaten / logMealCompletion / swapMeal wired correctly |
| 3. Training — start session, log sets, complete workout | Pass | startWorkout → logSet → completeWorkout; unit conversion in WorkoutSession correct |
| 4. Workout log editor — edit past sets, toggle skipped, delete | Pass (after fixes 1+2) | updateWorkoutSet type now accepts skipped; undefined passed for missing fields |
| 5. Check-in submission | Pass | Unit conversion to kg/cm before submit; schedule gating via getNextCheckinDate |
| 6. Progress page — weight trend, measurements chart | Pass (after fix 4) | trendStatus no longer emits TS error; chart data pipeline intact |
| 7. Settings — unit toggle, check-in schedule, API key | Pass | setSetting persists each field; unit label reactivity via useSettingsStore |

---

## Phase 2: Bodybuilder User Feature

**SKIPPED** — Phase 1 fixed 5 bugs (threshold is ≥ 3), so Phase 2 is skipped per the automation rules.

---

## Phase 3: UX Simplifications

### Change 1 — Diet page: promote Meals list above analytics

**Before:** Scroll order on the Plan tab: Macro summary → Today's intake → Weekly compliance strip → Weekly macro totals → Macro distribution bar → **Meals** → Disclaimer.

**After:** Macro summary → Today's intake → **Meals** → **Disclaimer** → Weekly compliance strip → Weekly macro totals → Macro distribution bar.

**Rationale:** The primary action on this screen is marking meals eaten and swapping them. Previously the user scrolled past four analytics sections to reach the meal cards. Moving meals up puts the actionable content immediately below the daily intake summary.

### Change 2 — Check-in page: pre-fill measurement fields from last check-in

**Before:** `waistDisplay`, `chestDisplay`, `hipDisplay`, `armDisplay`, `thighDisplay` all initialised to `''`.

**After:** Each field is pre-filled from `latestCheckin`'s corresponding value with imperial/metric conversion, matching the existing `weightDisplay` pre-fill pattern.

**Rationale:** Body measurements change slowly. Pre-filling last known values means users only update fields that changed, reducing form friction on every check-in.

---

## Summary

| Category | Count |
|----------|-------|
| TypeScript errors fixed (web project) | 5 |
| Tests passing after changes | 84 / 84 |
| UX improvements shipped | 2 |
| New files created | 1 (`src/utils/checkinSchedule.ts`) |
| Files modified | 5 |
