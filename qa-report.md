# App Health Report — 2026-05-19

## Phase 1: QA Engineer

- TypeScript: PASS (0 errors)
- Unit tests: PASS (31 passing, 0 failing)
- Bugs fixed: 0

### Feature Audit

- Onboarding: OK — All 6 steps navigate correctly; validateStep guards step 1 before user creation; plans generate async and redirect to dashboard cleanly.
- Diet page: OK — Meal swap updates local store state immediately; Food Preferences panel saves and regenerates plan; AI refine clears state correctly between calls.
- Training page: OK — Workout session starts, sets log to in-memory state, saveSetsBatch + completeWorkout persists on completion; Cancel discards via cancelWorkout.
- Check-in page: OK — Locked state shows correct countdown and allows editing last check-in; available state submits correctly and re-fetches next allowed date; early check-in error surfaces the lock date.
- Education page: OK — All 5 tabs (Prep Timeline, Posing Guide, Show Checklist, Peak Week, First Timer) render without crash; Timeline auto-expands current week; Carb Load calculator functional.
- Progress page: OK — Weight chart receives progressEntries; weekly rate and show projection compute correctly; measurement history table renders with unit conversion; empty state links to check-in.
- Settings page: OK — Unit toggle and check-in schedule settings persist via setSetting; Edit Profile form re-syncs on open; Save & Regenerate triggers plan generation.

### Bugs Fixed

None.

### Known Issues (not fixed)

- `src/pages/Training/WorkoutLogEditor.tsx` — `autoSave` calls `window.api.updateWorkoutSet` inside a `setRows` state-updater callback. Side effects inside React state setters are incorrect (could double-fire in Strict Mode). No crash observed in production Electron build, noted as technical debt.
- `src/pages/Diet/index.tsx` — Meal swap (bottom sheet) updates Zustand store in-memory only; does not persist to DB. User loses the swap on reload. No `updateDietPlan` IPC endpoint exists; fixing requires a backend change, out of QA scope.
- `src/pages/Education/index.tsx` — "Show Checklist" tab and "First Timer" tab both render FIRST_TIMER_CHECKLIST. Content duplication is a design issue; the tab rename in Phase 3 reduces confusion but full deduplication would require content restructuring.

---

## Phase 2: Bodybuilder User

- Status: RAN (Phase 1 fixed 0 bugs — under the 3-bug threshold)
- Feature added: **Measurement Changes Snapshot** — a grid of cards on the Progress page showing each tracked body measurement (waist, chest, hip, arm, thigh) with its current value and total change (↑/↓ with magnitude in cm or in) since the first check-in. Lets a prep athlete instantly see "waist -1.3cm ↓, arm +0.5cm ↑" without scanning the full history table. Appears only when ≥2 check-ins exist with matching measurement data for a given site. Green = decrease, amber = increase, gray = no change.
- Files changed: `src/pages/Progress/index.tsx`

---

## Phase 3: UX Reviewer

- Changes made: 2

`src/pages/CheckIn/index.tsx` — Weight input now defaults to the most recent check-in weight instead of the onboarding profile weight. A user 6 weeks into prep has already lost significant weight; seeing their old starting weight pre-filled every week forces an unnecessary clear-and-retype on a form submitted weekly. Using checkinHistory[0]?.weight_kg ?? user.weight_kg gives the correct last-known weight as a sensible default.

`src/pages/Education/index.tsx` — Renamed "Competition Prep" tab to "Show Checklist". Both "Competition Prep" and "First Timer" tabs rendered the same FIRST_TIMER_CHECKLIST data, leaving a user unable to distinguish them at a glance. "Show Checklist" accurately describes the tab's content (phase-by-phase prep checklist + show-day readiness checklist) and no longer overlaps semantically with "First Timer".
