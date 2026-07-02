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

- [ ] **Consistent color scheme for sleep & energy.** Apply the same
  good/medium/bad color-coding used for "stress level" to "sleep quality" and
  "energy level" wherever they're shown (Check-in inputs and any Progress/summary
  displays). Find how stress level maps value→color and reuse that logic for sleep
  and energy so all three read consistently. Acceptance: sleep and energy use the
  same color scale concept as stress.

- [ ] **Meals 1–20 and snacks 0–20 in onboarding + settings.** Allow meals per day
  from 1 to 20 (currently the engine clamps to a minimum of 3) and snacks per day
  from 0 to 20. Update the Onboarding inputs, the Settings inputs, validation, and
  the `nutritionEngine` clamps (change the meal minimum from 3 to 1). Acceptance:
  can select any meals 1–20 and snacks 0–20; plans generate correctly at the
  extremes (1 meal, 20 meals, 0 snacks, 20 snacks) with no NaN/absurd portions.

- [ ] **Reset data keeps weigh-ins and water intake.** When the user resets their
  data, clear ALL data EXCEPT: weigh-in history (daily weight log + check-in weight
  history) and water intake logs. Everything else is wiped. Acceptance: after a
  reset, weigh-in history and water intake persist; all other data is gone. Find
  the reset flow (Settings) and the relevant DB tables / localStorage keys.

- [ ] **Competition-only widgets, gated on show selection.** Turn posing practice,
  supplements, sleep, and daily condition into widgets (dashboard widget system in
  `src/components/widgets`). When NO competition/show is selected, these
  competition-only widgets are removed/hidden and not offered in the Add Widgets
  catalog; when a show exists, they are available. Acceptance: no show → none of
  these four appear; with a show → all available as widgets.

- [ ] **Simplify Training & Nutrition tabs into widgets.** The Training history tab
  and the Nutrition/Diet page show too much at once. Break their content into
  add/removable widgets using the same widget system as the dashboard
  (`useWidgets`/`WidgetZone`/registry pattern, with a per-tab persisted enabled
  list). Acceptance: both tabs render as widgets the user can add/remove; default
  layout is not overwhelming.

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
