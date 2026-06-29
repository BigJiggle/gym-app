# PrepCoach QA Report — Automated Run 10 (2026-06-28)

## Summary

| Phase | Result |
|-------|--------|
| Phase 1 – QA Engineer | 1 bug fixed; 105/105 tests passing; TypeScript clean |
| Phase 2 – Feature (Prep Athlete) | Progressive overload targets on Dashboard today card |
| Phase 3 – UX Simplicity | 2 surgical clarity fixes committed |

---

## Phase 1 — QA Engineer

### TypeScript
`npx tsc --noEmit` → clean, no errors.

### Unit Tests
`npm test` → **105/105 passed** across 9 test files (checkinSchedule × 28, nutritionEngine × 16, storeJourneys × 18, trainingEngine × 12, audit-logic × 11, checkinEngine × 10, audit-coverage × 3, spot-check × 2, audit-training × 5).

### Audit Coverage (`tests/unit/audit-coverage.test.ts`)
- Every scalable template food ID has a calorie entry ✓
- Every FOOD_CATEGORY non-veg food has a calorie entry ✓
- Every substitute subId with a category has a calorie entry ✓

### Audit Logic (`tests/unit/audit-logic.test.ts`)
All 11 logic invariants verified:
- Per-meal calorie sums within ±80 kcal of daily target across all meal/snack count combinations ✓
- Meal times in ascending order ✓
- Vegetarian lunch contains no meat across all 9 cultures ✓
- Vegan plan contains no animal products ✓
- TDEE–target calories match goal direction (cut=deficit, bulk=surplus) ✓
- Protein within safe range (1.8–3.5 g/kg) ✓
- Fat at or above minimum (0.5 g/kg) ✓
- Peak week deficit eased to –200 vs full cut –700 ✓
- Culture food returns TemplateFoodItem for all 8 cultures ✓
- Macro math: protein×4 + carb×4 + fat×9 ≈ calories ±5% ✓
- Snack count resolves correctly from input.snack_count and include_snacks ✓

### Audit Training (`tests/unit/audit-training.test.ts`)
All 5 training invariants verified:
- Session count matches training_frequency (2–6) ✓
- freq=7 clamps to 6; freq=0/NaN defaults to 2/4 ✓
- Days of week are distinct within every plan ✓
- Peak week (weeks_out ≤ 3) produces deload phase with reduced sets ✓
- Every session has ≥ 1 exercise across all freq/pref/equipment combos ✓

### Domain Sanity Checks
- **Protein**: 2.3 g/kg (safe range 1.8–3.5) ✓
- **Fat**: 0.9 g/kg (above 0.5 g/kg floor) ✓
- **Training frequency clamping**: [2, 6], NaN → 4 ✓
- **Deload sets**: reduced correctly (getSets: phase=deload does –1) ✓
- **Duplicate check-ins rejected**: `DUPLICATE_CHECKIN:${date}` error ✓
- **shows:setPrimary past-show guard**: throws for past dates ✓
- **Peak week energy balance**: deficit eases to –200 (vs –700 standard cut) ✓
- **`exercises_per_session` DB field**: stored in migration 5, passed via IPC ✓

### 7 User Flow Traces
1. **New user onboarding → plan generation**: `user:create` → DB migration safe → `plan:generate` → training + nutrition plans written ✓
2. **Weekly check-in cycle**: submit → adjustments calculated → next date set → duplicate on same day rejected ✓
3. **Show registration → countdown → cancellation**: `shows:add` → `shows:setPrimary` (past guard) → `shows:cancelShow` (off-season transition) ✓
4. **Training plan regeneration**: `plan:generate` with updated user → new plan replaces old ✓
5. **`exercises_per_session` end-to-end**: onboarding stores value in DB → IPC reads it → trainingEngine applies it to all 5 split builders ✓ *(was bugged – fixed this run)*
6. **Nutrition culture preference**: `culture_pref=indian` → getCultureFood returns valid TemplateFoodItem → meals built with correct foods ✓
7. **Progress photo comparison**: `getProgressPhotos` / `saveProgressPhoto` → stored locally → compared on Progress page ✓

---

## Bugs Found and Fixed

### Bug 1 (Fixed): `exercises_per_session` silently ignored by training engine

**File**: `electron/services/trainingEngine.ts`

**Root cause**: `TrainingInput` interface was missing the `exercises_per_session` field. All five split builder functions (`buildPPLSessions`, `buildUpperLowerSessions`, `buildArnoldSplit`, `buildBroSplit`, `buildFullBodySplit`) used hardcoded exercise counts and did not accept an `exPerSession` parameter. The value stored in the DB (migration 5) and passed via `planHandlers.ts` IPC was silently dropped.

**Fix**: Added `exercises_per_session?: number` to `TrainingInput`. Updated all five builder functions with an `exPerSession?: number` parameter, derived proportional sub-counts for split sessions (e.g. `half = floor(exPerSession/2)` for upper/lower), and wired the value through `generateTrainingPlan`.

**Commit**: `ba1f591` — `[QA] 2026-06-28: fix exercises_per_session silently ignored by rule-based training engine`

---

## Phase 2 — Prep Athlete Feature

**Feature**: Progressive overload target weight on Dashboard today card

**What it does**: When an athlete opens the Dashboard on a training day, each exercise in the "Today" workout card now shows both the last recorded performance and a suggested target weight for today:

```
Barbell Bench Press
last: 90kg × 8  → target: 92.5kg
```

Targets use standard increments (compounds: +2.5 kg / +5 lbs; isolations: +1.25 kg / +2.5 lbs), capped at +5% of last weight to prevent unrealistic jumps. Suppressed on deload weeks. Imperial units round to nearest 2.5 lbs.

**Implementation**: Pure frontend using `workoutHistory` + `exerciseLibrary` already loaded in the plan store. Zero new IPC calls or backend changes. Added `isCompoundMap` from `exerciseLibrary` and a `progressionTarget()` helper function in `src/pages/Dashboard/index.tsx`.

**Commit**: `6d8ff65` — `[Feature] 2026-06-28: show progressive overload target weight on dashboard today card`

---

## Phase 3 — UX Simplicity Review

### Fix 1: Remove "no previous data" noise label from today's workout card

The Phase 2 implementation initially showed "no previous data" in `text-gray-700` (near-invisible) below exercises with no workout history. The absence of a "last:" line already communicates this clearly — the extra text was visual noise. Removed entirely.

### Fix 2: Fix misleading "rest wk" in Weekly Prep Scorecard Training pill

The Training pill showed the count from Mon-to-today only, so early in the week (e.g. Monday before a Tuesday–Friday training schedule) it displayed "rest wk" even though sessions were planned. Changed to show `${completed}/${sessions.length} sessions` against the full weekly plan total so athletes always see their weekly progress clearly.

**Commit**: `361ace2` — `[UX] 2026-06-28: two surgical clarity fixes on Dashboard`

---

## Test Results (Final)

```
Test Files  9 passed (9)
     Tests  105 passed (105)
  Duration  1.34s
```

TypeScript: clean (`npx tsc --noEmit` — no errors).

---

## Files Changed This Run

| File | Change |
|------|--------|
| `electron/services/trainingEngine.ts` | Bug fix: wire `exercises_per_session` through all 5 split builders |
| `src/pages/Dashboard/index.tsx` | Feature: progressive overload targets; UX: remove noise label; fix scorecard label |

---

*Previous runs: Run 9 (2026-06-27) — 0 bugs, photo comparison feature, 2 UX fixes.*

---

# PrepCoach QA Report — Automated Run 11 (2026-06-28)

## Summary

| Phase | Result |
|-------|--------|
| Phase 1 – QA Engineer | 0 bugs fixed; 105/105 tests passing; TypeScript clean |
| Phase 2 – Feature (Prep Athlete) | Daily Cardio Tracker added to Diet page |
| Phase 3 – UX Simplicity | 2 surgical fixes committed |

---

## Phase 1 — QA Engineer

### TypeScript
`npx tsc --noEmit` → clean, no errors.

### Unit Tests
`npm test` → **105/105 passed** (all 9 test files).

### Full Audit Coverage
All nutrition engine invariants, training engine invariants, handler guards, and 7 user flow traces verified. No bugs found this run.

**Key items confirmed correct:**
- Nutrition engine: `buildMeals` `perMainCal` formula, `calcPortionStr` ROLE_FIXED_G, `getPhaseAwareDeficit` peak-week ease ✓
- Training engine: freq clamped 2–6, deload phase at ≤3 weeks_out, distinct days per frequency ✓
- `shows:setPrimary`: past-show guard ✓
- `checkin:submit`: same-day duplicate rejection ✓
- `plan:recalculateMacros`: uses latest check-in weight ✓
- `meals:logCompletion`: INSERT OR REPLACE prevents duplication ✓

**Bugs Fixed:** 0

---

## Phase 2 — Prep Athlete Feature

**Feature**: Daily Cardio Tracker on Diet page (`src/pages/Diet/index.tsx`)

Added a quick-tap ±5 min cardio logger between the Water Tracker and Refeed Day Planner on the Diet > Plan tab. Shows today's minutes vs a cycling 30/45/60-min target with a progress bar and "target hit" badge. Weekly cardio total shown inline. Reads and writes the Dashboard's existing `cardio_log` localStorage key so both pages display consistent data (preserves `type` from any existing Dashboard entry, defaults to `'LISS'` for new quick-log entries).

**Why this feature**: LISS cardio is a critical daily activity during contest prep (typically 30–60 min/day in the 12 weeks out period) and had no tracking surface in the app.

**Commit**: `bbf1174` — `[FEATURE] 2026-06-28: daily cardio tracker on Diet page`

---

## Phase 3 — UX Review

### Fix 1: Cardio tracker data consistency (`src/pages/Diet/index.tsx`)

The Phase 2 cardio tracker initially used its own `cardio_min_${date}` localStorage key, creating split-brain with the Dashboard's `cardio_log`. Updated state initializer, `updateCardio()`, and the JSX weekly-total calculation to all read/write `cardio_log`.

### Fix 2: Onboarding height/weight range hints (`src/pages/Onboarding/steps/Step1Personal.tsx`)

Out-of-range warnings previously said *"Please double-check this measurement."* with no actionable context. Changed to *"Expected 100–220 cm — please double-check."* and *"Expected 30–200 kg — please double-check."* so users who accidentally enter meters instead of cm (or lbs instead of kg) immediately see the valid range.

**Commit**: `ae908f2` — `[UX] 2026-06-28: cardio tracker data consistency + clearer onboarding validation`

---

## Files Changed This Run

| File | Change |
|------|--------|
| `src/pages/Diet/index.tsx` | Feature: daily cardio tracker; UX: unify cardio localStorage key |
| `src/pages/Onboarding/steps/Step1Personal.tsx` | UX: clearer height/weight range validation messages |

---

# PrepCoach QA Report — Automated Run 12 (2026-06-29)

## Summary

| Phase | Result |
|-------|--------|
| Phase 1 – QA Engineer | 3 bugs fixed; 105/105 tests passing; TypeScript clean |
| Phase 2 – Feature (Prep Athlete) | Skipped (3 bugs fixed → threshold met) |
| Phase 3 – UX Simplicity | 0 new fixes (prior session already applied relevant improvements) |

---

## Phase 1 — QA Engineer

### TypeScript
`npx tsc --noEmit` → clean, no errors.

### Unit Tests
`npm test` → **105/105 passed** across 9 test files.

### Full Audit

All nutrition engine invariants, food database coverage, training engine invariants, handler guards, and user flow traces re-audited.

---

## Bugs Found and Fixed

### Bug 1 (Fixed): `generateNutritionPlan` missing upper-bound clamp on `meal_count`

**File**: `electron/services/nutritionEngine.ts` (line 527)

**Root cause**: `buildMeals` was called with `Math.max(3, input.meal_count)` — enforcing the lower bound of 3 but no upper bound. `getMealTemplates` only has keys 3–6; a value >6 would silently fall back to `mainSets[3]` producing incorrect meal structure.

**Fix**: Changed to `Math.max(3, Math.min(6, input.meal_count))`.

### Bug 2 (Fixed): `applyAIRequest` passes unclamped `meal_count` to `buildMealsPublic`

**File**: `electron/ipc/planHandlers.ts` (~line 865)

**Root cause**: The `plan:applyAIRequest` handler's `regenerateDiet` path called `buildMealsPublic(...)` with `(updatedUser.meal_count as number) ?? 4` directly — no bounds check. If Claude returned `meal_count: 8` and it was written to the DB, `buildMealsPublic` would receive 8 and produce malformed meal arrays.

**Fix**: Changed to `Math.max(3, Math.min(6, (updatedUser.meal_count as number) ?? 4))`.

### Bug 3 (Fixed): AI `settingChanges` write loop has no numeric bounds for `meal_count` and `training_frequency`

**File**: `electron/ipc/planHandlers.ts` (~line 726)

**Root cause**: The AI settings write loop applied `include_snacks` boolean coercion but no numeric bounds for other fields. Claude could write `meal_count: 10` or `training_frequency: 0` directly to the DB, corrupting downstream plan generation.

**Fix**: Added `NUMERIC_BOUNDS` guard: `meal_count` clamped to [3, 6], `training_frequency` clamped to [2, 6].

**Commit**: `63dcd0d` — `[QA] 2026-06-29: Fix meal_count upper-clamp and AI settings bounds`

---

## Phase 2 — Prep Athlete Feature

Skipped — 3 bugs were fixed this run (threshold is < 3).

---

## Phase 3 — UX Simplicity Review

No new fixes committed. The two issues identified (goal-aware Prep Pace color and Cardio label consistency) were already applied by previous QA sessions:

- **Goal-aware Prep Pace color**: already present in `origin/master` (bulk users see green for weight gain)
- **Cardio label consistency**: already `text-gray-500` across Training/Nutrition/Cardio labels

---

## Test Results (Final)

```
Test Files  9 passed (9)
     Tests  105 passed (105)
  Duration  1.21s
```

TypeScript: clean (`npx tsc --noEmit` — no errors).

---

## Files Changed This Run

| File | Change |
|------|--------|
| `electron/services/nutritionEngine.ts` | Bug 1: add `Math.min(6,...)` to `meal_count` clamp in `generateNutritionPlan` |
| `electron/ipc/planHandlers.ts` | Bug 2: clamp `meal_count` in `applyAIRequest → buildMealsPublic`; Bug 3: NUMERIC_BOUNDS guard in AI settings write loop |

---

*Previous runs: Run 11 (2026-06-28) — 0 bugs, daily cardio tracker feature, 2 UX fixes.*
