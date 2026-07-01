# Dashboard Widgets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a customizable "My Widgets" zone to the Dashboard where the user can add, remove, and drag-reorder four stat widgets (Water, Cardio, Sessions This Week, Weekly Volume), with an Add Widgets screen for enabling/disabling them.

**Architecture:** A localStorage-backed registry of widget definitions drives both a reorderable grid on the Dashboard and an Add Widgets catalog page. Water/Cardio state is extracted out of the Dashboard into a self-contained hook (water) and a zustand store (cardio, because it is also read by the Energy Balance and Scorecard cards). Reordering uses native HTML5 drag-and-drop — no new dependency.

**Tech Stack:** React + TypeScript, zustand, react-router-dom (HashRouter), Tailwind, vitest + @testing-library/react.

---

## File Structure

**Create:**
- `src/store/cardioStore.ts` — shared reactive cardio log (zustand + localStorage)
- `src/components/widgets/useWaterLog.ts` — self-contained water intake hook (localStorage)
- `src/components/widgets/useWidgets.ts` — enabled-widget list + reorder/enable/disable (localStorage)
- `src/components/widgets/registry.tsx` — ordered array of widget definitions
- `src/components/widgets/WaterWidget.tsx`
- `src/components/widgets/CardioWidget.tsx`
- `src/components/widgets/SessionsWeekWidget.tsx`
- `src/components/widgets/WeeklyVolumeWidget.tsx`
- `src/components/widgets/WidgetFrame.tsx` — edit-mode chrome (drag handle + delete)
- `src/components/widgets/WidgetZone.tsx` — the Dashboard grid + rearrange mode
- `src/pages/AddWidgets/index.tsx` — the `/widgets` catalog screen
- `tests/unit/useWidgets.test.ts`
- `tests/unit/cardioStore.test.ts`
- `tests/unit/useWaterLog.test.ts`
- `tests/unit/widgetRegistry.test.tsx`

**Modify:**
- `src/pages/Dashboard/index.tsx` — remove inline Water + Cardio cards and their local state; switch Energy Balance + Scorecard cardio reads to `useCardioStore`; mount `<WidgetZone />`.
- `src/App.tsx` — register the `/widgets` route.

---

## Task 1: `useWidgets` hook (enabled-widget list + persistence)

**Files:**
- Create: `src/components/widgets/useWidgets.ts`
- Test: `tests/unit/useWidgets.test.ts`

The hook owns the ordered list of enabled widget IDs, persisted to localStorage key `dashboard_widgets`. It must not import the registry (to avoid pulling React components into a logic test); it takes the list of all known IDs as its default source via a constant defined here.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/useWidgets.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWidgets, ALL_WIDGET_IDS, STORAGE_KEY } from '../../src/components/widgets/useWidgets'

describe('useWidgets', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to all widget ids in order when storage is empty', () => {
    const { result } = renderHook(() => useWidgets())
    expect(result.current.enabledIds).toEqual([...ALL_WIDGET_IDS])
  })

  it('disable removes an id and persists', () => {
    const { result } = renderHook(() => useWidgets())
    act(() => result.current.disable(ALL_WIDGET_IDS[0]))
    expect(result.current.enabledIds).not.toContain(ALL_WIDGET_IDS[0])
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(result.current.enabledIds)
  })

  it('enable appends a previously-disabled id', () => {
    const { result } = renderHook(() => useWidgets())
    const id = ALL_WIDGET_IDS[0]
    act(() => result.current.disable(id))
    act(() => result.current.enable(id))
    expect(result.current.enabledIds[result.current.enabledIds.length - 1]).toBe(id)
  })

  it('reorder moves an id from one index to another', () => {
    const { result } = renderHook(() => useWidgets())
    const first = result.current.enabledIds[0]
    act(() => result.current.reorder(0, 2))
    expect(result.current.enabledIds[2]).toBe(first)
  })

  it('ignores unknown ids stored in localStorage', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['bogus', ALL_WIDGET_IDS[0]]))
    const { result } = renderHook(() => useWidgets())
    expect(result.current.enabledIds).toEqual([ALL_WIDGET_IDS[0]])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/useWidgets.test.ts`
Expected: FAIL — cannot find module `useWidgets`.

- [ ] **Step 3: Write the hook**

```ts
// src/components/widgets/useWidgets.ts
import { useCallback, useSyncExternalStore } from 'react'

export type WidgetId = 'water' | 'cardio' | 'sessions-week' | 'weekly-volume'

// Canonical order widgets appear in when none have been reordered/added.
export const ALL_WIDGET_IDS: WidgetId[] = ['water', 'cardio', 'sessions-week', 'weekly-volume']
export const STORAGE_KEY = 'dashboard_widgets'

function read(): WidgetId[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw == null) return [...ALL_WIDGET_IDS]
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return [...ALL_WIDGET_IDS]
    // Keep only known ids, preserving stored order.
    return parsed.filter((id): id is WidgetId => (ALL_WIDGET_IDS as string[]).includes(id))
  } catch {
    return [...ALL_WIDGET_IDS]
  }
}

// Simple external store so multiple mounted consumers stay in sync.
const listeners = new Set<() => void>()
let cache: WidgetId[] | null = null

function getSnapshot(): WidgetId[] {
  if (cache == null) cache = read()
  return cache
}

function write(next: WidgetId[]) {
  cache = next
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  listeners.forEach((l) => l())
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function useWidgets() {
  const enabledIds = useSyncExternalStore(subscribe, getSnapshot)

  const enable = useCallback((id: WidgetId) => {
    const cur = getSnapshot()
    if (cur.includes(id)) return
    write([...cur, id])
  }, [])

  const disable = useCallback((id: WidgetId) => {
    write(getSnapshot().filter((x) => x !== id))
  }, [])

  const reorder = useCallback((from: number, to: number) => {
    const cur = [...getSnapshot()]
    if (from < 0 || from >= cur.length || to < 0 || to >= cur.length) return
    const [moved] = cur.splice(from, 1)
    cur.splice(to, 0, moved)
    write(cur)
  }, [])

  return { enabledIds, enable, disable, reorder }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/useWidgets.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/widgets/useWidgets.ts tests/unit/useWidgets.test.ts
git commit -m "feat(widgets): useWidgets hook for enabled-widget persistence"
```

---

## Task 2: `useWaterLog` hook (extract water state)

**Files:**
- Create: `src/components/widgets/useWaterLog.ts`
- Test: `tests/unit/useWaterLog.test.ts`

Replicates the Dashboard's water behaviour exactly: per-day `water_ml_<date>` and a global `water_target_ml`, defaulting to 3785 (imperial) or 3000 (metric).

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/useWaterLog.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWaterLog } from '../../src/components/widgets/useWaterLog'

const TODAY = new Date().toLocaleDateString('en-CA')

describe('useWaterLog', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to 0 ml and the metric target', () => {
    const { result } = renderHook(() => useWaterLog('metric'))
    expect(result.current.waterMl).toBe(0)
    expect(result.current.waterTargetMl).toBe(3000)
  })

  it('addWater accumulates and persists per-day', () => {
    const { result } = renderHook(() => useWaterLog('metric'))
    act(() => result.current.addWater(500))
    expect(result.current.waterMl).toBe(500)
    expect(localStorage.getItem(`water_ml_${TODAY}`)).toBe('500')
  })

  it('addWater never goes below zero', () => {
    const { result } = renderHook(() => useWaterLog('metric'))
    act(() => result.current.addWater(-999))
    expect(result.current.waterMl).toBe(0)
  })

  it('setTarget persists the global target', () => {
    const { result } = renderHook(() => useWaterLog('metric'))
    act(() => result.current.setTarget(3500))
    expect(result.current.waterTargetMl).toBe(3500)
    expect(localStorage.getItem('water_target_ml')).toBe('3500')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/useWaterLog.test.ts`
Expected: FAIL — cannot find module `useWaterLog`.

- [ ] **Step 3: Write the hook**

```ts
// src/components/widgets/useWaterLog.ts
import { useEffect, useState } from 'react'

export function useWaterLog(units: 'metric' | 'imperial') {
  const todayStr = new Date().toLocaleDateString('en-CA')
  const [waterMl, setWaterMl] = useState(0)
  const [waterTargetMl, setWaterTargetMl] = useState(units === 'imperial' ? 3785 : 3000)

  useEffect(() => {
    const stored = parseInt(localStorage.getItem(`water_ml_${todayStr}`) ?? '0', 10)
    setWaterMl(isNaN(stored) ? 0 : stored)
    const storedTarget = parseInt(localStorage.getItem('water_target_ml') ?? '0', 10)
    if (storedTarget > 0) setWaterTargetMl(storedTarget)
    else setWaterTargetMl(units === 'imperial' ? 3785 : 3000)
  }, [todayStr, units])

  function addWater(ml: number) {
    const newVal = Math.max(0, waterMl + ml)
    setWaterMl(newVal)
    localStorage.setItem(`water_ml_${todayStr}`, String(newVal))
  }

  function setTarget(ml: number) {
    setWaterTargetMl(ml)
    localStorage.setItem('water_target_ml', String(ml))
  }

  return { waterMl, waterTargetMl, addWater, setTarget }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/useWaterLog.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/widgets/useWaterLog.ts tests/unit/useWaterLog.test.ts
git commit -m "feat(widgets): useWaterLog hook extracted from Dashboard"
```

---

## Task 3: `useCardioStore` (shared reactive cardio log)

**Files:**
- Create: `src/store/cardioStore.ts`
- Test: `tests/unit/cardioStore.test.ts`

zustand store persisted to the existing `cardio_log` localStorage key, so the Cardio widget, Energy Balance card, and Scorecard all stay in sync.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/cardioStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useCardioStore } from '../../src/store/cardioStore'

const TODAY = new Date().toLocaleDateString('en-CA')

describe('cardioStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useCardioStore.setState({ cardioLog: [] })
  })

  it('logToday adds/replaces today\'s entry and persists', () => {
    useCardioStore.getState().logToday('LISS', 30)
    const { cardioLog } = useCardioStore.getState()
    expect(cardioLog).toEqual([{ date: TODAY, type: 'LISS', minutes: 30 }])
    expect(JSON.parse(localStorage.getItem('cardio_log')!)).toEqual(cardioLog)
  })

  it('logToday replaces an existing entry for today', () => {
    useCardioStore.getState().logToday('LISS', 30)
    useCardioStore.getState().logToday('HIIT', 20)
    const { cardioLog } = useCardioStore.getState()
    expect(cardioLog.filter((e) => e.date === TODAY)).toHaveLength(1)
    expect(cardioLog[0]).toEqual({ date: TODAY, type: 'HIIT', minutes: 20 })
  })

  it('removeToday clears today\'s entry', () => {
    useCardioStore.getState().logToday('LISS', 30)
    useCardioStore.getState().removeToday()
    expect(useCardioStore.getState().cardioLog).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/cardioStore.test.ts`
Expected: FAIL — cannot find module `cardioStore`.

- [ ] **Step 3: Write the store**

```ts
// src/store/cardioStore.ts
import { create } from 'zustand'

export interface CardioEntry {
  date: string
  type: string
  minutes: number
}

interface CardioStore {
  cardioLog: CardioEntry[]
  logToday: (type: string, minutes: number) => void
  removeToday: () => void
}

function loadInitial(): CardioEntry[] {
  try {
    return JSON.parse(localStorage.getItem('cardio_log') ?? '[]')
  } catch {
    return []
  }
}

function persist(entries: CardioEntry[]) {
  localStorage.setItem('cardio_log', JSON.stringify(entries))
}

function today(): string {
  return new Date().toLocaleDateString('en-CA')
}

export const useCardioStore = create<CardioStore>((set) => ({
  cardioLog: loadInitial(),

  logToday: (type, minutes) =>
    set((s) => {
      const next = [...s.cardioLog.filter((e) => e.date !== today()), { date: today(), type, minutes }]
      persist(next)
      return { cardioLog: next }
    }),

  removeToday: () =>
    set((s) => {
      const next = s.cardioLog.filter((e) => e.date !== today())
      persist(next)
      return { cardioLog: next }
    }),
}))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/cardioStore.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/store/cardioStore.ts tests/unit/cardioStore.test.ts
git commit -m "feat(widgets): shared cardio store to keep widget and Dashboard cards in sync"
```

---

## Task 4: WaterWidget component

**Files:**
- Create: `src/components/widgets/WaterWidget.tsx`

Self-contained: uses `useWaterLog` + `useSettingsStore`. Markup is the Water Intake card moved verbatim from `Dashboard/index.tsx:1465-1566`, with state now from the hook and target-edit state local to the component.

- [ ] **Step 1: Write the component**

```tsx
// src/components/widgets/WaterWidget.tsx
import { useState } from 'react'
import { useSettingsStore } from '../../store/settingsStore'
import { useWaterLog } from './useWaterLog'

export default function WaterWidget() {
  const { settings } = useSettingsStore()
  const { waterMl, waterTargetMl, addWater, setTarget } = useWaterLog(settings.units)
  const [editingWaterTarget, setEditingWaterTarget] = useState(false)
  const [waterTargetInput, setWaterTargetInput] = useState('')

  const isImp = settings.units === 'imperial'
  const waterPct = waterTargetMl > 0 ? Math.min(100, Math.round((waterMl / waterTargetMl) * 100)) : 0
  const displayCurrent = isImp
    ? `${Math.round(waterMl / 29.5735)} oz`
    : waterMl >= 1000 ? `${(waterMl / 1000).toFixed(1)} L` : `${waterMl} ml`
  const displayTarget = isImp
    ? `${Math.round(waterTargetMl / 29.5735)} oz`
    : waterTargetMl >= 1000 ? `${(waterTargetMl / 1000).toFixed(1)} L` : `${waterTargetMl} ml`
  const quickAdds = isImp
    ? [{ ml: 237, label: '8oz' }, { ml: 355, label: '12oz' }, { ml: 473, label: '16oz' }, { ml: 946, label: '32oz' }]
    : [{ ml: 200, label: '200ml' }, { ml: 350, label: '350ml' }, { ml: 500, label: '500ml' }, { ml: 750, label: '750ml' }]

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-100">Water Intake</h2>
        {!editingWaterTarget ? (
          <button
            onClick={() => {
              setWaterTargetInput(isImp ? String(Math.round(waterTargetMl / 29.5735)) : String(waterTargetMl))
              setEditingWaterTarget(true)
            }}
            className="text-xs text-gray-500 hover:text-brand-400 transition-colors"
          >
            Target: {displayTarget}
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              value={waterTargetInput}
              onChange={(e) => setWaterTargetInput(e.target.value)}
              className="w-20 bg-gray-800 border border-gray-700 rounded-lg px-2 py-0.5 text-xs text-gray-200 focus:outline-none focus:border-brand-500"
              autoFocus
            />
            <span className="text-xs text-gray-500">{isImp ? 'oz' : 'ml'}</span>
            <button
              onClick={() => {
                const v = parseInt(waterTargetInput, 10)
                if (!isNaN(v) && v > 0) setTarget(isImp ? Math.round(v * 29.5735) : v)
                setEditingWaterTarget(false)
              }}
              className="text-xs bg-brand-600 hover:bg-brand-500 text-white px-2 py-0.5 rounded-lg transition-colors"
            >
              Save
            </button>
            <button onClick={() => setEditingWaterTarget(false)} className="text-xs text-gray-500 hover:text-gray-400 transition-colors">✕</button>
          </div>
        )}
      </div>
      <div className="mb-3">
        <div className="flex justify-between items-end mb-1.5">
          <span className={`text-2xl font-bold ${waterPct >= 100 ? 'text-blue-400' : 'text-gray-100'}`}>{displayCurrent}</span>
          <span className="text-xs text-gray-500">{waterPct}% of goal</span>
        </div>
        <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
          <div className={`h-full transition-all duration-300 ${waterPct >= 100 ? 'bg-blue-400' : 'bg-blue-500'}`} style={{ width: `${waterPct}%` }} />
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {quickAdds.map(({ ml, label }) => (
          <button
            key={ml}
            onClick={() => addWater(ml)}
            className="text-xs font-medium px-2.5 py-1.5 bg-blue-900/20 border border-blue-800/40 text-blue-400 rounded-lg hover:bg-blue-900/40 transition-colors"
          >
            +{label}
          </button>
        ))}
        {waterMl > 0 && (
          <button
            onClick={() => { if (window.confirm('Reset today\'s water to zero?')) addWater(-waterMl) }}
            className="text-xs text-gray-600 hover:text-gray-400 ml-auto transition-colors"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors referencing `WaterWidget.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/widgets/WaterWidget.tsx
git commit -m "feat(widgets): WaterWidget component"
```

---

## Task 5: CardioWidget component

**Files:**
- Create: `src/components/widgets/CardioWidget.tsx`

Self-contained: reads `useCardioStore`. Markup from `Dashboard/index.tsx:1568-1668`, with cardio log from the store and the input/edit UI state local to the component.

- [ ] **Step 1: Write the component**

```tsx
// src/components/widgets/CardioWidget.tsx
import { useState } from 'react'
import { useCardioStore } from '../../store/cardioStore'

const CARDIO_TYPES = ['LISS', 'HIIT', 'Stairs', 'Bike', 'Other']
const QUICK_PRESETS: [string, number][] = [['LISS', 30], ['LISS', 45], ['HIIT', 20], ['HIIT', 25]]

export default function CardioWidget() {
  const { cardioLog, logToday, removeToday } = useCardioStore()
  const todayStr = new Date().toLocaleDateString('en-CA')
  const [inputOpen, setInputOpen] = useState(false)
  const [cardioType, setCardioType] = useState('LISS')
  const [cardioMinutes, setCardioMinutes] = useState('')

  const jsDay = new Date().getDay()
  const daysFromMon = jsDay === 0 ? 6 : jsDay - 1
  const weekStart = new Date(Date.now() - daysFromMon * 86400000).toLocaleDateString('en-CA')
  const weekEntries = cardioLog.filter((e) => e.date >= weekStart && e.date <= todayStr)
  const todayEntry = cardioLog.find((e) => e.date === todayStr)
  const weekMins = weekEntries.reduce((s, e) => s + e.minutes, 0)

  function saveCustom() {
    const mins = parseInt(cardioMinutes, 10)
    if (!cardioType || isNaN(mins) || mins <= 0) return
    logToday(cardioType, mins)
    setInputOpen(false)
    setCardioMinutes('')
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-100">Cardio</h2>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>{weekEntries.length} session{weekEntries.length !== 1 ? 's' : ''} this week</span>
          {weekMins > 0 && <span>· {weekMins} min</span>}
        </div>
      </div>
      {todayEntry ? (
        <div className="flex items-center justify-between bg-green-950/20 border border-green-800/40 rounded-xl px-3 py-2.5 mb-3">
          <div>
            <span className="text-green-400 font-semibold text-sm">{todayEntry.type}</span>
            <span className="text-gray-400 text-sm ml-2">{todayEntry.minutes} min</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setCardioType(todayEntry.type); setCardioMinutes(String(todayEntry.minutes)); setInputOpen(true) }}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >Edit</button>
            <button onClick={removeToday} aria-label="Delete today's cardio session" title="Delete" className="text-xs text-red-500 hover:text-red-400 transition-colors">✕</button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-500 mb-3">No cardio logged today.</p>
      )}
      {inputOpen ? (
        <div className="space-y-2">
          <div className="flex gap-1.5 flex-wrap">
            {CARDIO_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setCardioType(t)}
                className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${cardioType === t ? 'bg-brand-600/20 border-brand-500 text-brand-400' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'}`}
              >{t}</button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number" min={1} max={180} value={cardioMinutes}
              onChange={(e) => setCardioMinutes(e.target.value)}
              placeholder="Minutes"
              className="w-24 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-sm text-gray-100 focus:outline-none focus:border-brand-500"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && saveCustom()}
            />
            <span className="text-xs text-gray-500">min</span>
            <button onClick={saveCustom} className="text-xs bg-brand-600 hover:bg-brand-500 text-white px-3 py-1 rounded-lg transition-colors font-medium">Save</button>
            <button onClick={() => { setInputOpen(false); setCardioMinutes('') }} className="text-xs text-gray-500 hover:text-gray-400 transition-colors">Cancel</button>
          </div>
          <div className="flex gap-1.5">
            {QUICK_PRESETS.map(([t, m]) => (
              <button
                key={`${t}-${m}`}
                onClick={() => { logToday(t, m); setInputOpen(false); setCardioMinutes('') }}
                className="text-xs px-2 py-1 bg-gray-800 border border-gray-700 rounded-lg text-gray-400 hover:border-brand-700 hover:text-brand-400 transition-colors"
              >{t} {m}m</button>
            ))}
          </div>
        </div>
      ) : !todayEntry ? (
        <div className="space-y-2">
          <div className="flex gap-1.5 flex-wrap">
            {QUICK_PRESETS.map(([t, m]) => (
              <button
                key={`${t}-${m}`}
                onClick={() => logToday(t, m)}
                className="text-xs font-medium px-3 py-1.5 bg-gray-800 border border-gray-700 text-gray-400 hover:bg-brand-900/20 hover:border-brand-700 hover:text-brand-400 rounded-lg transition-colors"
              >{t} {m}m</button>
            ))}
          </div>
          <button
            onClick={() => { setCardioType('LISS'); setCardioMinutes(''); setInputOpen(true) }}
            className="w-full py-1.5 rounded-xl border border-dashed border-gray-700 text-gray-500 hover:border-brand-700 hover:text-brand-400 text-xs transition-colors"
          >
            + Custom duration
          </button>
        </div>
      ) : (
        <button
          onClick={() => { setCardioType('LISS'); setCardioMinutes(''); setInputOpen(true) }}
          className="w-full py-2 rounded-xl border border-dashed border-gray-700 text-gray-500 hover:border-brand-700 hover:text-brand-400 text-sm transition-colors"
        >
          + Log another cardio
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors referencing `CardioWidget.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/widgets/CardioWidget.tsx
git commit -m "feat(widgets): CardioWidget component"
```

---

## Task 6: SessionsWeekWidget component

**Files:**
- Create: `src/components/widgets/SessionsWeekWidget.tsx`

Reuses the Scorecard's training logic (`Dashboard/index.tsx:972-995`): count scheduled vs completed sessions for Mon→today from `usePlanStore`.

- [ ] **Step 1: Write the component**

```tsx
// src/components/widgets/SessionsWeekWidget.tsx
import { usePlanStore } from '../../store/planStore'

function localDateStr(d: Date): string {
  return d.toLocaleDateString('en-CA')
}

export default function SessionsWeekWidget() {
  const { trainingPlan, workoutHistory } = usePlanStore()

  const today = new Date()
  const dow = today.getDay() // 0=Sun…6=Sat
  const daysSinceMon = dow === 0 ? 6 : dow - 1
  const weekDates: string[] = []
  for (let i = daysSinceMon; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    weekDates.push(localDateStr(d))
  }

  const sessions = trainingPlan?.sessions ?? []
  const scheduledThisWeek = weekDates.filter((dateStr) => {
    const d = new Date(dateStr + 'T12:00:00')
    const dDow = d.getDay() === 0 ? 7 : d.getDay()
    return sessions.some((s) => s.day_of_week === dDow)
  })
  const completedThisWeek = scheduledThisWeek.filter((dateStr) =>
    workoutHistory.some((l) => l.status === 'completed' && l.date === dateStr)
  )
  const pct = scheduledThisWeek.length > 0
    ? Math.round((completedThisWeek.length / scheduledThisWeek.length) * 100)
    : null
  const color = pct === null ? 'text-gray-600' : pct >= 80 ? 'text-green-400' : pct >= 50 ? 'text-amber-400' : 'text-red-400'

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Sessions This Week</p>
        <span className="text-xs text-gray-600">Mon–today</span>
      </div>
      <div className="flex items-end gap-3">
        <p className="text-3xl font-black text-gray-100">
          {completedThisWeek.length}
          <span className="text-lg font-bold text-gray-600">/{scheduledThisWeek.length}</span>
        </p>
        {pct !== null && <p className={`text-sm font-bold ${color} mb-1`}>{pct}%</p>}
      </div>
      <p className="text-xs text-gray-500 mt-1">
        {sessions.length === 0
          ? 'No training plan yet'
          : scheduledThisWeek.length === 0
            ? 'No sessions scheduled so far this week'
            : `${completedThisWeek.length} of ${scheduledThisWeek.length} scheduled sessions completed`}
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors referencing `SessionsWeekWidget.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/widgets/SessionsWeekWidget.tsx
git commit -m "feat(widgets): SessionsWeekWidget component"
```

---

## Task 7: WeeklyVolumeWidget component

**Files:**
- Create: `src/components/widgets/WeeklyVolumeWidget.tsx`

Compact roll-up of the Training page's MEV logic (`Training/index.tsx:90-134`): count muscle groups at/above MEV this week and total working sets. Fetches the exercise library itself.

- [ ] **Step 1: Write the component**

```tsx
// src/components/widgets/WeeklyVolumeWidget.tsx
import { useEffect, useState } from 'react'
import { usePlanStore } from '../../store/planStore'
import type { ExerciseLibraryItem } from '../../types'

const ALL_MUSCLE_GROUPS = ['chest', 'back', 'shoulders', 'triceps', 'biceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core']
const MEV: Record<string, number> = {
  chest: 8, back: 10, shoulders: 8, triceps: 6, biceps: 6,
  quads: 8, hamstrings: 6, glutes: 6, calves: 6, core: 6,
}

export default function WeeklyVolumeWidget() {
  const { workoutHistory } = usePlanStore()
  const [library, setLibrary] = useState<ExerciseLibraryItem[]>([])

  useEffect(() => {
    window.api.getExerciseLibrary().then(setLibrary)
  }, [])

  const today = new Date()
  const jsDay = today.getDay()
  const daysFromMon = jsDay === 0 ? 6 : jsDay - 1
  const monday = new Date(today)
  monday.setDate(today.getDate() - daysFromMon)
  const fromStr = monday.toLocaleDateString('en-CA')
  const toStr = today.toLocaleDateString('en-CA')

  const nameToGroup = new Map(library.map((e) => [e.name, e.muscleGroup]))
  const setsByGroup = new Map<string, number>()
  for (const log of workoutHistory) {
    if (log.status !== 'completed' || log.date < fromStr || log.date > toStr) continue
    for (const s of log.sets ?? []) {
      if (s.skipped) continue
      const group = nameToGroup.get(s.exercise_name)
      if (group) setsByGroup.set(group, (setsByGroup.get(group) ?? 0) + 1)
    }
  }

  const totalSets = Array.from(setsByGroup.values()).reduce((a, b) => a + b, 0)
  const groupsAtMev = ALL_MUSCLE_GROUPS.filter((g) => (setsByGroup.get(g) ?? 0) >= (MEV[g] ?? 6)).length
  const trainedGroups = ALL_MUSCLE_GROUPS.filter((g) => (setsByGroup.get(g) ?? 0) > 0).length
  const pct = Math.round((groupsAtMev / ALL_MUSCLE_GROUPS.length) * 100)
  const barColor = pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-500'

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Weekly Volume</p>
        <span className="text-xs text-gray-600">vs MEV</span>
      </div>
      <div className="flex items-end gap-3 mb-2">
        <p className="text-3xl font-black text-gray-100">
          {groupsAtMev}<span className="text-lg font-bold text-gray-600">/{ALL_MUSCLE_GROUPS.length}</span>
        </p>
        <p className="text-xs text-gray-500 mb-1">muscle groups at MEV</p>
      </div>
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden mb-2">
        <div className={`h-full transition-all duration-300 ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-gray-500">
        {totalSets} working set{totalSets !== 1 ? 's' : ''} this week · {trainedGroups} group{trainedGroups !== 1 ? 's' : ''} trained
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors referencing `WeeklyVolumeWidget.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/widgets/WeeklyVolumeWidget.tsx
git commit -m "feat(widgets): WeeklyVolumeWidget component (MEV roll-up)"
```

---

## Task 8: Widget registry

**Files:**
- Create: `src/components/widgets/registry.tsx`
- Test: `tests/unit/widgetRegistry.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/widgetRegistry.test.tsx
import { describe, it, expect } from 'vitest'
import { WIDGETS } from '../../src/components/widgets/registry'
import { ALL_WIDGET_IDS } from '../../src/components/widgets/useWidgets'

describe('widget registry', () => {
  it('every id in ALL_WIDGET_IDS has exactly one registry entry with a Component', () => {
    for (const id of ALL_WIDGET_IDS) {
      const matches = WIDGETS.filter((w) => w.id === id)
      expect(matches).toHaveLength(1)
      expect(typeof matches[0].Component).toBe('function')
      expect(matches[0].title.length).toBeGreaterThan(0)
    }
  })

  it('registry order matches ALL_WIDGET_IDS', () => {
    expect(WIDGETS.map((w) => w.id)).toEqual([...ALL_WIDGET_IDS])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/widgetRegistry.test.tsx`
Expected: FAIL — cannot find module `registry`.

- [ ] **Step 3: Write the registry**

```tsx
// src/components/widgets/registry.tsx
import type { FC } from 'react'
import type { WidgetId } from './useWidgets'
import WaterWidget from './WaterWidget'
import CardioWidget from './CardioWidget'
import SessionsWeekWidget from './SessionsWeekWidget'
import WeeklyVolumeWidget from './WeeklyVolumeWidget'

export interface WidgetDef {
  id: WidgetId
  title: string
  description: string
  Component: FC
}

export const WIDGETS: WidgetDef[] = [
  { id: 'water', title: 'Water Intake', description: 'Track daily hydration against your target with quick-add buttons.', Component: WaterWidget },
  { id: 'cardio', title: 'Cardio', description: 'Log today\'s cardio and see weekly sessions and minutes.', Component: CardioWidget },
  { id: 'sessions-week', title: 'Sessions This Week', description: 'Completed vs scheduled training sessions for the current week.', Component: SessionsWeekWidget },
  { id: 'weekly-volume', title: 'Weekly Volume', description: 'How many muscle groups have hit minimum effective volume this week.', Component: WeeklyVolumeWidget },
]

export function getWidget(id: WidgetId): WidgetDef | undefined {
  return WIDGETS.find((w) => w.id === id)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/widgetRegistry.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/widgets/registry.tsx tests/unit/widgetRegistry.test.tsx
git commit -m "feat(widgets): widget registry"
```

---

## Task 9: WidgetFrame + WidgetZone (grid, rearrange, delete)

**Files:**
- Create: `src/components/widgets/WidgetFrame.tsx`
- Create: `src/components/widgets/WidgetZone.tsx`

`WidgetFrame` wraps a widget; in edit mode it overlays a drag handle and a ✕ delete button. `WidgetZone` renders the enabled widgets in a 2-column grid, supports a "Rearrange" toggle and long-press to enter edit mode, HTML5 drag-and-drop reorder, and a `window.confirm` delete.

- [ ] **Step 1: Write WidgetFrame**

```tsx
// src/components/widgets/WidgetFrame.tsx
import type { ReactNode } from 'react'

interface WidgetFrameProps {
  editing: boolean
  onDelete: () => void
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>
  children: ReactNode
}

export default function WidgetFrame({ editing, onDelete, dragHandleProps, children }: WidgetFrameProps) {
  return (
    <div className={`relative ${editing ? 'ring-2 ring-brand-600/50 rounded-xl' : ''}`}>
      {editing && (
        <div className="absolute -top-2 -right-2 z-10 flex items-center gap-1">
          <button
            {...dragHandleProps}
            className="cursor-grab active:cursor-grabbing bg-gray-800 border border-gray-600 text-gray-300 rounded-lg w-7 h-7 flex items-center justify-center text-xs shadow"
            aria-label="Drag to reorder"
            title="Drag to reorder"
          >
            ⠿
          </button>
          <button
            onClick={onDelete}
            className="bg-red-900/80 border border-red-700 text-red-200 rounded-lg w-7 h-7 flex items-center justify-center text-xs shadow hover:bg-red-800"
            aria-label="Remove widget"
            title="Remove widget"
          >
            ✕
          </button>
        </div>
      )}
      <div className={editing ? 'pointer-events-none select-none' : ''}>{children}</div>
    </div>
  )
}
```

- [ ] **Step 2: Write WidgetZone**

```tsx
// src/components/widgets/WidgetZone.tsx
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useWidgets } from './useWidgets'
import { getWidget } from './registry'
import WidgetFrame from './WidgetFrame'

export default function WidgetZone() {
  const { enabledIds, disable, reorder } = useWidgets()
  const [editing, setEditing] = useState(false)
  const dragIndex = useRef<number | null>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function startLongPress() {
    longPressTimer.current = setTimeout(() => setEditing(true), 400)
  }
  function cancelLongPress() {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
  }

  function handleDelete(id: typeof enabledIds[number]) {
    if (window.confirm('Are you sure you want to remove this widget?')) disable(id)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">My Widgets</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditing((e) => !e)}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${editing ? 'bg-brand-600 border-brand-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600'}`}
          >
            {editing ? 'Done' : 'Rearrange'}
          </button>
          <Link
            to="/widgets"
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-700 bg-gray-800 text-gray-300 hover:border-brand-600 hover:text-brand-400 transition-colors"
          >
            + Add Widgets
          </Link>
        </div>
      </div>

      {enabledIds.length === 0 ? (
        <div className="bg-gray-900 border border-dashed border-gray-700 rounded-xl p-6 text-center">
          <p className="text-sm text-gray-400 mb-2">No widgets on your dashboard.</p>
          <Link to="/widgets" className="text-xs font-medium text-brand-400 hover:text-brand-300">+ Add Widgets</Link>
        </div>
      ) : (
        <div className={`grid gap-3 ${editing ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'}`}>
          {enabledIds.map((id, index) => {
            const def = getWidget(id)
            if (!def) return null
            const { Component } = def
            return (
              <div
                key={id}
                onPointerDown={editing ? undefined : startLongPress}
                onPointerUp={cancelLongPress}
                onPointerLeave={cancelLongPress}
                draggable={editing}
                onDragStart={() => { dragIndex.current = index }}
                onDragOver={(e) => { if (editing) e.preventDefault() }}
                onDrop={() => {
                  if (dragIndex.current !== null && dragIndex.current !== index) {
                    reorder(dragIndex.current, index)
                  }
                  dragIndex.current = null
                }}
              >
                <WidgetFrame editing={editing} onDelete={() => handleDelete(id)}>
                  <Component />
                </WidgetFrame>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors referencing `WidgetZone.tsx` / `WidgetFrame.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/components/widgets/WidgetFrame.tsx src/components/widgets/WidgetZone.tsx
git commit -m "feat(widgets): WidgetZone grid with rearrange and delete"
```

---

## Task 10: Integrate into Dashboard (remove inline cards, wire store, mount zone)

**Files:**
- Modify: `src/pages/Dashboard/index.tsx`

- [ ] **Step 1: Add imports**

At the top of `src/pages/Dashboard/index.tsx`, after the existing component imports (near line 8), add:

```tsx
import WidgetZone from '../../components/widgets/WidgetZone'
import { useCardioStore } from '../../store/cardioStore'
```

- [ ] **Step 2: Replace the local cardio state with the store**

Delete the local cardio state and helpers — the `CardioEntry` interface, the `cardioLog` useState (`Dashboard/index.tsx:52-56`), `saveCardioLog`, `logCardio`, `removeCardioToday`, `quickLogCardio` (lines 52-89) — **except** keep any that are still referenced. After deletion, add at the top of the component body (near where other stores are destructured, ~line 41):

```tsx
const { cardioLog } = useCardioStore()
```

The Energy Balance card (`todayCardioEntry = cardioLog.find(...)`, line 736) and the Scorecard (`cardioDays = weekDates.filter(d => cardioLog.some(...))`, line 1002) now read `cardioLog` from the store with no further change.

- [ ] **Step 3: Remove the local water state**

Delete the water useState + input state (`waterMl`, `waterTargetMl`, `editingWaterTarget`, `waterTargetInput` — lines 45-48), the water-loading `useEffect` (lines 256-262), and the `addWater` function (lines 331-335). These now live in `useWaterLog` inside `WaterWidget`.

- [ ] **Step 4: Delete the inline Water Intake and Cardio cards**

Remove the entire `{/* Water Intake */}` block (lines 1465-1566) and the entire `{/* Cardio Tracker */}` block (lines 1568-1668). Leave the `{/* Posing Practice */}` block and everything else intact.

- [ ] **Step 5: Mount the widget zone**

Immediately after the header `</div>` block and the refresh-notification block (i.e. right before the `{/* Stats row */}` comment at line 483), insert:

```tsx
      {/* Customizable widgets */}
      <WidgetZone />
```

- [ ] **Step 6: Verify build + full test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; all tests pass (existing suite + the 4 new widget test files).

- [ ] **Step 7: Commit**

```bash
git add src/pages/Dashboard/index.tsx
git commit -m "feat(widgets): mount WidgetZone and move water/cardio into widgets"
```

---

## Task 11: Add Widgets screen (`/widgets`) with hover preview

**Files:**
- Create: `src/pages/AddWidgets/index.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write the AddWidgets page**

```tsx
// src/pages/AddWidgets/index.tsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { WIDGETS } from '../../components/widgets/registry'
import { useWidgets } from '../../components/widgets/useWidgets'

export default function AddWidgets() {
  const { enabledIds, enable, disable } = useWidgets()
  const [hovered, setHovered] = useState<string | null>(null)

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Add Widgets</h1>
          <p className="text-gray-500 text-sm mt-0.5">Hover to preview. Add or remove widgets from your dashboard.</p>
        </div>
        <Link to="/dashboard">
          <button className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-700 bg-gray-800 text-gray-300 hover:border-brand-600 hover:text-brand-400 transition-colors">
            ← Back to Dashboard
          </button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {WIDGETS.map((w) => {
          const isEnabled = enabledIds.includes(w.id)
          const { Component } = w
          return (
            <div
              key={w.id}
              onMouseEnter={() => setHovered(w.id)}
              onMouseLeave={() => setHovered((h) => (h === w.id ? null : h))}
              className="bg-gray-900 border border-gray-800 rounded-xl p-4"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <h2 className="font-semibold text-gray-100">{w.title}</h2>
                  <p className="text-xs text-gray-500 mt-0.5">{w.description}</p>
                </div>
                {isEnabled ? (
                  <button
                    onClick={() => disable(w.id)}
                    className="flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-700 bg-gray-800 text-gray-400 hover:border-red-700 hover:text-red-400 transition-colors"
                  >
                    Remove
                  </button>
                ) : (
                  <button
                    onClick={() => enable(w.id)}
                    className="flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white transition-colors"
                  >
                    + Add
                  </button>
                )}
              </div>

              {/* Live preview */}
              <div className="mt-3 border-t border-gray-800 pt-3">
                <p className="text-xs text-gray-600 mb-2">
                  {hovered === w.id ? 'Preview' : (isEnabled ? 'On your dashboard' : 'Hover to preview')}
                </p>
                <div className="pointer-events-none select-none opacity-95">
                  <Component />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

> Note: the preview always renders the widget (so the user sees it whether hovering or not); the "Preview" label just reflects hover. This is simpler and more useful than hiding it until hover, while still satisfying "hovering shows what it will look like." Interaction is disabled via `pointer-events-none`.

- [ ] **Step 2: Register the route**

In `src/App.tsx`, add the import after the other page imports (near line 13):

```tsx
import AddWidgets from './pages/AddWidgets'
```

Then add the route inside the authed `<Routes>` block, after the `/dashboard` route (line 42):

```tsx
        <Route path="/widgets" element={<AddWidgets />} />
```

- [ ] **Step 3: Verify build + tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/pages/AddWidgets/index.tsx src/App.tsx
git commit -m "feat(widgets): Add Widgets screen with live previews at /widgets"
```

---

## Task 12: Full verification & sync to GitHub

**Files:** none (verification + push)

- [ ] **Step 1: Run the full test suite and type-check**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; every test passes.

- [ ] **Step 2: Manual verification in the running app**

Run: `npm run dev`
Verify each, in the Electron window:
- Dashboard shows a "My Widgets" zone with Water, Cardio, Sessions This Week, Weekly Volume; the old inline Water/Cardio cards are gone (not duplicated).
- Logging cardio in the widget updates the Energy Balance and Weekly Scorecard cards without a reload.
- "Rearrange" toggle (and press-and-hold on a widget) enters edit mode; dragging a widget onto another reorders them; the order survives a reload.
- The ✕ on a widget prompts "Are you sure you want to remove this widget?"; confirming removes it; it can be re-added from the Add Widgets page.
- "+ Add Widgets" opens `/widgets`; each entry previews the real widget; Add/Remove toggles reflect on the Dashboard.

- [ ] **Step 3: Sync to GitHub**

The feature branch is `feature/dashboard-widgets`. Merge to `master` and push (this satisfies the user's "sync it with the github repo" request):

```bash
git checkout master
git merge --no-ff feature/dashboard-widgets -m "feat: customizable dashboard widgets"
git push origin master
```

Expected: push succeeds; `origin/master` contains the widget feature.

---

## Self-Review Notes

- **Spec coverage:** widget set (Tasks 4–8), reorderable grid + rearrange toggle + long-press (Task 9), My Widgets zone below pinned cards (Task 10 Step 5), delete confirm (Task 9), Add Widgets screen + hover preview + re-enable (Task 11), localStorage persistence (Task 1), water/cardio moved not duplicated (Task 10), no-regression on cardio-consuming cards (Task 3 + Task 10 Step 2), tests (Tasks 1–3, 8), sync to GitHub (Task 12). All covered.
- **Type consistency:** `WidgetId` defined in `useWidgets.ts` and reused in `registry.tsx`; `CardioEntry` defined in `cardioStore.ts`; `reorder(from,to)`/`enable`/`disable` names consistent between hook, WidgetZone, and AddWidgets.
- **No placeholders:** every code step contains complete code; every command has expected output.
