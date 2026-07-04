# Change Agent Report

## Run: 2026-07-04 (competition-only widgets)

### Environment note
`npm ci` failed on Electron's postinstall binary download (403 from the egress
policy — an org network denial, not retried). The Electron *binary* is only
needed to launch the app; tsc/vitest/electron-vite build do not require it, so
dependencies were installed with `ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci`, which
succeeded cleanly.

### STEP 1 — Regression guard
No regressions. On a clean checkout: `tsc --noEmit` PASS, `npm test` PASS
(150 tests), `electron-vite build` PASS.

### STEP 2 — Backlog item implemented
**Competition-only widgets, gated on show selection.** Turned posing practice,
supplements, sleep, and daily condition into first-class dashboard widgets that
are hidden (and left out of the Add Widgets catalog) until the user has a show
selected.

### Approach
- **New widgets** (`src/components/widgets/`): `PosingWidget.tsx`,
  `SupplementWidget.tsx`, `SleepWidget.tsx`, `ConditionWidget.tsx` — extracted
  the behavior verbatim from the four inline Dashboard sections.
- **Shared reactive stores**: `localStore.ts` (a `useSyncExternalStore`-backed
  localStorage-JSON factory, same shape as `useWidgets`) and `competitionLogs.ts`
  (the `posing_log` / `sleep_log` / `condition_log` / `supplement_list` /
  `supplement_log` stores + the `useHasShow()` gate). Posing and sleep are also
  read by the Dashboard "Weekly Prep Scorecard", so the shared store keeps that
  scorecard live when a widget logs an entry (previously all one component's state).
- **Gating**: added a `competitionOnly` flag to `WidgetDef`. `WidgetZone` and the
  Add Widgets catalog both filter out competition-only widgets unless
  `useHasShow()` (true when `shows.length > 0` or the legacy `user.show_date`).
  `WidgetZone` keeps each widget's *real* index in the stored enabled list while
  filtering, so drag-reorder indices remain correct when widgets are hidden.
- **Defaults**: the four ids were added to `ALL_WIDGET_IDS`/registry (in matching
  order) so a fresh install *with* a show gets them by default; a no-show install
  has them enabled-but-hidden until a show is added. Existing users keep their
  stored widget list and can add these from the catalog once a show exists.
- **Dashboard**: removed the four inline sections and their now-unused
  state/handlers; kept read-only reactive reads of posing/sleep for the scorecard.

### Files changed
- Added: `src/components/widgets/localStore.ts`,
  `src/components/widgets/competitionLogs.ts`,
  `src/components/widgets/PosingWidget.tsx`,
  `src/components/widgets/SupplementWidget.tsx`,
  `src/components/widgets/SleepWidget.tsx`,
  `src/components/widgets/ConditionWidget.tsx`,
  `tests/unit/competitionWidgets.test.tsx`
- Modified: `src/components/widgets/registry.tsx`,
  `src/components/widgets/useWidgets.ts`,
  `src/components/widgets/WidgetZone.tsx`,
  `src/pages/AddWidgets/index.tsx`,
  `src/pages/Dashboard/index.tsx`,
  `docs/change-backlog.md`

### STEP 4 — Verification
- `npx tsc --noEmit` — PASS (0 errors)
- `npm test` — PASS (155 tests, 17 files; +5 new)
- `npx electron-vite build` — PASS

### Deferred / notes
- Existing users who already have a saved `dashboard_widgets` list will not see
  the four widgets auto-added; they add them from the Add Widgets catalog once a
  show is selected (their underlying log data is untouched). This is intentional —
  auto-injecting into an existing list risks re-adding widgets a user removed.
