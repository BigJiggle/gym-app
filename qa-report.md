# PrepCoach QA Report — 2026-06-09

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
| Profile save with regenerate → generateTrainingPlan + generateDietPlan fire without await | ✓ |

**Bugs fixed in Phase 1: 0**

---

## Phase 2 — Prep Athlete Feature

**Feature: All-time PR display during workout sessions**

*Problem:* `Training/index.tsx` shows per-exercise personal records (amber text) in the plan preview, but those PRs disappear the moment the WorkoutSession overlay opens. During an active workout the athlete has no reference for their all-time best weight.

*Implementation* (`src/pages/Training/WorkoutSession.tsx`):

- Added `allTimePR` useMemo that scans all completed `workoutHistory` entries and picks the highest display-unit weight per exercise name, running once at session mount.
- Added `pr?: LastPerf` prop to `ExerciseCard`.
- ExerciseCard renders a purple `PR: X kg × Y` line beneath the last-session reference, but only when the all-time PR exceeds the last session weight (avoids duplicating information when they're the same lift).
- No new IPC calls — uses existing `workoutHistory` already loaded by the Training page.

TypeScript: 0 errors after change.

---

## Phase 3 — UX Simplicity Review

### Fix 1: Diet page "✓ Eaten" button — hover reveals undo intent (`src/pages/Diet/index.tsx`)

**Problem:** The "✓ Eaten" button had no hover styling in the eaten state. An athlete who mistakenly marks a meal eaten had no visual cue that clicking the green button again would unmark it. The uneaten state had a hover effect; the eaten state did not.

**Fix:** Added `hover:bg-red-900/20 hover:border-red-800/50 hover:text-red-400` to the eaten button class, and `title="Click to unmark"` tooltip. On hover the button shifts from green to a subtle red tint — a standard "destructive undo" signal — without changing the resting appearance.

### Fix 2: Dashboard "Today's Meals" done rows — hover reveals undo intent (`src/pages/Dashboard/index.tsx`)

**Problem:** Same pattern as Fix 1: meal rows marked as done on the dashboard had `bg-green-950/20` but no hover state. Clicking would toggle the meal off but nothing signalled this was possible.

**Fix:** Added `hover:bg-red-950/20` to the done row's class and `title="Click to unmark"` — mirrors the Diet page fix for consistency.

---

## Commits

| Hash | Message |
|---|---|
| `1c5b19b` | [FEATURE] 2026-06-09: All-time PR display during workout sessions |
| `724dc20` | [UX] 2026-06-09: Hover feedback on toggleable eaten/meal buttons |

## Push: SUCCESS
