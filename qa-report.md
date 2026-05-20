# App Health Report — 2026-05-20

## Phase 1: QA Engineer

- TypeScript: PASS (0 errors)
- Unit tests: PASS (31 passing, 0 failing)
- Bugs fixed: 1

### Feature Audit

- Onboarding: OK — All 6 steps render, navigation and validation work correctly, plan generation fires after profile creation.
- Diet page: BUG FIXED — Grocery list weekly quantities were wrong when the same food appeared in multiple meals (only first occurrence counted); now sums all daily grams before multiplying by 7.
- Training page: OK — Start workout, log sets, mark complete, skip exercise, add/remove sets all function correctly.
- Check-in page: OK — Locked countdown displays correctly, available form submits, coach feedback renders, edit-last-check-in panel works.
- Education page: OK — All 5 tabs (Prep Timeline, Posing Guide, Show Checklist, Peak Week, First Timer) render and navigate without issues.
- Progress page: OK — Weight chart, measurement changes, trend analysis, and empty state all render correctly.
- Settings page: OK — Unit toggle propagates app-wide, check-in interval controls save, profile edit/regenerate both paths work.

### Bugs Fixed

- `src/pages/Diet/GroceryList.tsx:35–55` — `buildGroceryItems` silently skipped duplicate foods (same base name in multiple meals), so a food appearing in breakfast AND lunch only contributed one daily portion × 7 days to the grocery quantity. Fixed by accumulating gram totals across all meal occurrences before multiplying by 7; non-gram items fall back to `count × 7` days multiplier.

### Known Issues (not fixed)

- `Diet/index.tsx` — Meal swap replaces only the `foods` array in UI state (not persisted to DB). Design decision: alternatives are calorie-matched and no `updateDietPlan` IPC exists for individual meal food arrays.
- `CheckIn/index.tsx` — `weightDisplay` initialised at mount from store state. On a cold open directly to /checkin (bypassing Dashboard), history may not be loaded yet and weight field shows profile weight. Normal navigation flow (Dashboard → Check-in) populates the store before arrival.

---

## Phase 2: Bodybuilder User

- Status: RAN (Phase 1 fixed 1 bug, fewer than 3)
- Feature added: **Lift Progression Chart** — An exercise-specific estimated 1RM trend chart in Training → History → Stats & Charts. User selects any exercise they have logged weight for (minimum 2 sessions) and sees a line chart of e1RM (Epley formula: weight × (1 + reps/30)) over time, with actual weight × reps in the tooltip and a start-vs-now delta shown below the chart. Makes it immediately visible whether strength is being retained during a competition cut.
- Files changed: `src/pages/Training/WorkoutStats.tsx`

---

## Phase 3: UX Reviewer

- Changes made: 2

`src/pages/Training/index.tsx` — Added `▼`/`▲` chevron to the right of every session card header. Without it, the cards looked like static display panels; a tired user had no visual cue that tapping expands them to reveal the exercise list and "Start Workout" button. The chevron makes the expand interaction immediately obvious.

`src/pages/Progress/index.tsx` — Removed the duplicate empty state. When no check-ins exist, the page previously showed the WeightChart container (which internally displayed "No weight data yet. Submit your first check-in…") AND immediately below showed another card saying "No progress data yet. Your weight chart appears here…" with the same CTA. Fixed by only rendering the WeightChart when `progressEntries.length > 0`, so the bottom "Do First Check-In" empty state is the single no-data message a new user sees.
