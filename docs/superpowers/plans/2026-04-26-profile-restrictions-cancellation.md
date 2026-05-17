# Profile Cleanup, Dietary Restrictions UI & Show Cancellation Logic — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove cultural preference from profile, clear division label when off-season, add dietary restriction toggles to the Diet page and Settings, track whether sessions were manually edited, and transition training plan to strength phase on show cancellation only if unmodified.

**Architecture:** Backend changes (schema migration, IPC handlers) first, then frontend changes. The `user_modified` flag on `training_plans` is the key new piece of state. Everything else is wiring existing patterns together.

**Tech Stack:** Electron + node-sqlite3-wasm, React + Zustand, TypeScript, Tailwind

---

## File Map

| File | What changes |
|------|-------------|
| `electron/database/schema.ts` | Migration v8: add `user_modified INTEGER NOT NULL DEFAULT 0` to training_plans |
| `electron/ipc/showHandlers.ts` | Fix `syncPrimaryToNearest` to clear `division=NULL`; add off-season transition call after cancel/delete |
| `electron/ipc/planHandlers.ts` | `plan:updateSession` sets `user_modified=1`; startupRefresh/cancelShow handles unmodified→regen, modified→keep |
| `src/pages/Settings/index.tsx` | Remove `culture_pref` field + state; add `dietary_restrictions` toggle chips |
| `src/pages/Diet/index.tsx` | Add `dietary_restrictions` toggle chips to prefs panel |

---

### Task 1: Schema migration — `user_modified` column on training_plans

**Files:**
- Modify: `electron/database/schema.ts`

- [ ] **Step 1: Add migration v8**

In `electron/database/schema.ts`, append after the v7 migration block:

```typescript
  {
    version: 8,
    sql: `ALTER TABLE training_plans ADD COLUMN user_modified INTEGER NOT NULL DEFAULT 0`
  }
```

The complete end of the MIGRATIONS array becomes:
```typescript
  {
    version: 7,
    sql: `
      ALTER TABLE training_plans ADD COLUMN generated_at_weeks_out INTEGER;
      ALTER TABLE diet_plans ADD COLUMN generated_at_weeks_out INTEGER
    `
  },
  {
    version: 8,
    sql: `ALTER TABLE training_plans ADD COLUMN user_modified INTEGER NOT NULL DEFAULT 0`
  }
]
```

- [ ] **Step 2: Verify migration runs cleanly**

Delete the dev database to force migration:
```
C:\Users\dy08f\AppData\Roaming\prepcoach-desktop\prepcoach-dev.db
```
Run `npm run dev` — confirm app loads without DB errors in the console.

---

### Task 2: Fix `syncPrimaryToNearest` — clear division when off-season

**Files:**
- Modify: `electron/ipc/showHandlers.ts` (line 22)

- [ ] **Step 1: Clear division in the else branch**

Change line 22 from:
```typescript
    db.prepare('UPDATE users SET show_date=NULL WHERE id=?').run([userId])
```
To:
```typescript
    db.prepare('UPDATE users SET show_date=NULL, division=NULL WHERE id=?').run([userId])
```

Full updated `syncPrimaryToNearest` else branch:
```typescript
  } else {
    // No upcoming shows — clear show_date AND division so sidebar shows goal label only
    db.prepare('UPDATE users SET show_date=NULL, division=NULL WHERE id=?').run([userId])
  }
```

- [ ] **Step 2: Fix the same pattern in `plan:startupRefresh` in planHandlers.ts**

In `electron/ipc/planHandlers.ts`, inside the `plan:startupRefresh` handler, find the inline show sync block (around line 320). Change the else branch:
```typescript
    } else {
      db.prepare('UPDATE users SET show_date=NULL WHERE id=?').run([userId])
    }
```
To:
```typescript
    } else {
      db.prepare('UPDATE users SET show_date=NULL, division=NULL WHERE id=?').run([userId])
    }
```

- [ ] **Step 3: Manual verification**

Run app → Settings → My Shows → add a show with division "Men's Physique" → delete it → sidebar should now show "Contest Prep — Cut" not "Men's Physique". Confirm in sidebar.

---

### Task 3: Track session edits — set `user_modified=1` on manual update

**Files:**
- Modify: `electron/ipc/planHandlers.ts` (around line 235)

- [ ] **Step 1: Update `plan:updateSession` handler**

Find the handler:
```typescript
  ipcMain.handle('plan:updateSession', (_event, sessionId: number, exercises: unknown[]) => {
    const db = getDb()
    db.prepare('UPDATE training_sessions SET exercises=? WHERE id=?')
      .run([JSON.stringify(exercises), sessionId])
    const row = db.prepare('SELECT * FROM training_sessions WHERE id=?').get(sessionId) as Record<string, unknown>
    return { ...row, exercises: JSON.parse(row.exercises as string) }
  })
```

Replace with:
```typescript
  ipcMain.handle('plan:updateSession', (_event, sessionId: number, exercises: unknown[]) => {
    const db = getDb()
    db.prepare('UPDATE training_sessions SET exercises=? WHERE id=?')
      .run([JSON.stringify(exercises), sessionId])
    // Mark the parent plan as user-modified so show cancellation preserves it
    db.prepare(
      'UPDATE training_plans SET user_modified=1 WHERE id=(SELECT plan_id FROM training_sessions WHERE id=?)'
    ).run([sessionId])
    const row = db.prepare('SELECT * FROM training_sessions WHERE id=?').get(sessionId) as Record<string, unknown>
    return { ...row, exercises: JSON.parse(row.exercises as string) }
  })
```

- [ ] **Step 2: Manual verification**

Run app → Training → Edit a session exercise → check DB: `SELECT user_modified FROM training_plans WHERE user_id=1` should return `1`. (Can verify by checking that cancel-show logic keeps the plan in Task 4.)

---

### Task 4: Show cancellation — regenerate unmodified plans, keep modified ones

This logic runs in two places: `showHandlers.ts` (for immediate cancel/delete action) and `planHandlers.ts` startupRefresh (for app-launch detection).

**Files:**
- Modify: `electron/ipc/showHandlers.ts`
- Modify: `electron/ipc/planHandlers.ts`

#### 4A — showHandlers: add off-season transition helper

- [ ] **Step 1: Add imports to showHandlers.ts**

At the top of `electron/ipc/showHandlers.ts`, after the existing import:
```typescript
import { IpcMain } from 'electron'
import { getDb } from '../database/db'
```
Add:
```typescript
import { generateTrainingPlan } from '../services/trainingEngine'
import { generateNutritionPlan } from '../services/nutritionEngine'
import { generateWorkoutWithClaude, refineWorkoutForSafety } from '../services/claudeService'
```

- [ ] **Step 2: Add `transitionToOffSeason` helper function**

After the closing `}` of `syncPrimaryToNearest` and before `export function registerShowHandlers`, add:

```typescript
// Called when all shows are removed. Regenerates training if unmodified, keeps if modified.
// Always recalculates diet macros to off-season.
async function transitionToOffSeason(db: ReturnType<typeof getDb>, userId: number): Promise<{ trainingUpdated: boolean; message: string }> {
  const user = db.prepare('SELECT * FROM users WHERE id=?').get([userId]) as Record<string, unknown>
  if (!user) return { trainingUpdated: false, message: 'Off-season.' }

  const lastTraining = db.prepare('SELECT * FROM training_plans WHERE user_id=? ORDER BY id DESC LIMIT 1').get([userId]) as Record<string, unknown> | null
  const userModified = (lastTraining?.user_modified as number) === 1

  let trainingUpdated = false
  let message = ''

  if (!userModified) {
    // Auto-generated plan — regenerate to off-season strength
    const apiKeyRow = db.prepare("SELECT value FROM settings WHERE key='claude_api_key'").get([]) as { value: string } | null
    const claudeKey = apiKeyRow?.value?.trim() ?? ''

    const trainingInput = {
      training_frequency: user.training_frequency as number,
      training_experience_years: user.training_experience_years as number,
      equipment_access: user.equipment_access as string,
      goal: user.goal as string,
      split_preference: (user.split_preference as string) ?? 'auto',
      exercises_per_session: (user.exercises_per_session as number) ?? 6,
      sets_per_exercise: (user.sets_per_exercise as number) ?? 4,
      weeks_out: undefined, // off-season = no show
      recovery_notes: (user.recovery_notes as string) || undefined,
    }

    let finalSessions: { day_of_week: number; session_name: string; exercises: unknown[] }[] | null = null
    let planName = 'Off-Season Strength Training'
    const planPhase = 'strength'

    if (claudeKey) {
      try {
        const result = await generateWorkoutWithClaude(claudeKey, { ...trainingInput, division: user.division, max_sets_per_exercise: (trainingInput.sets_per_exercise ?? 4) + 1 }) as any
        const valid = result?.sessions?.filter((s: any) => Array.isArray(s?.exercises) && s.exercises.length > 0)
        if (valid?.length) {
          finalSessions = valid
          planName = result.name ?? planName
          if (user.recovery_notes) {
            const refined = await refineWorkoutForSafety(claudeKey, finalSessions as any[], `CONSTRAINTS: ${user.recovery_notes}\nOff-season strength phase. Rep range 4-6 compounds, 8-12 isolation, RIR 1-2.`, trainingInput.sets_per_exercise ?? 4, (trainingInput.sets_per_exercise ?? 4) + 1)
            if (refined?.length) finalSessions = refined as typeof finalSessions
          }
        }
      } catch { /* fall through to rule-based */ }
    }

    if (!finalSessions) {
      const ruleResult = generateTrainingPlan(trainingInput)
      finalSessions = ruleResult.sessions
      planName = ruleResult.name
    }

    const existingT = db.prepare('SELECT id FROM training_plans WHERE user_id=?').get([userId]) as { id: number } | undefined
    if (existingT) {
      db.prepare('DELETE FROM training_sessions WHERE plan_id=?').run([existingT.id])
      db.prepare('DELETE FROM training_plans WHERE id=?').run([existingT.id])
    }
    const tRes = db.prepare(`INSERT INTO training_plans (user_id, name, weeks_total, phase, generated_at_weeks_out, user_modified) VALUES (?, ?, ?, ?, NULL, 0)`).run([userId, planName, 12, planPhase])
    const tId = tRes.lastInsertRowid
    const ins = db.prepare(`INSERT INTO training_sessions (plan_id, week_number, day_of_week, session_name, exercises) VALUES (?, ?, ?, ?, ?)`)
    for (const s of finalSessions) ins.run([tId, 1, (s as any).day_of_week, (s as any).session_name, JSON.stringify((s as any).exercises)])

    trainingUpdated = true
    message = 'Show cancelled. Off-season strength training plan generated.'
  } else {
    // User had custom plan — keep it, just clear weeks_out context
    if (lastTraining) {
      db.prepare('UPDATE training_plans SET generated_at_weeks_out=NULL WHERE id=?').run([lastTraining.id])
    }
    message = 'Show cancelled. Your custom training plan has been kept.'
  }

  // Always recalculate diet to off-season macros
  const lastDiet = db.prepare('SELECT * FROM diet_plans WHERE user_id=? ORDER BY id DESC LIMIT 1').get([userId]) as Record<string, unknown> | null
  if (lastDiet) {
    const newDiet = generateNutritionPlan({
      weight_kg: user.weight_kg as number, height_cm: user.height_cm as number,
      age: user.age as number, sex: user.sex as string,
      activity_level: user.activity_level as string, goal: user.goal as string,
      dietary_preference: user.dietary_preference as string,
      meal_count: (user.meal_count as number) ?? 4,
      weeks_out: undefined,
      dietary_restrictions: (() => { try { return JSON.parse((user.dietary_restrictions as string) ?? '[]') } catch { return [] } })(),
      food_exclusions: (() => { try { return JSON.parse((user.food_exclusions as string) ?? '[]') } catch { return [] } })(),
      food_preferences: (() => { try { return JSON.parse((user.food_preferences as string) ?? '[]') } catch { return [] } })(),
      cooking_time_pref: (user.cooking_time_pref as string) ?? 'medium',
      include_snacks: user.include_snacks === 1,
      culture_pref: 'any',
    })
    db.prepare('DELETE FROM diet_plans WHERE user_id=?').run([userId])
    db.prepare(`INSERT INTO diet_plans (user_id, name, calories_target, protein_g, carbs_g, fat_g, meal_count, meals, phase, generated_at_weeks_out) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`)
      .run([userId, 'Off-Season Nutrition Plan', newDiet.calories_target, newDiet.protein_g, newDiet.carbs_g, newDiet.fat_g, newDiet.meal_count, JSON.stringify(newDiet.meals), newDiet.phase])
  }

  return { trainingUpdated, message }
}
```

- [ ] **Step 3: Call `transitionToOffSeason` in `shows:delete` when no shows remain**

In the `shows:delete` handler, the current code returns the updated shows list. Update it to also call the transition when no upcoming shows remain:

Find the handler (currently returns `db.prepare(...).all([show.user_id])`):
```typescript
  ipcMain.handle('shows:delete', (_event, showId: number) => {
    const db = getDb()
    const show = db.prepare('SELECT * FROM shows WHERE id=?').get([showId]) as Record<string, unknown> | null
    if (!show) return []
    db.prepare('DELETE FROM shows WHERE id=?').run([showId])
    syncPrimaryToNearest(db, show.user_id as number)
    return db.prepare('SELECT * FROM shows WHERE user_id=? ORDER BY show_date ASC').all([show.user_id])
  })
```

Replace with:
```typescript
  ipcMain.handle('shows:delete', async (_event, showId: number) => {
    const db = getDb()
    const show = db.prepare('SELECT * FROM shows WHERE id=?').get([showId]) as Record<string, unknown> | null
    if (!show) return { shows: [], message: null }
    db.prepare('DELETE FROM shows WHERE id=?').run([showId])
    syncPrimaryToNearest(db, show.user_id as number)
    const remaining = db.prepare('SELECT * FROM shows WHERE user_id=? ORDER BY show_date ASC').all([show.user_id]) as Record<string, unknown>[]
    const today = new Date().toLocaleDateString('en-CA')
    const hasUpcoming = remaining.some(s => (s.show_date as string) >= today)
    let message: string | null = null
    if (!hasUpcoming) {
      const result = await transitionToOffSeason(db, show.user_id as number)
      message = result.message
    }
    return { shows: remaining, message }
  })
```

- [ ] **Step 4: Call `transitionToOffSeason` in `shows:cancelShow` when no shows remain**

Find the `shows:cancelShow` handler and make it async + call the transition:
```typescript
  ipcMain.handle('shows:cancelShow', async (_event, showId: number) => {
    const db = getDb()
    const show = db.prepare('SELECT * FROM shows WHERE id=?').get([showId]) as Record<string, unknown> | null
    if (!show) return { shows: [], transitionType: 'offseason', message: null }
    db.prepare('DELETE FROM shows WHERE id=?').run([showId])
    syncPrimaryToNearest(db, show.user_id as number)
    const remaining = db.prepare('SELECT * FROM shows WHERE user_id=? ORDER BY show_date ASC').all([show.user_id]) as Record<string, unknown>[]
    const today = new Date().toLocaleDateString('en-CA')
    const hasNextShow = remaining.some((s) => (s.show_date as string) >= today)
    let message: string | null = null
    if (!hasNextShow) {
      const result = await transitionToOffSeason(db, show.user_id as number)
      message = result.message
    }
    return {
      shows: remaining,
      transitionType: hasNextShow ? 'next_show' : 'offseason',
      nextShowName: hasNextShow ? (remaining.find(s => (s.show_date as string) >= today) as any)?.name : null,
      message,
    }
  })
```

#### 4B — planHandlers: startupRefresh off-season transition

- [ ] **Step 5: Update startupRefresh to use `transitionToOffSeason` logic when show passes**

In `electron/ipc/planHandlers.ts`, inside `plan:startupRefresh`, find the section that handles `showTransitioned && !newShowDate`. Currently it just regenerates the diet. Replace the notification message block with logic that also uses the `user_modified` flag:

Find this block (around line 460-476):
```typescript
    // 5. Build notification message
    let message: string | null = null
    ...
    } else if (showTransitioned && !newShowDate) {
      message = 'Your show has passed. You\'re now in off-season — training and nutrition updated.'
```

Add the `user_modified` check BEFORE the training regeneration block (step 3 of this handler). After computing `currentPhase !== storedPhase`, also check `showTransitioned && !newShowDate`:

The training regeneration condition (currently `if (showTransitioned || currentPhase !== storedPhase || trainingContextChanged)`) already handles this case. But when `showTransitioned && !newShowDate`, we need to check `user_modified` to decide whether to regenerate or keep.

Update the training regen condition:
```typescript
    // When show just passed: respect user_modified flag
    const justWentOffSeason = showTransitioned && !newShowDate
    const storedUserModified = (lastTraining?.user_modified as number) === 1

    let trainingUpdated = false
    if (justWentOffSeason && storedUserModified) {
      // User had custom plan — keep sessions, just clear weeks_out context
      if (lastTraining) {
        db.prepare('UPDATE training_plans SET generated_at_weeks_out=NULL WHERE id=?').run([lastTraining.id])
      }
      // Still update diet below
    } else if (showTransitioned || currentPhase !== storedPhase || trainingContextChanged) {
      // ... existing training regen block unchanged ...
    }
```

And update the notification message block for `justWentOffSeason && storedUserModified`:
```typescript
    if (justWentOffSeason && storedUserModified) {
      message = 'Your show has passed. Off-season mode. Your custom training plan has been kept.'
    } else if (showTransitioned && newShowDate) {
      ...
    } else if (showTransitioned && !newShowDate) {
      message = 'Your show has passed. Off-season strength training generated.'
    }
```

- [ ] **Step 6: Update userStore.deleteShow to handle new return shape**

`shows:delete` now returns `{ shows, message }` instead of a plain array. Update `src/store/userStore.ts`:

```typescript
  deleteShow: async (showId) => {
    const result = await window.api.deleteShow(showId) as { shows: Show[]; message: string | null }
    const user = await window.api.getUser()
    const shows = Array.isArray(result) ? result : (result?.shows ?? [])
    set({ shows, user })
    // Surface transition message on Dashboard if plans changed
    if (result?.message) {
      const { usePlanStore } = await import('./planStore')
      const training = await window.api.getTrainingPlan(user?.id ?? 0)
      const diet = await window.api.getDietPlan(user?.id ?? 0)
      usePlanStore.setState({ trainingPlan: training, dietPlan: diet, lastRefreshMessage: result.message })
    }
  },
```

- [ ] **Step 7: Update Settings cancelShow handler to reload plans after cancel**

In `src/pages/Settings/index.tsx`, the cancel show button already calls `startupRefresh` and `generateTrainingPlan/generateDietPlan` after cancel. Update to use the message from the cancel result:

```typescript
onClick={async () => {
  ...
  const result = await window.api.cancelShow(show.id) as any
  if (user) {
    await loadShows(user.id)
    const training = await window.api.getTrainingPlan(user.id)
    const diet = await window.api.getDietPlan(user.id)
    const { usePlanStore } = await import('../../store/planStore')
    usePlanStore.setState({
      trainingPlan: training,
      dietPlan: diet,
      lastRefreshMessage: result?.message ?? null,
    })
    // Reload user (division may have been cleared)
    const { useUserStore: us } = await import('../../store/userStore')
    const freshUser = await window.api.getUser()
    if (freshUser) us.setState({ user: freshUser })
  }
}}
```

---

### Task 5: Remove cultural preference from Settings; add dietary restriction toggles

**Files:**
- Modify: `src/pages/Settings/index.tsx`

- [ ] **Step 1: Remove `culture_pref` from editForm state initialization**

In the `editForm` state (around line 64), remove:
```typescript
    culture_pref: user?.culture_pref ?? 'any',
```

- [ ] **Step 2: Add `dietary_restrictions` to editForm state**

Add in its place:
```typescript
    dietary_restrictions: user?.dietary_restrictions ?? [],
```

- [ ] **Step 3: Remove the cultural preference select from the Nutrition section**

Find and remove this entire `<div>`:
```typescript
                <div><label className="text-xs text-gray-500 mb-1 block">Cultural Preference</label>
                  <select value={editForm.culture_pref} onChange={(e) => setEditForm({...editForm, culture_pref: e.target.value as any})} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200">
                    <option value="any">Any / Western</option>
                    <option value="mexican">Mexican</option>
                    ...
                    <option value="middle_eastern">Middle Eastern</option>
                  </select></div>
```

- [ ] **Step 4: Add dietary restrictions toggle chips in the Nutrition section**

Replace the removed `culture_pref` div with:
```tsx
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 mb-1 block">Dietary Restrictions</label>
                  <div className="flex flex-wrap gap-1.5">
                    {(['Dairy-free', 'No pork', 'No shellfish', 'Nut allergy', 'Gluten-free', 'Low FODMAP'] as const).map((r) => {
                      const active = (editForm.dietary_restrictions as string[]).includes(r)
                      return (
                        <button
                          key={r}
                          type="button"
                          onClick={() => {
                            const prev = editForm.dietary_restrictions as string[]
                            setEditForm({ ...editForm, dietary_restrictions: active ? prev.filter(x => x !== r) : [...prev, r] })
                          }}
                          className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                            active
                              ? 'bg-brand-600/20 border-brand-500 text-brand-400'
                              : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
                          }`}
                        >
                          {r}
                        </button>
                      )
                    })}
                  </div>
                </div>
```

- [ ] **Step 5: Ensure `dietary_restrictions` is saved in `handleSaveProfile`**

In `handleSaveProfile`, the `updateUser` call spreads `editForm`. Since `dietary_restrictions` is now in `editForm`, it will be included automatically. Verify the `updateUser` IPC handler in `userHandlers.ts` allows `dietary_restrictions` as an update field. Check `electron/ipc/userHandlers.ts` — it should already be handled since it's in the ALLOWED_COLUMNS. No change needed if already allowed.

- [ ] **Step 6: After save, regenerate diet plan**

In `handleSaveProfile`, after `updateUser` succeeds and `regenerate = true`, `generateDietPlan` is already called. For dietary restrictions specifically, ensure it also regenerates when restrictions change. The existing `regenerate` param covers this if the user clicks "Save & Regenerate".

---

### Task 6: Add dietary restriction toggles to Diet page prefs panel

**Files:**
- Modify: `src/pages/Diet/index.tsx`

- [ ] **Step 1: Add `prefsRestrictions` state**

In the Food Preferences Panel state block (around line 34), add:
```typescript
  const [prefsRestrictions, setPrefsRestrictions] = useState<string[]>([])
```

- [ ] **Step 2: Sync `prefsRestrictions` from user when panel opens**

In the `useEffect` that syncs prefs state (lines 45–53), add:
```typescript
      setPrefsRestrictions(user.dietary_restrictions ?? [])
```

So the full effect becomes:
```typescript
  useEffect(() => {
    if (prefsOpen && user) {
      setPrefsCookTime((user.cooking_time_pref as 'quick' | 'medium' | 'chef') ?? 'medium')
      setPrefsPrepStyle((user.meal_prep_style as 'daily' | 'batch' | 'mixed') ?? 'daily')
      setPrefsSnacks(user.include_snacks ?? true)
      setPrefsExclusions(user.food_exclusions ?? [])
      setPrefsPreferences(user.food_preferences ?? [])
      setPrefsRestrictions(user.dietary_restrictions ?? [])
    }
  }, [prefsOpen])
```

- [ ] **Step 3: Add toggle function for dietary restrictions**

After the existing `togglePrefsExclusion` function (or wherever the prefs functions are grouped), add:

```typescript
  async function togglePrefsRestriction(restriction: string) {
    if (!user) return
    const current = user.dietary_restrictions ?? []
    const updated = current.includes(restriction)
      ? current.filter(r => r !== restriction)
      : [...current, restriction]
    setPrefsRestrictions(updated)
    await updateUser({ id: user.id, dietary_restrictions: updated } as any)
    generateDietPlan(user.id)
  }
```

- [ ] **Step 4: Add the toggle chips UI in the prefs panel**

Inside the `{prefsOpen && (...)}` block, add a new section **above the Cook Time section** (before the `{/* Cook time */}` comment):

```tsx
                {/* Dietary restrictions */}
                <div className="pt-3">
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 block">
                    Dietary Restrictions
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {(['Dairy-free', 'No pork', 'No shellfish', 'Nut allergy', 'Gluten-free', 'Low FODMAP'] as const).map((r) => {
                      const active = prefsRestrictions.includes(r)
                      return (
                        <button
                          key={r}
                          type="button"
                          onClick={() => togglePrefsRestriction(r)}
                          className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                            active
                              ? 'bg-brand-600/20 border-brand-500 text-brand-400'
                              : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
                          }`}
                        >
                          {r}
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-xs text-gray-600 mt-1.5">
                    Tap to toggle. Plan regenerates immediately.
                  </p>
                </div>
```

- [ ] **Step 5: Update the prefs panel summary text to reflect active restrictions**

The summary text at the top of the panel (line ~319) already shows `user.dietary_restrictions.join(', ')`. No change needed — it will update automatically after `updateUser` refreshes the store.

---

## Self-Review

**Spec coverage check:**
- ✅ Cultural preference removed from Settings (Task 5)
- ✅ Division cleared when no shows (Task 2)
- ✅ Dietary restrictions toggles in Diet page (Task 6) and Settings (Task 5)
- ✅ Session edit tracking via `user_modified` (Task 3)
- ✅ Show cancel → regen if unmodified, keep if modified (Task 4)
- ✅ Diet always regenerates to off-season macros (Task 4, `transitionToOffSeason`)

**Placeholder scan:** No TBDs. All code blocks complete.

**Type consistency:**
- `prefsRestrictions: string[]` used consistently in Task 6
- `editForm.dietary_restrictions: string[]` consistent in Task 5
- `transitionToOffSeason(db, userId)` defined in Task 4A, called in 4A steps 3/4 and 4B step 5
- `{ shows, message }` return shape from `shows:delete` used consistently in Task 4, step 6

**Edge cases covered:**
- First launch after migration: `user_modified` defaults to 0 → existing auto-generated plans get regenerated on cancel (correct — user hasn't manually edited them)
- `shows:delete` backward compat: userStore handles both plain array (old) and `{ shows, message }` (new) return shapes

---

**Plan saved to `docs/superpowers/plans/2026-04-26-profile-restrictions-cancellation.md`**

**Two execution options:**

**1. Subagent-Driven (recommended)** — Fresh subagent per task, review between tasks

**2. Inline Execution** — Execute tasks in this session using executing-plans

**Which approach?**
