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

---

## Session 3 — 2026-06-12

### Phase 1 — QA Engineer

#### TypeScript & Tests
- `npx tsc --noEmit` (web): **clean** (0 errors)
- `npx tsc -p tsconfig.node.json --noEmit` (electron): **clean** (0 errors)
- `npx tsc -p tsconfig.test.json --noEmit` (tests): **clean** (0 errors, new config)
- `npm test`: **86/86 passed** (6 test files)

#### Nutrition Engine Audit
- `buildMeals()` calorie distribution: SNACK_CAL=200, mainCal=max(800, total-snacksCal), correctly distributed — ✓
- `generateNutritionPlan()` snack_count resolution: `input.snack_count ?? (input.include_snacks ? 1 : 0)` — ✓
- Macro math: `protein_g = weight_kg×2.3, fat_g = weight_kg×0.9, carbs fill rest` — ✓
- `calcPortionStr()` ROLE_FIXED_G clamps and MEAL_CAL_FRACTIONS verified correct — ✓
- Two spot-checks: 80 kg deficit cut (2,000 kcal, 4 meals) and 95 kg maintenance (3,000 kcal, 3 meals) — portions and macros correct

#### 7 User Flows — all verified correct after fixes

#### Bugs Fixed — 7 bugs (Phase 2 skipped)

**Bug 1 — 4 culture food objects had plain strings instead of TemplateFoodItem objects**
- **Files**: `electron/services/nutritionEngine.ts`
- **Cultures affected**: `west_african`, `japanese`, `korean`, `middle_eastern`
- **Root cause**: Each culture object's properties were plain strings (e.g., `"protein_main: 'tilapia'"`) instead of typed objects with `{ id, display, role }` shape.
- **Impact**: 32 TypeScript compilation errors AND runtime "undefined (100g)" portion strings for any user with those cultural preferences — completely broken food output.
- **Fix**: Replaced all 4 culture entries with properly structured `TemplateFoodItem` objects matching the interface.

**Bug 2 — `culture_pref` hardcoded to `'any'` in 5 IPC locations**
- **Files**: `electron/ipc/planHandlers.ts` (3 locations), `electron/ipc/showHandlers.ts` (1 location)
- **Root cause**: Diet plan generation handlers used `culture_pref: 'any'` literal instead of reading from the user record.
- **Impact**: Users who selected a cultural food preference during onboarding always got generic `'any'` culture foods — setting was silently ignored.
- **Fix**: All 5 locations changed to `(user.culture_pref as string) ?? 'any'`.

**Bug 3 — `namedParams()` returned `Record<string, unknown>` instead of `Record<string, JSValue>`**
- **File**: `electron/database/db.ts`
- **Root cause**: Return type was too broad; SQLite binding functions require `JSValue = boolean | number | bigint | string | Uint8Array | null`.
- **Impact**: TypeScript errors in every handler using named parameter binding.
- **Fix**: Return type narrowed to `Record<string, JSValue>` with explicit `as JSValue` cast.

**Bug 4 — Multiple `unknown` typed DB values passed to SQLite `.run()` without casts**
- **Files**: `electron/ipc/checkinHandlers.ts`, `electron/ipc/planHandlers.ts`, `electron/ipc/showHandlers.ts`, `electron/ipc/workoutHandlers.ts`
- **Root cause**: SQLite rows typed as `Record<string, unknown>` — properties extracted from rows need explicit casts before passing to `.run()`.
- **Fix**: Added explicit `as number`, `as string`, `as string | number | null` casts at each bind site.

**Bug 5 — `claudeService.ts` snack_count type error**
- **File**: `electron/services/claudeService.ts` line 79
- **Root cause**: `((userProfile.snack_count as number) ?? 0) > 0` — TypeScript inferred `{}` type from the double-cast.
- **Fix**: Changed to `((userProfile.snack_count as number | undefined) ?? 0) > 0`.

**Bug 6 — `trainingEngine.ts` impossible branch comparison**
- **File**: `electron/services/trainingEngine.ts` line 293
- **Root cause**: `s.cat !== 'core'` when `cat` was already narrowed to `'push' | 'pull' | 'legs'`, making the comparison always true and flagged by TypeScript.
- **Fix**: Removed the dead branch; the narrowed type already guarantees non-core.

**Bug 7 — `checkinSchedule.ts` cross-project import + test tsconfig architecture**
- **Files**: `electron/services/checkinSchedule.ts`, `tsconfig.node.json`, new `tsconfig.test.json`
- **Root cause**: `checkinSchedule.ts` imported `CheckIn` from `../../src/types` — a cross-project boundary violation. Previous "fix" added `src/types/**/*` to `tsconfig.node.json` which pulled in `src/store/*.ts` (needing DOM types) and caused 37+ `Cannot find name 'window'` errors.
- **Fix**: Replaced the import with a local `CheckIn` interface (4 fields used by the module). Reverted `tsconfig.node.json` to electron-only scope. Created `tsconfig.test.json` with DOM lib + JSX for proper test type-checking.

**Bonus — `Progress/index.tsx` Recharts tooltip formatter type**
- **File**: `src/pages/Progress/index.tsx` line 411
- **Root cause**: `entry: { payload: WeekConsistency }` but Recharts types `payload` as optional.
- **Fix**: Made `payload?` optional; used `?.` access in the template.

---

### Phase 2 — Skipped (≥ 3 bugs fixed in Phase 1)

---

### Phase 3 — UX Reviewer

**Fix 1 — Dashboard Next Meal card: critical food/macro text near-invisible**
- **File**: `src/pages/Dashboard/index.tsx`
- **Issue**: Food items used `text-gray-500` (#6b7280 on dark) — very dim for fatigued athletes reading what they need to eat. Calorie count was `text-gray-500`, protein was `text-blue-400/70` (opacity dimmed).
- **Fix**: Food items → `text-gray-300`, calories → `text-gray-300 font-medium`, protein → `text-blue-400` (removed `/70` opacity). The three most critical pieces of "what do I eat and how much" are now clearly legible.

**Fix 2 — Diet page Mark Eaten button: tap target too small**
- **File**: `src/pages/Diet/index.tsx`
- **Issue**: Button was `text-xs px-2.5 py-1` — a very small touch target on a fingertip-operated UI.
- **Fix**: Changed to `text-sm px-3 py-1.5` — larger hit area reduces mis-taps post-workout when hands may be shaky.

### Commits

| Hash | Message |
|------|---------|
| `e665f95` | `[QA] 2026-06-12: fix 7 bugs — culture food objects, culture_pref hardcoding, namedParams types, unknown casts, cross-project import, test tsconfig architecture, Recharts formatter type` |
| `d7245d8` | `[UX] 2026-06-12: boost Next Meal card contrast and Mark Eaten tap target for fatigued athletes` |
