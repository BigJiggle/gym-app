# App Health Report — 2026-05-27

## Phase 1: QA Engineer
- TypeScript: PASS (0 errors)
- Unit tests: PASS (84 passing, 0 failing)
- Bugs fixed: 1

### Feature Audit
- Onboarding: BUG FIXED — shows are now synced to the store after the window.api.addShow() call so the NavSidebar countdown and Education timeline reflect the new show immediately.
- Diet page: OK — meal swap flow, grocery list, weekly view all work correctly; swap modal has proper error handling and loading state.
- Training page: OK — workout session start, set logging, completion, rest timer, and history with PRs all function correctly.
- Check-in page: OK — locked/available states, missed slot fill-in, edit last check-in, and schedule interval all work correctly.
- Education page: OK — all 5 tabs (Posing Guide, Prep Timeline, Show Checklist, Peak Week, First Timer) render and function correctly; posing timer, carb load calculator, and interactive checklists work.
- Progress page: OK — weight chart, measurements chart, wellness scores, and empty states all handled correctly.
- Settings page: OK — unit toggle, check-in schedule (day-based and interval-based), edit profile, and show management all function correctly.

### Bugs Fixed
- `src/pages/Onboarding/index.tsx:58` — `window.api.addShow()` was called directly, bypassing the `userStore.addShow()` method, so the `shows` state was never populated after onboarding. Added `await loadShows(user.id)` after the API call to sync the store. Consequence was that NavSidebar showed no show countdown and Education page never auto-switched to the Prep Timeline tab for new users.

### Known Issues (not fixed)
- None found that warrant a fix; all other suspected issues from static analysis were false positives or already handled by existing guards.

---

## Phase 2: Bodybuilder User
- Status: RAN (Phase 1 fixed fewer than 3 bugs)

### Run 1
- Feature added: **Muscle MEV Progress Bars** — Each muscle group tile in the Training page "This Week's Volume" section now shows a mini progress bar comparing current weekly sets against its Minimum Effective Volume (MEV) threshold. Green = at/above MEV (muscle is maintained), yellow = 60–99% (getting close), red = below 60% (risk of muscle loss during a cut). The set count is displayed as `sets/mev` so a prep athlete can see at a glance which muscles are undertrained for the week.
- Files changed: `src/pages/Training/index.tsx`

### Run 2
- Feature added: **Weekly Measurement Rate** — Each measurement site card (waist, chest, hip, arm, thigh) on the Progress page now shows its weekly rate of change (e.g. `−0.3cm/wk` or `+0.2in/wk`). Only shown when ≥1 week of data exists between oldest and newest check-in. Coloured green when measurement is decreasing (good on a cut) and amber when increasing.
- Files changed: `src/pages/Progress/index.tsx`

---

## Phase 3: UX Reviewer
- Changes made: 4 total (2 per run)

### Run 1
1. `src/pages/Diet/index.tsx` — Meal card headers are now clickable to toggle the "Mark Eaten" state. A checkmark circle appears next to the meal name when eaten, and the meal name gets a strikethrough — matching the pattern already used in the Dashboard. Previously the only way to mark a meal eaten was a small `text-xs` button buried at the bottom of the card after the full ingredient list, which required visual scanning for the most-used action on the page.

2. `src/pages/Training/index.tsx` — The empty-state CTA button in the History tab was changed from the passive "View Training Plan →" to "Start Today's Workout →". Both versions switch to the plan tab (where today's session is auto-expanded), but the new label tells a first-time user exactly what to do rather than describing a passive browsing action.

### Run 2
3. `src/pages/Training/WorkoutStats.tsx` — Moved the Personal Records table from the bottom of the Stats tab (after 6 scrollable sections) to immediately after the all-time summary grid. PRs are the highest-signal data on the page for a competitive athlete and should not require scrolling past weekly tonnage, volume tables, and charts to reach.

4. `src/pages/CheckIn/index.tsx` — Added `lowerIsBetter` prop to the `RatingBar` component. The Stress Level rating bar now uses a green→yellow→red colour ramp (1–2 green, 3 yellow, 4–5 red) instead of the same flat brand-orange used for Energy and Sleep. This signals at a glance that high stress is bad — a user rating their stress at 5 no longer sees it highlighted identically to a top Energy score.

---

---

## Run 3 — 2026-05-27

### Phase 1: QA Engineer
- TypeScript: PASS (0 errors)
- Unit tests: PASS (84 passing, 0 failing)
- Bugs fixed: 0

#### Feature Audit
- All 7 user flows re-audited; no new bugs introduced by previous runs.

### Phase 2: Bodybuilder User
- Status: RAN (Phase 1 fixed fewer than 3 bugs)
- Feature added: **Daily Posing Practice Streak Tracker** — A streak card on the Education → Posing tab lets a contestant mark whether they practiced posing today. Consecutive days are tracked via localStorage. The card turns green when today is marked, shows a fire emoji after 7+ days, and displays the current streak count. Built entirely on frontend state with no IPC or DB changes.
- Files changed: `src/pages/Education/index.tsx`

### Phase 3: UX Reviewer
- Changes made: 2

1. `src/pages/Training/index.tsx` — The full-width "▶ Start Workout" button inside expanded session cards now reads "↺ Redo Workout" when that session is already completed today, matching the button already present in the session card header. Previously the header button correctly showed "↺ Redo" but the identical CTA below the exercise list was hardcoded to "▶ Start Workout", creating an inconsistency for users who scroll into the expanded card after completing a workout.

2. `src/pages/Settings/index.tsx` — The Edit Profile section's two save buttons were renamed and given a guidance line. "Save Changes" → "Save Only" and "Save & Regenerate Plans" kept, with a helper sentence above ("Changed weight, age, or body fat? Just save. Changed training days or diet type? Save & regenerate.") and `title` tooltip attributes. This eliminates the ambiguity that caused users to either always pick the wrong button or always regenerate unnecessarily.

## Push
- Status: SUCCESS
