# App Health Report — 2026-06-15

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

## Phase 2: Prep Athlete Feature
**Feature added:** Avg daily protein row in Weekly Macro Totals (Diet page)

**Why this matters:** A competitive prep athlete's #1 daily metric is protein. The Weekly Macro Totals card already showed avg daily calories with a deficit/surplus projection, but protein — the key muscle-preservation lever — was absent from that daily average view. Weekly totals existed (e.g., "142g / 182g protein this week") but no per-day average or streak.

**What was added** (`src/pages/Diet/index.tsx`, inside the weekly totals IIFE at ~line 795):
- `avgDailyProtein`: `weekProtein / pastDays.length` — daily average from logged days
- `proteinPctAvg`: percentage of daily target hit on average
- `proStreak`: consecutive days (most recent first) where logged protein ≥ 90% of target
- New row below "Avg daily calories" showing `Xg / Yg (Z%)` in green/amber/red depending on % hit
- Streak badge (shown when ≥ 2 days): `"Nd streak"` in amber, helps athletes maintain consistency

---

## Phase 3: UX Reviewer
**2 surgical fixes applied:**

### Fix 1: Misleading "X days logged" counter (Diet page)
- **Before:** `{pastDays.length} days logged` — counted elapsed weekdays (Mon–today), so Wednesday showed "3 days logged" even with zero meals eaten
- **After:** `{daysWithMeals}/{pastDays.length} days fed` — shows actual days with ≥1 logged meal over elapsed days
- **File:** `src/pages/Diet/index.tsx` line 739

### Fix 2: Mobile language in desktop app (Dashboard)
- **Before:** `"avg last N check-ins · tap for full chart"` — "tap" is a touchscreen affordance
- **After:** `"avg last N check-ins · click for full chart"` — correct for Electron desktop
- **File:** `src/pages/Dashboard/index.tsx` line 484

---

## Cumulative session history

| Date | QA bugs | Feature | UX fixes |
|------|---------|---------|----------|
| 2026-05-28 | — | Strength trend indicators (↑/↓/→) | Amber warning on Regenerate button; "Edit Log" label |
| 2026-06-13 | 0 | Per-day cal+protein totals in Weekly Meal View | Clearer loading states |
| 2026-06-13 | — | Weekly Macro Totals card (week-to-date bars) | 2 label fixes |
| 2026-06-14 | 3 | Next meal highlight on Diet page | Amber fill on Regenerate; brand-accent meal time |
| 2026-06-15 | **0** | Avg daily protein + streak in Weekly Macro Totals | "X/Y days fed" counter; click vs tap |

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
