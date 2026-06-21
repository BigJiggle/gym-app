# App Health Report — 2026-06-21

## Phase 1: QA Engineer
- TypeScript: PASS (0 errors found)
- Unit tests: PASS (86/86)
- Bugs fixed: 1 (code) + 3 (logic errors) = 4 total

### Nutrition Engine Audit
- calcPortionStr logic: OK — MEAL_CAL_FRACTIONS (0.45/0.35/0.15), ROLE_FIXED_G, and MIN/MAX clamps all sensible; portions scale correctly with per-meal calories.
- Template TemplateFoodItems: OK — every getFood() call in all 9 templates passes a valid TemplateFoodItem third arg with id/display/role.
- getCultureFood coverage (all 8 cultures): OK — every culture key returns a TemplateFoodItem; no plain strings or undefined returns.
- FOOD_CALORIES_PER_100G coverage: OK (complete) — verified via script that all template scalable IDs, all scalable substitutes, and all non-fixedLabel culture IDs have calorie entries.
- Macro math: OK — protein = weight*2.3, fat = weight*0.9, carbs = (cal - p*4 - f*9)/4; verified.
- Spot check output:
  - 80kg male, omnivore, 6 meals, cut, 8wk: 2361 kcal, P184/C244/F72. Breakfast 394 kcal: Oats 35g, Whole Eggs x3, Berries 100g, Almonds 10g.
  - 70kg female, vegan, 4 meals + 1 snack, maintain: 1967 kcal. Lunch 442 kcal: Tempeh 100g, Sweet Potato 180g, Spinach 120g, Avocado 30g. No NaN, no "undefined", no absurd portions.

### Logic & Domain Sanity
- Meal calorie sum vs daily target: OK — sum 2178 vs target 2175 (diff 3, within +/-80 tolerance).
- Meal time ordering: OK — 07:00 < 10:00 < 13:00 < 16:00 < 18:30 < 20:00, ascending in all templates (templates time-sorted before return).
- Protein g/kg range: OK — 2.3 g/kg (within 1.8-3.5 bodybuilding range).
- Fat g/kg minimum: OK — 0.9 g/kg (above 0.5 g/kg danger floor).
- Peak week calorie ease-off: OK — getPhaseAwareDeficit returns -200 at 0-1wk vs -600 at 8wk; muscles fill out on stage.
- Training session count vs frequency: FIXED — NaN/non-finite training_frequency previously sliced to 0 sessions (empty plan); now defaults to 4. freq 5->5, 7->6 (clamped), 0->2 (clamped).
- Deload at peak week: OK — determinePhase returns 'deload' at weeks_out <= 3; sets reduced, RIR raised.
- Show date / weeks_out edge cases: OK — computeWeeksOut clamps to Math.max(0,...); today/yesterday -> 0; setPrimary on past show throws; cancel transitions to off-season.
- Duplicate check-in same day: FIXED — both checkin:submit and checkin:submitMissed now reject a second check-in on a date that already has one (DUPLICATE_CHECKIN error), preventing duplicate week_numbers that corrupted the trend chart.
- Bulk+show goal conflict: OK — getPhaseAwareDeficit treats bulk+weeks_out as a cut deficit (comp prep overrides bulk intent).
- Input boundary guards: FIXED — weight_kg <= 0 / NaN now falls back to 70kg (previously yielded 0g protein/0g fat); meal_count clamped to >=3; weightTrend guards bodyweight<=0 against NaN/Infinity.

### User Flow Audit
- Onboarding -> plan gen: OK — generateNutritionPlan + generateTrainingPlan produce per-meal calorie targets; weight/freq guards now protect against bad onboarding input.
- Diet page portions: OK — meals render with portions scaled to each meal's calorie budget via calcPortionStr.
- Meal completion: OK — logMealCompletion/unlogMealCompletion persist to meal_completions; daily totals derive from it.
- Check-in -> recalc: OK — checkin:submit recalculates macros from the just-submitted weight and scales meals; duplicate-date guard added.
- Settings regen: OK — meal/snack count change triggers plan:generate with correct per-meal split.
- Workout flow: OK — session start/log/complete updates workoutHistory; stats reflect entries.
- Progress chart: OK — handles single check-in (weightTrend returns 0, no NaN) and empty state ("No check-ins yet").

### Bugs Fixed
- electron/services/trainingEngine.ts:475 — Invalid (NaN/non-finite) training_frequency was clamped via Math.min/Math.max leaving NaN, which sliced session arrays to empty -> a training plan with ZERO workouts and no error. Now rounds + validates finiteness, defaults to 4.
- electron/services/nutritionEngine.ts (generateNutritionPlan) — weight_kg of 0 or NaN produced 0g protein and 0g fat (physiologically impossible / dangerous output). Added guard: weight < 30 or non-finite falls back to 70kg.
- electron/ipc/checkinHandlers.ts (checkin:submit + checkin:submitMissed) — No guard against a second check-in on an existing check_in_date; duplicates produced overlapping week_numbers, making the "previous" lookup nondeterministic and corrupting the weight-trend chart. Both paths now throw DUPLICATE_CHECKIN.
- electron/services/checkinEngine.ts:23 — weightTrend divided by bodyweight with no zero guard; a 0 weigh-in yielded NaN/Infinity that silently broke every calorie-adjustment branch. Now returns 0 for bodyweight <= 0 / non-finite.

### Known Issues (not fixed)
- checkinEngine.weightTrend hardcodes weeksDiff = 1 and does not read show_date; week-over-week % is correct for the standard weekly cadence but is not a true show-date-aware "prep pace" projection. Left as-is — changing it risks altering established calorie-adjustment behavior covered by passing tests; flagged for a future show-date-aware projection.
- maintain goal at weeks_out = 4 returns a 0 deficit (pure maintenance). Left as-is by design: the show-driven flow sets goal=cut, so a maintain-goal user near a show is an unusual manual state and forcing a deficit could surprise users who deliberately chose maintenance.
- UTC (date('now')) vs local (en-CA) date comparison inconsistency between syncPrimaryToNearest and show handlers — only matters on a UTC/local boundary for a show dated exactly today; low impact, left as-is.

## Phase 2: Prep Athlete
- Status: SKIPPED — Phase 1 fixed 4 bugs (>= 3 threshold).
- Feature added: none
- Files changed: none

## Phase 3: UX Reviewer
- Changes: 2
- src/pages/Diet/index.tsx:1240 — AI Refine button loading label changed from bare "..." to "Refining..." so a tired user gets clear feedback their tap registered (and to match the "-ing..." convention used by every other async button on the page).
- src/pages/Diet/index.tsx:1294 — Meal-swap empty state rewritten from a dead-end note into actionable guidance pointing to the "Food Preferences" panel location, so the user knows exactly where to go to fix it.

## Push: SUCCESS
