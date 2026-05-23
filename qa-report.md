# App Health Report — 2026-05-23

## Phase 1: QA Engineer
- TypeScript: PASS (0 errors)
- Unit tests: PASS (84 passing, 0 failing)
- Bugs fixed: 1

### Feature Audit
- Onboarding: OK — all 6 steps with validation flow through correctly; createUser + plan generation after step 6 works as expected.
- Diet page: OK — meal swap, recalculate macros, grocery list quantities, weekly compliance strip, and food preferences panel all function correctly.
- Training page: OK — start workout, log sets per exercise with rest timer, complete workout and batch-save all work correctly.
- Check-in page: OK — locked countdown state and open form state both handled; missed check-in panels work; edit-last check-in also works.
- Education page: OK — all 5 tabs (Prep Timeline, Posing Guide, Show Checklist, Peak Week, First Timer) render; async show data auto-switch to timeline tab is guarded correctly.
- Progress page: OK — weight chart, measurements chart, and trend projection all display using correct data ordering (progressEntries oldest-first, checkinHistory newest-first).
- Settings page: OK — unit change takes effect immediately across all display components; check-in schedule changes (day/interval/biweekly) update the locked state instantly.

### Bugs Fixed
- `src/types/index.ts:249` / `src/store/planStore.ts:165` — `logMealCompletion` was declared as `Promise<void>` but the IPC handler returns the persisted `MealCompletion` row. The store was working around this with an unsafe `as MealCompletion` cast. Fixed the type declaration to `Promise<MealCompletion>` and removed the cast.

### Known Issues (not fixed)
- None. All identified issues were either architectural patterns that work correctly at runtime or theoretical edge cases that cannot occur in practice given how the data is populated.

---

## Phase 2: Bodybuilder User
- Status: RAN (Phase 1 fixed 1 bug, which is < 3)
- Feature added: **Average daily calorie deficit with estimated fat loss rate**
  - Added to the Diet page's existing "Weekly Macro Totals" section.
  - Shows avg kcal/day this week vs target, the daily deficit/surplus in kcal, and the estimated weekly weight change (~X lbs/wk or kg/wk) at that rate.
  - Rationale: A contest prep athlete checks this every day to confirm they're in the right deficit to hit stage weight — the existing weekly total % doesn't give this quick "am I on pace?" read.
  - Uses: 3,500 kcal/lb (imperial) or 7,700 kcal/kg (metric) fat approximation.
  - Only shown when at least one meal has been logged this week.
- Files changed: `src/pages/Diet/index.tsx`

---

## Phase 3: UX Reviewer
- Changes made: 2

1. `src/pages/CheckIn/index.tsx` — Shortened the submit button from "Submit Check-In & Get Feedback" to "Submit Check-In →". The feedback screen always appears after submission so advertising it in the button text adds no information — just friction for a tired athlete trying to submit quickly.

2. `src/pages/Training/index.tsx` — Changed collapsed session card button from "▶ Start" to "▶ Start Workout" to match the label already used in the expanded session card view. The bare "Start" with no object was ambiguous; this makes both states say the same thing.
