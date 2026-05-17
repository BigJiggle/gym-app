# Design: Profile Cleanup, Dietary Restrictions UI, Division Clear, Show Cancellation Logic
**Date:** 2026-04-26

## Context

Five targeted fixes to the PrepCoach profile and show-management system. No new pages. Changes touch 7 files.

---

## 1. Remove Cultural Preference from Profile UI

**Problem:** `culture_pref` appears in Settings → Edit Profile but the field is hardcoded to `'any'` in all plan generation calls. Showing it is misleading.

**Fix:** Remove the `culture_pref` select from `src/pages/Settings/index.tsx` (Nutrition section, ~line 415). Remove from `editForm` state initialization. DB column stays — no migration needed. The plan engines already ignore it.

---

## 2. Clear Division When All Shows Removed

**Problem:** `syncPrimaryToNearest` clears `users.show_date` when no shows remain but does NOT clear `users.division`. The sidebar shows the stale division label ("Men's Physique") even after the user is off-season.

**Root cause:** The `else` branch of `syncPrimaryToNearest` only runs `UPDATE users SET show_date=NULL WHERE id=?` — `division` is not cleared.

**Fix (two locations):**
- `electron/ipc/showHandlers.ts` — `syncPrimaryToNearest` else branch: `UPDATE users SET show_date=NULL, division=NULL WHERE id=?`
- `electron/ipc/planHandlers.ts` — inline sync in `plan:startupRefresh` else branch: same two-column clear

**Result:** Sidebar shows goal label only ("Contest Prep — Cut") once off-season.

---

## 3. Dietary Restrictions Toggle UI

**Problem:** `users.dietary_restrictions` (JSON array) is stored in DB and used by the nutrition engine, but there is zero UI to add/remove restrictions after onboarding. Displayed read-only in the Diet page prefs summary.

**Fix — two UI locations:**

**A. Diet page prefs panel** (`src/pages/Diet/index.tsx`):
Add a "Dietary Restrictions" section above the food exclusions search. Show all 6 options as toggle chips:
`Dairy-free | No pork | No shellfish | Nut allergy | Gluten-free | Low FODMAP`
- Selected = brand colour highlight
- Click toggles membership in the array
- On change: `updateUser({ id, dietary_restrictions: newArray })` then `generateDietPlan(userId)` to rebuild meals

**B. Settings Edit Profile** (`src/pages/Settings/index.tsx`):
Replace the removed `culture_pref` slot in the Nutrition section with the same 6 toggle chips using `editForm.dietary_restrictions`. Saved when user clicks Save Profile.

---

## 4. Session Edit Tracking + Smart Show-Cancel Transition

### 4a. Detection: plan-level `user_modified` flag

**Schema migration v8** (`electron/database/schema.ts`):
```sql
ALTER TABLE training_plans ADD COLUMN user_modified INTEGER NOT NULL DEFAULT 0
```

**`plan:updateSession` handler** (`electron/ipc/planHandlers.ts`):
After saving exercises JSON, run:
```sql
UPDATE training_plans SET user_modified=1
WHERE id=(SELECT plan_id FROM training_sessions WHERE id=?)
```

### 4b. Transition logic on cancel/delete (no shows remaining)

Applied in two places:
1. **`shows:cancelShow` + `shows:delete`** handlers (`electron/ipc/showHandlers.ts`) — when `syncPrimaryToNearest` results in no shows
2. **`plan:startupRefresh`** (`electron/ipc/planHandlers.ts`) — when `showTransitioned && !newShowDate`

**Logic:**
```
Check training_plans.user_modified WHERE user_id = ?

IF user_modified = 0 (auto-generated, untouched):
  → Regenerate training in STRENGTH phase (off-season baseline)
  → Use Claude if API key present (passes recovery_notes) else rule-based
  → Set generated_at_weeks_out = NULL, user_modified = 0 (fresh auto plan)
  → Notification: "Show cancelled. Off-season strength training plan generated."

IF user_modified = 1 (user customised exercises):
  → Keep all existing sessions untouched
  → Update generated_at_weeks_out = NULL (marks as off-season context)
  → Notification: "Show cancelled. Your custom training plan has been kept."
```

**Diet always regenerates** to off-season macros (`weeks_out = undefined` → moderate deficit per `getPhaseAwareDeficit`). Dietary restrictions / food exclusions are preserved.

---

## Files Modified

| File | Section | Change |
|------|---------|--------|
| `electron/database/schema.ts` | MIGRATIONS | v8: `user_modified INTEGER` on training_plans |
| `electron/ipc/showHandlers.ts` | `syncPrimaryToNearest`, `shows:cancelShow`, `shows:delete` | Clear division=NULL; post-cancel plan transition |
| `electron/ipc/planHandlers.ts` | `plan:updateSession`, `plan:startupRefresh`, `plan:cancelShow` helper | Set user_modified=1 on edit; off-season transition logic |
| `src/pages/Settings/index.tsx` | Edit Profile Nutrition section | Remove culture_pref; add dietary restriction toggles |
| `src/pages/Diet/index.tsx` | Prefs panel | Add dietary restriction toggle chips |
| `src/components/Layout/NavSidebar.tsx` | No change | Already reads `user.division` — clears automatically once backend fixed |

---

## Verification

1. **Cultural pref removed:** Settings → Edit Profile → Nutrition section has no cultural preference dropdown
2. **Division cleared:** Add show → set Men's Physique → delete all shows → sidebar shows "Contest Prep — Cut" not "Men's Physique"
3. **Dietary restrictions toggle:** Diet → prefs panel → tap "Dairy-free" → chip highlights → meal plan regenerates without dairy → tap again → dairy returns
4. **Same in Settings:** Edit Profile → Nutrition → toggle restrictions → Save → diet regenerates
5. **Cancel unmodified plan:** Fresh plan → delete show → plan regenerates to strength phase → Dashboard notification shows
6. **Cancel modified plan:** Edit a session exercise → delete show → plan kept → Dashboard shows "custom plan kept" notification
