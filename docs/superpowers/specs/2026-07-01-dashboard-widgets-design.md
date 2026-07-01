# Dashboard Widgets — Design Spec

**Date:** 2026-07-01
**Status:** Approved for planning

## Goal

Let the user customize their Dashboard by adding, removing, and reordering a set
of stat "widgets" that display already-calculated nutrition and training data.
Widgets live in a dedicated "My Widgets" zone on the Dashboard, arranged in a
reorderable grid, with an Add Widgets screen for enabling/disabling them.

Keep it simple and logically correct — reorder-only (no free-form overlap, no
resize), desktop pointer interaction, localStorage persistence.

## Widget set (v1)

Four widgets, each rendering data that already exists and is already computed
today:

| Widget ID | Title | Data source (unchanged) |
|---|---|---|
| `water` | Water Intake | `localStorage water_ml_<date>` + `water_target_ml` |
| `cardio` | Cardio | `localStorage cardio_log` |
| `sessions-week` | Sessions This Week | `usePlanStore` workoutHistory + trainingPlan |
| `weekly-volume` | Weekly Volume | computed MEV progress (from Training page logic) |

**Not widgetized (stay exactly as they are):** adherence streak, daily meal
checklist, rest-day indicator, macros, energy balance, refeed day, meal
schedule, and all other existing Dashboard/Diet/Training content.

Water and Cardio currently render as **inline cards on the Dashboard**. They are
**moved** into widget components — the inline versions are removed so there is no
duplication. Because both are enabled by default (see Persistence), nothing
visually disappears for the user; the cards simply now live in the widget zone.

## Components & structure

```
src/components/widgets/
  registry.ts            # ordered array of widget definitions
  useWidgets.ts          # hook: read / reorder / enable / disable (localStorage)
  WidgetZone.tsx         # the Dashboard "My Widgets" grid + rearrange/edit mode
  WidgetFrame.tsx        # shared chrome (drag handle, ✕ delete) around a widget
  WaterWidget.tsx
  CardioWidget.tsx
  SessionsWeekWidget.tsx
  WeeklyVolumeWidget.tsx
```

- **`registry.ts`** — single source of truth:
  `{ id: string; title: string; description: string; Component: React.FC }[]`.
  Both the WidgetZone and the Add Widgets catalog read from this. Adding a future
  widget = append one entry.
- **Each widget component** is self-contained: pulls its own data from
  `usePlanStore` / localStorage exactly as the current code does, renders in a
  fixed-height card. No props required beyond what it fetches itself.
- **`WidgetFrame`** wraps a widget in edit mode, adding the drag handle and the ✕
  delete control. In normal mode it renders the widget with no chrome.

## State & persistence

- localStorage key **`dashboard_widgets`**: JSON **ordered array of enabled
  widget IDs**, e.g. `["water","cardio","sessions-week","weekly-volume"]`.
- **Default (key absent):** all four IDs, in registry order — nothing disappears
  on first run.
- **`useWidgets()`** hook exposes: `enabledIds` (ordered), `reorder(fromIdx,
  toIdx)`, `enable(id)` (append), `disable(id)` (remove). Every mutation writes
  back to localStorage. Unknown IDs in storage are ignored (defensive against a
  removed/renamed widget).
- Consistent with existing app patterns (`cardio_log`, `refeed_day`,
  `supplement_list` all use localStorage). No SQLite / IPC changes.

## Dashboard "My Widgets" zone

- Renders **below** the existing pinned cards (existing Dashboard content is
  untouched above it).
- Header row: **"My Widgets"** title, a **"Rearrange"** toggle button, and a
  **"+ Add Widgets"** button (navigates to `/widgets`).
- Body: responsive **2-column grid** (1 column on narrow widths) of the enabled
  widgets in stored order.
- **Empty state:** if no widgets are enabled, show a friendly prompt with a
  button to the Add Widgets screen.

### Rearrange (edit) mode

- Entered **two ways** (both supported):
  1. Clicking the **"Rearrange"** toggle.
  2. **Press-and-hold** (long-press ~400ms) on any widget.
- In edit mode: non-widget page content **dims**, each widget shows a **drag
  handle** and a **✕ delete** control, and a subtle "Done" affordance exits the
  mode.
- **Reordering:** pointer-based drag (mousedown → move → mouseup) reorders
  widgets within the grid; the grid re-flows to a tidy layout (no overlap, no
  free x/y). New order persists via `reorder`.
- Interaction is **desktop pointer** based (Electron app). Implementation uses
  native pointer events; no drag-and-drop library is added.

### Delete a widget

- The ✕ on a widget opens a confirm dialog: **"Are you sure you want to remove
  this widget?"** with Remove / Cancel.
- Confirm → `disable(id)`. The widget is removed from the zone but **not
  destroyed** — it remains in the registry and can be re-enabled from the Add
  Widgets screen at any time.

## Add Widgets screen (`/widgets`)

- New route `/widgets` registered in `App.tsx`, inside `AppShell` (same as other
  authed routes).
- Lists **every** registry widget as a catalog entry showing title, description,
  and an **Enabled / Add** state derived from `useWidgets().enabledIds`.
- **Hover preview:** hovering (or focusing) a catalog entry renders a **live
  preview of the actual widget** (the same `Component` from the registry) so the
  user sees exactly what it will look like before adding.
- Click a disabled entry's **Add** → `enable(id)` (appended to the zone). Enabled
  entries show as already added (and can optionally be removed here too).
- A back link returns to the Dashboard.

## Out of scope (v1)

- Free-form absolute positioning / overlapping widgets.
- Widget resizing.
- Touch-specific gestures beyond what pointer events already provide.
- Widgetizing any of the `(keep)` items or other existing cards.
- Cross-device sync (localStorage is local, matching current app behavior).

## Testing

- **`useWidgets` unit tests** (vitest, matches existing `tests/unit/` pattern):
  default returns all four in order; `enable`/`disable`/`reorder` mutate and
  persist correctly; unknown stored IDs are ignored; disabling then re-enabling
  restores the widget.
- **Registry test:** every registry entry has a unique `id` and a `Component`.
- Manual verification in the running Electron app: add/remove/reorder round-trip,
  hover preview renders, confirm-dialog gating, persistence across reload.

## Delivery

After implementation and verification, commit and **push to the GitHub repo**
(origin/master) per the user's request.
