# QA Report — 2026-06-13

## Phase 1: QA Engineer

**TypeScript**: `npx tsc --noEmit` → **0 errors**

**Unit tests**: `npx vitest run` → **86/86 passing**

**Nutrition engine audit** (`electron/services/nutritionEngine.ts`):
- All 9 meal templates verified: roles, food IDs, ROLE_FIXED_G usage, calcPortionStr calls all correct
- `getCultureFood` correctly maps all 8 cultures × 8 keys; fallback chain intact
- `buildMeals` snack calorie logic correct: snack_count resolves `input.snack_count ?? (input.include_snacks ? 1 : 0)`; snack cal fixed at 200; main cal = `(totalCal − snacks×200) / mainCount`
- `generateNutritionPlan` macro math verified: protein = weight_kg × 2.3g, fat = weight_kg × 0.9g, carbs from remainder
- `getFood` preference substitution and SNACK_ONLY_FOODS guard all correct

**Food database audit** (`electron/services/foodDatabase.ts`):
- All template food IDs present in `FOOD_CALORIES_PER_100G` (verified against all 9 templates)
- All culture food IDs (8 cultures × 8 keys = 64 entries) present and correct
- `FOOD_SUBSTITUTES` keys all present in calorie table; no orphan IDs
- `SNACK_ONLY_FOODS` set correctly prevents snack foods from appearing in main meal slots

**7 user flow traces** — all pass:
1. New user onboarding → generate training + diet plan: correct IPC chain
2. Submit weekly check-in → calorie adjustment cascade → dietPlan reload: correct
3. Start workout → log sets → complete workout → history updated: correct
4. Meal completion toggles → Today's Macros progress bars update: correct
5. Settings save with new meal count → regenerates both plans: correct
6. Diet food preference substitution (e.g. "chicken" preference in omnivore plan): correct
7. Check-in locked state → countdown display → edit last check-in: correct

**Bugs found and fixed**: 0 (Phase 2 condition: <3 bugs fixed → Phase 2 runs)

---

## Phase 2: Prep Athlete Feature (session 5)

**Feature implemented**: Body Composition Tracker on Progress page

**File changed**: `src/pages/Progress/index.tsx`

**What it does**:
- Estimates body fat % from each check-in's waist measurement + weight using the YMCA formula
- Shows three stats: Est. Body Fat %, Lean Mass (kg/lbs), Fat Mass (kg/lbs)
- Shows BF% trend as a line chart when ≥2 check-ins have waist data
- Tracks BF% and Lean Mass change since first check-in (delta label on each stat)
- Fully hidden when no waist measurement data is present (graceful empty state)
- Respects imperial/metric unit setting for mass display

**Why this feature**: A competitive prep athlete's primary concern is preserving lean mass while losing fat. The app collected waist + weight at every check-in but never surfaced a BF% estimate. This is now the first thing they see after opening Progress, giving them the "am I losing fat or muscle?" answer each week.

**Formula used**: YMCA method — `((4.15 × waist_in − 0.082 × weight_lbs − 98.42) / weight_lbs) × 100` for males; `−76.76` constant for females. Clamped to [3%, 60%] range. Noted as directional/estimated in the UI.

**No new IPC calls**: uses `checkinHistory` (already loaded), `user.sex`/`settings.units` from store.

**TypeScript**: 0 errors after change.

**Commit**: `a663943` — `[FEATURE] 2026-06-13: Body composition tracker on Progress page`

---

## Phase 3: UX Simplicity Reviewer (session 5)

**Fix 1: WorkoutSession — Rest timer pre-set visible before first set**

**File**: `src/pages/Training/WorkoutSession.tsx`

Previously the 60s/90s/2m/3m rest preset buttons only appeared while the timer was counting down. An athlete going into heavy squats or deadlifts had no way to set their rest to 3 minutes upfront — they'd log set 1, see the 90s timer fire, then scramble to change it. Added a compact "Rest: [60s] [90s] [2m] [3m]" selector row to the bottom bar that is always visible when no timer is running. Matches the visual style of the existing in-timer presets exactly.

**Fix 2: Dashboard — Cardio one-tap quick-log**

**File**: `src/pages/Dashboard/index.tsx`

Previously logging cardio required: (1) tap "+ Log today's cardio" to open the form, (2) optionally tap a preset to fill in the fields, (3) tap Save — three interactions. For a tired athlete who just finished 45 minutes of LISS, this is friction. Added `quickLogCardio()` helper. When no cardio is logged for today, the collapsed cardio card now shows LISS 30m / LISS 45m / HIIT 20m / HIIT 25m buttons directly — one tap saves and closes. A "+ Custom duration" link below still opens the full form for other durations. The same presets inside the open form also now save immediately on tap.

**TypeScript**: 0 errors after changes.

**Commit**: `c631c7d` — `[UX] 2026-06-13: Rest timer pre-set + cardio one-tap quick-log`

---

## Phase 2: Prep Athlete Feature (session 5 continuation)

**Feature implemented**: Per-day calorie & protein totals in Weekly Meal View

**File changed**: `src/pages/Diet/WeeklyMealView.tsx`

**What it does**:
- Each day button in the Diet › Weekly tab now shows two new micro-stat lines when meals have been logged: calories consumed (e.g. "1.9k") in brand color, and protein (e.g. "145g P") in purple
- Uses a new `dayMacros(date)` helper that joins `mealCompletions` for the given date against the `meals` array to sum calories and protein from logged meals only
- Calories ≥1000 are formatted as `X.Xk` for the narrow 7-column grid; values <1000 show as integers
- Placeholder `text-transparent` spans preserve button height uniformity on days with no logged meals
- No new API calls — uses `mealCompletions` already loaded into the Zustand store

**Why this feature**: The Weekly View already showed per-day meal counts (e.g. "3/6") but gave no calorie or protein feedback. A prep athlete 12 weeks out needs to see at a glance which days they hit their macro targets — the difference between "I logged 3 meals" and "I hit 1,850 kcal and 145g P" is significant for weekly review and course correction.

**TypeScript**: 0 errors after change.

**Commit**: `0eca6e0` — `[FEATURE] 2026-06-13: Per-day calorie & protein totals in Weekly Meal View`

---

## Phase 3: UX Simplicity Reviewer (session 5 continuation)

**Fix 1: Training — AI button loading state clarity**

**File**: `src/pages/Training/index.tsx`

The AI refine button showed `'...'` while waiting for a response. A user who tapped "Ask AI" had no textual feedback that a network call was in-flight — just three dots that could be confused with a placeholder. Changed to `'Asking...'`, which communicates active progress in plain English.

**Fix 2: Diet — Regenerate button loading state clarity**

**File**: `src/pages/Diet/index.tsx`

The "Regenerate Meals" button showed `'⚠ Regenerating...'` during the API call. The ⚠ glyph is a static warning symbol that correctly warns of destructive action on the idle label; carrying it into the loading state made it look like an error was occurring. Stripped the ⚠ in the loading state so it reads `'Regenerating...'`, reserving the warning icon for the idle button where it conveys appropriate caution.

**TypeScript**: 0 errors after changes.

**Commit**: `f31f4d1` — `[UX] 2026-06-13: Clearer loading states in Training AI button and Diet regenerate button`

---

## Summary

| Phase | Session | Result |
|-------|---------|--------|
| TypeScript | both | 0 errors |
| Unit tests | 5 | 86/86 pass |
| Bugs fixed (P1) | both | 0 |
| Feature added (P2) | 5 | Body composition tracker (BF%, Lean Mass, Fat Mass) on Progress page |
| Feature added (P2) | 5-cont | Per-day calorie & protein totals in Diet Weekly View |
| UX fixes (P3) | 5 | 2: rest timer pre-set selector; cardio one-tap quick-log |
| UX fixes (P3) | 5-cont | 2: AI button loading label; Diet regenerate loading label |
| New commits | both | 4 total this report |
| Push | pending | see below |
