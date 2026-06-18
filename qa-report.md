# App Health Report — 2026-06-18 (Run 2)

## Phase 1: QA Engineer
- TypeScript: PASS (0 errors)
- Unit tests: PASS (86 tests, 6 test files)
- Bugs fixed: **0** — codebase clean; all previous fixes holding

### Nutrition Engine Audit
- calcPortionStr logic: OK — MEAL_CAL_FRACTIONS (protein 0.45, carb 0.35, fat 0.15), ROLE_FIXED_G (veg 120g, fruit 100g, powder 30g), ROLE_MIN/MAX_G clamps all sensible.
- Template TemplateFoodItems: OK — all 9 meal templates pass valid `{ id, display, role, unitSuffix?, fixedLabel? }` objects.
- getCultureFood coverage: OK — all 8 cultures define protein_main, carb_main, veg, fat, dairy, plant_protein; exclusion logic confirmed intact.
- FOOD_CALORIES_PER_100G coverage: OK — all food IDs in culture profiles and templates have calorie entries.
- Macro math: OK — protein = weight_kg × 2.3g, fat = weight_kg × 0.9g, carbs fill remainder; resolvedSnackCount correctly falls back to include_snacks.

### User Flow Audit (all 7 flows traced through source)
- Onboarding → plan gen: OK
- Diet page portions: OK
- Meal completion: OK
- Check-in → recalc: OK
- Settings → regen: OK
- Training plan generation: OK
- Progress tracking: OK

---

## Phase 2: Prep Athlete Feature
**Feature added:** Meal Schedule Timeline on Diet page

**Why this matters:** Prep athletes eat 4–6 timed meals around workouts, and protein synthesis timing windows (every 3–4 hrs) are critical in a deficit. Previously the Diet page listed meals as cards with a "Next" badge on the upcoming one, but there was no way to see the entire day's eating schedule at a glance. A prep athlete checking their phone mid-morning had to scroll the full meal list to understand where they were in the day.

**What was added** (`src/pages/Diet/index.tsx`):
- A `Meal Schedule` panel sits above the Daily Meals card list (Meal Plan tab only)
- A horizontal timeline bar spanning 5am–10pm; hour tick marks at 6am/9am/12pm/3pm/6pm/9pm with labels
- Each meal plotted as a numbered circle at its scheduled time, color-coded:
  - Green = eaten
  - Brand blue with ring = next/current (matches activeMealIndex)
  - Amber = missed (time has passed, not eaten, not the active meal)
  - Gray = upcoming
- A live "now" cursor (thin white-30% vertical line) moves with the current time
- Header shows "Next: <meal name> at HH:MM" or "All meals done today"
- A legend row (eaten / next / missed / upcoming / now) for first-time clarity
- A missed-meal alert banner fires when any overdue meal was skipped, naming the meal and its time
- Zero new IPC calls; uses `mealCompletions` and `dietPlan.meals` already in store

---

## Phase 3: UX Reviewer
**2 surgical fixes applied:**

### Fix 1: Training — completed session boxes now show day name
- **Before:** "Sessions This Week" tracker showed only "✓" in green boxes when done. With 4 sessions completed, all you saw was 4 identical green checkmarks — no way to identify which days were trained without mousing over for a tooltip.
- **After:** Completed boxes now show "✓ Mon", "✓ Wed", etc., alongside the session type (e.g. "Push"). Consistent with the pending-session layout that already showed the day name.
- **File:** `src/pages/Training/index.tsx`

### Fix 2: Diet — eaten meal cards keep action buttons at full opacity
- **Before:** The entire eaten meal card had `opacity-50` applied via CSS. Because CSS opacity cascades to all children, the "✓ Eaten" toggle button was equally dimmed — users had no visual cue it was clickable to undo a logged meal.
- **After:** `opacity-40` now applies only to the meal content wrapper (header + food chips), while the action row (Swap / Mark Eaten buttons) stays at full opacity. The "✓ Eaten" button also gains a red hover state as an additional undo signal.
- **File:** `src/pages/Diet/index.tsx`

---

---

## Run 2 — 2026-06-18

### Phase 1: QA Engineer
- TypeScript: PASS (0 errors)
- Unit tests: PASS (86 tests)
- Bugs fixed: **0** — codebase still clean

### Phase 2: Prep Athlete Feature
**Feature added:** Daily Physique Condition Log on Dashboard

**Why this matters:** Competitive prep athletes obsess over daily condition — "full" (glycogen topped up), "flat" (depleted), "watery" (sodium/water retention), "dry/vascular" (ready to step on stage). This reading changes day-to-day based on food, sodium, sleep, and training. Previously there was no way in the app to record this. Athletes want to correlate condition tags over a week to see patterns: "I'm always flat Tuesdays after HIIT" or "refeed Sundays make me full Monday". Without a log, these insights are lost.

**What was added** (`src/pages/Dashboard/index.tsx`):
- New "Daily Condition" card on Dashboard, positioned between Posing Practice and This Week's Volume
- Quick-select tag buttons: Full, Flat, Dry, Watery, Tight, Vascular, Bloated, Smooth — each with sport-specific color coding (Full/Tight = green, Flat/Bloated = amber, Dry = blue, Vascular = red)
- Multiple tags can be selected per day (e.g., "Full + Vascular" for a peak-week day)
- Optional free-text note field (e.g., "great separation after last night's carb load")
- 7-day history strip at the bottom — each day shows its primary condition tag so athletes can spot weekly patterns at a glance
- Today's date is highlighted in brand color in the strip
- Pure localStorage storage (`condition_log`), same pattern as cardio_log and posing_log — zero new IPC calls

### Phase 3: UX Reviewer
**2 surgical fixes applied:**

#### Fix 1: Diet — "✓ Eaten" button now has undo hint
- **Before:** When a meal was marked eaten, the button showed "✓ Eaten" and turned red on hover — but there was no tooltip or label explaining this was a toggle. Athletes who fat-fingered a meal had to guess whether clicking the green button would help or break something.
- **After:** `title="Click to mark as not eaten"` added to the "✓ Eaten" state. Hover still turns red (danger signal), but now a native tooltip confirms the action on desktop.
- **File:** `src/pages/Diet/index.tsx`

#### Fix 2: Diet — Overdue meals now show "Due" badge instead of "Next"
- **Before:** The active meal badge always read "Next" in brand blue, even if the scheduled meal time had already passed (e.g., it was 2pm and the 12pm meal was still not logged). This was misleading — "Next" implies something upcoming, not something already overdue.
- **After:** Badge computes whether the meal's scheduled time has already passed. If past: amber "Due" badge. If upcoming: brand-blue "Next" badge. Prep athletes eating on a strict timed schedule now immediately see they are behind.
- **File:** `src/pages/Diet/index.tsx`

---

| Date | QA bugs | Feature | UX fixes |
|------|---------|---------|----------|
| 2026-06-18 (r2) | **0** | Daily Physique Condition Log on Dashboard | "✓ Eaten" undo hint; "Due" vs "Next" badge for overdue meals |
| 2026-06-18 | **0** | Meal Schedule Timeline on Diet page | Day names on completed session boxes; eaten-meal button opacity fix |
| 2026-06-17 (r2) | **0** | Progressive overload buttons in WorkoutSession | View Progress link on check-in success; live set count in session bar |
| 2026-06-17 | **0** | Per-set RIR (Reps in Reserve) logging | Two UX copy fixes |
