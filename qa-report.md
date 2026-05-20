# App Health Report — 2026-05-20

## Phase 1: QA Engineer
- TypeScript: PASS (0 errors)
- Unit tests: PASS (31 passing, 0 failing)
- Bugs fixed: 2

### Feature Audit
- Onboarding: OK — 6-step flow completes and navigates to dashboard; step-1 validation guards required fields
- Diet page: OK — swap meal, mark eaten, food prefs, grocery list, weekly view all functional
- Training page: OK — workout session starts, sets log, complete workflow saves to history
- Check-in page: OK — locked countdown displays correctly; form submits and shows coach feedback; edit-last panel works
- Education page: OK — all 5 tabs render; timeline auto-expands current week; no-show empty state shown
- Progress page: BUG FIXED — two issues in Progress/index.tsx (see below)
- Settings page: OK — unit toggle, check-in schedule, edit profile, shows management all functional

### Bugs Fixed
- `src/pages/Progress/index.tsx:14` — Local variable named `window` inside `computeWeeklyRate` shadowed the global `window` object. Renamed to `recentCheckins`.
- `src/pages/Progress/index.tsx:82-85` — `STATUS_LABEL` used cut-specific strings ("Losing Too Fast", "Losing Too Slow") for all goals. A bulk user who isn't gaining saw "Losing Too Slow" which is the opposite of correct. Made labels goal-aware: bulk users now see "Gaining Too Fast" and "Not Gaining".

### Known Issues (not fixed)
- None identified beyond the two fixed above.

---

## Phase 2: Bodybuilder User
- Status: RAN (Phase 1 fixed 2 bugs, fewer than 3)
- Feature added: **Weekly Macro Totals card on Diet page**
  - Shows cumulative calories and protein logged this week vs. target × days elapsed, with percentage bars and colour coding (green ≥ 90%, brand orange otherwise)
  - Uses already-loaded `mealCompletions` data — no new IPC calls or schema changes
  - Rationale: contest prep athletes need to know weekly compliance, not just today's, before each check-in; previously there was no way to see this without manually summing daily logs
- Files changed: `src/pages/Diet/index.tsx`

---

## Phase 3: UX Reviewer
- Changes made: 2

**`src/pages/Training/index.tsx`** — The ▶ Start button previously only appeared on the collapsed card for today's session. All other sessions required expanding the card before the Start button was visible. Changed to show ▶ Start on every collapsed card: filled brand colour for today, outlined for other days. Saves one tap for any non-today session or makeup workout.

**`src/pages/CheckIn/index.tsx`** — The weight input displayed a Card title "Bodyweight (lbs)" and an inner label "Current weight (lbs) *" — the same information twice. Removed the redundant inner label and replaced the Card subtitle with "Required" to preserve the affordance. The most-entered field in the app now has one clear label instead of two.
