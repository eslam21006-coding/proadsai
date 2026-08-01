# Fix 3 — ISSUE-A: Avatar bleed across workspaces

**Status:** Investigated, fix is small enough to ship as a hotfix. Applied.
**Files touched:** `src/components/InputForm.tsx`, `src/App.tsx`
**Commit:** `fix(issue-a): scope avatars to workspace`

---

## Summary

`buildAvatarPayload` does not include `workspaceId`, so every avatar saved
from the input form is written to the flat collection `users/{uid}/avatars/`
with no workspace attribution. The client-side filter that derives the
"avatars visible in workspace X" list at `src/App.tsx:2849-2851` then uses
`a.workspaceId || defaultWsId`, so any avatar without `workspaceId` is
attributed to the default workspace regardless of which workspace the user
was on when they saved it. The result is that avatars leak between
workspaces.

---

## Investigation

### Where is `buildAvatarPayload` defined?

`src/components/InputForm.tsx:600-701`. The function builds the avatar
payload from the current form inputs. Three call sites in the same file
(line 859, 866, 876) feed the payload to `onSaveAvatar` /
`onUpdateAvatar`. The returned object does **not** include `workspaceId`.

`activeWorkspace` is already a prop on `InputForm` (`src/components/InputForm.tsx:54`,
declared at line 324). The active workspace id is accessible inside the
component via `activeWorkspace?.id`.

### Where are avatars saved in Firestore?

There is **no backend Cloud Function** for avatar save. Avatars are
written by the client directly via `addDoc`:

```tsx
// src/App.tsx:2129
const avatarsRef = collection(db, 'users', uid, 'avatars');
const docRef = await addDoc(avatarsRef, { ...cleanAvatar, createdAt: Date.now() });
```

The collection path is `users/{uid}/avatars/` — flat, with no workspace
subcollection. The doc body comes straight from `buildAvatarPayload`
(stripped of undefined values).

`handleUpdateAvatar` (`src/App.tsx:2154-2166`) does the same via `setDoc`.

### Where are avatars loaded? Do they filter by workspace?

Loading is also client-side:

```tsx
// src/App.tsx:2097
const avatarsRef = collection(db, 'users', uid, 'avatars');
const q = query(avatarsRef, orderBy('createdAt', 'desc'));
const snap = await getDocs(q);
setAvatars(snap.docs.map(d => ({ id: d.id, ...d.data() } as AudienceAvatar)));
```

All avatars for the effective uid are pulled into client memory at once,
regardless of workspace.

The visibility filter is then applied at `src/App.tsx:2849-2851`:

```tsx
const filteredAvatars = canUseWorkspaces && activeWorkspaceId
  ? avatars.filter(a => (a.workspaceId || defaultWsId) === activeWorkspaceId)
  : avatars;
```

`AudienceAvatar.workspaceId` is **optional** in `src/types.ts:475`. The
filter's `(a.workspaceId || defaultWsId)` is a fallback that treats any
avatar without `workspaceId` as belonging to the default workspace.

### Symptom trace

1. User is in **workspace B** (not the default).
2. User saves an avatar from the input form.
3. `buildAvatarPayload` omits `workspaceId`. The avatar is written to
   `users/{uid}/avatars/{avatarId}` with no workspace attribution.
4. The filter at line 2849 evaluates `(undefined || defaultWsId) === B's id`
   → false → the avatar is hidden in workspace B.
5. User switches to **workspace A** (the default). The filter evaluates
   `(undefined || defaultWsId) === A's id` → true → the avatar now appears
   in workspace A.

So an avatar saved while in workspace B leaks to the default workspace A.
The bleed is real but one-directional — the default workspace sees every
avatar regardless of which workspace it was saved in, while non-default
workspaces see none of those orphaned avatars.

### Security rules

`firestore.rules:44-50` controls read/write on `users/{uid}/avatars/{avatarId}`.
It does **not** enforce `workspaceId` on writes, and there is no workspace-
scoped avatar collection in the rules. The bug is purely a client-side
visibility issue — there is no backend data leak.

---

## Why this is not bigger than a hotfix

The two architectural options to fix the bleed are:

1. **Move to nested collection `users/{uid}/workspaces/{workspaceId}/avatars/`**.
   This would change the Firestore schema, require updating addDoc/setDoc/
   deleteDoc/getDocs call sites, update the security rules, and likely need
   a data migration for existing avatars.

2. **Tag avatars with a `workspaceId` field and filter on it client-side.**
   This is a 2-line change in `buildAvatarPayload` plus a defensive write in
   `handleSaveAvatar` / `handleUpdateAvatar`. Existing avatars without
   `workspaceId` continue to be visible in the default workspace via the
   existing `(a.workspaceId || defaultWsId)` fallback.

Option 2 is the right hotfix — minimal blast radius, no schema change, no
rules change, no migration. The structural option 1 can be tackled
separately if/when the workspace product grows.

---

## Fix

### Frontend — `src/components/InputForm.tsx`

Add `workspaceId: activeWorkspace?.id ?? null` to `buildAvatarPayload`.
The component already receives `activeWorkspace` as a prop and uses
`activeWorkspace?.id` in adjacent code (line 596).

### Frontend (defensive) — `src/App.tsx`

`handleSaveAvatar` and `handleUpdateAvatar` already strip undefined values.
The defensive layer coerces `workspaceId` from the active workspace before
the write so any caller (e.g. future bulk import, a script, a test) is
forced through the same scoping without depending on the payload source.

The existing client-side filter `(a.workspaceId || defaultWsId) ===
activeWorkspaceId` is left in place — it is the migration bridge for
existing avatars that pre-date the fix.

---

## Verification

- New avatars carry `workspaceId = activeWorkspace.id`.
- They appear in the active workspace's avatar list and are hidden from
  other workspaces.
- Existing avatars without `workspaceId` still appear in the default
  workspace via the fallback — no data is hidden by the change.
- The Firestore schema and security rules are unchanged.
