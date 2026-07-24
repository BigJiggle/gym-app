# Change Agent Report

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
