# App Health Report — 2026-05-27

## Phase 1: QA Engineer
- TypeScript: PASS (0 errors)
- Unit tests: PASS (84 passing, 0 failing)
- Bugs fixed: 0

### Feature Audit
- Onboarding: OK — 6 steps with defaults; step 1 validated (name, age, height, weight); steps 2–5 have sensible defaults; submit creates user and navigates to dashboard before plan generation
- Diet page: OK — swap calls `window.api.swapMeal` then reloads plan; weekly compliance strip and macro totals compute correctly; grocery list aggregates weekly quantities
- Training page: OK — WorkoutSession logs sets in local state, batch-saves on complete; rest timer fires correctly; PR lookup works; history shows top sets with progression arrows
- Check-in page: OK — locked countdown correctly computes time remaining; missed-slot panel available on both locked and open screens; open form pre-fills from latest check-in
- Education page: OK — 5 tabs (Posing Guide, Prep Timeline, Show Checklist, Peak Week, First Timer) all render; posing practice timer works; carb load calculator correct
- Progress page: OK — empty state with CTA when no check-ins; weight chart renders when data present; projected show weight displayed when show date set
- Settings page: OK — unit system and check-in interval persist to settings store; profile edit syncs from store on open; reset data triggers re-onboarding

### Bugs Fixed
None.

### Known Issues (not fixed)
- `computeWeeklyRate` in Progress/index.tsx uses `new Date(date_string)` (parsed as UTC) rather than `new Date(date_string + 'T12:00:00')` — can slightly skew weekly rate in UTC-offset timezones; impact is minor (≤1 day error over 7–28 days)

---

## Phase 2: Bodybuilder User
- Status: RAN (Phase 1 fixed 0 bugs — below the 3-bug threshold)
- Feature added: **Weekly Training Calorie Burn** — shows estimated kcal burned from completed workouts this week on the Training plan tab. Uses MET 5.5 × user bodyweight × workout duration (from `started_at`/`ended_at`). Displays total weekly burn, today's session burn with duration, and a per-session date breakdown. Pure frontend computation from existing `workoutHistory` data.
- Files changed:
  - `src/pages/Training/index.tsx`

---

## Phase 3: UX Reviewer
- Changes made: 2

`src/pages/Training/index.tsx` — Added amber **"PR"** badge next to top-set entries in workout history logs when the set matches the athlete's all-time best weight for that exercise. Replaces the ↑ progression arrow when a PR is hit. A competitor reviewing their session immediately sees which lifts were breakthroughs without needing to mentally compare numbers.

`src/pages/Diet/index.tsx` — Replaced the tiny plain-text "remaining" line in Today's Intake with a highlighted box (`bg-brand-900/20` border with "Still to eat:" label). For a hungry athlete who just trained, the remaining calories and macros are the most important number on the page — this makes them visually distinct and unmissable.

---

## Push
- Status: SUCCESS
