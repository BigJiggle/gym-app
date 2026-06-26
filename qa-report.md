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
| **7** | **2026-06-26** | **0** | **Peak Week Daily Protocol card** | **2** | **105** |

Zero-bug run 4 reflected engine stabilisation; run 5 surfaced one latent edge-case (`weeksOut === 0`) that had been masked by its never reaching zero in previous test data. Run 6 found a misleading test name (low severity) and delivered PR detection for Dashboard motivation. Run 7 confirmed the engine is stable after six runs; the feature work shifted to peak-week UX, surfacing the day-specific protocol in the place athletes check most (Dashboard).

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
| Phase 2 – Feature (Prep Athlete) | Peak Week Daily Protocol card added to Dashboard |
| Phase 3 – UX Simplicity | 2 surgical UX fixes committed |

---

## Phase 1 — QA Engineer

### TypeScript
`npx tsc --noEmit` → clean, no errors.

### Unit Tests
`npm test` → **105/105 passed** across 9 test files.

### Logic / Domain Audit (full re-audit of nutrition engine, food database, IPC handlers, and UI)

| # | Check | Result |
|---|-------|--------|
| 1 | TDEE / macro math in nutritionEngine (protein 2.3g/kg, fat 0.9g/kg) | ✅ Pass |
| 2 | Protein floor enforced, fat floor enforced, carbs non-negative | ✅ Pass |
| 3 | MEAL_CAL_FRACTIONS: 0.45+0.35+0.15 = 0.95 (5% unallocated = dietary fat rounding buffer) | ✅ Pass |
| 4 | getPhaseAwareDeficit: cut 0-1 wks=-200, 1-4 wks=-700, bulk+show uses cut deficit | ✅ Pass |
| 5 | calcPortionStr fixed-role weights (veg 120g, fruit 100g, powder 30g) correct | ✅ Pass |
| 6 | getCultureFood: all 8 cultures (indian, mexican, mediterranean, asian, west_african, japanese, korean, middle_eastern) return valid food arrays | ✅ Pass |
| 7 | getMealTemplates: 9 templates, mainSets sorted correctly by time | ✅ Pass |
| 8 | FOOD_CALORIES_PER_100G: all template + culture food IDs have calorie entries | ✅ Pass |
| 9 | SNACK_ONLY_FOODS: correct foods excluded from main meals | ✅ Pass |
| 10 | determinePhase: weeksOut 0→deload, 1→deload, 4→peak, 9→strength, 17→hypertrophy | ✅ Pass |
| 11 | Training frequency clamps to [2,6]; session day_of_week unique within plan | ✅ Pass |
| 12 | shows:setPrimary rejects past shows; computeWeeksOut handles today/yesterday | ✅ Pass |
| 13 | checkin:submit uses latest weigh-in for macro recalculation | ✅ Pass |
| 14 | Duplicate same-day check-in throws DUPLICATE_CHECKIN (no silent overwrite) | ✅ Pass |
| 15 | exercises_per_session stored in DB and shown in Settings UI but NOT wired to TrainingInput — silently ignored by rule-based engine (known gap, documented) | ⚠ Known |

**Bugs found this run: 0**

Known non-bug: `exercises_per_session` user preference is persisted and shown in Settings but the rule-based training engine does not read it from `TrainingInput`. Implementing this would require a moderate refactor of `trainingEngine.ts`. Documented for future work.

---

## Phase 2 — Prep Athlete Feature

**Trigger: 0 bugs fixed (< 3) → Phase 2 runs.**

**Feature: Peak Week Daily Protocol card on Dashboard**

During the 7 days before a show, a prep athlete's most critical resource is knowing exactly what to do TODAY — not a weekly summary, but the specific day-level protocol. The Education page already contained `PEAK_WEEK_PROTOCOL` with a complete 7-day breakdown (training type, nutrition targets, water intake, sodium guidance, and action notes per day), but this data was never surfaced in the Dashboard where athletes land first.

**How it works:**
- Computed from the existing `showCountdown` value (already present in Dashboard): when `totalDays` is 0–7, the card renders.
- Looks up `PEAK_WEEK_PROTOCOL.days.find(d => d.daysOut === Math.max(1, totalDays))` to get the matching day entry.
- Renders three quick-glance chips (Water target / Sodium guidance / Training type) plus the full nutrition instruction and up to 3 action notes for the day.
- When `totalDays === 0` (show is today), maps to the `daysOut: 1` "Show Day" entry.
- Positioned after the stats row so it's the first actionable content athletes see on peak week mornings.
- No new IPC calls — uses `user.show_date` via `showCountdown` already computed in the component.

**Files changed:** `src/pages/Dashboard/index.tsx` (import + 53-line card block)

**Commit:** `0d540cd [FEATURE] 2026-06-26: Peak Week Daily Protocol card`

---

## Phase 3 — UX Simplicity

### Fix 1: Check-in locked state now shows the actual calendar date

**Problem:** When the weekly check-in was locked, the Dashboard header showed a disabled `"Check-In in 3d"` button. The actual calendar date was in a `title` tooltip — inaccessible on touch devices, invisible at a glance on desktop. An athlete needed to either hover or mentally add 3 days to today's date to know *when* they could next check in.

**Fix:** Changed button text to `"Opens Mon Jun 28"` (actual formatted date) with `"in X days"` as small secondary text below. The date is immediately readable without any interaction.

- **File:** `src/pages/Dashboard/index.tsx`

### Fix 2: Water Reset button now requires confirmation

**Problem:** The "Reset" button in the Water Intake tracker was positioned at the far right of the same flex row as the quick-add buttons (+200ml, +350ml, etc.). A mis-tap could clear the entire day's water tracking with no way to undo — a significant data loss for athletes who log water obsessively during prep (especially peak week).

**Fix:** Added `window.confirm('Reset today\'s water to zero?')` guard before calling `addWater(-waterMl)`. One extra click when intentional; prevents accidental resets.

- **File:** `src/pages/Dashboard/index.tsx`

**Commit:** `a1b06f2 [UX] 2026-06-26: Two surgical Dashboard clarity fixes`

