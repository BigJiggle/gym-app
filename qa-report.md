# App Health Report — 2026-05-20

## Phase 1: QA Engineer
- TypeScript: PASS (0 errors)
- Unit tests: PASS (31 passing, 0 failing)
- Bugs fixed: 1

### Feature Audit
- Onboarding: OK — 6-step wizard with validation, defaults pre-populated, back/forward navigation works correctly.
- Diet page: OK — Meal swap, food preferences, weekly view, and grocery list all functional; macro tracking works.
- Training page: OK — Session cards expand correctly, workout session overlay starts/saves/completes properly with imperial/metric conversion.
- Check-in page: OK — Locked state shows countdown with edit-last-check-in panel; available state shows full form; early submission blocked correctly.
- Education page: BUG FIXED — Default tab ('posing') wasn't switching to 'timeline' when shows loaded asynchronously after component mount.
- Progress page: OK — Weight chart, measurement changes, adherence history, and trend projection all display correctly.
- Settings page: OK — Unit system, check-in schedule (day-based and interval), profile edit, and reset all work as expected.

### Bugs Fixed
- `src/pages/Education/index.tsx` — `useState` initial value computed `hasUpcomingShow` from `shows` before they loaded from the database. `loadUser()` sets `loading: false` before `listShows()` completes, so the Education component could mount with `shows = []` even if the user had upcoming competitions. Fixed by adding a `useEffect` that auto-switches from 'posing' to 'timeline' the first time `hasUpcomingShow` becomes `true`, without overriding subsequent manual tab selections.

### Known Issues (not fixed)
- `src/pages/Progress/index.tsx:14` — The local variable `window` inside `computeWeeklyRate` shadows the global `window` object. Not a runtime bug (the function doesn't use `window.api`), but is a naming hazard worth renaming in a future cleanup pass.
- `src/pages/Diet/index.tsx` — Meal swaps via the "Swap Meal" modal are in-memory only (stored in Zustand, not persisted to the database). Swapped foods reset on next app launch. Addressed in Phase 3 with a clarifying note; persistence would require a backend change.

---

## Phase 2: Bodybuilder User
- Status: RAN (Phase 1 fixed 1 bug, fewer than 3)
- Feature added: **Exercise Personal Records shown inline in expanded Training session cards**
  - When a session card is expanded, each exercise now displays the user's all-time best set (e.g., "PR: 100kg × 5") sourced directly from `workoutHistory` already loaded in the component.
  - Helps athletes on a cut immediately see if they're maintaining strength on each lift without navigating to Training > History > Stats & Charts.
  - Weight is shown in the user's preferred unit (kg or lbs).
  - Exercises with no logged history show no PR label (clean empty state).
- Files changed:
  - `src/pages/Training/index.tsx` — added `useMemo` import, `exercisePRs` computed from `workoutHistory`, `isImperial` helper, and PR display in the expanded exercise list.

---

## Phase 3: UX Reviewer
- Changes made: 2

1. `src/pages/Training/index.tsx` — Today's session card border changed from `border-brand-800/40` (barely visible 40% opacity dark orange) to `border-brand-500 bg-brand-950/10` (solid brand border with subtle background tint). A tired user after a workout needs to instantly spot their session without hunting for the small "Today" text label.

2. `src/pages/Diet/index.tsx` — Added a one-line note inside the "Swap Meal" modal: *"This swap updates your view for today. To permanently exclude a food, tap ✕ on it in the meal card."* Users expect app actions to be saved; without this note, they would be confused when the original meal returned on next launch. The note also teaches them the correct path for permanent food exclusions.
