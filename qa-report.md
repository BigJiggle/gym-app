# App Health Report — 2026-06-14

## Phase 1: QA Engineer
- TypeScript: PASS (0 errors)
- Unit tests: PASS (86 tests, 6 test files)
- Bugs fixed: 0

### Nutrition Engine Audit
- calcPortionStr logic: OK — MEAL_CAL_FRACTIONS (protein 0.45, carb 0.35, fat 0.15), ROLE_FIXED_G (veg 120g, fruit 100g, powder 30g), ROLE_MIN/MAX_G clamps all sensible; fallback `${display} (100g)` when calPer100g missing is safe.
- Template TemplateFoodItems: OK — all 9 meal templates pass valid `{ id, display, role, unitSuffix?, fixedLabel? }` objects to every `getFood()` call.
- getCultureFood coverage: OK — all 8 cultures (indian, mexican, mediterranean, asian, west_african, japanese, korean, middle_eastern) define protein_main, carb_main, veg, fat, dairy, plant_protein; all return TemplateFoodItem or fall back correctly.
- FOOD_CALORIES_PER_100G coverage: OK — every template fallback ID and culture food ID without fixedLabel has a caloric entry (`dal: 116`, `chicken_tikka: 148`, `basmati_rice: 121`, `jasmine_rice: 130`, `couscous: 112`, `paneer: 265`, `ghee: 900` all present).
- Macro math: OK — protein = weight_kg × 2.3g, fat = weight_kg × 0.9g, carbs = (calories − protein×4 − fat×9) / 4; `resolvedSnackCount` correctly falls back to legacy `include_snacks` field.
- Spot check output:
  ```
  80kg Male, Omnivore, 6 meals, No Snacks, Cut — 2361 kcal
    Lunch (394 kcal): Chicken Breast 105g, White Rice 105g cooked, Broccoli 120g, Almonds 10g
    Dinner (394 kcal): White Rice 105g cooked, Salmon Fillet 85g, Asparagus 120g

  70kg Female, Vegan, 4 meals + 1 snack, Maintain — 1967 kcal
    Mid-Morning Snack (200 kcal): Pea Protein Shake 30g, Apple 100g
    Dinner (442 kcal): Quinoa 130g cooked, Black Beans 150g, Roasted Veg 120g, Walnuts 10g
  ```
  No NaN, no undefined, no absurd portions.

### User Flow Audit
- Onboarding → plan gen: OK — `user:create` stores `meal_count` (main meals) + `snack_count` separately; `plan:generateDiet` reads both and generates correct per-meal calorie splits.
- Diet page portions: OK — `plan:getDiet` returns pre-calculated food strings from `calcPortionStr` scaled to each meal's calorie budget; snack calories fixed at 200, main meals split the remainder.
- Meal completion: OK — `logMealCompletion` → `meals:logCompletion` IPC → `INSERT OR REPLACE` with UNIQUE constraint; store recomputes daily macro totals from completions array.
- Check-in → recalc: OK — `checkin:submit` applies `calories_delta`, scales all meal calories by ratio, recomputes per-meal macros; `submitCheckin` in store then reloads diet plan from DB.
- Settings regen: OK — `handleSaveProfile(regenerate=true)` updates user then concurrently calls `generateTrainingPlan` + `generateDietPlan`, both reading updated user from DB.
- Workout flow: OK — start/logSet/complete IPC handlers work; WorkoutSession pre-fills weights from last session performance and shows all-time PR per exercise.
- Progress chart: OK — empty state shows clear "No check-ins yet" CTA; chart renders from `checkinHistory`; projected show-day weight computed from trend rate when ≥2 check-ins exist.

### Bugs Fixed
None. TypeScript compiled clean and all 86 tests passed on first run.

### Known Issues (not fixed)
- `dal` missing from `FOOD_CATEGORY` — user food preferences silently ignored for Indian culture dal slot; not a crash, only affects preference-swapping (rare edge case).
- No `FOOD_SUBSTITUTES` entry for `dal` — excluding "dal" falls back to dal itself; workaround via food picker.
- `getMealTemplates` silently truncates to 3 meals when `mealCount > 6`; UI caps at 6 so unreachable in practice.

---

## Phase 2: Prep Athlete
- Status: RAN (Phase 1 fixed 0 bugs, fewer than 3)
- Feature added: **Next meal visual highlight on Diet page**
  - `activeMealIndex` was already computed (first uncompleted meal by current time) but the variable was never used in the render — dead code.
  - Now: the upcoming meal card gets a brand-colored border + "Next" badge. Already-eaten cards are de-emphasized (opacity-50). A prep athlete on 6 meals/day can see at a glance which meal to eat without scanning the full list.
  - Zero new API calls — all state already existed.
- Files changed: `src/pages/Diet/index.tsx`

---

## Phase 3: UX Reviewer
- Changes: 2

1. `src/pages/Diet/index.tsx` — Renamed "⟳ Update Macros" button to "⟳ Recalculate Macros". The old label was ambiguous ("update" from what? to what?); "recalculate" makes it clear this re-derives protein/fat targets from your latest check-in weight without replacing your food list.

2. `src/pages/Diet/index.tsx` — Eaten meal cards now render at 50% opacity with a muted border; un-eaten cards stay at full opacity. On a 6-meal plan mid-day, the meals already ticked off visually recede and the remaining meals — especially the highlighted "Next" one — are immediately visible.

---

## Push: SUCCESS
