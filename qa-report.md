# App Health Report — 2026-06-22

## Phase 1: QA Engineer
- TypeScript: PASS (0 errors — clean before and after fixes)
- Unit tests: PASS (104 tests, 9 files — includes 24 new audit tests)
- Bugs fixed: 3 (2 logic/domain + 1 data-integrity)

### Nutrition Engine Audit
- calcPortionStr logic: OK — MEAL_CAL_FRACTIONS (0.45/0.35/0.15), ROLE_FIXED_G (veg 120 / fruit 100 / powder 30), and min/max clamps all sensible; fixedLabel short-circuits correctly.
- Template TemplateFoodItems: OK — every getFood() call across all 9 meal templates passes a valid {id, display, role, …} item; no plain strings or undefined returns.
- getCultureFood coverage (all 8 cultures): OK — every culture key returns a TemplateFoodItem across indian/mexican/mediterranean/asian/west_african/japanese/korean/middle_eastern; verified no "undefined"/NaN strings produced for any culture × diet combo.
- FOOD_CALORIES_PER_100G coverage: OK — audit-coverage test confirms every scalable template id, every non-veg FOOD_CATEGORY id, and every non-veg substitute subId has a calorie entry. Complete.
- Macro math: OK — protein = weight_kg × 2.3, fat = weight_kg × 0.9, carbs = (cal − P×4 − F×9)/4; verified ≈2.3 g/kg and ≈0.9 g/kg.
- Spot check output:
  - 80kg male / omnivore / 6 meals / 0 snacks / cut / 8wk → 2361 kcal, 184P/244C/72F; e.g. Breakfast 394 kcal: Oats (35g dry), Whole Eggs x3, Berries (100g), Almonds (10g).
  - 70kg female / vegan / 4 meals + 1 snack / maintain → 1967 kcal, 161P/189C/63F; e.g. Mid-Morning Snack 200 kcal: Pea Protein Shake (30g), Apple (100g); Lunch 442 kcal: Tempeh (100g), Sweet Potato (180g), Spinach (120g), Avocado (30g).

### Logic & Domain Sanity
- Meal calorie sum vs daily target: OK — sum within ±80 kcal of calories_target across meal_count 3-6 × snack_count 0-2.
- Meal time ordering: OK — templates sorted ascending by time; verified 07:00 < 10:00 < … < 21:00.
- Protein g/kg range: OK — 2.3 g/kg, within 1.8–3.5 competitive range.
- Fat g/kg minimum: OK — 0.9 g/kg, well above 0.5 g/kg floor.
- Peak week calorie ease-off: OK — getPhaseAwareDeficit eases at 0-1 wk (cut -200 vs mid-prep -700).
- Training session count vs frequency: OK — exactly N sessions for frequency N (2-6); 7 clamps to 6; 0/NaN default to sensible.
- Deload at peak week: OK — determinePhase returns 'deload' for weeks_out ≤ 3, getSets reduces sets and RIR rises to 3; verified avg sets lower than hypertrophy.
- Show date / weeks_out edge cases: OK — computeWeeksOut clamps to ≥0 (today/past → 0, never negative); shows:setPrimary throws on past show; cancellation transitions to off-season and clears show_date.
- Duplicate check-in same day: OK — both checkin:submit and checkin:submitMissed reject a second same-date entry with DUPLICATE_CHECKIN; week_numbers stay unique.
- Bulk+show goal conflict: OK — getPhaseAwareDeficit returns a cut deficit when bulk coexists with a show (weeks_out defined); off-season bulk keeps +300 surplus.
- Input boundary guards: OK — weight_kg < 30 / non-finite falls back to 70kg (no NaN/zero-protein); meal_count clamped to ≥3; training_frequency clamped to 2-6; check-in bodyweight guard prevents NaN trend.
- maintain at weeks_out=4: FIXED — see logic fix below.

### Logic Fix Applied
- maintain + upcoming show now applies a mild deficit — previously getPhaseAwareDeficit returned 0 for goal='maintain' regardless of weeks_out, so an athlete 4 weeks out on "maintain" got pure maintenance calories and would never reach stage condition. Now off-season maintain = 0, but maintain+show ramps -200 → -350 and eases to -150 at peak.

### User Flow Audit
- Onboarding → plan gen: OK — weeks_out computed from show_date (Math.max(0, …) with T12:00:00 anchor) and passed to both engines.
- Diet page portions: OK — all meal/macro reads null-guarded (?? 0), divide-by-zero guarded, full no-plan early return.
- Meal completion: OK — INSERT OR REPLACE + UNIQUE(user_id,date,meal_index); store de-dupes; no double count.
- Check-in → recalc: OK — recalc uses the just-submitted bodyweight (not stale onboarding weight) for protein/fat; meals scaled by calorie ratio.
- Settings regen: FIXED — orphaned meal_completions cleared on regen (see Bugs Fixed).
- Workout flow: OK — start/logSet/complete bind safely; completed detection skips non-completed logs.
- Progress chart: OK — 0 check-ins → empty state; 1 check-in → trend gated (no NaN); projection uses real show_date, no hardcoded prep length.

### Bugs Fixed
- electron/services/nutritionEngine.ts:67-79 — maintain goal ignored an upcoming show and applied zero deficit; now phase-aware deficit for maintain+show, true maintenance only off-season.
- electron/services/trainingEngine.ts (EXERCISE_LIBRARY) — minimal-equipment splits (bro/arnold) produced EMPTY sessions because shoulders/biceps/hamstrings had zero `minimal`-tier exercises. Added Pike Push-Up, Chin-Up (Bicep Focus), Towel/Band Curl, Nordic Curl (now minimal), and Single-Leg Hip Hinge so no muscle group is ever empty at minimal tier.
- electron/ipc/mealCompletionHandlers.ts (+ planHandlers.ts:183,222,316,483; showHandlers.ts) — diet regeneration with a reduced meal_count left orphaned meal_completions at now-invalid meal_index, inflating "meals eaten"/adherence counts. Added clearOrphanedMealCompletions(db, userId, newMealCount) wired into all 5 regeneration sites (Claude diet, rule-based diet, regenerateAll, startupRefresh, off-season regenerateDietForGoal); purges today+future orphans only, preserves historical record.

### Known Issues (not fixed)
- Vegetarian Lunch falls through to the omnivore branch (only vegan is special-cased), so a vegetarian gets a meat protein_main at Lunch when a culture is selected. Pre-existing; lower severity than the three fixed bugs — flagged for a future fix.

## Phase 2: Prep Athlete
- Status: SKIPPED (reason: 3 bugs fixed in Phase 1 ≥ 3 threshold)
- Feature added: none
- Files changed: none

## Phase 3: UX Reviewer
- Changes: 2
- src/pages/Dashboard/index.tsx:960-962 — replaced vague "Submit First Check-In" with "Log First Weigh-In →" plus a one-line subtitle so an exhausted athlete instantly knows what the action is.
- src/pages/CheckIn/index.tsx:553-554 — locked-state heading changed from "Next Check-In" to "Check-In Locked" and the wordy explanation shortened to "Not yet available. Your next check-in opens on:" for faster comprehension that the page is not actionable yet.

## Push: SUCCESS
