# Change Agent Report

## Run 2026-07-05 (Rearrange Training & Nutrition widgets)

### STEP 1 — Regression guard
No code regressions. Note: `npm ci` initially failed because Electron's
postinstall step tries to download the Electron binary over the network and that
download failed (the package graph itself installed fine). Re-ran with
`ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci`, which is safe here — tsc, vitest and
`electron-vite build` do not need the Electron runtime binary. Baseline
verification then passed clean (tsc 0 errors, 164 tests, build ✓).

### Backlog item implemented
**Rearrange Training & Nutrition widgets** (topmost unchecked) — drag-reorder for
the widget cards on the Training "My Plan" and Nutrition "Meal Plan" tabs, reusing
the dashboard `WidgetZone` mechanics, with order persisted across reloads.

What changed:
- New `TabWidgetZone` component reuses the dashboard WidgetZone drag mechanics —
  Rearrange toggle, long-press-to-enter rearrange mode (ignoring presses on the
  card's own controls), and HTML5 drag with dashed-outline / ring "Drop here" cues.
  Instead of registry components it renders caller-supplied `nodes` (already full
  cards) in the store's persisted order, and delegates add/remove to
  `TabWidgetControls`.
- `TabWidgetControls` gained an optional `actionsSlot` prop so the zone can place
  its Rearrange button in the same header row as Customize.
- Training and Diet pages now pass their section cards as a `nodes` map keyed by
  widget id (previously each card was inline JSX gated on `widgets.has(id)` in a
  fixed source order). The zone renders enabled ids in stored order and reorders
  via `store.reorder(from, to)` using each widget's REAL stored index, so slots
  whose node is currently null (e.g. countdown with no show date, or a widget with
  no data yet) are skipped without breaking reorder alignment. The Nutrition refeed
  widget's two adjacent JSX blocks were combined into one fragment node.
- Reorder persists through each tab's existing distinct localStorage key
  (`training_plan_widgets` / `nutrition_plan_widgets`) — no new keys, no migration.

### Files changed
- `src/components/widgets/TabWidgetZone.tsx` (new)
- `src/components/widgets/TabWidgetControls.tsx` (added `actionsSlot` prop)
- `src/pages/Training/index.tsx` (widget block → `nodes` map + `<TabWidgetZone>`)
- `src/pages/Diet/index.tsx` (widget block → `nodes` map + `<TabWidgetZone>`)
- `tests/unit/tabWidgetZone.test.tsx` (new, 5 tests)
- `docs/change-backlog.md` (item checked off)

### Verification
- `npx tsc --noEmit` — PASS (0 errors)
- `npm test` — PASS (169 tests, up from 164)
- `npx electron-vite build` — PASS

### Deferred
Nothing for this item. Remaining backlog items (cook time → meal quality, meal-prep
style threading, refeed-day meal adjustment, adaptive nutrition, AI-tailored
onboarding) are untouched and left for future runs.
