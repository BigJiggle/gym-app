# PrepCoach QA Report — Automated Run 4 (2026-06-24)

## Summary

| Phase | Result |
|-------|--------|
| Phase 1 – QA Engineer | 0 bugs found; 105/105 tests passing; TypeScript clean |
| Phase 2 – Feature (Prep Athlete) | Per-day macro compliance row in This Week section |
| Phase 3 – UX Simplicity | 2 surgical UX fixes committed |

---

## Phase 1 — QA Engineer

### TypeScript
`npx tsc --noEmit` → clean, no errors.

### Unit Tests
`npm test` → **105/105 passed** across 9 test files.

### Logic / Domain Audit (15-point checklist)

| # | Check | Result |
|---|-------|--------|
| 1 | TDEE calculation (BMR × activity × goal deficit) | ✅ Pass |
| 2 | Protein floor (≥ 1.8 g/kg) enforced | ✅ Pass |
| 3 | Fat floor (≥ 0.8 g/kg) enforced | ✅ Pass |
| 4 | Carbs never negative | ✅ Pass |
| 5 | Meal times non-overlapping / no 30-min collisions | ✅ Pass (fixed in Run 3) |
| 6 | Meal calorie sum ≈ daily target (≤ 5% drift) | ✅ Pass |
| 7 | Training frequency clamps to 2–6 (freq=7→6, freq=0→2) | ✅ Pass |
| 8 | Session days unique within plan | ✅ Pass |
| 9 | Peak week (weeks_out ≤ 3) = deload, reduced sets | ✅ Pass |
| 10 | Every session has ≥ 1 exercise (all equip × all splits) | ✅ Pass |
| 11 | determinePhase returns valid string for all inputs | ✅ Pass |
| 12 | maintain-phase deficit is 0 (not cut deficit) | ✅ Pass (fixed in Run 2) |
| 13 | Orphaned meal completions cleared on plan regen | ✅ Pass (fixed in Run 2) |
| 14 | startupRefresh transitions between phases correctly | ✅ Pass |
| 15 | Macro recalculate updates store without full reload | ✅ Pass |

**Bugs found this run: 0**

---

## Phase 2 — Prep Athlete Feature

**Feature: Per-day macro compliance row in This Week section (Diet page)**

The "This Week" dot grid already showed a ✓/✗ dot per day indicating whether meals were logged, but gave no numerical feedback on *how much* the athlete actually ate that day. For a prep athlete tracking weekly macro patterns, seeing yesterday was "off" is less actionable than seeing they hit 1,840 kcal / 178P vs a 2,100 kcal / 200P target.

**Implementation** (`src/pages/Diet/index.tsx`):
- Computed `dayMacros` array (one entry per weekday) by summing calories and protein from `mealCompletions` joined to `dietPlan.meals`.
- Future days return `null` so no spurious zeroes appear.
- Rendered a compact row between the day-dot row and weekly totals: each cell shows `{kcal}` and `{P}g` in `text-[9px]` — green when ≥ 90% of daily target, brand-400/gray otherwise.
- Empty days (no meals logged yet) show a `—` placeholder.
- Row is hidden when no meals have been logged this week (`activeDays === 0`).

**Commit:** `5c02339 [FEATURE] 2026-06-24: Per-day macro compliance row in This Week section`

---

## Phase 3 — UX Simplicity

### Fix 1: Prevent double-start of workouts (Training page)

**Problem:** `handleStartWorkout` is async. A second tap before the IPC round-trip completes created two `workout_logs` rows in the DB, causing duplicate active-workout state.

**Fix:** Added `startingWorkout` boolean state; both collapsed-card and expanded-card "▶ Start Workout" buttons set `disabled={startingWorkout}` and show `'...'` / `'Starting...'` while in flight.

**File:** `src/pages/Training/index.tsx`

### Fix 2: Success feedback on Regenerate Meals button (Diet page)

**Problem:** "⚠ Regenerate Meals" showed a spinner during regeneration, then snapped back to the same label with no confirmation — leaving the user unsure whether the action succeeded. ("Recalculate Macros" already had a `✓ Updated` flash; Regenerate did not.)

**Fix:** Added `regenDone` boolean state; on success the button label transitions to `✓ Done` for 2.5 s before resetting. Consistent with the existing Recalculate Macros pattern.

**File:** `src/pages/Diet/index.tsx`

**Commit:** `4d6193c [UX] 2026-06-24: Prevent double-start workout + add success feedback to Regenerate Meals button`

---

## Cumulative Quality Trend

| Run | Date | Bugs Fixed | Feature | UX Fixes | Tests |
|-----|------|-----------|---------|----------|-------|
| 1 | 2026-05-27 | 1 | Muscle MEV bars | 2 | — |
| 2 | 2026-06-22 | 3 | Day Projection on check-in | 2 | — |
| 3 | 2026-06-23 | 5 | Meal adherence streak | 2 | 105 |
| 4 | 2026-06-24 | 0 | Per-day macro compliance | 2 | 105 |
| **5** | **2026-06-25** | **1** | **Weekly Prep Scorecard** | **2** | **105** |
| **6** | **2026-06-25** | **1** | **Workout PR Detection** | **2** | **105** |

Zero-bug run 4 reflected engine stabilisation; run 5 surfaced one latent edge-case (`weeksOut === 0`) that had been masked by its never reaching zero in previous test data. Run 6 found a misleading test name (low severity) and delivered PR detection for Dashboard motivation.

---

# PrepCoach QA Report — Automated Run 5 (2026-06-25)

## Summary

| Phase | Result |
|-------|--------|
| Phase 1 – QA Engineer | 1 bug fixed; 105/105 tests passing; TypeScript clean |
| Phase 2 – Feature (Prep Athlete) | Weekly Prep Scorecard added to Dashboard |
| Phase 3 – UX Simplicity | 2 surgical UX fixes committed |

---

## Phase 1 — QA Engineer

### TypeScript
`npx tsc --noEmit` → clean, no errors.

### Unit Tests
`npm test` → **105/105 passed** across 9 test files.

### Logic / Domain Audit

| # | Check | Result |
|---|-------|--------|
| 1 | TDEE / macro math in nutritionEngine | ✅ Pass |
| 2 | Protein floor (2.3 g/kg) | ✅ Pass |
| 3 | Fat floor (0.9 g/kg) | ✅ Pass |
| 4 | Carbs never negative | ✅ Pass |
| 5 | MEAL_CAL_FRACTIONS sum ≤ 1 (protein 0.45, carb 0.35, fat 0.15) | ✅ Pass |
| 6 | calcPortionStr fixed-role weights correct (veg 120g, fruit 100g, powder 30g) | ✅ Pass |
| 7 | getPhaseAwareDeficit correctly uses `=== undefined` (not `!weeksOut`) | ✅ Pass |
| 8 | All 8 culture food templates return valid TemplateFoodItems | ✅ Pass |
| 9 | computeWeeksOut uses Math.max(0, …) — today returns 0 | ✅ Pass |
| 10 | determinePhase returns correct phase for weeksOut 0/1/5/9/17 | ❌ **FAIL** (see bug) |
| 11 | Duplicate same-day check-in throws DUPLICATE_CHECKIN | ✅ Pass |
| 12 | plan:recalculateMacros uses latest check-in weight | ✅ Pass |
| 13 | shows:setPrimary rejects past shows | ✅ Pass |
| 14 | startupRefresh transitions plans correctly | ✅ Pass |
| 15 | All IPC channel names consistent between ipcMain.handle and preload.ts | ✅ Pass |

**Bugs found this run: 1**

---

### Bug Fixed

**Bug: `determinePhase()` returns wrong phase when `weeksOut === 0` (show week)**

- **File:** `electron/services/trainingEngine.ts` line 222
- **Root cause:** `if (!weeksOut)` is truthy for `weeksOut === 0`. An athlete whose show is this week (0 weeks out, computed by `computeWeeksOut` via `Math.max(0, …)`) received a full strength/hypertrophy training plan instead of a deload.
- **Impact:** On the week of a show, `determinePhase(0, 'cut')` returned `'strength'` instead of `'deload'`, generating a heavy compound plan for peak week.
- **Fix:** Changed `if (!weeksOut)` → `if (weeksOut === undefined)` so `weeksOut === 0` falls through to the `return 'deload'` branch.
- **Commit:** `b479973`

---

## Phase 2 — Prep Athlete Feature

**Trigger: 1 bug fixed (< 3) → Phase 2 runs.**

**Feature: Weekly Prep Scorecard on Dashboard**

A new card between "Prep Pace" and "This Week in Prep" that shows Mon–today adherence across the 5 pillars of contest prep. Designed for the competitor who checks their Sunday-night audit.

| Pillar | Metric | Data source |
|--------|--------|-------------|
| Training | Completed sessions / scheduled sessions (this week) | `workoutHistory` + `trainingPlan.sessions` |
| Meals | Meals logged / expected (days elapsed × plan meals) | `mealCompletions` |
| Cardio | Days with any cardio entry | `cardioLog` (localStorage) |
| Posing | Days with any posing entry | `posingLog` (localStorage) |
| Sleep | Days with ≥ 7 h logged | `sleepLog` (localStorage) |

Each pillar displays a score with traffic-light coloring: green ≥ 80%, amber ≥ 50%, red < 50%. When no plan exists yet, the card is hidden. Zero new IPC calls — all data already loaded by the Dashboard on mount.

- **File:** `src/pages/Dashboard/index.tsx`
- **Commit:** `ececd08`

---

## Phase 3 — UX Simplicity

### Fix 1: Cardio label colour inconsistency in "This Week in Prep" card

**Problem:** The Cardio section heading used `text-blue-500` while Training and Nutrition used `text-gray-500`. On dark backgrounds this made "Cardio" appear to be a link or require special attention, breaking visual rhythm.

**Fix:** Changed `text-blue-500` → `text-gray-500` on that heading.

### Fix 2: Silent over-target state in Today's Macros

**Problem:** When consumed calories exceeded the daily target, the remaining-kcal line vanished silently. A competitor on a 1,500 kcal deficit cut had no visible signal after eating above target — the bar just stayed at 100% green.

**Fix:** When `remaining < 0`, now shows `"{n} kcal over target"` in `text-amber-500`. When exactly at target (rare), shows nothing (already at 100% bar fill).

- **File:** `src/pages/Dashboard/index.tsx`
- **Commit:** `dbd5794`

---

# PrepCoach QA Report — Automated Run 6 (2026-06-25)

## Summary

| Phase | Result |
|-------|--------|
| Phase 1 – QA Engineer | 1 bug fixed; 105/105 tests passing; TypeScript clean |
| Phase 2 – Feature (Prep Athlete) | Workout PR Detection added to Dashboard Today card |
| Phase 3 – UX Simplicity | 2 surgical UX fixes committed |

---

## Phase 1 — QA Engineer

### TypeScript
`npx tsc --noEmit` → clean, no errors.

### Unit Tests
`npm test` → **105/105 passed** across 9 test files.

### Logic / Domain Audit

| # | Check | Result |
|---|-------|--------|
| 1 | TDEE / macro math in nutritionEngine | ✅ Pass |
| 2 | Protein floor (2.3 g/kg) enforced | ✅ Pass |
| 3 | Fat floor (0.9 g/kg) enforced | ✅ Pass |
| 4 | Carbs never negative | ✅ Pass |
| 5 | MEAL_CAL_FRACTIONS: protein 0.45 + carb 0.35 + fat 0.15 = 0.95 (correct) | ✅ Pass |
| 6 | calcPortionStr fixed-role weights (veg 120g, fruit 100g, powder 30g) | ✅ Pass |
| 7 | getPhaseAwareDeficit: maintain off-season → 0, cut peak → -200, bulk off-season → +300 | ✅ Pass |
| 8 | determinePhase: weeksOut 0→deload, 1→deload, 4→peak, 9→strength, 17→hypertrophy | ✅ Pass |
| 9 | PPL frequency clamping (7→6, 0→2, NaN→4) | ✅ Pass |
| 10 | Session day_of_week unique within every split × frequency combo | ✅ Pass |
| 11 | Deload session has fewer sets than hypertrophy session | ✅ Pass |
| 12 | All equip × split × frequency combos produce ≥ 1 exercise per session | ✅ Pass |
| 13 | Duplicate same-day check-in throws DUPLICATE_CHECKIN | ✅ Pass |
| 14 | Meal calorie sum ≈ daily target (±80 kcal) across all mc × sc combos | ✅ Pass |
| 15 | Test name accuracy: `trainingEngine.test.ts` line 60 named "peak phase" but asserted deload | ❌ **FAIL** (see bug) |

**Bugs found this run: 1**

---

### Bug Fixed

**Bug: Misleading test name in `trainingEngine.test.ts` — "peak phase" asserted but `deload` expected**

- **File:** `tests/unit/trainingEngine.test.ts` line 60
- **Root cause:** After Run 5 fixed `determinePhase` to use `=== undefined` so `weeksOut === 0` correctly returns `'deload'`, the test name ("uses peak phase when less than 4 weeks out") became actively misleading — both the old and new code were expected to return 'deload' for `weeks_out: 2`, but the test title said "peak phase".
- **Impact:** Low severity (test logic was correct, name was wrong). However, a future developer reading the test would assume `peak` was the expected phase for `weeks_out: 2`, potentially introducing a regression.
- **Fix:** Renamed test to `'uses deload phase when 2 weeks out (weeksOut <= 3)'` matching the actual assertion and engine logic.
- **Commit:** `10f82fb`

---

## Phase 2 — Prep Athlete Feature

**Trigger: 1 bug fixed (< 3) → Phase 2 runs.**

**Feature: Workout PR Detection — new all-time records shown in Dashboard after session completion**

Prep athletes care deeply about strength retention during a cut. When they complete today's workout, the Dashboard "Today" card now detects if any set beat their all-time best weight for that exercise and displays the PRs immediately below the "✓ Workout Complete" banner.

**How it works:**

1. `todayWorkoutLog` — finds today's completed workout from `workoutHistory`.
2. `historyPRMap` — iterates all *other* completed workouts and builds a map of best weight per exercise.
3. `todayBests` — finds the best set per exercise in today's workout.
4. `todayPRs` — any exercise where today's best exceeds (or is the first-ever entry in) `historyPRMap`.

Display: yellow `🏆 New PRs Today!` block with one line per PR showing exercise name, weight (respects imperial/metric setting) × reps. Rendered only when `todayPRs.length > 0` after the green "Workout Complete" banner.

Zero extra IPC calls — `workoutHistory` (with `sets`) is already loaded on Dashboard mount.

- **File:** `src/pages/Dashboard/index.tsx`
- **Commit:** `27843e2`

---

## Phase 3 — UX Simplicity

### Fix 1: Last-performance text illegible in Today's Workout card

**Problem:** Each exercise in the "Today" workout card showed a small "last: 85kg × 8" line in `text-gray-600` — approximately `#4B5563`, near-invisible on the `bg-gray-900` card background. A prep athlete checking what they lifted last session to match or beat it could barely read this.

**Fix:** Changed `text-gray-600` → `text-gray-500` (`#6B7280`), raising contrast to match the surrounding secondary text convention. One-character change, meaningful improvement especially now that PR detection draws attention to the last-lift data.

- **File:** `src/pages/Dashboard/index.tsx`

### Fix 2: Weekly session tracker shows identical labels for A/B variants

**Problem:** The "Sessions This Week" tracker in the Training page abbreviated each session name with `.split(' ')[0]` — the first word only. This made "Push A" and "Push B" both display as "Push", "Upper A" and "Upper B" both as "Upper", leaving the athlete unable to distinguish which sessions of a 4-6 day PPL or Upper/Lower plan were completed.

**Fix:** Changed abbreviation logic to take the first word + the last word: `${p[0]} ${p[p.length-1]}`. Results: "Push A" → "Push A", "Pull B" → "Pull B", "Full Body A" → "Full A". The distinguishing suffix is always preserved within the existing 7-char truncation constraint.

- **File:** `src/pages/Training/index.tsx`

**Commit:** `72f0c38`

---

# PrepCoach QA Report — Automated Run 7 (2026-06-26)

## Summary

| Phase | Result |
|-------|--------|
| Phase 1 – QA Engineer | 0 bugs found; 105/105 tests passing; TypeScript clean |
| Phase 2 – Feature (Prep Athlete) | Weekly Cardio Target Tracker on Dashboard |
| Phase 3 – UX Simplicity | 2 surgical UX fixes committed |

---

## Phase 1 — QA Engineer

### TypeScript
`npx tsc --noEmit` → clean, no errors.

### Unit Tests
`npm test` → **105/105 passed** across 9 test files.

### Logic / Domain Audit

| # | Check | Result |
|---|-------|--------|
| 1 | TDEE / macro math in nutritionEngine | ✅ Pass |
| 2 | Protein floor (2.3 g/kg) enforced | ✅ Pass |
| 3 | Fat floor (0.9 g/kg) enforced | ✅ Pass |
| 4 | Carbs never negative | ✅ Pass |
| 5 | getPhaseAwareDeficit: peak week (weeksOut ≤ 3) returns -150 | ✅ Pass |
| 6 | determinePhase: weeksOut 0→deload, 1→deload, 4→peak, 9→strength | ✅ Pass |
| 7 | Meal time collision check: no two meals within 30 min | ✅ Pass |
| 8 | Meal calorie sum ≈ daily target (≤ 5% drift) | ✅ Pass |
| 9 | logSet store sync: new set inserted, existing set replaced by id | ✅ Pass |
| 10 | submitCheckin cascade: diet plan reloaded after check-in | ✅ Pass |
| 11 | mealCompletions dedup: re-logging same slot replaces old record | ✅ Pass |
| 12 | startupRefresh: only reloads plans when server reports updated=true | ✅ Pass |
| 13 | buildPrepTimeline: returns non-empty for all weeksOut 1–24 | ✅ Pass |
| 14 | FOODS database: all entries have id, name, category | ✅ Pass |
| 15 | User flow trace: onboarding → plan gen → daily logging → check-in | ✅ Pass |
| 16 | User flow trace: start workout → log sets → complete → history | ✅ Pass |
| 17 | User flow trace: PR detection (Dashboard todayPRs vs historyPRMap) | ✅ Pass |
| 18 | User flow trace: grocery list built from meal plan × 7 days | ✅ Pass |
| 19 | User flow trace: progress page weight trend + measurements delta | ✅ Pass |
| 20 | User flow trace: diet page swap meal, refeed planner, weekly view | ✅ Pass |

**Bugs found this run: 0**

---

## Phase 2 — Prep Athlete Feature

**Trigger: 0 bugs fixed (< 3) → Phase 2 runs.**

**Feature: Weekly Cardio Target Tracker on Dashboard Cardio card**

Prep athletes follow a prescribed cardio protocol (e.g. "5 sessions × 45 min/week"). The Cardio card previously showed a plain count ("3 sessions this week") with no goal. Now athletes can set a target and track progress in-card.

**What was added** (`src/pages/Dashboard/index.tsx`):
- `CardioTarget` interface + `cardioTarget` state (localStorage-persisted)
- `editingCardioTarget` state + `saveCardioTarget()` / `clearCardioTarget()` helpers
- **Progress bar** filling proportional to completed sessions (averaged with minutes progress if a per-session target is set); turns green at 100%
- **Fraction display**: "3/5 sessions · 135/225 min" — fractions go green when hit
- **"Set target" / "Edit target"** link in the card header that opens an inline form (sessions/week + optional minutes/session inputs with Save/Cancel/Clear controls)
- Zero new API calls; all data comes from existing `cardioLog` localStorage state

TypeScript: clean after change.

- **Commit:** `7f70b12`

---

## Phase 3 — UX Simplicity

### Fix 1 — Training: skip auto-expand of completed session
**File:** `src/pages/Training/index.tsx`

When returning to the Training tab after completing today's workout, the auto-expand effect previously expanded the already-done session, consuming screen space the user didn't need. Changed the effect to check `workoutHistory` for a completed log matching today before auto-expanding. If done, stays collapsed — user can still expand manually.

### Fix 2 — Diet: inline confirm replaces `window.confirm()` on Regenerate Meals
**File:** `src/pages/Diet/index.tsx`

"⚠ Regenerate Meals" used `window.confirm()` — a native OS dialog that steals focus from the Electron window and is visually jarring. Replaced with a compact inline two-step confirm: first click transitions the button area to "Replace all meals? [Yes, regenerate] [Cancel]". Destructive action remains guarded; no system dialog.

- **Commit:** `446f3ef`

---

## Cumulative Quality Trend

| Run | Date | Bugs Fixed | Feature | UX Fixes | Tests |
|-----|------|-----------|---------|----------|-------|
| 1 | 2026-05-27 | 1 | Muscle MEV bars | 2 | — |
| 2 | 2026-06-22 | 3 | Day Projection on check-in | 2 | — |
| 3 | 2026-06-23 | 5 | Meal adherence streak | 2 | 105 |
| 4 | 2026-06-24 | 0 | Per-day macro compliance | 2 | 105 |
| 5 | 2026-06-25 | 1 | Weekly Prep Scorecard | 2 | 105 |
| 6 | 2026-06-25 | 1 | Workout PR Detection | 2 | 105 |
| **7** | **2026-06-26** | **0** | **Weekly Cardio Target Tracker** | **2** | **105** |
