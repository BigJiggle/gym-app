# PrepCoach QA Report — 2026-06-20

## Phase 1 — QA Engineer

### TypeScript
```
npx tsc --noEmit → 0 errors
```

### Unit Tests
```
npm test → 86/86 passing, 0 failures
```

### Nutrition Engine Deep Audit

#### calcPortionStr logic
- ✅ `fixedLabel` check is first (correct short-circuit)
- ✅ `veg`/`fruit`/`powder` roles use fixed grams from `ROLE_FIXED_G`
- ✅ `protein`/`carb`/`fat` roles scale correctly from `MEAL_CAL_FRACTIONS` with `ROLE_MIN_G`/`ROLE_MAX_G` clamps
- ✅ `MEAL_CAL_FRACTIONS` sums to 0.95 (leaving 5% for seasoning/sauces — intentional)

#### Template TemplateFoodItems
- ✅ All 9 meal templates (indices 0–8) pass valid `TemplateFoodItem` objects to `getFood()`
- ✅ Snack templates (6, 7, 8) correctly pass `isMainMeal = false` preventing SNACK_ONLY_FOODS exclusion

#### buildMeals calorie math
- ✅ `snackCount = snack_count ?? 0` resolves correctly
- ✅ `mainCount = mealTemplates.length - snackCount` (correct denominator)
- ✅ `perMainCal = round((totalCal - snackCount*200) / mainCount)` distributes calories correctly; snacks get fixed 200 kcal each

#### getCultureFood coverage
- ✅ All 8 cultures (indian, mexican, mediterranean, asian, west_african, japanese, korean, middle_eastern) have all required keys: `protein_main`, `carb_main`, `carb_alt`, `veg`, `fat`, `dairy`, `plant_protein`
- ✅ Vegan/vegetarian remaps `protein_main` → `plant_protein` correctly for all cultures

#### FOOD_CALORIES_PER_100G completeness
- ✅ Complete for all template fallback IDs
- ✅ Complete for all FOOD_SUBSTITUTES first-element IDs
- ✅ No missing entries for foods reachable through normal plan generation

#### Macro math
- ✅ `protein_g = round(weight_kg * 2.3)` — correct contest prep target
- ✅ `fat_g = round(weight_kg * 0.9)` — correct minimum
- ✅ `carbs_g = round((calories - protein*4 - fat*9) / 4)` — correct residual fill
- ✅ `resolvedSnackCount = input.snack_count ?? (input.include_snacks ? 1 : 0)`
- ✅ `meal_count minimum = Math.max(3, input.meal_count)` prevents degenerate plans

#### snack_count resolution
- ✅ `plan:generateDiet` IPC: `snack_count: (user.snack_count as number) ?? 0` correct
- ✅ Schema v11 migration backfills `snack_count` from `include_snacks` correctly

### 7 User Flow Trace

| Flow | Status | Notes |
|------|--------|-------|
| Onboarding → plan generation | ✅ PASS | `user:create` → `plan:generateTraining` + `plan:generateDiet` chain correct |
| Diet page portions display | ✅ PASS | `calcPortionStr` feeds `buildMeals` correctly; portions shown in `dietPlan.meals[].foods` |
| Meal completion toggle | ✅ PASS | `logMealCompletion` upserts with DB record id; `unlogMealCompletion` filters correctly |
| Check-in → macro recalc | ✅ PASS | `checkin:submit` scales meal calories by ratio; `submitCheckin` reloads diet plan post-submission |
| Settings regen | ✅ PASS | `handleSaveProfile(true)` → `updateUser` → `generateTrainingPlan` + `generateDietPlan` sequential |
| Workout flow (start → log → complete) | ✅ PASS | `startWorkout` → `saveSetsBatch` → `completeWorkout`; unit conversion kg↔lbs correct |
| Progress chart | ✅ PASS | Empty-state guarded; weight/measurement data renders from `progressEntries` |

### Bugs Fixed
**0** — No bugs found. Phase 2 ran (threshold: <3 bugs fixed).

---

## Phase 2 — Prep Athlete Feature

**Feature:** Daily Energy Balance card on Dashboard  
**Commit:** `[FEATURE] 2026-06-20`  
**File changed:** `src/pages/Dashboard/index.tsx`

### What it does
Adds a "Today's Energy Balance" card between the macro progress bars and the Next Meal preview. For a 12-weeks-out competitor on a 2,200 kcal cut, the existing dashboard shows *consumed vs plan target* but not *consumed vs actual expenditure*. This card bridges that gap.

**Computation:**
- **BMR** — Harris-Benedict revised formula using `user.age`, `user.sex`, `user.height_cm`, and current weight (latest check-in or profile default)
- **Training burn** — `MET(5.5) × bodyweight_kg × duration_hours` from today's completed workout timestamps
- **Cardio burn** — Type-specific MET (LISS: 4.5, HIIT: 8.0, Bike: 6.0, Stairs: 8.0, Other: 5.0) × bodyweight × minutes/60 from `cardioLog`
- **Consumed** — Sum of `dietPlan.meals[i].calories` for today's logged meal completions

**Display:**
- Three numbers in a grid: Est. burned / Consumed / Net balance
- Color-coded badge: green "X kcal deficit" or red "+X kcal surplus"
- Graceful empty state when no meals logged yet
- Footer disclaimer: "Harris-Benedict BMR estimate · actual expenditure varies by exercise intensity"

**Why it's genuinely daily-use:** A prep athlete checks this constantly — knowing their real-world deficit (not just plan adherence) drives decisions about whether to add an extra meal or more cardio.

**Data sources used (all pre-loaded, zero new IPC calls):**
`user`, `latestCheckin`, `mealCompletions`, `dietPlan`, `workoutHistory`, `cardioLog` (localStorage)

---

## Phase 3 — UX Simplicity Review

**Commit:** `[UX] 2026-06-20`  
**Files changed:** `src/pages/Settings/index.tsx`, `src/pages/CheckIn/index.tsx`

### Fix 1 — Settings: "Save Only" → "Save (Keep Plans)"
**File:** `src/pages/Settings/index.tsx:514`  
**Problem:** The label "Save Only" paired with "Save & Regenerate Plans" left users guessing what "only" meant. A user editing their weight for the first time could click the wrong button and accidentally rebuild all their plans.  
**Fix:** Renamed to "Save (Keep Plans)" — immediately communicates the consequence.

### Fix 2 — CheckIn: Missed slot subtitle
**File:** `src/pages/CheckIn/index.tsx:202`  
**Problem:** "Tap to fill in retroactively" uses jargon and doesn't clearly describe the action. Users who missed a check-in window might not realize they're logging historical weigh-in data.  
**Fix:** Changed to "Log data for this missed check-in" — plain English, action-oriented.

---

## Summary

| Phase | Result |
|-------|--------|
| TypeScript errors | 0 |
| Failing tests | 0 |
| Bugs fixed | 0 |
| Feature shipped | Daily Energy Balance (Dashboard) |
| UX fixes | 2 (Settings save button, CheckIn missed slot label) |
| Commits pushed | 2 (feature + UX) + this report |
