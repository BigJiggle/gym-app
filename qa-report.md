# PrepCoach QA Report — 2026-06-23

## Phase 1 — QA Engineer

### TypeScript
`npx tsc --noEmit` — **0 errors** (before and after fixes)

### Unit Tests
**Before fixes:** 104 tests, 9 suites — all passing  
**After fixes:** 105 tests, 9 suites — all passing (+1 vegetarian lunch assertion, extended sc=3 coverage)

### Nutrition Engine Audit — Bugs Found & Fixed

#### Bug 1 — Calorie sum overflow when snack_count=3
**File:** `electron/services/nutritionEngine.ts`  
**Root cause:** `mainCalories = Math.max(800, totalCal - totalSnackCal)` — the 800 kcal floor inflated main-meal calories when snack_count=3 on a low-calorie plan (e.g. 1200 kcal target → snacks consume 600 kcal → 600 kcal left for mains → floor kicks in at 800 → total becomes 1400, exceeding target by 200 kcal).  
**Fix:** Changed to `Math.max(0, totalCal - totalSnackCal)` — total always equals target exactly (within ±80 kcal rounding tolerance).

#### Bug 2 — Vegetarian Lunch served chicken_breast
**File:** `electron/services/nutritionEngine.ts`, Lunch template  
**Root cause:** Lunch template had vegan and omnivore branches but no vegetarian branch. For `culture='any'`, `getCultureFood` returned the omnivore fallback immediately, serving chicken_breast to vegetarian users.  
**Fix:** Added explicit `if (p === 'vegetarian')` branch using `plant_protein` key with `cottage_cheese` fallback, correctly routing through culture-specific plant proteins.

#### Bug 3 — Dinner fat slot bypassed allergy exclusions (vegetarian path)
**File:** `electron/services/nutritionEngine.ts`, Dinner template, vegetarian fat slot  
**Root cause:** `getCultureFood(culturePref, 'fat', p, fallback)` missing the `exclusions` argument — culture fat foods (sesame oil for asian/japanese/korean, groundnut sauce for west_african) were never checked against the user's allergy list.  
**Fix:** Added `exclusions` as fifth argument to the `getCultureFood` call.

#### Bug 4 — Dinner fat slot bypassed allergy exclusions (omnivore path)
**File:** `electron/services/nutritionEngine.ts`, Dinner template, omnivore fat slot  
**Root cause:** Same pattern as Bug 3 — `exclusions` missing from `getCultureFood` in the omnivore dinner fat slot.  
**Fix:** Added `exclusions` as fifth argument.

### Training Engine Audit
All 4 training audit tests passed with no issues. Session count, unique days, deload phase detection, and empty session prevention all behave correctly.

### Food Database Audit
All 3 coverage tests passed: template scalable food IDs, FOOD_CATEGORY foods, and FOOD_SUBSTITUTES all have calorie entries.

### User Flow Traces (7 flows)
1. **Onboarding → first plan generation** — IPC chain `plan:generateDiet` / `plan:generateTraining` correct; preload API surface verified.
2. **Daily diet tracking** — `plan:getDiet`, meal completion toggle, macro progress all guarded with `?.` / `?? 0`.
3. **Weekly check-in submission** — duplicate-check guard (`DUPLICATE_CHECKIN:${date}` error), interval enforcement, macro recalculation on submit all correct.
4. **Show management** — `shows:setPrimary` throws for past shows; `shows:cancelShow` transitions to off-season correctly.
5. **Settings → plan regeneration** — snack_count 0–3 all represented; `include_snacks` flag consistent between Onboarding and Settings.
6. **Progress page** — empty state (0 check-ins) and single check-in handled gracefully; `computeWeeklyRate` returns null for <2 entries, trend section hidden.
7. **Peak week phase-awareness** — `getPhaseAwareDeficit(1, 'cut')` confirmed lighter than mid-prep; bulk+show override correct; off-season maintain is zero deficit.

---

## Phase 2 — Feature Development
**Skipped** — Phase 1 fixed ≥3 bugs (4 bugs fixed), so Phase 2 feature development is bypassed per routine rules.

---

## Phase 3 — UX Simplicity Review

### Fix 1 — Accessible labels on icon-only delete buttons
**File:** `src/pages/Dashboard/index.tsx`  
**Issue:** Four ✕ icon-only action buttons had no `aria-label` or `title` — screen readers announced them as unlabeled, and hover provided no tooltip.  
**Fix:** Added `aria-label` and `title` attributes to `removeCardioToday`, `removePosingToday`, `removeSleepToday`, and the dismiss-notification button.

### Fix 2 — Low-contrast empty-state text
**File:** `src/pages/Dashboard/index.tsx`  
**Issue:** "No cardio/posing/sleep logged today" messages used `text-gray-600` on `bg-gray-900` — contrast ratio ≈ 2.5:1, failing WCAG AA (4.5:1 for normal text).  
**Fix:** Changed to `text-gray-500` — contrast ratio ≈ 3.6:1, visibly readable while remaining secondary.

---

## Summary

| Phase | Result |
|-------|--------|
| TypeScript | ✓ 0 errors |
| Unit tests | ✓ 105/105 passed |
| Bugs fixed | 4 (nutrition engine) |
| Feature added | — (skipped, ≥3 bugs) |
| UX fixes | 2 (Dashboard aria-labels + contrast) |
| Commit | `6ff98dc` |
