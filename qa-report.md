# PrepCoach QA Report — 2026-06-20 (run 3)

## Phase 1 — QA Engineer

### TypeScript
**Result: PASS** — 0 errors (`npx tsc --noEmit`)

### Unit Tests
**Result: PASS** — 86/86 tests passing (`npm test`)

### Nutrition Engine Audit (`electron/services/nutritionEngine.ts`)

- `buildMeals()` snack/main split math verified correct
- `calcPortionStr()` role-based portion logic with MIN/MAX clamps verified correct
- `generateNutritionPlan()` `snack_count` resolution (from v11 migration) is backwards-compatible
- `getCultureFood()` checks all 8 culture maps correctly for all dietary preference keys
- All culture food IDs without `fixedLabel` have entries in `FOOD_CALORIES_PER_100G`
- `SNACK_ONLY_FOODS` has no overlap with main-meal template food IDs
- `meal_count` minimum guard (`Math.max(3, ...)`) from prior run confirmed present

### Food Database Audit (`electron/services/foodDatabase.ts`)
**Result: PASS** — all template fallback food IDs present, no missing calorie entries, `FOOD_CATEGORY` coverage complete.

### User Flows Traced (7)
All 7 flows confirmed correct:
1. Onboarding → profile creation → plan generation
2. Check-in submission → calorie recalculation cascade (uses latest check-in weight, not stale `user.weight_kg`)
3. Workout start → set logging → batch-save on complete → history
4. Meal completion toggle → deduplication on double-log via `INSERT OR REPLACE`
5. Diet preference update → plan regeneration
6. Startup refresh → plan auto-update when show/phase transitions
7. Progress photo: upload → stored via `progress:addPhoto` IPC → displayed with `file://` URL

### Bugs Fixed
**0 bugs fixed this run.** (Prior run fixed 1: `meal_count` minimum guard in `generateNutritionPlan`.)

---

## Phase 2 — Feature (Prep Athlete)

**Phase triggered:** Yes — fewer than 3 bugs fixed in Phase 1.

### Feature: Daily Supplement Tracker

**Motivation:** A prep athlete 12 weeks out takes multiple supplements every single day (creatine, fish oil, vitamin D, pre-workout, etc.). The Dashboard already has daily trackers for cardio, posing, sleep, and condition — but nothing for supplements. This is a genuine daily-use gap; forgetting creatine for three days in a row has real performance consequences during a cut.

**Implementation:** `src/pages/Dashboard/index.tsx`
- State: `supplementList: string[]` (localStorage `supplement_list`, default: Creatine, Fish Oil, Vitamin D, Multi-Vitamin) and `supplementLog: {date, taken[]}[]` (localStorage `supplement_log`)
- `toggleSupplement(name)` — marks taken / untaken for today
- `addSupplement()` — inline input adds to the list and saves to localStorage
- `removeSupplement(name)` — hover-reveals ✕ per supplement; removes from both list and log
- Card header shows "X/Y taken" badge (green when all done)
- Empty-state shows "Add your daily supplements..." prompt with the `+ Add` inline input still accessible
- 7-day compliance history bar (green = 100%, yellow ≥ 50%, gray > 0%, dim = 0%)
- Placed between Sleep Tracker and Daily Condition sections in Dashboard
- No IPC calls, no backend changes, no new DB migrations — pure localStorage frontend

**Files changed:** `src/pages/Dashboard/index.tsx`

---

## Phase 3 — UX Reviewer

### UX Fix 1: Dim check-in header button when interval-locked (`src/pages/Dashboard/index.tsx`)

**Issue:** The `+ Check-In` button in the Dashboard header is always shown as a fully active link even when the weekly check-in interval lock is active. Tapping it takes the user to the check-in page where they see a confusing "interval lock" error — a dead-end that wastes navigation. `nextCheckinAt` is already loaded in state.

**Fix:** The button now conditionally renders based on `nextCheckinAt`:
- If `nextCheckinAt > now`: renders a disabled secondary button labelled `Check-In in Nd` with a tooltip showing the exact open date.
- Otherwise: renders the normal `+ Check-In` link as before.

### UX Fix 2: Standardize rest timer preset labels (`src/pages/Training/WorkoutSession.tsx`)

**Issue:** Rest timer quick-select buttons used two different formats: "1m", "1:30", "2m", "3m" — the 90-second option showed MM:SS while the rest used minutes-only. Visually inconsistent on a UI athletes stare at during every set.

**Fix:** All four presets ([60, 90, 120, 180] seconds) now render as `MM:SS` consistently: "1:00", "1:30", "2:00", "3:00". Applied in both the idle-state selector and the active rest-timer control (2 occurrences via `replace_all`).

---

## Summary

| Phase | Status | Changes |
|-------|--------|---------|
| Phase 1 — QA | ✅ 0 bugs (clean) | TypeScript PASS, 86 tests PASS, full audit clean |
| Phase 2 — Feature | ✅ Shipped | Daily Supplement Tracker on Dashboard |
| Phase 3 — UX | ✅ 2 fixes | Disabled check-in button when locked; standardized rest timer labels |

**Commits this run:**
- `2ccc912` — `[FEATURE] 2026-06-20: Daily Supplement Tracker`
- `f9154c1` — `[UX] 2026-06-20: Dim check-in button when locked; standardize rest timer labels`

---

## Historical

### 2026-06-19 (run 2)

| Phase | Result |
|-------|--------|
| Phase 1 — QA | 1 bug fixed: `meal_count` minimum guard in `generateNutritionPlan` |
| Phase 2 — Feature | Progress photo gallery (frontend for existing backend) |
| Phase 3 — UX | Rest timer labels (60s/90s → 1m/1:30); Regenerate button loading state |
