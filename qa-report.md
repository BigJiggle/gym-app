# App Health Report — 2026-05-24

## Phase 1: QA Engineer
- TypeScript: PASS (0 errors)
- Unit tests: PASS (84 passing, 0 failing)
- Bugs fixed: 2

### Feature Audit
- Onboarding: OK — all 6 steps flow correctly; step 1 validation fires on Next, final step validates step 1 data defensively before submit.
- Diet page: OK — meal swap, recalculate, food exclusions, and AI refine all flow correctly; null guards on `meals?.[index]` prevent NaN in progress bars.
- Training page: BUG FIXED — WorkoutLogEditor null guard on `workoutLog.sets` (see Bugs Fixed).
- Check-in page: OK — locked/unlocked states behave correctly; missed-slot fill-in and edit-last-checkin flows are intact; unit conversion helpers are consistent.
- Education page: OK — all 5 tabs (Prep Timeline, Posing Guide, Show Checklist, Peak Week, First Timer) render correctly; timeline auto-expands current week; shared `expandedChecklist` state uses key prefixes to avoid cross-tab collision.
- Progress page: BUG FIXED — `totalChange` stat now requires ≥ 2 entries (see Bugs Fixed).
- Settings page: OK — unit toggle, check-in schedule (day/interval modes), shows management, and profile edit all behave correctly.

### Bugs Fixed

`src/pages/Training/WorkoutLogEditor.tsx:44` — `workoutLog.sets.map(...)` had no null guard in the branch that builds placeholder rows for unlogged exercises. If `sets` arrived as undefined, this would throw at runtime. Changed to `(workoutLog.sets ?? []).map(...)` to match the defensive guard already present at line 28.

`src/pages/Progress/index.tsx:49` — `totalChange` was computed as `first && latest ? ...` which evaluates to `true` when there is exactly one progress entry (since `first === latest`), showing a misleading "0.0 kg" delta. Changed guard to `progressEntries.length >= 2` so the stat only appears when there is actual change to report.

### Known Issues (not fixed)
- `WorkoutSession.tsx:232` — dependency array uses a boolean expression (`[restSecsLeft !== null && restSecsLeft > 0]`) instead of the raw state variable. This is a React hooks lint violation but functions correctly for this timer use case; changing it to `[restSecsLeft]` would re-create the interval every second. Left as-is to avoid unintended side effects.
- `Step2Goals.tsx:100` — competition history is a multi-select that allows contradictory choices (e.g. "No shows" + "3–5 shows"). UX issue only; no crash risk.

---

## Phase 2: Bodybuilder User
- Status: RAN (Phase 1 fixed 2 bugs, fewer than 3)
- Feature added: **Projected show-day trendline on weight chart**
- Description: The `WeightChart` component now accepts `projectedWeightKg` and `weeksToShow` props. When the user has a show date set and at least 2 check-ins, a dashed blue line extends from the last actual data point to a "Show Day" endpoint showing the extrapolated weight at the current loss rate. A legend (Actual / Projected to show) and a distinctive blue endpoint dot make the projection scannable at a glance. The `Progress` page passes the already-computed `projectedWeightKg` and `weeksToShow` values straight through — no new DB schema or IPC calls required.
- Files changed:
  - `src/components/charts/WeightChart.tsx` — added `projectedWeightKg` / `weeksToShow` props, projected `Line` with `strokeDasharray`, custom dot for show-day endpoint, legend row
  - `src/pages/Progress/index.tsx` — passed new props to `WeightChart`

---

## Phase 3: UX Reviewer
- Changes made: 2

`src/pages/Training/index.tsx:382` — Volume grid showed `5s` for set counts. The single-letter suffix is ambiguous (reads as "5 seconds" on tired eyes). Changed to `5 sets` / `sets↓` so the unit is unambiguous without any extra thought.

`src/pages/Training/index.tsx:466` — The "Start Workout" button on today's session card used `text-xs px-3 py-1` — the same small size as every other session's button. Starting today's workout is the app's primary daily action; its button now uses `text-sm px-4 py-2` when `isToday`, making it noticeably larger and easier to tap after a hard training session.
