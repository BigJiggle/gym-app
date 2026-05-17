# QA Report — 2026-05-17

## Summary
The app is structurally solid and compiles cleanly with no TypeScript errors. All 31 unit tests pass. Core flows (onboarding, check-in, training session, education, progress, settings) are well-implemented with good null safety and loading states. Three bugs were found and fixed: a day-of-week mismatch that caused the Dashboard to always highlight the wrong session as "Today," a non-functional swap meal feature that closed the modal without making any change, and missing error handling in the workout start flow. One known issue remains: meal swaps are applied to the in-session UI state only and are not persisted to the database (no backend API exists for single-meal swap persistence).

## Test Results
- TypeScript: PASS (0 errors)
- Unit tests: PASS (31 passing, 0 failing)

## Feature Audit
- Onboarding: OK — All 6 steps render correctly; validation on Step 1 works; unit toggles (cm/ft, kg/lbs) convert properly; plan is generated and user is redirected on submit.
- Diet page: BUG FIXED — Swap meal modal showed alternatives but clicking any option closed the modal without changing the meal; now updates the displayed meal immediately.
- Training page: BUG FIXED — `handleStartWorkout` had no error handling; a DB failure would silently fail to open the session overlay; errors now surface to the user via the existing error state.
- Check-in page: OK — Lock countdown renders correctly; edit-last-check-in panel opens/saves with proper imperial/metric conversion; submit flow validates weight and shows coach feedback.
- Education page: OK — All 5 tabs (Timeline, Posing Guide, Competition Prep, Peak Week, First Timer) render and are interactive; YouTube tutorial links open externally; carb-load calculator updates live.
- Progress page: OK — WeightChart renders with empty-state guard; measurement table reverses history correctly; adherence bars render from check-in data.
- Settings page: BUG FIXED (Dashboard side effect) — Units toggle, check-in schedule, theme, and Claude API key all save and apply correctly; the underlying day-of-week bug meant Settings → Units changes on Sunday would also be displayed with the wrong day on Dashboard.

## Bugs Fixed

`src/pages/Dashboard/index.tsx:54` — **Wrong day-of-week for today's session.**
`todayDow = new Date().getDay() + 1` maps Sunday→1, Monday→2 … Saturday→7. Training sessions use ISO weekday (Mon=1 … Sun=7), so the Dashboard always found the *next* day's session as "Today" (e.g. Monday showed Tuesday's workout, Sunday showed Monday's). Fixed by computing `jsDay = getDay()` then `todayDow = jsDay === 0 ? 7 : jsDay` and updating the day-name header to use `DAY_NAMES[jsDay]` directly.

`src/pages/Diet/index.tsx:648` — **Swap meal is a no-op.**
Each alternative card's `onClick` called `setSwapTarget(null)`, closing the modal without touching the plan. Fixed by patching the store's `dietPlan.meals` array at `swapTarget.mealIndex` with the selected alternative's food list before clearing the target.

`src/pages/Training/index.tsx:113` — **`handleStartWorkout` swallows errors silently.**
`await startWorkout(...)` was not wrapped in try/catch; a database or IPC failure would leave `sessionToStart` unset and show the user nothing. Wrapped in try/catch; errors now appear via the existing `aiError` state banner on the Training page.

## Known Issues (not fixed)

`src/pages/Diet/index.tsx` — **Meal swap is not persisted to the database.** The fix above updates the Zustand store state so the swap is visible in the current session, but there is no `window.api.swapMeal()` endpoint. Reloading the page will restore the original plan. A backend IPC handler that patches the `diet_plans.meals` JSON for a specific meal index would be needed for full persistence.

`src/pages/Onboarding/steps/Step5Review.tsx` — **Orphaned file.** This is an older version of the review step (fewer fields shown) that is never imported. The app correctly uses `Step6Review.tsx`. The file causes no runtime issue but should be deleted to avoid confusion.

`src/pages/Training/index.tsx` — **No "resume workout" UI for orphaned active workouts.** If the user starts a workout and then navigates away or closes the app, the workout log remains `in_progress` in the database. On return, `loadActiveWorkout` restores `activeWorkout` in the store but because `sessionToStart` is local state it resets to `null`, so the session overlay never reappears. The user must start a new workout, leaving a dangling `in_progress` log in history. Requires a "Resume your last workout?" prompt on Training page load.
