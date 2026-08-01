# Trace — plan-project limit banner for team members

**Branch**: `fix/issue-d-team-workspace-access`
**Date**: 2026-08-01
**Symptom**: A team member on an owner's **Scale** plan still sees the dismissible banner:
> "You've reached your plan-project limit. Delete old projects to save new ones."

The `saveProject` callable completes without error and Cloud Logging reports nothing. So the banner must be coming from the frontend.

**Headline**: The banner is driven by a client-side cap check inside the auto-save effect (`src/App.tsx:4237–4243`) that runs on the very first render where `user` is set — *before* the team-member's owner doc has been fetched. In that frame `userPlan` is still its initial value `'none'`, so `getSavedProjectLimit('none')` returns `0` and `projects.length (0) >= 0` is true. The effect calls `setProjectLimitReached(true)`, which **latches** the banner because the effect's dependency array does not include `userPlan` (or `teamResolution`), and there is no other code path that clears the flag back to `false` other than the dismiss button. The later owner-resolution update flips `userPlan` to `'scale'`, but no re-run is triggered, so the banner persists.

This is a classic "render-during-async-resolution latch" bug.

---

## 1. Where is the banner rendered?

**File**: `src/App.tsx`
**Line**: 7945–7962

```tsx
{phase === 'input' && projectLimitReached && (() => {
  const cap = getSavedProjectLimit(userPlan);
  const capLabel = Number.isFinite(cap) ? String(cap) : 'plan';
  return (
    <div className={...}>
      <i className="fa-solid fa-circle-info text-amber-400 mt-0.5"></i>
      <p className="flex-1 text-[11px] leading-relaxed text-amber-200/90 font-medium">
        {lang === 'ar'
          ? `وصلت إلى حد ${capLabel} مشاريع. احذف مشاريع قديمة لحفظ مشاريع جديدة.`
          : `You've reached your ${capLabel}-project limit. Delete old projects to save new ones.`}
      </p>
      <button onClick={() => setProjectLimitReached(false)} aria-label={lang === 'ar' ? 'إغلاق' : 'Dismiss'}
        className="text-amber-400/60 hover:text-amber-300 transition-colors shrink-0">
        <i className="fa-solid fa-xmark"></i>
      </button>
    </div>
  );
})()}
```

The label inside the banner is itself computed via `getSavedProjectLimit(userPlan)` (line 7946), so even the displayed number reflects whatever `userPlan` is at render time — for a Scale team member this would be `Infinity` (label `"plan"`), which is at least not visually alarming.

---

## 2. What state controls it?

A single boolean React state declared at **`src/App.tsx:1665`**:

```ts
const [projectLimitReached, setProjectLimitReached] = useState(false);
```

Comment above (lines 1662–1664) describes the intent:

> Non-blocking project-limit warning. Set when a new project is saved at/over the plan cap (auto-save still succeeds — the backend evicts the oldest draft). Shown as a dismissible banner in the saved-projects panel; never blocks generation, navigation, or auto-save.

It is read only at `src/App.tsx:7945` (the banner) and written from three places:

| Line | Trigger | Source |
|---|---|---|
| 4179 | `saveProjectFn` returns `{ overLimit: true }` | **Server** (`functions/src/savedProjects/projectQuota.ts`) |
| 4190 | Legacy `failed-precondition` / `QUOTA_EXCEEDED` error from the callable | Server (defensive) |
| 4241 | Client-side check `projects.length >= getSavedProjectLimit(userPlan)` for a new project | **Client** (the bug) |

The only place that resets the flag to `false` is the dismiss button at line 7956 — there is no effect, hook, or listener that ever re-evaluates and clears it. Confirmed by grepping `setProjectLimitReached(false)`: exactly **one** match, the dismiss button.

---

## 3. Where is the state set? Server response or client-side comparison?

Both. There are three set sites; two are server-driven, one is **purely client-side** — and that one is what fires for the team-member case.

### 3a. Server-driven paths (lines 4179, 4190)

These run inside `saveCurrentProject` (the auto-save callback) only after a successful (or failure-conditional) round-trip to the `saveProject` callable. The quota logic in `functions/src/savedProjects/projectQuota.ts:23–26` defines:

```ts
const limits = {
  none:   { savedProjectLimit: 0 },
  starter:{ savedProjectLimit: 10 },
  pro:    { savedProjectLimit: 30 },
  scale:  { savedProjectLimit: Infinity },
};
```

`projectQuota.ts:50–56` returns `{ overLimit: true, evictId: ... }` only when `current >= limits.savedProjectLimit` and the limit is finite. For a Scale team member the limit is `Infinity`, so the callable cannot return `overLimit: true` for them — which matches the user's observation that the server logs are clean.

### 3b. Client-side path (lines 4237–4243) — **THE BUG**

This is inside the auto-save effect that builds the current project snapshot and hands it to `autoSaveQueue`. The check is:

```ts
useEffect(() => {
  if (!user || !effectiveUidRef.current) return;
  if (projects.some((p: SavedProject) => p.isRenaming)) return;
  const uid = effectiveUidRef.current;
  if (!uid) return;

  // Client-side cap detection — surface a NON-BLOCKING warning, but never stop the auto-save.
  // The server allows the save (evicting the oldest draft to stay within the cap), so the user
  // is never blocked from working. The warning shows as a dismissible banner in the panel.
  const isNewProject = !projects.some((p: SavedProject) => p.id === currentProjectId);
  if (isNewProject) {
    const maxProjects = getSavedProjectLimit(userPlan);
    if (Number.isFinite(maxProjects) && projects.length >= maxProjects) {
      setProjectLimitReached(true);
    }
  }
  // ... build currentProject, call autoSaveQueue(currentProject)
}, [
  user, inputs, phase, tovText, conceptsText, selectedTov, selectedConcept,
  buildPlan, mockupHistory, historyIndex, resolvedUniverse, captionText,
  batchResults, batchCaptions, batchHookGroups, carouselSlides,
  currentProjectId, activeWorkspaceId, canUseWorkspaces, autoSaveQueue
]);
```

`getSavedProjectLimit` is defined at `src/planconfig.ts:251–254`:

```ts
export const getSavedProjectLimit = (plan: UserPlan): number => {
  if (plan === 'none') return 0;
  return PLANS[plan]?.savedProjectLimit ?? 0;
};
```

So when `userPlan === 'none'`, the comparison degenerates to `projects.length >= 0`, which is **always true**, and the banner gets set unconditionally.

---

## 4. What plan value is it reading?

### For a team member, is it the owner's plan or the member's own?

The `userPlan` state is **the owner's plan** for a team member. Confirmed at three sites:

1. **Existing-user login branch** — `src/App.tsx:1762–1782`:
   ```ts
   if (userData.isTeamMember && userData.teamOwnerUid) {
     setTeamOwnerUid(userData.teamOwnerUid);
     setTeamRole(userData.teamRole || 'viewer');
     const ownerRef = doc(db, 'users', userData.teamOwnerUid);
     const ownerSnap = await getDoc(ownerRef);
     if (ownerSnap.exists()) {
       const ownerData = ownerSnap.data();
       ...
       const effectivePlan = (ownerData.plan ?? 'none');
       setUserPlan(effectivePlan as UserPlan);    // ← owner's plan
       ...
     }
     setTeamResolution('resolved');
   }
   ```

2. **Claimed-member (first sign-in via `teamMemberships`) branch** — `src/App.tsx:1889–1917`: same pattern, reads `owData.plan` from the owner's doc.

3. **Live `onSnapshot` listener** — `src/App.tsx:1996–2019`:
   ```ts
   if (data.isTeamMember && data.teamOwnerUid) {
     ...
     const ownerRef = doc(db, 'users', data.teamOwnerUid);
     getDoc(ownerRef).then(ownerSnap => {
       if (ownerSnap.exists()) {
         const ow = ownerSnap.data();
         setUserCredits(ow.credits ?? 0);
         setUserPlan((ow.plan ?? 'none') as UserPlan);    // ← owner's plan
         ...
       }
     });
     setTeamResolution('resolved');
     return;
   }
   ```

So the **resolved** value of `userPlan` is correct: it reads the owner's `plan` field (`'scale'` here, which gives `savedProjectLimit: Infinity` per `src/planconfig.ts:198`).

**But** `userPlan` is initialized to the literal `'none'` at `src/App.tsx:2323`:

```ts
const [userPlan, setUserPlan] = useState<UserPlan>('none');
```

…and the owner's plan is only assigned *after* an awaited `getDoc`. So there is a real window in which `userPlan` reads `'none'` even though the team-member's resolved plan is `'scale'`. See §5.

---

## 5. Timing — does the check run before the owner's plan resolves?

**Yes.** This is the root cause.

### Render sequence for an existing team member logging in (lines 1759–1782)

```ts
if (userSnap.exists()) {
  // EXISTING USER — normal login
  const userData = userSnap.data();
  setUser(currentUser);                                    // ① Sync batch A

  if (userData.isTeamMember && userData.teamOwnerUid) {
    setTeamOwnerUid(userData.teamOwnerUid);                // ②
    setTeamRole(userData.teamRole || 'viewer');            // ③
    const ownerRef = doc(db, 'users', userData.teamOwnerUid);
    const ownerSnap = await getDoc(ownerRef);              // ④ ── ASYNC BREAK
    if (ownerSnap.exists()) {
      const ownerData = ownerSnap.data();
      setUserCredits(ownerData.credits ?? 0);              // ⑤ Sync batch B
      const effectivePlan = (ownerData.plan ?? 'none');
      setUserPlan(effectivePlan as UserPlan);              // ⑥
      ...
    }
    setTeamResolution('resolved');                         // ⑦
  }
  ...
}
```

**Batch A** (`setUser`, `setTeamOwnerUid`, `setTeamRole`) is synchronous, so React 19 auto-batches them. That commit produces **Render 1** with:

| State | Value in Render 1 |
|---|---|
| `user` | signed-in member |
| `teamOwnerUid` | owner's UID |
| `teamRole` | `'editor'` or `'viewer'` |
| `userPlan` | **`'none'`** (initial useState value) |
| `teamResolution` | `'pending'` (initial) |
| `effectiveUid` | `teamOwnerUid \|\| user?.uid` → **owner's UID** |
| `projects` | `[]` (Firestore load at line 4043 hasn't returned yet) |
| `currentProjectId` | `Date.now().toString()` (initial value, line 1666) |
| `phase` | `'input'` (initial) |

Because `user` is truthy and `teamOwnerUid` is set, the gate at line 4385 (`userPlan === 'none' && !teamOwnerUid`) is **bypassed** and the main app renders. The auto-save effect runs:

```ts
if (!user || !effectiveUidRef.current) return;            // passes (user set, effectiveUid = ownerUid)
if (projects.some((p) => p.isRenaming)) return;           // passes (projects=[])
const isNewProject = !projects.some(p => p.id === currentProjectId);  // projects=[], currentProjectId=initial → true
const maxProjects = getSavedProjectLimit(userPlan);       // getSavedProjectLimit('none') = 0
if (Number.isFinite(maxProjects) && projects.length >= maxProjects) {  // 0 >= 0 → true
  setProjectLimitReached(true);                            // ← LATCHES
}
```

**Batch B** (`setUserPlan`, `setUserCredits`, etc.) fires only after the awaited `getDoc`. That commits **Render 2** where `userPlan === 'scale'`. But the auto-save effect's dep array (line 4304) does **not** include `userPlan` (nor `teamResolution`), so the effect does **not** re-run. The flag stays latched.

### Why no re-evaluation ever clears it

Three independent reasons compound:

1. **No `userPlan` / `teamResolution` in the effect deps** (line 4304). When those values change, the effect does not re-run.
2. **No clearing branch inside the effect.** When the comparison evaluates to `false` (`projects.length < maxProjects`), the code simply does nothing — it never calls `setProjectLimitReached(false)`. The banner is monotonic-true once set.
3. **No external listener calls `setProjectLimitReached(false)`** — grep confirms the dismiss button at line 7956 is the only such site.

So the banner can only be cleared by the user pressing the dismiss button. That matches the user's report.

### Why this specifically affects team members

Owners (non-team) hit a different timing path: their `userDoc.plan` is read in the same sync block as `setUser` (line 1784–1786, no await between), so `userPlan` resolves in the *same* render commit as `user`. By the time the auto-save effect first runs, `userPlan` is already the owner's plan and `getSavedProjectLimit('starter')` / `'pro'` / `'scale'` is a sensible number — the check still fires (`isNewProject` is true on first render with empty `projects`), but the comparison is `0 >= 10/30/Infinity` which is `false`, so the latch does not engage.

For a team member, the `await getDoc(ownerRef)` introduces the intermediate render with `userPlan === 'none'`. That intermediate render is exactly where the latch fires.

### The single-render claim is also wrong for non-team users (corner case)

Strictly speaking, on a brand-new team member's **first** sign-in (the `teamMemberships` branch, lines 1878–1926), `setUser` is called *after* `setUserPlan`, so they avoid this race. But every subsequent sign-in (line 1759 fires `setUser` before the owner-doc `await`) hits the latch. The user reports the bug as persistent on a Scale team member — consistent with "every refresh re-latches it."

---

## 6. Confirmed: server side is not involved

The user noted that the `saveProject` callable logs nothing. Verifying from the codebase:

- `functions/src/savedProjects/projectQuota.ts:50` — `if (limits.savedProjectLimit === Infinity) return { overLimit: false, evictId: null };` — Scale's `savedProjectLimit` is `Infinity`, so the callable cannot return `overLimit: true` for a Scale owner or member.
- `functions/src/entitlements.ts:309` — same Infinity short-circuit on the entitlement side.
- The frontend's only consumer of `overLimit` (`src/App.tsx:4178–4180`) is therefore dead code for Scale accounts.

So the bug is **entirely** in the frontend client-side check at lines 4237–4243, with the latch mechanism (§5) preventing it from ever being cleared.

---

## Root cause (one sentence)

The auto-save effect at `src/App.tsx:4228–4304` calls `setProjectLimitReached(true)` based on `getSavedProjectLimit(userPlan)` against `projects.length`, and it runs on the **first** render where `user` is set — which for an existing team member occurs *before* the awaited owner-doc lookup flips `userPlan` from `'none'` to the owner's `'scale'` — yielding `0 >= 0`, latching the banner permanently because the effect's deps exclude `userPlan`/`teamResolution` and no other code path ever clears the flag.

---

## Suggested fix shape (not applied — diagnosis only)

A correct fix needs all three:

1. **Skip the client-side check until `teamResolution === 'resolved'`** (and/or until `userPlan !== 'none'`). For team members this means waiting for the awaited owner doc; for owners it means waiting for the user doc. This is the same gate the workspace write-effect uses (`src/App.tsx:2550`: `if (!user || !uid || !canUseWorkspaces || teamResolution !== 'resolved') return;`).
2. **Add a clearing branch** — if the resolved plan's limit is finite and `projects.length < maxProjects`, call `setProjectLimitReached(false)`. This makes the banner idempotent rather than sticky.
3. **(Optional, defensive) Re-evaluate the flag in a separate effect** that depends on `userPlan`, `teamResolution`, `projects.length`, and the dismissed-this-session ref so a manual dismiss survives a re-resolution.

The `overLimit` server response (line 4179) is unrelated for Scale team members and does not need to change.