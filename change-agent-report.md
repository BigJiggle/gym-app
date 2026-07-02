# Change Agent Report

## Run: 2026-07-02

**STEP 1 — Regression guard:** No regressions found. On a clean checkout,
`npx tsc --noEmit`, `npm test` (14 files, 132 tests), and `npx electron-vite
build` all passed before any changes.

- Environment note: `npm ci` initially failed because Electron's postinstall
  tries to download the Electron binary, which the egress policy blocks (403).
  Worked around with `ELECTRON_SKIP_BINARY_DOWNLOAD=1` — the binary is not
  needed for typecheck/tests/build.

**Backlog item implemented:** _Remove the Energy Balance card._

Deleted the Dashboard "Today's Energy Balance" card (the `{dietPlan && (() =>
{...})()}` IIFE in `src/pages/Dashboard/index.tsx`). All of the helpers it
used — Harris-Benedict BMR calc, `CARDIO_MET` table, and the training/cardio
burn math — were locally scoped inside that IIFE, so they were removed with it
and nothing else references them. `cardioLog`, `workoutHistory`, and
`mealCompletions` are still consumed by other cards, so their imports/hooks
remain.

**Files changed:**
- `src/pages/Dashboard/index.tsx` — removed the Energy Balance card block.
- `docs/change-backlog.md` — checked the item off.

**Verification (all PASS):**
- `npx tsc --noEmit` — clean, no unused-variable errors.
- `npm test` — 14 files, 132 tests passing.
- `npx electron-vite build` — built successfully.

**Deferred:** Nothing for this item.
