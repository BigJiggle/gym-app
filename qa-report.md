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
