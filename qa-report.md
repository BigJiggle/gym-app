# PrepCoach QA Report — 2026-06-10

## Phase 1 — QA Engineer

### TypeScript
`npx tsc --noEmit` → **0 errors** at start of session and after all changes.

### Tests
`npm test` → **86 tests passed, 0 failed** across 6 test suites.

### Nutrition Engine Audit (`nutritionEngine.ts` + `foodDatabase.ts`)

- **Macro math**: protein = weight_kg × 2.3 g, fat = weight_kg × 0.9 g, carbs = (calories − protein×4 − fat×9) / 4. Correct.
- **Snack calorie allocation**: SNACK_CAL = 200 per snack; mainCalories = max(800, totalCal − snackCount×200). Correct; floor prevents degenerate plans.
- **getFood exclusion logic**: iterates `FOOD_SUBSTITUTES[id]`, skips foods present in exclusions set, falls back to `defaultStr`. Correct.
- **8 culture preferences**: indian, mexican, mediterranean, asian, west_african, japanese, korean, middle_eastern — all mapped, no dead branches.
- **SNACK_ONLY_FOODS gate**: `getFood(..., isMainMeal=true)` skips snack-only items in main meals. Correct.
- **No `TemplateFoodItem`, `calcPortionStr`, or `FOOD_CALORIES_PER_100G`** present — task description referenced architecture that doesn't exist. Current design uses hardcoded portion strings. Not a bug.

### User Flow Trace (7 flows, all verified correct)

| Flow | Result |
|---|---|
| Generate diet plan → buildMeals → meal count matches include_snacks setting | ✓ |
| Submit check-in → calorie delta → proportional meal scaling → getDietPlan reload | ✓ |
| Start workout → log sets → completeWorkout → activeWorkout cleared | ✓ |
| Skip workout → activeWorkout cleared | ✓ |
| Log meal completion → DB record returned → mealCompletions updated by real id | ✓ |
| Startup refresh → trainingUpdated / dietUpdated flags → conditional reload | ✓ |
| Settings "Save & Regenerate" → both plan generators fire | ✓ |

### Bugs Fixed in Phase 1: 1

**Bug: `plan:recalculateMacros` used stale onboarding weight** (`electron/ipc/planHandlers.ts`, line ~515)

The "Update Macros" button in the Diet page was calculating protein/fat targets from `user.weight_kg` (set at onboarding), not the athlete's current weight. After 10 weeks of cutting, this means macros were being set for their starting weight, not their current body. Fixed by querying `weekly_checkins` for the most recent `weight_kg` and falling back to `user.weight_kg` only if no check-ins exist.

---

## Phase 2 — Prep Athlete Feature

**Feature: Last-session performance shown on Dashboard exercise list** (`src/pages/Dashboard/index.tsx`)

*Rationale (prep athlete POV):* Walking into the gym 12 weeks out, the first thing you want to know is "what weight did I use last chest day?" You shouldn't have to start the workout timer just to see your previous numbers.

*Implementation:*

- Added `lastPerformanceMap` IIFE that scans `workoutHistory` (already loaded), sorted newest-first. For each exercise, finds the heaviest set from its most recent completed session.
- Enhanced the **Today card** exercise list: each exercise row now shows `last: Xkg × Y` (or `lbs` for imperial) in gray below the prescribed reps/RIR.
- Enhanced the **Rest Day → Next Training Day** preview: same last-performance hint so you can mentally prepare tomorrow's session tonight.
- No new IPC calls — pure derived state from existing `workoutHistory`.

TypeScript: 0 errors after change.

---

## Phase 3 — UX Simplicity Review

### Fix 1: "Save & Regenerate Plans" showed success before plans finished generating (`src/pages/Settings/index.tsx`)

**Problem:** `handleSaveProfile(regenerate=true)` called `generateTrainingPlan()` and `generateDietPlan()` without `await`. This meant `setEditSaved(true)` fired immediately, showing "✓ Saved" while the plans were still being generated in the background. The athlete had no way to know they should wait.

**Fix:** `await Promise.all([generateTrainingPlan(user.id), generateDietPlan(user.id)])` — the button now shows "Saving..." until both plans are ready, then transitions to "✓ Saved".

### Fix 2: "Next Meal" card vanished when all scheduled meal times had passed (`src/pages/Dashboard/index.tsx`)

**Problem:** The `find()` for the next upcoming meal returned `undefined` once `nowMins` was past the last meal's time (e.g., 11pm with Meal 6 unlogged). The card returned `null` and disappeared entirely, giving no nudge to eat the remaining meal.

**Fix:** Fall back to `unloggedMeals[0]` when no future meal is found. The card remains visible, showing `"not yet logged"` in amber instead of a time countdown.

---

## All Commits (this session)

| Hash | Message |
|---|---|
| `009d0f8` | [QA] 2026-06-10: fix recalculateMacros using stale onboarding weight |
| `ddd35c3` | [FEATURE] 2026-06-10: last-session performance on dashboard exercise list |
| `411952e` | [UX] 2026-06-10: await plan regeneration; show overdue meals in Next Meal card |

## Push: SUCCESS
