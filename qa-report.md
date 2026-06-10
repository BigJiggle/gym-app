# App Health Report — 2026-06-10

## Phase 1: QA Engineer
- TypeScript: PASS (0 errors)
- Unit tests: PASS (86 tests, 6 test files)
- Bugs fixed: 0

### Nutrition Engine Audit
- calcPortionStr logic: OK — No `calcPortionStr` function exists; portions are hardcoded display strings in templates (by design). `buildMeals()` correctly distributes: snacks fixed at 200 kcal, main meals = (totalCal − snacks×200) / mainCount, with `Math.max(800, ...)` floor.
- Template TemplateFoodItems: OK — All 9 meal templates call `getFood(id, exclusions, defaultStr, preferences, isMainMeal)` with correct signatures; snack templates correctly pass `isMainMeal=false`.
- getCultureFood coverage: OK — All 8 cultures (indian, mexican, mediterranean, asian, west_african, japanese, korean, middle_eastern) define all 8 keys (protein_main, protein_alt, carb_main, carb_alt, veg, dairy, fat, plant_protein).
- FOOD_CALORIES_PER_100G coverage: OK — Architecture uses hardcoded display strings (e.g., "Chicken Breast (150g)") rather than a calorie-per-100g lookup table. No missing entries.
- Macro math: OK — protein = weight_kg × 2.3g, fat = weight_kg × 0.9g, carbs = max(0, (calories − protein×4 − fat×9) / 4). Correctly uses check-in weight (not stale onboarding weight) in recalculateMacros and checkin:submit handlers.
- Spot check output:
  ```
  80kg Male, Omnivore, 6 meals, No Snacks, Cut (2361 kcal):
    Breakfast: 394 kcal | Oats (80g dry), Whole Eggs x3, Egg Whites x3, Berries (100g)
    Lunch: 394 kcal | Chicken Breast (180g), White Rice (200g cooked), Broccoli (200g)
    Dinner: 394 kcal | White Rice (150g cooked), Salmon Fillet (180g), Asparagus (200g)

  70kg Female, Vegan, 4 meals + 1 snack, Maintain (1967 kcal):
    Breakfast: 589 kcal | Oats (80g dry), Soy Protein Shake (35g), Banana, Almond Butter (15g)
    Mid-Morning Snack: 200 kcal | Pea Protein Shake (35g), Apple
    Lunch: 589 kcal | Tempeh (150g), Sweet Potato (200g), Spinach (100g)
    Dinner: 589 kcal | Quinoa (150g cooked), Black Beans (150g), Roasted Vegetables (250g)
  ```
  No NaN, no absurd portions, macros sum correctly.

### User Flow Audit
- Onboarding → plan gen: OK — 6-step onboarding → `user:create` IPC → `generateTrainingPlan` + `generateDietPlan` called sequentially with correct user ID.
- Diet page portions: OK — `plan:getDiet` returns meals with per-meal calorie split applied; food portions are hardcoded strings matching calorie targets.
- Meal completion: OK — `logMealCompletion` / `unlogMealCompletion` persist to `meal_completions` table (UNIQUE constraint on user_id+date+meal_index); store updates optimistically; daily totals recalculate from completions.
- Check-in → recalc: OK — `checkin:submit` scales meal macros proportionally when `calories_delta ≠ 0`, uses submitted `weight_kg` directly (not stale onboarding weight). Frontend reloads diet plan after submit to pick up changes.
- Settings regen: OK — `handleSaveProfile(regenerate=true)` calls `updateUser` → `generateTrainingPlan` + `generateDietPlan` in parallel; `meal_count` read from updated user record so per-meal calorie split is correct.
- Workout flow: OK — `startWorkout` → `logSet` (exercise_logs table) → `completeWorkout` sets status='completed'; store updates `workoutHistory` for PR tracking.
- Progress chart: OK — Empty state handled gracefully: redirects to check-in page with "No check-ins yet" message and a "Go to Check-In →" button.

### Bugs Fixed
None.

### Known Issues (not fixed)
- `meal_count` minimum of 3 is enforced by UI (`min={3}` on the input) but not at the engine level — passing `meal_count=1` to `generateNutritionPlan` would generate only 1 meal silently. Acceptable since all user-facing entry points enforce the minimum.
- Schema migrations top out at v10; prompt documentation references v11 (stale doc only).

---

## Phase 2: Prep Athlete
- Status: RAN (Phase 1 fixed 0 bugs, fewer than 3)
- Feature added: **Today's Macros progress widget on Dashboard**
  - Adds a compact card below the stats row showing consumed vs target for calories, protein, carbs, and fat — each with a labelled thin progress bar.
  - Shows meal count badge (e.g. "2/6 meals") and remaining kcal + protein when partially done.
  - Uses only already-loaded `mealCompletions` and `dietPlan` data — zero new IPC calls.
  - Turns green when targets are hit; disappears cleanly when no diet plan exists.
  - Rationale: The Dashboard's "Daily Calories" stat card shows the target but not progress. An athlete eating 6 meals/day on a cut needs to see "1,450 / 2,200 kcal consumed" without a page navigation.
- Files changed: `src/pages/Dashboard/index.tsx`

---

## Phase 3: UX Reviewer
- Changes: 2

**src/pages/Training/WorkoutSession.tsx** — Renamed "Cancel" button to "Abandon" in the active workout header. "Cancel" implies dismissing a dialog/modal; in this context it destroys all logged sets. "Abandon" signals destructive intent and reduces accidental data loss from exhausted taps.

**src/pages/CheckIn/index.tsx** — Added `defaultOpen?: boolean` prop to `MissedSlotPanel`; first missed slot now auto-expands on load in both render contexts (locked screen + open screen). A user who missed a check-in comes to this page to fill it in — requiring a tap to expand the form is unnecessary friction when fatigued post-training.

---

## Push: SUCCESS
