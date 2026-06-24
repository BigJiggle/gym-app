# PrepCoach QA Report — Automated Run 4 (2026-06-24)

## Summary

| Phase | Result |
|-------|--------|
| Phase 1 – QA Engineer | 0 bugs found; 105/105 tests passing; TypeScript clean |
| Phase 2 – Feature (Prep Athlete) | Per-day macro compliance row in This Week section |
| Phase 3 – UX Simplicity | 2 surgical UX fixes committed |

---

## Phase 1 — QA Engineer

### TypeScript
`npx tsc --noEmit` → clean, no errors.

### Unit Tests
`npm test` → **105/105 passed** across 9 test files.

### Logic / Domain Audit (15-point checklist)

| # | Check | Result |
|---|-------|--------|
| 1 | TDEE calculation (BMR × activity × goal deficit) | ✅ Pass |
| 2 | Protein floor (≥ 1.8 g/kg) enforced | ✅ Pass |
| 3 | Fat floor (≥ 0.8 g/kg) enforced | ✅ Pass |
| 4 | Carbs never negative | ✅ Pass |
| 5 | Meal times non-overlapping / no 30-min collisions | ✅ Pass (fixed in Run 3) |
| 6 | Meal calorie sum ≈ daily target (≤ 5% drift) | ✅ Pass |
| 7 | Training frequency clamps to 2–6 (freq=7→6, freq=0→2) | ✅ Pass |
| 8 | Session days unique within plan | ✅ Pass |
| 9 | Peak week (weeks_out ≤ 3) = deload, reduced sets | ✅ Pass |
| 10 | Every session has ≥ 1 exercise (all equip × all splits) | ✅ Pass |
| 11 | determinePhase returns valid string for all inputs | ✅ Pass |
| 12 | maintain-phase deficit is 0 (not cut deficit) | ✅ Pass (fixed in Run 2) |
| 13 | Orphaned meal completions cleared on plan regen | ✅ Pass (fixed in Run 2) |
| 14 | startupRefresh transitions between phases correctly | ✅ Pass |
| 15 | Macro recalculate updates store without full reload | ✅ Pass |

**Bugs found this run: 0**

---

## Phase 2 — Prep Athlete Feature

**Feature: Per-day macro compliance row in This Week section (Diet page)**

The "This Week" dot grid already showed a ✓/✗ dot per day indicating whether meals were logged, but gave no numerical feedback on *how much* the athlete actually ate that day. For a prep athlete tracking weekly macro patterns, seeing yesterday was "off" is less actionable than seeing they hit 1,840 kcal / 178P vs a 2,100 kcal / 200P target.

**Implementation** (`src/pages/Diet/index.tsx`):
- Computed `dayMacros` array (one entry per weekday) by summing calories and protein from `mealCompletions` joined to `dietPlan.meals`.
- Future days return `null` so no spurious zeroes appear.
- Rendered a compact row between the day-dot row and weekly totals: each cell shows `{kcal}` and `{P}g` in `text-[9px]` — green when ≥ 90% of daily target, brand-400/gray otherwise.
- Empty days (no meals logged yet) show a `—` placeholder.
- Row is hidden when no meals have been logged this week (`activeDays === 0`).

**Commit:** `5c02339 [FEATURE] 2026-06-24: Per-day macro compliance row in This Week section`

---

## Phase 3 — UX Simplicity

### Fix 1: Prevent double-start of workouts (Training page)

**Problem:** `handleStartWorkout` is async. A second tap before the IPC round-trip completes created two `workout_logs` rows in the DB, causing duplicate active-workout state.

**Fix:** Added `startingWorkout` boolean state; both collapsed-card and expanded-card "▶ Start Workout" buttons set `disabled={startingWorkout}` and show `'...'` / `'Starting...'` while in flight.

**File:** `src/pages/Training/index.tsx`

### Fix 2: Success feedback on Regenerate Meals button (Diet page)

**Problem:** "⚠ Regenerate Meals" showed a spinner during regeneration, then snapped back to the same label with no confirmation — leaving the user unsure whether the action succeeded. ("Recalculate Macros" already had a `✓ Updated` flash; Regenerate did not.)

**Fix:** Added `regenDone` boolean state; on success the button label transitions to `✓ Done` for 2.5 s before resetting. Consistent with the existing Recalculate Macros pattern.

**File:** `src/pages/Diet/index.tsx`

**Commit:** `4d6193c [UX] 2026-06-24: Prevent double-start workout + add success feedback to Regenerate Meals button`

---

## Cumulative Quality Trend

| Run | Date | Bugs Fixed | Feature | UX Fixes | Tests |
|-----|------|-----------|---------|----------|-------|
| 1 | 2026-05-27 | 1 | Muscle MEV bars | 2 | — |
| 2 | 2026-06-22 | 3 | Day Projection on check-in | 2 | — |
| 3 | 2026-06-23 | 5 | Meal adherence streak | 2 | 105 |
| **4** | **2026-06-24** | **0** | **Per-day macro compliance** | **2** | **105** |

Zero bugs this run indicates the engine has stabilised. Remaining opportunities are feature-level polish.
