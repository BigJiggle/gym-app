# PrepCoach QA Report — 2026-06-30 (run 14)

## Phase 1 — QA Engineer

### TypeScript Check
`npx tsc --noEmit` — **CLEAN** (0 errors)

### Unit Tests
**109/109 tests passed** (105 pre-existing + 4 new regression tests added this run) across nutrition engine, food database, checkin engine, training engine, and supporting utilities.

### Bugs Fixed: 7

### Nutrition Engine Audit
| Check | Result |
|---|---|
| `getPhaseAwareDeficit` phase boundaries (≤3/≤8/≤16/>16 weeks) | ✅ Correct |
| `MEAL_CAL_FRACTIONS` sum (0.45 + 0.35 + 0.15 = 0.95, 0.05 buffer) | ✅ Intentional |
| `calcPortionStr` role-fixed portions (veg 120g, fruit 100g, powder 30g) | ✅ Correct |
| `safeWeightKg` guard in `generateNutritionPlan` (finite + ≥30) | ✅ Present, now also reused as `clampWeightKg` at other call sites (see Bugs Fixed) |
| `resolvedSnackCount` fallback | ✅ Correct |
| Meal count clamped [3, 6] | ✅ Correct, but **NaN bypassed the clamp** — fixed (see Bugs Fixed #7) |
| Meal templates sorted by time before delivery | ✅ Correct |
| Culture food lookups (`getCultureFood`) — all 8 cultures | ✅ |
| `generateNutritionPlan` off-season vs deficit logic | ✅ Correct |
| Spot check: 80kg male omnivore 6 meals 0 snacks cut, 70kg female vegan 4 meals 1 snack maintain | ✅ No NaN/undefined/absurd portions (see `spot-check.test.ts` output) |

### Food Database Audit
| Check | Result |
|---|---|
| `FOOD_CALORIES_PER_100G` covers all template + culture foods | ✅ |
| `FOOD_SUBSTITUTES` chains are non-circular | ✅ |
| `FOOD_CATEGORY` values are valid ('protein'/'carb'/'fat'/'veg') | ✅ |
| `SNACK_ONLY_FOODS` set vs main-meal logic | ✅ |
| `EXCLUSION_ALIASES` map completeness | ✅ |

### Logic & Domain Sanity Check
| Check | Result |
|---|---|
| Meal calorie sum ≈ daily target (±80kcal) | ✅ |
| Meal times ascending chronological order | ✅ |
| Protein g/kg in 1.8–3.5 safe range | ✅ (fixed 2.3g/kg) |
| Fat g/kg never below 0.5 | ✅ (fixed 0.9g/kg) |
| Peak week (≤1 wk out) calories not at max deficit | ✅ |
| Off-season cut/recomp still applies deficit | ✅ |
| `training_frequency` exact session count match, distinct days | ✅ (freq 2–6; 7 silently clamps to 6) |
| `training_frequency=3` gets a real 3-day split, not PPL truncated | ✅ |
| Peak week reflects deload (sets −1, higher reps/RIR) | ✅ |
| Show today/yesterday → `weeks_out=0` (never negative/undefined) | ✅ |
| Cancelled show + no upcoming → off-season transition | ✅ |
| `shows:setPrimary` rejects a past show date | ✅ |
| Duplicate same-date check-in rejected (not silently overwritten) | ✅ |
| Prep-pace projection uses real `show_date`, not hardcoded | ✅ |
| `weight_kg=0`/negative guarded in `generateNutritionPlan` | ✅ present, but **bypassed in `checkin:submit` and `plan:recalculateMacros`** — fixed (see Bugs Fixed #2, #3) |
| `meal_count<3` clamped in plan generation | ✅ present, but **not clamped when persisted via `user:create`/`user:update`** — fixed (see Bugs Fixed #4) |
| `body_fat_pct` negative/>60 flagged | ❌ was completely unvalidated — fixed (see Bugs Fixed #6) |
| Schema migrations v1–v13 sequential and idempotent | ✅ version-gated via `settings.schema_version`; re-run is impossible by construction |
| `meal_completions` UNIQUE constraint respected by upsert logic | ✅ `INSERT OR REPLACE` keyed on `(user_id, date, meal_index)` |

### User Flow Audit (7 flows)
| Flow | Result |
|---|---|
| Onboarding → plan gen | ✅ `user:create` → `plan:generateTraining`/`plan:generateDiet` → correct per-meal calorie targets |
| Diet page portion scaling | ✅ `calcPortionStr` scales protein/carb/fat to each meal's calorie budget, clamped to role min/max |
| Meal completion persistence | ✅ `INSERT OR REPLACE` on UNIQUE key — no double-counting |
| Check-in → macro recalc → updated diet plan | ❌ was stale for bulk/maintain/on-track-cut goals — fixed (see Bugs Fixed #1) |
| Settings regen | ✅ `handleSaveProfile(true)` regenerates both plans with correctly clamped meal_count |
| Workout session → stats | ✅ start → logSet/saveSetsBatch → complete (`status='completed'`) → history/stats reflect it |
| Progress chart empty-state handling | ✅ 0/1/2+ check-ins all handled without NaN/crash |

### Bugs Fixed
1. **Stale diet plan macros after check-in for bulk/maintain/on-track-cut goals** — `checkin:submit` (`electron/ipc/checkinHandlers.ts`) only recalculated the diet plan's protein/fat/carbs when `adjustments.calories_delta !== 0`. `calculateAdjustments` returns `calories_delta = 0` for bulk and maintain goals (no delta branch exists for them) and for a cut "on track" week — so an athlete's protein target (weight × 2.3) never updated as their bodyweight changed, even though they were checking in weekly. Fixed by recalculating macros on every check-in whenever a diet plan exists, regardless of calorie delta.
2. **`checkin:submit` bypassed the bodyweight safety floor** — computed `protein_g`/`fat_g` directly from `data.weight_kg ?? user.weight_kg`, where `??` only catches `null`/`undefined`, not `0`. A `weight_kg=0` check-in produced `protein_g=0, fat_g=0` silently saved to the diet plan. Fixed using the new shared `clampWeightKg` guard.
3. **`plan:recalculateMacros` had the same bodyweight safety-floor bypass** — same failure mode, separate call site (`electron/ipc/planHandlers.ts`). Fixed with the same `clampWeightKg` guard.
4. **`meal_count` stored unclamped at the database layer** — `generateNutritionPlan` clamps `meal_count` to [3,6] internally, but `user:create`/`user:update` (`electron/ipc/userHandlers.ts`) stored the raw value with no validation. A bad value (0, 1, NaN) would persist and be read back as `user.meal_count ?? 4` elsewhere, reaching plan generation unclamped. Fixed by clamping at the IPC boundary.
5. **`snack_count` stored unclamped at the database layer** — same issue as #4, same fix location.
6. **`body_fat_pct` completely unvalidated** — no DB constraint, no IPC validation, no frontend range check. A value like `-5` or `150` would be stored as-is and corrupt any future body-fat trend chart. Fixed by clamping to a physiologically plausible [3, 60]% range at `user:create`/`user:update`.
7. **NaN `meal_count` could collapse a plan to zero main meals** — `Math.max(3, Math.min(6, NaN))` evaluates to `NaN`, which downstream causes `mainSets[NaN]` to miss and `.slice(0, NaN)` to return an empty array (0 main meals generated). This is now defended against in `generateNutritionPlan` itself (`Number.isFinite` fallback to 4) in addition to the upstream fix in #4 that prevents NaN from being persisted in the first place.

Added regression tests for `clampWeightKg` and the NaN `meal_count` guard to `tests/unit/nutritionEngine.test.ts`.

### Known Issues (not fixed this run — flagged for future attention)
- `training_frequency=7` silently clamps to 6 rather than producing a 7-day plan. This is existing, intentional-looking behavior (no crash, no NaN) and is a product decision rather than a correctness bug, so left as-is.
- Settings' "Edit Profile" panel surfaces ~25 fields across 4 sections at once with no per-section save — dense but each field is clearly labeled; flagged by the Phase 3 UX review as borderline, not actioned (see Phase 3).
- Dashboard stacks 13+ full-width cards in sequence with no collapsing/tabs — a real information-density concern flagged by the Phase 3 UX review, but fixing it properly is a layout/IA redesign, out of scope for a surgical fix.

---

## Phase 2 — Prep Athlete Feature

**Status: SKIPPED** — Phase 1 fixed 7 bugs (≥3 threshold), so per the task spec Phase 2 does not run this session.

---

## Phase 3 — UX Simplicity Review

### Changes Made: 2

**Fix 1 — Raw IPC error messages in Settings (profile save + add show)**
- **Issue:** `handleSaveProfile`'s catch block (`src/pages/Settings/index.tsx:120`) did `setEditError(String(e))`, and the "Add Show" handler (`src/pages/Settings/index.tsx:754`) did `setShowError(String(e))` — both render Electron's raw IPC string directly to the user (e.g. `Error invoking remote method 'updateUser': Error: ...`), the same problem already fixed in CheckIn in a prior run but left unaddressed here.
- **Fix:** Applied the same IPC-prefix-stripping regex already used in Training/CheckIn (`.replace(/Error invoking remote method '[^']+': /, '').trim()`) to both catch blocks.
- File: `src/pages/Settings/index.tsx`

**Fix 2 — Raw IPC error message on Onboarding account creation**
- **Issue:** `handleSubmit`'s catch block (`src/pages/Onboarding/index.tsx:73`) did `` setError(`Failed to create profile: ${String(e)}`) ``, showing the same raw Electron IPC string at the worst possible moment — a brand-new user's very first interaction with the app.
- **Fix:** Applied the same IPC-prefix-stripping treatment before formatting the error message.
- File: `src/pages/Onboarding/index.tsx`

A third-party background review additionally flagged Dashboard information density and a minor Education "Mark Done" label ambiguity, but both were judged to require more than a surgical fix (or were low-confidence) and were left as known issues rather than actioned, per the Phase 3 scope (clarity-only, no redesigns).

**Commit:** `[UX] 2026-06-30: strip raw IPC error prefix in Settings and Onboarding`

---

## Summary

| Phase | Outcome |
|---|---|
| Phase 1 — QA | 7 bugs fixed · 109 tests pass (4 new) · TypeScript clean |
| Phase 2 — Feature | SKIPPED (Phase 1 fixed ≥3 bugs) |
| Phase 3 — UX | 2 error-clarity fixes (Settings, Onboarding) |
| Push | (pending — see commit log) |
