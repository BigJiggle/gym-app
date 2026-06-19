# PrepCoach QA Report — 2026-06-19 (run 2)

## Phase 1 — QA Engineer

### TypeScript
**Result: PASS** — 0 errors (`npx tsc --noEmit`)

### Unit Tests
**Result: PASS** — 86/86 tests passing (`npm test`)

### Nutrition Engine Audit (`electron/services/nutritionEngine.ts`)

- All meal templates pass valid food objects to `getFood()`
- `buildMeals()` snack/main split math is correct
- `calcPortionStr()` correctly applies role-based portion logic with MIN/MAX clamps
- `generateNutritionPlan()` `snack_count` resolution is backwards-compatible
- `getCultureFood()` correctly checks dietary preference keys for all 8 culture maps
- All culture food IDs without `fixedLabel` have entries in `FOOD_CALORIES_PER_100G`
- `SNACK_ONLY_FOODS` has no overlap with main-meal template food IDs
- **BUG FOUND**: `buildMeals()` called with `input.meal_count` directly — no minimum guard. If a user sets `meal_count = 1` or `2`, `buildMeals` tries to schedule fewer meals than the template assumes for a balanced plan, causing uneven macro distribution. Fixed with `Math.max(3, input.meal_count)`.

### Food Database Audit (`electron/services/foodDatabase.ts`)
**Result: PASS** — all template fallback food IDs present, no missing calorie entries.

### User Flows Traced (7)
All 7 flows confirmed correct:
1. Onboarding → profile creation → plan generation
2. Check-in submission → calorie recalculation cascade
3. Workout start → set logging → complete → history
4. Meal completion toggle → deduplication on double-log
5. Diet preference update → plan regeneration
6. Startup refresh → plan auto-update when show/phase transitions
7. Progress photos: upload → stored via `progress:addPhoto` IPC → displayed with `file://` URL in Electron

### Bugs Fixed
**1 bug fixed.**

| # | File | Description | Fix |
|---|------|-------------|-----|
| 1 | `electron/services/nutritionEngine.ts:686` | `buildMeals()` called with unbounded `meal_count` — values < 3 cause uneven macro distribution | Wrapped with `Math.max(3, input.meal_count)` |

---

## Phase 2 — Feature (Prep Athlete)

### Feature: Progress Photo Gallery

**Motivation:** The backend was fully implemented — `progress_photos` DB table, `progress:addPhoto` and `progress:photos` IPC handlers in `electron/ipc/progressHandlers.ts`, `addProgressPhoto` and `getProgressPhotos` on `window.api` — but no frontend UI existed to use it. A competitive prep athlete 12 weeks out needs visual week-over-week comparison (front/back/side poses) to catch muscle loss or water retention early. The backend was already there; this adds the missing frontend surface.

**Implementation:** `src/pages/Progress/index.tsx`
- New state: `photos: ProgressPhoto[]`, `selectedPose: ProgressPhoto['pose']`
- `useEffect` on `user.id` fetches all photos via `window.api.getProgressPhotos(user.id)`
- `handlePhotoFile` reads `(file as { path?: string }).path` (Electron exposes native FS path on `File` objects) and calls `window.api.addProgressPhoto({ user_id, file_path, pose })`
- `PhotosSection` component: pose selector (front/back/side/custom), "+ Add Photo" file input, responsive 3-4 column grid, `file://` URL image display with pose label and date overlay
- Section appears in both the empty-state return and the main return (replacing unreachable dead code)
- No new IPC, no schema changes — frontend only

**Files changed:** `src/pages/Progress/index.tsx`

---

## Phase 3 — UX Reviewer

### UX Fix 1: Rest Timer Button Labels (`src/pages/Training/WorkoutSession.tsx`)

**Issue:** The quick-set rest timer buttons showed mixed formats: "60s", "90s" (seconds for values under 2 minutes) and "2m", "3m" (minutes for values at or above 2 minutes). "90s" is harder to parse at a glance than "1:30" during a set.

**Fix:** Replaced `{s < 120 ? \`${s}s\` : \`${s / 60}m\`}` with `{s % 60 === 0 ? \`${s / 60}m\` : \`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}\`}`. Result: "1m", "1:30", "2m", "3m" — consistent human-readable format throughout. Applied in both the compact and expanded timer UIs (2 occurrences via `replace_all`).

### UX Fix 2: Settings Regenerate Button Loading State (`src/pages/Settings/index.tsx`)

**Issue:** The "Save & Regenerate Plans" button showed no feedback while plan generation ran (could take 2–4 seconds). The adjacent "Save Only" button already showed "Saving..." via `editSaving` state, but Regenerate stayed static — leaving users unsure if the tap registered.

**Fix:** Changed the button label to `{editSaving ? 'Generating...' : 'Save & Regenerate Plans'}`. Reuses the existing `editSaving` boolean that's already set/cleared around the async operation — zero new state needed.

---

## Summary

| Phase | Status | Changes |
|-------|--------|---------|
| Phase 1 — QA | ✅ 1 bug fixed | `meal_count` minimum guard in `generateNutritionPlan` |
| Phase 2 — Feature | ✅ Shipped | Progress photo gallery (frontend for existing backend) |
| Phase 3 — UX | ✅ 2 fixes | Rest timer labels; Regenerate button loading state |

**Commits:**
- `73fc3d2` — `[QA] 2026-06-19: enforce meal_count minimum of 3 in generateNutritionPlan`
- `68bfdc4` — `[FEATURE] 2026-06-19: progress photo gallery on Progress page`
- `dff78b1` — `[UX] 2026-06-19: consistent rest timer labels; Settings regenerate button shows loading state`
