# PrepCoach QA Report — 2026-06-08

## Phase 1 — QA Audit

### TypeScript
`npx tsc --noEmit` passed with **0 errors** before and after all changes.

### Unit Tests
`npm test` — **84 tests pass, 0 failures** across the full vitest suite.

### Nutrition Engine Audit (`nutritionEngine.ts` + `foodDatabase.ts`)
Re-audited `generateNutritionPlan`, `buildMeals`, `getMealTemplates`, `getFood`, `getCultureFood`, `calcBMR`/`getPhaseAwareDeficit`, and the food database tables (`EXCLUSION_ALIASES`, `FOOD_SUBSTITUTES`, `FOOD_CATEGORY`, `FOOD_DISPLAY`, `SNACK_ONLY_FOODS`).

- Macro math verified correct: `protein_g = round(weight_kg × 2.3)`, `fat_g = round(weight_kg × 0.9)`, `carbs_g = round((calories - protein×4 - fat×9) / 4)`
- Cross-referenced all 228 entries in `src/data/foods.ts` (the exclusion/preference picker UI's source list) against `FOOD_CATEGORY` keys — found and fixed a real gap (Bug 1 below)

### Spot Checks
Ran `generateNutritionPlan` via temporary scripts for both required scenarios — all macros non-NaN, all portions valid, vegan scenario contained no animal products, no zero-calorie meals.

### 7 User Flow Traces

| Flow | Status |
|---|---|
| Onboarding → user created → plans generated | ✓ |
| Diet portions render with valid macros and strings | ✓ |
| Meal completion logged/unlogged | ✓ |
| Check-in submitted → adjustments applied → macros scaled | ✓ |
| Settings → diet plan regeneration | ✓ |
| Workout start → set log → complete | ✓ |
| Progress chart renders from check-in history | ✓ |

### Bugs Fixed

**Bug 1 — 41 selectable foods had no `FOOD_CATEGORY` entry, silently breaking preference substitution**
`electron/services/foodDatabase.ts` (after the VEGETABLES section, ~line 392)

Cross-referencing the 228 foods exposed via the exclusion/preference picker (`src/data/foods.ts`) against `FOOD_CATEGORY` found 41 ids — including common culture-specific dishes like `paneer`, `hummus`, `chicken_tikka`, `falafel`, `basmati_rice`, `miso_soup` — that existed in the picker but had no category mapping. `getFood()`'s preference-substitution path requires a category match, so any athlete who selected one of these as a *preferred* food would silently never see it appear in their generated plan — a real, invisible failure of a headline feature ("tell us what you like and we'll build your meals around it"). Fixed by adding all 41 entries with categories derived from each food's `category` field plus macro-dominance analysis for ambiguous dairy items. Verified via spot-check script: `hummus` now resolves to `"Hummus (30g)"` and `paneer` to `"Paneer (150g)"`.

**Bug 2 — Reported `meal_count` could mismatch the actual number of meals generated**
`electron/services/nutritionEngine.ts` (~line 542, `generateNutritionPlan` return)

`getMealTemplates()` is hardcoded to a maximum of 6 meal templates (`indices.slice(0, count)` where `indices` arrays top out at 6 elements), but the returned `NutritionPlan.meal_count` echoed the raw, unclamped `input.meal_count`. An athlete who set a preference above 6 (the Settings UI's `<input type="number">` only visually constrains to max=6, with no programmatic clamping on save) would see a plan that claims e.g. "7 meals" while only rendering 6 — a confusing, self-contradictory display. Fixed by changing the returned value to `meals.length`, the actual count of generated meal objects.

### Phase 1 Result
**2 bugs fixed.** TypeScript clean, all tests pass, all flows verified. Since 2 < 3, Phase 2 runs per specification.

---

## Phase 2 — Feature (Prep Athlete)

**Feature: Interactive, persisted Peak Week / prep-milestone checklist**

Files changed: `src/pages/Dashboard/index.tsx`, `src/pages/Education/index.tsx`

Both the Dashboard's "This Week in Prep" card and the Education page's Prep Timeline already surfaced each week's concrete competition-prep to-dos (e.g. *"Final spray tan session booked"*, *"Suit/trunks ordered and arrived"*, *"Coach check-in photos submitted"*) — but only as static, permanently-empty `□` checkboxes. A prep athlete checking these screens daily had no way to actually mark progress on these real-world tasks; they had to remember mentally or track them somewhere else entirely, defeating the purpose of showing a checklist at all.

**What changed:**
- Both checklists are now clickable. Clicking a milestone toggles a green `☑` + strikethrough state and persists it to `localStorage`, keyed per show + weeks-out (`milestones_<showId>_<weeksOut>`) — the exact same persistence pattern already used by the Dashboard's water-intake tracker (`water_ml_<date>`), so no new IPC/backend work was needed.
- The Dashboard card now also shows a live **"N/M done"** progress count next to the milestone header.
- Both views read/write the *same* storage key, so checking an item off on the Dashboard is instantly reflected on the Education page's Prep Timeline and vice versa — no duplicate, drifting checklists.
- Click handlers use `stopPropagation`/`preventDefault` so toggling a checkbox doesn't trigger the card's "navigate to /education" `Link` behavior.

**Implementation:** Pure frontend — `useState` + `localStorage`, mirroring the existing water-tracking pattern in the same file. No new IPC calls, no backend/schema changes, no new store state.

**Live UI verification:** Launched the Electron dev build headlessly (`xvfb-run` + `electron-vite dev --no-sandbox`), created a test athlete with an upcoming show via the existing `window.api` IPC calls (landing in the "Peak / Conditioning" guidance week, which has 3 milestones), and drove the feature end-to-end with `xdotool`, screenshotting each step:
1. Confirmed the Dashboard card renders all 3 milestones as unchecked `□` items
2. Clicked two of them → both flipped to green `☑` with strikethrough, "2/3 done" appeared, and the click did **not** navigate to `/education` (propagation correctly stopped)
3. Reloaded the app → both checked items persisted exactly as left (localStorage round-trip confirmed)
4. Navigated to Education's Prep Timeline → confirmed the *same two* items showed as checked there too (shared storage key working)
5. Toggled the third item from the **Education** page → navigated back to Dashboard → confirmed it now shows **"3/3 done"** with all three checked (bidirectional sync confirmed)

---

## Phase 3 — UX Clarity Fixes

### Fix 1: Close the remaining "70kg" → "70 kg" spacing gaps in Training/WorkoutSession
**Files:** `src/pages/Training/index.tsx:616, 778`, `src/pages/Training/WorkoutSession.tsx:580`

**Before:** The 2026-06-07 session fixed the `Last: 70kg × 8` → `Last: 70 kg × 8` spacing issue — but only on that one line. Three sibling spots rendering the *exact same kind of value* (a weight + unit + reps) were missed: the "New Personal Records!" celebration card after finishing a workout (`102.5kg × 5`), the Training page's inline PR badge next to each exercise (`102.5kg × 5`), and the collapsed-session "top sets" history line (`70kg×8`, with no spaces at all around the `×` either). A user would see `70 kg × 8` on one screen and `102.5kg × 5` moments later in a celebratory popup for the *same metric*.

**After:** All three now render `102.5 kg × 5` / `70 kg × 8`, consistent with the already-fixed convention.

### Fix 2: Standardize "Sleep Quality" rating-scale anchor labels across the three check-in forms
**File:** `src/pages/CheckIn/index.tsx:268, 644, 879`

**Before:** The same 1–5 "Sleep Quality" rating used different anchor-word pairs depending on which form you were filling out — `"Poor" → "Great"` on the missed-checkin form (`MissedSlotPanel`, line 268) and the "edit last check-in" form (line 644), but `"Very poor" → "Excellent"` on the main weekly check-in form (line 879). A user submitting a 3/5 rating in one place and a 3/5 in another had no consistent frame of reference for what the number meant — and "Excellent" sleep quality also visually clashed with "Excellent" being the high-end label for an entirely different metric (Energy Level) right above it.

**After:** All three forms now use the same `"Poor" → "Great"` pair, matching the majority convention (2 of 3 forms already used it) and giving the rating one consistent meaning everywhere a user enters it.

---

## Push Status

**SUCCESS** — all commits pushed to `origin master`:
1. `[QA] 2026-06-08: Fix food preference substitution gaps and meal_count consistency`
2. `[FEATURE] 2026-06-08: Interactive, persisted Peak Week / prep milestone checklist`
3. `[UX] 2026-06-08: fix recurring weight-unit spacing gaps; standardize Sleep Quality scale labels`

---

_Earlier 2026-06-07 session report (preserved for history) follows below._

---

# PrepCoach QA Report — 2026-06-07

## Phase 1 — QA Audit

### TypeScript
`npx tsc --noEmit` passed with **0 errors** before and after all changes.

### Unit Tests
`npm test` — **84 tests pass, 0 failures** across the full vitest suite.

### Nutrition Engine Audit (`nutritionEngine.ts` + `foodDatabase.ts`)
Re-audited `generateNutritionPlan`, `buildMeals`, `getMealTemplates`, `getFood`, `getCultureFood`, and the food database tables.

- Macro math verified correct: `protein_g = round(weight_kg × 2.3)`, `fat_g = round(weight_kg × 0.9)`, `carbs_g = round((calories - protein×4 - fat×9) / 4)` (`electron/services/nutritionEngine.ts:515-520`)
- All 29 `getFood()` template ids cross-reference cleanly into `FOOD_CATEGORY` / `FOOD_DISPLAY` — no dangling references
- `cultureFoods` table covers all 4 cultures (indian, mexican, mediterranean, asian) × all 8 keys (protein_main, protein_alt, carb_main, carb_alt, veg, dairy, fat, plant_protein) — complete
- No bugs found in the engine itself this session (both real bugs were in adjacent service/script code — see below)

### Spot Checks
Ran `generateNutritionPlan` for both required scenarios via a temporary script:

**Scenario A — 80 kg male omnivore, 6 meals, cut**
- Calories ≈ moderate cut deficit; protein ≈ 184 g (2.3 g/kg); fat ≈ 72 g (0.9 g/kg); carbs derived residual
- 6 meal objects generated, all with non-NaN macros and valid portion strings ✓

**Scenario B — 70 kg female vegan, 4 meals + 1 snack, maintain**
- Calories at maintenance; protein ≈ 161 g; fat ≈ 63 g
- 4 main meals + 1 snack (200 kcal); no animal products in any selection; no NaN/undefined/zero-calorie meals ✓

### 7 User Flow Traces

| Flow | Status |
|---|---|
| Onboarding → user created → plans generated | ✓ (also verified live via headless UI run, see Phase 2 verification) |
| Diet portions render with valid macros and strings | ✓ |
| Meal completion logged/unlogged | ✓ |
| Check-in submitted → adjustments applied → macros scaled | ✓ (live-verified — see Bug 2 below) |
| Settings → diet plan regeneration | ✓ |
| Workout start → set log → complete | ✓ |
| Progress chart renders from check-in history | ✓ |

### Bugs Fixed

**Bug 1 — False-failing assertion in `scripts/qa-runner.ts`**
`scripts/qa-runner.ts:264` (Section 5, training plan structural check)

The adversarial QA runner asserted `Array.isArray(e.sets)`, but `Exercise.sets` is defined as a plain `number` in `trainingEngine.ts` (and rendered as a number throughout the UI, e.g. `Training/index.tsx:638`). The assertion was therefore always false, producing a permanently-failing check that masked real signal. Fixed to `typeof e.sets === 'number' && e.sets > 0`. Re-running the runner went from 19/20 → 20/20 passing.

**Bug 2 — Macro recalculation used stale onboarding weight instead of the athlete's current weigh-in**
`electron/ipc/checkinHandlers.ts:110` (`checkin:submit` handler)

After a weekly check-in adjusts calorie targets, the handler recomputes `protein_g`/`fat_g` from body weight — but it read `user.weight_kg`, which is set only once at onboarding and is **never** updated anywhere in the codebase (verified via full-repo grep — no `UPDATE users ... weight_kg` exists). This means every athlete's protein/fat targets stayed pinned to their onboarding weight for the entire 12-week cut, never adapting as they actually lost weight — a real, meaningful bug for a prep-tracking app whose entire premise is week-to-week adaptation. Fixed to prefer the just-submitted weigh-in: `(data.weight_kg as number) ?? (user.weight_kg as number)`. Did **not** change `users.weight_kg` globally, since it's intentionally relied on elsewhere as the athlete's "starting weight" baseline (e.g. `Progress` page's weight chart).

### Phase 1 Result
**2 bugs fixed.** TypeScript clean, all tests pass, all flows verified. Since 2 < 3, Phase 2 runs per specification.

---

## Phase 2 — Feature (Prep Athlete)

**Feature: Next check-in status on the Dashboard**

File changed: `src/pages/Dashboard/index.tsx`

A prep athlete checks the Dashboard daily but previously had to navigate to the dedicated `/checkin` page to learn whether this week's weigh-in is open yet, or how long until it unlocks (that locked-countdown logic existed only on the CheckIn page). This surfaces that status directly inside the existing "Check-In Feedback" card:

- **Locked:** a subtle gray line — `Next check-in opens in 4 days · Mon, Jun 8` (or "opens tomorrow" when ≤ 1 day away)
- **Open:** a clickable green banner — `● Check-in is open — log this week's weigh-in →` linking straight to `/checkin`
- **No check-ins yet:** indicator is hidden entirely so it doesn't clutter the empty state

**Implementation:** Uses the already-exposed `window.api.getNextCheckinDate(userId)` (maps to the existing `checkin:nextAllowed` IPC handler, confirmed present in `electron/preload.ts:47` before writing any code). No new IPC calls, no backend changes, no new store state — just one `useState` + one `useEffect` that re-fetches whenever `latestCheckin` changes (so the status updates immediately after submitting a check-in).

**Live UI verification:** Launched the Electron dev build headlessly (`xvfb-run` + `electron-vite dev --no-sandbox`) and drove it end-to-end with `xdotool`, screenshotting each step:
1. Completed onboarding for a fresh test user → landed on Dashboard; confirmed the indicator is correctly **hidden** when `latestCheckin` is null ("No check-ins yet" empty state, no extra banner)
2. Submitted a real check-in through the UI
3. Returned to Dashboard → confirmed the card now renders **`Next check-in opens tomorrow · Mon, Jun 8`** exactly as designed, computed live from the real `getNextCheckinDate` IPC round-trip

(The "open" green-banner branch is the structural mirror of the verified "locked" branch — same state, same conditional render — and was inspected directly in the rendered DOM tree of the working build.)

---

## Phase 3 — UX Clarity Fixes

### Fix 1: Standardize "sets × reps @ RIR n" formatting across pages
**Files:** `src/pages/Dashboard/index.tsx:414`, `src/pages/Training/index.tsx:638`

**Before:** The exact same exercise prescription rendered with three different conventions depending on which screen you were on:
- Dashboard: `4 × 8 @RIR2`
- Training plan list: `4×8 RIR2`
- WorkoutSession / SessionEditor: `4 sets × 8 @ RIR 2`

**After:** Dashboard and Training plan list now match WorkoutSession/SessionEditor's spacing: `4 × 8 @ RIR 2`. Same class of issue as the previously-fixed "70kg" → "70 kg" inconsistency — a user bouncing between Dashboard and Training would see the identical data point punctuated three different ways and might wonder if they were different metrics.

### Fix 2: Distinguish the destructive Diet "Regenerate" glyph from the safe "Update Macros" glyph
**File:** `src/pages/Diet/index.tsx:294, 310, 313`

**Before:** "Update Macros" (safe — only adjusts calorie targets) used `⟳` and "Regenerate" (destructive — confirm-gated, wipes **all** meals and manual swaps) used `↺`. These two circular-arrow glyphs (U+27F3 vs U+21BA) are nearly indistinguishable at 12px, including in the legend line directly below the buttons that's supposed to explain the difference between them.

**After:** Replaced the destructive glyph with `⚠`, which is visually distinct from `⟳` at a glance and semantically signals "this one is risky" — reducing the chance of a quick-scanning user clicking the wrong button.

---

## Push Status

**SUCCESS** — all commits pushed to `origin master` (`ea7afef..95d1dcf`):
1. `[QA] 2026-06-07: Fix stale-weight macro recalc on check-in and bad qa-runner type assertion`
2. `[FEATURE] 2026-06-07: Show next check-in status on Dashboard`
3. `[UX] 2026-06-07: standardize RIR formatting; distinguish destructive Diet action glyph`

---

_Earlier 2026-06-06 session report (preserved for history) follows below._

---

# PrepCoach QA Report — 2026-06-06 (previous session)

## Phase 1 — QA Audit

### TypeScript
`npx tsc --noEmit` passed with **0 errors** before and after all changes.

### Unit Tests
`npm test` — **84 tests pass, 0 failures** across the full vitest suite.

### Bugs Fixed (2)
- **Bug 1** — Vegan lunch tempeh mislabeled as Tofu (`electron/services/nutritionEngine.ts:368`) — default string `'Tofu (200g)'` → `'Tempeh (150g)'`
- **Bug 2** — Misleading comment in `planStore.submitCheckin` (`src/store/planStore.ts:99`) — corrected to describe actual reload-on-server-update behavior

### Phase 2 — Feature
**Next Meal countdown card on Dashboard** (`src/pages/Dashboard/index.tsx`) — surfaces the next upcoming un-eaten meal with a live countdown and a "Mark Eaten" action wired into the existing `handleToggleMeal` flow.

### Phase 3 — UX Fixes
1. "Skip" → "Skip Exercise" button rename in `WorkoutSession.tsx` (disambiguates from per-set "remove" button)
2. `Last: 70kg × 8` → `Last: 70 kg × 8` spacing fix in `WorkoutSession.tsx`

### Push Status
All 3 commits pushed to `origin master`.

_That session also noted earlier 2026-06-06 deliveries: per-meal protein on Dashboard, goal-aware Prep Pace color, and workout completion state._
