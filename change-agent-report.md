# Change Agent Report

## Run: 2026-07-06

### STEP 1 — Regression guard
- Environment note: `npm ci` initially failed because the `electron@30.5.1`
  postinstall (`node install.js`) tries to download the prebuilt Electron binary
  from GitHub release assets, which the org egress proxy blocks (403). The binary
  is not needed for typecheck / vitest / electron-vite bundling, so installed with
  `ELECTRON_SKIP_BINARY_DOWNLOAD=1` — `npm ci` then completed cleanly.
- Baseline verification on `master` before any change: **all PASS**
  - `npx tsc --noEmit` → clean
  - `npm test` → 174 passed (19 files)
  - `npx electron-vite build` → built
- No regressions found. Proceeded to a backlog item.

### STEP 2/3 — Backlog item implemented
**Meal prep style in food selection + nutrition** (topmost unchecked).

`meal_prep_style` ('daily' | 'batch' | 'mixed') was persisted and declared in
`NutritionInput`, but `buildMeals` never used it — food selection was identical
regardless of the setting. Threaded it through the engine and made it change food
selection, mirroring the existing `applyCookingStyle` pattern:

- **daily** — cook fresh each day: every meal keeps its own varied foods (default / unchanged).
- **batch** — cook in bulk once: all *cooked main* meals converge on ONE shared protein + ONE shared carb (batch-cooked staples portioned across the day).
- **mixed** — part batch: cooked mains share ONE protein but keep their own carbs.

A "cooked main" is a non-snack meal carrying both a protein-role and a carb-role
item (Lunch/Dinner/Mid-Morning). Breakfast (no protein-role item), grab-and-go
meals, and snacks are never consolidated. Macros/calories are untouched —
portions derive from calories and consolidation only swaps a food for another of
the same role.

### Files changed
- `electron/services/nutritionEngine.ts` — new `applyPrepStyle` + `isCookedMain` helpers; `buildMeals` restructured into a 2-pass (cook-style → prep-style) food build; `meal_prep_style` param added to `buildMeals` and `buildMealsPublic`; passed from `generateNutritionPlan`.
- `electron/ipc/planHandlers.ts` — pass `meal_prep_style` into two `generateNutritionPlan` inputs that were omitting it, and into the recalc `buildMealsPublic` call.
- `electron/ipc/showHandlers.ts` — pass `meal_prep_style` into its `generateNutritionPlan` input.
- `tests/unit/nutritionEngine.test.ts` — new describe block, 6 tests.
- `docs/change-backlog.md` — item checked off.

### STEP 4 — Verification (all PASS)
- `npx tsc --noEmit` → clean
- `npm test` → **180 passed** (was 174; +6 new)
- `npx electron-vite build` → built

### Deferred
- Nothing for this item. (The `meal_count` clamp in the recalc `buildMealsPublic`
  call still uses the legacy 3–6 range rather than the widened 1–20; unrelated to
  this item and left untouched.)
