# Change Agent Report

## Run 2026-07-06 (Cook time affects meal quality)

### STEP 1 — Regression guard
No regressions. On a clean checkout `npx tsc --noEmit`, `npm test` (169 tests),
and `npx electron-vite build` all passed before any changes.

Note: `npm ci`'s postinstall for the `electron` binary is 403'd through the agent
proxy, so I ran `ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci` (safe — tsc, vitest and
`electron-vite build` don't need the Electron runtime binary). Environment quirk,
not a repo issue.

### Backlog item implemented
**Cook time affects meal quality** (topmost unchecked). The onboarding "cook time"
preference (`cooking_time_pref`: `quick` | `medium` | `chef`) was threaded all the
way to `getMealTemplates` but ignored there (`void cookingPref`). It now shapes the
meal food list:

- **quick** (under 15 min) → each main meal is trimmed to its 2 core components
  (protein + carb) for fast, minimal-prep plates.
- **medium** (15–30 min) → the hand-authored template, unchanged.
- **chef** (30+ min) → each main meal gains two rotating garnishes/sides for
  variety (Fresh Herbs & Lemon, Mixed Side Salad, Roasted Seasonal Veg, Garlic &
  Olive Oil Drizzle, Spice Rub & Marinade, Pickled Vegetables).

Garnishes are allergen-free, vegan, fixed-label items, so they never collide with a
user's exclusions/restrictions and never enter portion/calorie math. Snacks stay
simple in every mode. Crucially, meal calories/macros are derived from the calorie
budget (not the food list), so **macros are identical across quick/medium/chef** —
only richness/variety changes, satisfying the "for the same macros" acceptance.

Also removed the now-dead `cookingPref` parameter from `getMealTemplates`.

### Files changed
- `electron/services/nutritionEngine.ts` — added `CHEF_GARNISHES` +
  `applyCookingStyle`; applied it in `buildMeals` (meal-index + snack-aware);
  removed the dead `cookingPref` param from `getMealTemplates` and its call.
- `tests/unit/nutritionEngine.test.ts` — new "cook time affects meal quality"
  describe block (5 tests): macro invariance across modes, chef richer than quick,
  quick ≤2 items per main meal, chef garnishes main meals but not snacks, and
  absent cook time behaves like medium.
- `docs/change-backlog.md` — item checked off.

### Verification
- `npx tsc --noEmit` — PASS (0 errors)
- `npm test` — PASS (174 tests, +5 new)
- `npx electron-vite build` — PASS

### Deferred
Nothing for this item. Remaining backlog items (meal-prep style threading,
refeed-day meal adjustment, adaptive nutrition, AI-tailored onboarding) are
untouched and left for future runs, per the one-item-per-run rule.
