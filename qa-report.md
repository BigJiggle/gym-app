# App Health Report — 2026-05-28

## Phase 1: QA Engineer
- TypeScript: PASS (0 errors)
- Unit tests: PASS (84 passing, 0 failing)
- Bugs fixed: 0

### Feature Audit
- Onboarding: OK — 6-step flow validates Step 1 fields, submits via createUser + addShow, navigates before async plan generation.
- Diet page: OK — Swap meal calls window.api.swapMeal, reloads plan, modal closes. Completions reload on tab return.
- Training page: OK — saveSetsBatch + completeWorkout on finish, WorkoutSession phase transitions correctly.
- Check-in page: OK — Locked state shows countdown with time label; open state shows form with pre-filled prior weight; nextAllowed recalculated on settings changes.
- Education page: OK — All 5 tabs (Posing Guide, Prep Timeline, Show Checklist, Peak Week, First Timer) render; auto-switches to timeline only from default posing tab when show exists.
- Progress page: OK — Empty state links to Check-In; stat cards use optional chaining (first?.weight_kg) to avoid crash when progressEntries loads after checkinHistory.
- Settings page: OK — Unit change via setSetting('units'), interval via setSetting('checkin_interval_days'), profile save via updateUser with editForm.

### Bugs Fixed
None.

### Known Issues (not fixed)
None found.

---

## Phase 2: Bodybuilder User
- Status: RAN (Phase 1 fixed 0 bugs, which is fewer than 3)
- Feature added: Weekly carbs and fat adherence bars on the Diet page
- Description: The "Weekly Macro Totals" section previously tracked only calories and protein for the week. Prep athletes doing carb cycling also need to see weekly carb and fat adherence at a glance. Added two additional progress bars (carbs and fat) computed from the same already-loaded mealCompletions data — no new API calls required.
- Files changed: src/pages/Diet/index.tsx

---

## Phase 3: UX Reviewer
- Changes made: 2

1. src/pages/Diet/index.tsx — The one-line note explaining "Update Macros vs Regenerate" was rendered in text-gray-600, nearly invisible on dark backgrounds. Bumped to text-gray-500 and highlighted the destructive half in amber so a tired user can immediately see that Regenerate replaces all meals before accidentally tapping it.

2. src/pages/Training/index.tsx — The collapsed session card exercise preview (e.g. "Squat, Romanian Deadlift, Leg Press...") used text-gray-600, making it hard to read at a glance. Changed to text-gray-500 so users can quickly scan what's in a session without expanding it.

---

## Push
- Status: SUCCESS
