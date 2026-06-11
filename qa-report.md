# QA Report — 2026-06-11

## Phase 1 — QA Engineer

### TypeScript & Tests
- `npx tsc --noEmit`: **clean** (0 errors)
- `npm test`: **86/86 passed** (6 test files)

### Nutrition Engine Audit (`electron/services/nutritionEngine.ts`)
- `getFood(id, exclusions, defaultStr, preferences?, isMainMeal?)` signature verified correct throughout
- `buildMeals()` snack logic: `SNACK_CAL = 200`, per-snack fixed; `mainCal = max(800, totalCal - totalSnackCal) / mainCount` — no floor bypass possible
- `getCultureFood()` covers all 8 cultures (indian, mexican, mediterranean, asian, west_african, japanese, korean, middle_eastern)
- `generateNutritionPlan()` respects `include_snacks` flag; UI enforces minimum 3 meals
- `SNACK_ONLY_FOODS` correctly guards snack foods from main-meal preference substitution

### Food Database Audit (`electron/services/foodDatabase.ts`)
- All template food IDs present in `FOOD_CATEGORY` and `FOOD_SUBSTITUTES`
- `EXCLUSION_ALIASES` maps common names to canonical IDs correctly
- No stale `FOOD_CALORIES_PER_100G` reference (removed in prior version)
- 8 culture preference sets verified non-empty

### 7 User Flows Traced
1. **Onboarding → Diet Plan generation** — `plan:generate` → `buildMeals()` → DB write ✓
2. **Daily meal logging** — `meals:logCompletion` → `meal_completions` table ✓
3. **Food swap** — `plan:swapFood` → replaces single food item in meals JSON ✓
4. **Recalculate macros** — `plan:recalculateMacros` → IPC handler ✓ (Bug 1 fixed here)
5. **Weekly check-in submit** — `checkin:submit` → `calculateAdjustments()` → diet plan update ✓ (Bug 2 fixed here)
6. **Workout session log** — `training:logWorkout` → `workout_logs` + sets tables ✓
7. **Retroactive missed check-in** — `checkin:submitMissed` → week_number renumber + insert ✓

### Bugs Fixed — 2 bugs

**Bug 1 — `plan:recalculateMacros` wiped user food swaps**
- **File**: `electron/ipc/planHandlers.ts`
- **Root cause**: Handler called `buildMealsPublic(...)` which fully regenerated all meal food lists, discarding any ingredient swaps the athlete had made. The UI tooltip said "keeps your meal structure" — this was false.
- **Fix**: Replaced `buildMealsPublic` call with in-place macro scaling. Macro ratios (`proteinCalRatio`, `fatCalRatio`) derived from new weight-based targets; applied to each meal's existing calorie budget. `m.foods` array preserved intact.

**Bug 2 — Per-meal macros inconsistent after check-in calorie adjustment**
- **File**: `electron/ipc/checkinHandlers.ts`
- **Root cause**: When a weekly check-in triggered a calorie adjustment, per-meal protein/fat/carbs were scaled by `ratio = newCal/oldCal`. For an 80 kg athlete on a cut where calories drop 100 kcal/week, protein was scaled proportionally rather than recalculated from bodyweight. This drifted protein targets away from the correct `weight_kg × 2.3g` formula.
- **Fix**: After scaling meal calories by `ratio`, macros within each meal now use the same `proteinCalRatio = (protein_g * 4) / newCalories` formula as `buildMeals()`. Plan-level and per-meal macros are now consistent.

---

## Phase 2 — Prep Athlete Feature (< 3 bugs fixed → feature added)

**Feature: "Eat Now" time-aware active meal indicator**
- **File**: `src/pages/Diet/index.tsx`
- **What it does**: Computes `activeMealIndex` from current time and `mealCompletions` state — the most overdue uncompleted meal, or if none is overdue, the next upcoming one. Highlights that meal card with `border-brand-500 ring-1 ring-brand-500/30` and an inline "Eat Now" badge next to the meal name.
- **Why it's useful**: At 10 weeks out on a multi-meal plan, an exhausted athlete doesn't want to scroll through 6 meals to figure out which one they should be eating right now. One glance shows the active meal.
- **IPC calls added**: 0 — purely derived from existing `mealCompletions` store state and `Date.now()`.

---

## Phase 3 — UX Simplicity Review

### Pages Reviewed
- Dashboard, Diet, CheckIn (open form + locked state), Training

### Issues Found & Fixed — 2 fixes

**Fix 1 — Dashboard: "+N more items" food overflow text was near-invisible**
- **File**: `src/pages/Dashboard/index.tsx`
- **Issue**: The "Next Meal" card showed up to 3 food items, then `+{n} more items` in `text-gray-700`. On a dark background, `gray-700` (#374151) is essentially invisible, so athletes could miss that a meal had more items (e.g., a supplement or a side).
- **Fix**: Changed to `text-gray-500` — readable, still secondary to the main food list.

**Fix 2 — CheckIn: Auto-fill training adherence note was near-invisible**
- **File**: `src/pages/CheckIn/index.tsx`
- **Issue**: When training adherence was auto-calculated from logged workout sessions, the "Auto-filled: X of ~Y planned sessions" note used `text-gray-600` — barely visible. Athletes couldn't tell the value was computed (not just the 90% default), so they'd skip verifying it.
- **Fix**: Changed to `text-gray-500` — legible, still visually subordinate to the slider.

### No-change items
- CheckIn locked screen: clear schedule display, edit-last-check-in panel, and missed-slots fill-in are all well-labeled and discoverable.
- Diet ⚠ Regenerate button: destructive action already guarded by `window.confirm()` dialog with clear copy.
- Training empty state: "No training plan generated yet" + Generate button is direct and actionable.

---

## Commits

| Hash | Message |
|------|---------|
| `5ca97eb` | `[QA] 2026-06-11: fix per-meal macro accuracy in recalculate and check-in handlers` |
| `4083edf` | `[FEATURE] 2026-06-11: Eat Now indicator — highlight active meal in diet plan` |
| `bc51826` | `[UX] 2026-06-11: improve readability of near-invisible hint text` |
| `3078588` | `[FEATURE] 2026-06-11: Weekly nutrition summary on Diet page` |
| `e23d1b9` | `[UX] 2026-06-11: Auto-fill diet adherence from meal completion logs` |

---

## Session 2 — 2026-06-11 (continuation)

### Phase 1 — QA (re-run)
- `npx tsc --noEmit`: **clean** (0 errors)
- `npm test`: **86/86 passed**
- Full audit of nutritionEngine.ts + foodDatabase.ts: **0 new bugs** (prior session's fixes are in place and correct)
- All 7 user flows re-traced: all correct

### Phase 2 — Feature: Weekly Nutrition Summary on Diet page

**File:** `src/pages/Diet/index.tsx`

**What it does:** Inserts a "This Week" card between "Today's Intake" and the meals list on the Diet plan tab. The card shows:
- A 7-dot grid (Mon–Sun) where each dot displays: future (blank), partial (number of logged meals), fully completed (✓), or missed (—). Today's dot has a ring highlight.
- A "X/Y days on plan" badge.
- A 2-column footer row: calories logged this week vs target, protein logged this week vs target (targets prorated to days elapsed).

**IPC calls added:** 0 — uses `mealCompletions` and `dietPlan` already loaded on the plan tab.

### Phase 3 — UX Fix: Diet Adherence Auto-Fill on Check-In

**File:** `src/pages/CheckIn/index.tsx`

**Problem:** Training adherence already auto-fills from logged workout history with a "Auto-filled: X of ~Y sessions" hint. Diet adherence defaulted to 90% with no auto-calculation, forcing athletes to estimate manually — an inconsistency that caused inaccurate data.

**Fix:** A `useEffect` calls `window.api.getMealCompletions()` directly (bypassing the store to avoid overwriting the Diet page's week-range data), computes `logged_meals / (meals_per_day × days_since_last_checkin)` as a percentage, pre-fills the Diet Adherence slider, and displays a matching "Auto-filled: X of ~Y expected meals logged — adjust if needed" hint.
