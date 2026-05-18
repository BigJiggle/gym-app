# QA Report — 2026-05-18

## Summary
The app is structurally sound with a well-organised codebase and no TypeScript errors or failing tests. All 31 unit tests pass. Three real user-facing bugs were found and fixed: the Education page opened on the wrong default tab (highlighting a middle tab while the first tab was visible), the workout timer kept counting on the post-workout summary screen, and returning to the Training page mid-workout left the user stuck with no way to resume or cancel their in-progress session. No crash-level null-dereference or broken-import issues were found. Overall app health is good.

## Test Results
- TypeScript: PASS (0 errors)
- Unit tests: PASS (31 passing, 0 failing)

## Feature Audit
- Onboarding: OK — 6-step flow validates correctly; imperial/metric unit toggles work; submit creates user and navigates to dashboard before plan generation completes.
- Diet page: OK — Meal plan, weekly view, and grocery list tabs all render correctly; food exclusion and swap-meal sheet work; food preferences panel saves and triggers regeneration.
- Training page: BUG FIXED — Active in-progress workout was not auto-resumed when user navigated away; returning to Training showed the regular plan view with no path back to the active workout.
- Check-in page: OK — Locked state with countdown and edit-last-check-in panel work correctly; weight/measurement unit conversion is correct; submit flow and success screen function as expected.
- Education page: BUG FIXED — Page defaulted to 'posing' tab (second in the tab list) while 'Prep Timeline' was shown first, making the tab bar appear selected on the wrong button at open.
- Progress page: OK — Weight chart renders with correct unit conversion; measurement history table and adherence bars display correctly.
- Settings page: OK — Unit toggle, check-in schedule (day-based and interval-based), theme switcher, profile editor with plan regeneration, and shows management all work correctly.

## Bugs Fixed

`src/pages/Education/index.tsx:18` — Default tab was `'posing'` (second item in the TABS list) while the tab bar renders `'timeline'` first, causing the UI to show the second tab highlighted on page open. Fixed by changing the default state from `'posing'` to `'timeline'`.

`src/pages/Training/WorkoutSession.tsx:181-184` — Timer `setInterval` ran indefinitely even after the workout was marked complete and the summary overlay appeared, so the displayed duration on the summary screen kept incrementing. Fixed by adding `phase` to the `useEffect` dependency array and returning early when `phase === 'summary'`.

`src/pages/Training/index.tsx:50-69` — If a user started a workout and navigated away via the sidebar (not the Cancel button), `activeWorkout` remained `in_progress` in the store but `sessionToStart` was always `null` on re-mount. The `WorkoutSession` overlay only renders when both are truthy, leaving the user with no way to resume or cancel. Fixed by adding a `useEffect` that matches the active workout's `session_id` against the training plan sessions and sets `sessionToStart` automatically, restoring the overlay.

## Known Issues (not fixed)

`src/pages/Onboarding/steps/Step5Review.tsx` — File is never imported anywhere (the onboarding flow uses `Step6Review`). This is orphaned dead code from when the review was step 5. No user impact; safe to delete in a cleanup pass.

`src/pages/Diet/index.tsx:648-656` — Swapping a meal updates the Zustand store in-memory only; the change is lost on navigation or reload. A full "Save & Regenerate" via the Food Preferences panel is needed to persist food choices. Fixing requires persisting meal overrides to the DB or adding a dedicated save action — larger feature scope than a QA fix.

`src/pages/Training/WorkoutLogEditor.tsx:100-115` — `autoSave` calls `window.api.updateWorkoutSet` inside a `setRows` state-setter callback, an anti-pattern (side-effects inside a React state updater). Harmless in production but could cause double-invocations under React Strict Mode. Refactor is low-risk but non-trivial.
