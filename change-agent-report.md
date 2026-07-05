# Change Agent Report

## 2026-07-05

**STEP 1 — Regression guard:** No regressions. Baseline `npx tsc --noEmit`,
`npm test` (155 tests), and `npx electron-vite build` all passed before any change.
(Note: `npm ci` needed `ELECTRON_SKIP_BINARY_DOWNLOAD=1` — the electron binary
download is 403'd through the agent proxy; not needed for tsc/tests/build.)

**Backlog item implemented:** "Simplify Training & Nutrition tabs into widgets."

Broke the Training "My Plan" tab and the Nutrition "Meal Plan" tab into
add/removable, persisted widgets, reusing the dashboard widget concept.

- New `src/components/widgets/createWidgetStore.ts` — generic factory
  (`createWidgetStore(storageKey, allIds, defaultIds?)`) generalizing the
  dashboard `useWidgets` enabled-list logic: reactive `useSyncExternalStore`,
  drops unknown ids, de-dupes corrupted storage, supports a trimmed default set
  distinct from the full catalog. Dashboard `useWidgets` left untouched.
- New `src/components/widgets/TabWidgetControls.tsx` — reusable "Customize"
  control (shows N/total shown, add/remove catalog with descriptions).
- New `src/components/widgets/tabWidgets.ts` — per-tab metadata + stores with
  distinct keys `training_plan_widgets` / `nutrition_plan_widgets` and trimmed
  defaults (Training: countdown, sessions-week, volume; Nutrition: today's intake,
  water, meal schedule).
- `src/pages/Training/index.tsx` — render `TabWidgetControls` atop the plan tab;
  each summary card (countdown, phase, sessions-this-week, calorie-burn, volume)
  renders only when its id is enabled. Session cards / AI refine stay always-on.
- `src/pages/Diet/index.tsx` — same pattern for 7 cards (today's intake, water,
  cardio, refeed, adherence streak, this-week, meal schedule). Macro stat cards
  and the meals list stay always-on.

Chose an inline-guard approach (each card gated by a `store.useEnabledIds()` set)
rather than lifting hundreds of lines of JSX out of these 985- and 1862-line
pages — the minimum, lowest-risk change that satisfies the acceptance.

**Files changed:** `src/components/widgets/createWidgetStore.ts` (new),
`src/components/widgets/TabWidgetControls.tsx` (new),
`src/components/widgets/tabWidgets.ts` (new),
`tests/unit/tabWidgets.test.tsx` (new, 9 tests),
`src/pages/Training/index.tsx`, `src/pages/Diet/index.tsx`,
`docs/change-backlog.md`.

**Verification:** `npx tsc --noEmit` PASS · `npm test` PASS (164 tests) ·
`npx electron-vite build` PASS.

**Deferred:** Drag-reorder for these tabs is the next backlog item ("Rearrange
Training & Nutrition widgets") and depends on this one — intentionally left out to
respect one-item-per-run. The new store already exposes `reorder` for that follow-up.
