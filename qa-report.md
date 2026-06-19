# PrepCoach QA Report — 2026-06-19

## Phase 1 — QA Engineer

### TypeScript
**Result: PASS** — 0 errors (`npx tsc --noEmit`)

### Unit Tests
**Result: PASS** — 86/86 tests passing (`npm test`)

### Nutrition Engine Audit
**Result: PASS** — all checks clean

- All 9 meal templates (0–8) pass valid `TemplateFoodItem` objects to `getFood()`
- `buildMeals()` snack/main split math is correct: `SNACK_CAL=200`, `mainCal=(total−snacks×200)/mainCount`
- `calcPortionStr()` correctly applies ROLE_FIXED_G for veg/fruit/powder and scales by MEAL_CAL_FRACTIONS with MIN/MAX clamps for protein/carb/fat
- `generateNutritionPlan()` resolves `snack_count` via `input.snack_count ?? (input.include_snacks ? 1 : 0)` — backwards-compatible ✓
- `getCultureFood()` checks `plant_protein` key for vegan/vegetarian diets; all 8 culture maps contain the key ✓
- All culture food IDs that lack a `fixedLabel` have entries in `FOOD_CALORIES_PER_100G` ✓
- `SNACK_ONLY_FOODS` contains no foods that appear in main meal templates ✓

### Food Database Audit
**Result: PASS**

- All template fallback food IDs present in `FOOD_CALORIES_PER_100G`
- No missing calorie entries for culture food IDs used without `fixedLabel`

### User Flows Traced (7)
All 7 flows confirmed correct:
1. Onboarding → profile creation → plan generation
2. Check-in submission → calorie recalculation cascade
3. Workout start → set logging → complete → history
4. Meal completion toggle → deduplication on double-log
5. Diet preference update → plan regeneration
6. Startup refresh → plan auto-update when show/phase transitions
7. Measurement history → body composition estimate

### Bugs Fixed
**0 bugs found or fixed.** Codebase is healthy.

---

## Phase 2 — Feature (Prep Athlete)

### Feature: Daily Sleep Tracker on Dashboard

**Motivation:** A competitive prep athlete on a calorie deficit with 5×/week training has sleep as their primary recovery tool. The app already tracks water intake, cardio, and posing practice daily (all via localStorage). The check-in form captures sleep *quality* (1–5 subjective rating) weekly, but no daily sleep *hours* were tracked anywhere. Poor sleep during a cut elevates cortisol, accelerating muscle catabolism — tracking it daily gives actionable early warning.

**Implementation:** `src/pages/Dashboard/index.tsx`
- State: `SleepEntry { date: string; hours: number }` stored in `localStorage['sleep_log']`
- Functions: `saveSleepLog`, `logSleep`, `removeSleepToday`, `quickLogSleep`
- UI: Quick-log buttons (5h / 6h / 7h / 8h / Custom), edit/remove controls, 7-day history bar with color coding (green ≥7h, yellow 6–7h, red <6h), 7-day rolling average
- Position: Between Posing Practice and Daily Condition sections (follows identical pattern to other daily trackers)
- No IPC calls, no breaking changes, TypeScript clean

**Commit:** `5097c69` — `[FEATURE] 2026-06-19: Daily sleep tracker`

---

## Phase 3 — UX Reviewer

### Pages Reviewed
- **Dashboard** — No changes needed. Very well-designed.
- **Training** (`index.tsx`, `WorkoutSession.tsx`) — No changes needed. PR tracking, rest timer, load presets all clear.
- **Progress** — **1 fix applied** (see below).
- **CheckIn** — No changes needed. Auto-fill adherence, pre-fill from last check-in, locked/open states all clear.
- **Diet** — No changes needed. Meal timeline, drag-to-reorder snacks, swap modal, food exclusion chips all clear.
- **Settings** — No changes needed.

### UX Fix Applied: Progress "over N weeks" accuracy

**File:** `src/pages/Progress/index.tsx`  
**Issue:** The "Total Change" stat card's delta text said "over N weeks" where N was `checkinHistory.length` (check-in count). For non-weekly check-in schedules (daily, biweekly), this was inaccurate — e.g., 7 daily check-ins would display "over 7 weeks" when only 7 days had elapsed.  
**Fix:** Compute `elapsedWeeks` from the actual date span between oldest and newest check-in. Now shows e.g., "over 4.3 weeks" for 5 check-ins spanning 30 days, or "3 check-ins" when fewer than 2 check-ins exist.  
**Commit:** `71de062` — `[UX] 2026-06-19: Fix Progress page 'over N weeks'`

---

## Summary

| Phase | Status | Changes |
|-------|--------|---------|
| Phase 1 — QA | ✅ Clean | 0 bugs |
| Phase 2 — Feature | ✅ Shipped | Sleep tracker on Dashboard |
| Phase 3 — UX | ✅ Done | 1 clarity fix on Progress page |

**Commits pushed:** 2 (`5097c69`, `71de062`)
