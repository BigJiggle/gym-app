# PrepCoach QA Report — 2026-06-23

## Run 1 — Phase 1 (QA Engineer)

### TypeScript
`npx tsc --noEmit` — **0 errors** (before and after fixes)

### Unit Tests
**Before fixes:** 104 tests, 9 suites — all passing  
**After fixes:** 105 tests, 9 suites — all passing (+1 vegetarian lunch assertion, extended sc=3 coverage)

### Nutrition Engine Audit — Bugs Found & Fixed (Run 1)

#### Bug 1 — Calorie sum overflow when snack_count=3
**File:** `electron/services/nutritionEngine.ts`  
**Root cause:** `mainCalories = Math.max(800, totalCal - totalSnackCal)` — the 800 kcal floor inflated main-meal calories when snack_count=3 on a low-calorie plan (e.g. 1200 kcal target → snacks consume 600 kcal → 600 kcal left for mains → floor kicks in at 800 → total becomes 1400, exceeding target by 200 kcal).  
**Fix:** Changed to `Math.max(0, totalCal - totalSnackCal)`.

#### Bug 2 — Vegetarian Lunch served chicken_breast
**File:** `electron/services/nutritionEngine.ts`, Lunch template  
**Root cause:** Lunch template had vegan and omnivore branches but no vegetarian branch. For `culture='any'`, `getCultureFood` returned the omnivore fallback, serving chicken_breast to vegetarian users.  
**Fix:** Added explicit `if (p === 'vegetarian')` branch using `plant_protein` key with `cottage_cheese` fallback.

#### Bug 3 — Dinner fat slot bypassed allergy exclusions (vegetarian path)
**File:** `electron/services/nutritionEngine.ts`, Dinner template, vegetarian fat slot  
**Root cause:** `getCultureFood(culturePref, 'fat', p, fallback)` missing the `exclusions` argument.  
**Fix:** Added `exclusions` as fifth argument.

#### Bug 4 — Dinner fat slot bypassed allergy exclusions (omnivore path)
**File:** `electron/services/nutritionEngine.ts`, Dinner template, omnivore fat slot  
**Root cause:** Same as Bug 3 — `exclusions` missing from `getCultureFood` in the omnivore dinner fat slot.  
**Fix:** Added `exclusions` as fifth argument.

### Training Engine Audit
All 4 training audit tests passed. Session count, unique days, deload phase detection, and empty session prevention all behave correctly.

### Food Database Audit
All 3 coverage tests passed: template scalable food IDs, FOOD_CATEGORY foods, and FOOD_SUBSTITUTES all have calorie entries.

### User Flow Traces (7 flows)
1. **Onboarding → first plan generation** — IPC chain correct; preload API surface verified.
2. **Daily diet tracking** — meal completion toggle, macro progress, all guarded with `?.` / `?? 0`.
3. **Weekly check-in submission** — duplicate-check guard, interval enforcement, macro recalculation on submit.
4. **Show management** — `setPrimary` throws for past shows; `cancelShow` transitions to off-season correctly.
5. **Settings → plan regeneration** — snack_count 0–3 all covered.
6. **Progress page** — empty state (0 check-ins) and single check-in handled gracefully.
7. **Peak week phase-awareness** — `getPhaseAwareDeficit(1, 'cut')` lighter than mid-prep; bulk+show override correct.

### Run 1 UX Fixes (Phase 3)

#### Fix 1 — Accessible labels on icon-only delete buttons
**File:** `src/pages/Dashboard/index.tsx`  
Added `aria-label` and `title` attributes to four unlabeled ✕ icon buttons.

#### Fix 2 — Low-contrast empty-state text
**File:** `src/pages/Dashboard/index.tsx`  
Changed "no cardio/posing/sleep logged" messages from `text-gray-600` to `text-gray-500` for better readability.

---

## Run 2 — Phase 1 (QA Engineer)

### TypeScript
`npx tsc --noEmit` — **0 errors**

### Unit Tests
**105/105 tests passed** (all 9 suites)

### Nutrition Engine Audit — Bugs Found & Fixed (Run 2)

#### Bug 5 — Afternoon Snack time 15:30 too close to Pre-Workout 16:00
**File:** `electron/services/nutritionEngine.ts`, snack template index 7  
**Root cause:** Afternoon Snack was scheduled at 15:30, only 30 minutes before Pre-Workout at 16:00. When snack_count ≥ 2, users see two back-to-back eating windows with a confusingly short gap.  
**Fix:** Changed `time` from `'15:30'` to `'15:00'`, giving a clean 1-hour buffer. Meal-time ascending-order test still passes (15:00 < 16:00).

### Domain Logic Verified
- `getPhaseAwareDeficit(undefined, 'maintain')` → 0 (off-season, no show)
- `getPhaseAwareDeficit(4, 'maintain')` < 0 (show approaching — mild deficit)
- `getPhaseAwareDeficit(1, 'cut')` < `getPhaseAwareDeficit(4, 'cut')` (peak week ease-off correct)
- `getPhaseAwareDeficit(8, 'bulk')` < 0 (bulk overridden by approaching show)
- `weight_kg=0` guard: protein_g > 0, calories_target is finite
- `meal_count=1` clamps to ≥ 3 meals

---

## Run 2 — Phase 2 (Prep Athlete Feature)

Phase 2 ran because Run 2 fixed only 1 bug (< 3 threshold).

### Feature: Meal Adherence Streak Counter
**File:** `src/pages/Diet/index.tsx`  
**Rationale:** Consecutive days of full meal plan compliance is the most-tracked daily prep metric after scale weight. Coaches ask "how many days in a row have you been on plan?" every check-in. The data was already available via `getMealCompletions` (IPC) but was never surfaced.

**Implementation:**
- Loads 30 days of meal completion history into local state (separate from the shared store's weekly window, preventing WeeklyView data corruption)
- Computes consecutive days (today inclusive if all meals logged) where `completions ≥ totalMeals`
- Renders a streak card in the Meal Plan tab between "Today's Intake" and "This Week" sections
- At 7+ days the card upgrades to show a week count (e.g., "1wk+")
- Zero-streak state shows "Start your streak today" with guidance text

**Impact:** Gives prep athletes and their coaches a single-glance consistency metric. No new IPC calls added; no existing functionality altered.

---

## Run 2 — Phase 3 (UX Simplicity Review)

### Fix 1 — Inline unit label on check-in weight input
**File:** `src/pages/CheckIn/index.tsx`  
**Issue:** The weight number input had no adjacent unit indicator. The unit (`kg` / `lbs`) appeared only in the Card title above, which becomes visually distant when focused on the input. Athletes who alternate between apps using different units can misread their entered value.  
**Fix:** Wrapped the input in a `flex items-center gap-2` div and added a `<span>{weightUnit}</span>` directly beside the field.

### Fix 2 — Rest-day indicator in Sessions This Week card
**File:** `src/pages/Training/index.tsx`  
**Issue:** On rest days (no session scheduled for today's weekday), the Sessions This Week card showed all session blocks in gray with no explanation. Athletes couldn't immediately tell whether they were on schedule or had missed a workout.  
**Fix:** Added a conditional note: "Today is a scheduled rest day — active recovery and sleep are part of the plan." shown when `!trainingPlan.sessions?.some(s => s.day_of_week === todayDow)`.

---

## Cumulative Summary

| Metric | Run 1 | Run 2 | Total |
|--------|-------|-------|-------|
| TypeScript errors | 0 | 0 | 0 |
| Unit tests | 105/105 | 105/105 | 105/105 |
| Bugs fixed | 4 | 1 | **5** |
| Features added | — | 1 | **1** |
| UX fixes | 2 | 2 | **4** |

### Known Non-Critical Issue (Not Fixed)
When `meal_count` changes mid-day and the plan is regenerated, existing today's meal completions at indices 0…min(old,new)−1 may map to wrong meals in the new plan. Self-correcting the next calendar day. Fix requires a meal fingerprint (name+index) rather than index-only storage — deferred as a schema migration.
