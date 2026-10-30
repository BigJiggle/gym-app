# Change Agent Report

## Run: 2026-10-30 #2 (BUG FIX — area (a) nutrition engine + Diet flows; a non-finite `height_cm` or `age` propagates **NaN into the stored, displayed `calories_target` AND `carbs_g`** of every generated diet plan, so the Diet page shows "NaN kcal" / "NaN g" headline targets while the per-meal macro cards look sane — a DB↔UI desync. Root cause: `calcBMR` did a raw `10*weight + 6.25*height - 5*age`; a non-finite height/age makes it NaN → `tdee = Math.round(NaN) = NaN` → `calories = Math.max(1200, NaN + adjustment)` is **NaN** (`Math.max(1200, NaN) === NaN`) → `carbs_g = Math.round((NaN - …)/4)` is NaN. `buildMeals` floors its OWN `totalCal` to `MIN_CALORIE_TARGET`, so the per-meal numbers self-heal — which is exactly what hides the bug — but the top-level plan fields persist as NaN and divide into the Diet page's intake percentages. `weight_kg` is already defended by `clampWeightKg` at its callers; `height_cm` and `age` had no counterpart. Reachable via the same corrupt / hand-edited numeric-cell vector prior runs (10-29#3, the diet/training read-seam fixes) accepted as in-scope — SQLite is dynamically typed, so a required numeric column can read back as a string or NaN — and it also makes `plan:previewGoalCalories` return NaN for every goal in the GoalPickerModal.)

### STEP 0 — Requested changes
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (all 14 queue items checked off) → proceeded to a bug hunt.

### STEP 1 — Baseline / regression guard (all GREEN before changes)
Clean `master` + `npm ci` (`ELECTRON_SKIP_BINARY_DOWNLOAD=1`):
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (476 tests, 77 files)
- `npx electron-vite build` → PASS

### STEP 2 — Area audited: (a) nutrition engine + Diet flows
Rotated to **(a)** (least-recent; recent runs: (f) 10-30, (d) 10-29#3, (c) 10-29#2, (b) 10-29, (b) 10-28, (e) 10-27#2, then (a) 10-27). Deep-read the full SCOPE error paths:
- **`electron/services/nutritionEngine.ts`** — `getPhaseAwareDeficit` (phase buckets), `calcPortionStr` (falsy-`calPer100g` bail, role clamps), `applyCookingStyle`/`applyPrepStyle` (snack/breakfast/grab-and-go guards), `getFood`/`getCultureFood`/`isExcluded` (substitute iteration, snack-only skip), `buildMeals` (0/non-finite `totalCal` floor, snack-cap math, `mainCount` arithmetic), `getMealTemplates` (1–20 main cycling, 0–20 snack cycling, time sort), `clampWeightKg`/`clampMealCount`/`sanitizeCalorieTarget`/`sanitizeMacroGrams`/`normalizeMeals` (all finite/floor-guarded), and **`calcBMR` ← bug here (the one unguarded numeric seam).**
- **`electron/ipc/planHandlers.ts`** — `generateDiet` (AI + rule paths, `normalizeMeals`/`sanitizeCalorieTarget`/`sanitizeMacroGrams` on the untrusted model blob), `getDiet`, `recalculateMacros` (floors divisor, writes target back, self-heals a 0 row), `refineDietWithPrompt`/`refine_diet` (normalize + meal_count persist + orphan purge), `applyAIRequest` regen (`buildMealsPublic` + summed totals + meal_count persist), `swapMeal` (index bounds), `reorderMeals` (permutation remap of completions), `previewGoalCalories` (**also affected — raw weight/height/age → NaN preview**).
- **`src/pages/Diet/index.tsx`** — intake %/refeed math (all `>0`-guarded), `activeMealIndex` time parse, `mealAdherenceStreak`, water/cardio localStorage (`nextWaterMl`/`nextCardioLog`/`cardioMinutesOn` — non-array/NaN guarded), weekly aggregates (`activeDays>0` / `totalMealsPerDay===0` guards), prefs panel.
- **`src/pages/Diet/GroceryList.tsx`** (empty-meals guard, qty aggregation), **`swapAlternatives.ts`** (restriction + exclusion filtering, hard-constant portion math), **`src/utils/refeed.ts`** (`idx.length≥1`, no-mutation), **`mealCompletionHandlers.ts`** (orphan purge). All guarded.
- **Fuzz:** 49,920 `generateNutritionPlan` combinations (every sex × goal × diet pref × weeks-out × meal-count {0,1,2,3,…,20,25,NaN,-1} × snack-count {…,20,25,NaN,-1} × weight {0,29,30,70,150,300,301,850,NaN,-5}) → **0** non-finite / negative / "NaN"-in-food outputs. The only non-finite escape was with a non-finite **height/age** (which the fuzz held fixed) — this bug.

### STEP 3 — Fix (minimum, root-cause at the shared seam)
- **`electron/services/nutritionEngine.ts` — `calcBMR`**: coerce each input to a finite fallback before the formula (`weight→70`, `height→170`, `age→30` when not `Number.isFinite`). Both call sites (`generateNutritionPlan`, `plan:previewGoalCalories`) funnel through `calcBMR`, so one guard fixes the stored-NaN plan AND the goal-calorie preview. Finite inputs — including out-of-range ones — are untouched, so no valid plan changes (confirmed: the fuzz's 49,920 finite-input plans are byte-identical, and the exact-value `calcBMR` assertions pin the unchanged formula).

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (480 tests, +4 new in `tests/unit/nutritionEngine.test.ts`)
- `npx electron-vite build` → PASS
- Empirically confirmed the repro: with the fix reverted, the 4 new tests FAIL (`calories_target` / `carbs_g` are NaN for NaN/`"tall"` height and NaN/`"old"` age); with the fix they pass.

### Files changed
- `electron/services/nutritionEngine.ts` — `calcBMR` guards non-finite weight/height/age.
- `tests/unit/nutritionEngine.test.ts` — 4 new tests: NaN height, NaN age, corrupt string height/age, and a `calcBMR` unit test asserting valid inputs are byte-identical while non-finite inputs stay finite.
- `change-agent-report.md` — this entry.

### Deferred (not done — out of minimum scope this run)
`buildPrepTimeline`'s far-out-show current-week flag gap (`startWeek = Math.min(currentWeek+2, 24)` drops the true current week for shows 25+ weeks out), carried over from the 10-30 run's Deferred note — it's area (f) and lower severity, left for a dedicated run.

## Run: 2026-10-30 (BUG FIX — area (f) shows/competition + date/week logic; the Settings "My Shows" list flags a show happening **TODAY** as **"Past"** after local noon, hiding its "Cancel Show" button and showing a contradictory "Past" badge next to "Primary" on the athlete's actual show day. Each show row recomputed `isPast` by hand as `countdown.totalDays === 0 && new Date(show.show_date + 'T12:00:00') < new Date()` — but on show day `totalDays` is 0 and the show's **noon** anchor (12:00) is earlier than any afternoon wall-clock, so `noon < now` flips true from 12:01pm onward → `isPast` true. `getShowCountdown` already exposes a correct `isPast` (`rawDays < 0`, true only once the date is strictly before today) precisely to distinguish "today" from "past"; this row reimplemented it wrongly instead of using it. `isPast` gates three things — the "Past" badge, the "weeks/days out" line, and the **Cancel Show** button — so the whole row's state was wrong for the back half of show day.)

### STEP 0 — Requested changes
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** → proceeded to a bug hunt.

### STEP 1 — Baseline / regression guard (all GREEN before changes)
Clean `master` + `npm ci` (`ELECTRON_SKIP_BINARY_DOWNLOAD=1`):
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (474 tests, 76 files)
- `npx electron-vite build` → PASS

### STEP 2 — Area audited: (f) shows/competition + date/week logic
Rotated to **(f)** (least-recent; recent runs: (d) 10-29#3, (c) 10-29#2, (b) 10-29, (b) 10-28, (e) 10-27#2, (a) 10-27, then (f) 10-26). Traced the full SCOPE date/week error paths:
- **`src/utils/dates.ts`** — `localDateStr`/`parseLocalDate`/`addDays`/`weekStartMonday(Str)` (all calendar-day, DST-safe), and `getShowCountdown` (noon-vs-midnight 12h cushion + Math.floor → DST-robust; `isPast = rawDays < 0` separate from clamped `totalDays`). Sound.
- **`electron/services/showDates.ts`** — `weeksUntilShow` (local-midnight, matches UI), `localToday` (local YYYY-MM-DD, not SQLite UTC). Sound.
- **`electron/ipc/showHandlers.ts`** — `syncPrimaryToNearest` / `persistProfileShowDate` (regex-guarded) / `shows:add|update|delete|cancelShow` / `setPrimaryShow` (diet regen on every show-context change; past-show guard). Sound.
- **`src/data/competitionPrep.ts`** — `getWeekGuidance` (0..∞ buckets), `buildPrepTimeline`, `PEAK_WEEK_PROTOCOL`. See Deferred for a far-out-show observation.
- **Widgets** — `PeakWeekWidget` (daysOut = totalDays+1, fixed 10-26; verified correct), `PrepPaceWidget`, `PrepGuidanceWidget`, `WeeklyScorecardWidget`, `PosingWidget`/`SleepWidget`/`SupplementWidget`/`competitionLogs` (all localStorage-guarded, Sunday→7 day mapping consistent). Sound.
- **`src/utils/weeklyRate.ts` / `weeksTracked.ts` / `targetWeight.ts`** — finite guards, min-span floor, parse-seam NaN guard. Sound.
- **`src/pages/Settings/index.tsx`** (My Shows list) — **← bug here.** The add form validates `type="date"` + required, so a malformed date can't reach `shows:add`; the row-render `isPast` was the one date comparison that diverged from the canonical helper.

### STEP 3 — Fix (minimum, one line + comment)
- **`src/pages/Settings/index.tsx`** — replaced the hand-rolled `const isPast = countdown.totalDays === 0 && new Date(show.show_date + 'T12:00:00') < new Date()` with `const isPast = countdown.isPast`. `getShowCountdown` already returns the correct show-day-safe value; routing through it fixes the "Past" badge, the countdown line, and the Cancel Show button all at once, and removes the duplicated/divergent date logic.

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (476 tests, +2 new `tests/unit/settingsShowDayNotPast.test.tsx`)
- `npx electron-vite build` → PASS

Empirically confirmed the repro: with the clock faked to show-day 15:30 and the fix reverted, the new "today is not Past" test FAILS (row shows a "Past" badge, Cancel Show hidden) and the yesterday-control still passes; with the fix it passes.

### Files changed
- `src/pages/Settings/index.tsx` — `isPast` now uses `getShowCountdown().isPast`.
- `tests/unit/settingsShowDayNotPast.test.tsx` — 2 new jsdom tests rendering the real Settings "My Shows" list with `vi.setSystemTime` at show-day afternoon: a today show carries no "Past" badge and keeps "Cancel Show"; a yesterday show still shows "Past".
- `change-agent-report.md` — this entry.

### Deferred (not done — out of minimum scope this run)
`buildPrepTimeline` caps the displayed window with `startWeek = Math.min(currentWeek + 2, 24)`. When `currentWeek > 24` (a show 25+ weeks / ~6 months out) the loop (`w = startWeek..0`) never includes the true `currentWeek`, so **no** row is flagged `isCurrentWeek` — which makes `PrepGuidanceWidget` ("This Week in Prep") self-hide and the Education timeline lose its current-week highlight/auto-expand for very-far-out shows. It's a real but lower-severity edge (all weeks >16 share identical "Hypertrophy / Off-Season" guidance anyway), and the correct fix (keep the current week flagged while still capping the list) trades off against the documented "cap the list length" intent — left for a dedicated run rather than bundled with this one-line fix.

## Run: 2026-10-29 #3 (BUG FIX — area (d) onboarding + Settings + reset + data lifecycle; one corrupt / hand-edited / legacy non-JSON **user** TEXT cell **bricks the entire app on launch**. `parseUser` in `electron/ipc/userHandlers.ts` runs on every `user:get` — the FIRST IPC call `loadUser` makes at startup — and did a raw `JSON.parse` on four array columns (`competition_history`, `dietary_restrictions`, `food_preferences`, `food_exclusions`) guarded only by `?? '[]'`. That covers NULL but not a corrupt cell (e.g. a bare `Dairy-free` instead of `["Dairy-free"]`), which makes `JSON.parse` THROW → `user:get` rejects → `loadUser` swallows it into `error`, leaving `user=null` so the app never loads and can't escape (`user:get` re-reads the same latest row and throws again). This is the exact per-cell hole `normalizeMeals` (diet) and `normalizeExercises` (training) already close at their read seams — the user read path had no counterpart.)

### STEP 0 — Requested changes
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** → proceeded to a bug hunt.

### STEP 1 — Baseline / regression guard (all GREEN before changes)
Clean `master` + `npm ci` (`ELECTRON_SKIP_BINARY_DOWNLOAD=1`):
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (467 tests, 75 files)
- `npx electron-vite build` → PASS

### STEP 2 — Area audited: (d) onboarding + Settings + reset + data lifecycle
Rotated to **(d)** (least-recent per prior run; recent runs: (c) 10-29#2, (b) 10-29, (b) 10-28, (e) 10-27#2, (a) 10-27, (c) 10-26#2). Deep-read the full SCOPE error paths:
- **`electron/ipc/userHandlers.ts`** — `user:create` / `user:update` / `user:get` / `user:resetAll`, and the shared `parseUser` read helper. **← bug here.**
- **`electron/ipc/userSanitize.ts`** — write-seam clamps (`clampMealCount`/`clampSnackCount` 1–20/0–20, `clampBodyFatPct` 3–60, `clampAge`/`clampHeightCm`/`clampWeightKgField`/`clampTrainingFrequency`/`clampExercisesPerSession`/`clampSetsPerExercise`, non-finite→undefined drop so a cleared field can't NULL a required column; `show_date`/`division` dropped to avoid ghost-writes). All sound.
- **`electron/ipc/settingsHandlers.ts`** — `settings:get`/`set`/`getAll` (null-coalesced, INSERT OR REPLACE). Sound.
- **`electron/database/db.ts` + `schema.ts`** — `initDb` lock-clear/retry + dev-wipe fallback, `runMigrations` (per-migration try/catch so a failed migration never wipes data; `INSERT OR IGNORE` schema_version seed), all 13 migrations incl. the v9 table rebuild (column list verified) and v11 meal/snack backfill. Sound.
- **`src/pages/Onboarding/*`** — `useOnboarding` defaults + `validateStep` (age 16–80, height 100–250, weight 30–300), `Step1Personal` unit toggles (ft/in round-then-split, lbs→kg, `>0` guards), submit flow (key persisted before plan gen, show added as primary). Sound.
- **`src/pages/Settings/index.tsx`** — Edit-profile re-sync on open, imperial↔metric height/weight conversions, `handleSaveProfile` (`body_fat_pct '' → undefined`), reset double-confirm, Stepper clamps, show add/cancel/delete. Sound.
- **`src/store/userStore.ts` / `settingsStore.ts`** — `resetAllData` (DB reset → `resetLocalData` fold → hard reload so singletons re-init), `loadSettings`/`setSetting` (DEFAULTS merge, theme/zoom apply). Sound.
- **`src/utils/resetData.ts` + `DailyWeighInWidget.tsx`** — `resetLocalData` preserved-key filter + `mergeWeighIns` (try/catch JSON, `isValidWeighIn` drops bad entries, same-date daily-wins), daily log stored in **kg** so the check-in fold is unit-consistent; `parseDailyWeightLog` per-entry sanitize + 30–300 kg write clamp. All sound.

### STEP 3 — Fix (minimum, single read seam)
- **New exported `safeJsonArray(raw)` in `electron/ipc/userHandlers.ts`** (mirrors `normalizeMeals`/`normalizeExercises`): an already-parsed array passes through; a non-string → `[]`; a string is `JSON.parse`d inside try/catch and returned only if it parses to an array, else `[]`. Well-formed data is byte-identical.
- **`parseUser` now exported and routes all four array columns through `safeJsonArray`** instead of raw `JSON.parse(... ?? '[]')`. A corrupt/legacy cell degrades to an empty list instead of throwing and bricking `user:get`. No behaviour change for any well-formed row.

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (474 tests, +7 new `tests/unit/parseUser.test.ts`)
- `npx electron-vite build` → PASS

### Files changed
- `electron/ipc/userHandlers.ts` — new exported `safeJsonArray`; `parseUser` exported + hardened.
- `tests/unit/parseUser.test.ts` — 7 new tests (safeJsonArray well-formed/array-passthrough/corrupt-string→[]/null/object→[]; parseUser no-throw on corrupt cell, correct parse of well-formed cells, boolean/number coercion + defaults). Empirically confirmed the pre-fix raw `JSON.parse('Dairy-free')` throws `SyntaxError`.
- `change-agent-report.md` — this entry.

### Deferred (not done — out of minimum scope this run)
`parseUser` also reads scalar columns with `as`-casts (`snack_count`/`exercises_per_session`/`sets_per_exercise` default via `??`, `culture_pref` via `??`); those don't throw on a corrupt cell (a bad value just flows through to already-existing downstream clamps), so no guard was added there. The DB write seams already stringify every array column, so the corrupt-cell vector is hand-edit/legacy-only — the same class the diet/training read-seam guards target.

---

## Run: 2026-10-29 #2 (NO BUG FOUND — area (c) check-in + Progress + adaptive nutrition; audited deeply and found it clean. Rotated off (b) which the two prior runs covered. Baseline green before and after; no code change — report-only commit.)

### STEP 0 — Requested changes
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** → proceeded to a bug hunt.

### STEP 1 — Baseline / regression guard (all GREEN)
Clean `master` + `npm ci` (`ELECTRON_SKIP_BINARY_DOWNLOAD=1`):
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (467 tests, 75 files)
- `npx electron-vite build` → PASS

### STEP 2 — Area audited: (c) check-in + Progress + adaptive nutrition
Rotated to **(c)** (recent runs: (b) 10-29, (b) 10-28, (e) 10-27#2, (a) 10-27, (c) 10-26#2, (f) 10-26). Read and traced the full SCOPE error paths across the area:

- **`electron/services/checkinEngine.ts`** — `parseAdjustments` (guarantees `{calories_delta, cardio_change, training_volume_change, notes[]}` shape against `'{}'`/non-JSON/legacy cells), `clampCheckinWeightKg` (30–300 kg, rejects non-finite/≤0), `weeksBetweenDates` (null on missing/unparseable/non-positive span, parsed at local noon), `weightTrend` (single-week fallback; guards 0/non-finite bodyweight → 0), `weightTrendPct` (Theil–Sen median of pairwise per-week slopes; filters non-finite weights, skips non-positive x-gaps so a same-day duplicate can't divide by zero, falls back to interval-index x when dates unparseable, needs ≥2 priors), and `calculateAdjustments` cut/recomp thresholds + recovery/stress/adherence notes.
- **`electron/ipc/checkinHandlers.ts`** — all five handlers: `checkin:submit` (write-seam weight clamp, duplicate-same-day reject, interval lock by date, diet-plan recalc with `MIN_CALORIE_TARGET`-floored ratio so a 0-target plan can't make meal scaling NaN/Infinity, `clampWeightKg` on macro weight), `checkin:submitMissed` (same clamp, dup reject, chronological `week_number` back-fill + shift), `checkin:update` (date-clash guard, null/empty `check_in_date` dropped so NOT-NULL isn't violated, previous/trend scoped by effective DATE not insertion id, `(date,id)` renumber on date change), `checkin:history`/`checkin:latest` (parse adjustments at read seam).
- **`electron/services/checkinSchedule.ts`** ⇄ **`src/utils/checkinSchedule.ts`** — verified the shared logic is byte-identical (only trailing comments differ; `getNextCheckinDate` is main-process-only by design). `countMissedBetween` guards interval ≤0/non-finite (no infinite `addMissedFrom` loop), day-mode re-alignment is capped by a 7-iteration guard (immune to a NaN `checkinDay`), `effectiveInterval` uses 7/14 for day/biweekly so biweekly users get no phantom mid-gap slot.
- **`src/pages/Progress/index.tsx`** — empty state (0 check-ins), `computeEstimatedBF` (weight clamped → denom >0, BF clamped 3–60), first→latest/`elapsedWeeks` ordering (progress:entries ASC vs checkinHistory DESC — consistent), measurement weekly-rate floored at ≥1 week, 8-week diet-consistency `target>0` guard, required-rate direction coloring, Show-Day projection.
- **`src/pages/CheckIn/index.tsx`** — `toKg`/`toCm` (reject NaN/≤0), missed-slot panels, edit flow (`DUPLICATE_CHECKIN` handling), success-screen projection (`weeksToShow ≤ 0 → null`), locked-screen countdown.
- **`src/utils/`** `weeklyRate.ts` (≥1-week span or null), `weeksTracked.ts` (calendar span, not row count), `targetWeight.ts` (NaN/≤0 → null), `dates.ts` (DST-safe calendar arithmetic, `getShowCountdown` clamps `totalDays≥0` + separate `isPast`).
- **Charts/widgets** `WeightChart.tsx`, `MeasurementsChart.tsx` (≥2-point filter, empty guard), `CheckinFeedbackWidget.tsx`, `RecentCheckinsWidget.tsx` (`c.adjustments?.calories_delta ?? 0`).
- **Spot-checked adjacent areas** for a reachable defect to fix instead: nutritionEngine `calcPortionStr` (bails when `calPer100g` falsy) / `normalizeMeals` (guarantees string `name`), `refeed.ts` (`idx.length ≥1`, receives normalized meals), `TrainingVolumeWidget`/`Diet` average divisions (all length-guarded), `competitionPrep.ts` + `PeakWeekWidget.tsx` (past-show guard, `daysOut` match-or-null). All guarded.

### Conclusion — no real bug found
Every SCOPE error class in this area (empty/first-run states, 0/negative/NaN/Infinity/huge inputs, div-by-zero, DST/timezone + week-rollover, duplicate same-day entries, corrupt/hand-edited cells, DB↔UI desync) is already defended — in most cases by an explicitly-commented prior-run fix — and a dedicated test suite covers it (`checkinEngine`, `checkinAdjustmentsParse`, `checkinSchedule`, `checkinWeightClamp`, `checkinUpdate*`, `checkinSuccessProjection`). The one design choice I considered — `checkin:update` recomputing/storing `adjustments` without re-applying them to the live diet plan (whereas `checkin:submit` does) — is a deliberate "don't double-adjust on an edit" decision, not a crash, and re-applying would risk double-counting the already-applied delta; left untouched per the "don't fix correct code" rule. Per the routine's rules I did **not** fabricate a fix. Coverage recorded so the next run rotates to a different area ((d) onboarding/Settings/reset/data-lifecycle is now least-recent).

### STEP 4 — Verification (unchanged tree; re-confirmed GREEN)
- `npx tsc --noEmit` → PASS · `npm test` → PASS (467) · `npx electron-vite build` → PASS

---

## Run: 2026-10-29 (BUG FIX — area (b) training engine + workout/session flows; a `null` / non-object entry in a session's stored `exercises` array **white-screens the entire Training tab** (and throws in the `plan:getTraining` IPC handler for a non-JSON cell). Every training-plan load funnels through `plan:getTraining`, which `JSON.parse`d the `training_sessions.exercises` TEXT cell and handed it verbatim to the renderer. The Training tab does `session.exercises.map(ex => ex.name)` and `WorkoutSession.buildInitialStates` does `for (const ex of session.exercises) clampSetCount(ex.sets)` — both with **no error boundary** — so a `[null]` entry throws "Cannot read properties of null (reading 'name')" the moment the tab mounts. Reachable from a hand-edited/corrupt cell **and** from the AI refine paths (`plan:refineWorkoutWithPrompt` / `applyAIRequest` `refine_workout`), which validate only the array **length** (`exercises.length > 0`), never each entry. This is the exact per-entry gap `normalizeMeals` already closes on the diet side — the training read path had no counterpart. Last run (`parseRepMidpoint`) hardened a single FIELD against a non-string; this hardens the ENTRY shape at the read seam.)

### STEP 0 — Requested changes
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** → proceeded to a bug hunt.

### STEP 1 — Regression guard (all GREEN before changes)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (461 tests, 74 files)
- `npx electron-vite build` → PASS
(`npm ci` run with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`.)

### STEP 2 — Bug hunt (rotated within/adjacent to prior area, new sub-path)
Traced the AI/stored-exercise shape lead opened by the 2026-10-28 `parseRepMidpoint` run. That fix observed the AI training paths persist exercises **verbatim** (no `normalizeMeals` equivalent) and defended one FIELD (`reps`). Auditing the other consumers of that unvalidated shape surfaced the un-defended case: a malformed **entry** (not just a malformed field). The diet side filters null/non-object meal entries in `normalizeMeals` (`nutritionEngine.ts:888`, `.filter(m => !!m && typeof m === 'object')`); the training read path (`plan:getTraining`) did a raw `JSON.parse` with no per-entry filter. Confirmed the crash empirically: `JSON.parse('[null, {...}]').map(ex => ex.name)` → `TypeError: Cannot read properties of null (reading 'name')`.

### STEP 3 — Fix (minimum, single read seam)
- **New `normalizeExercises(raw)` in `electron/services/trainingEngine.ts`** (mirrors `normalizeMeals`): accepts a parsed array OR the raw JSON string; a non-array / unparseable input → `[]`; drops `null`/non-object entries; guarantees a string `name` (fallback `'Exercise'`); passes every other field through untouched (so valid plans are byte-identical, and the consumer's existing `clampSetCount`/`parseRepMidpoint` still coerce `sets`/`reps`).
- **Applied at the read seam** `electron/ipc/planHandlers.ts`: `plan:getTraining` (line ~142) and `plan:getSessions` (line ~157) now call `normalizeExercises(s.exercises)` instead of `JSON.parse(s.exercises as string)`. This is the universal render path — the Training page mounts via `loadTrainingPlan` → `getTrainingPlan`, and the AI refine flow re-reads through the same handler (`handleRefineWorkout` → `loadTrainingPlan`) — so both the corrupt-cell and AI-persisted vectors are covered by one guard. No UI change; a no-op for every well-formed plan.

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (467 tests, +6 new `tests/unit/normalizeExercises.test.ts`)
- `npx electron-vite build` → PASS

### Files changed
- `electron/services/trainingEngine.ts` — new exported `normalizeExercises`.
- `electron/ipc/planHandlers.ts` — import + apply at `plan:getTraining` / `plan:getSessions`.
- `tests/unit/normalizeExercises.test.ts` — 6 new tests (non-array/unparseable → [], drops null/non-object entries incl. the `[null]` crash case, string-name fallback, valid plan unchanged).
- `change-agent-report.md` — this entry.

### Deferred (not done — out of minimum scope this run)
The AI **generate** direct-return (`plan:generateTraining` Claude branch) and the refine handlers return sessions straight to the store before the next `getTraining` reload; a literal `null` exercise from the model during full generation is a narrower, more exotic vector than the corrupt-cell/refine read path fixed here. The read-seam guard covers every path the renderer loads through today; a write-seam normalize on the persist paths would close the theoretical generate-return window and is a candidate lead for a future run.

---

## Run: 2026-10-28 (BUG FIX — area (b) training engine + workout/session flows; `parseRepMidpoint` (`src/utils/parseRepMidpoint.ts`) crashed with "repRange.split is not a function" on any non-string `reps`. `reps` is DECLARED a string on the `Exercise` type, but the AI training-plan paths persist the model's returned exercises **verbatim** — unlike the diet path, which runs `normalizeMeals` first — so a model emitting `"reps": 10` (a number, despite the prompt asking for the "8-12" string form) or omitting `reps` round-trips a non-string value into this seam. It is the single function every set-seed funnels through, so the crash fired the moment `WorkoutSession` mounted and white-screened the live workout.)

### STEP 0 — Requested changes
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** → proceeded to a bug hunt.

### STEP 1 — Baseline / regression guard (GREEN before changes)
Clean `master` + `npm ci` (`ELECTRON_SKIP_BINARY_DOWNLOAD=1`):
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (459 tests) → PASS (461 tests, +2) after the fix
- `npx electron-vite build` → PASS

### STEP 2 — Area audited: (b) training engine + workout/session flows
Rotated to **(b)** (least-recent; recent runs were (e) 10-27#2, (a) 10-27, (c) 10-26#2, (f) 10-26, (d) 10-25#2, (b) 10-25). Deep-read: `electron/services/trainingEngine.ts` (all split builders, `getExercises`/`getExercisesByMuscleGroup` compound/isolation distribution, `getSets`/`getRIR`/`getRepRange`, the freq/exPerSession/sets-per-ex/max-sets non-finite+non-positive guards, `determinePhase`/`weeksTotal`), `electron/ipc/workoutHandlers.ts` (all 11 handlers; `sanitizeReps`/`sanitizeWeightKg` symmetric clamps on every write seam), the training paths in `electron/ipc/planHandlers.ts` (rule-based + **Claude** generate, `refineWorkoutWithPrompt`, `applyAIRequest` refine_workout, `plan:updateSession` empty-session guard, `plan:getTraining`/`getSessions`), `electron/services/showDates.ts` (`weeksUntilShow` non-negative), and the full UI flow: `WorkoutSession.tsx`, `WorkoutLogEditor.tsx`, `SessionEditor.tsx`, `WorkoutStats.tsx`, `Training/index.tsx` (streak/trend/countdown/calorie-burn/sessions-week widgets), `TodaysSessionWidget.tsx`, `SessionsWeekWidget.tsx`, and utils `detectNewPRs`/`clampSetCount`/`parseRepMidpoint`/`prevSessionLog`.

Ruled out (not bugs — hardened by prior runs): the engine's numeric seams (freq 2–6, exPerSession/sets-per-ex/max-sets all guarded, empty-session guards via `rotateOne`/`.filter(Boolean)`), the write-seam reps/weight clamps (lower + upper tail), `clampSetCount` (MAX 20, NaN/negative→1), week/DST date math (`setDate`-based, consistent en-CA strings), `plan:updateSession`'s empty-session rejection, and every division in `WorkoutStats`/`Training` (floored or empty-guarded).

### The bug (file:line)
`src/utils/parseRepMidpoint.ts` — the old body typed `repRange: string` and called `repRange.split('-')` directly. The sibling `clampSetCount(ex.sets)` seam already coerces `sets` via `Number(value)` (robust to anything), but the `reps` seam assumed a well-formed string. Callers: `WorkoutSession.tsx:210` (`buildInitialStates` → `parseRepMidpoint(ex.reps)`, runs at mount) and `:352` (`addSet`).

### Root cause
Unlike the diet write paths (hardened to run model output through `normalizeMeals`), the three Claude training-plan write seams persist the model's exercises raw:
- `plan:generateTraining` Claude branch (`planHandlers.ts:82`) — `JSON.stringify(s.exercises ?? [])`.
- `plan:refineWorkoutWithPrompt` (`planHandlers.ts:671`) — `JSON.stringify(s.exercises)`.
- `plan:applyAIRequest` refine_workout branch — same.
The prompt documents `"reps":"<e.g. 8-12>"`, but a model can return `reps` as a number or omit it; that value round-trips through `plan:getTraining` into `parseRepMidpoint`, which threw. A hand-edited DB reaches the same seam. (Confirmed at runtime: `(10).split` / `null.split` / `undefined.split` all throw.)

### Fix (minimum, one seam — guards the boundary, mirrors the clampSetCount precedent)
- **`src/utils/parseRepMidpoint.ts`** — signature now `repRange: unknown`. A finite `number` is already a usable rep count → `Math.round(repRange)` (non-finite number → 10). Any other non-string → 10. The existing string path (ranges, partial-dash, non-numeric → 10) is byte-for-byte unchanged, so every well-formed input behaves exactly as before. This is the single seam all set-seeding funnels through, so no upstream path (AI generate/refine, hand-edited DB, future callers) can crash `WorkoutSession` anymore. No schema/engine/persist-path change.

### Tests added
- `tests/unit/parseRepMidpoint.test.ts` (+2) — (1) a numeric `reps` (`10`, `8.4`) is coerced without throwing (`10`→10, `8.4`→8 rounded); (2) `null`/`undefined`/`NaN`/`Infinity`/`{}`/`[]`/`true` never throw and all fall back to 10. Both assert `.not.toThrow()`; verified failing-first against the old string-only body (`.split is not a function`). All 6 prior parseRepMidpoint tests unchanged and still pass.

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (461 tests, +2)
- `npx electron-vite build` → PASS

### Note
A broader hardening (a `normalizeExercises` pass on the three Claude training write seams, mirroring the diet path's `normalizeMeals`) would defend the `rir`/`sets`/`name` fields at the persist boundary too. Those fields don't currently crash (`clampSetCount` coerces `sets`; `rir`/`name` are only rendered/bound, never string-method-called), so it is out of this run's minimum-change scope — recorded here for a future (b) run. The `reps` crash was the one reachable defect this run.

---

## Run: 2026-10-27 #2 (BUG FIX — area (e) widgets + localStorage stores; the Diet page's cardio stepper (`src/pages/Diet/index.tsx`) read/wrote the shared `cardio_log` localStorage key with a single-session-per-day model, while the dashboard Cardio widget (`cardioStore`/`CardioWidget`) logs MULTIPLE sessions per day and sums them. A prior run (2026-10-26 #2 note / report line ~1459) explicitly flagged this exact mismatch and deferred it as "a refactor, out of minimum-change scope" — but the analogous water-tracker bug was later fixed minimally by extracting a pure `nextWaterMl` helper, establishing the precedent followed here.)

### STEP 0 — Requested changes
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** → proceeded to a bug hunt.

### STEP 1 — Baseline / regression guard (GREEN before changes)
Clean `master` + `npm ci` (`ELECTRON_SKIP_BINARY_DOWNLOAD=1`):
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (446 tests) → PASS (459 tests, +13) after the fix
- `npx electron-vite build` → PASS

### STEP 2 — Area audited: (e) widgets + localStorage stores
Rotated to **(e)** (least-recent; recent runs were (a) 10-27, (c) 10-26#2, (f) 10-26, (d) 10-25#2, (b) 10-25, (e) 10-24#2). Deep-read every dashboard/tab widget and store: `localStore.ts`, `createWidgetStore.ts`, `useWidgets.ts`, `tabWidgets.ts`, `competitionLogs.ts`, `useWaterLog.ts`, `cardioStore.ts`, `WidgetZone.tsx` / `TabWidgetZone.tsx` (drag-reorder incl. hidden/competition-only widgets), and the content widgets (Water, Sleep, Posing, Supplement, Condition, Cardio, SessionsWeek, WeeklyVolume, MuscleCoverage, WeeklyScorecard, TrainingVolume, QuickStats, NextMeal, TodaysMacros, DailyWeighIn, PrepGuidance) plus the Training/Nutrition tab-widget content in `pages/Training/index.tsx` and `pages/Diet/index.tsx`.

Ruled out (not bugs — hardened by prior runs):
- **`localStore` / `createWidgetStore` / `useWidgets`** reject wrong-shape JSON, drop unknown ids, de-dupe, and run optional per-entry sanitizers; the `competitionLogs` stores sanitize every object-array entry; `parseDailyWeightLog` bounds-checks weigh-ins.
- **Drag-reorder** in both zones keeps each widget's REAL stored index while filtering hidden/competition-only/unknown widgets, so `store.reorder(from,to)` stays correct with interspersed hidden widgets; long-press timers are cleared on unmount.
- **Weekly date math** (`weekStartMondayStr`, Mon–Sun windows, last-week window in Training) uses `setDate` (DST-safe) and guards divisions.

### The bug (file:line)
`src/pages/Diet/index.tsx` — three reads of `cardio_log` used `log.find(e => e.date === day)?.minutes`, i.e. only the FIRST session of a day:
- `cardioMin` initializer (~line 87) — today's total.
- `weeklyCardio` (~line 663) — per-day sum feeding "X min this week".
- `updateCardio` (~line 118) — on a +/- tap, rebuilt the day from that first-entry baseline and `log.filter(date !== today)` + one new entry, collapsing all same-day sessions.

### Root cause
The Diet stepper predates the dashboard's multi-session-per-day cardio model and never summed. So a day with e.g. [LISS 30, HIIT 20] displayed 30 (undercount), and a "+5" tap wrote a single 35-minute entry — **permanently losing 15 real logged minutes** and the second session. The week total undercounted identically.

### Fix (minimum, one seam — mirrors the water precedent)
- **New `src/utils/cardio.ts`** — two pure helpers: `cardioMinutesOn(log, date)` sums every session on a day (safe against non-array/corrupt logs and non-finite/≤0 minutes); `nextCardioLog(log, date, delta, maxMin=120)` applies the delta to the day's TRUE total (clamped 0–120), preserving every OTHER day verbatim and collapsing the target day into one entry carrying the correct new total (reusing an existing session's id/type, default LISS; a 0 total drops the day). Reads fresh storage so a dashboard session logged since mount isn't clobbered.
- **`src/pages/Diet/index.tsx`** — `cardioMin` init and `weeklyCardio` now use `cardioMinutesOn`; `updateCardio` uses `nextCardioLog` reading fresh from storage (with a minimal catch fallback). No schema/engine/UI-layout change. The single-number stepper still consolidates a day's sessions on an explicit edit (inherent to a total control), but never silently loses minutes the way the old read did.

### Tests added
- `tests/unit/cardioLog.test.ts` (+13) — `cardioMinutesOn` sums multiple same-day sessions (30+20→50, not 30), ignores other days / corrupt logs / non-finite minutes; `nextCardioLog` bumps the true 50→55 on +5 (old code gave 35), preserves other days verbatim, subtracts from the correct total, clamps to [0,120], drops a day at 0 total, reuses id/type, and creates a fresh LISS entry for an empty day.

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (459 tests, +13)
- `npx electron-vite build` → PASS

### Note
The remaining known limitation (an explicit Diet-stepper edit consolidates that day's cardio sessions into one entry, losing the per-session type breakdown for today) is intrinsic to a single-number total control and is documented in `src/utils/cardio.ts`. Totals — the values the Cardio widget, Weekly Scorecard and this tracker all display — are now consistent and never lose minutes.

---

## Run: 2026-10-27 (BUG FIX — area (a) nutrition engine + Diet flows; the AI Assistant's food-swap path (`plan:applyAIRequest` → `refine_diet` action) persisted the LLM's returned `meals` **raw** (`JSON.stringify(r.meals)`), unlike every other diet-write path. `refineDietPlan()` guarantees its result `meals` is a non-empty array but does NOT validate each entry — it passes the model's objects through verbatim. A model can realistically omit `foods` on an entry, return `foods` as a non-array string, or send non-finite numeric fields. Persisted raw, the next `plan:getDiet` round-trips it to the renderer where the Diet page / NextMealWidget / WeeklyMealView / GroceryList read `meal.foods.map(...)` / `meal.foods.length` with no error boundary → white screen, and a NaN macro propagates into every adherence calculation. The sibling handler `plan:refineDietWithPrompt` was already hardened to run model meals through `normalizeMeals` before storing; this path was the lone remaining gap.)

### STEP 0 — Requested changes
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** → proceeded to a bug hunt.

### STEP 1 — Baseline / regression guard (GREEN before changes)
Clean `master` + `npm ci` (`ELECTRON_SKIP_BINARY_DOWNLOAD=1`):
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (444 tests) → PASS (446 tests, +2) after the fix
- `npx electron-vite build` → PASS

### STEP 2 — Area audited: (a) nutrition engine + Diet flows
Rotated to **(a)** (least-recent; recent runs were (c) 10-26#2, (f) 10-26, (d) 10-25#2, (b) 10-25, (e) 10-24#2, (a) 10-24). Deep-read: `electron/services/nutritionEngine.ts` (phase-aware deficit, `buildMeals`/`getMealTemplates`/portion math, `clampWeightKg`/`clampMealCount`/`sanitizeCalorieTarget`/`sanitizeMacroGrams`/`normalizeMeals`, culture/cook-time/prep styling), `electron/ipc/planHandlers.ts` (`generateDiet`, `getDiet`, `regenerateAll`, `startupRefresh` diet branch, `recalculateMacros`, `refineDietWithPrompt`, and the `plan:applyAIRequest` `refine_diet`/`refine_workout`/settingChanges branches), and `electron/services/claudeService.ts` (`refineDietPlan`).

Ruled out (not bugs — hardened by prior runs):
- **`plan:generateDiet` / `plan:refineDietWithPrompt`** both route model `meals` through `normalizeMeals` and macro targets through `sanitizeCalorieTarget`/`sanitizeMacroGrams`.
- **Engine macro/portion math** floors `totalCal` to `MIN_CALORIE_TARGET` (no Infinity ratios), clamps weight (30–300 kg) and meal/snack counts (1–20 / 0–20), guards non-finite counts, and `max(0,…)` floors carbs.
- **`recalculateMacros`** floors the calorie divisor, self-heals a legacy 0-target row, and uses the latest clamped check-in weight.
- **`applyAIRequest` settingChanges** whitelists columns, clamps numeric bounds, and sanitizes `maxSetsOverride`.

### The bug (file:line)
`electron/ipc/planHandlers.ts` — `plan:applyAIRequest`, `refine_diet` branch (~line 766–778): guarded only `!refined || !(refined as any).meals` (a truthiness check) and then stored `JSON.stringify(r.meals)` directly, with `refinedMealCount` from the raw array length. No per-entry normalization.

### Root cause
`refineDietPlan`'s array-non-empty guarantee was mistaken for a well-formed-meals guarantee. The model's per-entry shape (foods array, finite macros) is never enforced on this write seam, so a malformed entry persists and crashes the renderer that assumes the `Meal` shape.

### Fix (minimum, one seam)
- **`electron/ipc/planHandlers.ts`** — the `refine_diet` branch now runs `const refinedMeals = normalizeMeals(r.meals)`, returns the existing "could not generate specific food swaps" explain message when the normalized result is empty, and persists `JSON.stringify(refinedMeals)` with `refinedMealCount = refinedMeals.length`. This mirrors `plan:refineDietWithPrompt` exactly. `normalizeMeals` was already imported. No schema/engine/UI change; the orphaned-completion purge and return shape are unchanged.

### Tests added
- `tests/unit/applyAIRequestRefineDietNormalize.test.ts` (+2) — exercises the real handler against an in-memory `node-sqlite3-wasm` DB with a stubbed `refineDietPlan`: (1) malformed model meals (one missing `foods`, one with `foods` as a string, one with a NaN calorie + a mixed `['salmon', 42, 'rice']` foods array) → every stored & returned meal has a `string[]` foods array and finite macros, and the mixed array drops the non-string element; (2) model meals that normalize to empty (`[null, 'x', 42]`) → handler returns `explain` and leaves the original 3-meal plan untouched. Verified failing-first against old `master` (test 1: `expected 'bar' to be 'str…'`/foods undefined; test 2: `expected 'update' to be 'explain'`), passing after the fix. Existing `applyAIRequestRefineDietOrphans` / `refineDietMacroSanitize` / `normalizeMeals` tests still pass.

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (446 tests, +2)
- `npx electron-vite build` → PASS

---

## Run: 2026-10-26 #2 (BUG FIX — area (c) check-in + Progress + adaptive nutrition; editing a check-in recomputed its adaptive calorie adjustment against the wrong "previous" weigh-in. `checkin:update` selected both the `previous` check-in and the smoothed trend window by **insertion id** (`WHERE id < checkinId ORDER BY id DESC`), while `submit` (ORDER BY week_number DESC) and `submitMissed` (`WHERE check_in_date < ? ORDER BY check_in_date DESC`) both select the **chronologically** previous check-in. Insertion id only tracks date order when every check-in was logged live in sequence — but `submitMissed` (a first-class "fill in a missed slot" feature) back-fills a retroactive weigh-in with the HIGHEST id and an OLD date. Once such a row exists, id order ≠ date order, so editing a check-in could compare it against a chronologically-LATER weigh-in: the adaptive engine then reads a backwards weight-change signal and stores the wrong coach feedback + a wrong calorie delta on the edited check-in. Verified: with a live 07-01 80.0 kg + live 07-29 86.0 kg + back-filled 07-15 79.0 kg (highest id), editing the 07-15 row cut 100 kcal with a "stalling" note — it was compared to the LATER 86.0 kg row — instead of correctly reading the ~0.6 %/wk loss vs 07-01 80.0 kg as "on track", 0 kcal.)

### STEP 0 — Requested changes
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** → proceeded to a bug hunt.

### STEP 1 — Baseline / regression guard (GREEN before changes)
Clean `master` + `npm ci` (`ELECTRON_SKIP_BINARY_DOWNLOAD=1`):
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (443 tests) → PASS (444 tests, +1) after the fix
- `npx electron-vite build` → PASS

### STEP 2 — Area audited: (c) check-in + Progress + adaptive nutrition
Rotated to **(c)** (least-recent; recent runs were (f) 10-26, (d) 10-25#2, (b) 10-25, (e) 10-24#2, (a) 10-24, (c) 10-23#2). Deep-read: `electron/services/checkinEngine.ts` (`parseAdjustments`, `clampCheckinWeightKg`, `weightTrend`/`weightTrendPct` Theil–Sen, `calculateAdjustments`), `electron/ipc/checkinHandlers.ts` (`submit`/`submitMissed`/`update`/`history`/`latest`/`nextAllowed` + the per-check-in diet-plan macro recalc & meal scaling), `src/pages/Progress/index.tsx`, `src/pages/CheckIn/index.tsx` (open/locked/success/edit + auto-fill adherence), the charts `WeightChart.tsx` / `MeasurementsChart.tsx`, widgets `CheckinFeedbackWidget` / `RecentCheckinsWidget` / `PrepPaceWidget`, and utils `weeklyRate.ts`, `weeksTracked.ts`, `targetWeight.ts`, `checkinSchedule.ts`, `ratingColor.ts`.

Ruled out (not bugs — hardened by prior runs):
- **Write-seam weight clamps / adjustment parsing.** `clampCheckinWeightKg` (30–300 kg, rejects ≤0/non-finite) guards submit/submitMissed/update; `parseAdjustments` normalizes every read so no `.notes.map` / `calories_delta` consumer can crash on a '{}' or corrupt cell.
- **Trend math.** `weightTrendPct` (Theil–Sen median, cadence-normalized by real dates, skips ≤0 x-gaps so same-day dupes can't divide by zero) and `computeWeeklyWeightRate` (≥1-week span floor, non-finite guards) are robust to a single noisy weigh-in on any slot.
- **Macro recalc / meal scaling** floors the ratio divisor at `MIN_CALORIE_TARGET` and `newCalories` at 1200, uses the clamped weigh-in for protein/fat (same 2.3 g/kg · 0.9 g/kg as the initial `nutritionEngine` plan, so no first-check-in macro jump), and `max(0, …)` floors carbs.
- **Missed-slot schedule** (`computeMissedSlots`) guards non-finite/≤0 intervals (no infinite loop) and the day-mode re-align has a `guard < 7` cap.
- **Progress display math** (first→latest span, measurement deltas, YMCA body-fat clamp 3–60 %, diet-consistency `target>0` guard, DST-safe UTC-midnight date diffs) and `parseTargetWeightKg` (rejects NaN/≤0) all guard their divisions and render guards.

### The bug (file:line)
`electron/ipc/checkinHandlers.ts` — in `checkin:update`, `previous` and `recentCheckins` were queried with `WHERE user_id=? AND id<? ORDER BY id DESC` (insertion-id order), diverging from `submit`/`submitMissed` which use date/week ordering. A `submitMissed` back-fill (highest id, old date) breaks the assumption that id order == date order.

### Root cause
Two of the three check-in entry points pick the "previous"/trend window chronologically; the edit path picked it by insertion id, which only coincides with date order for strictly-in-order live logging — not once a retroactive fill exists.

### Fix (minimum, one seam)
- **`electron/ipc/checkinHandlers.ts`** — `checkin:update` now selects `previous` and `recentCheckins` with `AND id<>? AND check_in_date < ? ORDER BY check_in_date DESC`, scoped to the edited row's **effective** date (`data.check_in_date ?? existing.check_in_date`) so a date-correcting edit recomputes relative to the corrected chronological position, and excluding the edited row itself. This matches `submitMissed`'s semantics exactly. No schema/engine/UI change; week_number renumber-on-date-change is unaffected.

### Tests added
- `tests/unit/checkinUpdatePreviousByDate.test.ts` (+1) — exercises the real handler against an in-memory `node-sqlite3-wasm` DB: live 07-01 (80.0) + live 07-29 (86.0) + back-filled 07-15 (79.0, highest id); editing the 07-15 row must yield `calories_delta === 0` + an "on track" note (vs the buggy `-100` + "stalling"). Verified failing-first (`expected -100 to be +0`), passing after the fix. Existing `checkinUpdateRenumber`/`checkinUpdateDuplicate`/`checkinUpdateNullDate` still pass.

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (444 tests, +1)
- `npx electron-vite build` → PASS

---

## Run: 2026-10-26 (BUG FIX — area (f) shows/competition + date/week logic; the Dashboard **PeakWeekWidget** mapped days-until-show to the wrong peak-week protocol day. `PEAK_WEEK_PROTOCOL.days` keys each day by `daysOut` counting the SHOW DAY as day 1 — an inclusive countdown ("Depletion workout on Day 7 (Mon)"; carb loading on "Days 4, 3, and 2 before the show" = Thu/Fri/Sat). But `getShowCountdown().totalDays` counts the show day as 0, so the correct map is `daysOut = totalDays + 1`. The widget used `Math.max(1, totalDays)`, which lined up ONLY on show day and showed the NEXT day's protocol on every other peak-week day — the day before the show (1 day out) displayed the backstage/show-day plan instead of Saturday's "Final Load & Tan Day", and 6 days out showed "Tuesday — Carb Reduction" instead of "Monday — Depletion". The athlete got the wrong water/sodium/carb/training instructions in the one week precision matters most.)

### STEP 0 — Requested changes
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** → proceeded to a bug hunt.

### STEP 1 — Baseline / regression guard (GREEN before changes)
Clean `master` + `npm ci` (`ELECTRON_SKIP_BINARY_DOWNLOAD=1`):
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (440 tests) → PASS (443 tests, +3) after the fix
- `npx electron-vite build` → PASS

### STEP 2 — Area audited: (f) shows/competition + date/week logic
Rotated to **(f)** (least-recent; recent runs were (d) 10-25#2, (b) 10-25, (e) 10-24#2, (a) 10-24, (c) 10-23#2, (f) 10-23). Deep-read: `electron/services/showDates.ts` (`weeksUntilShow`/`localToday`), `electron/ipc/showHandlers.ts` (`syncPrimaryToNearest`/`persistProfileShowDate`/`regenerateDietForGoal`/add/update/delete/cancel/`setPrimaryShow`/`transitionTrainingToOffSeason`), `src/utils/dates.ts` (`getShowCountdown`/`weekStartMonday`/`addDays`), `src/data/competitionPrep.ts` (`buildPrepTimeline`/`getWeekGuidance`/`PEAK_WEEK_PROTOCOL`), `src/utils/checkinSchedule.ts`, and the competition widgets (`PeakWeekWidget`, `PrepGuidanceWidget`, `QuickStatsWidget`, `NavSidebar`) + the Education prep-timeline page.

Ruled out (not bugs):
- **"nearest upcoming show" selection** is consistent across NavSidebar / Education / PrepGuidanceWidget (all `shows.filter(s => s.show_date >= localToday).sort(...)[0]`), matching the backend `syncPrimaryToNearest` query.
- **Countdown/week math** (`getShowCountdown`, `weeksUntilShow`, `buildPrepTimeline`, `weekStartMonday`) is local-midnight / calendar-day based and DST-safe (prior runs); `isPast` vs clamped `totalDays` correctly distinguishes a past show from show day.
- **Missed-slot schedule logic** guards non-finite/≤0 intervals (no infinite loop) and uses the effective day-mode cadence (prior runs).

### The bug (file:line)
`src/components/widgets/PeakWeekWidget.tsx:17` — `const daysOut = Math.max(1, showCountdown.totalDays)` then `PEAK_WEEK_PROTOCOL.days.find(d => d.daysOut === daysOut)`. The protocol's `daysOut` is an inclusive countdown (show day = 1), but `totalDays` is exclusive (show day = 0), so for totalDays ≥ 1 the widget selected the protocol one day LATER than the real day. The `> 7` render guard also admitted totalDays=7 (literally the Sunday BEFORE the Mon–Sun peak week), which only rendered nothing by accident (no `daysOut` 8).

### Root cause
Two different day-numbering conventions (inclusive protocol `daysOut` vs. exclusive `totalDays`) were compared directly with a `max(1, …)` clamp that masked the off-by-one everywhere except show day.

### Fix (minimum, one widget)
- **`src/components/widgets/PeakWeekWidget.tsx`** — `daysOut = showCountdown.totalDays + 1` (correct inclusive→protocol map; `isPast` already guarantees totalDays ≥ 0 so no clamp needed), and tightened the render guard to `totalDays > 6` so the window is exactly the 7-day protocol (totalDays 0–6 → daysOut 1–7). The header's literal "N days out" and the `isShowDay = totalDays === 0` flag are unchanged. No schema/engine/data change.

### Tests added
- `tests/unit/peakWeekDayMapping.test.tsx` (+3): show day (0 out) → Show Day protocol; **1 day out → "Final Load & Tan Day", NOT Show Day** (the regression); 6 days out → "Depletion". Verified failing-first against the old `max(1, …)` (6-out rendered "Tuesday — Carb Reduction", 1-out rendered "Show Day"); all 3 pass after the fix. Existing `pastShowWidgets.test.tsx` (past-show hides / show-day renders) still passes.

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (443 tests, +3)
- `npx electron-vite build` → PASS

---

## Run: 2026-10-25 #2 (BUG FIX — area (d) onboarding + Settings + reset + data lifecycle; the Settings "Edit profile" form let the user edit **Show Date** and **Division**, saving them straight through `user:update` to the users row — but both are DERIVED columns that `plan:startupRefresh`/`syncPrimaryToNearest` rebuild from the `shows` table on EVERY launch, so the edit is silently reverted (data loss) and, until the next launch, desyncs the UI: the Diet plan is never regenerated for the new weeks-out, so the sidebar/Training/CheckIn/Progress read the just-written `user.show_date` while the Diet page still shows the OLD show's macros.)

### STEP 0 — Requested changes
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** → proceeded to a bug hunt.

### STEP 1 — Baseline / regression guard (GREEN before changes)
Clean `master` + `npm ci` (`ELECTRON_SKIP_BINARY_DOWNLOAD=1`):
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (439 tests) → PASS (440 tests, +1) after the fix
- `npx electron-vite build` → PASS

### STEP 2 — Area audited: (d) onboarding + Settings + reset + data lifecycle
Rotated to **(d)** (least-recent; recent runs were (b) 10-25, (e) 10-24#2, (a) 10-24, (c) 10-23#2, (f) 10-23, (d) 10-22#2). Deep-read: `electron/ipc/userHandlers.ts` + `userSanitize.ts` (create/update/resetAll seams), `electron/database/db.ts` + `schema.ts` (FK/cascade + migrations), `electron/ipc/settingsHandlers.ts`, `electron/ipc/showHandlers.ts` (`syncPrimaryToNearest`/`persistProfileShowDate`/add/update/delete/cancel/setPrimary), `electron/ipc/planHandlers.ts` (`plan:startupRefresh`, `plan:applyAIRequest`), `src/utils/resetData.ts`, `src/store/userStore.ts`, `src/store/settingsStore.ts`, `src/pages/Onboarding/*` (wizard + all step inputs + imperial conversions) and `src/pages/Settings/index.tsx`.

Ruled out (not bugs):
- **Reset cascade.** `user:resetAll` relies on `DELETE FROM users` cascading to every child table. Empirically verified `node-sqlite3-wasm` defaults `PRAGMA foreign_keys = 1` (unlike the SQLite CLI), so the cascade fires on a fresh connection — the reset works as documented. `resetLocalData`/`mergeWeighIns` weigh-in preservation + hard-reload lifecycle are sound.
- **Numeric input seams.** `sanitizeUserUpdate` already clamps/drops every out-of-range or non-finite profile number (age/height/weight/training_frequency/exercises/sets/meal/snack/body_fat) at the write seam (prior runs); onboarding `validateStep` + sliders + `parseFloat(...)||0` guards cover the entry side.

The one genuine, reachable (no-corruption-needed) defect was the derived-column ghost-write below.

### The bug (file:line)
`src/pages/Settings/index.tsx:396` renders an editable `<input type="date" value={editForm.show_date}>` (and `:384` a Division `<select>`); `handleSaveProfile` (`:109`) spreads `...editForm` into `updateUser(...)` → `user:update` → writes `show_date`/`division` to the **users** row. But those columns are rebuilt from the `shows` table on every launch:
- `electron/ipc/planHandlers.ts:360-369` (`plan:startupRefresh`, runs on every `loadUser`) and `electron/ipc/showHandlers.ts:syncPrimaryToNearest` both run `UPDATE users SET show_date=?, division=?` from the nearest upcoming show, or `SET show_date=NULL, division=NULL` when there is none.

So any profile-editor edit to Show Date / Division is **unconditionally overwritten on the next launch** (the edit is lost). In the meantime it is a **DB↔UI desync**: `shows:*` are the only paths that regenerate the diet for the new weeks-out, so after a profile "save" the sidebar is unaffected (NavSidebar deliberately reads the shows array, `src/components/Layout/NavSidebar.tsx:27`) while Training/CheckIn/Progress read the freshly-written `user.show_date` and the Diet page keeps the old show's macros. Blast radius is exactly one call site: the Settings profile editor is the ONLY caller that sends `show_date`/`division` through `user:update` (the Diet page sends only food/restriction arrays; the AI path uses its own `UPDATE` + `persistProfileShowDate`, never `user:update`). In scope: DB↔UI desync, data lifecycle.

### Root cause
A derived column (owned by the `shows` subsystem, which is the single source of truth and writes `users.show_date`/`division` itself) was also writable through the generic profile-update seam, so a profile edit could ghost-write a value that the shows subsystem then reverts.

### Fix (minimum, one seam)
- **`electron/ipc/userSanitize.ts`** — `sanitizeUserUpdate` now sets `show_date: undefined` and `division: undefined`, so the final `undefined` filter drops them from every `user:update` payload. A profile edit can no longer ghost-write or transiently desync these columns; shows remain managed exclusively through "My Shows" / onboarding / the AI assistant (all of which route through the `shows` table and update `users.show_date` themselves). No UI/engine/schema change; every other profile field is unaffected.

### Tests added
- `tests/unit/userSanitize.test.ts` (+1, now 12) — asserts `show_date` and `division` are dropped from a sanitized payload while a genuine field (`weight_kg`) and `id` pass through. Verified failing-first: before the fix `'show_date' in clean` was `true` (1 failed / 11 passed); after, all 12 pass.

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (440 tests, +1)
- `npx electron-vite build` → PASS

---

## Run: 2026-10-25 (BUG FIX — area (b) training engine + workout/session flows; the workout-history progression arrows (↑/↓) silently compared each log against an UNRELATED workout after any plan regeneration. Plan regen nulls `session_id` on every historical completed log, so the "previous same-session log" lookup's `h.session_id === log.session_id` degraded to `null === null` → true, matching the nearest earlier workout of ANY session type and drawing wrong strength-trend arrows for any recurring exercise.)

### STEP 0 — Requested changes
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** → proceeded to a bug hunt.

### STEP 1 — Baseline / regression guard (GREEN before changes)
Clean `master` + `npm ci` (`ELECTRON_SKIP_BINARY_DOWNLOAD=1`):
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (434 tests) → PASS (439 tests, +5) after the fix
- `npx electron-vite build` → PASS

### STEP 2 — Area audited: (b) training engine + workout/session flows
Rotated to **(b)** (least-recent; recent runs were (e), (a), (c), (f), (d)). Deep-read:
`electron/services/trainingEngine.ts` (all split builders, getSets/getExercises guards, phase/weeks math), `electron/ipc/workoutHandlers.ts` (sanitizeReps/WeightKg clamps on every write seam), `electron/ipc/planHandlers.ts` (rule-based + startup-refresh plan persistence/regeneration) and `electron/services/showDates.ts` (`weeksUntilShow` non-negative, midnight-based, matches UI), plus the full UI flow: `WorkoutSession.tsx`, `WorkoutStats.tsx`, `WorkoutLogEditor.tsx`, `SessionEditor.tsx`, `Training/index.tsx`, `TodaysSessionWidget.tsx`, `SessionsWeekWidget.tsx`, and utils `detectNewPRs`/`parseRepMidpoint`/`clampSetCount`. The engine, write seams, and week/DST math are well-hardened by prior runs (set-count/exPerSession/sets-per-ex/max-sets clamps, calendar-arithmetic week starts, consistent UTC duration math). The one genuine, reachable (no-corruption-needed) defect was the progression-arrow false-match below.

### The bug (file:line)
`src/pages/Training/index.tsx:895` — the workout-history "previous completed log for the same session" lookup used:
```
workoutHistory.find(h => h.id !== log.id && h.status === 'completed'
  && h.session_id === log.session_id && h.date < log.date)
```
On every training-plan regeneration the app runs
`UPDATE workout_logs SET session_id = NULL WHERE session_id IN (SELECT id FROM training_sessions WHERE plan_id = ?)`
(`electron/ipc/planHandlers.ts:100` and `:464`) before deleting the old sessions — required because `workout_logs.session_id` has a plain FK (`REFERENCES training_sessions(id)`, no `ON DELETE` action, `electron/database/schema.ts:124`). Regeneration is **automatic**: the startup-refresh regenerates training whenever the prep phase boundary is crossed (hypertrophy→strength→peak→deload) or the show context changes (`planHandlers.ts:399`), and the manual/rule path does the same. So after the first phase transition, **every historical completed log has `session_id === null`**, and `h.session_id === log.session_id` becomes `null === null` → true. `prevLog` then resolves to the nearest earlier completed workout of ANY session type, and every exercise name shared with that unrelated workout gets a wrong green-↑/red-↓ progression arrow in the History list (a DB↔UI desync — the arrow asserts "vs your last SAME session" but compares across sessions). In scope: DB↔UI desync, missing-data/first-run (`session_id` null) handling.

### Root cause
A NULL-sentinel compared with `===`: two logs whose session is *unknown* (null) were treated as the *same* session. A log with no known session has no determinable same-session predecessor, so it must yield none rather than a cross-session match.

### Fix (minimum, one pure helper, one call site)
- **`src/utils/prevSessionLog.ts`** (new) — `findPrevSessionLog(history, log)` returns the newest earlier completed same-session log, but **returns `undefined` when `log.session_id == null`** (guards the null-sentinel) so the UI simply omits the arrow instead of drawing a misleading one. Behavior for real (non-null) session ids is identical to before.
- **`src/pages/Training/index.tsx`** — replaced the inline `.find(...)` with `findPrevSessionLog(workoutHistory, log)` (+ import). No schema/engine change; non-regenerated plans are unaffected.

### Tests added
- `tests/unit/prevSessionLog.test.ts` (5 tests): newest earlier same-session match; ignores a more-recent *different*-session log; undefined when no earlier same-session log; **regression — two different null-session logs must NOT match** (`null === null`); and strict-earlier / completed-only filtering. Verified failing-first: removing the `log.session_id == null` guard fails exactly the null-session regression test (1 failed / 4 passed), restoring it passes all 5.

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (439 tests, +5)
- `npx electron-vite build` → PASS

---

## Run: 2026-10-24 #2 (BUG FIX — area (e) widgets + localStorage stores; the "this week" window in every weekly widget was computed with DST-unsafe millisecond math, so on a DST-transition week it lands on the WRONG calendar Monday and silently drops a day's logged entries from the week's totals.)

### STEP 0 — Requested changes
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** → proceeded to a bug hunt.

### STEP 1 — Baseline / regression guard (GREEN before changes)
On a clean `master` + `npm ci` (`ELECTRON_SKIP_BINARY_DOWNLOAD=1`):
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (429 tests) → PASS (434 tests, +5) after the fix
- `npx electron-vite build` → PASS

### STEP 2 — Area audited: (e) widgets + localStorage stores
Rotated to **(e)** off the recent cluster (10-24 (a), 10-23 #2 (c), 10-23 (f), 10-22 #2 (d), 10-22 (b)). Deep-read every dashboard/tab widget and the local stores: `localStore.ts` (top-level shape guard + per-entry sanitize), `createWidgetStore.ts` / `useWidgets.ts` (unknown-id drop + de-dupe), `competitionLogs.ts` (posing/sleep/condition/supplement entry validators), `useWaterLog.ts`, `cardioStore.ts`, `tabWidgets.ts`, and the widgets' render/math (`WaterWidget`, `TodaysMacrosWidget`, `TrainingVolumeWidget`, `WeeklyVolumeWidget`, `MuscleCoverageWidget`, `SessionsWeekWidget`, `QuickStatsWidget`, `PrepPaceWidget`, `WeeklyScorecardWidget`, `RecentCheckinsWidget`, `CardioWidget`, `PosingWidget`, `SleepWidget`, `ConditionWidget`, `SupplementWidget`, `NextMealWidget`). The store layer and input guards are well-hardened. The one genuine, reachable (no-corruption-needed) defect was the **DST-unsafe week-start math** below.

### The bug (file:line)
The "Monday of this week" used to filter logs into "this week" was computed as
`new Date(Date.now() - daysFromMon * 86400000).toLocaleDateString('en-CA')` in:
- `src/components/widgets/CardioWidget.tsx:18`
- `src/components/widgets/PosingWidget.tsx:21`
- `src/components/widgets/TrainingVolumeWidget.tsx:20`
- `src/components/widgets/MuscleCoverageWidget.tsx:34`
- `src/pages/Training/index.tsx:467` (sessions-week card) and `:535` (calorie-burn card)
- `src/pages/Progress/index.tsx:64` (+ the 8-week consistency loop at `:66,:72,:73`)

Subtracting N fixed 24-hour blocks from the current INSTANT and then formatting in
local time assumes every calendar day is exactly 86 400 000 ms. On a DST-transition
week it is not, so the result lands on the wrong calendar date. Reproduced
deterministically under `America/New_York`: on the fall-back Sunday **Nov 2 2025
23:30**, the week began Monday **Oct 27**, but the old math returned **Oct 28** (a
Tuesday, one day late). Effect: Monday Oct 27's cardio/posing sessions, training
volume, muscle coverage, completed sessions, calorie burn, and meal-consistency
are silently EXCLUDED from "this week" totals — a DB↔UI desync, reachable by any
user simply opening the app on that Sunday (no corrupted storage needed). In scope:
timezone / date-boundary / week-rollover.

### Root cause
Instant-minus-milliseconds date arithmetic across a non-24h (DST) calendar day.
The codebase already had the correct calendar-arithmetic pattern elsewhere
(`SessionsWeekWidget`, `WeeklyScorecardWidget`, `WeeklyVolumeWidget` use
`date.setDate(date.getDate() - n)`); these six/seven sites diverged.

### Fix (minimum, one shared helper, all sites routed through it)
- **`src/utils/dates.ts`** — added `weekStartMonday(from?)` → local-midnight Monday
  of `from`'s week via `new Date(y, m, d - daysFromMon)` (calendar arithmetic,
  DST-immune), `weekStartMondayStr(from?)` → that formatted `YYYY-MM-DD`, and
  `addDays(d, n)` → calendar-safe day step. Replaced the ms math at all sites above:
  the four widgets and both Training cards now call `weekStartMondayStr()`; the
  Progress 8-week consistency effect now anchors on `weekStartMonday(today)` and
  steps weeks with `addDays`, so the whole window stays Monday-aligned across any
  DST change inside it. No engine/DB/UI-shape change; in non-DST weeks the output
  is identical to before, so no behavior change outside the bug.

### Tests added
- `tests/unit/weekStartDst.test.ts` (5 tests): TZ-independent correctness of
  `weekStartMonday`/`weekStartMondayStr`/`addDays` (weekday→Monday mapping,
  local-midnight Date, month/year rollover, Monday-anchored 8-week window); plus a
  DST regression that runs the REAL `dates.ts` source (esbuild-transpiled) in a
  child `node` process under `TZ=America/New_York` — ICU caches the TZ per vitest
  worker and can't be switched in-process — asserting the fall-back Sunday resolves
  to Oct 27 (fix) where the old ms math gave Oct 28 (bug). Verified failing-first:
  reverting the helper to the ms math fails 2/5.

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (434 tests, +5)
- `npx electron-vite build` → PASS

---

## Run: 2026-10-24 (BUG FIX — area (a) nutrition engine + Diet flows; the Diet page's "exclude this food" ✕ action **silently does nothing for any fixed-count food** (Rice Cakes x3/x2, Corn Tortilla x2). `handleExcludeFood` normalized a food's DISPLAY label into an exclusion ID by stripping only the `(portions)` suffix, so "Rice Cakes x3" became `rice_cakes_x3` — which matches no food ID in `isExcluded` — and the engine kept serving rice cakes in every regenerated plan despite the confirm dialog and the on-page note both promising "exclude this food from future plans". `GroceryList.buildGroceryItems` already strips the `xN` count token for its `baseName`; the exclude path was the one seam missing that same strip.)

### STEP 1 — Regression guard (GREEN before and after)
On a clean `master` + `npm ci` (`ELECTRON_SKIP_BINARY_DOWNLOAD=1`):
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (424 tests) → PASS (429 tests, +5) after the fix
- `npx electron-vite build` → PASS

### STEP 2 — Area audited: (a) nutrition engine + Diet flows
Rotated to **(a)** off the recent cluster (10-23 #2 (c), 10-23 (f), 10-22 #2 (d), 10-22 (b)). Deep-read: `nutritionEngine.ts` (`getPhaseAwareDeficit`, `buildMeals` snack/main calorie split + macro ratios, `getMealTemplates` main/snack index selection + cycling, `calcPortionStr`/`applyCookingStyle`/`applyPrepStyle`, `getFood`/`isExcluded`/`getCultureFood`, and the `clampWeightKg`/`sanitizeCalorieTarget`/`sanitizeMacroGrams`/`normalizeMeals`/`clampMealCount` guard seams — all already hardened), the diet IPC paths in `planHandlers.ts` (`generateDiet`, `refineDietWithPrompt`, `applyAIRequest` regen, `recalculateMacros`, `reorderMeals` permutation remap, `previewGoalCalories`), `mealCompletionHandlers.ts` (`clearOrphanedMealCompletions` + log/unlog/get), and the Diet UI (`Diet/index.tsx` intake/refeed/weekly-totals math — all division-guarded; `GroceryList.tsx` quantity accumulation; `WeeklyMealView.tsx`; `swapAlternatives.ts`; `refeed.ts`). The weekly/intake/portion math and the AI write seams are all well-guarded. The one genuine, reachable defect was the **exclude-by-label normalization** below.

### The bug (file:line)
- `src/pages/Diet/index.tsx:198` `handleExcludeFood` — took a meal food's display string (passed verbatim from the ✕ button, `index.tsx:1205`) and slug-cased it to an exclusion ID after stripping only `(…)`. For a `fixedLabel` food that carries an `xN` count — Pre-Workout/snack **Rice Cakes x3 / x2** (id `rice_cakes`), Mexican **Corn Tortilla x2** (id `corn_tortilla`) — the `x3`/`x2` survived and the ID came out `rice_cakes_x3` / `corn_tortilla_x2`. `isExcluded` (`nutritionEngine.ts:259`) compares against the real IDs and their `EXCLUSION_ALIASES`; neither the direct nor the alias path has a `..._xN` key, so the exclusion was a no-op and the food reappeared on the next `generateDietPlan`. Reachable by any user tapping ✕ on a rice-cakes/tortilla chip — a plain omnivore or vegan default plan. In-scope: a frontend user-induced action that silently fails (UI-vs-stored/intent desync).

### Root cause
The display-label → exclusion-ID normalization stripped the `(portions)` suffix but not the fixed-count `xN` token, so counted foods normalized to an ID that matches nothing. `GroceryList.buildGroceryItems` (`GroceryList.tsx:71`) already does both strips for its `baseName` (`.replace(/\s*\(.*?\)/g,'').replace(/\s*x\d+/g,'')`); the exclude path diverged.

### Fix (minimum, single seam)
- New pure helper `src/utils/foodId.ts` → `foodLabelToExclusionId(label)`: strips `(…)` THEN `\s*x\d+`, then lower/underscore-slugs (exactly mirroring the grocery `baseName` derivation). `Diet/index.tsx` imports it and `handleExcludeFood` now calls it instead of the inline regex chain. "Rice Cakes x3" → `rice_cakes`, "Corn Tortilla x2" → `corn_tortilla`; scalable foods ("White Rice (150g cooked)" → `white_rice`) are unchanged. No engine/DB/UI-shape change.
- Note (left as-is, out of this fix's scope): display names that differ from their ID beyond the count token — e.g. "Whole Eggs" (id `eggs`) — still don't map through this normalizer, but that is a distinct display-name≠id class, not the count-suffix bug, and no such label is offered with a count that the `xN` strip would otherwise rescue.

### Tests added
- `tests/unit/foodId.test.ts` (5 tests): unit asserts `foodLabelToExclusionId` strips the count token (`Rice Cakes x3`→`rice_cakes`, `Corn Tortilla x2`→`corn_tortilla`) and the portion suffix, and both together; plus an end-to-end pair through `buildMealsPublic('vegan', exclude)` showing the OLD id `rice_cakes_x3` leaves rice cakes in the regenerated meals (reproduces the bug) while the fixed id removes them. Verified failing-first: removing the `xN` strip makes 3/5 fail (`rice_cakes` vs `rice_cakes_x3`).

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (429 tests, +5)
- `npx electron-vite build` → PASS

---

## Run: 2026-10-23 #2 (BUG FIX — area (c) check-in/Progress/adaptive nutrition; closed the AI diet-refine macro-sanitization gap the prior run flagged as a lead: `plan:refineDietWithPrompt` persisted the model's top-level macros via `r.x ?? currentPlan.x`, so a 0 persists a nonsensical 0-gram target and a non-finite value (NaN / a stray string) binds as NULL → NOT NULL constraint throws the whole refine)

Rotated to area **(c) check-in + Progress + adaptive nutrition**, off the prior run's (f) and the (d)/(b) before it. I read the check-in engine (`checkinEngine.ts`: `parseAdjustments`, `clampCheckinWeightKg`, `weightTrend`/`weightTrendPct` Theil–Sen smoothing, `calculateAdjustments`), all four check-in handlers (`submit`/`submitMissed`/`update`/`nextAllowed`), the Progress page (weekly-rate/projection/required-rate math, YMCA body-fat estimate, diet-consistency and wellness aggregates), `progressHandlers`, the CheckIn page's auto-fill adherence and input guards, and the shared rate/weeks utils — all already well-guarded (divisions floored, weights clamped at every seam, NaN/Infinity guarded). The one genuine, reachable defect sits on the **adaptive-nutrition write seam** that the 2026-10-23 run explicitly deferred.

### STEP 0 — Requested changes
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** → proceeded to a bug hunt.

### STEP 1 — Baseline / regression guard (GREEN before changes)
- `npx tsc --noEmit` (root) → PASS (clean)
- `npm test` → PASS (421 tests, 66 files)
- `npx electron-vite build` → PASS
- (`npm ci` run with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`.)

### STEP 2 — Bug found (area c → adaptive-nutrition / AI diet-refine seam)
**Root cause.** `plan:refineDietWithPrompt` (`electron/ipc/planHandlers.ts`) stored the model's top-level macro targets with `r.protein_g ?? currentPlan.protein_g` (same for `carbs_g` / `fat_g`). `??` only falls back on null/undefined, so a model that returns a macro as:
- **0** → persists `0` verbatim as the stored target. A 0-gram protein/fat goal is nonsensical and dangerous: the Diet page then shows the athlete a "0g" target and the macro-adherence widgets read back "0% of goal" even after they log protein. (The sibling write seam `plan:generateDiet` already routes the identical fields through `sanitizeMacroGrams`; refine didn't — the gap flagged as a lead.)
- **NaN / non-finite / a stray string** → `?? currentPlan` keeps the bad value, which node-sqlite3-wasm binds as NULL → **`NOT NULL constraint failed: diet_plans.carbs_g`** throws, aborting the whole refine (the user's "swap X for Y" request fails outright with no plan change). Confirmed by the reproduction test's second case.

This is reachable: the AI diet-refine path is a first-class feature (API-key capture is onboarding step 1), and the model's top-level macro fields are untrusted.

### STEP 3 — Fix (minimum, at the write seam; mirrors plan:generateDiet)
- **`electron/ipc/planHandlers.ts`** — `plan:refineDietWithPrompt` now computes `safeProtein`/`safeCarbs`/`safeFat` via `sanitizeMacroGrams(r.x, refinedMeals.reduce(sum))` (model value → summed per-meal grams), with a final `|| keepPrev(currentPlan.x)` that restores the prior valid target only when both the model value AND the summed meals are 0. A 0 / negative / non-finite / string model macro can no longer persist as the stored target or throw the handler. No new exports; reuses the existing `sanitizeMacroGrams` already imported for the sibling seam.

### Files changed
- `electron/ipc/planHandlers.ts` — refine seam routes the three macros through `sanitizeMacroGrams` + previous-target fallback (was `?? currentPlan`).
- `tests/unit/refineDietMacroSanitize.test.ts` — 3 new tests exercising the REAL handler against an in-memory DB: model returns 0 → falls back to summed grams (not 0); model returns negative/NaN/string → summed grams (no NULL-constraint throw); model returns valid macros → honored verbatim.

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (424 tests, +3 new)
- `npx electron-vite build` → PASS

### Deferred / not done
- Nothing outstanding on this seam. The AI refine path's macro handling is now consistent with `plan:generateDiet`. (Both now guarantee a finite, non-zero macro target or a safe fallback.)

---

## Run: 2026-10-23 (BUG FIX — AI-generated diet plan persisted with an unvalidated meal shape: a non-array `meals` throws in the handler's per-meal `.reduce` (bypassing the rule-based fallback), and a meal missing `foods`/with non-finite macros crashes the Diet page + NextMealWidget with no error boundary)

Rotated to area **(f) shows/competition + date/week logic**, off the prior run's (d) and the (b) before it. The default (rule-based, no-API-key) paths in that area — `showDates`/`showHandlers`, `dates.ts`, `competitionPrep` (`getShowCountdown`/`buildPrepTimeline`), `weeksTracked`, `weeklyRate`, `checkinSchedule`, `checkinHandlers`, the competition widgets, Progress projection, WeeklyMealView, Education timeline — were all audited deeply and are already well-guarded (no reachable defect). The one genuine, reachable gap found sits on the **AI diet seam**, which is now a first-class path (API-key capture is onboarding step 1).

### STEP 0 — Requested changes
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** → proceeded to a bug hunt.

### STEP 1 — Baseline / regression guard (GREEN before changes)
- `npx tsc --noEmit` (root) → PASS (clean)
- `npm test` → PASS (415 tests, 65 files)
- `npx electron-vite build` → PASS
- (`npm ci` run with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`.)

### STEP 2 — Bug found (area f → AI diet seam)
**Root cause.** The rule-based nutrition engine always emits well-formed meals, and the AI *workout* path already filters invalid sessions (`result.sessions.filter(s => Array.isArray(s.exercises) && s.exercises.length > 0)`). But the two AI **diet** write seams persist the model's `meals` verbatim with no equivalent guard:

1. `plan:generateDiet` (`electron/ipc/planHandlers.ts`): gated only on truthy `cr.meals`, then calls `(cr.meals ?? []).reduce(...)` four times. If the model returns `meals` as a non-array (object/string — e.g. `{"meals": {...}}` or a stray wrapper), `.reduce` is `undefined` → **TypeError thrown**, which aborts the handler *before* the rule-based fallback block below it can run. The user's diet generation fails outright instead of degrading.
2. `plan:refineDietWithPrompt` (same file): gated only on truthy `(refined as any).meals`, then stores `JSON.stringify(r.meals)` directly (it even already knew `r.meals` might not be an array — it guarded `meal_count` with `Array.isArray(r.meals) ? … : …` but still persisted the non-array blob).

Either way, a persisted meal that is a non-array, or an entry missing `foods` / with `foods` as a non-array / with non-finite numeric fields, then reaches the renderer, which assumes the `Meal` shape with **no error boundary**:
- `NextMealWidget` → `meal.foods.length` (crashes the **Dashboard**),
- Diet page `src/pages/Diet/index.tsx` + `WeeklyMealView` → `meal.foods.map(...)`,
- `GroceryList` → `for (const food of meal.foods)` (not iterable).
Result: white screen with no recovery until the plan is regenerated.

### STEP 3 — Fix (minimum, at the write seam)
- **`electron/services/nutritionEngine.ts`** — new exported `normalizeMeals(raw: unknown): Meal[]`, living beside the existing `sanitizeCalorieTarget`/`sanitizeMacroGrams` AI-output guards. Returns `[]` for a non-array input (so the caller can fall back to the rule-based engine), drops non-object entries, and for each valid entry guarantees the declared shape: `foods` → string[] (empty if missing/invalid, non-string members dropped), `name`/`time` → sane defaults, and `calories`/`protein_g`/`carbs_g`/`fat_g` → finite integers (non-finite → 0).
- **`electron/ipc/planHandlers.ts`** — `plan:generateDiet` now computes `const aiMeals = normalizeMeals((claudeResult as any)?.meals)` and gates the AI block on `aiMeals.length > 0` (empty → falls through to the rule-based engine), using `aiMeals` for the `.reduce` sums, the stored `meals`, `meal_count`, and orphan-completion purge. `plan:refineDietWithPrompt` computes `const refinedMeals = normalizeMeals(r.meals)`, treats an empty result as "no valid plan" (throws, same as before), and stores `refinedMeals` + `refinedMeals.length`. (Macro `?? currentPlan` handling left unchanged — that is a separate concern, kept out of this focused fix.)

### Files changed
- `electron/services/nutritionEngine.ts` — new `normalizeMeals` export.
- `electron/ipc/planHandlers.ts` — both AI diet seams routed through `normalizeMeals`.
- `tests/unit/normalizeMeals.test.ts` — 6 new tests (non-array → []; missing/invalid `foods` → []; non-string foods members dropped; non-finite macros → 0; non-object entries dropped; default name/time).
- `change-agent-report.md` — this entry.

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (421 tests, +6 new)
- `npx electron-vite build` → PASS

### Deferred / not done
- The AI *refine* path still uses `r.protein_g ?? currentPlan.protein_g` for top-level macros (a `0` from the model would persist), unlike `generateDiet` which uses `sanitizeMacroGrams`. That is a separate divide-by-zero-in-adherence concern, left for a future run to keep this fix single-purpose.

---

## Run: 2026-10-22 #2 (NO REAL BUG FOUND — audited area (d) onboarding + Settings + reset + data lifecycle, rotating off the prior run's (b) training. Read deeply and traced the SCOPE error paths; every suspicious seam resolved to correct or intended behaviour on inspection/empirical test, so — per the routine's rule — NO fix was fabricated. Baseline was GREEN before and after: root `tsc` clean, 415 tests pass, `electron-vite build` OK.)

### STEP 0 — Requested changes
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (all 13 queued items checked off; last was AI-tailored onboarding, 2026-07-07). Nothing to implement → proceeded to a bug hunt.

### STEP 1 — Baseline / regression guard
- `npx tsc --noEmit` (root) → PASS (clean)
- `npm test` → PASS (415 tests, 65 files)
- `npx electron-vite build` → PASS
- (`npm ci` run with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`.)

**Noted (pre-existing, benign, NOT a reachable defect — left as-is):** `npx tsc -p tsconfig.web.json` reports one error — `src/pages/Diet/index.tsx:233` assigns `prefsCuisine` (typed `useState<string>`) to `culture_pref` (a cuisine union). The root `tsconfig.json` (`files: []` + solution refs) type-checks nothing, so it's hidden there, and `electron-vite build`/esbuild doesn't typecheck, so no project script (`build`/`test`) and neither STEP-1 gate is red. At runtime `prefsCuisine` only ever holds one of the 9 valid cuisine option values (line 188 seeds it from the stored `culture_pref`, line 1634 sets it from the option list), so the value written is always valid — this is a type-widening nit present since 2026-07-18 (commit a843059), not a runtime bug. Flagging for visibility; a pure type-cleanliness cast (`as User['culture_pref']`) would silence it but changes no behaviour, so it's out of this debugging routine's scope.

### STEP 2 — Area audited: (d) onboarding + Settings + reset + data lifecycle
Traced every SCOPE error path in the area and verified each is already guarded:

- **Reset / data lifecycle (`user:resetAll`, `resetData.ts`).** The handler relies on `DELETE FROM users` cascading to all child tables (the comment claims it does). I suspected FK cascade might be a no-op (SQLite defaults `foreign_keys=OFF`, and the only `PRAGMA foreign_keys=ON` is inside migration v9, which is per-connection and not re-run on normal opens — `initDb`/`openFresh` never set it). **Empirically tested** with node-sqlite3-wasm directly: it defaults to `foreign_keys=1` (ON), so `DELETE FROM users` DOES cascade (orphan child rows = 0 after delete). The comment is accurate; reset works. `users.id` is `AUTOINCREMENT` so ids are never reused after reset either (belt-and-suspenders). No bug.
- **`resetLocalData` / `mergeWeighIns`** — preserved-key logic, per-entry weigh-in validation (bad date / non-finite / ≤0 dropped), JSON.parse wrapped in try/catch. The Settings reset-card text ("app settings … are kept") matches reality: the `settings` table has no `user_id` FK so it survives the cascade. No bug.
- **Settings "Edit profile" write path** — all numeric fields funnel through `sanitizeUserUpdate` → per-field clamps (`clampAge` 16–80, `clampHeightCm` 100–250, `clampWeightKgField` 30–300, `clampTrainingFrequency` 2–6, `clampExercisesPerSession` 3–12, `clampSetsPerExercise` 2–8, `clampBodyFatPct` 3–60, meal 1–20 / snack 0–20) with non-finite (cleared field → NaN) dropped so required columns are never NULLed. These are the exact holes earlier runs closed. No bug.
- **Onboarding wizard** — `validateStep` (age/height/weight/experience ranges), Step1 ft/in round-then-split via `cmToFeetInches` (the "5 ft 12 in" fix from 2026-10-19 #2), Step4 meal/snack `clamp`+`Math.round`, the shared `Stepper` (reverts empty/NaN, clamps to [min,max], commits only finite ints), Step2/3/6 all use constrained Selects/sliders/option buttons. Show-date on submit is written to the `shows` table (authoritative) as well as `users`. No bug.
- **Migrations (`schema.ts`)** — v9 users-table rebuild correctly brackets the `DROP TABLE users` with `foreign_keys OFF`→`ON` (run as separate statements, so the pragma takes effect) and preserves ids via `INSERT … SELECT id,…`; append-only, already applied. No bug.
- **`ui_zoom` / theme / check-in schedule settings** — persisted as strings, applied via `document.documentElement.style.zoom`/class toggles; the degenerate `interval=0` renderer hang was already fixed (`countMissedBetween` guard). No bug.

### Adjacent seams spot-checked (defensive, to be sure the area's data flows are clean)
- `checkinEngine.weightTrend` — `weeksBetweenDates` returns `null` for a non-positive gap (duplicate same-day / out-of-order check-ins) → `?? 1`, and bodyweight ≤0/non-finite short-circuits to 0. No divide-by-zero.
- `computeWeeksTracked` / `computeWeeklyWeightRate` (`weeksTracked.ts`/`weeklyRate.ts`) — guard <2 finite entries, min-1-week span, non-finite rate → null. Solid.
- `getShowCountdown` (`dates.ts`) — local-noon vs local-midnight math, DST-safe, `totalDays` floored at 0 with separate `isPast`. Correct.
- `clearOrphanedMealCompletions` — purges today+future index≥newCount on every diet-write path; `WeeklyMealView` progress bar is inside an `overflow-hidden` track so a historical ">100%" day is visually clipped (and the retained "6/3" count on past days is the documented, intended history record). No visible defect.
- `applyRefeedToMeals`, `parseRepMidpoint`, `TrainingVolumeWidget` (div-by-`thisWeekLogs.length` is guarded by an early return when length 0), `Progress` `toDisplay`/`parseFloat` display seams — all finite-guarded.

### Observation noted, deliberately NOT fixed (ambiguous feature semantics, not a clear defect)
`TrainingVolumeWidget.tsx:79` labels `calories_target − totalKcalBurned / thisWeekLogs.length` as "net ~N kcal/**day**", but it divides the week's total training burn by the number of completed **sessions** (≈ per-training-day burn), not by 7. Whether that's a mislabel or an intentional "net on a training day" reading is a design call, not a reachable error (value is always finite; `thisWeekLogs.length` is guaranteed >0 here). Recording it so the owner / a future run can decide rather than imposing an interpretation.

### STEP 4 — Verification (unchanged; all PASS)
- `npx tsc --noEmit` → PASS
- `npm test` → PASS (415)
- `npx electron-vite build` → PASS

No code changed this run (only this report). **Action for owner:** the backlog is empty — append new `- [ ]` items to `docs/change-backlog.md` to queue specific changes.

---

## Run: 2026-10-22 (BUG FIX — the workout-set write seam clamps **negative and non-finite** reps/weight but leaves the **upper tail unguarded**, so a fat-fingered / pasted extreme value permanently poisons PRs, the tonnage charts, and last-performance pre-fill. `sanitizeReps`/`sanitizeWeightKg` (`electron/ipc/workoutHandlers.ts:14/20`) are the single seam every write path funnels through — `workout:logSet`, `workout:updateSet`, and the live session's `workout:saveSetsBatch`. Their existing comment is explicit that a bad value "poisons the permanent history: WorkoutStats charts, PR detection, and next-session 'last performance' pre-fill all read it back" — which is exactly why negatives are floored to 0 and NaN/Infinity map to null. But the guard was **asymmetric**: `Math.max(0, …)` has no ceiling, so any *finite, positive* extreme slips through verbatim. Reachability is high — the live `WorkoutSession` reps/weight inputs (`src/pages/Training/WorkoutSession.tsx:130`/`139`) carry **no `max`** at all, and even the `WorkoutLogEditor`'s `max="9999"` (`src/pages/Training/WorkoutLogEditor.tsx:272`/`286`) does NOT block a typed/pasted value (HTML `max`, like `min`, never blocks typed input — the same fact the negative-clamp comment already relies on). So a stray extra digit (e.g. `100000000`) or a mis-paste is stored as a 100-million-kg "lift" that (1) registers as a permanent PR in `computePRs`/`exercisePRs`, (2) blows out the 6-Week Volume Trend chart's auto-scaled Y-axis so every real bar collapses to ~0 px, and (3) pre-fills the next session's weight with garbage. In-scope: user-induced "invalid / extreme / boundary inputs (… huge …)" + backend NaN/Infinity-adjacent propagation + DB↔UI poisoning. **Root cause:** the sanitize seam bounded only the lower tail; the symmetric upper-bound guard the same code comment's rationale demands was never added. **Fix (minimum, same seam, mirrors the existing clamp):** add `MAX_REPS = MAX_WEIGHT_KG = 9999` and clamp both helpers with `Math.min(ceiling, Math.max(0, …))`. 9999 mirrors the `WorkoutLogEditor`'s own declared `max="9999"`, so it is a *safety* ceiling, not a domain restriction — 9999 kg ≈ 22,000 lb and a weight is always converted to kg before this seam, so no real set is ever rejected; the value just stays finite and bounded. No UI change; a no-op for every real-world entry.)

### STEP 0 — Requested changes
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (`grep '^- \[ \]'` → no match; all queued items are `- [x]`). Bug-hunt run.

### STEP 1 — Regression guard (clean baseline on fresh rebased `master`)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (413 tests, 65 files)
- `npx electron-vite build` → PASS

(`npm ci` with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`. The SETUP `git remote set-url` with the embedded PAT succeeded this run; the existing `origin` already authenticates fetch/push through the agent git proxy either way.)

### STEP 2 — Area audited: (b) training engine + workout / session flows
Rotated off the recent clusters — 10-21 #2 (c, check-in/Progress/adaptive), 10-21 (a, nutrition/Diet), 10-20 #2 (f, shows/date/week), 10-20 (e, dashboard widgets), 10-19 #2 (d, onboarding/Settings). Deep-read: `trainingEngine.ts` (split builders, `getExercises` compound/isolation distribution, `getSets`/`getRIR`/`getRepRange`, and the `freq`/`exPerSession`/`userDefault`/`userMax` guards in `generateTrainingPlan` — all lower-bound-floored, product of prior runs), `workoutHandlers.ts` (all 11 IPC handlers; start/logSet/complete/skip/active/history/sessionSummary/updateSet/deleteSet/saveSetsBatch/cancelWorkout), the training paths in `planHandlers.ts` (`generateTraining` incl. the Claude path + check-in-driven force_deload/volume bump + the `session_id = NULL` null-out before session delete, `refineWorkoutWithPrompt` [guarded `if (!plan) throw`], `applyAIRequest` refine_workout + the `maxSetsOverride` sanitize), `WorkoutSession.tsx` (live logging, rest timer, summary volume, PR detection), `WorkoutLogEditor.tsx`, `SessionEditor.tsx` (empty-session guard), `WorkoutStats.tsx` (PRs, e1RM progression, monthly adherence, 4-wk muscle volume, 6-wk tonnage — all division/empty guarded), `Training/index.tsx` (streak, trend, lastPerfBySession, start/resume/double-submit guard), the three training widgets, `planStore` training actions, the training tables in `schema.ts`, `Step3Training` onboarding, and utils `detectNewPRs`/`parseRepMidpoint`/`clampSetCount`. The area is heavily hardened; the ONE real, reachable defect was the asymmetric sanitize-seam clamp above (upper tail unguarded) — the same history-poisoning class the negative/NaN guard was written for, left incomplete on the positive side.

Verified-not-a-bug this run (so coverage is visible): `plan:refineDietWithPrompt`'s unguarded `currentPlan` (a prior run's lead) is **dead from the UI** — `window.api.refineDietWithPrompt` is exposed in preload but has **zero callers in `src/`** (the Diet chat uses `applyAIRequest`, whose `refine_diet` branch IS `if (!currentPlan)`-guarded), so not reachable. The store's `logSet` action reads `activeWorkout.sets.some(...)` (would throw since `workout:start` returns a row with no `sets`) but has **zero callers** (the log editor uses `window.api.logSet` directly) — dead code, not reachable.

### STEP 3 — Root cause + fix
- **Root cause:** `sanitizeReps`/`sanitizeWeightKg` bounded only the lower tail (`Math.max(0, …)`); a finite positive extreme persisted verbatim and poisoned permanent history.
- **Fix (seam, mirrors existing clamp):** `electron/ipc/workoutHandlers.ts` — `MAX_REPS`/`MAX_WEIGHT_KG` = 9999 (mirrors `WorkoutLogEditor`'s `max="9999"`); both helpers now return `Math.min(ceiling, Math.max(0, …))`. Every write path (logSet/updateSet/saveSetsBatch) inherits it.

### Tests added — `tests/unit/workoutSetBounds.test.ts` (+2)
Extends the existing bounds suite (real handlers vs in-memory `node-sqlite3-wasm`, plus the pure helpers).
- **Fail-first reproductions (both red before the fix):** pure — `sanitizeReps(100000000)` / `sanitizeWeightKg(100000000)` → `9999` (was the raw value); handler — `workout:saveSetsBatch` with `weight_kg: 100000000` stores `9999` (was `100000000`).
- **Regression guard:** a legit heavy lift (`455` kg) and normal reps (`30`) pass through untouched.

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (415 tests, +2 new, 65 files)
- `npx electron-vite build` → PASS

### Leads for a future run
- `generateTrainingPlan` floors the LOWER bound of `exercises_per_session`/`sets_per_exercise`/`max_sets` but has no UPPER clamp; a hand-edited huge `exercises_per_session` makes `getExercises` loop that many times (bounded output by library size, so not OOM — just wasted work). `clampSetCount` (MAX 20) already caps the per-exercise set rows downstream, so the stored-vs-shown "100 sets" is latent. Low severity.
- Regenerating a training plan runs `UPDATE workout_logs SET session_id = NULL` for **all** logs of the old plan (completed ones included), so historical logs lose their session linkage (session_name in history, `lastPerfBySession`, progression arrows by session_id). Arguably intended (new plan = new session ids) and the alternative (dangling FK) is worse, but worth a design decision in a (b)/(d) run.
- An `in_progress` workout left open when the plan is regenerated gets `session_id = NULL`, so auto-resume (`sessions.find(s => s.id === activeWorkout.session_id)`) can't match it → the overlay never reopens and the row is orphaned (hidden behind `workout:active`'s `ORDER BY id DESC LIMIT 1`). Rare (needs regenerate mid-workout); consider auto-cancelling in-progress logs on regenerate.

## Run: 2026-10-21 #2 (BUG FIX — a **corrupt / default `weekly_checkins.adjustments` cell crashes the Dashboard and breaks Progress/Check-In loading**. The column is `adjustments TEXT NOT NULL DEFAULT '{}'` (`electron/database/schema.ts:77`), and the three check-in read paths (`checkin:history` :315, `checkin:latest` :324) plus the submit/submitMissed/update returns (:182/:290/:429) all did a **raw `JSON.parse(row.adjustments)` with no guard**, handing the result straight to consumers. Every consumer reads `adjustments.notes`: `CheckinFeedbackWidget` (`src/components/widgets/CheckinFeedbackWidget.tsx:58`) and the Check-In success screen (`src/pages/CheckIn/index.tsx:727`) call `adjustments.notes.map(...)`. Two failure modes on a bad cell: (1) the schema-default `'{}'` → `JSON.parse` yields `{}` whose `.notes` is `undefined` → `undefined.map` **crashes** the Dashboard widget (there is no error boundary — the exact crash class the 2026-10-20 run fixed for the competition-log localStore) and the success screen; (2) a non-JSON / hand-edited cell makes `JSON.parse` **throw**, failing the entire `checkin:history`/`checkin:latest` handler so Progress and Check-In can load no check-in data at all. In-scope: "corrupted or hand-edited" storage (the app's primary store is this SQLite DB) + backend "missing error handling" + undefined propagation. Tell-tale: `RecentCheckinsWidget` already defends with `c.adjustments?.calories_delta ?? 0` — the "adjustments may be malformed" invariant was recognized but the guard was incomplete (two consumers + all five IPC parses unguarded). **Root cause:** the read seam handed consumers a raw `JSON.parse` result that can throw or lack `.notes`, with no normalization. **Fix (minimum, single seam):** new exported `parseAdjustments(raw)` in `checkinEngine.ts` — never throws (try/catch around `JSON.parse`), always returns a well-formed `Adjustments` (`notes: string[]`, finite `calories_delta`, string `cardio_change`/`training_volume_change`), dropping non-string notes and non-finite deltas; all five `checkinHandlers.ts` parse sites now call it. No UI change; a no-op for every valid app-written row.)

### STEP 0 — Requested changes
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (the only `- [ ]` matches are the format-doc lines 7/11). Bug-hunt run.

### STEP 1 — Regression guard (clean baseline on fresh rebased `master`)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (406 tests, 64 files)
- `npx electron-vite build` → PASS

(`npm ci` with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`. The SETUP `git remote set-url` with the embedded PAT was blocked by the sandbox credential-leak classifier this run; the existing `origin` already authenticates fetch/push through the agent git proxy, so the pull/push worked without it.)

### STEP 2 — Area audited: (c) check-in + Progress + adaptive nutrition
Rotated off the recent clusters — 10-21 (a, nutrition/Diet), 10-20 #2 (f, shows/date/week), 10-20 (e, dashboard/competition widgets), 10-19 #2 (d, onboarding/Settings). Deep-read: `checkinEngine.ts` (Theil–Sen smoothed trend, cadence normalization, all divide/NaN/Infinity seams floored — heavily hardened), `checkinHandlers.ts` (submit / submitMissed / update / history / latest / nextAllowed — weight clamp, duplicate-date + early-checkin guards, retroactive renumber, date-edit renumber all correct), `progressHandlers.ts`, `checkinSchedule.ts` (`getNextCheckinDate` / `computeMissedSlots` — interval≤0 guard, DST-noon parsing), `src/pages/Progress/index.tsx` (projection / measurement-delta / body-comp / consistency math — all guarded), `src/pages/CheckIn/index.tsx` (full: submit, missed-slot fill, locked-screen edit, auto-fill adherence — division floored, validation present), `WeightChart` + `MeasurementsChart`, `CheckinFeedbackWidget` + `RecentCheckinsWidget`, `weeklyRate.ts` / `weeksTracked.ts` / `targetWeight.ts`, `planStore` check-in flow, and the adaptive-nutrition paths in `planHandlers.ts` (`recalculateMacros`, check-in-driven volume/diet recalc). All computation/input surfaces are robustly guarded (the product of ~30 prior hardening runs). The ONE real, reachable defect was the unguarded `adjustments` read seam above (corrupt/default-cell crash) — same corrupt-storage crash class prior runs fixed for `daily_weight_log` and the competition localStore, but never applied to the DB-backed `adjustments` column, and left asymmetric (`RecentCheckinsWidget` already guarded, the other two consumers + the IPC parses did not).

### STEP 3 — Root cause + fix
- **Root cause:** `checkinHandlers.ts` read/returned `adjustments` via raw `JSON.parse` with no normalization; the schema's `DEFAULT '{}'` and any legacy/corrupt/hand-edited cell therefore reach consumers as `{}` (no `.notes`) or make the parse throw.
- **Fix (seam, one normalizer):** `parseAdjustments` in `electron/services/checkinEngine.ts` (exported beside the `Adjustments` interface); the 5 parse sites in `checkinHandlers.ts` (:182/:290/:315/:324/:429) now call it. Idempotent for valid rows; converts a bad cell into an empty-notes / zero-delta Adjustments so the Dashboard, success screen, and history/latest handlers stay up.

### Tests added — `tests/unit/checkinAdjustmentsParse.test.ts` (+7)
Exercises the REAL `checkin:history` / `checkin:latest` handlers against an in-memory `node-sqlite3-wasm` DB with bad cells planted via direct SQL (the hand-edited / schema-default scenario the app's own INSERTs never produce), plus direct coverage of the pure normalizer.
- **Fail-first reproductions (both confirmed red on a temporary revert to raw `JSON.parse`):** `checkin:latest` on a `'{}'` cell → `adjustments.notes` is an array and the consumer's `.notes.map` doesn't throw (was `undefined.map` → crash); `checkin:history` on a non-JSON cell → handler does NOT throw (was `SyntaxError` failing the whole handler).
- **Regression guard:** a valid adjustments cell round-trips unchanged through `checkin:latest`.
- **Normalizer unit tests:** `'{}'` → `notes:[]` / zero delta / `'no change'`; never throws on malformed/non-object/null/undefined/number input; drops non-string notes and non-finite (`Infinity`) deltas; preserves a fully-formed object.

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (413 tests, +7 new, 65 files)
- `npx electron-vite build` → PASS

### Leads for a future run
- `plan:refineDietWithPrompt` (`planHandlers.ts:584`) casts `currentPlan` to `Record<string,unknown>` with **no undefined-guard** before `JSON.parse(currentPlan.meals)` — if the Diet AI chat's refine is reachable with no diet plan yet (needs a Claude key), that's a `undefined.meals` crash. `plan:recalculateMacros` guards this (`if (!currentPlan) throw`); refine does not. Verify reachability (does the Diet page gate the chat behind an existing plan?) in an (a)/(c) run.
- The CheckIn success-screen Show-Day Projection (`src/pages/CheckIn/index.tsx:762`) guards `weeksToShow <= 0` but NOT `NaN` (`NaN <= 0` is false), so a non-finite `weeksToShow` would render literal "NaN". The Progress page's `weeksUntil` already suppresses NaN. Only reachable with a malformed non-null `show_date` (not normally reachable since show_date is validated at the shows-table write seam) — cosmetic/latent.
- Still open (annotation gap, noted by prior runs): `src/pages/Diet/index.tsx:233` `culture_pref` type-only error under `tsconfig.web.json` (outside the root-`tsc` STEP 1 gate).

## Run: 2026-10-21 (BUG FIX — the AI assistant's **settings-change diet regeneration leaves `diet_plans.meal_count` stale and orphaned meal completions counting as "meals eaten"**. `plan:applyAIRequest`'s `regenerateDiet` branch (`electron/ipc/planHandlers.ts:934`) fires when Claude classifies a request as a settings change that sets `regenerateDiet: true` — e.g. *"give me 3 meals a day instead of 6"* → `settingChanges:{meal_count:3}` + `regenerateDiet:true`. The branch rebuilds `meals` via `buildMealsPublic(clampMealCount(updatedUser.meal_count))` (correctly 3 meals), but the follow-up `UPDATE diet_plans` wrote back only `meals` + macros — it **omitted `meal_count`** and **never called `clearOrphanedMealCompletions`**. It was the ONE diet-write path missing both: `plan:generateDiet` (:182/:229), `plan:refineDietWithPrompt` (:605), the `refine_diet` branch (:749), `plan:startupRefresh` (:503), and `plan:regenerateAll` (:333) all persist the new count and purge orphans. Consequences, both in-scope (backend error + DB↔UI desync): (1) `diet_plans.meal_count` stays at the old value (6) while `meals` holds 3 — a stored-vs-actual desync; (2) meal completions are keyed by POSITIONAL `meal_index`, so today/future completions at indexes 3–5 survive the shrink and keep counting — `WeeklyMealView.completedCountForDay` counts ALL completions for a date regardless of index, so the day reads *"6/3 meals logged"* and the progress bar computes `6/3 = 200%` width. Reachable end-to-end whenever a Claude API key is configured and the user asks the Diet/Training AI chat to change their meal or snack count. **Root cause:** the settings-change regen branch was never given the meal_count-persist + orphan-purge guard that every sibling diet-write path carries; a prior run's lead flagged exactly this. **Fix (minimum, mirrors the sibling paths):** compute `rebuiltMealCount = meals.length` (mains + snacks, the canonical value every other path stores), add `meal_count=?` to the UPDATE, and call `clearOrphanedMealCompletions(db, userId, rebuiltMealCount)` right after. No UI change; no other handler touched.)

### STEP 0 — Requested changes
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (all queued items are `- [x]`). Bug-hunt run.

### STEP 1 — Regression guard (clean baseline on fresh rebased `master`)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (404 tests, 63 files)
- `npx electron-vite build` → PASS

(`npm ci` with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`. The repo-level `git remote set-url` with the embedded PAT in SETUP succeeded this run; the existing `origin` already authenticates pushes either way.)

### STEP 2 — Area audited: (a) nutrition engine + Diet flows
Rotated off the last several runs' clusters — 10-20 #2 (f, shows/date/week), 10-20 (e, dashboard/competition-log widgets), 10-19 #2 (d, onboarding/Settings/reset), 10-19 (b, training/session). Deep-read `nutritionEngine.ts` (BMR/TDEE, `getPhaseAwareDeficit`, `buildMeals`/`getMealTemplates` portion+macro math, `clampWeightKg`/`clampMealCount`/`sanitizeCalorieTarget`/`sanitizeMacroGrams`/`MIN_CALORIE_TARGET` — all the divide-by-zero / NaN / Infinity seams are floored and guarded, product of many prior hardening runs) and every Diet write path in `planHandlers.ts` (`generateDiet` AI + rule, `recalculateMacros`, `refineDietWithPrompt`, `applyAIRequest` refine_diet / regenerateDiet / setting-change, `swapMeal`, `reorderMeals`, `selectOffSeasonGoal`, `previewGoalCalories`), plus `mealCompletionHandlers.ts` (`clearOrphanedMealCompletions`) and `WeeklyMealView.tsx` (meal-index keyed completions, progress math). Every diet-write path purges orphaned completions and persists the new meal_count **except** the `applyAIRequest` `regenerateDiet` branch — the one real, reachable defect (a prior run's documented lead). Note: `WeeklyMealView` ignores its `mealCount` prop (iterates `meals`), so the stale column itself is latent there; the user-visible symptom is the inflated "N/M logged" + >100% progress from the un-purged completions.

### STEP 3 — Root cause + fix
- **Root cause:** `applyAIRequest`'s `regenerateDiet` branch overwrote only `meals` + macros, omitting `meal_count` and the `clearOrphanedMealCompletions` call that every sibling diet-write path makes.
- **Fix (seam, reuse existing pattern):** `electron/ipc/planHandlers.ts` — `const rebuiltMealCount = meals.length`; UPDATE now sets `meal_count=?`; `clearOrphanedMealCompletions(db, userId, rebuiltMealCount)` runs after the write. The returned `dietPlan` re-reads the row so the UI sees the corrected count immediately.

### Tests added — `tests/unit/applyAIRequestRegenerateDietOrphans.test.ts` (+2)
Exercises the REAL handler against an in-memory `node-sqlite3-wasm` DB (only `processAIRequest` stubbed; the diet rebuild runs through the real `nutritionEngine`).
- **Fail-first reproduction:** a `settingChanges:{meal_count:3}` + `regenerateDiet:true` request on a 6-meal plan with 6 completions today (+ one at index 5 yesterday) → rebuilt plan has 3 meals, stored `meal_count` becomes 3 (was 6 before the fix — the assertion that failed fail-first), today's completions purged to `[0,1,2]`, yesterday's index-5 completion preserved.
- **Regression guard:** a `regenerateDiet` that does NOT change the count (cooking_time_pref only) → `meal_count` stays 6 and all 6 today completions survive (orphan purge never over-deletes).

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (406 tests, +2 new)
- `npx electron-vite build` → PASS

### Leads for a future run
- Still open (non-debugging annotation gap, noted by prior runs): `src/pages/Diet/index.tsx:233` `culture_pref` type-only error under `tsconfig.web.json` (outside the routine's root-`tsc` STEP 1 gate).
- The Settings "Edit Profile" Show-Date desync (prior note) still routes `users.show_date` directly via `user:update` rather than through the `shows` table — a UI-level change, out of debugging scope, but the clean cross-cutting fix is to route every non-"My Shows" show_date write through the shows table (the AI path was done 10-20 #2).

## Run: 2026-10-20 #2 (BUG FIX — the AI assistant can set a **show date that silently vanishes on the next launch** (data loss) and triggers a **false "your show has passed"** off-season transition. `plan:applyAIRequest` (`electron/ipc/planHandlers.ts`) lets Claude's `settingChanges` carry a `show_date` — its own prompt documents `"my show is in 8 weeks" → settingChanges:{show_date:"<today+56d>"}` — and whitelists `show_date`/`division` in `ALLOWED_COLUMNS`, writing them **straight to the `users` row** with no `shows` row. But shows live in the `shows` table, the single source of truth that `syncPrimaryToNearest` and `plan:startupRefresh` rebuild `users.show_date` from on **every launch** (`userStore.loadUser` → `startupRefresh`). With no matching `shows` row, the next launch's sync finds nothing upcoming → `UPDATE users SET show_date=NULL, division=NULL` (the show date is gone), and because `prevShowDate !== newShowDate` it sets `showTransitioned`/`justWentOffSeason` true → both plans are regenerated to off-season and the user is told *"Your show has passed. Off-season mode…"* even though the show is 8 weeks in the FUTURE. Reachable end-to-end: `plan:applyAIRequest` is wired to the Training/Diet AI chat (`Training/index.tsx:268`, `Diet/index.tsx:280`) whenever a Claude API key is configured. In-scope: backend error + DB↔UI desync + data loss. **Root cause:** the AI path mutates `users.show_date` directly instead of going through the `shows` table every other show mutation (shows:add/update/delete/setPrimary) and the startup sync treat as authoritative. **Fix (minimum, backend-only, mirrors `shows:add`):** new exported `persistProfileShowDate(db, userId, showDate, division?, today?)` in `showHandlers.ts` — upserts one `shows` row for the date (refreshing division; never duplicating; ignoring a malformed/empty date) then calls `syncPrimaryToNearest`; `plan:applyAIRequest` now calls it whenever the AI set a `show_date`, so the date persists through startup exactly like a show added via the My Shows UI. Distinct from the prior `change-agent-report.md` note (the Settings "Edit Profile" `show_date` desync, triggered by later shows add/delete) — same root class, different un-enumerated entry point, and the destructive every-launch wipe + false "show passed" messaging were not previously covered.)

### STEP 0 — Requested changes
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (all queued items are `- [x]`). Bug-hunt run.

### STEP 1 — Regression guard (clean baseline on fresh rebased `master`)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (400 tests, 62 files)
- `npx electron-vite build` → PASS

(`npm ci` with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`. The repo-level `git remote set-url` with the embedded PAT in SETUP succeeded this run; the existing `origin` already authenticates pushes either way.)

### STEP 2 — Area audited: (f) shows/competition + date/week logic
Rotated off the last several runs' clusters — 10-20 (e, dashboard/competition-log widgets), 10-19 #2 (d, onboarding/Settings/reset), 10-19 (b, training/session), 10-18 #2 (a, nutrition/Diet grocery), 10-18 (c/f, check-in write path). Deep-read: `showDates.ts` (`weeksUntilShow`/`localToday` — local-midnight, guarded), `showHandlers.ts` (`syncPrimaryToNearest` / `setPrimaryShow` / add / update / delete / cancelShow — all go through the shows table + regenerate diet, past-show guard present), `checkinSchedule.ts` + `checkinEngine.ts` + `checkinHandlers.ts` (interval/NaN guards, retroactive renumber, duplicate-date rejection all correct), `weeksTracked.ts` / `weeklyRate.ts` / `dates.ts` (`getShowCountdown` isPast, min-span guards), `PeakWeekWidget` / `PrepPaceWidget` / `WeeklyMealView` / `GroceryList` date-range math, `planHandlers.ts` (`startupRefresh` transition logic, AI/rule diet+training regen, `recalculateMacros` self-heal, `refineDietWithPrompt`). Also swept the engines, stores, Progress/Diet/CheckIn/Settings pages and the write-seam sanitizers — all robustly guarded (the product of ~30 prior hardening runs). A parallel independent bug-hunt (second pass over claudeService/planHandlers AI paths, every widget's input/division path, WorkoutSession/Stats, Onboarding steps, charts) corroborated: the one **real, reachable** defect was the AI `show_date` → users-row-only write above. The DST-fragile ms week-start math in several widgets remains cosmetic-only (Monday-based week + Sunday DST transition never lands a wrong Monday — re-verified).

### STEP 3 — Root cause + fix
- **Root cause:** `plan:applyAIRequest` wrote `show_date`/`division` to `users` directly; the shows table (authoritative for every other path and for the every-launch startup sync) never got the row, so the value was non-durable and its disappearance looked like a passed show.
- **Fix (seam, reuse existing pattern):** added `persistProfileShowDate` in `showHandlers.ts` (upsert into `shows` + `syncPrimaryToNearest`, regex-guards the date, refreshes division, no duplicates) and called it from `plan:applyAIRequest` right after the user-row update. `updatedUser` is re-read afterward, so the subsequent training/diet regeneration uses the now-persisted, synced `show_date`. No UI change; no other handler touched.

### Tests added — `tests/unit/aiShowDatePersist.test.ts` (+4)
- **Fail-first reproduction:** a users-only `show_date` write (the old behavior) → `syncPrimaryToNearest` nulls it (documents the data loss + the `showTransitioned` trigger).
- **Fix:** `persistProfileShowDate(FUTURE, 'Classic Physique')` → date + division survive a following startup sync; exactly one `shows` row created.
- **Idempotent:** re-sending the same date updates division in place, never duplicates the show.
- **Hardening:** a malformed/empty AI date is ignored (no `shows` row, no corruption).

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (404 tests, +4 new)
- `npx electron-vite build` → PASS

### Leads for a future run
- **AI `regenerateDiet` leaves `diet_plans.meal_count` stale (latent desync, not a crash).** `plan:applyAIRequest`'s `regenerateDiet` branch rebuilds `meals` via `buildMealsPublic(clampMealCount(meal_count))` and updates meals/calories/macros, but — unlike every other diet-write path — does NOT persist the `meal_count` column and does NOT call `clearOrphanedMealCompletions`. Consumers guard (`WeeklyMealView` iterates `meals`; macro widgets use `meals[idx]?. ?? 0`), so no crash — only a stale stored count and slightly inflated "meals eaten" if the count shrank. A one-line fix a future (a)/(c) run could fold in.
- Still open (annotation gap, noted by prior runs): `src/pages/Diet/index.tsx:233` `culture_pref` type-only error under `tsconfig.web.json` (outside the root-`tsc` STEP 1 gate). Also the Settings "Edit Profile" Show-Date desync (prior note) shares this run's root class; the clean cross-cutting fix is to route every non-"My Shows" `show_date` write through the shows table (this run did so for the AI path).

---

## Run: 2026-10-20 (BUG FIX — the four **competition-only widgets crash the whole dashboard on a corrupt log ENTRY**. Posing / Sleep / Condition / Supplement widgets persist their logs through the shared `localStore` (`src/components/widgets/localStore.ts`), whose corruption guard only checks the **top-level** shape — array vs non-array. A valid JSON array that holds a malformed ENTRY — a `null` (`posing_log = '[null]'`), or an object missing a required field (a sleep entry with no `hours`, a condition entry with no `tags`, a supplement-day with no `taken`) — slips straight past that guard, and the widget then does `posingLog.filter(e => e.date …)` / `todayEntry.tags.includes(…)` / `entry.taken.includes(…)` on it → `TypeError: Cannot read properties of null/undefined`. There is **no error boundary**, so one bad entry takes down the entire Dashboard tab, not just the widget. This is the SAME class of defect a prior run fixed for `daily_weight_log` via `parseDailyWeightLog` (whose comment explicitly calls out `[null]` crashing `.find(e => e.date)`), but the shared competition-log store was never given per-entry validation; the existing `localStoreCorrupted.test.tsx` only exercised top-level corruption, hiding the gap. In-scope: "corrupted or hand-edited localStorage" + NaN/undefined propagation.)

### STEP 0 — Requested changes
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (all queued items are `- [x]`). Bug-hunt run.

### STEP 1 — Regression guard (clean baseline on fresh rebased `master`)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (398 tests, 62 files)
- `npx electron-vite build` → PASS

(`npm ci` with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`. The repo-level `git remote set-url` with the embedded PAT in SETUP is accepted but the pre-existing `origin` already authenticates pushes.)

### STEP 2 — Area audited: (e) widgets (dashboard + Training/Nutrition tabs) + localStorage stores
Rotated off the last several runs' clusters — 10-19 #2 (d, onboarding/Settings/reset), 10-19 (b, training/session), 10-18 #2 (a, nutrition/Diet grocery), 10-18 (c/f, check-in write path), 10-17 #2 (c, adaptive), 10-16 (e, dashboard widgets). Deep-read every widget in `src/components/widgets/` (QuickStats / TodaysMacros / NextMeal / DailyWeighIn / PrepPace / PeakWeek / WeeklyScorecard / TrainingVolume / MuscleCoverage / WeeklyVolume / SessionsWeek / CheckinFeedback / Cardio / Water / Posing / Sleep / Supplement / Condition), the store machinery (`useWidgets`, `createWidgetStore`, `localStore`, `competitionLogs`, `useWaterLog`, `cardioStore`), and the reorder/gating zones (`WidgetZone`, `TabWidgetZone`, `TabWidgetControls`, `tabWidgets`). Divisions are `> 0`-guarded, percentages `Math.min(100,…)`-capped, `createWidgetStore`/`useWidgets` drop unknown ids + de-dupe, and `DailyWeighInWidget` already validates every entry via `parseDailyWeightLog`. The one **real, reachable** defect was the unvalidated-entry gap in the shared `localStore` used by the four competition logs. (Noted, not fixed — out of scope: the `Date.now() - daysFromMon*86400000` week-start math in Posing/Cardio/TrainingVolume/MuscleCoverage widgets is DST-fragile vs the `setDate`-based form in SessionsWeek/WeeklyVolume, but with US DST transitions on Sundays and a Monday-based week it does not produce a wrong Monday in practice — cosmetic at most, deferred.)

### STEP 3 — Root cause + fix (minimum change, at the data seam — reuse the existing pattern)
- **Root cause:** `createLocalStore.read()` validated only the top-level array/non-array shape, then returned the parsed value verbatim. Object-array logs (posing/sleep/condition/supplement) therefore handed corrupt entries straight to the widgets.
- **Fix (seam — authoritative):** added an optional third `sanitize?: (parsed: T) => T` argument to `createLocalStore`, applied right after the top-level shape check (in both `read()` and, implicitly, every snapshot). In `competitionLogs.ts` each object-array store now passes an entry validator that `.filter()`s to well-formed entries (`validPosing` / `validSleep` / `validCondition` / `validSupplementDay`, each requiring a string `date` plus its own finite number / string-array fields); `supplement_list` filters to string members. Corrupt entries are dropped so widgets always see the declared shape; well-formed logs pass through unchanged. No widget code changed — the guard lives once, at the boundary.

### Tests added — `tests/unit/localStoreCorrupted.test.tsx` (+2, now 5)
- **Corrupt entries inside a valid array** (`[null]` posing, `hours`-less sleep, `tags`-less condition, `taken`-less supplement-day, mixed-junk list) → all four widgets render without throwing; the snapshots are the empty array (list keeps its one valid `"Creatine"`). **Fail-first confirmed:** before the fix each of the four threw `TypeError: Cannot read properties of null/undefined` during render.
- **Regression guard:** well-formed entries alongside bad ones → the valid ones survive byte-identical, only the malformed entry is dropped (sanitizer never over-rejects real logs).

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (400 tests, +2 new)
- `npx electron-vite build` → PASS

### Lead for a future run
Still open (non-debugging annotation gap, noted by prior runs): the `src/pages/Diet/index.tsx:233` `culture_pref` type-only error under `tsconfig.web.json` (outside the routine's root-`tsc` STEP 1 gate). Also the DST week-start inconsistency noted above (Posing/Cardio/TrainingVolume/MuscleCoverage use ms arithmetic; SessionsWeek/WeeklyVolume use `setDate`) — harmless today but a one-line consistency fix a future (e)/(f) run could unify.

---

## Run: 2026-10-19 #2 (BUG FIX — the onboarding **ft/in height seed produced an impossible "5 ft 12 in"** for a range of metric heights, and that bad inches value could then **corrupt the stored height**. When the user enters height in cm and toggles the Personal step's unit switch to "ft / in", `Step1Personal.handleHeightUnit` seeded the two inputs with `feet = Math.floor(cm / 30.48)` and `inches = Math.round((cm % 30.48) / 2.54)` computed INDEPENDENTLY. Those two roundings disagree near a foot boundary: 182 cm → feet 5, inches `round(29.6/2.54)=round(11.65)=12` → the UI shows "5 ft 12 in". The project already knew this exact failure — `units.ts:displayHeight` carries a comment and a dedicated test for the "5'12\"" case and round-then-splits correctly — but the onboarding seed used the buggy independent-rounding pattern. Worse than a cosmetic glitch: the seeded `ftInches` state is NOT clamped (only the inches input's own onChange clamps 0–11), and `handleFeetChange` reads that stale state, so editing the feet field while inches sits at 12 computes `cm = feet*30.48 + 12*2.54` — e.g. bumping to 6 ft yields 213.4 cm, a corrupted height that passes `validateStep` (< 250) and persists into the profile → BMR/TDEE/macro math.)

### STEP 0 — Requested changes
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (all queued items are `- [x]`). Bug-hunt run.

### STEP 1 — Regression guard (clean baseline on fresh rebased `master`)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (395 tests, 62 files)
- `npx electron-vite build` → PASS

(`npm ci` with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`. The repo-level `git remote set-url` with an embedded PAT in the SETUP block is refused by the harness credential filter; the existing `origin` already authenticates pushes, so setup proceeded without it.)

### STEP 2 — Area audited: (d) onboarding + Settings + reset + data lifecycle
Rotated off the last several runs' clusters — 10-19 (b, training/session), 10-18 #2 (a, nutrition/Diet grocery), 10-18 (c/f, check-in write path), 10-17 #2 (c, adaptive), 10-17 (b, Settings training), 10-16 (e, dashboard widgets). Deep-read: `userHandlers.ts` + `userSanitize.ts` (every numeric profile field clamped at the `user:update` seam; `user:create` clamps meal/snack/bodyfat and is otherwise fed only by onboarding's `validateStep`), `settingsHandlers.ts` (global key/value, no user scope), `resetData.ts` + `userHandlers:resetAll` (weigh-in snapshot → `mergeWeighIns` fold, preserved-key filter — all guarded; **verified empirically that `node-sqlite3-wasm` defaults `PRAGMA foreign_keys=ON`**, so the reset's `DELETE FROM users` cascade is real despite no explicit pragma in `db.ts`), `schema.ts`/`db.ts` migrations, `DailyWeighInWidget`/`useWaterLog`/`water.ts`/`WaterWidget` (parse/bounds/clamps present), `showHandlers.ts` (syncPrimaryToNearest + diet-regen on every show-context change, past-show guard), `checkinSchedule.ts` (infinite-loop/`interval<=0` guard), Onboarding steps + `Settings` edit-profile (meal/snack steppers clamped, imperial weight/height conversions). The one **real, reachable** defect was the ft/in height seed in `Step1Personal`.

### STEP 3 — Root cause + fix (minimum change, reuse the existing correct pattern)
- **Root cause:** `Step1Personal.handleHeightUnit` split cm→ft/in with two independent roundings (`floor` feet + `round` inch-remainder), which can emit inches = 12. `displayHeight` already solved this by rounding to whole inches FIRST then splitting, but the logic was inlined there and not shared.
- **Fix:** extracted a pure helper `cmToFeetInches(cm) → { feet, inches }` in `src/utils/units.ts` (round-to-inches-first, then `floor(/12)` + `%12`), routed `displayHeight` through it (output byte-identical — its existing tests still pass), and used it in `Step1Personal.handleHeightUnit`. Now 182 cm seeds "6 ft 0 in" and the feet-edit corruption path can no longer see a 12 in the inches state.

### Tests added — `tests/unit/units.test.ts` (+3 for `cmToFeetInches`)
- `152.4 → {5,0}` (exact foot); `182 → {6,0}` and `181.9 → {6,0}` (**carry case — the bug**; old independent-rounding gave `{5,12}`, verified by direct arithmetic); `170 → {5,7}` (typical, no carry). `displayHeight`'s pre-existing "5'12\"" regression test still passes through the shared helper.

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (398 tests, +3 new)
- `npx electron-vite build` → PASS

### Leads for a future run
- **Profile "Show Date" desync (noted, not fixed — needs an owner call).** The Settings "Edit Profile" form has Goal/Division/**Show Date** fields that write `users.show_date` directly via `user:update`, bypassing the `shows` table. "Save & Regenerate" does rebuild the diet from the new `users.show_date` (correct macros), but (a) the `shows` list is left inconsistent, and (b) the next `shows` add/delete/setPrimary runs `syncPrimaryToNearest`, which silently overwrites the profile-edited `show_date` from the shows table. The clean fix is architectural (route the field through the shows table, or drop it in favor of the "My Shows" section) — a UI change, out of this routine's debugging scope.
- Still open (non-debugging annotation gap, noted by prior runs): the `src/pages/Diet/index.tsx:233` `culture_pref` type-only error under `tsconfig.web.json` (outside the root-`tsc` STEP 1 gate).

---

## Run: 2026-10-19 (BUG FIX — a training session could be saved with **ZERO exercises** via the plan editor, producing a dead, uncompletable workout. `SessionEditor` lets the user remove every exercise (`removeExercise` has no minimum guard) and tap Save — the Save button was only disabled while saving — and `plan:updateSession` persisted the empty array verbatim. The engine (`generateTrainingPlan`) and both AI paths (`planHandlers:65`, `showHandlers:135`) already guarantee every session carries ≥1 exercise, so an empty session is an invariant violation reachable ONLY through this editor seam. A persisted empty session renders an enabled "▶ Start Workout" button that opens a `WorkoutSession` which can NEVER be completed — `canComplete` is always false with no sets — and whose progress bar divides by zero (`doneCount / session.exercises.length` → `0/0` → `width: "NaN%"`); the only escape is Abandon.)

### STEP 0 — Requested changes
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (all queued items are `- [x]`). Bug-hunt run.

### STEP 1 — Regression guard (clean baseline on fresh rebased `master`)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (392 tests, 61 files)
- `npx electron-vite build` → PASS

(`npm ci` with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`. The repo-level `git remote set-url` with an embedded PAT in the SETUP block is refused by the harness credential filter; the existing `origin` already authenticates pushes, so setup proceeded without it.)

### STEP 2 — Area audited: (b) training engine + workout/session flows (+ data-lifecycle seams)
Rotated off the last five runs' clusters — 10-18 #2 (a, nutrition/Diet grocery), 10-18 (c/f, check-in write path), 10-17 #2 (c, adaptive `weightTrendPct`), 10-17 (b, Settings training clamps), 10-16 (e, dashboard widgets). Deep-read `trainingEngine.ts` (freq/exPerSession/setsPerEx/maxSets non-finite guards, empty-session guards via `rotateOne`/`.filter(Boolean)`, phase/rep/set math — all present and correct), `workoutHandlers.ts` (`sanitizeReps`/`sanitizeWeightKg` at every write seam), `WorkoutSession.tsx` + `WorkoutStats.tsx` + `WorkoutLogEditor.tsx` (clampSetCount, parseRepMidpoint, detectNewPRs, all divisions guarded), `planHandlers.ts` training paths (AI sessions filtered to `exercises.length > 0`; `plan:recalculateMacros` divisor floored), `checkinEngine.ts`/`checkinHandlers.ts`, `showHandlers.ts`/`showDates.ts`, `userHandlers.ts`/`userSanitize.ts`, `schema.ts`/`db.ts`, Onboarding/Settings validation, and Progress/Diet (water/refeed/intake) — all remarkably well-guarded. The one **real, reachable, still-open** defect was the editor's empty-session save path.

### STEP 3 — Root cause + fix (minimum change, at the write seam + UI feedback)
- **Root cause:** `plan:updateSession` (`electron/ipc/planHandlers.ts`) wrote `exercises` to the row with no validation, and `SessionEditor`'s Save button (`src/pages/Training/SessionEditor.tsx`) was disabled only while `saving`. So removing all exercises and tapping Save persisted `[]`.
- **Fix (backend seam — authoritative):** `plan:updateSession` now throws `EMPTY_SESSION` when `!Array.isArray(exercises) || exercises.length === 0`, leaving the previously-stored exercises untouched. This mirrors the invariant the engine and AI paths already enforce, so NO entry point can persist an empty session.
- **Fix (frontend — feedback):** the Save button is disabled (with a `title` hint) when `exercises.length === 0`, and `handleSave` early-returns in that state, so the user sees the existing "No exercises. Tap + Add Exercise…" empty state instead of a silent backend rejection. Valid (≥1 exercise) saves are byte-for-byte unchanged.

### Tests added — `tests/unit/updateSessionEmpty.test.ts` (3 tests, REAL `plan:updateSession` vs in-memory `node-sqlite3-wasm`)
- Non-empty edit (2 exercises) → persists both (normal path unchanged).
- Empty array `[]` → **throws** and the prior stored exercise survives (not wiped). **Fail-first confirmed:** before the fix the handler persisted `[]` and did not throw.
- Non-array payload (`null`, renderer-bug guard) → throws, prior exercise intact (also fail-first: previously stored `null`).

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (395 tests, +3 new)
- `npx electron-vite build` → PASS

### Lead for a future run
Still open (non-debugging annotation gap, noted by prior runs): the `src/pages/Diet/index.tsx:233` `culture_pref` type-only error under `tsconfig.web.json` (outside the routine's root-`tsc` STEP 1 gate). Also the `multiplyQty` dead-regex simplification lead from 10-18 #2 remains (cosmetic/refactor, out of debugging scope).

---

## Run: 2026-10-18 #2 (BUG FIX — the weekly **grocery list over/under-counted a fixed-count food** that appears in more than one meal with DIFFERENT counts. `buildGroceryItems` reused the FIRST-seen `xN` for every occurrence of a food, so Pre-Workout "Rice Cakes x3" + Afternoon Snack "Rice Cakes x2" rendered `Rice Cakes x42/wk` (3 × 2 meals × 7) instead of the correct `x35/wk` ((3+2) × 7) — a plan→UI shopping-quantity mismatch reachable with a plain 4-meal + 2-snack omnivore config, and worse for vegan plans (3 snack slots carry rice cakes → x63/wk vs correct x49/wk).)

### STEP 0 — Requested changes
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (all queued items are `- [x]`). Bug-hunt run.

### STEP 1 — Regression guard (clean baseline on fresh rebased `master`)
- `npx tsc --noEmit` (root, the routine's gate) → PASS (clean)
- `npm test` → PASS (386 tests, 60 files)
- `npx electron-vite build` → PASS

(`npm ci` with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`. The repo-level `git remote set-url` with an embedded PAT in the SETUP block is refused by the harness credential filter; the existing `origin` already authenticates pushes, so setup proceeded without it.)

### STEP 2 — Area audited: (a) nutrition engine + Diet flows
Rotated off the last four runs' clusters — 10-18 (c/f check-in write path), 10-17 #2 (c adaptive nutrition), 10-17 (b Settings training), 10-16 (e dashboard widgets). Deep-read the nutrition engine (`generateNutritionPlan`/`buildMeals`/`getMealTemplates`/`calcPortionStr`/`applyRefeedToMeals` — calorie floor, weight clamp, snack-cal cap, non-finite meal/snack-count guards all present and correct), every diet IPC handler (`plan:generateDiet`, `recalculateMacros`, `refineDietWithPrompt`, `applyAIRequest`, `swapMeal`, `reorderMeals` — AI-output sanitizers, divisor floors, index-permutation completion remap, orphan purge all guarded), and the Diet page/`WeeklyMealView`/`swapAlternatives`/`recipeSteps`/`refeed` (every division and localStorage read is `isNaN`/`> 0`/`?.`-guarded, water target clamped `4..20`). The one **real, reachable** defect was in `GroceryList.buildGroceryItems`.

### STEP 3 — Root cause + fix (minimum change, `src/pages/Diet/GroceryList.tsx`)
- **Root cause:** for non-gram (fixed-count) foods the accumulator kept only the first-seen food string and a plain `count` of occurrences, then rendered `multiplyQty(food, count * 7)` — which multiplies the first-seen food's `xN` by the occurrence count. When two meals carry the SAME food with DIFFERENT `xN` (Rice Cakes x3 pre-workout vs x2 snack), that treats both as `x3` → `x42/wk`. Equal counts and plain/`ml` foods happened to come out right, which hid the bug.
- **Fix:** accumulate `fixedUnitsPerDay` (sum of each occurrence's `xN`, or `1` for plain/`ml` notation) and an `anyFixedCount` flag. Render a fixed-count food as `${baseName} x${fixedUnitsPerDay * 7}/wk` (the true per-day sum × 7); plain/`ml` foods still go through `multiplyQty(food, count * 7)` unchanged, and gram foods still sum `totalGPerDay * 7`. Exported `buildGroceryItems` so it is unit-testable (was module-private).
- Single-occurrence fixed foods, equal-count foods, plain names, `ml` notation, and gram foods all produce byte-identical output to before — only the differing-count case changes (and only toward the correct value).

### Tests added — `tests/unit/groceryListQty.test.ts` (6 tests)
- Differing counts (`x3` + `x2`) → `Rice Cakes x35/wk` (**fail-first confirmed:** old code returned `x42/wk`).
- Equal counts (`x2` + `x2`) → `x28/wk`; single `x3` → `x21/wk`; plain `Banana` × 3 meals → `×21/wk`; gram foods `200g`+`150g` → `(2450g/wk)`; `(200ml)` → `Soy Milk (200ml) ×7/wk`. All five regression-guard cases pass on both old and new code, proving the fix is scoped to the bug.

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (392 tests, +6 new)
- `npx electron-vite build` → PASS

### Lead for a future run
`multiplyQty`'s first regex (`/\((\d+)\s*g\)/`) is now effectively dead (gram foods never reach it — they take the `totalGPerDay` branch; fixed foods take the new `xN` branch), and its `xN` branch is only reached via the plain/`ml` path where it never matches. Harmless, but a future (a) run could simplify `multiplyQty` down to the plain-name `×N/wk` case it actually still serves. Also still open (non-debugging annotation gap, noted by prior runs): the `src/pages/Diet/index.tsx:233` `culture_pref` type-only error under `tsconfig.web.json`.

---

## Run: 2026-10-18 (BUG FIX — the STORED check-in weight was **unbounded at all three write seams**, so a fat-fingered extreme persisted verbatim into `weekly_checkins.weight_kg` — the value the Progress "Current Weight" tile + weight chart render directly and the smoothed weight trend folds in raw. The Check-In page's `toKg` rejects only `<= 0` (no upper bound), so a typed `850` — meant `85.0`, or an lbs value typed into a kg field — stored an 850 kg row that spikes the Progress chart and whipsaws the trend/calorie adaptation. The 2026-07-30 run bounded the MACRO derivation via `clampWeightKg` and **explicitly flagged this write-boundary gap as a lead for a future run**: "The stored check-in weight itself is still unbounded … feeds the raw trend/projection … A future (c)/(d) run could clamp the check-in weight at its input/write boundary (30–300, mirroring `clampWeightKgField`)." This run closes that gap.)

### STEP 0 — Requested changes
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (all queued items are `- [x]`). Bug-hunt run.

### STEP 1 — Regression guard (clean baseline on fresh rebased `master`)
- `npx tsc --noEmit` (root, the routine's gate) → PASS (clean)
- `npm test` → PASS (378 tests, 59 files)
- `npx electron-vite build` → PASS

(`npm ci` with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`.) **Note (not this run's fix):** `npx tsc -p tsconfig.web.json` surfaces one pre-existing, type-only error — `src/pages/Diet/index.tsx:233` passes `prefsCuisine` (`useState<string>`) into `updateUser`'s `culture_pref` union field. It has no runtime consequence (the value only ever holds a valid cuisine option, and an unknown culture resolves to `'any'` in the engine), predates this run (the `prefsCuisine` state dates to 2026-07-13), and is outside the routine's STEP 1 gate (root `tsc`). Left as a non-debugging annotation gap, recorded here for a future run to tidy.

### STEP 2 — Area audited: (c)/(f) check-in write path + show/date logic
Rotated off the last four runs' clusters — 10-17 #2 (c, adaptive `weightTrendPct`), 10-17 (b, Settings training clamps), 10-16 #2 and 10-16 (e, dashboard widgets). Deep-read `showHandlers.ts` (`syncPrimaryToNearest`/`setPrimaryShow`/add/update/delete/cancel — diet regen on every show-context change all present and correct), `showDates.ts` (`weeksUntilShow`/`localToday` — local-midnight math, no drift), `dates.ts` (`getShowCountdown` — `isPast` vs clamped-0 handled), and the `checkinHandlers.ts` write path (duplicate-day guard, week_number renumber-on-date-edit, non-finite→null map — all guarded). The Diet page's water/refeed/cardio localStorage reads and intake-bar divisions are all `isNaN`/`> 0` guarded. The one **real, reachable, still-open** defect was the 07-30 lead: the stored check-in weight is unbounded.

### STEP 3 — Root cause + fix (minimum change, at the write seam)
- **Root cause:** the Check-In UI bounds weight only at `> 0`, and the three backend write seams (`checkin:submit`, `checkin:submitMissed`, `checkin:update`) stored `data.weight_kg` verbatim (`...data` spread / the update's allowed-field map). `clampWeightKg` bounded only the macro math, not the stored/charted/trended value.
- **Fix:** new pure helper `clampCheckinWeightKg(value)` (`electron/services/checkinEngine.ts`) → clamps a finite positive weight to the app's canonical **30–300 kg** range (same bounds as `clampWeightKgField` and Onboarding/Settings `validateStep`), returning `null` for non-finite/`<= 0` so the caller rejects it (`weekly_checkins.weight_kg` is `NOT NULL`; the UI already blocks that case). Applied once per handler and used for BOTH the stored row and the adjustment-math input so they agree:
  - `checkin:submit` (`checkinHandlers.ts`) — clamp before the insert's `namedParams` and `calculateAdjustments`; the macro recalc now derives from the clamped weight.
  - `checkin:submitMissed` — same clamp before its insert + adjustments.
  - `checkin:update` — clamp only when the edit sets a finite weight (`editedWeightKg`); substituted into both the allowed-field update map and `calculateAdjustments`; a non-weight edit is unchanged.
- A legacy/pre-existing out-of-range row is unaffected (no migration — mirrors how `clampWeightKgField` guards only new writes); the fix prevents future poisoning. Plausible weigh-ins are byte-for-byte unchanged.

### Tests added — `tests/unit/checkinWeightClamp.test.ts` (8 tests)
- `clampCheckinWeightKg` pure helper: `850`/`301`→`300`; `5`/`29`→`30` (floor); `85`/`120.5` pass through; `0`/`-10`/`NaN`/`Infinity`/`'abc'`→`null`.
- REAL handlers vs in-memory `node-sqlite3-wasm` DB: `checkin:submit`, `checkin:submitMissed`, and `checkin:update` each clamp a stored `850` → `300`; plausible `92.5` stored unchanged; a `0` weigh-in throws `INVALID_WEIGHT`.
- **Fail-first confirmed:** reverting the three seam clamps made the three handler assertions fail (`expected [ 850 ] to deeply equal [ 300 ]`); all pass with the fix.

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (386 tests, +8 new)
- `npx electron-vite build` → PASS

### Lead for a future run
The 07-30 lead is now fully closed on the weight write seams. One tidy-up remains (optional, non-debugging): the `src/pages/Diet/index.tsx:233` `culture_pref` type-only error under `tsconfig.web.json` (narrow `prefsCuisine`'s state type to the `culture_pref` union, or cast at the call site).

---

## Run: 2026-10-17 #2 (BUG FIX — adaptive-nutrition `weightTrendPct` was a **2-point endpoint slope masquerading as a smoothed multi-check-in trend**: it read ONLY the newest and oldest weigh-ins in the window and ignored every intermediate prior, so a single noisy weigh-in on either endpoint — today's water/sodium day, or a dehydrated-low morning — whipsawed the stored calorie target the wrong way, the exact failure its name and docstring promised to prevent. This is the finding the previous run surfaced and DEFERRED in area (c).)

### STEP 0 — Requested changes
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (all 13 checked
off). Proceeded to the bug hunt.

### STEP 1 — Regression guard
On a clean pull of `master` (`npm ci` with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`):
- `npx tsc -p tsconfig.web.json` / `-p tsconfig.node.json` → the **two
  PRE-EXISTING, type-only** errors every prior run documents and defers —
  `src/pages/Diet/index.tsx:233` (cuisine `string`→union, runtime-safe) and
  `electron/ipc/showHandlers.ts:332` (`unknown`→`JSValue`). Both predate this run
  and live in files this fix does not touch. (Root `tsconfig.json` is `files:[]` +
  solution `references`, so bare `tsc --noEmit` is a known vacuous gate.)
- `npm test` → PASS (376 tests, 59 files)
- `npx electron-vite build` → PASS

### STEP 2 — Area audited: (c) check-in + Progress + adaptive nutrition
Rotated off last run's area (b) training. Took the real, distinct correctness bug
the previous run documented at the bottom of its entry (`weightTrendPct`,
`electron/services/checkinEngine.ts`) and confirmed it from source before fixing.

### STEP 3 — Root cause & fix
`weightTrendPct` is named/documented as a "smoothed multi-check-in weight trend …
so a single noisy weigh-in can't whipsaw the calorie target," but the body was:

```
const oldest = priors[priors.length - 1]
const weeks = weeksBetweenDates(oldest.check_in_date, currentDate) ?? priors.length
const change = (currentWeight - oldest.weight_kg) / weeks   // only 2 points read
```

The up-to-3 intermediate priors are read ONLY to pick the oldest anchor + count
the intervals; their **weights are never used**. So it is a 2-point endpoint slope
and is maximally sensitive to noise on either endpoint — precisely the whipsaw it
claims to prevent. (An "average of consecutive per-interval deltas" would be no
better: it telescopes to `(newest − oldest)/span` and also ignores the interior.)

**Reachable, normal-data trigger** (`calculateAdjustments` cut/recomp branch,
`checkinEngine.ts:109-111`): an athlete cutting cleanly `83.0→82.6→82.3→82.0` whose
today's weigh-in is a routine +2 kg water day (84.0) → endpoint reads
`(84.0−83.0)/4wk ≈ +0.30 %/wk` → engine fires **"stalling" −100 kcal**. The
symmetric dehydrated-low endpoint (e.g. 77.0) reads `≈ −1.8 %/wk` → wrongly
**+150 kcal**. The bad `calories_delta` then persists into `diet_plans`
(`checkinHandlers.ts`), so one off-day weigh-in permanently nudges stored
calorie/macro targets. No crash/NaN — purely a logic defect.

**Fix (minimum correct change, `checkinEngine.ts:64-124`):** replaced the endpoint
slope with a **Theil–Sen median slope** — the median of the per-week slope between
every pair of points in the window (oldest priors → current). The median of all
pairwise slopes reads every point and is robust to a single outlier on ANY slot
(newest, oldest, or interior), so one off day can't drive the signal. Kept the
existing cadence normalization (real weeks-from-anchor when every point has a
parseable strictly-later date; interval-index fallback otherwise — unchanged
legacy behavior for weekly users). Added a `dx <= 0` guard that skips same-day
pairs, so a duplicate / double-submitted same-day weigh-in can't divide by zero →
Infinity (an in-SCOPE robustness win). `< 2` priors still returns `null` →
single-week fallback, unchanged for early check-ins.

### Tests
`tests/unit/checkinEngine.test.ts` — 2 new failing-first cases in the
`multi-check-in weight trend (adaptive)` block: a clean cut + one-off water spike
on today's slot must read **on-track (Δ0)** not "stalling −100"; a clean maintain +
one-off dehydration low on today's slot must **not** fire "too fast +150". Both
FAIL against the old endpoint code (−100 / +150) and PASS after the fix. The 3
pre-existing trend tests still pass — they placed their noise on the most-recent /
interior slot the old formula happened to ignore (false confidence); the median
handles those identically.

### STEP 4 — Verification (all PASS)
- `npx tsc -p tsconfig.node.json` → no NEW errors (only the pre-existing
  `showHandlers.ts:332` documented above; my file is clean)
- `npm test` → PASS (378 tests, +2 new)
- `npx electron-vite build` → PASS

### Files changed
- `electron/services/checkinEngine.ts` — `weightTrendPct` endpoint slope → Theil–Sen median (all-points, outlier-robust) + same-day `dx<=0` guard + accurate docstring.
- `tests/unit/checkinEngine.test.ts` — 2 new failing-first tests.
- `change-agent-report.md` — this entry.

---

## Run: 2026-10-17 (BUG FIX — the Settings "Edit profile" save path persists **`exercises_per_session` and `sets_per_exercise` unclamped**, so a typed extreme (e.g. "999") "Save & regenerate"s a training plan with **~1000 sets per exercise and dozens of exercises per session** — a nonsensical plan the Training tab renders verbatim while the live WorkoutSession silently clamps each exercise to 1–20, a DB↔UI desync. This is the exact hole the 2026-08-04 `training_frequency` fix closed, left open on its two sibling training fields.)

### STEP 0 — Requested changes
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (all 13 checked
off). Proceeded to the bug hunt.

### STEP 1 — Regression guard
On a clean pull of `master` (`npm ci` with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`):
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (374 tests, 59 files)
- `npx electron-vite build` → PASS

No regressions in the specified STEP 1 gate. (Observation, not this run's fix:
the root `tsconfig.json` has `files: []` + solution `references`, so bare
`tsc --noEmit` type-checks nothing — a known vacuous gate noted in the 2026-08-01
#2 run. Running the per-project checks surfaces **two PRE-EXISTING, type-only**
errors unrelated to this fix — `src/pages/Diet/index.tsx:233` (`prefsCuisine` is
`useState<string>` where `culture_pref` wants a union; the cuisine picker only
emits valid union values, so it is runtime-safe) and
`electron/ipc/showHandlers.ts:332` (an `unknown` binding type). Both predate this
run and live in files this fix does not touch; left for a dedicated run under the
one-fix-per-run rule.)

### STEP 2 — Area audited: (b) training engine + workout/session flows
Rotated off the last two runs' dashboard-widget focus (e). Traced the training
engine (`trainingEngine.ts`), workout IPC handlers (`workoutHandlers.ts`), the
live `WorkoutSession` / `WorkoutStats` render paths, the Settings profile-save
seam (`userSanitize.ts`), and `showHandlers.ts`. Most SCOPE paths were already
hardened by prior runs (set-count clamp, reps/weight write-seam clamp, freq/
exercises/sets `<= 0`-&-non-finite guards in `generateTrainingPlan`, PR/rep-range
NaN guards). The one unguarded reachable seam was the Settings → `user:update`
write path for `exercises_per_session` / `sets_per_exercise`.

### STEP 3 — Root cause & fix
`sanitizeUserUpdate` (`electron/ipc/userSanitize.ts`) clamps `training_frequency`,
`meal_count`, `snack_count`, `body_fat_pct`, `age`, `height_cm`, `weight_kg` — but
**NOT** `exercises_per_session` or `sets_per_exercise`. The Settings "Edit profile"
number inputs (`src/pages/Settings/index.tsx:429,431` — exercises `min=3 max=12`,
sets `min=2 max=8`) only bound the spinner arrows; a *typed* value like `999`
flows through `parseInt` → `user:update` → `sanitizeUserUpdate` unclamped and
persists (schema default is 6/4; onboarding never sets these, so Settings is the
sole entry point).

`generateTrainingPlan` then honors the stored value with **no upper bound**:
`getSets()` returns `userDefault` sets for isolations and `userDefault + 1` for
compounds (a cap applies only when `max_sets_per_exercise` is set, which the
rule-based path never sets), and the split builders request
`exercises_per_session` exercises per muscle group. Reproduced directly:
`generateTrainingPlan({ sets_per_exercise: 999, exercises_per_session: 999, … })`
→ **max 1000 sets in an exercise, 33 exercises in the first session, 116 total.**
"Save & regenerate" stores that plan; the Training tab renders it verbatim
(`src/pages/Training/index.tsx:807` — `{ex.sets} × {ex.reps} @ RIR {ex.rir}` →
"1000 × 8-12 @ RIR 2") while the live `WorkoutSession` clamps each exercise to
`clampSetCount`'s 1–20 — a nonsensical plan and a DB↔UI desync.

**Fix (minimum, at the write seam — mirrors `clampTrainingFrequency`):** added
`clampExercisesPerSession` (3–12) and `clampSetsPerExercise` (2–8) to
`userSanitize.ts` and wired both into `sanitizeUserUpdate`. Out-of-range typed
values now clamp to the Settings ranges; a cleared field (NaN) still returns
`undefined` and is dropped so the stored value is preserved (unchanged behavior).
In-range values pass through untouched.

### Tests
`tests/unit/userSanitize.test.ts` — added two cases: clamps `999 → 12`/`8`,
`0/-5 → 3`/`2`, rounds fractional; leaves in-range 6/4 untouched. Confirmed
failing-first (reverting the fix → 1 failed), passing after.

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (376 tests, +2 new)
- `npx electron-vite build` → PASS

### Files changed
- `electron/ipc/userSanitize.ts` — two new clamp helpers + wired into `sanitizeUserUpdate`.
- `tests/unit/userSanitize.test.ts` — 2 new tests.
- `change-agent-report.md` — this entry.

### Also found (DEFERRED to a future run — area (c), NOT fixed this run)
While surveying the check-in / adaptive-nutrition path in parallel, a **real,
distinct correctness bug** surfaced in `weightTrendPct`
(`electron/services/checkinEngine.ts:71-93`, core at **89-92**). Recorded here for
continuity since runs are memoryless; left for a dedicated run under the
one-fix-per-run rule.

- **What:** the function's docstring promises a *"Smoothed multi-check-in weight
  trend: average per-interval % of bodyweight change across the recent window, so
  a single noisy weigh-in (water, sodium, glycogen) can't whipsaw the calorie
  target."* The implementation, however, is a **2-point endpoint slope** —
  `change = (currentWeight − oldest.weight_kg) / weeks` — that reads ONLY the newest
  and oldest weights in the window. The up-to-3 intermediate priors are never read
  for their weight (only to pick the oldest anchor + interval count). So it is not
  an average and is maximally sensitive to noise on either endpoint — the exact
  whipsaw it claims to prevent.
- **Trigger (normal, uncorrupted data):** a cut/recomp athlete with ≥2 priors
  trending down cleanly (83.0→82.6→82.3→82.0 kg) whose *current* weigh-in is a
  routine +2 kg water/sodium day (84.0) → `(84.0−83.0)/4wk = +0.25 kg/wk` → engine
  reads a stall and fires `calories_delta = -100` ("Weight trend stalling"). The
  symmetric dehydrated-low endpoint fires the `< -1.5` branch and wrongly **adds
  150 kcal**. For short cadences (daily / every-2–3-days — all Settings options)
  `weeks < 1`, so endpoint noise is *amplified*, not dampened.
- **Downstream:** the bad `calories_delta` persists into `diet_plans` via
  `checkinHandlers.ts:132` — one water-heavy weigh-in permanently nudges stored
  calorie/macro targets the wrong way. No crash/NaN (those paths are guarded);
  purely a logic defect.
- **Why the existing test misses it:** `tests/unit/checkinEngine.test.ts:134`
  ("smoothed trend treats the same weigh-in as a stall, not a fast drop") places
  the +2 kg spike on an **intermediate** prior (week 3) — the one slot the formula
  ignores — so it passes by coincidence and gives false confidence. Moving the same
  noise to the current/oldest slot breaks it.
- **Suggested fix direction (not applied):** compute the trend from ALL points in
  the window — a least-squares slope over (date, weight) pairs, or the average of
  consecutive per-week deltas — instead of `(current − oldest)/weeks`. Add a
  failing-first test that puts the noise on the newest/oldest slot.

---

## Run: 2026-10-16 #2 (BUG FIX — the dashboard **Daily Weigh-In** widget crashes the whole dashboard tab on a corrupt/hand-edited `daily_weight_log` whose array contains a **`null` entry** (`null.date` → TypeError, no error boundary), and renders a **nonsense 7-day average** when an entry's `weight_kg` is a JSON string. The prior localStorage guard only validated the TOP-LEVEL array shape — never the individual entries.)

### STEP 0 — Requested changes
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (all 13 checked
off). Proceeded to the bug hunt.

### STEP 1 — Regression guard
On a clean pull of `master`:
- root `npx tsc --noEmit` → PASS (root `tsconfig.json` is `files:[]` + solution
  `references`, so it checks nothing; `tsc -p tsconfig.web.json` surfaces the
  **same one pre-existing, runtime-safe, type-only** error every prior run
  documented and deferred: `Diet/index.tsx:233` cuisine `string`→union. Untouched;
  my change adds **no new** errors.)
- `npm test` → PASS (369 tests)
- `npx electron-vite build` → PASS

### STEP 2 — Area audited: (b) training engine + workout/session flows, then (e) dashboard widgets / localStorage stores
Rotated off last run's (f) show/date + (e) `target_weight_kg` widget sweep. Deep-read
the training layer first — `trainingEngine.ts` (all numeric seams: freq /
exercises-per-session / sets-per-exercise / max-sets guards, every split builder),
`workoutHandlers.ts` (`sanitizeReps`/`sanitizeWeightKg` at every write seam),
`WorkoutSession.tsx` (live session, `clampSetCount`/`parseRepMidpoint`/`detectNewPRs`),
`WorkoutStats.tsx`, and `Training/index.tsx` — all exceptionally hardened by prior
runs, no reachable defect. Also re-traced the check-in/adaptive-nutrition layer
(`checkinEngine.ts`, `nutritionEngine.ts`, `weeklyRate.ts`/`weeksTracked.ts`,
`refeed.ts`, `units.ts`) — clean. Then swept the dashboard widgets' **localStorage
read seams** for the per-entry corruption gap the prior array-shape fixes didn't
cover, and found one in a default dashboard widget.

### The bug
A prior run fixed `DailyWeighInWidget` against a **non-array** `daily_weight_log`
(valid JSON of wrong shape: `null`/`{}`/`5`/…) by guarding the useState initializer
with `Array.isArray(parsed) ? parsed : []`. But localStorage is user-editable, so
each **entry** of a valid array is just as untrusted — and nothing validated them.
The widget then did:

```ts
const todayEntry = dailyWeightLog.find(e => e.date === todayStr)      // e may be null
const avg7 = last7.reduce((s, e) => s + e.weight_kg, 0) / last7.length // weight_kg may be a string
```

- **Hard crash (dashboard tab dies):** a `null` entry — e.g. a hand-edit that
  blanked one object but left its comma, `[null, {…}]` — reaches `.find(e => e.date …)`
  → `null.date` → `TypeError: Cannot read properties of null (reading 'date')`.
  `DailyWeighInWidget` is a **default dashboard widget** with no error boundary, so
  the entire dashboard tab unmounts (confirmed with a failing-first render test).
- **Nonsense average:** an entry whose `weight_kg` is a JSON **string** (`"80"`)
  rather than a number makes the `reduce` seed `0 + "80" + "81"` concatenate to
  `"08081"`, then `/ 2` coerces back to **4040.5** — a silently wrong "7-day avg"
  shown to the athlete (no NaN, so no visible error — worse).

**Reachability (in scope — "corrupted or hand-edited localStorage", "NaN/undefined
propagation", "a value shown that doesn't match what's stored"):** identical class
to the prior array-shape and `parseTargetWeightKg` precedents; the write seam
(`logDailyWeight`) already clamps to 30–300 kg, but a hand-edited/corrupt row
bypasses it and the read seam had no per-entry guard.

### STEP 3 — Fix (minimum — validate each entry at the read seam)
`src/components/widgets/DailyWeighInWidget.tsx`: extracted the inline initializer
into an exported pure helper `parseDailyWeightLog(raw)` that, after the existing
array guard, keeps only well-formed entries — a **string `date`** and a **finite
`weight_kg` within 30–300 kg** (the same bounds the write seam enforces), coercing
a numeric-string weight to a number so it can't string-concat. A `null`/malformed
entry is dropped (no crash); a string weight is normalized (correct average);
out-of-bounds corruption (e.g. a stale pre-bounds-fix 850 kg row) is filtered from
the display. Valid data passes through unchanged.

### Files changed
- `src/components/widgets/DailyWeighInWidget.tsx` — new exported
  `parseDailyWeightLog` seam guard; initializer routes through it.
- `tests/unit/dailyWeighInEntryCorrupted.test.tsx` — +5 tests (3 pure on
  `parseDailyWeightLog`, 2 jsdom rendering the real widget). Failing-first confirmed:
  a `null` entry threw `TypeError … reading 'date'` and the string-weight case
  rendered a 4040.5 average before the fix; after, no crash, no NaN, 80.5 avg.

### STEP 4 — Verification (all PASS)
- root `npx tsc --noEmit` → PASS; `tsc -p tsconfig.web.json` → only the one
  pre-existing deferred `Diet/index.tsx:233` type-only error, no new errors.
- `npm test` → PASS (374 tests, +5)
- `npx electron-vite build` → PASS

---

## Run: 2026-10-16 (BUG FIX — the dashboard **Prep Pace** widget renders literal **"(NaN kg below target)"** — and a nonsensical 0-kg goal — from a corrupt/hand-edited `target_weight_kg` setting. This is the THIRD site of the exact pattern run 2026-08-03 #2 fixed in CheckIn + Progress via the shared `parseTargetWeightKg` helper; `PrepPaceWidget.tsx:76` was missed and still used the raw `settings.target_weight_kg ? parseFloat(…) : null`.)

### STEP 0 — Requested changes
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (all 13 checked
off). Proceeded to the bug hunt.

### STEP 1 — Regression guard
On a clean pull of `master`:
- root `npx tsc --noEmit` → PASS (root `tsconfig.json` is `files:[]` + solution
  `references`, so it checks nothing; `tsc -p tsconfig.web.json` surfaces the
  **same one pre-existing, runtime-safe, type-only** error every prior run
  documented and deferred: `Diet/index.tsx:233` cuisine `string`→union. Untouched;
  my change adds **no new** errors.)
- `npm test` → PASS (366 tests)
- `npx electron-vite build` → PASS

### STEP 2 — Area audited: (f) shows/competition + date/week logic, then (e) widgets
Rotated off last run's (a) nutrition/Diet + (e) meal-completion state. Deep-read
the show/date layer — `showDates.ts` (`weeksUntilShow`/`localToday`), `dates.ts`
(`getShowCountdown`/`isPast`), `showHandlers.ts` (add/update/delete/cancel/
setPrimary + `syncPrimaryToNearest`/`regenerateDietForGoal`/
`transitionTrainingToOffSeason`), and `weeklyRate.ts`/`weeksTracked.ts` — all
exceptionally hardened by prior runs, no reachable defect. Also traced the
`trainingEngine` numeric guards (freq/exPerSession/sets/maxSets) and `units.ts`
conversions — clean. Then swept the dashboard widgets for the unguarded
`target_weight_kg` parse the 08-03 #2 run had centralized, and found one site it
never reached.

### The bug
Run **2026-08-03 #2** fixed `settings.target_weight_kg ? parseFloat(…) : null`
(renders "NaN kg" for a corrupt/hand-edited value, because the truthy string
passes the `?` guard, `parseFloat` yields `NaN`, and the downstream
`targetKg !== null` render guard does NOT stop it since `NaN !== null` is `true`)
by introducing the shared pure helper `parseTargetWeightKg(raw)` →
finite-positive-kg-or-null, and routing `CheckIn/index.tsx:765` and
`Progress/index.tsx:146` through it.

**But `src/components/widgets/PrepPaceWidget.tsx:76` was a THIRD copy of the exact
same pattern and was missed.** PrepPaceWidget is a **default dashboard widget**
(`prep-pace` is in `DEFAULT_WIDGETS`, registered in `registry.tsx`). For a
cutting/bulking athlete with ≥2 check-ins and an upcoming show, it renders a
"Show day (Nw): ~X kg" projection with a "(… above/below target)" comparison line.
That line read the goal weight with the unguarded pattern:

```ts
const targetKg = settings.target_weight_kg ? parseFloat(settings.target_weight_kg as string) : null
```

- A corrupt/hand-edited `target_weight_kg` of `"abc"`/`"NaN"`/`"kg"` is a **truthy
  string** → passes the `?` → `parseFloat` → `NaN`. The `{targetKg !== null && …}`
  render guard at line 86 does **not** catch it (`NaN !== null` is `true`), so the
  comparison renders `Math.abs(projectedKg - NaN)` → `fmt(NaN)` → literal
  **"(NaN kg below target)"** to the athlete (confirmed in the failing test:
  `Show day (8w): ~70.9 kg(NaN kg below target)`).
- A `"0"` (truthy string) → `parseFloat("0")` → `0`, treated as a real **0-kg
  goal** → renders a nonsensical e.g. **"(70.9 kg above target)"** vs a 0-kg target.

**Reachability (in scope — "corrupted or hand-edited localStorage / persisted
settings", "NaN propagation", "a value shown that doesn't match what's stored"):**
identical to the 08-03 #2 precedent — the Progress editor only saves
`!isNaN(v) && v > 0`, but a hand-edited/corrupt settings row bypasses that and the
widget's read seam had no finiteness/positivity guard of its own.

### STEP 3 — Fix (minimum — route the missed site through the existing shared helper)
`src/components/widgets/PrepPaceWidget.tsx`: import `parseTargetWeightKg` and
replace the inline `settings.target_weight_kg ? parseFloat(…) : null` with
`parseTargetWeightKg(settings.target_weight_kg)`. A bad value now reads as "no
target set" (the "(… target)" comparison line is simply omitted — the projection
and pace still render); valid positive targets are unchanged. No new helper, no
behavior change for valid data — this just finishes applying the 08-03 #2 fix to
the one widget it missed.

### Files changed
- `src/components/widgets/PrepPaceWidget.tsx` — use shared `parseTargetWeightKg`.
- `tests/unit/prepPaceTargetWeight.test.tsx` — +3 jsdom tests rendering the real
  widget with seeded stores. Failing-first confirmed: `"abc"` rendered
  `(NaN kg below target)` and `"0"` rendered `(70.9 kg above target)` before the
  fix; after, both read as "no target set" (no NaN, no `target)` line) while a
  valid `"72"` still renders the comparison.

### STEP 4 — Verification (all PASS)
- root `npx tsc --noEmit` → PASS; `tsc -p tsconfig.web.json` → only the one
  pre-existing deferred `Diet/index.tsx:233` type-only error, no new errors.
- `npm test` → PASS (369 tests, +3)
- `npx electron-vite build` → PASS

---

## Run: 2026-08-04 #2 (BUG FIX — reordering meals desyncs the "eaten" marks: meal completions are keyed by positional `meal_index`, but `plan:reorderMeals` stored the reordered meals without remapping completions, so dragging a snack past an already-eaten meal moved the ✓ and its macros onto the WRONG meal — a persistent DB↔UI desync)

### STEP 0 — Requested changes
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (all 13 checked
off). Proceeded to the bug hunt.

### STEP 1 — Regression guard
On a clean pull of `master`:
- root `npx tsc --noEmit` → PASS (root `tsconfig.json` is `files:[]` + solution
  `references`, so it checks nothing; the real per-project checks
  `tsc -p tsconfig.web.json` / `tsconfig.node.json` each surface the **same two
  pre-existing, runtime-safe, type-only** errors every prior run documented and
  deferred: `Diet/index.tsx:233` cuisine `string`→union and `showHandlers.ts:332`
  `unknown`/`{}|null`→`JSValue`. Untouched again; my change adds **no new** errors.)
- `npm test` → PASS (363 tests)
- `npx electron-vite build` → PASS

### STEP 2 — Area audited: (a) nutrition / Diet flows + (e) meal-completion state
Rotated coverage — recent runs hit (d) Settings/reset (08-04), (a)/(c)
nutrition+Progress (08-03 #2), and the check-in interval loop (08-03). This run
deep-read the training area first (`workoutHandlers`, `trainingEngine`,
`WorkoutSession`, `WorkoutStats`, `Training/index`, and the `detectNewPRs` /
`parseRepMidpoint` / `clampSetCount` utils) — all exceptionally hardened by prior
runs, no reachable defect. Then traced the check-in/date/week layer
(`checkinEngine`, `checkinSchedule`, `checkinHandlers`, `showDates`, Progress/
CheckIn math) — also clean. Moved into the **Diet meal-interaction layer**
(mark-eaten, swap, drag-reorder) and the `plan:reorderMeals` /
`mealCompletionHandlers` seam, where one genuine reachable desync surfaced.

### The bug
`meal_completions` are keyed by **positional `meal_index`** (with
`UNIQUE(user_id, date, meal_index)`), and the app is careful about this everywhere
else — `clearOrphanedMealCompletions` purges today/future completions whenever a
regenerate/refine changes `meal_count` (`planHandlers.ts:182/229/321/491/593/737`).
But `plan:reorderMeals` (`planHandlers.ts:954`) stored the reordered meals array
verbatim and **never touched completions**. The Diet "Meal Plan" tab lets the user
drag snack cards to reorder them (`draggable={snack}`, two drop handlers in
`src/pages/Diet/index.tsx`), and moving a snack shifts the positional index of
every meal it crosses.

**Repro:** meals `[Breakfast(0), Lunch(1), Dinner(2), Snack(3)]`; mark **Lunch**
eaten today → completion `{meal_index:1}`. Drag Snack to the front → stored order
`[Snack, Breakfast, Lunch, Dinner]`, but the completion is still `{meal_index:1}`
— which now points at **Breakfast**. Result: Breakfast shows the "✓ Eaten" mark and
its macros are counted toward Today's Intake / the weekly tab, while Lunch (the meal
actually eaten) reads as not eaten. The desync **persists across reloads** because
the stored DB row is wrong. In scope: "cancelled/completed drags", "DB↔UI desync —
a value shown that doesn't match what's stored".

### STEP 3 — Fix (minimum correct, at the reorder seam + the client refresh)
- **Handler** (`electron/ipc/planHandlers.ts` `plan:reorderMeals`): recover the
  old→new index permutation by matching each reordered meal back to its original
  slot (greedy `JSON.stringify` match — for a pure reorder the multiset is
  unchanged, and identical meals are interchangeable so any valid match is
  correct), then **move today/future completions to their meal's new index** via
  delete-then-reinsert (avoids a transient `UNIQUE` collision mid-shuffle). Guarded
  to run **only** when a complete permutation is recovered AND something actually
  moved — otherwise completions are left as-is (prior behavior), so a content
  change can't corrupt them. Past days stay immutable, mirroring
  `clearOrphanedMealCompletions`.
- **Client** (`src/pages/Diet/index.tsx`, both drag-drop reorder handlers): after
  `reorderMeals` + `loadDietPlan`, also `loadMealCompletions(user.id, mondayStr,
  todayStr)` so the in-memory store reflects the remapped indices immediately
  (the completions effect keys on `[user?.id, tab]`, not `dietPlan`, so it wouldn't
  otherwise refresh).

### Files changed
- `electron/ipc/planHandlers.ts` — `plan:reorderMeals` now remaps meal completions
  through the reorder permutation.
- `src/pages/Diet/index.tsx` — both reorder drop handlers reload completions.
- `tests/unit/mealReorderCompletions.test.ts` — +3 tests against the REAL handler
  on an in-memory DB. Failing-first confirmed: the "snack dragged in front of the
  eaten meal" case asserted `meal_index === 2` but got `1` before the fix. The
  no-move and past-day-immutable cases pass both before and after (they pin the
  correct non-desync behavior).

### STEP 4 — Verification (all PASS)
- root `npx tsc --noEmit` → PASS; `tsc -p tsconfig.web.json` / `tsconfig.node.json`
  → only the two pre-existing runtime-safe errors, **no new** errors from this change.
- `npm test` → PASS (366 tests, +3 new)
- `npx electron-vite build` → PASS

---

## Run: 2026-08-04 (BUG FIX — a Settings-typed extreme `training_frequency` persists **unclamped**, so the dashboard shows a nonsensical "999 / week" while the actual plan is capped at 6 sessions — a DB↔UI desync)

### STEP 0 — Requested changes
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (all 13 checked
off). Proceeded to the bug hunt.

### STEP 1 — Regression guard
On a clean pull of `master`:
- root `npx tsc --noEmit` → PASS (note: the root `tsconfig.json` has `files: []`
  + solution `references` so it type-checks NOTHING — the real per-project checks
  `tsc -p tsconfig.web.json` / `tsconfig.node.json` each surface **one pre-existing,
  runtime-safe, type-only** error: `Diet/index.tsx:233` cuisine `string`→union
  (dropdown-constrained) and `showHandlers.ts:332` `unknown`/`{}|null`→`JSValue`
  (real string/number DB values). Both predate this run and every prior run
  deferred them under the one-fix rule; untouched again. My change adds **no new**
  type errors on either project.)
- `npm test` → PASS (361 tests)
- `npx electron-vite build` → PASS

### STEP 2 — Area audited: (d) onboarding + Settings + reset + data lifecycle
Rotated off the last runs' (c) check-in/Progress, (f) show/date, (a) diet/water,
(b) workout-set clusters. Deep-read the reset/data-lifecycle layer
(`utils/resetData.ts` `isPreservedKey`/`mergeWeighIns`/`resetLocalData`,
`userHandlers.ts` `resetAll`/`create`/`update`, `settingsHandlers.ts`), the
localStorage store layer (`components/widgets/localStore.ts` shape-guarded reader,
`store/cardioStore.ts` migration, `competitionLogs.ts` stores), the logging
widgets' input guards (`SleepWidget`, `PosingWidget`, `CardioWidget` — all guard
`isNaN`/`<=0`), the aggregation widgets (`WeeklyScorecardWidget`,
`WeeklyVolumeWidget`, `MuscleCoverageWidget`, `NextMealWidget` — all guard
divisions by length), the training/nutrition/checkin engines, and the Settings +
Onboarding profile inputs + `sanitizeUserUpdate` write seam. Almost everything is
already well-hardened by prior runs. **One reachable defect found:** the Settings
profile-edit save persists `training_frequency` unclamped.

### The bug
`sanitizeUserUpdate` (`electron/ipc/userSanitize.ts`) clamps `age`, `height_cm`,
`weight_kg`, `meal_count`, `snack_count`, and `body_fat_pct` to their contract
ranges (the 07-29 #2 run added the age/height/weight clamps for exactly this
class), but it did **not** clamp `training_frequency`. That field is:
- **displayed verbatim** — `QuickStatsWidget` renders it as "Training Days
  {value} / week" on the dashboard (`src/components/widgets/QuickStatsWidget.tsx:51`),
  and the Settings "Training Days" row shows `${user.training_frequency}/week`
  (`src/pages/Settings/index.tsx:538`); and
- **capped by the engine** — `generateTrainingPlan` clamps the session count to
  `Math.min(6, Math.max(2, …))` (`trainingEngine.ts:512`).

Onboarding sets it with a **range slider** (`min={2} max={6}`,
`Step3Training.tsx`) so it can't go out of range there. But the Settings
"Edit profile" input is `<input type="number" min={2} max={6}>` — HTML `min`/`max`
only bound the spinner arrows, never a typed/pasted value — and `handleSaveProfile`
spreads the whole `editForm` (which always carries `training_frequency`) into
`updateUser`. So typing e.g. `999` and saving stores `training_frequency = 999`.
The dashboard then shows **"999 / week"** and the Settings row **"999/week"**,
while the generated plan still has 6 sessions — a persistent DB↔UI desync (in
scope: "invalid / extreme / boundary inputs", "a value shown that doesn't match
what's [used]"). A cleared field (`parseInt('')` → NaN) was already dropped by the
final non-finite filter; the gap was specifically a **finite** out-of-range value.

### STEP 3 — Fix
Added `clampTrainingFrequency(value)` to `userSanitize.ts` — reuses the existing
`clampProfileNumber(value, 2, 6)` helper and rounds (whole days), returning
`undefined` for a non-finite/absent value so it's dropped and the stored value is
preserved (exactly like `clampAge`/`clampHeightCm`/`clampWeightKgField`). Wired it
into `sanitizeUserUpdate`'s serialized map. Minimum change, at the same write seam,
matching the app's own 2–6 contract (onboarding slider + engine cap).

Left `exercises_per_session` / `sets_per_exercise` alone: they are **not** displayed
verbatim and `generateTrainingPlan` already guards them (finite-&-positive-or-default),
so an out-of-range value can't crash or desync a shown value — clamping them would
risk over-narrowing legitimate AI-supplied values for no user-visible gain.

### Files changed
- `electron/ipc/userSanitize.ts` — new `clampTrainingFrequency`; wired into
  `sanitizeUserUpdate`.
- `tests/unit/userSanitize.test.ts` — +2 tests (out-of-range 999→6 / 1→2 / 3.4→3;
  in-range 4 untouched). Failing-first confirmed: without the fix the clamp test
  fails (returns 999); the existing `training_frequency: NaN` drop test still passes.

### STEP 4 — Verification (all PASS)
- root `npx tsc --noEmit` → PASS; `tsc -p tsconfig.web.json` / `tsconfig.node.json`
  → only the two pre-existing runtime-safe errors, **no new** errors from this change.
- `npm test` → PASS (363 tests, +2 new)
- `npx electron-vite build` → PASS

---

## Run: 2026-08-03 #2 (BUG FIX — a corrupt / hand-edited `target_weight_kg` setting renders literal **"NaN kg" / "NaN lbs"** to the athlete in the Check-In "Show Day Projection" and Progress "Projected Show Weight" cards. Both pages read the stage-weight goal with the same unguarded pattern — `settings.target_weight_kg ? parseFloat(settings.target_weight_kg) : null` (`src/pages/CheckIn/index.tsx:765`, `src/pages/Progress/index.tsx:146`). A non-numeric persisted value (`"abc"`, `"NaN"`, a stray unit like `"kg"`) is a **truthy string**, so it passes the `?` guard and `parseFloat` yields **NaN**. That NaN then flows into `gap = projectedKg - targetKg` and the target display, and — critically — the `targetKg !== null` render guards on both cards **do not stop it** because `NaN !== null` is `true`. Result: the projection card shows "NaN kg", "NaN kg above/below goal", and (Progress) a NaN `requiredRate`. A `"0"` value likewise passed through as a nonsensical 0-kg goal. **Reachability (in scope — "corrupted or hand-edited localStorage / persisted settings", "NaN propagation", "a value shown that doesn't match what's stored"):** the value is normally written as `String(kg)` by the Progress editor, which only saves `!isNaN(v) && v > 0` — but a hand-edited/corrupt settings row bypasses that validation, and the read seam had no finiteness guard of its own. **Root cause:** `parseFloat` of an untrusted persisted string with no `Number.isFinite` / positivity check, in two places sharing one buggy pattern. **Fix (minimum, at the shared seam):** new pure helper `parseTargetWeightKg(raw)` (`src/utils/targetWeight.ts`) → returns a finite, positive kg number or `null` (absent/empty/non-numeric/≤0 → `null` = "no target set"); both call sites now use it. A bad value now reads as "no goal set" (the card simply omits the target line) instead of surfacing NaN. Valid positive targets are unchanged. Failing-first regression: `tests/unit/targetWeight.test.ts` (5 tests) — asserts `"abc"`/`"NaN"`/etc → `null` (old inline logic returned NaN, demonstrated via node), `"0"`/negatives → `null`, and valid values parse through.)

### STEP 0 — Backlog
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (every queue item is `- [x]`). Bug-hunt run.

### STEP 1 — Regression guard (clean baseline on freshly-rebased `master`)
- `npx tsc --noEmit` → PASS. `npm test` → PASS (356 tests, 55 files). `npx electron-vite build` → PASS.

### STEP 2 — Area audited: (a) nutrition engine + Diet flows / (c) adaptive nutrition + Progress (rotated off last run's (f) shows/date)
Deep-read `nutritionEngine.ts` (BMR/TDEE, `getPhaseAwareDeficit`, `buildMeals` per-meal macro ratios, `clampWeightKg`/`clampMealCount`/`sanitizeCalorieTarget`/`sanitizeMacroGrams`, culture-food/prep-style/cook-time layers), `checkinEngine.ts` (`weightTrend`/`weightTrendPct` smoothing, `calculateAdjustments`), every diet/check-in/progress/meal-completion IPC handler (`planHandlers`, `checkinHandlers` submit/submitMissed/update, `progressHandlers`, `mealCompletionHandlers`), the pure rate/refeed/water utils (`weeklyRate.ts`, `refeed.ts`, `water.ts`, `units.ts`), and the Diet/CheckIn/Progress page math. The engine/handler layer is exceptionally hardened — every DB↔UI seam already floors/clamps NaN/±Infinity/0. The one genuine reachable **user-visible NaN** was the unguarded `target_weight_kg` parse shared by CheckIn + Progress.

### STEP 3 — Fix
New `src/utils/targetWeight.ts` `parseTargetWeightKg`; wired into `CheckIn/index.tsx` and `Progress/index.tsx` replacing the inline `parseFloat`. One root cause, two call sites, one shared guard.

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS
- `npm test` → **361 passed** (+5 new), 56 files
- `npx electron-vite build` → PASS

### Also noted (NOT fixed — one focused fix per run)
- **Diet "Still to eat" can show a negative calorie figure** (`src/pages/Diet/index.tsx:584`): the kcal line renders `{effCaloriesTarget - consumedCalories}` with no `Math.max(0, …)`, unlike the three sibling protein/carb/fat lines (586/588/590) which all floor at 0. For rule-based plans the per-meal calories sum to the target so an unlogged meal keeps this positive; it only goes negative for **AI (Claude) plans** whose per-meal calories exceed the sanitized `calories_target`. Cosmetic; deferred (matches prior runs' note).
- Both `plan:refineDietWithPrompt` / `refine_diet` persist `r.protein_g ?? currentPlan.protein_g` without `sanitizeMacroGrams`; a model returning 0 could store a 0-g macro. API-key-only, low reachability; deferred.

## Run: 2026-08-03 (BUG FIX — the Check-In page **hard-freezes the renderer with a synchronous infinite loop** whenever the check-in interval resolves to `0`. `computeMissedSlots` (rendered on *every* Check-In render, both the locked and open screens) computes how many slots were skipped via `countMissedBetween` → `Math.max(0, Math.floor(days / interval) - 1)`. With `interval === 0`, `days / 0 === Infinity` → the count is `Infinity`, which is fed into `addMissedFrom`'s `for (let k = 0; k < count; k++)` loop → an unbounded loop that pushes objects forever, hanging the entire renderer (no timeout can interrupt synchronous JS; the tab just locks up until it OOMs). **Reachability (in scope — "corrupted or hand-edited localStorage"):** the Check-In page derives the interval from `parseInt(settings.checkin_interval_days ?? '7', 10)` where `settings` is the localStorage settings store; the Settings UI only offers 1/3/7/14, but a hand-edited/corrupt `checkin_interval_days` of `'0'` (with `checkin_schedule_type='interval'`) makes `intervalDays = 0`. That 0 flows to `effectiveInterval('interval', storedIntervalDays, 0, …)` → `storedIntervalDays ?? 0`, hitting 0 for the post-last-check-in segment of any row without a stored positive `interval_days` (legacy rows, or rows that were themselves submitted while the setting was 0). One corrupt value → the whole Check-In screen is unusable. **Root cause:** `countMissedBetween` had no guard against a non-positive / non-finite interval before dividing. **Fix (minimum, at the seam):** guard `countMissedBetween` in BOTH copies (`src/utils/checkinSchedule.ts` — the renderer path that actually hangs — and `electron/services/checkinSchedule.ts` — the identical logic re-exported from `checkinHandlers` and used by `qa-runner`) to return `0` when `!Number.isFinite(interval) || interval <= 0`. An unusable interval now means "no missed slots detectable" instead of a hang; all normal 1/3/7/14 cadences are byte-for-byte unchanged. Failing-first regression: `tests/unit/checkinSchedule.test.ts` "degenerate interval guard" — confirmed the unfixed code HANGS (`timeout 25 npx vitest …` → killed, exit 143), and passes after the guard (interval 0 → `[]`, plus negative/NaN → `[]`).)

### STEP 0 — Backlog
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (every queue item is `- [x]`). Bug-hunt run.

### STEP 1 — Regression guard (clean baseline on freshly-rebased `master`)
- `npx tsc --noEmit` (routine gate) → PASS. `npm test` → PASS (354 tests). `npx electron-vite build` → PASS.
- Ran the REAL per-project checks the vacuous root gate hides: `tsc -p tsconfig.web.json` reports only the pre-existing runtime-safe `Diet/index.tsx:233` culture_pref `string`→union error; `tsc -p tsconfig.node.json` reports only the pre-existing `showHandlers.ts:332` `unknown`/`{}|null`→`JSValue` error. Both predate this run, are type-only/runtime-safe, and are untouched (one-fix rule). My change adds **no new** type errors on either project.

### STEP 2 — Area audited: (f) shows/competition + date/week logic (rotated off last run's (e)/(a) widgets+Diet and the prior (d)/(b))
Deep-read: `utils/dates.ts` (`getShowCountdown` past-clamp + `isPast`), `services/showDates.ts` (`weeksUntilShow`/`localToday`), `ipc/showHandlers.ts` (add/update/delete/cancel/setPrimary → `syncPrimaryToNearest`, diet regeneration, off-season transition), `data/competitionPrep.ts` (`getWeekGuidance`/`buildPrepTimeline`/peak-week protocol), the competition widgets (`PeakWeekWidget`, `SessionsWeekWidget`, `WeeklyVolumeWidget`, `WeeklyScorecardWidget`, `competitionLogs.ts`), the week/rate utils (`weeklyRate.ts`, `weeksTracked.ts`), and the full check-in schedule layer (`utils/checkinSchedule.ts` + `services/checkinSchedule.ts` + `ipc/checkinHandlers.ts` submit/submitMissed/update week-number & duplicate-day guards). The show/date layer is otherwise very hardened (every DB↔UI seam clamps to a non-negative contract and past-guards on local dates). The one genuine reachable defect was the 0-interval infinite loop above.

### STEP 3 — Fix
Guarded `countMissedBetween` (both copies) against a non-positive/non-finite interval before the divide, killing the `Infinity`/`NaN` count that drove the `for (k < count)` loop. See the header for the full root-cause chain.

### Tests added — `tests/unit/checkinSchedule.test.ts` ("computeMissedSlots — degenerate interval guard", +2)
- interval 0 (row with no stored interval, `currentIntervalDays=0`) → `[]` (was: infinite loop / renderer hang — **confirmed fail-first via OS timeout kill, exit 143**).
- negative and `NaN` effective interval → `[]`.

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` (routine gate) → PASS
- `npm test` → **356 passed** (+2 new), 55 files
- `npx electron-vite build` → PASS

### Also noted (NOT fixed — one focused fix per run)
- **`getNextCheckinDate` interval mode with a corrupt `intervalDays=0`** produces `next = lastDate` (no lockout advance) — not a crash, just a missing lockout; the same corrupt-setting family, deferred. A `NaN` interval yields an Invalid Date comparison that reads as "form open" (safe).
- **Show Day Projection can render `NaN`** (`CheckIn/index.tsx` ~793) when `settings.target_weight_kg` is a corrupt non-numeric string (`parseFloat → NaN` → `gap`/`fmt(NaN)` → "NaN kg"). Cosmetic, corrupt-setting-only; deferred.
- **`buildPrepTimeline` for a show >24 weeks out** highlights no "current week" (the `Math.min(currentWeek+2, 24)` cap keeps every rendered week below `currentWeek`). Cosmetic; deferred.

## Run: 2026-08-02 #2 (BUG FIX — the Diet page's water tracker **silently corrupts and quantizes the water amount the Dashboard widget logged**, because both screens read/write the *same* `water_ml_<date>` localStorage key but with incompatible representations. The Dashboard's `useWaterLog` stores an **arbitrary ml** amount — its imperial quick-adds persist 237/355/473/946 ml (8/12/16/32 oz) — while the Diet page tracks whole **250 ml "glasses"**. `updateWater` in `src/pages/Diet/index.tsx` wrote `String(next * ML_PER_GLASS)` i.e. `glasses × 250`, so any sub-250ml value the Dashboard had logged was overwritten the instant the user tapped +/- in Diet: an 8 oz (237 ml) entry read back as 1 glass and was rewritten to 250 ml, and a +1/−1 round-trip permanently snapped the true amount to a 250 multiple — destroying the logged ml and desyncing the two screens (the Dashboard then displays the coarsened value). Root cause: the write rounded to whole glasses instead of applying the ±250 ml delta to the TRUE stored ml. Fixed by extracting a pure `nextWaterMl(storedMl, deltaGlasses, mlPerGlass, maxGlasses)` helper (`src/utils/water.ts`) that adds/subtracts one glass' worth of ml to the actual stored value — clamped to [0, 20 glasses], non-finite stored → 0 — and reading the real stored ml in `updateWater` before applying the delta. Pure-Diet usage (250 multiples) is byte-for-byte unchanged; only the cross-screen corruption path is repaired. See "Also found (deferred)" for two lower-severity issues surfaced this run.)

### STEP 0 — Backlog
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (every queue item is `- [x]`). Bug-hunt run.

### STEP 1 — Regression guard
On a clean pull of `master`: root `npx tsc --noEmit` PASS. `npm test` PASS (347 tests). `npx electron-vite build` PASS. Note: the root `tsconfig.json` (`files: []` + solution `references`) type-checks nothing; the real per-project checks (`tsc -p tsconfig.web.json` / `tsconfig.node.json`) each surface **one pre-existing, runtime-safe type-only error** (`Diet/index.tsx` cuisine `string`→union; `showHandlers.ts:332` `Record<string,unknown>`→`JSValue`). Both predate this run (commits `0ef0e38` / `0659611`), are not reachable defects, and were left untouched to keep this a single focused fix.

### STEP 2 — Area audited: (e) widgets + localStorage stores / (a) Diet flows (rotated off (b) training which the prior run covered)
Audited the nutrition/training/check-in engines, every IPC handler (checkin, plan, show, workout, progress, user, settings, meal-completion), the DB schema/migrations/lifecycle, the shared date/week/rate utils, the stores, and the Diet/Progress/Settings water & intake math. The codebase is exceptionally hardened — nearly every DB↔UI seam already carries an explicit clamp/guard. The one genuine **silent** data-corruption bug was the shared-water-key quantization above.

### STEP 3 — Fix
`src/utils/water.ts` (new) `nextWaterMl` + `src/pages/Diet/index.tsx` `updateWater` rewritten to preserve the true stored ml. Failing-first unit test added: `tests/unit/waterLog.test.ts` (7 cases — the key regression asserts `nextWaterMl(237, 1) === 487`, not the old quantized `500`, and that a +1/−1 round-trip returns the original 237).

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` (root) → PASS (clean)
- `npx tsc -p tsconfig.web.json` → only the pre-existing cuisine error (now line 233, shifted +2 by the new import); **no new errors from this change**
- `npm test` → PASS (354 tests, +7 new)
- `npx electron-vite build` → PASS

### Also found (deferred — not fixed this run, one focused fix per run)
- **Diet "Still to eat" can show a negative calorie figure** (`src/pages/Diet/index.tsx` ~line 585): the calories line renders `{effCaloriesTarget - consumedCalories} kcal` with no `Math.max(0, …)`, unlike the three sibling protein/carb/fat lines right below it which all floor at 0. Reachable when `consumedCalories > effCaloriesTarget` while `consumedProtein < protein_g` and a meal is still unlogged (the enclosing OR condition still fires). Cosmetic (a small negative like `-180 kcal`); low severity. A clean one-line `Math.max(0, …)` fix, but hard to unit-test without rendering the ~1600-line page — deferred.
- **Water target representation mismatch** (same shared-key family): the Diet page's `cycleWaterTarget` writes `glasses × 250` (2000/2500/3000 ml) and its imperial default is 3000 ml vs the Dashboard's 3785 ml. This only fires on an *explicit* user cycle (not silent), so it's a design-reconciliation item, not a silent-corruption defect — deferred for an owner decision on whether the two water UIs should fully share one representation.
- **Claude meal `time` strings are persisted unvalidated** (`planHandlers.ts` AI diet path): a non-`HH:MM` model value (e.g. `"12:00 PM"`) would make the Diet timeline dot's `left:` compute to `NaN%`. Only reachable with an API key + a non-conforming model response; no crash. Deferred as low-confidence.

## Run: 2026-08-02 (BUG FIX — the workout-set write handlers persist **negative / non-finite `reps_actual` and `weight_kg` verbatim**, so a fat-fingered negative rep count (a stray `-` before a number) inverts the post-workout **Total Volume** and permanently poisons the training log. In the live `WorkoutSession`, the RIR input clamps to 0–5 (`Math.max(0, Math.min(5, …))`) but the sibling **reps and weight inputs have no `min`** — the HTML `min` attr never blocks a typed/JS value — so `Number('-5') = -5` flows straight through `onSetUpdate` → `saveSetsBatch`. The post-workout summary's volume is `Σ weight × reps` over done sets (`weight > 0` guard only, no reps guard), so one `-5`-rep set at 100 kg subtracts `500` from the headline Total Volume. Worse, `reps_actual: -5` (or a negative `weight_kg`) is written to `exercise_logs` and never re-validated: it then feeds `WorkoutStats` charts, all-time PR detection, and the **next session's "last performance" pre-fill** (`if (!s.reps_actual) continue` skips 0 but NOT −5, so the negative becomes the pre-filled reps). The same hole exists on the **WorkoutLogEditor** edit path via `workout:updateSet`. All three write seams — `workout:logSet`, `workout:updateSet`, `workout:saveSetsBatch` — stored the values with only `?? null` and no bound. Fixed by clamping reps/weight to non-negative finite at the backend write seam so every entry point agrees.)

### STEP 0 — Backlog
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (every queue item is `- [x]`). Bug-hunt run.

### STEP 1 — Regression guard (clean baseline on fresh rebased `master`)
- `npx tsc --noEmit` (routine gate) → PASS
- `npm test` → PASS (341 tests, 53 files)
- `npx electron-vite build` → PASS

Also ran the REAL per-project checks the 2026-08-01 #2 run flagged as hidden by the vacuous root gate: `tsc -p tsconfig.web.json` still reports the one **runtime-safe** `Diet/index.tsx:228 culture_pref` string→union mismatch (dropdown-constrained value; left untouched per the one-fix rule), and `tsc -p tsconfig.node.json` reports `showHandlers.ts:332` binding `unknown`/`{}|null` to `JSValue` (real DB row values bound to `UPDATE users SET show_date=?, division=?` — runtime-safe, type-only). Neither is a reachable defect; both are noise from the vacuous gate and are NOT this run's target. My change adds no new type errors on either project.

(`npm ci` with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`.)

### STEP 2 — Area audited: (d) onboarding + Settings + reset + data lifecycle, then (b) training/workout session flows
Rotated off last run's (c) check-in cluster. Deep-read area (d): `resetData.ts` (`isPreservedKey`/`mergeWeighIns`/`resetLocalData`), `userStore.resetAllData`, `userHandlers` (`user:update`/`user:resetAll`/`parseUser`), `userSanitize.ts` (age/height/weight/body-fat/meal/snack clamps), `settingsStore`/`settingsHandlers`, `Onboarding` (`useOnboarding`, `validateStep`, `StepAiSetup`, Step2 show-date `min`), and the `DailyWeighIn`/water preserved-store math. **Area (d) is genuinely clean/well-hardened** — every write seam already guards NaN/±Infinity/out-of-range (the last several runs closed those holes), and the training-count fields (`training_frequency`/`exercises_per_session`/`sets_per_exercise`) that (d) leaves unclamped are re-clamped at the training-engine seam. No fabricated fix there.

Extended the hunt into the next-least-recent area **(b)** and found the real defect in the workout-set write path. Also noted (NOT fixed — matches prior "low reachability" assessment): `CheckinFeedbackWidget:58` / `CheckIn:726` read `adjustments.notes.map(...)` without the `?.` that `RecentCheckinsWidget:45` uses — only reachable with a corrupt/hand-edited `weekly_checkins.adjustments` (the schema DEFAULT `'{}'` has no `notes`), never produced by a normal insert (`calculateAdjustments` always returns ≥1 note and all inserts write it).

### STEP 3 — Root cause + fix
- **Root cause:** `electron/ipc/workoutHandlers.ts` — `logSet`, `updateSet`, and `saveSetsBatch` bound `reps_actual`/`weight_kg` with only `(… as number | null) ?? null`, applying NO lower bound or finiteness check. The renderer's reps/weight inputs never clamp (only RIR does), so a typed negative persists.
- **Fix (minimum change, at the seam):** added two pure helpers `sanitizeReps` / `sanitizeWeightKg` (null/undefined → null; non-finite → null; otherwise `Math.max(0, …)`, reps rounded to an integer) and applied them in all three write handlers. Clamps at the DB boundary so every UI entry point (live session, log editor, single logSet) is covered by one guard. A cleared field still round-trips to NULL (the existing `updateSet` "emptied field = clear column" contract is preserved).

### Tests added — `tests/unit/workoutSetBounds.test.ts` (new, 6 tests)
- Pure `sanitizeReps`/`sanitizeWeightKg`: negative → 0, fractional reps rounded, weight fractional preserved, NaN/±Infinity → null, null/undefined → null.
- Real handlers vs in-memory node-sqlite3-wasm DB: `saveSetsBatch` clamps a `-5` reps to `0` (and a `-140` weight to `0`); `logSet`+`updateSet` clamps a `-3` reps edit to `0`. **Confirmed fail-first** (before the fix the rows stored `-5`/`-3`).

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` (routine gate) → PASS
- `npm test` → **347 passed** (+6 new)
- `npx electron-vite build` → PASS

---

## Run: 2026-08-01 #2 (BUG FIX — the Check-In **success screen crashes with `ReferenceError: recent is not defined`** for any athlete who has a show scheduled and ≥2 check-ins. After submitting a check-in, the page renders a "Show Day Projection" card whose footer caption reads `Avg over {recent.length} check-in…` — but `recent` was never defined in that scope. It was clearly a leftover: an earlier refactor changed the rate call to `computeWeeklyWeightRate(checkinHistory, 5)` and deleted the `const recent = checkinHistory.slice(0, 5)` window variable, but left the caption referencing it. Because the block only renders when `checkinHistory.length >= 2 && user.show_date` (and the weekly rate is computable), a real competitor in prep hits it every time they weigh in: React throws mid-render → the entire coach-feedback + projection screen white-screens instead of showing their adjustments. **This slipped past every prior run's tsc gate because `npx tsc --noEmit` on the root `tsconfig.json` — which has `files: []` + solution `references` — type-checks NOTHING** (verified: injecting `const x: string = 123` yields no error). The real per-project check `tsc -p tsconfig.web.json` flags it as TS2304. Fixed by restoring `const recent = checkinHistory.slice(0, 5)` in the projection IIFE. Also surfaced a second, type-only (runtime-safe) error the vacuous gate hid — see "Also found" below.)

### STEP 1 — Regression guard
Clean pull of `master`; no regressions. `npx tsc --noEmit` (routine gate) → PASS,
`npm test` → 340 passed, `npx electron-vite build` → PASS. (`npm ci` with
`ELECTRON_SKIP_BINARY_DOWNLOAD=1`.)

### STEP 0 — Backlog
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items**. Bug-hunt run.

### STEP 2/3 — Area: (c) check-in + Progress + adaptive nutrition (front-end)
**Bug:** `src/pages/CheckIn/index.tsx:802` referenced an undefined identifier
`recent` inside the post-submit "Show Day Projection" render block.
**Reachability:** success state (`submitted`) + `checkinHistory.length >= 2` +
`user.show_date` set + `computeWeeklyWeightRate(checkinHistory, 5)` non-null +
`weeksToShow > 0` → the JSX evaluates `recent.length` → `ReferenceError` →
React render throws → the whole Check-In success screen crashes. A prepping
competitor (show on calendar, ≥2 weigh-ins) hits this on every check-in.
**Root cause:** stale reference to a window variable removed in a prior refactor
of the weekly-rate call; the caption "Avg over N check-ins" still read
`recent.length`.
**Fix:** `src/pages/CheckIn/index.tsx` — restored
`const recent = checkinHistory.slice(0, 5)` at the top of the projection IIFE
(the smoothing window matching the `5` passed to `computeWeeklyWeightRate`), so
`recent.length` renders the honest count (1–5) the rate was averaged over.
**Test:** `tests/unit/checkinSuccessProjection.test.tsx` — renders CheckIn (not
locked), seeds two prior check-ins >1 week apart + a future `show_date`, submits
a weigh-in, and asserts the "Show Day Projection" card renders without a
ReferenceError. Fails with `recent is not defined` before the fix; passes after.

### ⚠ Also found (NOT fixed this run — reported for owner)
1. **The STEP-1/STEP-4 tsc gate is vacuous.** `npx tsc --noEmit` resolves the
   root `tsconfig.json` (`"files": []`, solution `references`) and, without
   `--build`, type-checks no source at all. Every "tsc PASS" in this report has
   been meaningless; type errors ship undetected (this run's crash is proof).
   **Recommend** the owner change the gate to `tsc -b` (or
   `tsc -p tsconfig.web.json --noEmit && tsc -p tsconfig.node.json --noEmit`).
   Filing as a backlog candidate.
2. **`src/pages/Diet/index.tsx:228`** — `culture_pref: prefsCuisine` is a
   `string` assigned to a cuisine string-literal union (TS2322 under the real
   check). **Runtime-safe** (the value comes from a fixed-option dropdown, and
   its sibling `dietary_restrictions` field is already `as any`-cast), so it is
   NOT a reachable defect and is left untouched under the one-fix rule. Would be
   trivially fixed alongside the tsc-gate change.

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` (routine gate) → PASS
- `npm test` → **341 passed** (+1 new)
- `npx electron-vite build` → PASS

---

## Run: 2026-08-01 (BUG FIX — the dashboard **Daily Weigh-In** widget accepts an unbounded weight, so a fat-fingered extreme (`850` typed where `85.0` was meant, or an lbs value into a kg field) persists a nonsensical entry that poisons the widget's "7-day avg" and "weekly change" and survives a data reset. `DailyWeighInWidget.logDailyWeight` guarded only `raw <= 0`; the input's `min`/`max` attrs (metric 30–300 kg, imperial 66–660 lbs) are cosmetic — the browser does NOT block a JS-submitted (Enter / Save-click) out-of-range value. So `850` stored `weight_kg=850`, and both the 7-day rolling average and the ±/wk delta shown on the dashboard rendered garbage; `mergeWeighIns` (which folds this log into the reset-surviving weigh-in history) also has no ceiling, so the bad value outlived a reset. Mirrors the 2026-07-30 precedent that clamped fat-fingered check-in weights to 30–300 kg — the daily weigh-in was the remaining unguarded weight-entry seam. Fixed by rejecting a converted weight outside [30, 300] kg in the handler.)

### STEP 0 — Backlog
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (all queue items are `- [x]`). Bug-hunt run.

### STEP 1 — Regression guard (clean baseline on fresh rebased `master`)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (337 tests, 51 files)
- `npx electron-vite build` → PASS

(`npm ci` with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`.)

### STEP 2 — Area audited: (e) widgets (dashboard + Training/Nutrition tabs) + localStorage stores
Rotated off the recent (a) nutrition, (f) shows, (b) training, (c) check-in clusters. Deep-read the localStorage plumbing (`localStore.ts` `createLocalStore`, `createWidgetStore.ts`, `useWidgets.ts`, `useWaterLog.ts`, `competitionLogs.ts`, `cardioStore.ts`, `resetData.ts`) and every dashboard/tab widget: `QuickStats`, `TodaysMacros`, `NextMeal`, `DailyWeighIn`, `Sleep`, `Supplement`, `Posing`, `Condition`, `Water`, `Cardio`, `WeeklyScorecard`, `WeeklyVolume`, `TrainingVolume`, `MuscleCoverage`, `SessionsWeek`, `TodaysSession`, `RecentCheckins`, `CheckinFeedback`, `PrepPace`, `PrepGuidance`, plus `TabWidgetZone`/`TabWidgetControls`/`tabWidgets.ts`. The stores are well-hardened (top-level shape guards on corrupted/hand-edited storage, div-by-zero guards, reorder bounds checks, id migration, reset-preservation). The one genuine reachable defect: the unbounded daily weigh-in input.

Noted as **leads (not fixed this run)**, both pre-existing architectural mismatches, not minimal fixes:
- The Diet page (`src/pages/Diet/index.tsx`) keeps its own single-entry-per-day cardio model, writing `cardio_log` directly (no `id`, collapsing all of a day's entries to one) while the dashboard `cardioStore`/`CardioWidget` use a multi-entry-per-day model summing all entries. Using both views can undercount the weekly cardio total and lose sessions — but reconciling the two models is a refactor, out of "minimum change" scope.
- `CheckinFeedbackWidget` does `latestCheckin.adjustments.notes.map(...)` without the `?.` guard that `RecentCheckinsWidget` uses; only reachable if a `weekly_checkins.adjustments` column is NULL/corrupt (not produced by any normal insert path), so low reachability.

### STEP 3 — Root cause + fix
- **Root cause:** `src/components/widgets/DailyWeighInWidget.tsx` `logDailyWeight` validated only `isNaN(raw) || raw <= 0`. No upper (or realistic lower) bound, so any positive number persisted to `daily_weight_log` and flowed into the `avg7` / `avgPrev7` / `weeklyChange` display math and (via `mergeWeighIns`) the reset-surviving history.
- **Fix (minimum change):** after converting the entered value to kg, `if (weight_kg < 30 || weight_kg > 300) return`. Bounds match the input's own declared min/max (metric 30–300 kg; imperial 66–660 lbs ≈ 30–300 kg) and the check-in weight clamp range. Rejects rather than clamps, matching the existing `raw <= 0` reject style so a bogus value isn't silently recorded as a sane-but-wrong one.

### Tests added — `tests/unit/dailyWeighInBounds.test.tsx` (new, jsdom)
- `rejects an absurd fat-fingered weight (850 kg)` — types 850, clicks Save, asserts nothing written to `daily_weight_log` and no "today" row renders. **Confirmed fail-first** (`expected '[{…weight_kg:850…}]' to be null`), passes after.
- `rejects a below-floor weight (5 kg)` — same, floor guard.
- `accepts and stores a sane weight (85 kg)` — 85 persists with `weight_kg === 85` and the confirmation row renders (regression guard on the happy path).

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (340 tests, +3 new)
- `npx electron-vite build` → PASS

---

## Run: 2026-07-31 #2 (BUG FIX — `plan:recalculateMacros` does NOT self-heal a legacy `calories_target=0` row despite a comment claiming it does. The Diet page's "⟳ Recalculate Macros" button recomputes protein/carbs/fat from the athlete's current body weight while keeping their meal structure. A legacy/pre-sanitize `diet_plans` row can carry `calories_target=0`; the handler floors that to `MIN_CALORIE_TARGET` (1200) *locally* for the ratio math — and its own comment says "Self-heals such a row to a valid target on recalculation" — but the `UPDATE` only wrote `protein_g`/`carbs_g`/`fat_g`/`meals`, never `calories_target`. So the stored target stayed **0** while the recomputed macros reflected a full 1200-kcal plan: the Diet page then renders a "0 kcal" daily target beside a non-zero ~196g protein / ~331g carb target (internal inconsistency), and every calorie-scaling consumer keeps dividing by a stored 0. The sibling check-in adaptive recalc (`checkin:submit`) already writes `calories_target` back after flooring — recalc was the lone gap. Fixed by adding `calories_target=?` (the floored `calories`) to the recalc UPDATE.)

### STEP 0 — Backlog
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (all queue items are `- [x]`). Bug-hunt run.

### STEP 1 — Regression guard
Clean pull of `master`. Baseline all green before any change:
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (335 tests, 50 files)
- `npx electron-vite build` → PASS

(`npm ci` run with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`.)

### STEP 2 — Area audited: (a) nutrition engine + Diet flows
Rotated off last run's (f) shows/competition. Read deeply: `nutritionEngine.ts` (BMR/TDEE, phase-aware deficit, `buildMeals`, meal templates, portion/snack math, clamps), `planHandlers.ts` (generate/recalc/refine/AI-request diet paths), `checkinHandlers.ts` + `checkinEngine.ts` (adaptive macro recalc), `mealCompletionHandlers.ts`, and the Diet page (`index.tsx` intake math, `refeed.ts`, `GroceryList.tsx`). The engine and most handlers are heavily hardened (calorie/macro/weight/meal-count sanitizers, div-by-zero guards). The one genuine defect: the manual macro-recalc handler's incomplete self-heal (above).

### STEP 3 — Root cause & fix
`electron/ipc/planHandlers.ts` `plan:recalculateMacros` (~line 553): the `UPDATE diet_plans SET …` omitted `calories_target`, so a floored value was computed but never persisted. Added `calories_target=?` bound to the floored `calories` local — a no-op for any valid (>= 1200) plan and a true self-heal for a 0/sub-floor legacy row. Mirrors `checkin:submit`'s recalc, which already writes it back.

### Tests added
`tests/unit/recalculateMacrosZeroTarget.test.ts` — exercises the REAL handler against an in-memory `node-sqlite3-wasm` DB: (1) a stored `calories_target=0` row is healed to `>= MIN_CALORIE_TARGET` with body-weight-derived protein (85 kg → 196g); (2) a normal 2400-kcal plan's target is left unchanged. Verified the test FAILS without the fix (`expected 0 to be >= 1200`) and PASSES with it.

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (337 tests, +2 new)
- `npx electron-vite build` → PASS

---

## Run: 2026-07-31 (BUG FIX — `shows:delete` is the ONE show-context mutation that failed to regenerate the diet plan. The Settings show list renders a **Delete** button next to **Cancel Show** for every upcoming show, including the primary. When a user has ≥2 upcoming shows and DELETES the primary (nearer) one, `syncPrimaryToNearest` re-points `users.show_date`/`division` at the next upcoming show — but the delete handler returned without regenerating the diet, so the stored `diet_plans` row (its `generated_at_weeks_out`, phase, and calorie deficit) stayed pinned to the DELETED show's weeks-out. The sidebar countdown, prep timeline, and Peak-Week widget all followed the new show while the Diet page kept serving the deleted show's macros — a persistent DB↔UI desync (the Diet page reloads the STORED plan on mount, so it never self-heals). `shows:add`, `shows:update` (date change), `shows:cancelShow` (→ next show), and `setPrimaryShow` all already regenerate; delete was the lone gap. Fixed by regenerating the diet in the delete handler's "another upcoming show remains" branch when the deleted show was the primary.)

### STEP 0 — Backlog
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (all queue items are `- [x]`). Bug-hunt run.

### STEP 1 — Regression guard (clean baseline on fresh rebased `master`)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (333 tests, 49 files)
- `npx electron-vite build` → PASS

(`npm ci` with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`.)

### STEP 2 — Area audited: (f) shows/competition + date/week logic
Rotated off the last runs' (b) training-engine and (c) check-in/adaptive-nutrition clusters. Deep-read `showDates.ts` (`weeksUntilShow`/`localToday`), `showHandlers.ts` (all 6 IPC handlers + `syncPrimaryToNearest`/`regenerateDietForGoal`/`setPrimaryShow`/`transitionTrainingToOffSeason`), `competitionPrep.ts` (`getWeekGuidance`/`buildPrepTimeline`/`PEAK_WEEK_PROTOCOL`), `utils/dates.ts` (`getShowCountdown` local-midnight/noon math), the show/countdown widgets (`PeakWeekWidget`, `PrepGuidanceWidget`, `PrepPaceWidget`, `QuickStatsWidget`, `WeeklyScorecardWidget`, `NavSidebar`), the Training "Show Day Countdown" card, and `checkinSchedule.ts` week-rollover helpers. Nearly everything is already well-hardened by prior runs (local-date convention everywhere, past-show `isPast` guards, DST-safe day math, per-period missed-slot cadence).

Investigated but found NOT a defect: the `PeakWeekWidget` day-mapping `daysOut = max(1, totalDays)` looked off-by-one (day-before-show maps to the "Show Day" protocol), but the Education page (`index.tsx:944`) renders the same `PEAK_WEEK_PROTOCOL.days` treating `daysOut` as literal days-until-show with `daysOut:1` deliberately doubling as "Show Day" — so the widget is consistent with the app's own model, not a bug. Left it alone per "do not fix correct code."

The one **real, reachable** backend defect: `shows:delete` not regenerating the diet when the deleted primary show has a remaining upcoming successor.

### STEP 3 — Root cause + fix
- **Root cause:** `electron/ipc/showHandlers.ts` `ipcMain.handle('shows:delete', …)` — after deleting a show and calling `syncPrimaryToNearest` (which re-points `users.show_date`/`division`), the `hasUpcoming === true` branch returned `{ shows, message: null, needs_goal_selection: false }` with no diet regeneration. Every sibling handler (`cancelShow`'s `next_show` branch at ~L281–286, `setPrimaryShow` at ~L324–331, `add`, `update`) regenerates via `regenerateDietForGoal`; delete was the lone omission.
- **Fix (minimum change — mirror the sibling handlers, guarded to the buggy path):** in the delete handler's "another upcoming show remains" branch, when the DELETED show was the primary (`show.is_primary === 1`, read from the row fetched before deletion), fetch the (freshly re-pointed) user, compute `weeksOut = computeWeeksOut(user.show_date)`, and call `regenerateDietForGoal`. Guarding on `is_primary` keeps deleting a NON-primary show a no-op for the diet (no needless churn / meal-completion clearing), so only the actual desync path regenerates. `clearOrphanedMealCompletions` (invoked inside `regenerateDietForGoal`) is a no-op when the meal count is unchanged, so completions are preserved.

### Tests added — `tests/unit/showDeleteDiet.test.ts` (new)
- `re-points the diet plan at the next upcoming show (no stale weeks-out / phase)` — seeds a near (~2 wk out) primary show + a far (~18 wk out) show, generates the near diet, invokes the REAL registered `shows:delete` handler (captured via a fake `ipcMain`) on the primary, and asserts `users.show_date`/`division` AND `diet_plans.generated_at_weeks_out` both follow the far show. **Confirmed fail-first** (reverted the fix: `expected 2 to be 18`), passes after.
- `leaves the diet untouched when a NON-primary show is deleted (no needless churn)` — deleting the far (non-primary) show leaves the primary and the diet's `generated_at_weeks_out` unchanged (regression guard on the `is_primary` guard).

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (335 tests, +2 new)
- `npx electron-vite build` → PASS

### Lead for a future run
The frontend `deleteShow` store action (`src/store/userStore.ts`) only re-fetches the diet plan when the handler returns a `message` or `needs_goal_selection` — neither is set on the "another show remains" branch, so the in-memory `planStore.dietPlan` stays stale until the Diet page remounts and reloads it (which it does on mount, so the persisted fix above is the real correctness fix). A future run could make `deleteShow` always refresh `dietPlan`/`trainingPlan` after a delete so dashboard widgets update immediately without a navigation — mirroring how `setPrimaryShow`'s store action also skips the refresh (same transient-staleness pattern).

---

## Run: 2026-07-30 #2 (BUG FIX — the low-recovery deload override in `plan:generateTraining` forces the deload PHASE by faking `weeks_out = 1`, but `generateTrainingPlan` derives the plan's DURATION from the same field — `weeks_total = Math.min(weeks_out, 16)` — so the hack collapses the stored plan length to **1 week**. A user with a real prep (e.g. 12 weeks out) who logs a low energy + sleep check-in and then regenerates training gets a plan with `weeks_total = 1`. That shows "1 weeks" in the Training **Duration** card and pins the Show-Day countdown's prep-% at `0%` for the rest of prep (`weeksDone = max(0, 1 − weeksOut) = 0`) — a DB↔UI desync. The same field also drove the Claude prompt (`weeks_out=1` → the prompt told Claude `weeks_total=1`), so the Claude path was corrupted identically. Fixed with a `force_deload` flag that forces only the phase, preserving the true `weeks_total`.)

### STEP 0 — Backlog
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (all queue items are `- [x]`). Bug-hunt run.

### STEP 1 — Regression guard (clean baseline on fresh rebased `master`)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (331 tests, 49 files)
- `npx electron-vite build` → PASS

(`npm ci` with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`.)

### STEP 2 — Area audited: (b) training engine + workout/session flows
Rotated off the last three runs' (c) check-in/adaptive-nutrition and (d) Settings/onboarding clusters. Deep-read `trainingEngine.ts` (split builders, `getExercises`/`getExercisesByMuscleGroup`, `getSets`/`buildExercises`, `determinePhase`, the freq/exPerSession/setsPerEx/maxSets guards), `workoutHandlers.ts` (all 11 IPC handlers), `WorkoutSession.tsx` / `WorkoutLogEditor.tsx` / `SessionEditor.tsx` / `WorkoutStats.tsx`, the `Training/index.tsx` widgets + session/history rendering, and the utils (`clampSetCount`, `parseRepMidpoint`, `detectNewPRs`, `dates`). Nearly everything is already well-hardened by prior runs (empty-session guards for every split/equipment, undefined→NULL set-update binding, clamped set counts, NaN-safe rep parsing, all-time PR comparison, local-date handling).

Investigated but found NOT reachable/harmful this run: an empty-exercise session (SessionEditor can save one) renders a `width: NaN%` progress bar — but jsdom **and** real browsers silently drop an invalid `NaN%` width, so the bar just reads 0% (a non-defect); noted as a minor UX lead only.

The one **real, reachable** backend defect: the check-in-driven deload override corrupting `weeks_total`.

### STEP 3 — Root cause + fix
- **Root cause:** `plan:generateTraining` (`electron/ipc/planHandlers.ts:35-37`) forced a recovery deload by setting `input.weeks_out = 1`. `generateTrainingPlan` (`trainingEngine.ts`) derives BOTH the phase (`determinePhase(weeks_out)`) AND the duration (`weeks_total = Math.min(weeks_out, 16)`) from `weeks_out`, so the phase-forcing hack silently overwrote the plan's real duration with 1. The Claude prompt (`claudeService.ts`) likewise derived `prepPhase` and `weeks_total` from `weeks_out`, so passing `weeks_out=1` corrupted that path too.
- **Fix (minimum correct change — decouple phase-forcing from duration):**
  - `electron/services/trainingEngine.ts` — added an optional `force_deload?: boolean` to `TrainingInput`; `generateTrainingPlan` now computes `phase = input.force_deload ? 'deload' : determinePhase(...)`, leaving `weeks_total` derived from the real `weeks_out`.
  - `electron/services/claudeService.ts` — `generateWorkoutWithClaude` now reads `workoutProfile.force_deload`; when set, `prepPhase = 'deload'` while `weeks_out`/`weeks_total` stay the real prep length.
  - `electron/ipc/planHandlers.ts` — the low-recovery branch now sets `(input as any).force_deload = true` instead of `weeks_out = 1`, and passes `force_deload` into the Claude `workoutProfile`. Real `weeks_out` is preserved for both `weeks_total` and the stored `generated_at_weeks_out`. The `else` branch (high-adherence experience bump) is unchanged.
  - Only this one handler applied the override (confirmed by grep); `regenerateAll`, the show-change recalc, and the AI-request path use the real `weeks_out` and are unaffected.

### Tests added — `tests/unit/trainingEngine.test.ts`
- `force_deload sets the deload phase without collapsing weeks_total` — `{weeks_out:12, force_deload:true}` → phase `deload`, `weeks_total` **12** (was the corrupted 1); no-show + `force_deload` → phase `deload`, `weeks_total` 12 (default). **Confirmed fail-first** (reverted the engine phase line: `expected 'strength' to be 'deload'`), passes after.
- `without force_deload the phase follows weeks_out (unchanged behavior)` — `{weeks_out:12}` → phase `strength`, `weeks_total` 12 (regression guard on the default path).

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (333 tests, +2 new)
- `npx electron-vite build` → PASS

### Lead for a future run
SessionEditor lets a user remove **all** exercises and Save (`plan:updateSession` stores `[]` verbatim), and `handleStartWorkout` will then start a workout on a zero-exercise session — creating an in-progress `workout_logs` row that can only be Abandoned (uncompletable, `canComplete` false) and that the auto-resume keeps restoring. A future (b) run could guard `handleStartWorkout` (or `plan:updateSession`) against an empty session. The `width: NaN%` it also produces is inert (browsers drop it), so the log-orphan is the real harm.

---

## Run: 2026-07-30 (BUG FIX — `clampWeightKg`, the *shared* bodyweight→macro guard, floors at 30 kg but has **no ceiling**, so the check-in adaptive recalc and the manual `plan:recalculateMacros` derive protein/fat from an **unbounded** check-in weight. The Check-In page's `toKg` only rejects `≤ 0` (no upper bound), so a fat-fingered `850` — meant `85.0`, or an lbs value typed into a kg field — persists a check-in weight of 850 kg and drives `protein_g = round(850·2.3) = 1955`, `fat_g = round(850·0.9) = 765`, `carbs_g = 0` into the diet plan: a nonsensical, dangerous macro target. The 07-29 #2 run clamped the *user-record* write via `clampWeightKgField` (30–300) but explicitly noted `clampWeightKg` "only FLOORS at 30 (no ceiling)" — this is that same invariant, left open on the check-in / recalc entry points.)

### STEP 0 — Backlog
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (all queue items are `- [x]`). Bug-hunt run.

### STEP 1 — Regression guard (clean baseline on fresh rebased `master`)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (330 tests, 49 files)
- `npx electron-vite build` → PASS

(`npm ci` with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`.)

### STEP 2 — Area audited: (c) check-in + Progress + adaptive nutrition
Rotated off the last two runs' (d) Settings/onboarding and (e)+(a) widgets/Diet clusters. Deep-read `checkinEngine.ts` (weight-trend normalization, `weightTrendPct`/`weightTrend`, recovery/stress/adherence notes), `checkinHandlers.ts` (submit / submitMissed / update — duplicate-day guard, week_number renumber-on-date-edit, non-finite drop all confirmed guarded), `checkinSchedule.ts` (`getNextCheckinDate`/`computeMissedSlots` — anchor walk-back, late≠missed, biweekly cadence all correct), `progressHandlers.ts`, `Progress/index.tsx`, and the `weeklyRate`/`weeksTracked` utils (both null-guarded and span-based). All well-guarded.

The one **real, reachable** defect: the adaptive-nutrition macro derivation trusts the check-in weight with no upper bound. Traced end-to-end:
- **Input boundary** `src/pages/CheckIn/index.tsx` `toKg` (`:153`) and the edit path (`:508`) reject only `≤ 0` — a typed `850` passes through.
- **Adaptive recalc** `electron/ipc/checkinHandlers.ts:137` — `weightKg = clampWeightKg(data.weight_kg, …)`; `protein_g = round(weightKg·2.3)`.
- **Manual recalc** `electron/ipc/planHandlers.ts:534` — same, from `latestCheckin.weight_kg`.
- **The guard** `electron/services/nutritionEngine.ts:823` `clampWeightKg` — floors at 30 → `fallback`, but returns any high value verbatim. Its own docstring says it is "Shared by every call site that derives protein/fat directly from bodyweight (plan generation, check-in macro recalculation, manual macro recalculation)" — it was guarding one end only.

### STEP 3 — Root cause + fix
- **Root cause:** `clampWeightKg` had a floor but no ceiling, and the check-in weight is unbounded at its input boundary — so a typed extreme reached the macro math and inflated the stored diet plan.
- **Fix (minimum change, at the documented shared seam):** `electron/services/nutritionEngine.ts` — added `export const MAX_WEIGHT_KG = 300` (matches Onboarding/Settings `validateStep`) and changed `clampWeightKg` to cap the high end: missing/`<30`/non-finite → `fallback` (unchanged); otherwise `Math.min(weight, 300)`. This closes the ceiling gap for **all three** call sites at once (plan generation, check-in recalc, manual recalc) and makes the check-in entry point agree with the already-clamped user-record write. Existing floor/fallback behavior (0/-10/NaN/undefined → 70; custom fallback) is preserved exactly.

### Tests added — `tests/unit/nutritionEngine.test.ts`
- `clamps an implausibly high weight to the 300 kg ceiling` — `clampWeightKg(850) → 300`, `(301) → 300`, `(300) → 300`. **Confirmed fail-first** (stashed the fix: `expected 850 to be 300`), passes after.

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (331 tests, +1 new)
- `npx electron-vite build` → PASS

### Lead for a future run
The *stored* check-in weight itself is still unbounded (the 850 kg row persists and displays as "Current Weight" in Progress and feeds the raw trend/projection). Only the macro derivation is now bounded. A future (c)/(d) run could clamp the check-in weight at its input/write boundary (30–300, mirroring `clampWeightKgField`) so the displayed weight agrees too.

---

## Run: 2026-07-29 #2 (BUG FIX — the Settings "Edit profile" save path persists `age` / `height_cm` / `weight_kg` **unclamped**. Onboarding gates these to age 16–80, height 100–250 cm, weight 30–300 kg via `validateStep`, but the Settings save calls `user:update` → `sanitizeUserUpdate`, which clamps `meal_count`/`snack_count`/`body_fat_pct` but NOT these three. The HTML `min`/`max` on the `<input type="number">` boxes only bound the spinner arrows — a *typed* extreme (e.g. `850` from a fat-fingered `85.0`, or a cm value typed into the imperial inches box) passes straight through `parseFloat`. `clampWeightKg` only FLOORS at 30 (no ceiling), so an 850-kg weight then drives `calcBMR`/TDEE to a ~13,000 kcal / ~1,955 g protein plan — a nonsensical, dangerous target. Same fields, two entry points, one guarded and one not.)

### STEP 0 — Backlog
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (`grep '^\- \[ \]'` → no match; all queue items are `- [x]`). Bug-hunt run.

### STEP 1 — Regression guard (clean baseline on fresh rebased `master`)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (328 tests, 49 files)
- `npx electron-vite build` → PASS

(`npm ci` with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`.)

### STEP 2 — Area audited: (d) onboarding + Settings + data lifecycle — chasing the explicit lead the 2026-07-29 run recorded
Rotated off last run's dashboard-widget / Diet-flow cluster. The prior run's "Lead for a future run" named the exact seam: Settings profile editor has no upper-bound clamp on `weight_kg` / `height_cm` / `age`. Confirmed it reachable end-to-end:
- `src/pages/Settings/index.tsx` — the age/height/weight inputs use `onChange={… parseFloat(e.target.value)}` with only HTML `min`/`max` attrs (age `16`/`80`, height `100`/`250` or imperial, weight `30`/`300` or imperial). Those attrs bound the spinner arrows only; a keyboard-typed `850` sets `editForm.weight_kg = 850`. `handleSaveProfile` (`:109`) then calls `updateUser({ ...editForm })` with no range check.
- `electron/ipc/userSanitize.ts` `sanitizeUserUpdate` — clamps `meal_count` (1–20), `snack_count` (0–20), `body_fat_pct` (3–60), and drops non-finite numbers, but passed `age`/`height_cm`/`weight_kg` through verbatim.
- `electron/services/nutritionEngine.ts` `clampWeightKg` (`:823`) guards downstream consumers but is a **floor only** (`>= 30 ? … : fallback`) — no ceiling — so `generateNutritionPlan` (`:872`) computes `protein_g = 850 * 2.3 = 1955` and `calcBMR(850, …) ≈ 9442 → TDEE ≈ 14,635`.
- `src/pages/Onboarding/*` `validateStep` (`:22-24`) already enforces age 16–80 / height 100–250 / weight 30–300 and blocks the wizard — so the two entry points disagreed on the same invariant.

Also re-verified already-guarded in this area: `sanitizeUserUpdate` non-finite drop (cleared field → NaN → dropped, stored value preserved), `resetAllData`, `clampMealCount`/`clampSnackCount`/`clampBodyFatPct`. No other unclamped required-column write found.

**Real reachable bug found** at the `sanitizeUserUpdate` write seam.

### STEP 3 — Root cause + fix
- **Root cause:** `sanitizeUserUpdate` never clamped `age`/`height_cm`/`weight_kg` to the physiological ranges Onboarding enforces, and `clampWeightKg` (the only downstream guard) has no ceiling. A Settings save of a typed extreme persisted it and inflated the diet plan.
- **Fix (minimum change, mirrors the existing `clampBodyFatPct` pattern in the same file):** added `clampProfileNumber(value, min, max)` plus `clampAge` (16–80, rounded), `clampHeightCm` (100–250), `clampWeightKgField` (30–300) to `electron/ipc/userSanitize.ts`, and wired them into `sanitizeUserUpdate`'s serialized map. The ranges are exactly Onboarding's `validateStep` bounds, so both entry points now agree. A non-finite value (cleared field → NaN) still returns `undefined` → dropped by the final filter → stored value preserved (never NULLing a required column — the existing behavior the 2 non-finite tests assert is unchanged).

### Tests added — `tests/unit/userSanitize.test.ts`
- `clamps out-of-range age / height_cm / weight_kg to the Onboarding bounds` — `{age:850, height_cm:900, weight_kg:850}` → `80/250/300`; `{age:4, height_cm:5, weight_kg:2}` → `16/100/30`. **Confirmed fail-first** (stashed the fix: `expected 850 to be 300` etc.), passes after.
- `leaves in-range age / height_cm / weight_kg untouched` — `28/180/82.5` pass through verbatim.

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (330 tests, +2 new)
- `npx electron-vite build` → PASS

---

## Run: 2026-07-29 (BUG FIX — `TodaysMealsWidget`'s calorie/protein progress bars divide by `dietPlan.calories_target` / `dietPlan.protein_g` with NO `> 0` guard, while every sibling nutrition surface (TodaysMacrosWidget, Diet "Today's Intake") guards the identical division. A stored plan with `calories_target = 0` — a legacy/pre-sanitize row that `plan:recalculateMacros` floors only *locally* and never writes back — makes the dashboard bar render `width: NaN%` (blank bar) with 0 meals logged, or a falsely-**100%**-full bar once any meal is logged (`x/0 → Infinity → min(100, Infinity) = 100`). The same 0 plan shows correct 0% in the sibling widget beside it — a visible DB↔UI disagreement.)

### STEP 0 — Backlog
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (all queue items are `- [x]`). Bug-hunt run.

### STEP 1 — Regression guard (clean baseline on a fresh rebased `master`)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (325 tests, 48 files)
- `npx electron-vite build` → PASS

(`npm ci` with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`.)

### STEP 2 — Area audited: (e) dashboard widgets + (a) Diet flows, rotating off last run's diet-write-seam + widget cluster
Deep-read the training engine/session/stats/log-editor/handlers, checkin engine + handlers, shows/date logic, and Progress page — all found well-guarded (no new reachable defect). Then swept the nutrition/diet UI + dashboard widgets + Settings/onboarding for the fix target. Verified already-guarded: `meal_completions` (`UNIQUE(user_id,date,meal_index)` + `INSERT OR REPLACE`), settings upsert, `TodaysMacrosWidget`/`NextMealWidget`/`WeeklyScorecardWidget`/`PrepPaceWidget`/`QuickStatsWidget`/`PeakWeekWidget` divisions and empty states, `computeWeeklyWeightRate`/`weeksTracked`, `GroceryList` parsing, `refeed`/`swapAlternatives`. Ruled out a flagged `TrainingVolumeWidget:79` "population mismatch" as NOT reachable — `workout_logs.started_at` is `NOT NULL DEFAULT (datetime('now'))` and `ended_at` is always set by `workout:complete`, so every `completed` log has both timestamps and `sessionsWithDuration === thisWeekLogs.length` (no mismatch).

**Real reachable bug found** at the `TodaysMealsWidget` render seam.

### STEP 3 — Root cause + fix
- **Root cause:** `src/components/widgets/TodaysMealsWidget.tsx:68-69` computed `calPct`/`proteinPct` as `eatenX / dietPlan.target` with no `> 0` guard. The `calories_target = 0` state is one the codebase explicitly defends against elsewhere (nutritionEngine `buildMeals` floor `:345`, `plan:recalculateMacros` floor `:528`, `checkin:submit` ratio floor, and the guards in `TodaysMacrosWidget:23-26` + Diet `index.tsx` "Today's Intake"). `plan:recalculateMacros` floors `calories` locally (`:528`) but its UPDATE (`:550-552`) writes only `protein_g/carbs_g/fat_g/meals` — it never persists `calories_target`, so a pre-existing 0 survives recalcs and refines (refine `:580-582` also never writes `calories_target`) until the next `checkin:submit` heals it via `Math.max(1200, …)`. In that window the dashboard divides by 0.
- **Fix (minimum change, mirrors the sibling exactly):**
  `const calPct = Math.min(100, dietPlan.calories_target > 0 ? Math.round((eatenCals / dietPlan.calories_target) * 100) : 0)` and the same `dietPlan.protein_g > 0 ? … : 0` for `proteinPct`. Now a 0-target plan clamps both bars to a valid `0%`, matching `TodaysMacrosWidget` beside it.

### Tests added
- `tests/unit/todaysMealsWidgetZeroTarget.test.tsx` (jsdom): renders `TodaysMealsWidget` with a `calories_target = 0 / protein_g = 0` plan. (1) no meals logged → all bar widths are a valid `0%` (not NaN/blank); (2) one meal logged against the 0 target → bars clamp to `0%` (was `100%` before the fix — the failing case); (3) a valid 2000-kcal plan with 1000 kcal logged still renders `50%`. Test 2 failed against the pre-fix code (`expected '100%' to be '0%'`) and passes after.

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (328 tests, +3 new)
- `npx electron-vite build` → PASS

### Lead for a future run (NOT fixed this run — one fix per run)
Settings profile editor has **no upper-bound clamp** on `weight_kg` / `height_cm` / `age`: `clampWeightKg` (`nutritionEngine.ts:823`) only floors at 30 (no ceiling), `sanitizeUserUpdate` doesn't range-check these, and the plan-calorie `Math.max(1200, …)` is a floor only. A typo (e.g. `850` for `85.0`, or a cm value typed into the imperial inches box) persists and inflates the diet plan to a ~13,000 kcal / ~1,955 g protein target. Onboarding is protected by `validateStep`; the Settings save path is not. Candidate: add `clampWeightKg` upper bound + `clampHeight`/`clampAge` guards at the `sanitizeUserUpdate` seam.

---

## Run: 2026-07-28 #2 (BUG FIX — the AI diet-generation write seam stores `cr.protein_g ?? 0` / `cr.carbs_g ?? 0` / `cr.fat_g ?? 0`, so a Claude response that omits (or returns null/0 for) the top-level macros persists a **0-gram protein/carb/fat target** — a nonsensical 0g protein goal for a bodybuilder AND a reachable divide-by-zero in TodaysMealsWidget's unguarded `eatenProtein / dietPlan.protein_g` → `NaN%` bar. The sibling `calories_target` was hardened for exactly this in the 07-22 run via `sanitizeCalorieTarget`; the macros were left with the naive `?? 0`.)

### STEP 0 — Backlog
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** — nothing to implement, so this was a bug-hunt run.

### STEP 1 — Regression guard (all PASS on a clean pull of `master`)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (324 tests, 48 files)
- `npx electron-vite build` → PASS

(`npm ci` run with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`.)

### STEP 2 — Area audited: (d/e) data lifecycle + widgets + localStorage stores, then the AI diet write seam
Rotated away from the recent progress/check-in/diet-UI cluster. Audited and found **clean/well-guarded**: `createWidgetStore`/`localStore` (shape-checked corrupt storage), `useWaterLog`+`WaterWidget` (NaN/zero guards), `resetData` (validated weigh-in merge), `userSanitize`/`user:update` (drops non-finite → no NULLed columns), Settings profile edit (Steppers + sanitize seam), Onboarding numeric inputs (`? : undefined` + validation), `checkinEngine`/`weeklyRate`/`dates` (bodyweight & span guards), `WeeklyScorecardWidget`/`SleepWidget`/`WorkoutStats`/`TrainingVolumeWidget`/`swapAlternatives` (all divisions guarded or floored).

**Real reachable bug found** at the AI diet-generation seam.

### Root cause + fix
`electron/ipc/planHandlers.ts` `plan:generateDiet` (Claude path), line ~189: after `generateDietWithClaude`, the INSERT bound
`cr.protein_g ?? 0, cr.carbs_g ?? 0, cr.fat_g ?? 0`. `?? 0` only catches null/undefined and, worse, actively persists 0 when a macro is missing. The model's JSON is untrusted — it can omit or null any of these — so the stored plan gets a 0-gram macro target. Downstream:
- Athlete sees "0g / 0g" protein target and a 0g goal everywhere.
- `src/components/widgets/TodaysMealsWidget.tsx:69` `eatenProtein / dietPlan.protein_g` → `0/0 = NaN` (nothing logged yet) → `proteinPct = NaN` → `width: NaN%` (invalid CSS, blank bar) + red color. (Its sibling `TodaysMacrosWidget` guards with `protein_g > 0 ?`; this one doesn't.)

**Fix (guard at the seam, mirroring the calories treatment):**
- `electron/services/nutritionEngine.ts` — new `sanitizeMacroGrams(raw, mealsMacroSum)`: coerces an untrusted macro to a finite, non-negative value; falls back to the **summed per-meal grams** the model DID return (per-meal `protein_g`/`carbs_g`/`fat_g` are already stored in `cr.meals`) when the top-level value is missing/invalid/zero. Returns 0 only when both are absent (pathological empty plan).
- `electron/ipc/planHandlers.ts:189` — replaced the three `?? 0` binds with `sanitizeMacroGrams(cr.<macro>, Σ per-meal <macro>)`. So an AI plan that lists meals with macros but omits the top-level totals now stores the correct summed targets instead of 0.

Only the Claude generate-diet seam had this gap: the check-in and AI-refine paths derive protein/fat from bodyweight (already clamped) or fall back to the current plan, and the rule engine supplies sane values.

### Tests added
- `tests/unit/nutritionEngine.test.ts` — `sanitizeMacroGrams` cases: missing/null/0/NaN/Infinity/negative top-level all fall back to the summed per-meal grams; a valid value is preserved (and rounded); fully-empty → 0; result is always finite and ≥ 0.

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (325 tests, +1 new)
- `npx electron-vite build` → PASS

---

## Run: 2026-07-28 (BUG FIX — the "Projected to show" dashed line on the Progress weight chart never renders: the projected series carries a value only on the appended Show-Day row, so recharts' connectNulls has a single non-null point and draws no segment — the athlete sees a lone blue dot at the far right and an empty legend instead of the trajectory from their last weigh-in)

### STEP 0 — Backlog
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (`grep '^\- \[ \]'` returns nothing; the `[ ]`/`[x]` mentions in the header are the format legend, not queue items). Proceeded to a bug hunt.

### STEP 1 — Regression guard (clean baseline)
On a fresh rebased `master` pull: `npx tsc --noEmit` PASS · `npm test` PASS (319 tests, 47 files) · `npx electron-vite build` PASS. (`npm ci` with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`.) No regressions to fix.

### STEP 2 — Area audited: (a) nutrition engine + Diet flows (+ swept e/c/d/b for the fix target)
Rotated off last run's (f)+(e). Read the nutrition engine (`nutritionEngine.ts` — BMR/TDEE/deficit/macros, `clampWeightKg`/`MIN_CALORIE_TARGET`/`clampMealCount`/`sanitizeCalorieTarget`, buildMeals ratios), all Diet flows (`Diet/index.tsx`, `WeeklyMealView`, `GroceryList` portion parsing/aggregation, `swapAlternatives`, `refeed`, `recipeSteps`, `mealAccordion`), and the plan IPC handlers (`recalculateMacros`, `swapMeal`, `reorderMeals`, `previewGoalCalories`, `refineDiet`/`applyAIRequest`) — all well-guarded (finite/clamp guards, floored divisors, index-bounds, meal-count-mismatch, orphaned-completion purge). Also re-swept `checkinEngine` (weight-trend normalization), `checkinHandlers` (week_number, adaptive macro scaling), `trainingEngine` (freq/exPerSession/sets/maxSets guards), `units.ts`, `weeklyRate.ts`, CheckIn submit/edit/projection, `userSanitize` (drops non-finite profile values), `PrepPaceWidget`, `detectNewPRs`, `clampSetCount` — all clean. Confirmed the deferred **WeightChart projected-line** item is a real, reachable functional defect (a feature that renders nothing), and fixed it.

### The bug (root cause)
`src/components/charts/WeightChart.tsx` builds the `projected` series with `projected: null` on every actual weigh-in and a value **only** on the single appended `Show Day` row. The projected `<Line dataKey="projected" connectNulls>` needs **≥2 non-null points** to draw a segment; with exactly one non-null point there is nothing to connect, so the dashed blue "Projected to show" trajectory never draws. The custom `dot` renders only at the last index (Show Day), so the user is left with a lone blue dot at the far right of the chart and a legend promising a line that isn't there. Reachable on the Progress page whenever a show date is set and there are ≥2 check-ins (`Progress/index.tsx:509-510` passes `projectedWeightKg`/`weeksToShow`).

### STEP 3 — Fix (minimum correct change, extracted to a pure testable helper)
- New exported pure `buildWeightChartData(entries, units, projectedWeightKg?, weeksToShow?)` in `WeightChart.tsx` builds the rows and, when projecting, **seeds the last actual weigh-in's `projected` value with its own weight** so the dashed line has two endpoints (last actual → show day). No projection / no entries → unchanged (no phantom Show-Day row).
- The component now calls the helper for `data`; the empty-state guard reads `entries.length` (was `actualData.length`). No visual/style changes — the custom dot still fires only at the Show-Day index, so the last-actual point gains no extra dot; the orange "Actual" dot and blue Show-Day dot are unchanged, and the dashed segment now connects them.

### Tests added
`tests/unit/weightChartData.test.ts` (5 tests): no projection → all `projected` null; **with a projection → exactly 2 non-null projected points (the bug: previously 1), last-actual seeded to its own weight (last actual → show day)**; imperial seed/projection converted consistently; `weeksToShow` 0/negative or missing projection → no projection; empty entries → `[]` (no phantom row).

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (324 tests, +5 new; 48 files)
- `npx electron-vite build` → PASS

### Deferred (carried forward; lower severity / out of clear scope)
- **[cleanup] Settings past-show check** — `Settings/index.tsx` L602 duplicates the logic `getShowCountdown().isPast` now provides; could be simplified to use the field (tidy-up, not a bug).
- **[low] swap-sheet empty-string exclusion** — `swapAlternatives.getSwapAlternatives` `isExcluded` does `f.includes(ex.replace(/_/g,' '))`; a hand-edited/corrupted empty-string entry in `food_exclusions` would make `''.includes('')` true and filter out ALL swap options. Only reachable via corrupted DB data (the exclude UI never produces an empty id), so low priority.

---

## Run: 2026-07-27 #2 (BUG FIX — a show left on the calendar past its date makes PeakWeekWidget render the peak-week protocol with "SHOW DAY!" and QuickStatsWidget show "Show Day!" indefinitely, because getShowCountdown clamps totalDays to 0 and can't tell "today" from "already happened")

### STEP 0 — Backlog
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (`grep '^\- \[ \]'` returns nothing; the header `[ ]`/`[x]` mentions are the format legend, not queue items). Proceeded to a bug hunt.

### STEP 1 — Regression guard (clean baseline)
On a fresh rebased `master` pull: `npx tsc --noEmit` PASS · `npm test` PASS (310 tests, 45 files) · `npx electron-vite build` PASS. (`npm ci` with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`.) No regressions to fix.

### STEP 2 — Area audited: (f) shows/competition + date/week logic + (e) show-driven widgets
Rotated off last run's (b) training. Swept the backend show/date/checkin layer first — `showHandlers.ts` (syncPrimaryToNearest / setPrimaryShow / add / update / cancel / delete), `checkinHandlers.ts` (submit / submitMissed / update week_number renumbering + one-per-day invariants), `checkinSchedule.ts`, `nutritionEngine.ts` (BMR/TDEE/deficit/macros — all `clampWeightKg`/`MIN_CALORIE_TARGET`/`clampMealCount` guarded), `workoutHandlers.ts`, `progressHandlers.ts`, `mealCompletionHandlers.ts`, `planHandlers.ts` swap/reorder (index-bounds + count-mismatch guarded), and the water/volume widgets — all clean. Traced the deferred **PeakWeekWidget "SHOW DAY!" for a past show** item to root cause; it is real and reachable.

### The bug (root cause)
`src/utils/dates.ts getShowCountdown` computes `totalDays = Math.max(0, floor((show − todayMidnight)/day))`. The `Math.max(0, …)` clamp means a **past** show and a show **today** both report `totalDays === 0` — indistinguishable. Two widgets read `user.show_date` directly (not the upcoming-only filtered list that NavSidebar/Education use) and so break once the app is left open past the show day (before the next launch's `startupRefresh`/`syncPrimaryToNearest` repoints/NULLs a past `show_date`):
- `PeakWeekWidget.tsx` self-hides only for `totalDays < 0` (dead — never fires after the clamp) or `> 7`, and sets `isShowDay = totalDays === 0`. A past show → renders the full red peak-week protocol card with **"SHOW DAY!"** indefinitely.
- `QuickStatsWidget.tsx` (L37) → `if (totalDays === 0) return 'Show Day!'`, so the Show Countdown stat reads **"Show Day!"** for a past show.
`Settings/index.tsx` (L602) already hand-rolls the exact missing check — `countdown.totalDays === 0 && new Date(show.show_date+'T12:00:00') < new Date()` — which both confirms the defect and points at the right shared fix.

### STEP 3 — Fix (minimum correct change, additive to the shared helper)
- `getShowCountdown` now also returns **`isPast: boolean`** (`rawDays < 0`, computed before the `Math.max(0,…)` clamp). `totalDays` stays clamped so the ≥0 contract the other 6 callers rely on is unchanged; the new field is purely additive (every existing caller destructures only `weeks`/`days`/`totalDays`).
- `PeakWeekWidget.tsx`: hide condition `totalDays < 0` → `showCountdown.isPast`.
- `QuickStatsWidget.tsx`: the Show Countdown card now renders only when `showCountdown !== null && !showCountdown.isPast`; a past show falls through to the "Phase" card — exactly the state the app shows after the next relaunch, so it's consistent either way.

### Tests added
- `tests/unit/showCountdownPast.test.ts` (5 tests): show today → `isPast false`, totalDays 0; **yesterday → totalDays 0 but `isPast true` (the bug)**; a month ago → `isPast true`; +10d → `isPast false`, 1w 3d; +14d → 2w 0d.
- `tests/unit/pastShowWidgets.test.tsx` (4 tests, jsdom): PeakWeekWidget renders **nothing** for a yesterday show (no "SHOW DAY") yet **still renders** on the actual show day; QuickStatsWidget shows the **Phase** card (not "Show Day!") for a past show yet still shows "Show Day!" today.

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (319 tests, +9 new; 47 files)
- `npx electron-vite build` → PASS

### Deferred (carried forward; real but lower severity — the PeakWeekWidget/QuickStats past-show item above is now FIXED)
- **[chart] Projected trajectory renders a lone dot** — `charts/WeightChart.tsx` builds the `projected` series with a single non-null point (only the appended "Show Day" row), so with `connectNulls` there's no second point to draw the dashed blue "Projected to show" line to; the user sees just a floating dot. Fix: seed the projected series at the last actual weigh-in so the segment has two endpoints. Borderline (chart rendering) — verify it's treated as a functional defect, not cosmetic, before fixing.
- **[cleanup] Settings past-show check** — `Settings/index.tsx` L602 now duplicates the logic `getShowCountdown().isPast` provides; could be simplified to use the new field (a tidy-up, not a bug — the hand-rolled check is correct).

---

## Run: 2026-07-27 (BUG FIX — a free-text Reps entry with a stray dash like "12-" makes parseRepMidpoint return NaN, which seeds every set's default reps and propagates into the post-workout summary volume ("NaN") and the persisted reps_actual)

### STEP 0 — Backlog
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (`grep '^\- \[ \]'` returns nothing; the two `[ ]`/`[x]` mentions in the header are the format legend, not queue items). Proceeded to a bug hunt.

### STEP 1 — Regression guard (clean baseline)
On a fresh rebased `master` pull: `npx tsc --noEmit` PASS · `npm test` PASS (304 tests, 44 files) · `npx electron-vite build` PASS. (`npm ci` with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`.) No regressions to fix.

### STEP 2 — Area audited: (b) training session flow — the deferred `parseRepMidpoint` NaN item
Rotated off last run's (c) Progress. Swept area (f) date/week logic first (`utils/dates.ts getShowCountdown`, `showDates.ts`, `showHandlers.ts syncPrimaryToNearest/setPrimaryShow`, `checkinSchedule.ts` missed-slot math) and the nutrition/checkin engines + IPC handlers (`nutritionEngine`, `checkinEngine`, `checkinHandlers`, `mealCompletionHandlers`, `progressHandlers`) — all well-guarded (finite/clamp guards, `MIN_CALORIE_TARGET` floors, UNIQUE(user_id,date,meal_index), one-weigh-in-per-day invariants, week_number renumbering on date edits). Traced the deferred carry-forward **training** item, which is real, reachable, and always-on once triggered.

### The bug (root cause)
`src/pages/Training/WorkoutSession.tsx` seeds every set's default reps via `parseRepMidpoint(ex.reps)`. The old local helper split on `-` and, in the exactly-two-parts branch, did `Math.round((parseInt(parts[0]) + parseInt(parts[1])) / 2)` **with no NaN guard**; the `|| 10` fallback existed ONLY on the single-part branch. The Reps field in `SessionEditor.tsx` (L152-158) is FREE TEXT (`<input type="text">`, no validation) and persists whatever is typed. So a natural partial entry — `"12-"` (meant to be "12-15" but stopped) or `"-12"` — becomes `parts = ["12", ""]` → `Math.round((12 + NaN)/2)` === **NaN**. That NaN:
- seeds `reps: NaN` for every set in `buildInitialStates` (L215-223),
- makes the post-workout summary **total volume** `x.weight * x.reps` → NaN, shown to the user as "NaN" (`handleComplete`, L388-391),
- is persisted as `reps_actual: s.reps` (L430) — lost/desync'd (NaN → NULL in SQLite).
`parseRepMidpoint` was the SOLE NaN source for set reps: the live input path uses `Number(e.target.value)` (empty → 0, never NaN), so fixing the parser fully closes the hole.

### STEP 3 — Fix (minimum correct change, extracted to a pure testable helper)
- New pure `src/utils/parseRepMidpoint.ts`: extracts every numeric token (`split('-').map(parseInt).filter(Number.isFinite)`), returns the rounded midpoint of the lowest→highest present, and falls back to 10 when no numeric token exists. Valid ranges ("8-12"→10, "12"→12) behave exactly as before; malformed input ("12-"→12, "-12"→12, ""/"-"/"abc"→10) now yields a finite rep count.
- `WorkoutSession.tsx` imports the util and drops the local buggy copy (both call sites — L215 seed and the add-set handler ~L357 — are covered).

### Tests added
`tests/unit/parseRepMidpoint.test.ts` (6 tests): well-formed ranges → midpoint; lone number → itself; **"12-" → 12, not NaN (the bug)**; "-12" → 12; empty/"-"/"abc" → 10; and a sweep asserting no input in the malformed set ever returns NaN.

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (310 tests, +6 new; 45 files)
- `npx electron-vite build` → PASS

### Deferred (carried forward; each real and reachable but lower severity — the training `parseRepMidpoint` item above is now FIXED)
- **[widget] PeakWeekWidget shows "SHOW DAY!" for a past show** — `utils/dates.ts getShowCountdown` clamps `totalDays` to `Math.max(0, …)`, so a past show renders the red peak-week indicator (with "SHOW DAY!") when the app is left open past the show day; QuickStatsWidget shows "Show Day!" for the same reason. Self-heals on next launch via `startupRefresh`/`syncPrimaryToNearest` nulling a past `show_date`. Fix needs care: 6 callers rely on the `>= 0` clamp, so distinguish past-vs-today without changing the shared contract (a widget-local past check or a separate signed helper).
- **[chart] Projected trajectory renders a lone dot** — `charts/WeightChart.tsx` projected series has one non-null point so the dashed line never draws.

---

## Run: 2026-07-26 #2 (BUG FIX — Progress's "Weeks Tracked" stat shows the number of check-ins, not the elapsed calendar span, so a more-than-weekly athlete sees a wildly inflated week count)

### STEP 0 — Backlog
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (the two `- [ ]` grep hits are the format-legend lines in the header, not queue items). Proceeded to a bug hunt.

### STEP 1 — Regression guard (clean baseline)
On a fresh rebased `master` pull: `npx tsc --noEmit` PASS · `npm test` PASS (297 tests, 43 files) · `npx electron-vite build` PASS. (`npm ci` with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`.) No regressions to fix.

### STEP 2 — Area audited: (c) Progress — the deferred "Weeks Tracked" desync
Rotated off last run's (b) training. Read the deferred carry-forward list and traced the Progress stat cards + show-date lifecycle (area f). Confirmed the top deferred **progress** item is real, reachable, and always-on; the deferred `PeakWeekWidget` "SHOW DAY!" item is real but only reachable in a narrow window (app left open across the day after a show — `plan:startupRefresh`/`syncPrimaryToNearest` null out a past `show_date` on the next launch, so it self-heals on relaunch), so I fixed the higher-reachability one this run.

### The bug (root cause)
`src/pages/Progress/index.tsx` (L122/219): the **"Weeks Tracked"** StatCard renders `value={weeksCompleted}` where `weeksCompleted = checkinHistory.length` — the raw check-in row count, labeled and unit-suffixed as "weeks". `checkin:history` returns one row per check-in, and check-ins can be logged more than once per week (daily-cadence athletes, plus duplicate-ish same-week entries), so the count overstates the real tracking span: 22 daily weigh-ins over 3 weeks read as **"22 weeks tracked"**. A value shown to the user that does not match reality (DB↔UI desync). The correct span (`elapsedWeeks`, the actual first→last gap) was already computed right below and used for the neighboring "over X weeks" delta, but the headline stat still used the row count.

### STEP 3 — Fix (minimum correct change, extracted to a pure testable helper)
- New pure `src/utils/weeksTracked.ts` → `computeWeeksTracked(checkins)`: measures the real first→last calendar span in whole weeks (order-independent via min/max, rounds to nearest week, skips non-finite dates, returns 0 for <2 usable entries). Mirrors the existing `new Date(check_in_date).getTime()` parse used by `weeklyRate.ts`.
- `Progress/index.tsx` now computes `const weeksTracked = computeWeeksTracked(checkinHistory)` and the "Weeks Tracked" card uses `value={weeksTracked}`. `weeksCompleted` is retained only for the "N check-ins" delta fallback (where it is correctly labeled as a count), so nothing else changes.

### Tests added
`tests/unit/weeksTracked.test.ts` (7 tests): **22 daily check-ins over 3 weeks → 3, not 22 (the bug)**; 6 weekly check-ins → 5 weeks; exactly one week apart → 1; <2 entries → 0; sub-half-week span → 0; order-independent; non-finite date skipped without NaN.

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (304 tests, +7 new; 44 files)
- `npx electron-vite build` → PASS

### Deferred (carried forward; each real and reachable but lower severity — the "Weeks Tracked" item above is now FIXED)
- **[widget] PeakWeekWidget shows "SHOW DAY!" for a past show** — `utils/dates.ts getShowCountdown` clamps `totalDays` to `Math.max(0, …)`, so a past show renders the red peak-week indicator (with "SHOW DAY!") whenever the app is left open past the show day (self-heals on next launch via `startupRefresh`). Fix needs care: 6 callers rely on the `>= 0` clamp, so distinguish past-vs-today without changing the shared contract (e.g. a widget-local past check or a separate signed helper).
- **[chart] Projected trajectory renders a lone dot** — `charts/WeightChart.tsx` projected series has one non-null point so the dashed line never draws.
- **[low] `parseRepMidpoint("12-")` → NaN** — SessionEditor Reps free text; a trailing-dash yields a NaN default rep → NaN volume if logged unedited (`WorkoutSession.tsx:15-19`).

---

## Run: 2026-07-26 (BUG FIX — the "🏆 New Personal Records" summary after a workout compares each lift to the LAST session, not the all-time PR, so any weight above last time but below the true PR is falsely announced as a new record)

### STEP 0 — Backlog
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (all 13 done). Proceeded to a bug hunt.

### STEP 1 — Regression guard (clean baseline)
On a fresh rebased `master` pull: `npx tsc --noEmit` PASS · `npm test` PASS (292 tests, 42 files) · `npx electron-vite build` PASS. (`npm ci` with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`.) No regressions to fix.

### STEP 2 — Area audited: (b/e) training session flow — the deferred top-of-queue PR bug
Rotated off last run's (c) check-in. Swept the widget/localStorage store layer (`localStore`, `competitionLogs`, Sleep/Supplement/Scorecard widgets — all well-guarded: length-checked averages, NaN/range-validated inputs, shape-checked JSON) and traced the workout-session completion path, which is where the top-of-queue deferred bug lives (`WorkoutSession.tsx` PR detection). Confirmed real and reachable on **every** workout completion.

### The bug (root cause)
`src/pages/Training/WorkoutSession.tsx` computes TWO per-exercise lookups at mount: `lastPerformance` (heaviest set from the most-recent completed log of THIS session, used to prefill inputs + show a "last time" hint) and `allTimePR` (heaviest set across ALL completed history, displayed per-exercise as the true PR baseline). But `handleComplete`'s "New Personal Records" detection (was L392-407) gated on `lastPerformance.size > 0` and compared each lift's `bestWeight > lastPerformance.get(name).weight` — i.e. against **last session**, not the all-time best. So an athlete whose all-time bench PR is 100 kg, who did 90 kg last week and 95 kg today, gets 95 kg falsely announced as a "🏆 New Personal Record" even though it's 5 kg below their true PR. `allTimePR` was already computed (and shown) right there but never used for the announcement.

### STEP 3 — Fix (minimum correct change, extracted to a pure testable helper)
- New pure `src/utils/detectNewPRs.ts` → `detectNewPRs(currentStates, priorPRs)`: emits a PR only when a prior all-time best exists for that exercise AND the session's best done, weighted set STRICTLY beats it. Ignores skipped exercises, undone sets, and bodyweight (weight 0) sets; reports the reps of the heaviest done set. First-time exercises (no prior record) never announce a PR.
- `WorkoutSession.tsx` now calls `detectNewPRs(currentStates, allTimePR)` gated on `allTimePR.size > 0` (replacing the inline `lastPerformance` loop), and the `handleComplete` dependency array swaps `lastPerformance → allTimePR`. `lastPerformance` is still used for input prefill + the "last time" hint, so nothing else changes.

### Tests added
`tests/unit/detectNewPRs.test.ts` (5 tests): **above-last-session-but-below-all-time → no PR (the bug)**; genuine all-time PR → announced; first-time exercise (no prior) → no PR; skipped/undone/bodyweight sets ignored; reports reps of the heaviest done set.

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (297 tests, +5 new; 43 files)
- `npx electron-vite build` → PASS

### Deferred (carried forward; each real and reachable but lower severity than a false PR announcement — the training PR item is now FIXED)
- **[progress] "Weeks Tracked" counts check-ins, not weeks** — `Progress/index.tsx` `weeksCompleted = checkinHistory.length`; `elapsedWeeks` is already computed right above.
- **[widget] PeakWeekWidget shows "SHOW DAY!" for a past show** — `utils/dates.ts getShowCountdown` clamps `totalDays` to `Math.max(0, …)`, so a past show renders the red peak-week indicator (with "SHOW DAY!") indefinitely until the next launch's `startupRefresh` repoints `show_date`. Fix needs care: 6 callers rely on the `>= 0` clamp, so distinguish past-vs-today without changing the shared contract (e.g. a widget-local past check or a separate signed helper).
- **[chart] Projected trajectory renders a lone dot** — `charts/WeightChart.tsx` projected series has one non-null point so the dashed line never draws.
- **[low] `parseRepMidpoint("12-")` → NaN** — SessionEditor Reps free text; a trailing-dash yields a NaN default rep → NaN volume if logged unedited (`WorkoutSession.tsx:15-19`).

---

## Run: 2026-07-25 #2 (BUG FIX — the weekly weight-rate is extrapolated from a sub-week window at 3 display sites, so a daily-cadence athlete's routine water swing becomes a ~7× per-week rate that flips the on-track badge and blows up the show-day weight projection)

### STEP 0 — Backlog
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (all 13 done). Proceeded to a bug hunt.

### STEP 1 — Regression guard (clean baseline)
On a fresh rebased `master` pull: `npx tsc --noEmit` PASS · `npm test` PASS (285 tests, 41 files) · `npx electron-vite build` PASS. (`npm ci` with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`.) No regressions to fix.

### STEP 2 — Area audited: (c) check-in + Progress + adaptive nutrition
Rotated off last run's (b) training. Traced the weight-rate / show-projection paths through Progress, the Prep Pace widget, and the post-check-in projection, cross-checked against the check-in engine's own rate normalization.

### The bug (root cause)
Three UI sites compute a per-week weight rate the same way — take the recent check-in window, then `rate = (newest.weight_kg − oldest.weight_kg) / weeksDiff` guarded only by `weeksDiff <= 0`:
- `src/pages/Progress/index.tsx` — `computeWeeklyRate` (was L15-27, window = 4 most-recent). Feeds the status badge and the **show-day projection** `currentWeightKg + weeklyRateKg * weeksToShow` (L150-151).
- `src/components/widgets/PrepPaceWidget.tsx` (was L24-30, window = 4). Feeds the Prep-Pace status pill and its show-day projection (L79).
- `src/pages/CheckIn/index.tsx` (was L754-760, window = 5). Feeds the "Show Day Projection" shown immediately after weighing in (L763).

For a **daily-cadence** athlete the recent 4–5 check-ins span only 3–4 days (`weeksDiff` ≈ 0.4–0.6), so dividing by a fraction of a week extrapolates: a routine ~1 kg water/glycogen swing over 4 days → `1 / (3/7) ≈ +2.33 kg/wk`, and projected across e.g. 10 weeks-to-show that swings the estimated show-day weight by ~23 kg and flips the on-track / too-fast badge from pure noise. The **check-in engine** already normalizes correctly (divides by the actual date gap, folds a multi-check-in window), and the same file's **Measurement Changes** card already floors at `weeksBetween >= 1` (Progress L410) — the weight rate was the sole inconsistent site with no minimum-span floor.

### STEP 3 — Fix (minimum correct change, root-caused via one shared util)
- New pure helper `src/utils/weeklyRate.ts` → `computeWeeklyWeightRate(checkins, minWindow=4)`. It starts at the `minWindow` most-recent entries (unchanged behavior for weekly users — the 4th check-in already spans ~3 weeks), then keeps reaching further back **only if that window is under one week**, so a daily user still gets a genuine ≥1-week rate once they have a week of history. Returns `null` when total usable span is `< 1` week (or `< 2` finite entries) — callers already treat `null` as their "collecting data" state, so no garbage rate or projection is shown. Also skips non-finite weights/dates to stop NaN reaching the projection.
- Wired all three sites to the shared util (deleting the duplicated inline math), so the fix is applied once at the root: Progress `computeWeeklyWeightRate(checkinHistory)`, PrepPaceWidget `computeWeeklyWeightRate(checkinHistory, 4)` (returns null → widget hides, matching the old `weeksDiff <= 0` path), CheckIn `computeWeeklyWeightRate(checkinHistory, 5)`. Removed the now-unused `CheckIn` type import in Progress.

### Tests added
`tests/unit/weeklyRate.test.ts` (7 tests): <2 entries → null; weekly-cadence slope unchanged; 2 weekly check-ins; **sub-week daily window → null (the bug)**; 8 daily check-ins spanning a full week → real −1 kg/wk (window extends past the min count); all-same-day (`weeksDiff = 0`) → null; non-finite weight anchor skipped without NaN.

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (292 tests, +7 new; 42 files)
- `npx electron-vite build` → PASS

### Deferred (carried forward from prior run; the sub-week extrapolation item above is now FIXED)
Still open, ranked; each real and reachable but lower severity:
- **[training] PR summary compares to last session, not all-time** — `WorkoutSession.tsx handleComplete` uses `lastPerformance` not `allTimePR`, so a lift below true PR but above last session is falsely announced as a PR.
- **[progress] "Weeks Tracked" counts check-ins, not weeks** — `Progress/index.tsx` `weeksCompleted = checkinHistory.length`; `elapsedWeeks` is already computed right above.
- **[widget] PeakWeekWidget shows "SHOW DAY!" for a past show** — `getShowCountdown` clamps `totalDays` to `Math.max(0, …)`, so a past show renders the peak-week indicator indefinitely.
- **[chart] Projected trajectory renders a lone dot** — `charts/WeightChart.tsx` projected series has one non-null point so the dashed line never draws.
- **[low] `parseRepMidpoint("12-")` → NaN** — SessionEditor Reps free text; a trailing-dash yields a NaN default rep → NaN volume if logged unedited.

---

## Run: 2026-07-25 (BUG FIX — a hand-typed/stored per-exercise `sets` count reaches `Array.from({length})` unclamped: a huge value (999999) builds ~1M set rows → renderer OOM/freeze, and a negative builds zero rows → a silent, uncompletable "dead" exercise)

### STEP 0 — Backlog
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (all 13 done). Proceeded to a bug hunt.

### STEP 1 — Regression guard (clean baseline)
On a fresh `master` pull: `npx tsc --noEmit` PASS · `npm test` PASS (280 tests, 40 files) · `npx electron-vite build` PASS. (`npm ci` with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`.) No regressions to fix.

### STEP 2 — Area audited: (b) training engine + workout/session flows
Rotated off the recent nutrition/shows/check-in runs. Traced the training UI, IPC, and engine deeply, plus two focused hunter passes over training and progress/check-in.

### The bug (root cause)
An exercise's `sets` value flows into the two session UIs that build one set row per set:
- `WorkoutSession.tsx` `buildInitialStates` → `Array.from({ length: count }, …)` (was `count = typeof ex.sets === 'number' ? ex.sets : 1`).
- `WorkoutLogEditor.tsx` `buildRows` → `for (i = 0; i < count; i++)` (same unguarded read).

The `SessionEditor` "Sets" input has `min={1} max={12}`, but HTML min/max never block a **typed or pasted** value; its handler was `parseInt(e.target.value) || 1`, which only catches `0`/`NaN` — never a negative or a huge number — and `plan:updateSession` persists it verbatim (no clamp). So:
- **Huge** (e.g. `999999`): `Array.from({ length: 999999 })` allocates ~1M set objects and the render maps ~1M rows → renderer hang / out-of-memory.
- **Negative** (e.g. `-3`): `Array.from({ length: -3 })` → `[]` (ToLength coerces negatives to 0) → an exercise with **zero** set rows that can never be marked done — a silent, uncompletable dead exercise.

Fully reachable via normal UI (Edit Session → type the value → Save → Start Workout). The `trainingEngine` generator already guards its own numeric inputs (`sets_per_exercise`/`max_sets_per_exercise`, prior runs), but the **manual SessionEditor path bypasses the engine entirely** — the exact hole those guards warn about, on a sibling seam.

### STEP 3 — Fix (minimum correct change)
- New pure helper `src/utils/clampSetCount.ts` → `clampSetCount(value)` coerces + rounds and clamps to `[1, 20]`: any legit plan (≤ ~12) passes through unchanged; `0`/negative/`NaN`/nullish → `1` (still loggable); anything huge → `20` (`MAX_SET_COUNT`). 20 is far above any real prescription yet can never OOM.
- Applied at the crash boundary so **every** source (typed, pasted, AI-generated, hand-edited DB) is safe:
  - `WorkoutSession.tsx` `buildInitialStates` uses `clampSetCount(ex.sets)`.
  - `WorkoutLogEditor.tsx` `buildRows` uses `clampSetCount(ex.sets)`.
- Applied at the input boundary so bad values never persist (also fixes the "999999 sets" header text): `SessionEditor.tsx` Sets `onChange` now uses `clampSetCount(e.target.value)` (replacing `parseInt(...) || 1`).

### Tests added
`tests/unit/clampSetCount.test.ts` (5 tests): legit values pass through; 0/negatives → 1 (no dead exercise); huge/`>20` → 20 (no OOM); string coercion + rounding (SessionEditor sends `e.target.value`); empty/non-numeric/nullish → 1.

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (285 tests, +5 new; 41 files)
- `npx electron-vite build` → PASS

### Deferred (found this run, NOT fixed — one focused fix per run)
Recorded for future runs (ranked); each is real and reachable but lower severity than an OOM crash:
- **[training] PR summary compares to last session, not all-time.** `WorkoutSession.tsx handleComplete` (~L390-403) detects "New Personal Records" against `lastPerformance` (most-recent session) instead of the already-computed `allTimePR`, so a lift below your true PR but above last session is falsely announced as a PR. `TodaysSessionWidget`/`WorkoutStats` do this correctly.
- **[progress] Sub-week span extrapolation ~7×.** `Progress/index.tsx computeWeeklyRate` (~L15-27), `PrepPaceWidget.tsx` (~L24-30), `CheckIn/index.tsx` (~L754-763) only guard `weeksDiff <= 0`, no minimum-span floor — a daily-cadence athlete's two 1-day-apart weigh-ins turn +0.5 kg into ~+3.5 kg/wk and flip the status badge / show-projection. (The check-in *engine* normalizes correctly; these display sites don't.)
- **[progress] "Weeks Tracked" counts check-ins, not weeks.** `Progress/index.tsx` (~L135) `weeksCompleted = checkinHistory.length` — reads "20 weeks" after 20 daily weigh-ins; `elapsedWeeks` is already computed right above.
- **[widget] PeakWeekWidget shows "SHOW DAY!" for a past show.** `utils/dates.ts getShowCountdown` clamps `totalDays` to `Math.max(0, …)`, so `PeakWeekWidget.tsx` (self-hides only for `<0`/`>7`) renders the red peak-week indicator indefinitely for a past show until the next launch's `startupRefresh` repoints `show_date`.
- **[chart] Projected trajectory renders a lone dot.** `charts/WeightChart.tsx` (~L53-64,111-131) — the `projected` series has one non-null point, so the dashed "Projected to show" line never draws; the last actual point needs to also carry its weight as the `projected` value.
- **[low] `parseRepMidpoint("12-")` → NaN.** SessionEditor Reps is free text; a trailing-dash value yields a `NaN` default rep → `NaN` volume if logged unedited. (`WorkoutSession.tsx:14-18`.)

---

## Run: 2026-07-24 #2 (BUG FIX — the AI-Assistant diet-refine path `plan:applyAIRequest`/`refine_diet` leaves stale `meal_count` + orphaned meal completions when a refine changes the meal count — the SIBLING of the 07-23 #2 fix, in a different handler that was missed)

### STEP 0 — Backlog
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (all done). Bug hunt.

### STEP 1 — Regression guard (clean rebased pull of master)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (278 tests, 39 files) before changes
- `npx electron-vite build` → PASS

(`npm ci` with `ELECTRON_SKIP_BINARY_DOWNLOAD=1` — electron's postinstall binary 403s
from the sandbox proxy; not needed to typecheck/test/build.)

### STEP 2 — Area audited: (a) nutrition engine + Diet flows
Rotation: last run (07-24) touched (f); before that (e)+(b), (c), (a)/(d). Swept the diet
IPC surface in `planHandlers.ts` (969 lines) plus `nutritionEngine.ts`, `checkinEngine.ts`,
and `mealCompletionHandlers.ts`. The nutrition engine and most diet-write paths are already
well guarded (calorie/meal-count/snack-count/weight clamps, orphan purging). Found one
reachable desync that the previous run's fix missed.

### The bug (a second AI diet-refine handler skips the orphan purge + meal_count sync)
Meal completions are keyed by POSITIONAL `meal_index`. Every diet-write path that can change
the meal count purges now-orphaned completions and persists the new `meal_count`:
onboarding regen (`planHandlers.ts:220`), macro regen (`:312`), startup refresh (`:482`),
and — as of the 07-23 #2 run — `plan:refineDietWithPrompt` (`:573-577`).

**But `plan:applyAIRequest`'s `refine_diet` branch** (old `planHandlers.ts:700-716`) was left
out. It calls the *same* `refineDietPlan` Claude food-swap as `refineDietWithPrompt`, then did
only `UPDATE diet_plans SET meals=?` — no `meal_count`, no `clearOrphanedMealCompletions`.
`refineDietPlan` is asked to only swap foods but is never *forced* to keep the count, so a
request routed here that Claude classifies as `refine_diet` (e.g. "combine my 6 meals into 3
bigger ones") can return fewer meals. When the count shrinks (6→3), the leftover today/future
completions at index 3-5 keep counting as "meals eaten" — inflating the Diet/Progress logged
counts and adherence above 100% ("6/3 meals logged") — and stored `meal_count` stays 6.
**Reachable** from the AI Assistant chat, the primary entry point for `applyAIRequest`.

### Root cause + fix (`electron/ipc/planHandlers.ts`)
In the `refine_diet` branch, compute `refinedMealCount = Array.isArray(r.meals) ? r.meals.length
: currentPlan.meal_count`, persist it alongside `meals` in the UPDATE, and call
`clearOrphanedMealCompletions(db, userId, refinedMealCount)` — the identical guard the sibling
handler already uses. `clearOrphanedMealCompletions` was already imported. Minimal; a same-count
refine is idempotent (no completions match `meal_index >= count`, count unchanged).

### Test added
`tests/unit/applyAIRequestRefineDietOrphans.test.ts` — mirrors `refineDietOrphanCompletions.test.ts`
but drives the REAL `plan:applyAIRequest` handler against an in-memory `node-sqlite3-wasm` DB
with `processAIRequest` stubbed to return `{action:'refine_diet'}` and `refineDietPlan` stubbed
to shrink 6→3 meals. Asserts stored `meal_count` becomes 3, today's index-3-5 completions are
purged (0-2 survive), and yesterday's high-index completion is preserved. A second case asserts
a same-count (6→6) refine leaves `meal_count` and all completions untouched. Fails pre-fix
(`meal_count` stays 6, orphans remain), passes post-fix.

### STEP 4 — Verification
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (**280** tests, 40 files; +2 new)
- `npx electron-vite build` → PASS

---

## Run: 2026-07-24 (BUG FIX — "Set as primary show" re-points the countdown/timeline at the newly-chosen show but leaves the stored diet plan generated for the OLD show's weeks-out: the Diet page keeps serving the wrong phase + calorie deficit, a DB↔UI desync)

### STEP 0 — Backlog
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items**. Bug hunt.

### STEP 1 — Regression guard (clean rebased pull of master)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (277 tests, 38 files) before changes
- `npx electron-vite build` → PASS

(`npm ci` with `ELECTRON_SKIP_BINARY_DOWNLOAD=1` — electron's postinstall binary 403s
from the sandbox proxy; not needed to typecheck/test/build.)

### STEP 2 — Area audited: (f) shows/competition + date/week logic
Rotation: last runs touched (e)+(b) [07-23 #2], (c) [07-23], (a) [07-22 later], (d)
[07-22], (f) [07-21 later]. **(f)** was least-recently-audited, so swept it. Read
`showHandlers.ts`, `showDates.ts` (`weeksUntilShow`/`localToday`), `competitionPrep.ts`
(`buildPrepTimeline`/`getWeekGuidance`/peak-week protocol), `utils/dates.ts`
(`getShowCountdown`/`parseLocalDate`), `checkinSchedule.ts`, `PeakWeekWidget`, and the
Settings show-management UI. Date math (local-midnight → local-noon everywhere) and the
missed-slot / next-check-in logic are sound. Found one reachable desync.

### The bug (`shows:setPrimary` is the one show-mutation path that skips the diet regen)
When the show context changes, the diet plan must be regenerated because `weeks_out`
drives BOTH the phase and the calorie deficit (`getPhaseAwareDeficit` →
`generateNutritionPlan`, `nutritionEngine.ts:861`). Every show-mutation handler honors
this: `shows:add` (`showHandlers.ts:213`), `shows:update` on a date change (`:249`), and
`shows:cancelShow` → next show (`:288`) all call `regenerateDietForGoal(...)`.

**Except `shows:setPrimary`** (old `showHandlers.ts:297-307`). Promoting a *different*
registered show to primary set `users.show_date`/`division` to the new show — moving the
sidebar countdown, `buildPrepTimeline`, and `PeakWeekWidget` to it — but never touched
`diet_plans`. So the Diet page kept serving a plan generated for the OLD show's weeks-out:
wrong phase label and wrong calorie/macro targets vs. the show the athlete is now prepping
for. **Reachable** from Settings → the "Set as primary" button on any non-primary upcoming
show (a multi-show athlete switching which contest to peak for — e.g. from a show 2 weeks
out to one 20 weeks out leaves a peak-week deficit plan against an early-prep show).

### Root cause + fix (`electron/ipc/showHandlers.ts`)
Extracted the inline `shows:setPrimary` body into an exported, testable helper
`setPrimaryShow(db, showId, userId, today = localToday())` (mirroring the existing exported
`syncPrimaryToNearest`) and added the missing `regenerateDietForGoal(...)` call after the
`users.show_date` update — same call and ordering the sibling handlers use. Weeks-out is
computed via `weeksUntilShow(show_date, new Date(today+'T00:00:00'))` so it's anchored to
the same local day as the past-show guard: deterministic for tests, and in production
identical to the prior real-`new Date()` path. Minimal; same-primary re-selection just
regenerates the same plan (idempotent). `regenerateDietForGoal`/`weeksUntilShow`/`localToday`
were already imported.

### Test added
`tests/unit/showSetPrimaryDiet.test.ts` — seeds a user + two upcoming shows (~2 weeks and
~20 weeks out at a fixed injected `today`), prepping for the near one, then promotes the far
one and asserts the stored `diet_plans.generated_at_weeks_out` follows to 20 instead of
staying at the near show's value. Fails pre-fix (setPrimary wrote no diet plan at all →
`toBeDefined()` fails); passes post-fix. Uses the same in-memory `node-sqlite3-wasm` +
`getDb` mock harness as `showSyncPrimary.test.ts`.

### STEP 4 — Verification
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (**278** tests, 39 files; +1 new)
- `npx electron-vite build` → PASS

---

## Run: 2026-07-23 #2 (BUG FIX — the AI diet-refine path leaves stale `meal_count` + orphaned meal completions when a refine changes the meal count: a DB↔UI desync that inflates "meals eaten" / adherence and mis-lays-out the Diet week)

### STEP 0 — Backlog
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (all 13 done). Bug hunt.

### STEP 1 — Regression guard (clean rebased pull of master)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (275 tests, 37 files) before changes
- `npx electron-vite build` → PASS

(`npm ci` with `ELECTRON_SKIP_BINARY_DOWNLOAD=1` — electron's postinstall binary 403s
from the sandbox proxy; not needed to typecheck/test/build.)

### STEP 2 — Areas audited: (e) widgets + localStorage stores, then (b) training/workout backend
Last run swept (c). Rotation newest→oldest is now c, a, d, f, b, e, so **(e)** was
least-recently-audited and swept first, then **(b)**.

**(e) — audited clean.** Read every widget in `src/components/widgets/*` plus the
localStorage stores (`localStore.ts`, `createWidgetStore.ts`, `useWidgets.ts`,
`competitionLogs.ts`, `useWaterLog.ts`, `cardioStore.ts`, `useSidebar.ts`), the drag
reorder in `WidgetZone`/`TabWidgetZone`, and `AddWidgets`. All corrupted/hand-edited-storage
paths guard top-level shape, every division is guarded, and the reorder uses stored (not
visible) indices. No reachable defect. (Noted but NOT fixed — too marginal to touch this
run: the `Date.now() - daysFromMon*86400000` week-start math in `PosingWidget`/`CardioWidget`/
`TrainingVolumeWidget`/`MuscleCoverageWidget`/`Training/index.tsx` diverges by a day from the
safe `setDate` pattern used in `WeeklyScorecard`/`SessionsWeek` **only** during a DST
fall-back hour — reproduced at America/New_York Sun 2026-11-01 23:00: ms→`2026-10-27`,
safe→`2026-10-26`. Display-only, ~1h/yr, 5 files; deferred.)

**Disproved lead:** hypothesized that `openFresh()` in `electron/database/db.ts` never sets
`PRAGMA foreign_keys = ON` (only migration v9 does, transiently), so the reset flow's
`DELETE FROM users` (`userHandlers.ts:79`) wouldn't cascade. **Empirically false** —
node-sqlite3-wasm defaults `foreign_keys` to **1 (ON)**, so cascades fire. No bug.

### The bug (AI diet-refine forgets the orphan cleanup every other diet-write path does)
Meal completions are keyed by **positional `meal_index`** (`meal_completions`,
`UNIQUE(user_id, date, meal_index)`). When a diet plan's meal count shrinks, today's/future
completions at now-invalid indexes become orphans that the Diet page can't render but that
still inflate "meals eaten"/adherence. Every diet-write path guards this by calling
`clearOrphanedMealCompletions(...)` and persisting the new `meal_count` — onboarding regen
(`planHandlers.ts:179`), macro regen (`:220`), goal-change regen (`:312`), startup refresh
(`:482`), show add/update (`showHandlers.ts:80`).

**Except** `plan:refineDietWithPrompt` (`planHandlers.ts:565-567`). It overwrote `meals` with
the LLM-returned array — which **can** have a different count (the refine prompt only *asks*
the model to keep the count; a user request like "give me 3 meals instead of 6" legitimately
changes it) — while leaving `meal_count` stale and today's high-index completions in place.

**Result (DB↔UI desync, reachable via the Diet-page AI refine box):** after a 6→3 refine,
`diet_plans.meal_count` stays 6 (read by `Diet/index.tsx:1804` `<WeeklyMealView mealCount=…>`)
and today's completions for indexes 3-5 survive, so `TodaysMacrosWidget`/`TodaysMealsWidget`
show "6/3 meals" and adherence > 100%.

### Root cause + fix (`electron/ipc/planHandlers.ts`, `plan:refineDietWithPrompt`)
Persist `meal_count = <refined meals length>` in the UPDATE and call
`clearOrphanedMealCompletions(db, userId, refinedMealCount)` after it — mirroring every other
diet-write path. Minimal, and only bites when the count actually changes (same-count refines
are untouched). `clearOrphanedMealCompletions` was already imported.

### Tests added
- **`tests/unit/refineDietOrphanCompletions.test.ts`** — exercises the REAL
  `plan:refineDietWithPrompt` handler against an in-memory `node-sqlite3-wasm` DB with
  `refineDietPlan` stubbed to return a shrunk (6→3) plan:
  1. after the refine, `meal_count` is 3 (was 6), today's completions at index ≥ 3 are purged
     (0-2 survive), and a **historical** (yesterday) index-5 completion is preserved;
  2. a same-count (6→6) refine leaves `meal_count` and all completions untouched.
  Test 1 FAILS before the fix (meal_count stays 6, orphans remain) and PASSES after; test 2
  passes both ways (control).

### STEP 4 — Verification
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (277 tests, 38 files; +2 new)
- `npx electron-vite build` → PASS

---

## Run: 2026-07-23 (BUG FIX — clearing the check-in date field discards the entire edit: a null `check_in_date` slips past the format guard and fails the `NOT NULL` constraint, silently losing the user's weight/measurement changes behind a raw SQLite error)

### STEP 0 — Backlog
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (all 13 done). Bug hunt.

### STEP 1 — Regression guard (clean rebased pull of master)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (273 tests, 36 files)
- `npx electron-vite build` → PASS

(`npm ci` with `ELECTRON_SKIP_BINARY_DOWNLOAD=1` — electron's postinstall binary
403s from the sandbox proxy; not needed to typecheck/test/build.)

### STEP 2 — Area audited: (c) check-in + Progress + adaptive nutrition (least-recently-audited; last run was (a))
Rotation of the last six runs: a, d, f, b, e, c (newest→oldest), so (c) was the
least-recently-swept area. Read `checkinEngine.ts`, `checkinHandlers.ts`,
`checkinSchedule.ts`, `progressHandlers.ts`, `Progress/index.tsx`, `CheckIn/index.tsx`,
the `WeightChart`/`MeasurementsChart` components, the check-in widgets, and the
`planStore` check-in state, then fanned a read-only scout across the same surface.
Confirmed clean (all hardened by prior runs): `checkinEngine` division/NaN guards,
`checkinSchedule` next-date / missed-slot math, the adaptive recalc in `checkin:submit`
(calorie floor, `MIN_CALORIE_TARGET` divide guard, bodyweight clamp, per-meal ratio
scaling), and the duplicate-same-day / week-renumber invariants. One NEW reachable
defect surfaced in the `checkin:update` edit path (fixed below).

### The bug (a null `check_in_date` on edit fails NOT NULL and discards the whole edit)
On the locked Check-In screen, **Edit Last Check-In** pre-fills a
`<input type="date">` that is **not `required`** and has **no empty-value guard**
(`CheckIn/index.tsx:508` only validates a *non-empty* date). Clearing the field makes
`saveEdit` send `check_in_date: editDate || null` → **null** (`CheckIn/index.tsx:528`).

In `checkin:update` the date guard is `if (data.check_in_date != null)`
(`checkinHandlers.ts:323`), so a **null** date skips format validation and the renumber
path entirely — but `check_in_date` is still a member of the generic `allowed` set, so
the generic update loop emits `SET check_in_date = NULL`. The column is
`check_in_date TEXT NOT NULL` (`schema.ts:64`), so SQLite rejects the **entire** UPDATE
with `NOT NULL constraint failed: weekly_checkins.check_in_date`.

**Verified against the real in-memory handler:** `update(id, { weight_kg: 80, check_in_date: null })`
threw `SQLite3Error: NOT NULL constraint failed` and the row was **unchanged**
(`weight_kg` stayed 84, not 80) — the UPDATE is atomic, so the user's weight/measurement
edits are silently lost, and `saveEdit`'s catch surfaces the raw SQLite string.

(Note: the earlier scout hypothesis that a NULL date would *persist* and inject NaN into
the Progress trend math is **wrong** — the `NOT NULL` constraint prevents the write; the
real defect is the rejected/lost edit + cryptic error.)

**Reachable via normal UI, no AI/Claude needed:** Check-In (locked) → Edit Last Check-In
→ change weight → clear the date field → Save → cryptic error, weight edit not saved.

### Root cause + fix (guard the seam — never write a null/empty date to a NOT NULL key)
Root cause: a `null` `check_in_date` bypasses the `!= null` format guard yet remains in
the generic update set, so it is written to a `NOT NULL` column.

- **`electron/ipc/checkinHandlers.ts`** (`checkin:update` updates builder) — drop
  `check_in_date` from the update when its value is null/empty:
  `.filter(([k, v]) => allowed.has(k) && !(k === 'check_in_date' && (v == null || v === '')))`.
  A null date now means "leave the date unchanged": the existing date is preserved and
  the rest of the edit (weight, measurements, wellness, notes) saves normally. A
  **non-empty** malformed date still hits the existing `YYYY-MM-DD` guard and is rejected
  with a clear message — unchanged. This is the minimum correct change and touches no
  other column (measurements/notes legitimately accept null).

### Tests added
- **`tests/unit/checkinUpdateNullDate.test.ts`** — exercises the REAL `checkin:update`
  handler against an in-memory `node-sqlite3-wasm` DB:
  1. `update(id, { weight_kg: 80, check_in_date: null })` no longer throws, saves
     `weight_kg = 80`, and preserves `check_in_date = '2026-07-15'`.
  2. A non-empty malformed date (`'not-a-date'`) still throws `/YYYY-MM-DD/`.
  Both FAIL before the fix (test 1 threw NOT NULL) and PASS after.

### STEP 4 — Verification
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (275 tests, 37 files; +2 new)
- `npx electron-vite build` → PASS

### Deferred (recorded, not fixed — one focused fix per run)
- **Stale store after a successful edit (DB↔UI desync).** `saveEdit`
  (`CheckIn/index.tsx:501`) refreshes only `nextAllowed`; unlike `onMissedFilled` it never
  calls `loadCheckinHistory`, so the store's `checkinHistory[0]`/`latestCheckin` keep
  pre-edit values — the locked-screen "Last weigh-in", the re-opened edit form, and the
  `CheckinFeedbackWidget`/`RecentCheckinsWidget` show stale weight/week-number until a
  remount. Real and reachable; candidate for a future run.
- **`checkin:update` recomputes adjustments with id-ordered (not date-ordered) history**
  (`checkinHandlers.ts:340-347`) — with a retroactively-filled missed check-in (higher id,
  older date), `previous`/`recentCheckins` are picked by insertion order, so the stored
  `adjustments`/`calories_delta` compare against a non-chronological anchor. Lower severity.

---

## Run: 2026-07-22 (later) (BUG FIX — the Diet "Swap Meal" sheet ignores `dietary_restrictions`, so an allergy-restricted user is offered — and can persist — restricted foods: a reachable allergen-safety leak)

### STEP 0 — Backlog
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (all 13 done). Bug hunt.

### STEP 1 — Regression guard (clean rebased pull of master)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (266 tests, 35 files)
- `npx electron-vite build` → PASS

(`npm ci` with `ELECTRON_SKIP_BINARY_DOWNLOAD=1` — electron's postinstall binary
403s from the sandbox proxy; not needed to typecheck/test/build.)

### STEP 2 — Area audited: (a) nutrition engine + Diet flows (rotated off last run's (d))
Last run was (d) onboarding/Settings/lifecycle, so I rotated to (a) Diet/nutrition,
sweeping first the check-in/Progress/adaptive backend (all found well-hardened by
prior runs — `checkinHandlers`/`checkinEngine`/`checkinSchedule` guard duplicate
same-day, early/missed slots, week-number renumber, non-finite bodyweight; `Progress`
divisions all guarded), then fanning two read-only scouts across the nutrition/Diet
and widgets/store surfaces. The scouts surfaced one clearly-reachable, no-AI-required
**safety** defect (the swap-meal allergen leak, fixed below) plus a lower-priority
cluster of untrusted-AI-meal-shape gaps (recorded under "Deferred", not fixed — one
focused fix per run).

### The bug (swap-meal alternatives never consult `dietary_restrictions`)
On the Diet page, tapping **Swap Meal / Swap Snack** calls `getSwapAlternatives(meal,
dietary_preference, food_exclusions)` — `dietary_restrictions` was **never passed**.
The app stores allergy/restriction toggles ("Dairy-free", "Nut allergy", "Gluten-free",
"No pork", "No shellfish", "Low FODMAP" — Diet/Settings/Onboarding) in
`user.dietary_restrictions`, NOT `food_exclusions` (`togglePrefsRestriction` writes only
`dietary_restrictions`, then regenerates the plan). So while the generated MEAL PLAN
respects restrictions (engine `restrictionsToAliasKeys` + `EXCLUSION_ALIASES`), the
**swap sheet is a separate client-side path that was blind to them.**

Its exclusion matcher was also naive substring-only
(`food.includes(ex.replace(/_/g,' '))`) with no alias expansion — even if a restriction
label *were* passed, "nut allergy" is not a substring of "almonds", so it wouldn't
match. Every non-vegan/veg **main** swap candidate carries `Almonds`; the non-vegan
**breakfast/snack** candidates carry `Greek Yogurt` / `Cottage Cheese` / `Whey`.

**Reachable via normal UI, no Claude/AI needed:**
1. Diet → Food Preferences → toggle **"Nut allergy"** (or "Dairy-free"). Plan regenerates
   allergen-free.
2. Expand a meal → **Swap Meal** → the sheet **still offers almonds / dairy**.
3. Tapping one calls `window.api.swapMeal(...)`, which **persists the restricted food**
   into the stored plan — defeating the whole point of the allergy setting.

### Root cause + fix (minimum correct change — make the swap sheet honour the same restrictions the engine already does)
Root cause: `getSwapAlternatives` received only `food_exclusions` and matched by bare
substring, so restriction *labels* (stored separately, and shaped as allergen *classes*,
not food IDs) never filtered the candidates.

- **`src/pages/Diet/swapAlternatives.ts`** (new) — extracted the pure `getSwapAlternatives`
  helper out of `Diet/index.tsx` (mirrors the repo's existing `mealAccordion.ts` /
  `recipeSteps.ts` pattern, and makes it unit-testable). It now takes a 4th
  `restrictions: string[]` arg and expands each active restriction label into the
  food-name fragments it forbids via a `RESTRICTION_FORBIDDEN_TERMS` map that mirrors the
  engine's `RESTRICTION_TO_ALIAS_KEYS` + `EXCLUSION_ALIASES` (dairy → yogurt/cottage
  cheese/whey/…, nuts → almond/walnut/…, gluten → oats/bread/…, fish/beef/eggs/soy/pork/
  shellfish/…). Candidates are filtered against food_exclusions (unchanged substring) OR
  the restriction terms. Labels are matched case-insensitively.
- **`src/pages/Diet/index.tsx`** — import the extracted helper, delete the inline copy,
  and pass `user.dietary_restrictions ?? []` at the swap call site.

When every hardcoded candidate for a slot carries the allergen (e.g. a nut-allergy
omnivore — all mains include almonds), the sheet now correctly returns an **empty** list
and the existing "No swap options match…" guidance shows, rather than offering an
allergen. (Diversifying the hardcoded fat source to restore swap options for that case
would be a feature change — left out of scope; the safety fix is to never offer the
allergen.)

### Tests added
`tests/unit/swapAlternatives.test.ts` (7 tests): Dairy-free never offers yogurt/whey/
cottage cheese (egg-whites option still available); Nut-allergy vegan main leaves only
the tofu/avocado combo; nut-allergy omnivore main → empty (safe) list; Gluten-free drops
oats; specific `food_exclusions` still filter (salmon); case-insensitive label match; and
a no-restriction regression (all 3 candidates returned). Pre-fix these fail (the ignored
restriction arg let dairy/nuts through).

### STEP 4 — Verification
- `npx tsc --noEmit` → PASS
- `npm test` → PASS (**273** tests, 36 files — was 266/35; +7 new)
- `npx electron-vite build` → PASS

### Deferred (real but not fixed this run — untrusted AI-meal-shape cluster)
Scouts also flagged that AI-generated diet plans persist Claude's `meals[]` with **no
per-meal field validation** (only the top-level `calories_target` is sanitized, added the
prior run). If the model omits/mis-types a meal's `time` or `foods`, `NextMealWidget`
(`meal.time.split` / `meal.foods.length`, a *default* dashboard widget) and the Diet
page's `activeMealIndex` (`m.time.split(':')`) throw at render; an omitted per-meal
`calories` also NaN-poisons `plan:recalculateMacros`. This is the same untrusted-model-
output class already patched for `calories_target`/`maxSetsOverride`, and the right fix is
to sanitize the meals array at the write seam (`planHandlers.ts` `plan:generateDiet` /
`applyAIRequest` / `refineDietWithPrompt`). Left for a future run (one fix per run; it's
AI-path-dependent, vs. today's fully-reachable safety leak).

---

## Run: 2026-07-22 (BUG FIX — an AI-generated diet plan can be stored with `calories_target = 0`, which then divides by zero in three macro-scaling paths → Infinity ratios and NaN/blanked meal macros; the rule engine floors calories at 1200 but the AI write seam never did)

### STEP 0 — Backlog
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (all 13 done). Bug hunt.

### STEP 1 — Regression guard (clean rebased pull of master)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (264 tests, 35 files)
- `npx electron-vite build` → PASS

(`npm ci` with `ELECTRON_SKIP_BINARY_DOWNLOAD=1` — electron's postinstall binary
403s from the sandbox proxy; not needed to typecheck/test/build.)

### STEP 2 — Area audited: (d) onboarding + Settings + reset + data lifecycle
Rotated to the least-recently-covered area (recent runs: f→b→e→c→a→f→**d**; last (d)
run was 2026-07-16). Swept the onboarding flow (`useOnboarding`, index validation,
`Step1Personal` unit conversions), the Settings edit-profile form + numeric inputs,
`userHandlers`/`userSanitize` (create/update/reset seams), the settings store,
`resetData`/`resetAllData` lifecycle (verified the preserved localStorage keys —
`daily_weight_log`, `water_ml_*`, `water_target_ml` — exactly match the water/weigh-in
stores), `localStore`/`competitionLogs` corrupted-storage guards, `checkinSchedule`,
`DailyWeighInWidget`/`useWaterLog`/Diet-page water, and the settings/progress IPC
handlers. **All found well-hardened by prior runs** (cleared numeric inputs drop via
`sanitizeUserUpdate`; meal/snack/body-fat/weight clamped; water target guarded `>0`;
corrupted-array storage guarded; reset preserves weigh-ins/water and hard-reloads).
The one **real, reachable** defect was in the diet-plan **data lifecycle**: an
AI-generated plan's calorie target is never floored, so a `0` can be persisted and
later divided by.

### The bug (a stored `calories_target = 0` → division by zero in three sinks)
`generateNutritionPlan` (the rule-based engine) always clamps
`const calories = Math.max(1200, tdee + adjustment)` (`nutritionEngine.ts:838`), so a
rule-based plan can never carry `calories_target < 1200`. The **AI diet path does not
reapply that floor.** In `plan:generateDiet`'s Claude branch the target is stored as:
```
cr.calories_target ?? Math.round((cr.meals ?? []).reduce((s, m) => s + (m.calories ?? 0), 0))   // planHandlers.ts:184
```
The only guard is `??` (null/undefined). If Claude returns a `meals` array (which
passes the `claudeResult && claudeResult.meals` truthiness check — `[]`/objects are
truthy) but **omits the top-level `calories_target` AND the per-meal `calories`**, the
reduce sums to `0`, so `calories_target` is persisted as **0**. A raw `0` / negative /
non-finite / string value in `cr.calories_target` also slips straight through `??`.
Model output is untrusted (the same handler already sanitizes `maxSetsOverride` for
exactly this reason — 2026-07-21).

That stored `0` then reaches **three macro-scaling sinks that divide by it**, all
reading `calories_target` back from the DB:
1. **`plan:recalculateMacros`** (`planHandlers.ts:527-528`) — user clicks
   "Recalculate Macros" on the Diet page (`Diet/index.tsx:451`):
   `proteinCalRatio = (protein_g*4)/calories` → **Infinity** → each meal's
   `pro/fat = Math.round(cal * Infinity / …)` → **NaN**, written back to `diet_plans`.
2. **`checkin:submit`** (`checkinHandlers.ts:149`) — fires **automatically** on every
   check-in when such a plan exists: `ratio = newCalories / calories_target` →
   `1200 / 0 = Infinity` → every meal scaled to NaN calories/macros.
3. **`plan:applyAIRequest`** (`planHandlers.ts:869` → `buildMealsPublic` →
   `nutritionEngine.ts:364-365`) — `(protein_g*4)/totalCal` with `totalCal = 0` → NaN.

**Net effect:** a dead, un-followable plan — a `0 kcal` target StatCard and meal
macros that serialize to `null` (`JSON.stringify(NaN)` → `null`), which the Diet UI's
`?? 0` fallbacks blank to `0`. Reproduced with the real engine: `buildMealsPublic(0,
184, 200, 72, 4, 'omnivore')` built **4 meals every one with `protein_g: NaN`**
(pre-fix).

### Root cause + fix (minimum change — enforce the same 1200 floor the rule engine guarantees)
Root cause: the AI write seam and the three divide-sites never enforced the calorie
floor that `generateNutritionPlan` guarantees. Fixed by making the floor a shared,
enforced invariant:
- **`electron/services/nutritionEngine.ts`** — new exported `MIN_CALORIE_TARGET = 1200`
  and pure `sanitizeCalorieTarget(raw, mealsCalorieSum)` (finite value ≥ floor; falls
  back to the meal-calorie sum, then the floor). Inside `buildMeals` (the shared engine
  used by `buildMealsPublic`), `totalCal` is now floored
  `Math.max(MIN_CALORIE_TARGET, Number.isFinite(totalCal) ? totalCal : 0)` **before** the
  macro-ratio divisions — closes sink 3 for every caller. (No behavior change for valid
  plans: they already pass ≥1200.)
- **`electron/ipc/planHandlers.ts`** — the AI write seam (`:184`) now uses
  `sanitizeCalorieTarget(...)` so a 0/invalid target can **never be persisted** (the root
  cause). `plan:recalculateMacros` (`:515`) floors its divisor with `MIN_CALORIE_TARGET`
  (self-heals any pre-existing 0 row on the exact user action that triggers sink 1).
- **`electron/ipc/checkinHandlers.ts`** — the check-in ratio (`:149`) floors its divisor
  with `MIN_CALORIE_TARGET` (closes sink 2 / self-heals old rows on submit).

### Tests added (`tests/unit/nutritionEngine.test.ts`) — 2 new, 266 total
- `sanitizeCalorieTarget` returns ≥ `MIN_CALORIE_TARGET` and finite for
  `undefined/null/0/-500/NaN/Infinity/800/(missing,2500)/(2200)` (preserves valid,
  floors degenerate, uses meal-sum fallback).
- **`buildMealsPublic(0, …)` produces finite (not NaN/Infinity) meal macros** —
  reproduces the AI-request path with a corrupted 0 target. **FAILS pre-fix**
  (`protein_g: NaN` on all 4 meals — verified by temporarily disabling the `buildMeals`
  floor), passes after.

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (266 tests, +2 new)
- `npx electron-vite build` → PASS

---

## Run: 2026-07-21 (later) (BUG FIX — "nearest upcoming show" selected with SQLite's UTC `date('now')` nulls `show_date` on the athlete's own show-day evening — a date-boundary DB↔UI desync, and it runs on every app launch)

### STEP 0 — Backlog
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (all done). Bug hunt.

### STEP 1 — Regression guard
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (260 tests, 34 files)
- `npx electron-vite build` → PASS

(`npm ci` with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`.)

### STEP 2 — Area audited: (f) shows/competition + date/week logic (+ (e) widgets/localStorage)
Rotated off last run's (b) training. Traced the show lifecycle (`showHandlers.ts`,
`showDates.ts`, `planHandlers.ts` startup refresh) and the local date/week utilities
(`dates.ts`, `checkinSchedule.ts`, `units.ts`) plus the competition widgets
(`PeakWeekWidget`, `WeeklyScorecardWidget`, `PosingWidget`, `SleepWidget`) and their
shared localStorage stores (`localStore.ts`, `createWidgetStore.ts`,
`competitionLogs.ts`). The localStorage stores and widget input guards are hardened by
prior runs. One **real, reachable** date-boundary defect remained in the show-selection
SQL.

### The bug (UTC `date('now')` vs the app's LOCAL date convention)
`syncPrimaryToNearest` (`showHandlers.ts:13`) and the inline copy in
`plan:startupRefresh` (`planHandlers.ts:324`) both selected the nearest upcoming show
with:
```
SELECT * FROM shows WHERE user_id=? AND show_date >= date('now') ORDER BY show_date ASC LIMIT 1
```
`date('now')` returns the **UTC** date. Everywhere else the app uses the **LOCAL** date
via `toLocaleDateString('en-CA')` — the countdown (`getShowCountdown`, local midnight),
every `hasUpcoming` check in `shows:delete`/`cancelShow`/`setPrimary`, workout dates,
meal completions — and `workoutHandlers.ts:7` explicitly documents this exact pitfall
("not SQLite `date('now')` which is UTC and shifts overnight").

**Failure (confirmed by repro):** athlete in a behind-UTC zone (e.g. US Pacific), 9 PM
on their show day (`2026-07-21`). UTC has already rolled to `2026-07-22`, so
`'2026-07-21' >= date('now')` = `'2026-07-21' >= '2026-07-22'` → **false**. The show
dated today is treated as past → `UPDATE users SET show_date=NULL, division=NULL`, the
primary flag is cleared, `PeakWeekWidget`/show-day protocol disappears, and the diet can
regenerate to off-season — all while the local-midnight UI countdown still shows "SHOW
DAY". **Reachability is high:** `plan:startupRefresh` runs on **every app launch**, so
merely opening the app on show-day evening triggers it — no user action required. The
same window hits behind-UTC evenings and ahead-of-UTC mornings for any show on/near
today; it also created an internal inconsistency (`shows:delete` computed `hasUpcoming`
from the LOCAL date but `syncPrimaryToNearest` from the UTC date, so the two could
disagree in the same call).

### Root cause + fix (minimum change — use the local date, matching the rest of the app)
- **`electron/services/showDates.ts`** — added `localToday(now = new Date())`
  (returns `now.toLocaleDateString('en-CA')`), an injectable-now helper mirroring the
  existing `weeksUntilShow` pattern for deterministic tests.
- **`electron/ipc/showHandlers.ts`** — `syncPrimaryToNearest` now binds a local
  `today` (`show_date >= ?`) instead of `date('now')`; `today` is an optional injected
  param (defaults to `localToday()`) and the function is exported for testing. This also
  makes it consistent with the sibling `hasUpcoming` checks that were already local.
- **`electron/ipc/planHandlers.ts`** — the `plan:startupRefresh` inline query binds
  `localToday()` instead of `date('now')` (imported from `showDates`; the pre-existing
  "can't import from showHandlers — circular" note doesn't apply to the services helper).

No other `date('now')` remains in a show/upcoming comparison; the remaining ones are
schema `created_at`/`updated_at`/`taken_at` timestamp defaults (correctly UTC storage).

### Tests added (`tests/unit/showSyncPrimary.test.ts`) — 4 new, 264 total
Exercises the REAL exported `syncPrimaryToNearest` against an in-memory
node-sqlite3-wasm DB with an injected `today`:
- **keeps a show dated TODAY (local) as primary** — the exact case UTC `date('now')`
  dropped on show-day evening (show_date not nulled, primary + division follow it).
- **selects the nearest UPCOMING show and skips past ones** (exactly one primary flag).
- **nulls show_date/division and clears primary when no upcoming show remains.**
- **a fixed instant maps to different UTC vs behind-UTC calendar dates** — documents the
  bug class deterministically via explicit `timeZone` options.

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (264 tests, +4 new)
- `npx electron-vite build` → PASS

---

## Run: 2026-07-21 (BUG FIX — an unvalidated ≤0 set cap (`max_sets_per_exercise` / `maxSetsOverride`) zeroes out EVERY exercise → an un-loggable, uncompletable training plan)

### STEP 0 — Backlog
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (all done).
So this run is a **bug hunt**, not a backlog item.

### STEP 1 — Regression guard (clean rebased pull of master)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (258 tests, 34 files)
- `npx electron-vite build` → PASS

(`npm ci` with `ELECTRON_SKIP_BINARY_DOWNLOAD=1` — electron's postinstall binary
403s from the sandbox proxy; not needed to typecheck/test/build.)

### STEP 2 — Area audited: (b) training engine + workout/session flows
Rotated to the least-recently-covered area (recency e→c→a→f→d→b; last (b) run was
2026-07-18). Traced the full training path: `trainingEngine.ts` (all six split
builders + `getSets`), `workoutHandlers.ts` IPC, and the workout/session UI
(`WorkoutSession.tsx`, `WorkoutLogEditor.tsx`, `SessionEditor.tsx`, `WorkoutStats.tsx`)
plus the training widgets. Most is hardened by prior runs: the engine already
guards `training_frequency`, `exercises_per_session` (07-18) and
`sets_per_exercise` (07-18b) against 0 / negative / NaN; `workout:updateSet`
coerces `undefined`→NULL (07-16b); `SessionEditor`'s Sets input floors to 1
(`parseInt(...) || 1`); `workout:history` guards its LIMIT. One **real, reachable**
defect remained — the **third** numeric set input the engine never guarded.

### The bug (unvalidated ≤0 set cap collapses all sets to zero)
The hard set cap `max_sets_per_exercise` (engine) / `maxSetsOverride` (chat) is the
sibling of the two fields fixed in 07-18 / 07-18b — but it was passed through and
applied **completely unvalidated**, in TWO layers:

1. **Engine** (`trainingEngine.ts:536`): `const userMax = input.max_sets_per_exercise`
   — taken raw. `getSets` applies it via `sets = Math.min(sets, userMax)` with **no
   floor** (`trainingEngine.ts:256`). A cap of `0` → `Math.min(4, 0) = 0`, so every
   exercise gets `sets: 0`. Reproduced directly:
   `generateTrainingPlan({ …, max_sets_per_exercise: 0 })` → **all 27 exercises had 0
   sets**. `WorkoutSession.buildInitialStates` then builds `Array.from({length: 0})`
   = `[]` sets per exercise → `canComplete` is false → the workout **cannot be
   completed** (the exact failure mode of 07-18 / 07-18b, via the cap path).
2. **Direct server-side DB clamp** (`planHandlers.ts:831-839`): independently applies
   `Math.min(ex.sets, cap)` where `cap = result.maxSetsOverride`, again with no floor.
   This path **bypasses the engine entirely** — so even when Claude generation
   succeeds and returns valid 4-set sessions, a `cap` of 0 rewrites every exercise
   to 0 sets and **persists it to the DB**.

**Reachability:** the cap originates from untrusted LLM output — `processAIRequest`
returns `maxSetsOverride` parsed from Claude's JSON (`claudeService.ts:311`,
prompt at `:408-411`) for set-count requests. The app validates its *sibling*
numeric inputs everywhere (`NUMERIC_BOUNDS` clamps meal/snack/frequency at
`planHandlers.ts:717-726`; the engine guards the other two set fields) — but this
one LLM-derived cap reached `Math.min` raw. An injury-minimization phrasing
("keep it to zero sets", "minimize everything") or any LLM slip yielding `0` /
negative produces a dead, uncompletable plan.

### Root cause + fix (minimum change — guard the cap ≤0 at both application layers)
- **`electron/services/trainingEngine.ts`** — `generateTrainingPlan` now derives
  `userMax` the same way as its two siblings: `Number.isFinite(rawMaxSets) &&
  rawMaxSets > 0 ? Math.round(rawMaxSets) : undefined`. A bad cap is ignored and
  `getSets` falls back to its phase/experience default; positive caps (incl. 1) are
  preserved and still enforced.
- **`electron/ipc/planHandlers.ts`** — sanitize `result.maxSetsOverride` once, right
  after `processAIRequest` returns, before it fans out to the engine input
  (`:759`), the refinement `hardMaxSets` (`:809`), and the direct DB clamp (`:831`).
  Non-finite / non-positive → `undefined` ("no cap"). This closes the engine-bypass
  path (2) that the engine guard alone can't reach.

### Tests added (`tests/unit/trainingEngine.test.ts`) — 2 new, 260 total
- **never produces an exercise with ≤0 sets for a non-positive / non-finite
  `max_sets_per_exercise`** — across all 6 splits × `{0, -2, NaN, Infinity}`, every
  exercise must have ≥1 set. **FAILED before the fix** (1 failed: all exercises had
  0 sets); passes after.
- **enforces a valid `max_sets_per_exercise` cap on every exercise** — a valid cap
  of 3 still clamps every exercise to ≤3 (guards the fix against over-reaching).

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (260 tests, +2 new)
- `npx electron-vite build` → PASS

### Deferred (out of scope this run — noted, not fixed)
- `showHandlers.ts:126` computes `max_sets_per_exercise: (sets_per_exercise ?? 4) + 1`
  and passes it only to `generateWorkoutWithClaude` (Claude, not the rule engine);
  a hand-typed negative `sets_per_exercise` persisted in the DB could make that
  argument ≤0, but it never reaches the rule fallback there. Low-value edge, left
  for a dedicated pass.
- `training_experience_years` and `exercises_per_session` from chat `settingChanges`
  are written to the users table without the `NUMERIC_BOUNDS` clamp that
  meal/snack/frequency get; both are re-guarded downstream by the engine, so no
  current crash, but the boundary clamp is inconsistent. Noted for a later run.

## Run: 2026-07-20b (BUG FIX — corrupted/hand-edited `daily_weight_log` crashes the Daily Weigh-In widget: inline JSON.parse never validates the array shape)

### STEP 0 — Backlog
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (all done).
So this run is a **bug hunt**, not a backlog item.

### STEP 1 — Regression guard (clean rebased pull of master)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (256 tests, 33 files)
- `npx electron-vite build` → PASS

(`npm ci` with `ELECTRON_SKIP_BINARY_DOWNLOAD=1` — electron's postinstall binary
403s from the sandbox proxy; not needed to typecheck/test/build.)

### STEP 2 — Area audited: (e) widgets + localStorage stores
Rotated to the least-recently-covered area (recency order c→a→f→d→b→e; last (e)
run was 2026-07-17b). Traced the shared stores (`createWidgetStore.ts`,
`localStore.ts`, `cardioStore.ts`) and every widget that reads/derives from
localStorage: Cardio, Supplement, Posing, Sleep, Condition, Water, DailyWeighIn,
WeeklyScorecard, TrainingVolume, WeeklyVolume, MuscleCoverage, PrepPace,
PrepGuidance, QuickStats. Most of the area is hardened by prior runs:
`createLocalStore`/`createWidgetStore` validate top-level array shape (07-17b),
`cardioStore.loadInitial` guards `Array.isArray`, `useWaterLog` guards `isNaN`,
`PrepGuidanceWidget` guards `Array.isArray(stored)`. One **real, reachable crash**
remained — in a widget that rolls its own inline localStorage read instead of the
shared store.

### The bug (Daily Weigh-In widget crashes on non-array corrupted storage)
`src/components/widgets/DailyWeighInWidget.tsx:10-12` seeded its state with:
```js
useState(() => { try { return JSON.parse(localStorage.getItem('daily_weight_log') ?? '[]') } catch { return [] } })
```
The `try/catch` only catches **malformed** JSON. Valid JSON of the WRONG shape
(hand-edited / corrupted storage — `null`, `{}`, `5`, `"x"`, `true`) parses
without throwing, so the catch never fires and the non-array value flows straight
into `dailyWeightLog.find(...)` / `.filter(...)`, throwing
`TypeError: Cannot read properties of null (reading 'find')`. Since the repo has
**no error boundary** anywhere in `src/` (verified by grep), a single widget
throwing during render takes down the entire dashboard tab — the exact failure
mode run 07-17b fixed for the competition widgets, but this widget was missed
because it reads localStorage inline rather than through `createLocalStore`.
Reachable via `daily-weigh-in` (a registered dashboard widget, `registry.tsx:40`).

### Root cause + fix (minimum change)
- **`src/components/widgets/DailyWeighInWidget.tsx`** — the state initializer now
  validates the parsed value with `Array.isArray(parsed) ? parsed : []`, mirroring
  the `createLocalStore` / `PrepGuidanceWidget` shape-guard. Malformed JSON still
  falls back via the existing `catch`. Valid arrays are unchanged.

### Tests added (`tests/unit/dailyWeighInCorrupted.test.tsx`) — 2 new, +258 total
- widget renders without throwing for each of `null` / `{}` / `5` / `"oops"` /
  `true` seeded into `daily_weight_log` (FAILED before the fix — threw
  `TypeError … reading 'find'` on the first case);
- a valid stored array still renders (regression guard).

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (258 tests, +2 new)
- `npx electron-vite build` → PASS

### Deferred (out of scope this run — noted, not fixed)
- Element-level corruption (an array containing wrong-shaped elements, e.g.
  `[null]` or `[{}]` in `supplement_log` / `daily_weight_log`) would still throw
  on `.date`/`.taken` access. The shared stores and this widget only validate the
  TOP-LEVEL shape. This requires much more deliberate hand-editing than swapping
  the container type and is a broader hardening effort; left for a dedicated pass.

## Run: 2026-07-20 (BUG FIX — adaptive calorie engine assumes a weekly cadence, so it over-corrects on biweekly / every-3-days / daily schedules)

### STEP 0 — Backlog
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (all 13 done).
So this run is a **bug hunt**, not a backlog item.

### STEP 1 — Regression guard (clean rebased pull of master)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (253 tests, 33 files)
- `npx electron-vite build` → PASS

(`npm ci` with `ELECTRON_SKIP_BINARY_DOWNLOAD=1` — electron's postinstall binary
403s from the sandbox proxy; not needed to typecheck/test/build.)

### STEP 2 — Area audited: (c) check-in + Progress + adaptive nutrition
Rotated toward the least-recently-covered area (last (c) run was 2026-07-17).
Traced the whole path: `checkinEngine.ts`, `checkinHandlers.ts` (submit /
submitMissed / update), `checkinSchedule.ts`, `progressHandlers.ts`, the Progress
page, WeightChart/MeasurementsChart, the Check-In page, and the check-in stores.
Most of the area is hardened by prior runs (clampWeightKg, duplicate-checkin
guards, week renumbering on date edit, bodyweight-0 guards, smoothed multi-week
trend). One **real, reachable correctness bug** remained in adaptive nutrition.

### The bug (adaptive calorie engine ignores check-in cadence)
`electron/services/checkinEngine.ts` converted a raw weight delta into a
"% of bodyweight per **week**" figure — the number the calorie-adjustment
thresholds (`< -1.5` too-fast, `-1.0…-0.3` on-track, `> -0.1` stall) are
calibrated against — but it assumed **exactly one week between check-ins**:
- single-week fallback `weightTrend` hard-coded `weeksDiff = 1` (`:28`);
- smoothed `weightTrendPct` divided the window's change by `priors.length`
  (the interval **count**, not elapsed weeks) (`:60`).

Settings offers **Bi-Weekly (14-day)**, **Every 3 Days**, and **Daily**
schedules (both the day-mode biweekly toggle and the interval presets —
`src/pages/Settings/index.tsx:250-291`), and nothing in `checkinHandlers.ts`
normalized for cadence. So a biweekly cut athlete losing a textbook-healthy
0.8 %/wk over 14 days was read as **-1.6 %/wk** → the engine fired *"Weight
dropping too fast — added 150 kcal"* and bumped the diet plan's calorie target
(`checkinHandlers.ts:131`), sabotaging an on-pace athlete. Every biweekly and
every-3-days check-in read ~2–2.3× too hot; daily read ~7× too cold. Weekly
users were unaffected (intervals ≈ weeks), which is why it survived prior runs.

### Root cause + fix (minimum change)
The engine had no way to know the real gap — `CheckinInput`/`PreviousCheckin`
carried no dates. Fix:
- **`electron/services/checkinEngine.ts`** — added optional `check_in_date` to
  `CheckinInput` and `PreviousCheckin`; added a `weeksBetweenDates()` helper
  (local-noon parse, returns null on missing/unparseable/non-positive span);
  `weightTrend` and `weightTrendPct` now normalize by the ACTUAL weeks between
  the anchor date and the current weigh-in, falling back to the old assumption
  (1 week / interval count) only when dates are absent — so existing weekly
  behavior and all prior tests are unchanged.
- **`electron/ipc/checkinHandlers.ts`** — `previous`/`recentCheckins` queries in
  submit, submitMissed, and update now also `SELECT check_in_date`, and each
  `calculateAdjustments` call passes the current weigh-in's date
  (`submitDate` / `data.check_in_date` / edited-or-existing date).

Now the biweekly 0.8 %/wk case computes `(−1.6 kg)/2 wk = −0.8 %/wk` → "on track,"
no calorie change; a genuine −2 %/wk biweekly drop still correctly flags too-fast.

### Tests added (`tests/unit/checkinEngine.test.ts`) — 3 new, +256 total
- single-week fallback normalizes a 14-day gap → on-track, no calorie add;
- smoothed trend divides by elapsed weeks not check-in count (biweekly) → on-track;
- a genuinely too-fast biweekly drop (−2 %/wk) still fires the too-fast +150.
All three FAILED before the fix (returned +150 "too fast") and pass after.

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (256 tests, +3 new)
- `npx electron-vite build` → PASS

### Deferred (out of scope this run)
- `checkin:update` recomputes the coach `adjustments` note but does not re-apply
  macros to `diet_plans` (only `checkin:submit` adapts nutrition) — a possible
  DB↔UI desync when a last weigh-in is edited, but arguably intentional.
- `WeightChart` projected dashed line renders as a single dot (only the Show-Day
  datum is non-null, so `connectNulls` has nothing to join) — cosmetic, and the
  chart is a visual concern (out of the debugging scope).
- Latent: `computeMissedSlots` would divide by zero / loop on `interval_days=0`,
  but that value isn't reachable through the UI (Settings only offers 1/3/7/14).

---

## Run: 2026-07-19b (BUG FIX — "No fish" restriction still serves Salmon: salmon's substitute chain is entirely inside the `fish` exclusion alias)

### STEP 0 — Backlog
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (all 13 done).
So this run is a **bug hunt**, not a backlog item.

### STEP 1 — Regression guard (clean rebased pull of master)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (252 tests, 33 files)
- `npx electron-vite build` → PASS

(`npm ci` with `ELECTRON_SKIP_BINARY_DOWNLOAD=1` — electron's postinstall binary
403s from the sandbox proxy; not needed to typecheck/test/build.)

### STEP 2 — Area audited: (a) nutrition engine + Diet flows
Rotated away from last run's (f). Swept the nutrition engine (`nutritionEngine.ts`
meal building / macro math / portion calc / `getFood` substitution), the food
database (`foodDatabase.ts` EXCLUSION_ALIASES / FOOD_SUBSTITUTES / FOOD_CATEGORY),
every diet IPC seam (`planHandlers.ts` generateDiet / recalculateMacros / swapMeal /
reorderMeals / applyAIRequest diet regen; `checkinHandlers.ts` per-meal macro
scaling), and the Diet UI (`Diet/index.tsx`, `refeed.ts`, `GroceryList.tsx`,
`WeeklyMealView.tsx`, `recipeSteps.ts`, `mealAccordion.ts`, `planStore.ts`).

Most of the area is hardened by prior runs (clampWeightKg, clampMealCount,
non-finite snack_count guard, dairy-free substitute chains, snack-calorie cap,
preference-vs-snack context). The live remaining defect was another **substitute
chain trapped inside its own exclusion alias** — exactly the class the dairy-free
fix (2026-07-16) addressed, but for fish.

### The bug
A user who sets the **"No fish"** dietary restriction was still served **Salmon
Fillet** in Dinner (the omnivore Dinner default, `nutritionEngine.ts:704`).

Root cause: `RESTRICTION_TO_ALIAS_KEYS['no fish'] = ['fish']`, and
`EXCLUSION_ALIASES['fish']` contains salmon, tilapia, tuna_steak, halibut, cod, …
`FOOD_SUBSTITUTES['salmon']` was `[tilapia, tuna_steak, halibut]` — **all three are
themselves in the `fish` alias**. So `getFood('salmon', ['fish'])`
(`nutritionEngine.ts:284-320`) found salmon excluded, iterated every substitute
(each also excluded), exhausted the chain, and hit `return fallback` at
`nutritionEngine.ts:319` — which is salmon itself. The user's plate displays the
exact food they excluded (a correctness/safety defect: serving a restricted food).

Deterministic repro (fake-clock-free, pure): omnivore, 3–6 meals,
`dietary_restrictions: ['No fish']` → Dinner foods include `"Salmon Fillet (145g)"`.
(Excluding `salmon` directly via the food picker was NOT affected — only `salmon`
is excluded then, so the first substitute `tilapia` is valid; the defect is specific
to the alias-level `fish` exclusion where the whole chain collapses.)

### Root cause + fix (file:line)
`electron/services/foodDatabase.ts:109` — appended two **non-fish** fallbacks to
`FOOD_SUBSTITUTES['salmon']` after the fish options: `chicken_breast` (omnivore) and
`tofu` (plant), mirroring the dairy fix's trailing tofu/pea_protein. Now
`getFood('salmon', ['fish'])` skips the excluded fish and returns chicken_breast
(role `protein`). This also fixes culture-Dinner paths, since `getCultureFood`'s
excluded-culture-protein fallback flows through `getFood('salmon', …)`. salmon is
the only all-fish-chain food reachable as a template default (per audit), so the
single-food fix is sufficient and matches the minimal precedent (the dairy fix
touched only the two reachable foods, cottage_cheese/ricotta).

### Tests added
`tests/unit/nutritionEngine.test.ts` — "No fish excludes salmon and other fish
across prefs and meal counts" (omnivore/vegetarian/vegan × 3–6 meals, snack_count 2):
asserts no meal's foods contain salmon/tilapia/tuna/halibut/cod/… . Fails before the
fix (`"salmon fillet (145g)"` in omnivore Dinner), passes after.

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (253 tests, +1 new)
- `npx electron-vite build` → PASS

### Also noted (NOT fixed this run — one fix per run)
- **Meal reorder desyncs meal-completion indices** (`planHandlers.ts:897` — `plan:reorderMeals`
  persists a permuted meals array but never remaps/clears `meal_completions`, which
  are keyed by positional `meal_index`; dragging a snack after marking meals eaten
  shows the wrong meal ticked and wrong "Today's Intake" macros). Real desync;
  candidate for a future run.
- **`"✕ exclude this food"` silently no-ops for labels ≠ titleCase(id)** (`Diet/index.tsx:192`
  `handleExcludeFood` snake-cases the display label, so "Whole Eggs x3"→`whole_eggs_x3`
  never matches id `eggs`; shakes/rice-cakes/culture foods likewise). Real; future run.
- **AI plan with `calories_target: 0`** → division at `planHandlers.ts:523` /
  `checkinHandlers.ts:148` yields Infinity→null macros. Low-confidence (needs a
  degenerate Claude response; rule engine clamps ≥1200). Future run: add a
  `clampCalories` denominator guard.

---

## Run: 2026-07-19 (BUG FIX — generated plan phase disagrees with the displayed weeks-out: plan weeks_out used Date.now() instead of local midnight)

### STEP 0 — Backlog
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (all 13 done).
So this run is a **bug hunt**, not a backlog item.

### STEP 1 — Regression guard (clean rebased pull of master)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (248 tests, 32 files)
- `npx electron-vite build` → PASS

(`npm ci` with `ELECTRON_SKIP_BINARY_DOWNLOAD=1` — electron's postinstall binary
403s from the sandbox proxy; not needed to typecheck/test/build.)

### STEP 2 — Area audited: (f) shows/competition + date/week logic + unit conversion
Rotated toward the least-recently-covered area (last (f) run was 2026-07-15b).
Swept the show lifecycle (`showHandlers`: add/update/delete/cancel/setPrimary,
`syncPrimaryToNearest`, `computeWeeksOut`, `regenerateDietForGoal`,
`transitionTrainingToOffSeason`), the date/week utilities (`utils/dates.ts`
`getShowCountdown`/`localDateStr`/`parseLocalDate`; `competitionPrep.ts`
`buildPrepTimeline`/`getWeekGuidance`; `PEAK_WEEK_PROTOCOL`), every prep/countdown
widget (`PeakWeek`, `PrepPace`, `PrepGuidance`, `QuickStats`, `WeeklyScorecard`,
`SessionsWeek`, `WeeklyVolume`), the check-in schedule/missed-slot logic
(`checkinSchedule.ts`), `units.ts` (kg/lb, cm/in), and the water ml/oz path
(`WaterWidget`). Most of the area is hardened by prior runs (imperial 5'12",
duplicate same-day check-in, week_number renumber, phantom/biweekly missed slots).
The live remaining defect was a **formula divergence** between how the UI shows
weeks-out and how plan generation computes it.

### The bug
The UI countdown measures weeks-out from **local midnight** of the current day
(`getShowCountdown` / `buildPrepTimeline` in `src`, which drive the Show Countdown
stat, the "This Week in Prep" phase badge, and the prep timeline). Plan generation
instead computed weeks-out from **`Date.now()`**:
`Math.max(0, Math.floor((showNoon − Date.now()) / (day*7)))`, duplicated verbatim
across **8 seams** — `planHandlers.ts` (training gen, diet gen ×2, refresh-all,
startup-refresh, prefs-driven regen), `showHandlers.ts` `computeWeeksOut`
(shows:add/update/cancel diet regen), and `claudeService.ts` (AI prompt phase
context).

`Date.now()` subtracts the part of today already elapsed, so the value can land
**one week-bucket lower** than the midnight-based display. Near a phase boundary
(the display's `getWeekGuidance` splits at weeksOut 1/3/6/8/12/16; `determinePhase`
at 3/8/16), a plan generated in the afternoon/evening is built for a *different
phase than the athlete is shown* — a DB↔UI desync in exactly the value this app is
built around.

Deterministic repro (fake clock **2026-07-19 20:00**, show **2026-09-06** = 49 days
out): the UI shows **7 weeks out** (`getShowCountdown(...).weeks === 7`) but the old
`Date.now()` formula yields **6** — e.g. "This Week in Prep" reads *"Strength →
Peak Transition"* (weeksOut 7) while the regenerated diet/training was built for
weeksOut 6 (*"Peak / Conditioning"*, and a different `getPhaseAwareDeficit` bucket).

### Root cause + fix (file:line)
Root cause: a time-of-day-dependent weeks-out formula (`Date.now()`) duplicated 8×,
inconsistent with the app's own local-midnight date convention (`utils/dates.ts`).
New pure helper `weeksUntilShow(showDate, now?)`
(`electron/services/showDates.ts`) mirrors `getShowCountdown`'s local-midnight math
(`floor((showNoon − todayMidnight) / (day*7))`, clamped ≥0). Replaced all 8 inlined
formulas with a call to it (`planHandlers.ts` ×6, `showHandlers.ts` `computeWeeksOut`,
`claudeService.ts`), so the generated phase can no longer drift below the displayed
weeks-out. All-or-nothing by necessity: fixing only some seams would make onboarding,
refresh, and show-add compute *different* weeks-out for the same show/time.

### Tests added
`tests/unit/weeksUntilShow.test.ts` (4) — with a faked evening clock, asserts the
**old** `Date.now()` formula gave 6 (documents the bug) while `getShowCountdown`
and `weeksUntilShow` both give 7; asserts time-of-day independence (6am == 11:30pm);
asserts `weeksUntilShow` matches `getShowCountdown` across 8 generation times of day;
asserts a past show clamps to 0.

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (252 tests, +4 new)
- `npx electron-vite build` → PASS

---

## Run: 2026-07-18b (BUG FIX — sets_per_exercise=0 (or negative) builds exercises with ZERO sets / un-loggable, uncompletable workout)

### STEP 0 — Backlog
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (all 13 done).
So this run is a **bug hunt**, not a backlog item.

### STEP 1 — Regression guard (clean rebased pull of master)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (247 tests, 32 files)
- `npx electron-vite build` → PASS

(`npm ci` with `ELECTRON_SKIP_BINARY_DOWNLOAD=1` — electron's postinstall binary
403s from the sandbox proxy; not needed to typecheck/test/build.)

### STEP 2 — Area audited: (d) onboarding + Settings + reset + data lifecycle
Rotated toward the least-recently-covered area (last (d) run was 2026-07-14b).
Swept the onboarding flow (`useOnboarding`, index validation, Step1 personal/unit
inputs, Step3 training, Step4 nutrition), the Settings edit-profile form, the
user create/update/reset IPC seams (`userHandlers`, `userSanitize`), the settings
store, `resetData`/`resetAllData` lifecycle, and `computeMissedSlots` — all found
well-guarded (cleared numeric inputs drop via `sanitizeUserUpdate`, meal/snack/
body-fat clamped, reset preserves weigh-ins/water and hard-reloads to purge stale
stores). Then traced the Settings **Edit Profile → engine** seam for the sibling
of last run's fix and found `sets_per_exercise` still unguarded.

### The bug
Settings → Edit Profile → "Sets/Exercise" is `<input type="number" min={2}
max={8}>` (`Settings/index.tsx:431`). HTML `min` does **not** block a hand-typed
value, and `handleSaveProfile` saves `editForm` with no clamp. `sanitizeUserUpdate`
clamps `meal_count`/`snack_count`/`body_fat_pct` but has **no** branch for
`sets_per_exercise`, and `0` is finite — so it persists as `0` (negatives too).

Every plan-generation call reads it via `user.sets_per_exercise ?? 4`
(`planHandlers.ts:28/56/281/381/769`), but `??` does **not** catch `0`. Inside
`generateTrainingPlan` the value became `userDefault` and flowed to
`getSets` (`trainingEngine.ts:244`) verbatim: for an isolation exercise
`sets = userDefault` (`0` → **0 sets**); for a compound `sets = userDefault + 1`
(`0` → 1). A negative value produced **negative** sets on every exercise.

Reproduced deterministically with the real engine (`split=auto`,
`sets_per_exercise=0`): **18 of 30** exercises (all isolations) built with `sets: 0`
(e.g. `Cable Fly`, `sets: 0`); with `-3`, **all 30** exercises got negative sets.

In `WorkoutSession.buildInitialStates` (`WorkoutSession.tsx:210,213`)
`count = typeof ex.sets === 'number' ? ex.sets : 1` and
`Array.from({ length: count })` — for `count <= 0` this yields an **empty** set
list (`ToLength` clamps negatives to 0), so the exercise has no rows to log,
`allSetsDone` (`:55`, `state.sets.length > 0`) is permanently false, and the card
reads "0 sets × … reps": an un-loggable, uncompletable exercise.

### Root cause + fix (file:line)
Root cause: `??`/passthrough guards only `null`/`undefined`, not `0`/negative, and
no seam clamps `sets_per_exercise`. Fixed at the single engine seam every builder
flows through — `generateTrainingPlan` (`electron/services/trainingEngine.ts:522`),
mirroring the `exercises_per_session` guard added directly above it last run:
normalize a non-finite/non-positive `sets_per_exercise` to `undefined` so
`getSets` applies its own experience-based default (exactly as when the field was
never set); positive values (incl. 1, which `getSets` handles) are preserved. The
independent `userMax`/`max_sets_per_exercise` cap is left untouched. This fixes
all six splits at once and makes the empty-set WorkoutSession path unreachable via
this route.

### Tests added
`tests/unit/trainingEngine.test.ts` — "never produces an exercise with <= 0 sets
for a non-positive / non-finite sets_per_exercise": across `auto/ppl/upper_lower/
arnold/bro/full_body` and `sets_per_exercise ∈ {0, -3, NaN}`, asserts every
exercise has ≥1 set. **FAILS pre-fix** (`auto sets=0` → `Cable Fly` 0 sets),
passes after.

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (248 tests, +1 new)
- `npx electron-vite build` → PASS

---

## Run: 2026-07-18 (BUG FIX — exercises_per_session=0 builds a training plan with an EMPTY Legs day / dead uncompletable workout)

### STEP 0 — Backlog
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (all 13 done).
So this run is a **bug hunt**, not a backlog item.

### STEP 1 — Regression guard (clean rebased pull of master)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (246 tests, 32 files)
- `npx electron-vite build` → PASS

(`npm ci` with `ELECTRON_SKIP_BINARY_DOWNLOAD=1` — electron's postinstall binary
403s from the sandbox proxy; not needed to typecheck/test/build.)

### STEP 2 — Area audited: (b) training engine + workout/session flows
Rotated for coverage. Manually swept (d) onboarding/Settings/reset/data-lifecycle,
(c) check-in + Progress + adaptive nutrition, the schedule engine, and the full
backend IPC layer (userHandlers/userSanitize/settingsHandlers/showHandlers/
planHandlers/checkinHandlers/workoutHandlers/mealCompletionHandlers/progressHandlers),
DB schema/migrations, and the nutrition engine's meal-building/portion math — all
found clean and well-guarded. Then traced the **training-engine split builders**
against out-of-range `exercises_per_session`.

### The bug
Settings → Edit Profile → "Exercises per session" is an `<input type="number"
min={3} max={12}>` (`Settings/index.tsx:429`). HTML `min` does **not** block a
hand-typed value, and `handleSaveProfile` saves `editForm` with no `checkValidity()`
/ no clamp. `sanitizeUserUpdate` clamps `meal_count`/`snack_count` but has **no**
branch for `exercises_per_session`, and `0` is finite — so it persists as `0`.

In every split builder the count flows through `exPerSession ?? default`, but `??`
does **not** catch `0`:
- `buildPPLSessions` (`trainingEngine.ts:286`): `exCount = exPerSession ?? (legs?6:5)`
  → `0` → `getExercises(cat, eq, 0)` returns `[]`. The **Legs** day alone excludes
  the 2 core-fallback exercises (`s.cat === 'legs' ? [] : coreEntries`, line 303),
  so the Legs session is saved with `exercises: '[]'`; Push/Pull days collapse to
  only `Cable Crunch, Plank`.
- Same `?? `-past-0 hole in upper/lower legs (`:330`), Arnold legs (`:397`),
  and bro (`:417`).

The rule-based path in `plan:generateTraining` inserts all sessions unfiltered
(only the Claude path drops empty sessions), so the empty Legs day is persisted.
Starting it hits `WorkoutSession.tsx:534` `(doneCount / session.exercises.length)
* 100` = `0/0*100` = **NaN** → `style width:"NaN%"`, header reads "0/0 exercises",
and `canComplete` is permanently false — a dead, uncompletable workout.

Reproduced deterministically with the real engine (`split=auto`, `exercises_per_session=0`):
Legs day → **0 exercises**.

### Root cause + fix (file:line)
Root cause: `??` guards only `null`/`undefined`, not `0` (nor negative/NaN), and no
seam clamps `exercises_per_session`. Fixed at the single engine seam every builder
flows through — `generateTrainingPlan` (`electron/services/trainingEngine.ts:509`),
mirroring the existing `training_frequency` clamp two lines above: normalize a
non-finite/non-positive value to `undefined` so each builder applies its own
default (exactly as when the field was never set); positive values (incl. 1–2,
which the builders already floor) are preserved. This fixes PPL/auto, upper/lower,
Arnold, and bro at once and makes the `WorkoutSession` NaN% path unreachable via
this route.

### Tests added
`tests/unit/trainingEngine.test.ts` — "never produces an empty session for a
non-positive / non-finite exercises_per_session": across `auto/ppl/upper_lower/
arnold/bro/full_body` and `exercises_per_session ∈ {0, -3, NaN}`, asserts every
session has ≥1 exercise. **FAILS pre-fix** (`auto exPer=0` → Legs empty), passes
after.

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (247 tests, +1 new)
- `npx electron-vite build` → PASS

---

## Run: 2026-07-17b (BUG FIX — corrupted/hand-edited localStorage crashes every competition widget: createLocalStore never validates parsed shape)

### STEP 0 — Backlog
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (all 13 done).
So this run is a **bug hunt**, not a backlog item.

### STEP 1 — Regression guard (clean pull of master)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (243 tests, 31 files)
- `npx electron-vite build` → PASS

(`npm ci` with `ELECTRON_SKIP_BINARY_DOWNLOAD=1` — electron's postinstall binary
403s from the sandbox proxy; not needed to typecheck/test/build.)

### STEP 2 — Area audited: (e) widgets + localStorage stores  (with (f) shows/date/week swept alongside)
Rotated off the recent runs' areas (c check-in, b training, a nutrition, d onboarding).
Traced the localStorage-backed stores and their consumers:
`localStore.ts` (`createLocalStore`), `competitionLogs.ts` (the 5 competition
stores), `createWidgetStore.ts`, `useWidgets.ts`, `tabWidgets.ts`, `useWaterLog.ts`,
and every competition widget (`Posing/Sleep/Supplement/Condition`,
`DailyWeighIn`) plus the show/date widgets (`PeakWeek/PrepPace/PrepGuidance/
QuickStats`) and the show/date backend (`showHandlers.ts`, `plan:startupRefresh`,
`utils/dates.ts`, `competitionPrep.ts`). `createWidgetStore`, `useWidgets`,
`tabWidgets`, `useWaterLog`, and `DailyWeighInWidget` all correctly guard their
parsed values (`Array.isArray` / `isNaN` fallbacks) — clean.

### The bug
`createLocalStore.read()` returned `JSON.parse(raw)` **cast to `T` with no shape
check**. Malformed JSON is caught by the `try/catch` → fallback, but *valid* JSON of
the **wrong shape** (`null`, `{}`, `5`, `"x"`, `true`) parses successfully, never
throws, and was handed straight to consumers. Every one of the five competition
stores (`posingStore`, `sleepStore`, `conditionStore`, `supplementListStore`,
`supplementLogStore`) declares its value as an array and immediately calls
`.filter`/`.find`/`.reduce` on it. So a single hand-edited / corrupted localStorage
key crashes the whole widget (and its dashboard render tree):

Concrete repro (deterministic, time-independent): `localStorage['posing_log'] =
'null'` → `PosingWidget` mounts → `posingLog.filter(...)` throws
`TypeError: Cannot read properties of null (reading 'filter')`. Same for
`sleep_log='{}'`, `supplement_log='5'`, `supplement_list='"x"'`,
`condition_log='true'`. Explicitly in-scope ("corrupted or hand-edited
localStorage"). The two sibling stores (`createWidgetStore.ts:38`,
`useWidgets.ts:42`) already guard with `if (!Array.isArray(parsed)) return default`
— `createLocalStore` was the lone omission, despite its own comment advertising
corruption-resistance.

### Root cause + fix (file:line)
`src/components/widgets/localStore.ts` `read()` (~line 12): parse the raw value,
then — mirroring the sibling stores — fall back when the top-level shape doesn't
match `fallback()`: `if (parsed == null || Array.isArray(parsed) !==
Array.isArray(fb)) return fb`. This rejects `null` and array/non-array mismatches
(the crash cases) while preserving valid stored arrays. Minimal, generic (works for
any `createLocalStore<T>` whether `T` is an array or object), no consumer changes.

### Tests added
`tests/unit/localStoreCorrupted.test.tsx` (jsdom): (1) `createLocalStore<number[]>`
returns an array for each of `null`/`{}`/`5`/`"hello"`/`true`; (2) a valid stored
array is preserved unchanged; (3) `Posing/Sleep/Supplement/Condition` widgets all
render without throwing when their logs are corrupted to non-arrays. Tests (1)&(3)
**FAIL pre-fix** (store returns `null`; PosingWidget throws on `.filter`).

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (246 tests, +3 new)
- `npx electron-vite build` → PASS

---

## Run: 2026-07-17 (BUG FIX — editing a check-in's date desyncs week_number from date order → wrong "Current Weight" & zig-zag weight chart)

### STEP 0 — Backlog
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (all 13 done).
So this run is a **bug hunt**, not a backlog item.

### STEP 1 — Regression guard (clean pull of master)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (241 tests, 30 files)
- `npx electron-vite build` → PASS

(`npm ci` with `ELECTRON_SKIP_BINARY_DOWNLOAD=1` — electron's postinstall binary
403s from the sandbox proxy; not needed to typecheck/test/build.)

### STEP 2 — Area audited: (c) check-in + Progress + adaptive nutrition
Rotated off the previous runs' areas (b, a). Traced the full check-in path:
`checkinEngine.ts` (`weightTrend`/`weightTrendPct` smoothing, `calculateAdjustments`
cut/recomp branches, recovery/stress/adherence notes), all four IPC handlers in
`checkinHandlers.ts` (submit / submitMissed / update / next-allowed / history /
latest), the adaptive-nutrition recalc block (calorie delta → protein/fat/carbs +
per-meal scaling), `progressHandlers.ts`, and the whole Progress + CheckIn UI
(`Progress/index.tsx` weekly-rate/projection/body-comp/consistency math,
`CheckIn/index.tsx` submit/edit/missed-slot flows, `WeightChart`,
`CheckinFeedbackWidget`, `RecentCheckinsWidget`). Verified the DB CHECK
constraints (adherence 0–100, wellness 1–5) fence off the wellness/adherence
edit paths, and that submit's cascade reload keeps the diet plan in sync.

### The bug
Editing an existing check-in's **date** (the "Edit Last Check-In" panel on the
locked screen, or `checkin:update` generally) moved the row's `check_in_date` but
never touched its `week_number`. So a date edit that reorders the check-in relative
to the others left `week_number` stuck at its **old chronological rank** — breaking
the invariant that `submit` and `submitMissed` both maintain (week_number ==
chronological rank). Reachable normally: the edit panel targets the most-recent
check-in and its date input is capped at today, so correcting a mistyped date to one
that lands *before* an earlier check-in is an everyday action.

Concrete repro (checkins 07-01→wk1, 07-08→wk2, 07-15→wk3; user fixes the 07-15 row's
date to 07-02): afterward `week_number` reads 1→07-01, 2→07-08, **3→07-02**. Because
`progress:entries` returns rows `ORDER BY week_number ASC`, the weight chart plots
07-01 → 07-08 → 07-02 (a line that jumps backward in time), and the Progress page's
`latest = progressEntries[last]` (highest week_number) now points at the **07-02,
84 kg** row while the real most-recent weigh-in is **07-08, 85 kg** — so
"Current Weight", "Total Change", and the first→latest measurement deltas all show
values from the wrong (older) check-in. A real **DB↔UI desync / off-by-one
week_number**.

### Root cause + fix (file:line)
`electron/ipc/checkinHandlers.ts` `checkin:update` (~line 359–390): the UPDATE
whitelists `check_in_date` but not `week_number`, and there was no renumber pass —
unlike `submitMissed`, which shifts `week_number` to keep chronological order.
**Fix:** capture a `dateChanged` flag in the existing date-validation block, and
after the UPDATE, when the date actually changed, renumber **all** of the user's
check-ins by `(check_in_date ASC, id ASC)` — reassigning a dense `1..N`
`week_number` sequence in JS (portable; no window-function dependency). Restores
`week_number == chronological rank` so every week_number-ordered consumer
(`progress:entries`, the chart, the first/latest stats) reads correctly. No-op when
the date is unchanged (weight/measurement-only edits leave ordering intact).

### Tests added
`tests/unit/checkinUpdateRenumber.test.ts` — runs the REAL handler against an
in-memory `node-sqlite3-wasm` DB (same pattern as `checkinUpdateDuplicate.test.ts`):
(1) moving the 07-15 check-in's date to 07-02 renumbers to 07-01→1 / 07-02→2 /
07-08→3 so ordering by week_number equals ordering by date, with a dense 1..3
sequence; (2) a weight-only edit (no date change) leaves all week_numbers and their
order untouched. Test (1) **FAILS pre-fix** (row keeps week_number 3 at date 07-02).

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (243 tests, +2 new)
- `npx electron-vite build` → PASS

---

## Run: 2026-07-16b (BUG FIX — editing a logged set silently fails (DB↔UI desync) when a field is empty: `undefined` binding crashes the DB)

### STEP 0 — Backlog
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (all 13 done).
So this run is a **bug hunt**, not a backlog item.

### STEP 1 — Regression guard (clean pull of master)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (239 tests, 29 files)
- `npx electron-vite build` → PASS

(`npm ci` with `ELECTRON_SKIP_BINARY_DOWNLOAD=1` — electron's postinstall binary
403s from the sandbox proxy; not needed to typecheck/test/build.)

### STEP 2 — Area audited: (b) training engine + workout/session flows
Rotated off the previous run's area (a). Traced the whole training path:
`trainingEngine.ts` (all six split builders + `getExercises`/`getSets`/`getRepRange`
+ NaN/freq clamps), `workoutHandlers.ts` (start/logSet/complete/skip/active/history/
sessionSummary/**updateSet**/deleteSet/saveSetsBatch/cancelWorkout), the plan IPC
(`plan:updateSession`, training regen/refine, set-cap plumbing), and the whole
Training UI (`WorkoutSession`, `WorkoutLogEditor`, `SessionEditor`, `WorkoutStats`,
`Training/index.tsx` — PR/tonnage/adherence/streak/muscle-volume math). Empirically
probed the engine across **6 splits × 3 equipment tiers × freq 2–6 × exPerSession
{1,2,3,4,6,8,12,20} × setsPerExercise {none,1–5} × exp {0,1,3,10}** for empty
sessions, duplicate exercises within a session, wrong session counts, and
non-finite/`<1` set counts → **zero** issues (the engine core is solid; prior runs
already hardened the empty-session cases).

### The bug
Editing a **completed workout log** and changing the weight/reps of a set that has
an **empty RIR** — or **clearing** a weight/reps field on any logged set — silently
failed to save. The `WorkoutLogEditor` auto-save (fires on every field blur) sends
`{ weight_kg, reps_actual, rir_actual }` computed from the row, using **`undefined`**
for any empty field (`row.rir !== '' ? parseInt(row.rir) : undefined`, and cleared
weight → `undefined`). That `undefined` survives Electron IPC (V8 structured clone
keeps the key with an `undefined` value — verified), reaches `workout:updateSet`,
and gets bound straight into the SQL `UPDATE`. `node-sqlite3-wasm` **throws**
`Unsupported type for binding: "undefined"`. The renderer's `.catch` only
`console.error`s it, so the user sees the new value in the UI while the DB keeps the
old one — a real, common **DB↔UI desync** (RIR is optional, so "edit the weight of a
set that never recorded RIR" is an everyday action).

### Root cause + fix (file:line)
`electron/ipc/workoutHandlers.ts` `workout:updateSet` (~line 80): it mapped each
whitelisted field's value straight to a binding (`v as string | number | null`),
with no handling for `undefined`. `workout:logSet` and `workout:saveSetsBatch`
already normalise with `?? null`; only `updateSet` didn't.
**Fix:** coerce `undefined → null` in the value map
(`v === undefined ? null : v as string | number | null`). An emptied field means
"clear this column", which is exactly `NULL` — so a cleared weight now persists as
`NULL` and a weight edit on a no-RIR set succeeds without touching RIR. Guarded at
the backend seam so *any* caller sending `undefined` is safe. Minimal change; no
other consumer affected (`skipped` still coerces to 0/1 first).

### Tests added
`tests/unit/workoutUpdateSet.test.ts` — runs the REAL handler against an in-memory
`node-sqlite3-wasm` DB (same pattern as `checkinUpdateDuplicate.test.ts`): (1) a
weight edit on a set with `rir_actual: undefined` persists the weight and leaves RIR
`NULL`; (2) `weight_kg: undefined` clears the weight to `NULL` while keeping RIR.
Both **FAIL pre-fix** with `Unsupported type for binding: "undefined"` and pass
after.

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (241 tests, +2 new)
- `npx electron-vite build` → PASS

---

## Run: 2026-07-16 (BUG FIX — "Dairy-free" restriction violated: cottage cheese & ricotta still appear in the meal plan)

### STEP 0 — Backlog
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (all 13 done).
So this run is a **bug hunt**, not a backlog item.

### STEP 1 — Regression guard (clean pull of master)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (238 tests, 29 files)
- `npx electron-vite build` → PASS

(`npm ci` with `ELECTRON_SKIP_BINARY_DOWNLOAD=1` — electron's postinstall binary
403s from the sandbox proxy; not needed to typecheck/test/build.)

### STEP 2 — Area audited: (a) nutrition engine + Diet flows
Rotated off the previous run's area (f). Deeply traced the nutrition path:
`nutritionEngine.ts` (`generateNutritionPlan`/`buildMeals`/`getMealTemplates`/
`getFood`/`getCultureFood`/cook-time + prep-style passes/clamps),
`foodDatabase.ts` (`EXCLUSION_ALIASES`/`FOOD_SUBSTITUTES`/`FOOD_CATEGORY`),
`planHandlers.ts` (generate/recalc/startupRefresh/applyAIRequest/swap/reorder),
`checkinHandlers.ts` + `checkinEngine.ts` (adaptive macros), and the Diet UI
(`Diet/index.tsx` refeed + swap + timeline, `WeeklyMealView`, `GroceryList`,
`recipeSteps`). Empirically probed the engine with extreme inputs (1/20 meals,
0/20 snacks, NaN counts, huge/tiny weights) — all macro sums stayed finite,
non-negative, and on-target. Then probed every dietary restriction × preference ×
meal/snack count for foods that slip past the restriction.

### The bug
Selecting the **"Dairy-free"** restriction still produced meal plans containing
**Cottage Cheese** (Afternoon/Evening snacks, and vegetarian Mid-Morning/Lunch)
and **Ricotta** (vegetarian Dinner). A user who explicitly said "no dairy" was
served dairy — a real, reachable food-selection / restriction-violation bug.

### Root cause + fix (file:line)
`getFood()` (nutritionEngine.ts) substitutes an excluded food by iterating its
`FOOD_SUBSTITUTES[id]` chain and returning the first sub whose id is **not**
excluded; if the whole chain is excluded it falls back to the original (still
excluded) food. The chains for two dairy proteins contained **only other dairy
foods**:
- `cottage_cheese` → `[greek_yogurt, ricotta]` (both dairy)
- `ricotta` → `[cottage_cheese, greek_yogurt]` (both dairy)

So for a dairy-free user every candidate was excluded and `getFood` fell back to
the excluded original. (`greek_yogurt` escaped because its chain already includes
the non-dairy `soy_milk`.)

**Fix — `electron/services/foodDatabase.ts:154` and `:271`:** append two trailing
non-dairy protein fallbacks (`tofu`, then `pea_protein`) to both chains, after the
existing dairy options. `getFood` now reaches `tofu` (or `pea_protein` if soy is
also excluded) and never returns the excluded dairy item. The substitute display
strings are documentation-only (getFood uses `titleCase(subId)` + a
calorie-derived portion via `FOOD_CALORIES_PER_100G`, both of which `tofu`/
`pea_protein` have), so no other consumer is affected. Macros are unchanged (the
sub is same-role protein and portions derive from meal calories, not the food).

### Tests added
`tests/unit/nutritionEngine.test.ts` — new "dietary restrictions are respected"
block: for a `Dairy-free` user across omnivore/vegetarian/vegan × meal counts
3–6 (with snacks), asserts no meal food contains cottage cheese / ricotta /
greek yogurt / kefir / labneh. Confirmed it FAILS on the pre-fix chains
(`cottage cheese (90g)` present) and passes after. A broader ad-hoc probe
(all 13 restriction labels × 3 prefs × meal 1–6 × snacks 0/3) reports
**zero** restriction violations post-fix.

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (239 tests, +1 new)
- `npx electron-vite build` → PASS

---

## Run: 2026-07-15b (BUG FIX — editing a check-in's date onto an occupied day creates a duplicate same-day check-in)

### STEP 0 — Backlog
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (all 13 done).
So this run is a **bug hunt**, not a backlog item.

### STEP 1 — Regression guard (clean pull of master)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (236 tests, 28 files)
- `npx electron-vite build` → PASS

(`npm ci` with `ELECTRON_SKIP_BINARY_DOWNLOAD=1` — electron's postinstall binary
403s from the sandbox proxy; not needed to typecheck/test/build.)

### STEP 2 — Area audited: (f) shows/competition + date/week logic + unit conversion
Rotated off the previous run's area (e). Traced the show/countdown/week paths:
`showHandlers.ts` (add/update/delete/cancel/setPrimary + `computeWeeksOut`),
`planHandlers.ts` `plan:startupRefresh` (weeks_out → phase transition),
`utils/dates.ts` (`getShowCountdown`/`parseLocalDate`/`localDateStr`),
`data/competitionPrep.ts` (`buildPrepTimeline`/`getWeekGuidance`), the prep/peak
widgets, `utils/units.ts` + water/weight unit conversions, and the check-in
date/week logic (`checkinHandlers.ts` submit/submitMissed/update).

### The bug
`checkin:update` (electron/ipc/checkinHandlers.ts) let the user change a
check-in's `check_in_date` with **no duplicate-date guard**. The Check-In edit
form (`src/pages/CheckIn/index.tsx`) exposes an editable date field, so a user
editing their latest check-in could set its date to a day that already has a
different check-in. Result: **two `weekly_checkins` rows share one
`check_in_date`** — exactly the invariant `checkin:submit` and
`checkin:submitMissed` both explicitly reject ("one weigh-in per calendar day").
Duplicate same-day rows put two points on the weight-trend chart for one day and
make the `previous` / `week_number` lookups (which order by date) ambiguous.

### Root cause + fix (file:line)
- **electron/ipc/checkinHandlers.ts:311** (`checkin:update`): after loading the
  existing row, if `data.check_in_date` is provided, validate its `YYYY-MM-DD`
  format (the seam previously trusted it) and — when it differs from the current
  date — reject with `DUPLICATE_CHECKIN:<date>` if another row
  (`id<>checkinId`) for the same user already occupies that date. Mirrors the
  submit/submitMissed guards.
- **src/pages/CheckIn/index.tsx** (`saveEdit` catch): translate the
  `DUPLICATE_CHECKIN` error into a friendly "Another check-in already exists on
  that date. Pick a different date." message, matching the submit flow's handling
  (which previously showed the raw error string in the edit modal).

### Tests added
`tests/unit/checkinUpdateDuplicate.test.ts` (2) — exercises the REAL handler
against an in-memory `node-sqlite3-wasm` DB (full schema + migrations applied;
`../database/db` mocked to supply `getDb`/`namedParams` without loading Electron):
1. moving a check-in onto an occupied date throws `DUPLICATE_CHECKIN` and creates
   no duplicate row (1 row per day preserved),
2. moving a check-in to a genuinely free date still succeeds.
Confirmed the first test FAILS on the pre-fix handler (duplicate row created, no
throw) and passes after.

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (238 tests, +2 new)
- `npx electron-vite build` → PASS

---

## Run: 2026-07-15 (BUG FIX — data reset leaves stale in-memory stores → deleted data resurrects)

### STEP 0 — Backlog
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (all 13 done). So
this run is a **bug hunt**, not a backlog item.

### STEP 1 — Regression guard (clean pull of master)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (233 tests, 27 files)
- `npx electron-vite build` → PASS

(`npm ci` with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`.)

### STEP 2 — Area audited: (e) widgets (dashboard + Training/Nutrition tabs) + localStorage stores
Rotated off the prior runs' areas (d onboarding/Settings/reset, c check-in, b
training, a nutrition, f shows/date). Traced the widget store factories
(`createWidgetStore`, `createLocalStore`, `useWidgets`) — all well-guarded
(unknown-id drop, de-dupe, stable snapshots, NaN-guarded water log); the
drag-reorder index alignment in `WidgetZone`/`TabWidgetZone` (real stored indices
preserved past hidden competition widgets — correct); and every competition /
logging widget (posing/sleep/condition/supplement/cardio — all input-validated).
The one **real, reachable** defect surfaced where these localStorage-backed
stores meet the **data-reset lifecycle**.

### Bug found — "Reset All Data" leaves every in-memory store holding the just-deleted data
- **File:** `src/store/userStore.ts` (`resetAllData`, ~line 111).
- **Root cause:** the reset wipes the DB (main process `user:resetAll`) and
  app-local localStorage (`resetLocalData`), then does only a **soft**
  `set({ user: null, shows: [] })` to re-route to onboarding. There is **no reload
  anywhere in the app** (verified — zero `location.reload` call sites). But the
  data stores are module/zustand **singletons** that the soft `set` never
  touches: `planStore` (plans + `workoutHistory` + `mealCompletions`),
  `cardioStore.cardioLog`, and the `createLocalStore` caches for
  posing/sleep/condition/supplement logs + the widget-layout caches all keep the
  pre-reset data in memory.
- **Impact (two ways, both reachable via Settings → Reset All Data):**
  1. **Storage↔UI desync** — once the user finishes the restarted onboarding and
     lands on the dashboard, the widgets read from these stale singletons and
     re-display cardio/plan/scorecard data the reset was supposed to delete.
  2. **Permanent resurrection** — the next time the user logs anything, the store
     writes `[...staleCached, new]` back to localStorage
     (`cardioStore.addEntry` → `persist([...s.cardioLog, entry])`;
     `posingStore.set([...posingLog, entry])`; etc.), so the "deleted" rows are
     re-persisted and survive even a later genuine reload. A destructive,
     user-initiated action silently fails to be destructive.
- **Fix:** after the DB + localStorage wipe succeed and the store user/shows are
  cleared, **hard-reload** the renderer
  (`window.location.reload()`, guarded for non-DOM/`typeof` safety) so every
  in-memory store re-initializes from the now-cleared DB/localStorage. This is the
  only reliable way to clear *all* the singletons at once (there are many across
  zustand + module scope) and it matches this action's own stated contract —
  the button reads **"Reset All Data & Restart Onboarding."** Preserved weigh-ins
  and water intake are written to localStorage *before* the reload, so nothing the
  reset is meant to keep is lost.

### Tests added
- `tests/unit/resetAllData.test.ts` (3 tests, jsdom): mocks `window.api`, seeds
  removable (`cardio_log`/`posing_log`/`dashboard_widgets`) + preserved
  (`daily_weight_log`) keys, and spies `window.location.reload`. Asserts (1) the
  reset triggers exactly one reload — **FAILS against the old soft-reset code,
  PASSES after the fix**; (2) non-preserved keys are wiped while the weigh-in log
  survives with the check-in weight folded in; (3) in-store user/shows are cleared.

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (236 tests, +3 new)
- `npx electron-vite build` → PASS

---

## Run: 2026-07-14b (BUG FIX — cleared numeric profile field NULLs a required column)

### STEP 0 — Backlog
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (all 13 done). So
this run is a **bug hunt**, not a backlog item.

### STEP 1 — Regression guard (clean pull of master)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (228 tests, 26 files)
- `npx electron-vite build` → PASS

(`npm ci` with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`.)

### STEP 2 — Area audited: (d) onboarding + Settings + reset + data lifecycle
Rotated off the prior runs' areas (c check-in, b training, a nutrition, f
shows/date). Traced the reset/data-lifecycle path (`user:resetAll`,
`resetLocalData`/`mergeWeighIns` — well-guarded, weigh-in preservation sound),
the Settings appearance/schedule/AI/shows sections, the Onboarding wizard +
`useOnboarding` + `Step1Personal` unit conversions, and the `user:create` /
`user:update` IPC handlers. The profile **edit** path surfaced a real, reachable
defect.

### Bug found — clearing a numeric field in Settings → Save writes NULL into a required column
- **Files:** `electron/ipc/userHandlers.ts` (`user:update`) and the number inputs
  in `src/pages/Settings/index.tsx` (Age/Height/Weight/Days/Exercises/Sets — e.g.
  line 338 `age: parseInt(e.target.value)`).
- **Root cause:** the Settings edit-form number inputs call
  `parseInt`/`parseFloat` directly in `onChange`. Clearing a field makes
  `e.target.value === ''`, so `parseInt('')` → **NaN**, stored into `editForm`.
  `handleSaveProfile` does no validation, so `updateUser({...editForm})` sends the
  NaN through `user:update`. The handler's clean step only dropped `undefined`
  entries — a NaN survived, and **node-sqlite3-wasm binds `NaN`/`±Infinity` as
  `NULL`** (verified empirically). So `age`/`height_cm`/`weight_kg`/
  `training_frequency`/`exercises_per_session`/`sets_per_exercise` get silently
  blanked to NULL.
- **Impact:** a NULL `weight_kg`/`height_cm` then reaches `displayWeight`/
  `displayHeight` (`null.toFixed(1)` → **TypeError** → the Settings Profile card /
  Dashboard crash), and NULL age/weight propagate as `NaN` through the nutrition
  engine's BMR/TDEE math — a genuine DB↔UI corruption, not a cosmetic issue.
- **Fix:** extracted the update payload's serialize/clean logic into a pure,
  testable module `electron/ipc/userSanitize.ts` (`sanitizeUserUpdate` + the three
  existing clamps). The clean step now drops **non-finite numbers** (NaN/±Infinity)
  in addition to `undefined`, so a cleared required field becomes a no-op for that
  column (the stored value is kept) instead of nulling it. `user:update` also now
  guards the all-fields-dropped case (empty `SET` list would be invalid SQL) by
  bumping only `updated_at`. `user:create` reuses the same extracted clamps
  (unchanged behavior). Body-fat's nullable clear path is preserved (an explicit
  `null` still goes through).

### Tests added
- `tests/unit/userSanitize.test.ts` (5 tests): a cleared (NaN) weight is dropped
  while `age`/`id` survive; NaN/±Infinity dropped for every required numeric field;
  valid finite numbers kept; `undefined` dropped but explicit `null` body-fat kept;
  arrays serialized and meal/snack counts clamped. The first two **FAIL** against
  the old undefined-only filter and PASS after the fix.

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (233 tests, +5 new)
- `npx electron-vite build` → PASS

---

## Run: 2026-07-14 (BUG FIX — biweekly check-ins show phantom "missed" slots)

### STEP 0 — Backlog
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (all 13 done, last
2026-07-07). So this run is a **bug hunt**, not a backlog item.

### STEP 1 — Regression guard (clean pull of master)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (225 tests, 26 files)
- `npx electron-vite build` → PASS

(`npm ci` with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`.)

### STEP 2 — Area audited: (c) check-in + Progress + adaptive nutrition
Rotated off the prior runs' areas (b training, a nutrition, f shows/date). Traced
`checkinEngine.ts` (well-guarded weight-trend math; verified via its 21 existing
tests), `checkinHandlers.ts` (submit / submitMissed / update / history — dup-date
guards, week-number shifting, and the adaptive diet-plan recalc all sound), the
`Progress/index.tsx` and `CheckIn/index.tsx` flows, the check-in widgets, and the
check-in **schedule** helpers (`electron/services/checkinSchedule.ts` +
`src/utils/checkinSchedule.ts`). The schedule helper surfaced one **real,
reachable** defect.

### Bug found — biweekly (day-based) check-ins report phantom "missed" slots
- **Files:** `electron/services/checkinSchedule.ts` and
  `src/utils/checkinSchedule.ts` — `computeMissedSlots` (and its `addMissedFrom`
  helper). The live UI path is the `src/utils` copy via
  `src/pages/CheckIn/index.tsx:444`.
- **Root cause:** `computeMissedSlots` never received the biweekly flag and used a
  check-in's stored `interval_days` column as its cadence. But biweekly is a
  **'day'-mode sub-option** — the `interval_days` input only appears in *interval*
  mode, so day-mode rows keep `interval_days` at its `7` default regardless of
  biweekly. A biweekly athlete's real ~14-day gaps were therefore judged against a
  7-day cadence: `countMissedBetween` computes `floor(14/7) − 1 = 1` phantom
  missed slot in the *middle* of every genuine 14-day gap, and the
  post-last-check-in scan then cascaded more (a 3-check-in Monday history produced
  **7 phantom "Missed — Expected …" slots**, reproduced empirically). Each phantom
  slot renders a "fill in a missed check-in" panel that, if used, inserts a bogus
  extra check-in and shifts week numbers.
- **Reachability:** fully reachable — Settings → Check-In Schedule → day mode →
  "Every other <day>" sets `checkin_biweekly='true'`; `getNextCheckinDate` already
  honours the 14-day biweekly cadence, so real check-ins land ~14 days apart and
  trip the mismatch on every period.
- **Fix:** added an optional `biweekly` parameter to `computeMissedSlots` and a
  small `effectiveInterval()` helper. Day-mode cadence is now derived from the
  schedule itself (`biweekly ? 14 : 7`) rather than the meaningless `interval_days`
  column; interval mode still uses the per-row stored interval (falling back to the
  current setting for legacy rows) exactly as before. `addMissedFrom` now steps
  day-mode slots by that effective interval (was hard-coded `+7`) then re-aligns to
  the check-in day, so generated biweekly dates are correct too. The `CheckIn`
  caller now passes `settings.checkin_biweekly === 'true'`. After the fix the same
  history yields **0** phantom slots and only genuinely-skipped biweekly periods
  are reported; the weekly and interval paths are unchanged.

### Tests added
- `tests/unit/checkinSchedule.test.ts` — new `computeMissedSlots — biweekly
  (day-based) cadence` block (3 tests): on-time biweekly 14-day check-ins produce
  **0** missed; weekly day mode still flags a genuine 14-day skip (1); a genuinely
  skipped 28-day biweekly gap is flagged as 1. The two "biweekly" tests **FAIL**
  against the old code and PASS after the fix.

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (228 tests, +3 new)
- `npx electron-vite build` → PASS

---

## Run: 2026-07-13b (BUG FIX — Arnold split builds an EMPTY workout day)

### STEP 0 — Backlog
`docs/change-backlog.md` has **zero unchecked (`- [ ]`) items** (all 13 done, last
2026-07-07). So this run is a **bug hunt**, not a backlog item.

### STEP 1 — Regression guard (clean pull of master)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (224 tests, 26 files)
- `npx electron-vite build` → PASS

(`npm ci` with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`.)

### STEP 2 — Area audited: (b) training engine + workout/session flows
Rotated off the prior two runs' areas (nutrition/Diet, shows/date). Traced
`electron/services/trainingEngine.ts` (all six split builders), the training IPC
paths (`workoutHandlers.ts`, `planHandlers.ts` incl. the `plan:applyAIRequest`
regenerate path), and the front-end workout flows (`WorkoutSession.tsx`,
`WorkoutLogEditor.tsx`, `SessionEditor.tsx`, `WorkoutStats.tsx`, and the
`TodaysSession`/`TrainingVolume`/`SessionsWeek` widgets). The UI logging paths
and the check-in/PR/volume math are well-guarded. Empirically probed
`generateTrainingPlan` over a full matrix (6 splits × 3 equipment tiers × freq
2–6 × 4 goals × exercises_per_session {1,2,3,4,5,6,8,12} × sets {–,1,4}) for
crashes / NaN / empty sessions — surfaced one **real, reachable** defect.

### Bug found — Arnold split emits a completely empty "Shoulders & Arms (B)" session
- **File:** `electron/services/trainingEngine.ts` — `buildArnoldSplit`, the
  variant-B cycle entries (was lines 394–395).
- **Root cause:** the "(B)" variant sessions were built by dropping the first
  exercise of each muscle group with `.slice(1)` to vary the ordering vs the "A"
  session. "Shoulders & Arms (B)" is `[...shoulderA.slice(1), ...biA.slice(1),
  ...triA.slice(1)]`. The per-group counts come from `armThird =
  Math.max(1, Math.round(exercises_per_session / 3))`, so a low
  `exercises_per_session` collapses each group to a **single** exercise;
  `slice(1)` on a 1-element array yields `[]`, and all three groups empty at
  once → a real training day (day 5 of an Arnold split) with **zero exercises**.
- **Reachability:** fully reachable through the UI — Settings allows
  `exercises_per_session` 3–12 (`Settings/index.tsx:429`), `training_frequency`
  2–6, and `split_preference: 'arnold'`. `armThird === 1` for
  `exercises_per_session ∈ {1,2,3,4}`, so any Arnold user training 5–6 days/week
  with 3 or 4 exercises/session got an empty "Shoulders & Arms (B)" day (nothing
  to do, and 0-set contribution to weekly volume). "Chest & Back (B)" used the
  same pattern and, while never fully empty, silently dropped `backA[0]`
  permanently (variant B had one fewer exercise than A).
- **Fix:** added a small `rotateOne<T>(arr)` helper (moves the first element to
  the end; returns the array unchanged when length ≤ 1) and used it for both the
  "Chest & Back (B)" and "Shoulders & Arms (B)" cycle entries instead of the
  `.slice(1)` drops. Rotation preserves length, so B still differs in ordering
  from A (variety intent kept) but can never empty a group that has ≥1 exercise,
  and no longer discards an exercise. Legs & Core (B) already rotates via slices
  and never empties — left untouched (minimal change).

### Tests added
- `tests/unit/trainingEngine.test.ts` — new regression test: for Arnold split at
  `training_frequency` 5 and 6 × `exercises_per_session` {3,4,5,6}, asserts every
  session has ≥1 exercise and every exercise has a name. Confirmed it **FAILS**
  against the old code (`arnold freq=5 exPer=3 — "Shoulders & Arms (B)" was
  empty: expected 0 to be greater than 0`) and PASSES after the fix. Also
  re-ran the full engine probe post-fix: **0 empty sessions** across the matrix.

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → PASS (clean)
- `npm test` → PASS (225 tests, +1 new)
- `npx electron-vite build` → PASS

---

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
