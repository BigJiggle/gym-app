# QA Report & Methodology — Gym App

## How to run QA

```bash
npm test                          # unit + integration tests (54 tests)
npx tsx scripts/qa-runner.ts      # service-layer logic checks (fast, no UI)
```

Results are definitive. If tests fail, a real user will notice a bug.

---

## Methodology: Human-Journey Testing

Every QA pass follows these principles:

### 1. Enter the app as a new user
Open the app with no prior state. Note the **first thing you see**. If it looks wrong, it is wrong — a new user cannot contextualise confusion.

Verify on first open:
- Correct default tab is highlighted on every page
- No blank screens, spinners, or error states
- No console errors in DevTools

### 2. Follow every critical user journey end-to-end

A "journey" is a sequence of actions a real user would take in order. Each journey is tested completely, not just its individual steps in isolation. After EACH action, verify the **visible state matches the data state** (store ↔ UI ↔ DB).

### 3. State consistency rule

After any mutation (submit, update, delete, complete), ask:
> "Does every surface that displays this data now show the correct value?"

If the Diet page shows old macros after a check-in that triggered an adjustment — that is a bug, even if the DB has the right value.

### 4. Adversarial paths

Deliberately do things in unexpected order:
- Change settings mid-action
- Navigate away mid-form
- Submit the same action twice rapidly
- Go backwards (e.g., fill old dates, reduce weeks-out, change goal)

---

## Critical User Journeys

### Journey A — First launch to first check-in

| Step | Action | Expected state |
|------|--------|---------------|
| 1 | Open app | Onboarding shown (no user) |
| 2 | Complete 6-step onboarding | Dashboard shown, training + diet plans populated |
| 3 | Navigate to Check-In | Form is open (no prior check-ins), shows "Week 1" |
| 4 | Submit check-in (weight, adherence, wellbeing) | Success screen shown with coach feedback |
| 5 | Navigate to Diet | Calories reflect any adjustment from check-in (not stale) |
| 6 | Click "Done" on success screen | Lock screen shows, countdown to next check-in is correct |

**State checks after step 4:**
- `checkinHistory[0]` matches the submitted data
- `latestCheckin` is the same object as `checkinHistory[0]`
- `dietPlan.calories_target` has been updated if `adjustments.calories_delta !== 0`
- All meal calories in `dietPlan.meals` scale proportionally

---

### Journey B — Workout session: log sets, navigate away, resume

| Step | Action | Expected state |
|------|--------|---------------|
| 1 | Start a workout | `activeWorkout.sets = []` |
| 2 | Log 3 sets | `activeWorkout.sets.length = 3` immediately |
| 3 | Navigate to Diet page | Diet page loads normally |
| 4 | Navigate back to Training | Workout session overlay reappears with all 3 sets visible |
| 5 | Log 2 more sets | `activeWorkout.sets.length = 5` |
| 6 | Complete workout | `activeWorkout = null`, workout appears in history |

**State checks after step 2:**
- Store `activeWorkout.sets[*].id` are real DB ids, not synthetic values
- Editing a set (same exercise, same set_number) replaces — does NOT duplicate

---

### Journey C — Check-in schedule: miss a deadline, fill retroactively

| Step | Action | Expected state |
|------|--------|---------------|
| 1 | Set schedule to "Every Monday" | Settings saved |
| 2 | Simulate last check-in 3 weeks ago | Check-in DB record in past |
| 3 | Open Check-In page | Form is **OPEN** (not locked until next Monday) |
| 4 | Submit check-in | Success; locked until next Monday |
| 5 | Open locked screen | Shows 2 "Missed — Expected [date]" amber panels (2 skipped weeks) |
| 6 | Expand one missed panel, enter data, submit | That missed panel disappears; history has new entry |
| 7 | Week numbers in history are sequential by date | No gaps, no duplicates |

**State checks after step 6:**
- `checkinHistory` sorted by `check_in_date DESC`
- `week_number` values form a complete sequence 1…N with no gaps
- The filled-in entry appears in the correct chronological position

---

### Journey D — Interval switch: old missed slots preserved, new interval applies

| Step | Action | Expected state |
|------|--------|---------------|
| 1 | Schedule = 7 days; 2 check-ins with 14-day gap = 1 missed | 1 amber panel shown |
| 2 | Change interval to 2 days in Settings | Lock screen refreshes immediately (no navigation required) |
| 3 | The 1 missed slot from the 7-day period remains visible | Panel still shows the missed 7-day slot |
| 4 | Go 2 days without checking in after the most recent | A new missed slot (2-day interval) appears |
| 5 | Submit new check-in | New entry label reflects "2-Day Check-In N" not "Week N" |
| 6 | Old check-in labels (pre-switch) still say "Week N" | Legacy labels preserved |

---

### Journey E — Diet meal swap (known open issue BUG-010)

| Step | Action | Expected state |
|------|--------|---------------|
| 1 | Open Diet page | Meal plan loaded |
| 2 | Swap Breakfast meal | New meal appears in Breakfast slot |
| 3 | Navigate away and back | ⚠ **KNOWN BUG**: Swap is lost — original meal returns |

This is a **known open issue**. Until fixed, document it for users and do not mark QA as passed for this scenario.

---

### Journey F — Adversarial: rapid taps and concurrent submissions

| Scenario | Expected behaviour |
|----------|--------------------|
| Tap "Complete meal" twice in <100ms | Exactly 1 entry in DB and store |
| Log a set while completeWorkout is in-flight | Both operations complete; no stale state |
| Change check-in interval while locked screen is visible | Countdown updates in-place without reload |
| Submit check-in while another check-in is processing | Second submit blocked (loading=true) |
| Navigate to Settings, change goal, navigate to Dashboard | Startup refresh runs if needed |

---

## State Consistency Table

After each mutation, verify these surfaces match:

| Mutation | Store key | UI surface | Verify |
|----------|-----------|------------|--------|
| `submitCheckin` | `checkinHistory`, `latestCheckin`, `dietPlan` | Check-in history, Diet macros | Diet macros updated if delta ≠ 0 |
| `logSet` | `activeWorkout.sets` | WorkoutSession set list | New set visible immediately |
| `completeWorkout` | `activeWorkout = null` | Training page | No session overlay |
| `logMealCompletion` | `mealCompletions` | Diet meal checkmarks | Real DB id in store (not Date.now()) |
| `unlogMealCompletion` | `mealCompletions` | Diet meal checkmarks | Entry removed |
| `recalculateMacros` | `dietPlan` | Diet calorie display | Correct new value |
| `generateTrainingPlan` | `trainingPlan` | Training sessions list | Session count = training_frequency |
| `submitMissedCheckin` | (via loadCheckinHistory) | Missed slot panels | Panel disappears; week_numbers sequential |
| `resetAllData` | all stores cleared | Onboarding shown | No stale data anywhere |

---

## Regression Tests (automated)

All previously found bugs have regression tests:

| Bug ID | Regression test file | Status |
|--------|---------------------|--------|
| BUG-001 (Education tab) | Manual: open Education → 'Prep Timeline' selected | Fixed |
| BUG-002 (timer on summary) | Manual: complete workout → timer frozen | Fixed |
| BUG-003 (resume workout) | Manual: navigate away → WorkoutSession overlay reappears | Fixed |
| BUG-004 (extra week lockout) | `tests/unit/checkinSchedule.test.ts` (day-based past-due) | Fixed |
| BUG-005 (late = missed) | `tests/unit/checkinSchedule.test.ts` (13-day gap → 0 missed) | Fixed |
| BUG-006 (Week N conflict) | `tests/unit/checkinSchedule.test.ts` (no "Week N" in label) | Fixed |
| BUG-007 (logSet stale) | `tests/integration/storeJourneys.test.ts` (sets in store) | Fixed |
| BUG-008 (synthetic meal id) | `tests/integration/storeJourneys.test.ts` (real DB id) | Fixed |
| BUG-009 (ORDER BY id) | `tests/unit/checkinSchedule.test.ts` (retroactive fill) | Fixed |
| BUG-010 (meal swap lost) | Manual: swap meal → navigate away → BUG still present | **Open** |

---

## Bug Registry

All bugs are tracked in `qa-bugs.json`. When a new bug is found:

1. Add an entry with a new `id` (BUG-NNN), `status: "open"`, and a precise `regression_test` description.
2. Write the regression test (unit or integration) before fixing.
3. On fix, set `status: "fixed"` and `date_fixed`.
4. Run `npm test` — the regression test must pass.

This ensures every bug can NEVER silently return.

---

## QA Agent Instructions

When running a QA pass, the agent must:

1. **Run `npm test`** — all 54+ tests must pass. Any failure is a blocker.
2. **Run `npx tsx scripts/qa-runner.ts`** — all service-layer checks must pass.
3. **Open `qa-bugs.json`** — check for any `"status": "open"` bugs. Verify they are documented in the Known Issues section.
4. **Trace each Journey (A–F)** above through the codebase:
   - Read the store action being called
   - Read what API call it makes
   - Read what state update it does
   - Ask: "Is there any path where the user does X and the store/UI doesn't reflect it?"
5. **Check every store mutation** against the State Consistency Table above.
6. **Food appropriateness check** (after any diet plan generation): Verify each main meal (Breakfast, Mid-Morning, Lunch, Dinner, Pre-Workout, Post-Workout) does not contain snack-only foods as its primary protein or carb anchor. Specifically, the following food strings must NOT appear as the primary item in Lunch or Dinner: `Greek Yogurt`, `Apple`, `Banana`, `Rice Cakes`, `Whey Protein Shake`, `Pea Protein Shake`, `Cottage Cheese`. If they appear it means food preference substitution is running without meal-context filtering. Also verify that `include_snacks: true` WITH `food_preferences: ['greek_yogurt']` still shows greek yogurt in snack slots (it must not be blocked there).

7. **Look for these anti-patterns** (each one has historically caused bugs):
   - `catch { /* non-fatal */ }` — silent swallowing of errors
   - `id: Date.now()` — synthetic IDs that can collide
   - `ORDER BY id DESC` — wrong when retroactive inserts exist (use `ORDER BY check_in_date DESC`)
   - Optimistic state updates with no rollback on failure
   - Loading state (`loading: true`) that is never reset to `false` on error paths
   - Cross-store mutations via `usePlanStore.setState()` — fragile, bypasses subscriptions
7. **Report any new bug** by adding it to `qa-bugs.json` with a regression test before proposing a fix.

---

## Bugs Fixed This Session

| Bug | File | Fix |
|-----|------|-----|
| Education default tab | `src/pages/Education/index.tsx:18` | Changed default from `'posing'` to `'timeline'` |
| Workout timer on summary | `src/pages/Training/WorkoutSession.tsx:181` | Added `phase` to `useEffect` deps, early return when `phase === 'summary'` |
| Can't resume workout after navigation | `src/pages/Training/index.tsx:50` | Added `useEffect` to match `activeWorkout.session_id` and restore `sessionToStart` |
| Check-in extra-week lockout | `electron/ipc/checkinHandlers.ts:20` | `getNextCheckinDate` now starts from `last_date + 7`, not `today` |
| Late check-in shown as missed | `electron/services/checkinSchedule.ts` | `floor(days/interval) - 1` — late submissions no longer create false missed slots |
| Missed slot label conflicts | `electron/services/checkinSchedule.ts` | Date-based labels — no week numbers in missed panels |
| `logSet` stale store | `src/store/planStore.ts:127` | `logSet` now appends/replaces result in `activeWorkout.sets` |
| Meal completion synthetic id | `electron/ipc/mealCompletionHandlers.ts:11` | Handler returns real DB record; store uses returned id |
| `ORDER BY id DESC` broke after retroactive fill | `electron/ipc/checkinHandlers.ts:34,224` | Changed to `ORDER BY check_in_date DESC` |
| `checkin_schedule_type` not seeded | `electron/database/schema.ts` | Added seed rows for `checkin_schedule_type` and `checkin_biweekly` |

## Known Issues (not yet fixed)

`src/pages/Diet/index.tsx:648-656` — Swapping a meal updates the Zustand store in-memory only; the change is lost on navigation or reload. Fixing requires persisting meal overrides to the DB — tracked as BUG-010 in `qa-bugs.json`.

`src/pages/Training/WorkoutLogEditor.tsx:100-115` — `autoSave` calls `window.api.updateWorkoutSet` inside a `setRows` state-setter callback. Harmless in production, could double-invoke under React Strict Mode.

## Check-In Interval Edge Cases — QA Checklist

- [ ] Day-based, check-in day was yesterday: form is OPEN (not locked until next week)
- [ ] Day-based, checked in today already: form is LOCKED with countdown showing 7 days
- [ ] Interval-based, interval has passed: form is OPEN
- [ ] Interval-based, interval has not passed: form is LOCKED with correct countdown
- [ ] Changing interval in Settings while on the locked screen: countdown updates without navigation
- [ ] Check-in history with a gap: "Missed" amber panels appear with date labels (no "Week N")
- [ ] Fill-in a missed slot: new check-in appears in history sorted by date, week_numbers sequential
- [ ] Check-in submitted under day-based schedule shows "Week N" label
- [ ] Check-in submitted after switching to interval-based shows interval label ("N-Day Check-In N")
- [ ] Existing "Week N" records unaffected by interval change (still say "Week N")
- [ ] Biweekly: check-in only unlocks after 14 days
- [ ] Late submission (within 1 interval of due date) shows NO missed slot panel
- [ ] Retroactive date editing recalculates nextAllowed immediately on the lock screen
