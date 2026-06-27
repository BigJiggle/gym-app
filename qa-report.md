# PrepCoach QA Report — Automated Run 9 (2026-06-27)

## Summary

| Phase | Result |
|-------|--------|
| Phase 1 – QA Engineer | 0 bugs found; 105/105 tests passing; TypeScript clean |
| Phase 2 – Feature (Prep Athlete) | "Then vs Now" progress photo comparison on Progress page |
| Phase 3 – UX Simplicity | 2 surgical clarity fixes committed |

---

## Phase 1 — QA Engineer

### TypeScript
`npx tsc --noEmit` → clean, no errors.

### Unit Tests
`./node_modules/.bin/vitest run` → **105/105 passed** across 9 test files.

### Audit Coverage (`tests/unit/audit-coverage.test.ts`)
- Every scalable template food ID has a calorie entry ✓
- Every FOOD_CATEGORY non-veg food has a calorie entry ✓
- Every substitute subId with a category has a calorie entry ✓

### Audit Logic (`tests/unit/audit-logic.test.ts`)
All 10 logic invariants verified:
- Per-meal calorie sums within ±80 kcal of daily target across all meal/snack count combinations ✓
- Meal times in ascending order ✓
- Vegetarian lunch contains no meat across all 9 cultures ✓
- No undefined/NaN in foods or macros for all pref × culture combinations ✓
- Protein ~2.3 g/kg, fat ~0.9 g/kg ✓
- Peak week deficit milder than mid-prep ✓
- Off-season cut applies a deficit ✓
- Bulk + show overrides to cut deficit; bulk off-season is surplus ✓
- weight_kg=0 guard: protein > 0, finite calories ✓
- meal_count < 3 clamps to ≥ 3 ✓

### Domain Logic — 7 User Flow Audits
All previously verified and unchanged this run:
1. **Onboarding → First plan**: `createUser` → `addShow` → `generateDietPlan` + `generateTrainingPlan` ✓
2. **Weekly check-in and macro adjustment**: `submitCheckin` → `recalculateMacros` using latest check-in weight ✓
3. **Show countdown and peak-week protocol**: `getPhaseAwareDeficit` eases deficit at ≤1 week out ✓
4. **Meal swap and food exclusions**: `plan:applyAIRequest` handles exclusion aliases ✓
5. **Bulk off-season → show added → auto-switch to cut**: `shows:add` calls `regenerateDietForGoal` ✓
6. **Past-show guard**: `shows:setPrimary` throws for past dates ✓
7. **Duplicate check-in guard**: `DUPLICATE_CHECKIN:` error thrown on same-date resubmission ✓

### Bugs Fixed This Run
None — 0 bugs found.

---

## Phase 2 — Prep Athlete Feature

**Feature: "Then vs Now" progress photo comparison** (`src/pages/Progress/index.tsx`)

**Why it matters for a 12-week-out competitor:**
Visual progress tracking is one of the most important feedback loops in contest prep. Coaches and athletes review photos weekly to assess conditioning changes. The previous grid showed all photos in a mixed-pose list with no comparison view — it was hard to see whether you're improving.

**What was added:**
- When a user has ≥ 2 photos of the selected pose, a prominent side-by-side panel appears above the grid showing the oldest ("THEN") and newest ("NOW") photo of that pose.
- The grid below now filters to only show photos matching the selected pose (previously showed all poses mixed together).
- Empty state message when no photos exist for the selected pose.
- Uses only the existing `getProgressPhotos` IPC call — no new backend code needed.

**Commit:** `[FEATURE] 2026-06-27: add Then vs Now photo comparison to Progress page`

---

## Phase 3 — UX Simplicity Reviewer

### Fix 1 — Diet page button hint text
**Before:** `⟳ adjusts macro targets · ⚠ replaces all meals`
**After:** `⟳ updates targets from latest weigh-in · ⚠ rebuilds plan, erases swaps`

The original phrasing assumed domain knowledge ("macro targets" means nothing to a new user). The new phrasing explains the actual consequence in plain terms.

**File:** `src/pages/Diet/index.tsx`

### Fix 2 — Settings save button label
**Before:** `Save (Keep Plans)`
**After:** `Save Profile`

The parenthetical "(Keep Plans)" was redundant clutter — the adjacent primary button already says "Regenerate Plans", making it clear what *not* choosing regenerate means. "Save Profile" is a universally understood action label.

**File:** `src/pages/Settings/index.tsx`

**Commit:** `[UX] 2026-06-27: clarify Diet hint text and Settings save button label`

---

## Commits This Run

```
776e895  [UX] 2026-06-27: clarify Diet hint text and Settings save button label
474846c  [FEATURE] 2026-06-27: add Then vs Now photo comparison to Progress page
```

---

## Cumulative QA History

| Run | Date       | Bugs Fixed | Feature Added | UX Fixes |
|-----|------------|-----------|---------------|----------|
| 1   | 2026-06-23 | 3         | —             | 0        |
| 2   | 2026-06-23 | 2         | —             | 1        |
| 3   | 2026-06-24 | 1         | Culture food coverage | 2 |
| 4   | 2026-06-24 | 0         | Per-day macro compliance row | 2 |
| 5   | 2026-06-25 | 1         | —             | 2        |
| 6   | 2026-06-25 | 2         | —             | 2        |
| 7   | 2026-06-26 | 0         | Peak week daily protocol | 2 |
| 8   | 2026-06-27 | 1         | Water tracker sync | 2 |
| 9   | 2026-06-27 | 0         | Then vs Now photo comparison | 2 |

Total bugs fixed across all runs: **10**
