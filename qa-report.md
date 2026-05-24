# App Health Report — 2026-05-24

## Phase 1: QA Engineer
- TypeScript: PASS (0 errors fixed)
- Unit tests: PASS (84 passing, 0 failing)
- Bugs fixed: 0

### Feature Audit
- Onboarding: OK — All 6 steps navigate correctly; step 1 validation gates progression; final submission creates user + generates plans asynchronously before navigating to dashboard.
- Diet page: OK — Swap meal modal works; "↺ Regenerate" rebuilds the plan; weekly compliance strip and macro totals compute correctly from mealCompletions.
- Training page: OK — Session cards auto-expand today's workout; "▶ Start Workout" triggers startWorkout() and mounts WorkoutSession overlay; set logging, rest timer, skip, and completion all function correctly.
- Check-in page: OK — Locked state correctly gated by getNextCheckinDate(); open form submits and shows coach feedback; missed check-in panels fill retroactively; edit-last-check-in works on locked screen.
- Education page: OK — All 5 tabs (Prep Timeline, Posing Guide, Show Checklist, Peak Week, First Timer) render correctly; carb load calculator computes; YouTube tutorial links open externally.
- Progress page: OK — Empty state shows "Do First Check-In" button; weight trend, projected show weight, measurement delta, charts, and adherence bars all render from check-in history.
- Settings page: OK — Unit system and check-in interval update immediately via setSetting(); profile edit + regenerate works; My Shows management (add/cancel/delete) functions correctly.

### Bugs Fixed
None — codebase was clean on entry.

### Known Issues (not fixed)
None found.

---

## Phase 2: Bodybuilder User
- Status: RAN (Phase 1 fixed 0 bugs — fewer than 3)
- Feature added: **Recalculate Macros button on Diet page**

  As a competitor 14 weeks out, macro targets need to decrease as bodyweight drops, but the only
  existing action was "↺ Regenerate" which rebuilds the entire meal plan and discards all customized
  food choices. Added a "⟳ Recalculate" button that calls `recalculateMacros(userId)` — this updates
  calorie/protein/carb/fat targets based on current body weight from the latest check-in, without
  touching meal structure, food choices, or weekly compliance data. Shows "✓ Updated" confirmation
  for 2.5s after completion.

- Files changed:
  - `src/pages/Diet/index.tsx` — imported `recalculateMacros` from planStore, added `recalcDone` state, added "⟳ Recalculate" button in tabs row

---

## Phase 3: UX Reviewer
- Changes made: 2

`src/pages/Education/index.tsx` — The Prep Timeline empty state previously only showed text saying "Add a competition in Settings → My Shows". A tired user had to figure out navigation themselves. Replaced the passive instruction with a primary action button "Add a Show in Settings →" that links directly to `/settings`. This removes one step of mental work and makes the call-to-action immediate.

`src/pages/CheckIn/index.tsx` — The check-in form has five sections (Weight, Measurements, Adherence, Wellbeing, Notes). Only Weight showed a "Required" subtitle. Adherence, Wellbeing, and Notes had no label, implying they were all required. Added "Optional" subtitles to these three cards so a user who just wants to log their weight quickly can see at a glance what they can skip, then scroll straight to the submit button.
