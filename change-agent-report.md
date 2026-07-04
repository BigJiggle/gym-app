# Change Agent Report

## Run: 2026-07-04

**STEP 1 — Regression guard:** No regressions. On the freshly pulled master:
- `npx tsc --noEmit` — PASS (clean)
- `npm test` — PASS (139 tests, 15 files)
- `npx electron-vite build` — PASS

Note: `npm ci` initially failed because Electron's binary postinstall download
from GitHub releases is blocked by the environment egress policy (403). Installed
with `ELECTRON_SKIP_BINARY_DOWNLOAD=1` — the binary isn't needed for
tsc/tests/build. No code change required.

**STEP 2 — Backlog item implemented:** *Reset data keeps weigh-ins and water
intake* (topmost unchecked). On reset, everything is wiped EXCEPT weigh-in history
(daily weight log + check-in weight history) and water intake logs.

Root cause of the gap: the old reset did `DELETE FROM users` (cascades, wiping
`weekly_checkins` = check-in weigh-in history) but did **nothing** to localStorage,
so all app-local logs (cardio, sleep, posing, condition, supplements, refeed,
dashboard widgets, milestones) survived a "reset" while check-in weigh-ins were
lost. Both wrong per the item.

Fix:
- `electron/ipc/userHandlers.ts` — `user:resetAll` snapshots each check-in's
  `(check_in_date, weight_kg)` before the cascade delete, returns them as
  `checkinWeights`.
- `src/utils/resetData.ts` (new) — `resetLocalData(storage, checkinWeights)` folds
  the preserved check-in weigh-ins into `daily_weight_log` (existing daily entry
  wins on a same-date clash; invalid/NaN/non-positive dropped; sorted asc), then
  removes every localStorage key that isn't preserved. Preserved keys:
  `daily_weight_log`, `water_target_ml`, `water_ml_*`.
- `src/store/userStore.ts` — `resetAllData` calls `resetLocalData` with the returned
  weigh-ins (try/catch so a localStorage failure can't undo the successful DB reset).
- `src/types/index.ts` — widened `resetAllData` return type.
- `src/pages/Settings/index.tsx` — reset card copy now notes weigh-ins + water are kept.

App settings (theme/units/Claude key) live in the DB `settings` table (not
localStorage), so they survive both the cascade delete and the localStorage sweep —
matching the existing "settings are kept" behavior.

**Files changed:** `electron/ipc/userHandlers.ts`, `src/utils/resetData.ts` (new),
`src/store/userStore.ts`, `src/types/index.ts`, `src/pages/Settings/index.tsx`,
`tests/unit/resetData.test.ts` (new, 11 tests), `docs/change-backlog.md`.

**Verification:** `npx tsc --noEmit` PASS · `npm test` PASS (150 tests, 16 files;
+11 new) · `npx electron-vite build` PASS.

**Deferred:** Nothing for this item. Remaining backlog items untouched (one per run).

---

## Run: 2026-07-03 (b)

**STEP 1 — Regression guard:** No regressions. On the freshly pulled master,
`npx tsc --noEmit`, `npm test` (137 tests), and `npx electron-vite build` all
passed before any new work.

- Setup note: `npm ci` needs `ELECTRON_SKIP_BINARY_DOWNLOAD=1` (electron binary
  download is blocked by the sandbox proxy; the binary isn't needed for
  tsc/tests/build).

**Backlog item implemented:** _Meals 1–20 and snacks 0–20 in onboarding + settings._

Widened meals per day from the old 3–6 clamp to **1–20** and snacks from 0–3 to
**0–20**, generating correct plans at the extremes with no NaN/absurd portions.

- `electron/services/nutritionEngine.ts` — `getMealTemplates` now cycles the 6
  main-meal and 3 snack templates so any count yields exactly that many entries;
  `generateNutritionPlan` meal clamp `3–6`→`1–20`, and snack count is resolved to a
  finite value and clamped `0–20` (NaN previously survived `??` and zeroed out
  main-meal calories).
- `electron/ipc/userHandlers.ts` — DB-write clamps widened (`clampMealCount`
  1–20, `clampSnackCount` 0–20).
- `src/components/ui/Stepper.tsx` (new, exported from `ui/index.ts`) — reusable
  −/＋ numeric stepper with a clamped editable field (never emits NaN or
  out-of-range); replaces the fixed button rows in Onboarding Step4, Settings, and
  Diet prefs.
- `src/pages/Onboarding/steps/Step4Nutrition.tsx`, `src/pages/Settings/index.tsx`,
  `src/pages/Diet/index.tsx` — button rows → Steppers (meals 1–20, snacks 0–20).
- `electron/services/claudeService.ts` — AI setting-parse prompt bounds updated
  (`meal_count 1–20`, `snack_count 0–20`).
- `tests/unit/audit-logic.test.ts` — replaced stale "clamps to >=3" test; added
  coverage for the 1/20/0/20 extremes (exact counts, correct snack count,
  finite/positive calories, gram-clamped portions) and above-max clamp to 20.

**Verification (all PASS):**
- `npx tsc --noEmit` — clean.
- `npm test` — 15 files, 139 tests (+2 new).
- `npx electron-vite build` — built successfully.

**Deferred:** Nothing for this item. High counts repeat meal templates (20 meals
cycle Breakfast…Dinner four times) — acceptable per acceptance criteria; richer
template variety would be a separate enhancement.

---

## Run: 2026-07-03

**STEP 1 — Regression guard:** No regressions. `tsc --noEmit`, `npm test`
(132 tests), and `electron-vite build` all passed on the freshly pulled master
before any new work.

- Setup note: `npm ci` initially failed because Electron's binary postinstall
  download timed out on the network. Re-ran with
  `ELECTRON_SKIP_BINARY_DOWNLOAD=1` — the binary is not needed for
  tsc/tests/build. Deps then installed cleanly.

**Backlog item implemented:** _Consistent color scheme for sleep & energy._

Applied the stress good/medium/bad (green/yellow/red) scale to sleep quality and
energy level everywhere they show. Found two inconsistencies: the Check-in
`RatingBar` colored Energy/Sleep neutral brand-blue for all values (Stress used
green ≤2 / yellow 3 / red ≥4), and the Progress "Wellness Trends" Sleep tile used
`text-blue-400` for its "good" case while Energy/Stress used green.

**Files changed:**
- `src/utils/ratingColor.ts` (new) — shared `ratingTone` / `ratingTextClass` /
  `ratingBgClass` keyed on a `'higher' | 'lower'` direction, so stress
  (lower-better) and sleep/energy (higher-better) map to one green/yellow/red scale.
- `src/pages/CheckIn/index.tsx` — `RatingBar` gained a `higherIsBetter` prop and
  now delegates colors to the shared helper; all three Energy + three Sleep call
  sites pass `higherIsBetter`, Stress keeps `lowerIsBetter`.
- `src/pages/Progress/index.tsx` — the three wellness tiles now use
  `ratingTextClass`, fixing Sleep's blue "good" to green and de-duplicating the
  inline ternaries.
- `tests/unit/ratingColor.test.ts` (new) — 5 tests: both directions, tone→class
  mapping, and equal-goodness parity across directions.
- `docs/change-backlog.md` — checked the item off.

**Verification (all PASS):**
- `npx tsc --noEmit` — clean.
- `npm test` — 15 files, 137 tests passing (+5 new).
- `npx electron-vite build` — built successfully.

**Deferred:** Nothing for this item.

---

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
