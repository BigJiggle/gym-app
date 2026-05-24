# App Health Report — 2026-05-24

## Phase 1: QA Engineer

- TypeScript: PASS (0 errors)
- Unit tests: PASS (84 passing, 0 failing)
- Bugs fixed: 1

### Feature Audit

- Onboarding: OK — All 6 steps load, validation runs per-step (step 1), plan generation begins after user creation and navigate-away is intentional to avoid blocking on AI calls.
- Diet page: BUG FIXED — Macro distribution bar percentages could fail to sum to 100% (causing visual gaps or overflow in the bar).
- Training page: OK — Session accordion with auto-expanded today's session, "Start Workout" button prominent for today, workout session flow and set logging intact.
- Check-in page: OK — Locked state shows correct countdown and next date; open state form validates weight; missed slot back-fill works.
- Education page: OK — All 5 tabs render; Prep Timeline auto-selects when shows are present; empty state on Timeline guides users to Settings to add a show.
- Progress page: OK — Weight chart, measurements chart, trend card, and projection all present; stat cards use optional chaining safely when no entries.
- Settings page: OK — Units selector propagates globally; check-in schedule picker (day/interval/biweekly) updates store; profile edit saves and can regenerate plans.

### Bugs Fixed

- `src/pages/Diet/index.tsx:194–196` — Macro bar percentages computed independently against `calories_target` with `Math.round()`, so they could sum to 99% or 101%, producing gaps or overflow in the `overflow-hidden flex` bar. Fixed by normalising all three values against actual macro kilocalories (protein×4 + carbs×4 + fat×9) and computing fat as `100 - proteinPct - carbsPct` to guarantee the sum is exactly 100.

### Known Issues (not fixed)

- `src/pages/Onboarding/index.tsx:50` — `handleSubmit` calls `validateStep(1, data)` (re-validates step 1) instead of a final comprehensive check. Harmless in practice because step-level validation already ran on each `handleNext` call, but the code intent is unclear.
- `src/pages/Diet/GroceryList.tsx:67` — Fallback `multiplyQty(food, count * 7)` in `buildGroceryItems` may over-count gram amounts when a food appears with mixed gram/non-gram formats across meals. Affects only edge-case AI-generated plans; not fixed to avoid scope creep.

---

## Phase 2: Bodybuilder User

- Status: RAN (Phase 1 fixed 1 bug, below the 3-bug skip threshold)
- Feature added: **Weekly Muscle Coverage widget on Dashboard**
- Description: A compact 5-column grid below the "This Week's Volume" card shows how many sets each muscle group (Chest, Back, Delts, Tris, Bis, Quads, Hams, Glutes, Calves, Core) has accumulated since Monday. Groups with sets are highlighted in brand orange; untrained groups show a dash. Tapping the widget navigates to Training. Uses existing `workoutHistory` data already loaded by the Dashboard and `window.api.getExerciseLibrary()` (already used in the Training page). No new IPC handlers or DB schema changes.
- Files changed:
  - `src/pages/Dashboard/index.tsx` — added `useState`, `ExerciseLibraryItem` import, exercise library loading effect, `MUSCLE_GROUPS`/`MUSCLE_LABEL` constants, and the Weekly Muscle Coverage widget JSX

---

## Phase 3: UX Reviewer

- Changes made: 2

### Changes

- `src/pages/Diet/index.tsx` — Food exclusion `×` buttons on meal food chips were `opacity-0 group-hover:opacity-100` (completely invisible without mouse hover). On touch devices, tablets, or for any user who doesn't already know the feature exists, this action was undiscoverable. Changed to `opacity-40 hover:opacity-100` so the button is always faintly visible and becomes fully visible on hover/focus, making the feature self-revealing.

- `src/pages/Progress/index.tsx` — When no check-ins exist, the page showed the onboarding weight in both "Starting Weight" and "Current Weight" stat cards, with "—" for total change and "0 weeks tracked". This was misleading — it looked like data existed when it didn't. Added an explicit empty state that shows "No check-ins yet" with a brief explanation and a "Go to Check-In →" button, replacing the confusing near-empty stat display.
