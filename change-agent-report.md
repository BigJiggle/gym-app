# Change Agent Report

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
