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

### Bugs Fixed

**Bug 1 — Vegan lunch tempeh mislabeled as Tofu**
`electron/services/nutritionEngine.ts:368`

`getFood('tempeh', exclusions, defaultStr)` returns `defaultStr` when tempeh is not excluded. The default string was incorrectly set to `'Tofu (200g)'`, causing vegan lunch meals to display "Tofu (200g)" even when serving tempeh. Fixed to `'Tempeh (150g)'`.

**Bug 2 — Misleading comment in planStore.submitCheckin**
`src/store/planStore.ts:99`

Comment read "macros were recalculated by the backend" — factually wrong. The checkin handler only stores the checkin and returns adjustment recommendations; it does not recalculate or modify diet macros. Fixed to "reload diet plan to pick up any server-side updates".

### Phase 1 Result
**2 bugs fixed.** TypeScript clean, all tests pass, all flows verified. Since 2 < 3, Phase 2 runs per specification.

---

## Phase 2 — Feature (Prep Athlete)

**Feature: Next Meal countdown card on Dashboard**

File changed: `src/pages/Dashboard/index.tsx`

A new card inserted between the stats row and Prep Pace shows the next upcoming un-eaten meal:

```
Next Meal
Lunch   13:00
in 1h 45m

· Chicken breast (150g)
· Brown rice (150g)
· Broccoli (100g)

480 kcal  · 42g protein       [ Mark Eaten ]
```

**Why this matters for prep:** 12 weeks out, hitting every meal on schedule is non-negotiable. This card surfaces the one thing the athlete needs right now — exactly what to eat and how long until it — without any navigation. The "Mark Eaten" button uses the existing `handleToggleMeal` flow so state stays in sync with the full meals checklist. When all meals are logged the card swaps to a green "All meals logged for today!" confirmation.

**Implementation:** Uses `dietPlan.meals` and `mealCompletions` already loaded at Dashboard mount. No new IPC calls, no new store state. Compares current `HH:MM` to each meal's scheduled `time` field, picks the first un-eaten meal whose time is after now.

---

## Phase 3 — UX Clarity Fixes

### Fix 1: "Skip" → "Skip Exercise" in WorkoutSession
**File:** `src/pages/Training/WorkoutSession.tsx` (ExerciseCard header)

**Before:** Each exercise card showed a "Skip" button in the top-right corner. With a separate "Remove set" (✕) button on individual set rows, "Skip" was ambiguous — skip the exercise or skip the current set?

**After:** Button renamed to "Skip Exercise". The action is now self-describing and cannot be confused with the per-set remove button.

### Fix 2: Space between weight value and unit in "Last" performance line
**File:** `src/pages/Training/WorkoutSession.tsx` (ExerciseCard)

**Before:** `Last: 70kg × 8` — the value and unit are concatenated with no space.

**After:** `Last: 70 kg × 8` — consistent with how weight is displayed elsewhere in the app and easier to scan at a glance during a timed rest period.

---

## Push Status

All commits pushed to `origin master`:
1. `[QA] 2026-06-06: fix vegan lunch tempeh mislabeled as tofu; fix misleading checkin comment`
2. `[FEATURE] 2026-06-06: add next-meal countdown card to Dashboard`
3. `[UX] 2026-06-06: two surgical clarity fixes in WorkoutSession`

---

_Earlier 2026-06-06 session also delivered:_
- `[FEATURE] Per-meal protein shown on Dashboard meal list`
- `[UX] Goal-aware Prep Pace color + workout completion state`
