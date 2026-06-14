# App Health Report — 2026-06-14

## Phase 1: QA Engineer
- TypeScript: PASS (0 errors)
- Unit tests: PASS (86 tests, 6 test files)
- Bugs fixed: 3 (62 missing calorie entries + getCultureFood exclusion bypass + dal FOOD_CATEGORY gap)

### Nutrition Engine Audit
- calcPortionStr logic: OK — MEAL_CAL_FRACTIONS (protein 0.45, carb 0.35, fat 0.15), ROLE_FIXED_G (veg 120g, fruit 100g, powder 30g), ROLE_MIN/MAX_G clamps all sensible.
- Template TemplateFoodItems: OK — all 9 meal templates (0–8) pass valid `{ id, display, role, unitSuffix?, fixedLabel? }` objects to every `getFood()` call.
- getCultureFood coverage: OK — all 8 cultures define protein_main, carb_main, veg, fat, dairy, plant_protein; exclusion check now enforced (Bug 2 fix).
- FOOD_CALORIES_PER_100G coverage: **62 entries were missing** — all culture-specific and specialty foods in FOOD_CATEGORY now have calorie entries synced from foods.ts (Bug 1 fix).
- Macro math: OK — protein = weight_kg × 2.3g, fat = weight_kg × 0.9g, carbs fill remainder; resolvedSnackCount correctly falls back to include_snacks.
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
- Onboarding → plan gen: OK — `user:create` stores `meal_count` (min 3 enforced by UI) + `snack_count`; `plan:generateDiet` generates correct per-meal calorie splits.
- Diet page portions: OK — `plan:getDiet` returns pre-calculated food strings from `calcPortionStr` scaled to meal calorie budget.
- Meal completion: OK — `logMealCompletion` → `meals:logCompletion` IPC → UNIQUE INSERT; store recomputes daily macro totals from completions array.
- Check-in → recalc: OK — `checkin:submit` applies `calories_delta`, scales meal calories, reloads diet plan.
- Settings regen: OK — `handleSaveProfile(regenerate=true)` updates user then concurrently calls `generateTrainingPlan` + `generateDietPlan`.
- Workout flow: OK — start/logSet/complete IPC handlers; WorkoutSession pre-fills weights from last performance, shows all-time PR.
- Progress chart: OK — empty state CTA; chart from `checkinHistory`; projected show-day weight from trend rate.

### Bugs Fixed
1. **62 missing `FOOD_CALORIES_PER_100G` entries** (`electron/services/foodDatabase.ts`) — Cross-referenced all `FOOD_CATEGORY` keys against the food picker database (`src/data/foods.ts`). Every food in the food picker is selectable as a user preference; when `getFood()` returns a preference substitution it creates a TemplateFoodItem WITHOUT a fixedLabel, so `calcPortionStr()` must look up the calorie density. Missing entries caused a `(100g)` fallback: fat items (sesame_oil 884 kcal, macadamia_nuts 718, cotija_cheese 360, hummus 177) would serve 100g ≫ correct ~7–34g; low-density soups (miso_soup 35 kcal/100g, lentil_soup_me 70) would serve 100g ≪ correct ~280g. Fixed: added all 62 missing entries using authoritative values from foods.ts.

2. **`getCultureFood()` ignored `food_exclusions`** (`electron/services/nutritionEngine.ts`) — `getCultureFood()` had no exclusion-checking logic. A user with `culture_pref='indian'` who also excluded `chicken_tikka` or `dal` still received those foods in every generated meal. Fixed by adding `exclusions: string[]` parameter and an `isExcluded()` check before returning the culture food item; falls back to the template default (which has already been exclusion-checked via `getFood()`).

3. **`dal` missing from `FOOD_CATEGORY` and `FOOD_SUBSTITUTES`** (`electron/services/foodDatabase.ts`) — `dal` is the Indian culture `protein_alt` template food. It was absent from `FOOD_CATEGORY`, causing `getFood()`'s preference-substitution logic to silently skip the slot (category check returned `undefined`). No `FOOD_SUBSTITUTES['dal']` entry meant excluding dal fell back to dal itself. Fixed: added `dal: 'protein'` to FOOD_CATEGORY and `dal → [lentils, black_beans, chickpeas]` to FOOD_SUBSTITUTES. (Noted as "Known Issue" in prior session report.)

---

## Phase 2: Prep Athlete
- Status: SKIPPED (Phase 1 fixed 3 bugs — meets the ≥3 threshold)

---

## Phase 3: UX Reviewer
- Changes: 2

1. `src/pages/Diet/index.tsx` — **Regenerate Meals button gets amber background at rest.** Previously the button had amber text and a faint amber border but no fill, making it indistinguishable from a generic ghost button at a glance. Added `bg-amber-900/20 hover:bg-amber-900/40` and bumped border opacity to `border-amber-800/60` so the destructive action is visually flagged without hovering.

2. `src/pages/Diet/index.tsx` — **Next meal time label changes to brand color.** When a meal card is the upcoming "Next" meal (highlighted with the Next badge), its time label was `text-gray-600` — barely readable and identical to all other meal times. Changed to `text-brand-400 font-semibold` for that one card only, so the exact scheduled time of the next meal to eat pops alongside the Next badge.

---

## Push: SUCCESS
