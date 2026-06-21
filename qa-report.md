# QA Report — 2026-06-21

## Phase 1 — QA Engineer

### TypeScript Check
**PASS** — 0 errors (full rebuild via `tsc -p tsconfig.web.json --noEmit`).  
*(Note: incremental `.tsbuildinfo` cache was masking one pre-existing error; see Phase 3.)*

### Unit Tests
**PASS** — 86/86 tests passing.

### Nutrition Engine Audit
- All 9 meal templates (indices 0–8) verified: every food ID in every template has a matching entry in `FOOD_CALORIES_PER_100G` and `FOOD_CATEGORY`. ✓
- All 8 culture food paths (`getCultureFood`) return valid `TemplateFoodItem` objects with calorie entries. ✓
- `FOOD_SUBSTITUTES` common substitutes all have calorie entries. ✓
- **Bug found**: Mid-Morning Snack template (`index 6`) had `time: '10:30'`, only 30 minutes after the Mid-Morning meal at `10:00`. In 5–6 meal plans with snacks, both appear on the timeline 30 min apart, confusing the schedule.
  - **Fix**: changed `'10:30'` → `'11:00'` in `electron/services/nutritionEngine.ts`.

### Logic / Domain Sanity
| Check | Result |
|---|---|
| Protein target (2.3 g/kg) | ✓ Correct |
| Fat floor (0.9 g/kg) | ✓ Correct |
| Peak-week deficit (0–1 wks out → −200 kcal) | ✓ Correct |
| `maintain` goal → 0 deficit | ✓ By design |
| Duplicate check-in prevention (`UNIQUE(user_id, date, meal_index)`) | ✓ Correct |
| Goal conflict (cut + surplus) | ✓ Not possible — goal is a single enum |
| Training frequency clamp (2–6) | ✓ `Math.min(6, Math.max(2, rawFreq))` |
| Phase thresholds (hypertrophy/strength/peak/deload) | ✓ Correct |
| Input boundary: weight/age zero guards | ✓ Handled upstream by onboarding validation |

### User Flow Traces (7/7 pass)
1. **Onboarding → plan generation**: `userHandlers.ts` → `generateNutritionPlan` → `generateTrainingPlan` ✓
2. **Daily meal logging and unlogging**: `logMealCompletion` / `unlogMealCompletion` → `UNIQUE` constraint ✓
3. **Weekly check-in**: `checkin:submit` → macro recalc with new weight → `calories_delta` propagated to meals ✓
4. **Same-day duplicate check-in**: throws `DUPLICATE_CHECKIN:date` ✓
5. **Show countdown and diet phase transition**: `syncPrimaryToNearest` → `regenerateDietForGoal` ✓
6. **Training plan regeneration from Settings**: `handleSaveProfile(true)` → `Promise.all([generateTrainingPlan, generateDietPlan])` ✓
7. **Progress page with 0 and 1 check-ins**: empty-state handled gracefully; `projectedWeightKg` null-guarded ✓

### Bugs Fixed — Phase 1 (1 bug)
| # | File | Description | Fix |
|---|---|---|---|
| 1 | `electron/services/nutritionEngine.ts` | Mid-Morning Snack time `'10:30'` collides with Mid-Morning at `'10:00'` | Changed to `'11:00'` |

**Commit**: `686a47d — [QA] 2026-06-21: Fix Mid-Morning Snack time collision (10:30→11:00)`

---

## Phase 2 — Prep Athlete Feature

**Trigger**: Phase 1 fixed 1 bug (< 3 threshold), so Phase 2 runs.

**Feature selected**: Consecutive-week training streak counter.

**Why**: Athletes who complete all scheduled sessions for multiple consecutive weeks deserve visible positive feedback. The existing "Sessions This Week" tracker only shows the current week; there was no persistence-of-habit indicator.

**Implementation** (`src/pages/Training/index.tsx`):
- Added `trainingStreak` `useMemo` that groups completed workout logs by ISO week (Mon–Sun anchor) and counts backwards from the current week through consecutive weeks where `completedDays >= sessionsPerWeek`.
- Displayed inside the existing "Sessions This Week" card, below the session dots.
- Copy variants: bare ("🔥 1-week training streak"), motivating ("keep building!" at 2–3 weeks), and elite ("elite prep consistency!" at 4+ weeks).
- No new IPC calls — uses `workoutHistory` already loaded at page mount.

**Commit**: `7882caf — [Feature] Add consecutive-week training streak counter to Training plan tab`

---

## Phase 3 — UX Reviewer

### Fix 1 — Critical: `activeMealIndex` undeclared in Diet/index.tsx

**Severity**: Crash (ReferenceError at runtime).

**Root cause**: `activeMealIndex` was referenced in the Meal Schedule Timeline IIFE (line 500+) and in meal card `.map()` callbacks (line 645+) but was never declared anywhere in the component. TypeScript's incremental compilation cache had stored a prior "clean" result for this file, so `tsc --noEmit` silently skipped it. A full rebuild (`tsc -p tsconfig.web.json --noEmit`) revealed 8 errors on this variable.

**Fix**: Added an IIFE-computed `const activeMealIndex: number | null` immediately before `filteredForExclude`, after `isMealEaten` is defined. Logic: find first uneaten meal sorted by scheduled time (HH:MM). Returns `null` when all meals are eaten.

### Fix 2 — Progress page: Projected Show Weight vs Stage Goal

**Issue**: When a user sets a Stage Weight Goal, the "Projected Show Weight" card showed a generic "at current rate" subtitle instead of telling the athlete whether their current trajectory will hit the goal.

**Fix**: When `targetKg !== null && projectedWeightKg !== null`, replaced the subtitle with a colour-coded delta:
- Within 0.5 kg: "✓ on track for goal" (green)
- Above goal: "X.X kg above goal" (amber — needs more cutting)
- Below goal: "X.X kg below goal" (blue — losing faster than goal)

**Commit**: `4301d0e — [UX] Fix undeclared activeMealIndex crash on Diet page; add projected-vs-goal gap on Progress page`

---

## Summary

| Phase | Finding | Status |
|---|---|---|
| P1 | Mid-Morning Snack time collision (10:30 → 11:00) | Fixed ✓ |
| P2 | Training streak counter (new feature) | Shipped ✓ |
| P3 | `activeMealIndex` ReferenceError crash on Diet page | Fixed ✓ |
| P3 | Progress page: projected vs stage goal gap | Fixed ✓ |

**Total bugs fixed**: 2 (Phase 1: 1 logic bug; Phase 3: 1 crash bug)  
**Total improvements shipped**: 3 commits pushed to `master`.
