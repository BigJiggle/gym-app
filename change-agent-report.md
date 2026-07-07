# Change Agent Report

## Run: 2026-07-07 (adaptive nutrition)

### STEP 1 — Regression guard
No regressions. On a clean pull of `master`:
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (190 tests)
- `npx electron-vite build` → PASS

(`npm ci` run with `ELECTRON_SKIP_BINARY_DOWNLOAD=1` — electron's postinstall
binary 403s from the sandbox proxy; not needed to typecheck/test/build.)

### STEP 2 — Backlog item implemented
**Adaptive nutrition from check-ins + weight** (topmost unchecked item).

Nutrition targets previously adapted off a **single** week-over-week weight delta
(current vs. immediately-previous check-in). Weekly weight is noisy — a water /
glycogen / sodium swing could read as "dropping too fast" or "stalling" and
whipsaw the calorie target on a single weigh-in. Made adaptation key off the
**weight trend across recent check-ins** instead.

### Approach
- New `weightTrendPct` in `electron/services/checkinEngine.ts`: a smoothed
  multi-check-in trend — average % of bodyweight change per interval across the
  last ≤4 prior check-ins (`TREND_WINDOW = 4`).
- `calculateAdjustments` now accepts an optional `recentCheckins` window and
  prefers the trend signal. With fewer than 2 priors it falls back to the existing
  single-week delta, so early check-ins and all prior call sites/tests behave
  identically (backward compatible). Adjustment notes read "Weight trend …" when
  the trend drove the change.
- All three check-in handlers (`checkin:submit`, `checkin:submitMissed`,
  `checkin:update`) fetch and pass the recent window. The existing diet-plan
  recalculation already folds `adjustments.calories_delta` (plus bodyweight-derived
  protein/fat and proportionally scaled meal cards) into the latest `diet_plans`
  row — so a stalled or fast-moving trend now moves the actual calorie/macro targets.

### Files changed
- `electron/services/checkinEngine.ts` — added `weightTrendPct` + `TREND_WINDOW`;
  `calculateAdjustments` takes optional `recentCheckins`, prefers trend, trend-aware notes.
- `electron/ipc/checkinHandlers.ts` — submit / submitMissed / update each query the
  recent check-in window and pass it through.
- `tests/unit/checkinEngine.test.ts` — 6 new trend tests.
- `docs/change-backlog.md` — item checked off.
- `change-agent-report.md` — this report.

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (196 tests, +6 new)
- `npx electron-vite build` → PASS

### Deferred
Nothing for this item. Remaining backlog: "AI-tailored onboarding via Claude API key".
