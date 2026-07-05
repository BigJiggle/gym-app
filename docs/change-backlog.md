# Change Backlog

This file is the work queue for the scheduled "Gym App Change Agent" routine.
Each run: fix any regressions first, then implement the **topmost unchecked
item**, verify it, check it off, commit, and push. One item per run.

**Format:** `- [ ]` = todo, `- [x]` = done. When you finish an item, change it
to `- [x]`, append `— done YYYY-MM-DD: <one-line summary>`, and commit the
updated backlog together with the change.

**Adding work:** the owner appends new `- [ ]` items to the bottom over time.
Never delete items; only check them off.

---

## Queue

- [x] **Remove the Energy Balance card.** Delete the Dashboard "Today's Energy
  Balance" card entirely (the block in `src/pages/Dashboard/index.tsx`), plus any
  now-dead helpers/variables it used (BMR calc, `CARDIO_MET`, training/cardio burn
  math) that nothing else references. Acceptance: no energy-balance card renders;
  `tsc` clean with no unused-variable errors. — done 2026-07-02: removed the
  "Today's Energy Balance" IIFE card from Dashboard (BMR/CARDIO_MET/training+cardio
  burn math were all local to it); cardioLog/workoutHistory/mealCompletions still
  used elsewhere; tsc/tests/build all clean.

- [x] **Consistent color scheme for sleep & energy.** Apply the same
  good/medium/bad color-coding used for "stress level" to "sleep quality" and
  "energy level" wherever they're shown (Check-in inputs and any Progress/summary
  displays). Find how stress level maps value→color and reuse that logic for sleep
  and energy so all three read consistently. Acceptance: sleep and energy use the
  same color scale concept as stress. — done 2026-07-03: extracted the stress
  green/yellow/red scale into shared `src/utils/ratingColor.ts` (higher/lower
  direction); Check-in RatingBar now colors Energy/Sleep as higher-is-better
  (was neutral brand) and Progress wellness tiles reuse it (fixes Sleep's
  inconsistent blue "good" → green); added ratingColor unit tests; tsc/tests/build clean.

- [x] **Meals 1–20 and snacks 0–20 in onboarding + settings.** Allow meals per day
  from 1 to 20 (currently the engine clamps to a minimum of 3) and snacks per day
  from 0 to 20. Update the Onboarding inputs, the Settings inputs, validation, and
  the `nutritionEngine` clamps (change the meal minimum from 3 to 1). Acceptance:
  can select any meals 1–20 and snacks 0–20; plans generate correctly at the
  extremes (1 meal, 20 meals, 0 snacks, 20 snacks) with no NaN/absurd portions.
  — done 2026-07-03: engine clamp changed 3–6→1–20 (meals) and snacks resolved+clamped
  0–20 with NaN guard; `getMealTemplates` now cycles the 6 main / 3 snack templates to
  hit any count; IPC `clampMealCount`/`clampSnackCount` widened to 1–20/0–20; new
  reusable `<Stepper>` UI replaces the fixed 3–6 / 0–3 button rows in Onboarding Step4,
  Settings, and Diet prefs; claudeService prompt bounds updated; added audit-logic tests
  for the 1/20/0/20 extremes and above-max clamping. tsc/tests(139)/build all clean.

- [x] **Reset data keeps weigh-ins and water intake.** When the user resets their
  data, clear ALL data EXCEPT: weigh-in history (daily weight log + check-in weight
  history) and water intake logs. Everything else is wiped. Acceptance: after a
  reset, weigh-in history and water intake persist; all other data is gone. Find
  the reset flow (Settings) and the relevant DB tables / localStorage keys.
  — done 2026-07-04: reset previously wiped the DB (cascade, incl. check-in weigh-ins)
  but left ALL localStorage logs untouched. New `src/utils/resetData.ts` (`resetLocalData`)
  now wipes every localStorage key except `daily_weight_log`, `water_ml_*`, and
  `water_target_ml`; `user:resetAll` snapshots weekly_checkins (date+weight) before the
  cascade delete and the store folds them into `daily_weight_log` (existing daily entry
  wins on a same-date clash, invalid entries dropped). App settings (theme/units/Claude
  key) live in the DB `settings` table so they survive untouched. Added resetData unit
  tests (11). tsc/tests(150)/build all clean.

- [x] **Competition-only widgets, gated on show selection.** Turn posing practice,
  supplements, sleep, and daily condition into widgets (dashboard widget system in
  `src/components/widgets`). When NO competition/show is selected, these
  competition-only widgets are removed/hidden and not offered in the Add Widgets
  catalog; when a show exists, they are available. Acceptance: no show → none of
  these four appear; with a show → all available as widgets. — done 2026-07-04:
  extracted the four inline Dashboard sections into `PosingWidget`/`SupplementWidget`/
  `SleepWidget`/`ConditionWidget`, registered them with a `competitionOnly` flag, and
  gated them behind `useHasShow()` (shows.length>0 || user.show_date) in both
  `WidgetZone` (filtered by real stored index so reorder stays correct) and the
  Add Widgets catalog. Persisted logs moved to a shared reactive localStorage store
  (`localStore.ts`/`competitionLogs.ts`) so the Dashboard Weekly Prep Scorecard still
  reads posing/sleep live. Added 5 unit tests (standalone render, logging persistence,
  WidgetZone hide/show gating, catalog gating). tsc/tests(155)/build all clean.

- [x] **Simplify Training & Nutrition tabs into widgets.** The Training history tab
  and the Nutrition/Diet page show too much at once. Break their content into
  add/removable widgets using the same widget system as the dashboard
  (`useWidgets`/`WidgetZone`/registry pattern, with a per-tab persisted enabled
  list). Acceptance: both tabs render as widgets the user can add/remove; default
  layout is not overwhelming. — done 2026-07-05: extracted the dashboard widget
  enabled-list logic into a generic `createWidgetStore(key, allIds, defaultIds?)`
  factory + reusable `TabWidgetControls` (Customize add/remove catalog). Training
  "My Plan" tab (`training_plan_widgets`, 5 sections) and Nutrition "Meal Plan" tab
  (`nutrition_plan_widgets`, 7 sections) now gate each summary card on its enabled
  id; core actions (session cards / macro stats + meals list) stay always-on. Each
  tab ships a trimmed default set so the default layout isn't a wall of cards, with
  the rest addable. Distinct localStorage keys per tab. Added 9 unit tests
  (store defaults/dedupe/independence + controls toggle). tsc/tests(164)/build clean.
  Drag-reorder deferred to the next backlog item (its dependency).

- [ ] **Rearrange Training & Nutrition widgets.** Enable drag-reorder (Rearrange
  toggle + long-press, dashed drop-target cues) for the widgets on the Training and
  Nutrition tabs, reusing the dashboard `WidgetZone` mechanics. Acceptance: user can
  reorder widgets on both tabs and the order persists across reloads. (Depends on
  the previous item.)

- [ ] **Cook time affects meal quality.** Make the onboarding "cook time" input
  actually influence meal generation: more available time → more elaborate/better
  meals (more ingredients/variety); less time → simpler, quicker meals. Thread
  cook time through `nutritionEngine` meal building. Acceptance: higher cook time
  produces richer meals, low cook time produces simple ones, for the same macros.

- [ ] **Meal prep style in food selection + nutrition.** Ensure the selected
  meal-prep style is taken into account both when choosing foods and in the
  nutrition calculations. Thread prep style through the engine. Acceptance: changing
  prep style visibly changes food selection.

- [ ] **Refeed day adjusts daily meals.** If the user enables a refeed day, change
  that day's meals based on calories and user inputs (refeed protocol: higher
  carbs/calories that day). Acceptance: on the chosen refeed day, meals reflect the
  adjusted calories/macros; other days unchanged.

- [ ] **Adaptive nutrition from check-ins + weight.** Nutrition (calorie/macro
  targets) should adapt over time based on check-in data and the weight trend, not
  just the initial plan. Acceptance: submitting check-ins that show a stalled or
  fast-moving weight trend adjusts the diet plan accordingly.

- [ ] **AI-tailored onboarding via Claude API key.** Make entering the Claude API
  key the FIRST onboarding step, then use it to produce a more tailored onboarding
  (personalized plan generation / recommendations) via the app's existing Claude
  integration. If no key is provided, fall back gracefully to the current
  deterministic onboarding. Acceptance: user can enter the key first; onboarding
  output is tailored when a key is present; app still works with no key.
