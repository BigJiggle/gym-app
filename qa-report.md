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

---
---

# QA Session — 2026-05-28 (Run 4)

## Phase 1: QA Engineer
- TypeScript: PASS (0 errors)
- Unit tests: PASS (84 passing, 0 failing)
- Bugs fixed: 1

### Feature Audit
- Onboarding: OK
- Diet page: OK
- Training page: OK
- Check-in page: BUG — `loadTrainingPlan` was not called in the CheckIn page `useEffect`, so navigating directly to `/checkin` (e.g., app reopen restores the last URL) left `trainingPlan` null. Training adherence auto-fill silently defaulted to 90% instead of computing from actual logged sessions. Fixed.
- Education page: OK
- Progress page: OK
- Settings page: OK

### Bugs Fixed
1. **CheckIn page — training adherence auto-fill silent failure on direct navigation**
   - File: `src/pages/CheckIn/index.tsx`
   - Missing `loadTrainingPlan` in `usePlanStore()` destructuring and missing call in `useEffect`.
   - When users reopened the app with the last URL pointing to `/checkin`, `trainingPlan` was always null so the auto-fill skipped with no error and showed a static 90% default.

### Known Issues
None found.

---

## Phase 2: Bodybuilder User
- Status: RAN (Phase 1 fixed 1 bug, which is fewer than 3)
- Feature added: Target stage weight goal in the Progress page Weight Trend card
- Description: Prep athletes track a target stage weight to compare against their projected show weight. The Weight Trend card showed projected weight at current rate but no goal. Added an inline-editable "Stage Weight Goal" row: athletes enter their target, the card shows required weekly rate vs current rate and colour-codes whether they're on pace. Stored in app settings (`target_weight_kg` key) — no backend schema changes needed. Respects metric/imperial preference.
- Files changed: `src/pages/Progress/index.tsx`, `src/types/index.ts`

---

## Phase 3: UX Reviewer
- Changes made: 2

1. `src/pages/Training/index.tsx` — Removed the permanent amber "RIR: Reps In Reserve" education banner from the plan tab. Experienced athletes know the term; the banner added visual noise on every visit. The `RIR x` notation in each exercise row remains self-explanatory.

2. `src/pages/Training/index.tsx` — When a session card is expanded, the compact "Start Workout" button in the card header was duplicated by the full-width "Start Workout" button inside the expanded content. The compact header button is now hidden when the card is expanded so only the prominent full-width CTA remains.

---

## Push
- Status: SUCCESS
