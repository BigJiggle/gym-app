# Change Agent Report

## Run: 2026-07-13 (BUG FIX — AI diet regen silently caps meals at 6)

### STEP 0 — Backlog
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (all 13 done, last
2026-07-07). So per the mission this run is a **bug hunt**, not a backlog item.

### STEP 1 — Regression guard (clean pull of master)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (220 tests, 26 files)
- `npx electron-vite build` → PASS

(`npm ci` with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`.)

### STEP 2 — Area audited: (a) nutrition engine + Diet flows
Traced `electron/services/nutritionEngine.ts`, `electron/ipc/planHandlers.ts`,
`electron/ipc/checkinHandlers.ts`, `electron/ipc/mealCompletionHandlers.ts`,
`electron/services/checkinEngine.ts`, and the Diet-flow front-end
(`src/pages/Diet/*`, `GroceryList`, `recipeSteps`, `refeed`). The engines and
check-in handlers are well-guarded. Found one **real, reachable** defect in the
AI-request diet-regeneration path (a SCOPE item: DB↔UI desync + out-of-range
clamp).

### Bug found — AI diet regeneration silently caps main meals at 6 (was 1–20)
- **Files:** `electron/ipc/planHandlers.ts:729` (`NUMERIC_BOUNDS.meal_count`) and
  `electron/ipc/planHandlers.ts:867` (the `buildMealsPublic` call in the
  `plan:applyAIRequest` `regenerateDiet` path).
- **Root cause:** both sites clamped `meal_count` to `[3, 6]`, but onboarding
  (`Step4Nutrition.tsx`, `MEAL_MIN=1 / MEAL_MAX=20`), Settings
  (`Settings/index.tsx:448`, 1–20), and the engine (`generateNutritionPlan`,
  clamps 1–20) all support **1–20 main meals**. Consequences, both reachable with
  a Claude API key configured:
  1. A user who set 8 meals in Settings, then used the AI assistant for *any*
     tweak that triggers `regenerateDiet` (e.g. "make my meals higher protein"),
     had their plan silently rebuilt with only **6** meals — a DB↔UI desync
     against the stored `users.meal_count = 8`.
  2. An explicit "give me 8 meals a day" request was clamped and stored as 6.
  The engine itself builds all 8 (verified: `generateNutritionPlan({meal_count:8})`
  → 8 finite-macro meals; `buildMealsPublic(...,8,...)` → 8), so the clamp was the
  sole limiter.
- **Fix:** extracted a shared `clampMealCount(n)` helper into
  `nutritionEngine.ts` (1–20, rounds, falls back to 4 for non-finite input) and
  used it in both `generateNutritionPlan` (behavior-preserving — it already did
  the same inline) and the `plan:applyAIRequest` regenerate path. Widened
  `NUMERIC_BOUNDS.meal_count` to `[1, 20]` and added `snack_count: [0, 20]` so
  AI-suggested setting changes match the manual ranges. `training_frequency`
  bound unchanged.

### Tests added
- `tests/unit/nutritionEngine.test.ts` — new `clampMealCount` block (4 tests):
  in-range pass-through incl. 8/12/20 (the values the old 3–6 cap wrongly reduced
  to 6), out-of-range clamping (0→1, 25→20), fractional rounding + non-finite
  fallback to 4, and an end-to-end check that the engine + `buildMealsPublic`
  honor 8 main meals. Confirmed the new tests FAIL against the old `[3,6]` clamp
  (3 failures) and PASS after the fix.

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (224 tests, +4 new)
- `npx electron-vite build` → PASS

---

## Run: 2026-07-10 (BUG FIX — imperial height shows 5'12")

### STEP 0 — Backlog
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (all 13 done, last
2026-07-07). So per the mission this run is a **bug hunt**, not a backlog item.
(The prior two runs, 07-08/07-09, stopped at "backlog empty" without hunting.)

### STEP 1 — Regression guard (clean pull of master)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (201 tests, 21 files)
- `npx electron-vite build` → PASS

(`npm ci` with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`.)

### STEP 2 — Area audited: (f) shows/competition + date/week logic + unit conversion
Traced `electron/ipc/showHandlers.ts`, `electron/services/checkinSchedule.ts`,
`electron/services/checkinEngine.ts`, `electron/ipc/checkinHandlers.ts`,
`src/utils/dates.ts`, `src/utils/checkinSchedule.ts`, and `src/utils/units.ts`.
The date/week arithmetic (next-checkin, missed-slot, week_number, trend window,
weeks-out) is well-guarded. Found one **real, reachable** defect in the
unit-conversion path (a SCOPE item: "unit-conversion edges").

### Bug found — `displayHeight` renders `5'12"` instead of `6'0"`
- **File:** `src/utils/units.ts:20` (`displayHeight`, imperial branch).
- **Root cause:** it computed `feet = floor(totalInches/12)` and
  `inches = round(totalInches % 12)` independently. When the fractional inch
  remainder rounds UP to 12, the feet value isn't carried, so the string reads
  `5'12"`. Concretely `displayHeight(181.9, 'imperial')` → `5'12"` (71.6 in
  rounds the remainder 11.6 → 12) when it should be `6'0"`. Reachable from the
  Settings profile display (`src/pages/Settings/index.tsx:537`) for any height
  whose inch remainder rounds to ≥11.5 (~181.6–182.8 cm, and the same pattern at
  every foot boundary).
- **Fix:** round to whole inches FIRST, then split
  (`totalInches = round(cm/2.54)`, `feet = floor(totalInches/12)`,
  `inches = totalInches % 12`). The 12" carry now rolls into feet. Metric branch
  and `displayWeight`/`displayLength` unchanged.

### Tests added
- `tests/unit/units.test.ts` (new, 6 tests) — metric rounding, kg→lb / cm→in
  conversions, exact 5'0", 5'11", and the regression case `181.9 cm → 6'0"`
  (fails before the fix, passes after).

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (207 tests, +6 new)
- `npx electron-vite build` → PASS

---

## Run: 2026-07-09 (no work — backlog empty, app healthy)

### STEP 1 — Regression guard
No regressions. On a clean pull of `master`:
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (201 tests, 21 files)
- `npx electron-vite build` → PASS

(`npm ci` run with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`.)

### STEP 2 — No backlog item implemented
`docs/change-backlog.md` still has **zero unchecked (`- [ ]`) items** — all 13
queued items remain checked off (last landed 2026-07-07). This is the **second
consecutive run** (after 2026-07-08) with an empty queue, so no code changes were
made.

**Action needed from owner:** append new `- [ ]` items to the bottom of
`docs/change-backlog.md` so future runs have work to do.

### Verification (unchanged / all PASS)
tsc / tests (201) / build all green. Working tree clean; nothing to commit beyond
this report entry.

---

## Run: 2026-07-08 (no work — backlog empty, app healthy)

### STEP 1 — Regression guard
No regressions. On a clean pull of `master`:
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (201 tests, 21 files)
- `npx electron-vite build` → PASS

(`npm ci` run with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`.)

### STEP 2 — No backlog item implemented
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** — all 13 queued
items are checked off (the last, AI-tailored onboarding, landed 2026-07-07). With
nothing to implement and the app verified healthy, this run made no code changes.

**Action needed from owner:** append new `- [ ]` items to the bottom of
`docs/change-backlog.md` for future runs to have work.

### Verification (unchanged / all PASS)
tsc / tests (201) / build all green. Working tree clean; nothing to commit beyond
this report entry.

---

## Run: 2026-07-07 (AI-tailored onboarding)

### STEP 1 — Regression guard
No regressions. On a clean pull of `master`:
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (196 tests, 20 files)
- `npx electron-vite build` → PASS

(`npm ci` run with `ELECTRON_SKIP_BINARY_DOWNLOAD=1` — electron's postinstall
binary 403s from the sandbox proxy; not needed to typecheck/test/build.)

### STEP 2 — Backlog item implemented
**AI-tailored onboarding via Claude API key** (topmost unchecked item). Make
entering the Claude API key the FIRST onboarding step, then use it to produce a
more tailored onboarding. Fall back gracefully to deterministic onboarding when
no key is provided.

### Approach
The plan-generation IPC handlers (`electron/ipc/planHandlers.ts`) already read
`claude_api_key` from the DB `settings` table and route to `claudeService` when a
key is present, falling back to the rule-based engines otherwise. So the work was
to capture the key at the start of onboarding and persist it *before* plan
generation fires — the tailoring then happens automatically.

- **New step** `src/pages/Onboarding/steps/StepAiSetup.tsx`: optional Claude API
  key input (password field), "how to get a key" help (opens console.anthropic.com
  via `window.api.openExternal`), and a live status dot showing rule-based vs
  AI-tailored generation. Notes the key can be changed later in Settings.
- `src/pages/Onboarding/useOnboarding.ts`: added `apiKey`/`setApiKey` state;
  `totalSteps` 6 → 7.
- `src/pages/Onboarding/index.tsx`: prepended `StepAiSetup` as step 1; added
  'AI Setup' to `STEP_LABELS`; shifted the Personal-fields validation from step 1
  to step 2 (both `validateStep` and the submit-time call); on submit, persists a
  non-blank trimmed key via `settingsStore.setSetting('claude_api_key', …)` BEFORE
  `generateTrainingPlan`/`generateDietPlan`. Blank key → no write → deterministic
  engines (graceful fallback), matching prior behaviour exactly.

### Acceptance criteria
- User can enter the key first — ✓ (AI Setup is onboarding step 1).
- Onboarding output tailored when a key is present — ✓ (key saved to DB before
  plan generation; existing handlers route to Claude).
- App still works with no key — ✓ (blank key skips the write; rule-based path
  unchanged).

### Files changed
- `src/pages/Onboarding/steps/StepAiSetup.tsx` — new step component.
- `src/pages/Onboarding/useOnboarding.ts` — apiKey state + totalSteps 7.
- `src/pages/Onboarding/index.tsx` — new first step, label, shifted validation,
  key persistence before plan generation.
- `tests/unit/onboardingAiSetup.test.tsx` — 5 new tests.
- `docs/change-backlog.md` — item checked off.
- `change-agent-report.md` — this report.

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (201 tests, +5 new)
- `npx electron-vite build` → PASS

### Deferred
Nothing for this item. The Claude prompts themselves (meal/workout generation)
were already threaded with the full profile in prior runs; onboarding now simply
supplies the key that activates them. This was the last item in the backlog queue.
