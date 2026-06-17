# App Health Report — 2026-06-17 (run 2)

## Phase 1: QA Engineer
- TypeScript: PASS (0 errors)
- Unit tests: PASS (86 tests, 6 test files)
- Bugs fixed: **0** — codebase clean; all previous fixes holding

### Nutrition Engine Audit
- calcPortionStr logic: OK — MEAL_CAL_FRACTIONS (protein 0.45, carb 0.35, fat 0.15), ROLE_FIXED_G (veg 120g, fruit 100g, powder 30g), ROLE_MIN/MAX_G clamps all sensible.
- Template TemplateFoodItems: OK — all 9 meal templates pass valid `{ id, display, role, unitSuffix?, fixedLabel? }` objects.
- getCultureFood coverage: OK — all 8 cultures define protein_main, carb_main, veg, fat, dairy, plant_protein; exclusion logic confirmed intact.
- FOOD_CALORIES_PER_100G coverage: OK — all food IDs in culture profiles and templates have calorie entries.
- Macro math: OK — protein = weight_kg × 2.3g, fat = weight_kg × 0.9g, carbs fill remainder; resolvedSnackCount correctly falls back to include_snacks.

### User Flow Audit (all 7 flows traced through source)
- Onboarding → plan gen: OK
- Diet page portions: OK
- Meal completion: OK
- Check-in → recalc: OK
- Settings → regen: OK
- Training plan generation: OK
- Progress tracking: OK

---

## Phase 2: Prep Athlete Feature
**Feature added:** Quick progressive overload buttons in WorkoutSession

**Why this matters:** A prep athlete in a caloric deficit trains 4–6 days/week with depleted energy. When setting their working weight for each exercise, they currently see "Last: 80kg × 8" and must manually calculate and retype the new value (e.g. 82.5 for a small PR). One-tap `−2.5 / Same / +2.5` buttons (or `−5 / Same / +5` lbs in imperial) eliminate that arithmetic entirely — saving cognitive load at the moment it costs most.

**What was added** (`src/pages/Training/WorkoutSession.tsx`):
- Below the "Last: X kg × Y" display on each `ExerciseCard`, a row of 3 buttons appears whenever `lastPerf` exists and at least one set is still undone
- Buttons: `−step`, `Same`, `+step` where step = 2.5 kg / 5 lbs (matches the existing `weightStep` constant)
- Tapping any button calls `onSetUpdate(i, 'weight', target)` for every undone set — applies the chosen load to the whole exercise at once
- Uses `Math.max(0, ...)` to prevent negative weights
- Color-coded: green for increase, neutral for Same, dim red for decrease
- Hidden once all sets are marked done (no-op after exercise is complete)
- Zero new IPC calls or schema changes

---

## Phase 3: UX Reviewer
**2 surgical fixes applied:**

### Fix 1: "View Progress →" link on CheckIn success screen
- **Before:** After submitting a weekly check-in, the success screen showed coach feedback + a single "Done" button. The natural next step — seeing the updated weight chart — required navigating manually.
- **After:** Added a "View Progress →" primary button alongside "Done" that navigates directly to `/progress`.
- **File:** `src/pages/CheckIn/index.tsx`

### Fix 2: Live set count in WorkoutSession bottom bar
- **Before:** Bottom bar showed "X/Y exercises done" — no indication of total sets logged while mid-workout.
- **After:** Now shows "X/Y exercises · N sets" when at least one set is logged, giving a quick volume reference without scrolling.
- **File:** `src/pages/Training/WorkoutSession.tsx`

---

| Date | QA bugs | Feature | UX fixes |
|------|---------|---------|----------|
| 2026-06-17 (r2) | **0** | Progressive overload buttons in WorkoutSession | View Progress link on check-in success; live set count in session bar |

---

# App Health Report — 2026-06-17

## Phase 1: QA Engineer
- TypeScript: PASS (0 errors)
- Unit tests: PASS (86 tests, 6 test files)
- Bugs fixed: **0** — codebase clean; all previous fixes holding

### Nutrition Engine Audit
- calcPortionStr logic: OK — MEAL_CAL_FRACTIONS (protein 0.45, carb 0.35, fat 0.15), ROLE_FIXED_G (veg 120g, fruit 100g, powder 30g), ROLE_MIN/MAX_G clamps all sensible.
- Template TemplateFoodItems: OK — all 9 meal templates pass valid `{ id, display, role, unitSuffix?, fixedLabel? }` objects to every `getFood()` call.
- getCultureFood coverage: OK — all 8 cultures define protein_main, carb_main, veg, fat, dairy, plant_protein; exclusion logic confirmed intact.
- FOOD_CALORIES_PER_100G coverage: OK — all food IDs in culture profiles and templates have calorie entries.
- Macro math: OK — protein = weight_kg × 2.3g, fat = weight_kg × 0.9g, carbs fill remainder; resolvedSnackCount correctly falls back to include_snacks.

### User Flow Audit
- Onboarding → plan gen: OK
- Diet page portions: OK
- Meal completion: OK
- Check-in → recalc: OK
- Settings → regen: OK
- Training plan generation: OK
- Progress tracking: OK

---

## Phase 2: Prep Athlete Feature
**Feature added:** Per-set RIR (Reps In Reserve) logging during workout sessions

**Why this matters:** A prep athlete 12 weeks out uses RIR to manage fatigue load across the week. The program already shows prescribed RIR (e.g. "3 × 8-12 @ RIR 2") and the DB stores `rir_actual` per set — but there was no UI to record what RIR the athlete actually achieved. Without this, the athlete can't distinguish a hard week (RIR 0–1) from a recovery week (RIR 3+) in their log history or stats.

**What was added** (`src/pages/Training/WorkoutSession.tsx`):
- Added a number input (0–5, labeled "RIR") per set row in `ExerciseCard`, placed between the weight unit label and the done button
- Defaults to the session's programmed RIR (`exercise.rir`), so the common case (athlete hit prescribed RIR) requires no extra input
- Clamped 0–5 via `Math.max(0, Math.min(5, ...))` to prevent invalid values
- Disabled once the set is marked done (consistent with reps/weight fields)
- Persists to `exercise_logs.rir_actual` on workout completion via the existing `handleComplete` batch-save path — no new IPC calls or schema changes needed

---

## Phase 3: UX Reviewer
**2 surgical fixes applied:**

### Fix 1: "tap" → "click" on Progress page Stage Weight Goal (Progress page)
- **Before:** Empty state for Stage Weight Goal read "Not set — tap 'Set goal' to track your target stage weight" — "tap" is touch-screen UX language in a desktop Electron app
- **After:** Changed to "click" to match the pointer/mouse interaction model
- **File:** `src/pages/Progress/index.tsx`

### Fix 2: Clarified "Recalculate Macros" button subtitle (Diet page)
- **Before:** Below the Recalculate / Regenerate buttons, the note read "⟳ adjusts calorie targets only" — misleading because recalculate updates ALL macro targets (protein, carbs, fat, calories) proportionally from the latest check-in weight
- **After:** Changed to "⟳ adjusts macro targets" — accurate and more informative
- **File:** `src/pages/Diet/index.tsx`

---

# App Health Report — 2026-06-16 (run 2)

## Phase 1: QA Engineer
- TypeScript: PASS (0 errors)
- Unit tests: PASS (86 tests, 6 test files)
- Bugs fixed: **0** — codebase clean; all previous fixes still holding

### Nutrition Engine Audit
- calcPortionStr logic: OK — MEAL_CAL_FRACTIONS (protein 0.45, carb 0.35, fat 0.15), ROLE_FIXED_G (veg 120g, fruit 100g, powder 30g), ROLE_MIN/MAX_G clamps all sensible.
- Template TemplateFoodItems: OK — all 9 meal templates (0–8) pass valid `{ id, display, role, unitSuffix?, fixedLabel? }` objects to every `getFood()` call.
- getCultureFood coverage: OK — all 8 cultures define protein_main, carb_main, veg, fat, dairy, plant_protein; exclusion logic confirmed intact.
- FOOD_CALORIES_PER_100G coverage: OK — all food IDs in culture profiles and templates have calorie entries.
- Macro math: OK — protein = weight_kg × 2.3g, fat = weight_kg × 0.9g, carbs fill remainder; resolvedSnackCount correctly falls back to include_snacks.

### User Flow Audit
- Onboarding → plan gen: OK
- Diet page portions: OK
- Meal completion: OK
- Check-in → recalc: OK
- Settings → regen: OK
- Training plan generation: OK
- Progress tracking: OK

---

## Phase 2: Prep Athlete Feature (run 2)
**Feature added:** Projected show-day weight on Dashboard Prep Pace card

**Why this matters:** A 12-weeks-out athlete checks their current weekly rate daily and needs to know immediately where it puts them on show day — without opening the Progress page and scrolling to the Weight Trend card. This puts the projection right on the Dashboard alongside the weekly rate that drives it.

**What was added** (`src/pages/Dashboard/index.tsx`):
- Uses already-available `nearestShow.show_date` + `settings.target_weight_kg` — zero new API calls
- Computes `projectedKg = currentWeightKg + weeklyRateKg × weeksToShow`
- Shows `"Show day (12w): ~78.3 kg"` with color-coded delta vs target (green = ±0.5 kg on target, amber = off course)
- Also fixed target range sign convention: cuts now show `-1.0–-0.3 kg/wk` (signed, matching the rate above) instead of unsigned `0.3–1.0 kg/wk`

---

## Phase 2: Prep Athlete Feature (run 1 — earlier this session)
**Feature added:** Daily Posing Practice Tracker on Dashboard

**Why this matters:** Contest prep athletes must practice posing daily — especially quarter turns and mandatory poses — yet the app had no way to log or track posing sessions. The Education page has a posing guide but nothing to record daily practice. This adds a Posing Practice card to the Dashboard, mirrors the existing Cardio Tracker pattern exactly, and requires zero new IPC calls (localStorage-only).

**What was added** (`src/pages/Dashboard/index.tsx`):
- `PosingEntry` interface: `{ date: string; focus: string; minutes: number }`
- `posingLog` state persisted in `localStorage('posing_log')`
- `savePosingLog`, `logPosing`, `removePosingToday`, `quickLogPosing` handlers
- Posing Practice card with: today's logged session (focus + minutes), weekly session count + total minutes, one-tap presets (Full 15m, Full 20m, QT 15m, Mandatory 20m), custom duration entry, Edit/Remove for today's entry, "Log another posing session" when today is already logged
- Posing focused on 6 categories: Full Routine, Quarter Turns, Front Double, Side Poses, Symmetry Round, Mandatory Poses

---

## Phase 3: UX Reviewer (run 2)
**2 surgical fixes applied:**

### Fix 1: Projected show-day weight target range — signed sign convention (Dashboard)
- **Before:** Prep Pace card showed "Target: 0.3–1.0 kg/wk" (unsigned) while the rate displayed above it was signed (e.g. "-0.5 kg/wk") — athletes on a cut would see negative rate vs positive target range and second-guess whether they were on track
- **After:** Cuts now show `Target: -1.0–-0.3 kg/wk` and bulks show `Target: +0.2–+1.0 kg/wk`, matching sign convention of the displayed rate
- **File:** `src/pages/Dashboard/index.tsx`

### Fix 2: Misleading CTA in training history empty state (Training page)
- **Before:** When History tab has no workouts, the button read "Start Today's Workout →" but `onClick` only called `setTab('plan')` — user tapping it expecting to start a workout would be confused
- **After:** Renamed to "Go to My Plan →" which accurately describes the navigation action
- **File:** `src/pages/Training/index.tsx`

---

## Phase 3: UX Reviewer (run 1 — earlier this session)
**2 surgical fixes applied:**

### Fix 1: Live weight delta on check-in form (CheckIn page)
- **Before:** Weight field showed "Pre-filled from Week N · date" with no context on progress
- **After:** Adds a live delta line below weight input (e.g. "−0.5 kg from last check-in" in green, "+0.3 kg from last check-in" in amber) that updates as the athlete types. Hidden when change < 50g to avoid noise from decimal rounding.
- **File:** `src/pages/CheckIn/index.tsx`

### Fix 2: Target rate range on Prep Pace card (Dashboard)
- **Before:** Prep Pace showed rate + status badge (On Track / Too Slow / etc.) but not what the target range IS, requiring navigation to Progress to understand
- **After:** Adds "Target: 0.3–0.9 kg/wk" (cut) or "Target: +0.2–0.9 kg/wk" (bulk) below the avg check-ins line, computed from 0.3–1.2% of bodyweight per week per evidence-based cut protocol
- **File:** `src/pages/Dashboard/index.tsx`

---

## Cumulative session history

| Date | QA bugs | Feature | UX fixes |
|------|---------|---------|----------|
| 2026-05-28 | — | Strength trend indicators (↑/↓/→) | Amber warning on Regenerate button; "Edit Log" label |
| 2026-06-13 | 0 | Per-day cal+protein totals in Weekly Meal View | Clearer loading states |
| 2026-06-13 | — | Weekly Macro Totals card (week-to-date bars) | 2 label fixes |
| 2026-06-14 | 3 | Next meal highlight on Diet page | Amber fill on Regenerate; brand-accent meal time |
| 2026-06-15 | 0 | Avg daily protein + streak in Weekly Macro Totals | "X/Y days fed" counter; click vs tap |
| 2026-06-16 (r1) | **0** | Daily Posing Practice Tracker on Dashboard | Weight delta on check-in form; target rate on Prep Pace card |
| 2026-06-16 (r2) | **0** | Projected show-day weight on Prep Pace card | Signed target range for cuts; misleading CTA in training history |
| 2026-06-17 (r1) | **0** | Per-set RIR logging in workout session | "tap" → "click" on Progress; clarify recalculate button subtitle |
| 2026-06-17 (r2) | **0** | Progressive overload buttons in WorkoutSession | View Progress link on check-in success; live set count in session bar |

---

## Previous session detail (2026-06-14)

### Bugs Fixed
1. **62 missing FOOD_CALORIES_PER_100G entries** — culture-specific and specialty foods lacked calorie lookups, causing `NaN` portions or silent 0-cal fallback in generated plans. Added all entries sourced from `foods.ts`.
2. **getCultureFood exclusion bypass** — `exclusion_aliases` check was not applied inside `getCultureFood()`, so excluded foods (e.g. dairy, pork) could still appear via culture profiles. Fixed.
3. **dal missing from FOOD_CATEGORY/FOOD_SUBSTITUTES** — `dal` had no category or substitute chain, causing preference swaps to silently skip it. Added `dal → plant_protein`, substitute chain `dal → lentils → chickpeas`.

### Nutrition Engine Audit (2026-06-14)
- calcPortionStr logic: OK
- Template TemplateFoodItems: OK
- getCultureFood coverage: OK — all 8 cultures define protein_main, carb_main, veg, fat, dairy, plant_protein
- FOOD_CALORIES_PER_100G coverage: **62 entries were missing** (now fixed)
- Macro math: OK
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
