# App Health Report — 2026-06-12

## Phase 1: QA Engineer
- TypeScript: PASS (0 errors)
- Unit tests: PASS (86/86)
- Bugs fixed: 11

### Nutrition Engine Audit

- **calcPortionStr logic**: OK — MEAL_CAL_FRACTIONS (protein 0.45, carb 0.35, fat 0.15), ROLE_FIXED_G (veg 120g, fruit 100g, powder 30g), min/max clamps all correct.
- **Template TemplateFoodItems**: OK — all 9 meal templates (Breakfast through Evening Snack) pass correctly structured `{ id, display, role, unitSuffix?, fixedLabel? }` objects to `getFood()`.
- **getCultureFood coverage**: OK — all 8 cultures (indian, mexican, mediterranean, asian, west_african, japanese, korean, middle_eastern) return valid TemplateFoodItems for every slot (protein_main, carb_main, carb_alt, veg, fat, dairy, plant_protein).
- **FOOD_CALORIES_PER_100G coverage**: FIXED — 11 missing entries added: sardines, anchovies, oysters, mussels, clams, squid (shellfish/fish group); sunflower_seed_butter (nut allergy substitute chain); soy_milk, oat_milk, almond_milk (dairy substitute milks); white_potato (sweet_potato substitute).
- **Macro math**: OK — protein = weight_kg × 2.3g, fat = weight_kg × 0.9g, carbs = (calories − protein×4 − fat×9) / 4. Correct in both `generateNutritionPlan` and `checkin:submit` re-scaling.

### Spot Check Output

**80kg Male, Omnivore, 6 meals, No Snacks, Cut:**
```
Calories: 2361, Protein: 184g, Carbs: 244g, Fat: 72g
  Breakfast      | 394 cal | Oats (35g dry), Whole Eggs x3, Berries (100g), Almonds (10g)
  Mid-Morning    | 394 cal | Brown Rice (125g cooked), Chicken Breast (105g), Broccoli (120g), Almonds (10g)
  Lunch          | 394 cal | Chicken Breast (105g), White Rice (105g cooked), Broccoli (120g), Almonds (10g)
  Pre-Workout    | 394 cal | Rice Cakes x3, Whey Protein Shake (30g), Apple (100g)
  Post-Workout   | 394 cal | White Rice (105g cooked), Whey Protein Shake (30g), Banana (100g)
  Dinner         | 394 cal | White Rice (105g cooked), Salmon Fillet (85g), Asparagus (120g)
```
No absurd portions. No NaN. No undefined.

**70kg Female, Vegan, 4 meals + 1 snack, Maintain:**
```
Calories: 1967, Protein: 161g, Carbs: 189g, Fat: 63g
  Breakfast         | 442 cal | Oats (40g dry), Soy Protein Shake (30g), Banana (100g), Almond Butter (10g)
  Mid-Morning Snack | 200 cal | Pea Protein Shake (30g), Apple (100g)
  Lunch             | 442 cal | Tempeh (100g), Sweet Potato (180g), Spinach (120g), Avocado (30g)
  Pre-Workout       | 442 cal | Rice Cakes x3, Pea Protein Shake (30g), Apple (100g)
  Dinner            | 442 cal | Quinoa (130g cooked), Black Beans (150g), Roasted Vegetables (120g), Walnuts (10g)
```
Snack correctly fixed at 200 cal. Main cal = (1967 − 200) / 4 = 442. ✓

### User Flow Audit
- **Onboarding → plan gen**: OK — `user:create` stores snack_count + meal_count; `plan:generateDiet` + `plan:generateTraining` both called with correct calorie targets per meal.
- **Diet page portions**: OK — `plan:getDiet` returns stored meals; food portions scale to each meal's calorie budget at generation time via `calcPortionStr`.
- **Meal completion**: OK — `meals:logCompletion` / `meals:unlogCompletion` persist to `meal_completions` table; daily totals update reactively in the Diet page.
- **Check-in → recalc**: OK — `checkin:submit` uses current check-in weight_kg for protein/fat targets, scales existing meal calories by ratio, updates `diet_plans` without regenerating food lists.
- **Settings regen**: OK — `handleSaveProfile(true)` awaits `updateUser` first, then calls `generateDietPlan` which reads the freshly saved meal_count/snack_count from DB.
- **Workout flow**: OK — `workout:start` → `workout:logSet` → `workout:complete` chain works; workoutHistory updated; stats reflect new entry.
- **Progress chart**: OK — empty state at `checkinHistory.length === 0` shows "No check-ins yet" with link to Check-In; chart only renders when `progressEntries.length > 0`.

### Bugs Fixed

| # | File | Issue | Fix |
|---|------|-------|-----|
| 1 | `foodDatabase.ts` | `sardines` missing from FOOD_CALORIES_PER_100G — calcPortionStr fell back to `(100g)` in substitution chains reaching sardines | Added `sardines: 208` |
| 2 | `foodDatabase.ts` | `anchovies` missing — same fallback issue | Added `anchovies: 131` |
| 3 | `foodDatabase.ts` | `oysters` missing from FOOD_CALORIES_PER_100G | Added `oysters: 81` |
| 4 | `foodDatabase.ts` | `mussels` missing from FOOD_CALORIES_PER_100G | Added `mussels: 86` |
| 5 | `foodDatabase.ts` | `clams` missing from FOOD_CALORIES_PER_100G | Added `clams: 74` |
| 6 | `foodDatabase.ts` | `squid` missing from FOOD_CALORIES_PER_100G | Added `squid: 92` |
| 7 | `foodDatabase.ts` | `sunflower_seed_butter` missing — first substitute for almond_butter under nut allergy; would show "(100g)" = 614 kcal of seed butter in a fat slot (wildly over-portioned) | Added `sunflower_seed_butter: 614` |
| 8 | `foodDatabase.ts` | `soy_milk` missing — substitute for greek_yogurt when dairy+cottage_cheese excluded; 100g flat fallback gives ~3g protein in a protein slot | Added `soy_milk: 33` |
| 9 | `foodDatabase.ts` | `oat_milk` missing — substitute for dairy milks | Added `oat_milk: 43` |
| 10 | `foodDatabase.ts` | `almond_milk` missing — substitute for dairy milks | Added `almond_milk: 17` |
| 11 | `foodDatabase.ts` | `white_potato` missing — first substitute for sweet_potato; would show flat "(100g)" instead of scaled portion | Added `white_potato: 77` |

### Known Issues (not fixed)
- `soy_milk` (33 kcal/100g) in a protein slot for a 400-cal meal would suggest ~490g — calorie math works but soy milk is not a high-protein food. Root fix requires moving soy_milk out of the protein-substitute chain for greek_yogurt; deferred as a product decision.

---

## Phase 2: Prep Athlete
- Status: SKIPPED — Phase 1 fixed 11 bugs (threshold is ≥3)
- Feature added: none
- Files changed: none

---

## Phase 3: UX Reviewer
- Changes: 2

| File | Change | Why it helps |
|------|--------|--------------|
| `src/pages/Diet/index.tsx:332` | "⚠ Regenerate" → "⚠ Regenerate Meals" | The adjacent "⟳ Update Macros" button implies partial update; without "Meals" an athlete doesn't know what gets replaced. Now both buttons say exactly what they do. |
| `src/pages/CheckIn/index.tsx:588` | "Adjust in Settings" → "Change Schedule" | The locked screen already explains the schedule; the CTA should name what you're changing, not where you're going. "Change Schedule" is specific and immediately actionable. |

---

## Push: SUCCESS
