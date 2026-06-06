# PrepCoach QA Report — 2026-06-06

## Phase 1 — QA Audit

### TypeScript
`npx tsc --noEmit` passed with **0 errors** before and after all changes.

### Unit Tests
`npm test` — **84 tests pass, 0 failures** across the full vitest suite.

### Nutrition Engine Audit (`nutritionEngine.ts` + `foodDatabase.ts`)

#### `getFood(id, exclusions, defaultStr, preferences?, isMainMeal=true)`
- Correctly skips excluded food IDs.
- Applies culture/preference substitutions only when the substitute's `FOOD_CATEGORY` intersects the original food's categories.
- `isMainMeal=true` blocks any ID present in `SNACK_ONLY_FOODS` from substituting in main meals — logic verified correct.
- Default string returned when all candidates are excluded.

#### `buildMeals()` macro math
- `protein_g = weight_kg × 2.3` ✓
- `fat_g = weight_kg × 0.9` ✓
- `carbs_g = (calories - protein*4 - fat*9) / 4` ✓
- Per-meal distribution uses `proteinCalRatio` / `fatCalRatio` proportional split ✓
- Snack model: `SNACK_CAL = 200` per snack; main meal calories = `max(800, totalCal - snacks×200) / mainCount` ✓

#### `getMealTemplates()` — indices verified
| Config | Indices |
|---|---|
| 6 meals, no snacks | `[0,1,2,3,4,5]` |
| 4 meals + 1 snack (`includeSnacks=true`) | `[0,6,2,5]` + snack template(s) |

#### `FOOD_CALORIES_PER_100G`
Does not exist in the current codebase — refactored away. Implementation uses fixed display strings. Not a bug.

#### `SNACK_ONLY_FOODS` coverage
Set contains 16 items: `greek_yogurt`, `cottage_cheese`, `kefir`, `whey_protein`, `casein_protein`, `pea_protein`, `soy_protein`, `labneh`, `dahi`, `apple`, `banana`, `berries`, `orange`, `rice_cakes`, `crackers`, `pretzels`. All blocked from main meals via `isMainMeal` guard. ✓

#### `FOOD_CATEGORY` / `FOOD_SUBSTITUTES`
- Substitute IDs reference foods that exist as keys in `FOOD_DISPLAY` and `FOOD_CATEGORY` — no dangling references found.
- Category matching in `getFood()` prevents category-crossing substitutions (e.g., a grain substitute cannot replace a protein).

#### `getCultureFood()` / `EXCLUSION_ALIASES`
- 4 culture paths verified: `indian`, `mexican`, `mediterranean`, `asian`.
- Alias map correctly normalises user-facing food names to canonical IDs before exclusion lookup.

### Spot Checks

**Scenario A — 80 kg male omnivore, 6 meals, cut**
- Calories: ~2,400 kcal (moderate deficit applied)
- Protein: ~184 g (~2.3 g/kg) ✓
- Fat: ~72 g (~0.9 g/kg) ✓
- Carbs: derived residual ✓
- 6 meal objects generated, all with non-NaN macros and valid portion strings ✓

**Scenario B — 70 kg female vegan, 4 meals + 1 snack, maintain**
- Calories: ~2,100 kcal (maintenance)
- Protein: ~161 g ✓
- Fat: ~63 g ✓
- 4 main meals + 1 snack (200 kcal) generated ✓
- No animal products appear in food selections ✓
- No NaN, undefined, or zero-calorie meals ✓

### 7 User Flow Traces

| Flow | Status |
|---|---|
| Onboarding → user created → plans generated | ✓ |
| Check-in submitted → adjustments applied → macros scaled | ✓ |
| Meal completion logged/unlogged | ✓ |
| Meal swap (manual + AI) | ✓ |
| Workout start → set log → complete | ✓ |
| Diet plan regeneration via Settings | ✓ |
| Food preference change → plan regenerated | ✓ |

### Phase 1 Result
**0 bugs found and fixed.** TypeScript clean, all tests pass, all flows verified. Since 0 < 3, Phase 2 runs per specification.

---

## Phase 2 — Feature (Prep Athlete)

**Feature: Per-meal protein grams on Dashboard meal list**

File changed: `src/pages/Dashboard/index.tsx`

Every meal row in the "Today's Meals" card now shows protein grams below the meal time:
```
Breakfast                  480 kcal
07:00                       38g P
```

**Why this matters for prep:** A competitive athlete managing a calorie deficit needs to confirm protein distribution at a glance — not just total daily protein. Seeing `38g P` per meal immediately tells them whether a meal is light (snack) or high-protein (post-workout), so they know which meal to protect and which to swap without navigating to the full Diet page.

**Implementation:** Uses `meal.protein_g` already present in the plan store — no new IPC calls or state. Two-line addition to the meal row's sub-label area.

---

## Phase 3 — UX Clarity Fixes

### Fix 1: Goal-aware Prep Pace rate color
**File:** `src/pages/Dashboard/index.tsx` (Prep Pace card)

**Before:** Rate colour was always green for negative values (weight loss) and amber for positive values (weight gain), regardless of goal.

**After:** Colour logic is now goal-aware:
- `cut`: negative rate = green (losing as planned), positive = amber (gaining — bad)
- `bulk`: positive rate = green (gaining as planned), negative = amber (losing — bad)
- `maintain`: neutral gray for both

A bulk athlete previously saw amber (`+0.3 kg/wk`) even when progressing exactly as intended, which was misleading.

### Fix 2: Workout completion state on Dashboard
**File:** `src/pages/Dashboard/index.tsx` (Today's workout card)

**Before:** "▶ Start Today's Workout" button was shown all day even after the athlete had already completed and logged the session.

**After:** If `workoutHistory` contains a `completed` log for today, the button is replaced by a green "✓ Workout Complete" confirmation pill. The start button only shows when the workout is genuinely pending.

---

## Push Status

Commits pushed to `origin master`:
1. `[FEATURE] 2026-06-06: Per-meal protein shown on Dashboard meal list`
2. `[UX] 2026-06-06: Goal-aware Prep Pace color + workout completion state`
3. `QA report — 2026-06-06`
