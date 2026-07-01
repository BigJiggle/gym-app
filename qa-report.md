# PrepCoach QA Report — 2026-07-01 (Run 2)

## Phase 1 — QA Engineer Audit

### TypeScript
- `npx tsc --noEmit`: **0 errors** (before and after changes)

### Unit Tests
- `npm test` before: **109 tests passing** (from run 1)
- `npm test` after fixes: **112 tests passing, 0 failures** (+3 regression tests)

### Nutrition Engine Logic (full audit)
Deepened source audit of `nutritionEngine.ts`, `foodDatabase.ts`, `planHandlers.ts`, `showHandlers.ts`, `checkinHandlers.ts`, `userHandlers.ts`, `trainingEngine.ts`, `Progress/index.tsx`.

**2 bugs found and fixed.**

### User Flow Traces (7 flows)
All 7 flows verified correct end-to-end:

1. **Onboarding → profile save**: `user:create` IPC → clamps meal_count/snack_count/body_fat_pct → serializes JSON arrays → `parseUser` returns deserialized ✓
2. **Diet plan generation → storage → retrieval**: `plan:generateDiet` → `generateNutritionPlan()` → `diet_plans` table → `plan:getDiet` parses meals JSON ✓
3. **Weekly check-in → adjustment → plan update**: `checkin:submit` → `calculateAdjustments` → increments week_number → recalculates macros from current bodyweight ✓
4. **Training plan generation → storage**: `plan:generateTraining` → check-in energy/adherence adjustment → `generateTrainingPlan()` → `training_plans` + `training_sessions` ✓
5. **Show registration → countdown**: `shows:setPrimary` validates not-past → `syncPrimaryToNearest` keeps user.show_date current ✓
6. **Progress chart data flow**: `loadCheckinHistory` → sorted by date → chart data computed with proper null guards ✓
7. **Meal preference/exclusion substitution**: `getFood()` with `isMainMeal` guard → `SNACK_ONLY_FOODS` prevents snack ingredients bleeding into main meals ✓

### Bugs Found and Fixed

**Bug 1 — Phase label mismatch** (`electron/services/nutritionEngine.ts:754`)

`generateNutritionPlan` returned `phase` from a static `PHASE_MAP` (goal→string). A `maintain` goal with `weeks_out` set applied a real deficit (`getPhaseAwareDeficit` returns −150 to −350 kcal) but was labeled `'maintenance'`. Fix: derive `actualPhase` from the `adjustment` value (`< 0 → 'deficit'`, `> 0 → 'surplus'`, `0 → 'maintenance'`).

**Bug 2 — Snack calorie imbalance on low-calorie plans** (`electron/services/nutritionEngine.ts:264`)

`buildMeals` used a fixed `SNACK_CAL = 200` regardless of total plan calories. On minimum 1200 kcal plans with 6 main meals + 1 snack, the snack (200 kcal) exceeded the per-main-meal allocation (167 kcal) — making the snack the largest "meal" of the day. Fix: `SNACK_CAL = snackCount > 0 ? Math.min(200, Math.floor(totalCal / mealTemplates.length)) : 200`.

**Regression tests added** (`tests/unit/nutritionEngine.test.ts`):
- `maintain` off-season (no `weeks_out`) → `phase === 'maintenance'`
- `maintain` with `weeks_out=6` → `phase === 'deficit'`
- Snack calories ≤ average main meal calories on 1200 kcal plan

**Commit**: `4020f15` — `[QA] 2026-07-01: fix phase label mismatch and snack calorie imbalance on low-kcal plans`

---

## Phase 2 — Prep Athlete Feature (triggered: 2 bugs < 3)

### Feature Added: Recent Check-Ins Card on Dashboard

**File**: `src/pages/Dashboard/index.tsx`

**Why**: Athletes had no way to see their adherence trend without navigating to the Progress page. The last 4 check-ins' weight, training adherence %, diet adherence %, and calorie adjustment are immediately relevant to prep decision-making (e.g. "my diet adherence dropped from 90% to 70% — that's why my cut slowed").

**What was added**: Compact table card (visible when ≥2 check-ins exist) placed after the today/check-in grid:
- Columns: Week, Weight, Training %, Diet %, Calorie Adjustment
- Color-coded adherence (green ≥85%, yellow ≥70%, red <70%)
- Calorie adjustment column: green for cuts (−kcal), amber for increases, dash for no change
- Header row shows rolling averages for both adherence metrics
- Uses already-loaded `checkinHistory` — no new IPC calls

**Commit**: `48d8a0e` — `[Feature] Add Recent Check-Ins card to Dashboard`

---

## Phase 3 — UX Simplicity Fixes

### Fix 1: Weekly Prep Scorecard training session label denominator
**File**: `src/pages/Dashboard/index.tsx` — line 1033

The Training scorecard sub-label used `sessions.length` (total weekly sessions, e.g. 3) as the denominator, but the percentage correctly used `scheduledThisWeek.length` (sessions on/before today, e.g. 2 on a Wednesday). The label showed "1/3 sessions" while the score showed 50% — inconsistent. Fixed to use `scheduledThisWeek.length` with a fallback of `'not yet'` when no sessions are scheduled through today.

### Fix 2: Missing aria-label on Remove Supplement button
**File**: `src/pages/Dashboard/index.tsx` — line ~1935

The supplement remove button (`✕`) had only a `title` attribute. Screen readers announced the button as "button" with no action context. Added `aria-label={`Remove ${name}`}` to match the `title`.

**Commit**: `5f8c5de` — `[UX] Fix Scorecard training session count and add aria-label to supplement remove`

---

## Final State
- **Tests**: 112 passing, 0 failing
- **TypeScript**: 0 errors
- **Bugs fixed**: 2 (Phase 1)
- **Feature added**: Recent Check-Ins adherence table (Phase 2)
- **UX fixes**: 2 (Phase 3)
- **Pushed**: `origin/master` @ `5f8c5de`
