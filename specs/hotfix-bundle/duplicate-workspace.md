# Fix 1 — Duplicate workspace creation

**Status:** Investigated, root cause identified, fix applied.
**Files touched:** `src/App.tsx`
**Commit:** `fix: prevent duplicate workspace creation`

---

## Summary

Users occasionally see two identical workspaces appear after clicking Create.
Deleting one of them deletes both from the visible list. The cause is a race
between the `onSnapshot` listener on `users/{uid}/workspaces/` and the optimistic
local-state update inside `handleCreateWorkspace`.

## Investigation

The investigation covered the three axes the issue suggested:

### 1. Is the Create button disabled while `saving` is true?

Yes — `WorkspaceSettingsModal.tsx:386`:

```tsx
disabled={!name.trim() || !brandName.trim() || saving || isTeamMember || (!isScale && !isEdit)}
```

The button is disabled as soon as `setSaving(true)` fires inside the modal's
`handleSubmit` (`WorkspaceSettingsModal.tsx:113`). It re-enables only after
`onSave(...)` resolves or rejects (the `finally` block on line 132). A second
click cannot fire while the first request is in flight.

The `handleSubmit` callback itself is only bound to the button's `onClick`
(`WorkspaceSettingsModal.tsx:378`); it is not invoked by any effect, ref,
or other event handler. Double-submit at the UI layer is not possible.

### 2. Is there a race where the `onSnapshot` listener triggers a second create?

No — the bootstrap branch (`App.tsx:2706-2734`) is the only place in the
listener that calls `workspaceService.createWorkspace`, and it is guarded by
`bootstrapInFlightRef.current` and `wsList.length === 0`. After a successful
create, `wsList.length === 1`, so the bootstrap branch never fires again for
that workspace.

### 3. Is the modal being mounted twice?

No — the modal is conditionally mounted (`App.tsx:12556-12566`) only when
`showWorkspaceModal` is true. React.StrictMode (`src/main.tsx:18`) double-
invokes effects in development, but it does not double-invoke event handlers,
so `handleSubmit` fires once per click.

## Root cause — optimistic update races the snapshot

`handleCreateWorkspace` (`App.tsx:2784-2807`) does this:

```tsx
const result = await workspaceService.createWorkspace(data as any);
const workspaceId = (result.data as any)?.workspaceId;
if (workspaceId) {
  const created = { id: workspaceId, ...data, createdAt: Date.now() } as Workspace;
  setWorkspacesLocal(prev => [created, ...prev]);      // optimistic insert
  setActiveWorkspaceIdLocal(created.id);
}
```

In parallel, the live snapshot subscription on
`users/{uid}/workspaces/` (`App.tsx:2622-2755`) reacts to the new doc the
server just committed:

```tsx
(snap) => {
  const wsList = snap.docs.map(d => ({ id: d.id, ...d.data() } as Workspace))
    .filter(ws => ws.deletedAt == null);
  ...
  setWorkspacesLocal(wsList);                          // snapshot overwrite
  ...
}
```

The two `setWorkspacesLocal` calls race. Either order is possible:

| Order | Result |
|---|---|
| Snapshot first, then optimistic insert | `prev` is `[newDoc]`, optimistic insert prepends the same doc → `prev = [newDoc, newDoc]`. |
| Optimistic insert first, then snapshot | Snapshot overwrites `prev` with `[newDoc]` → single entry. |

When the duplicate lands, the visible list shows the same workspace twice
(identical name, identical id). Deleting either one calls
`handleDeleteWorkspace(ws.id)`, which fires `workspaceService.deleteWorkspace`,
which soft-deletes the server doc. The snapshot then reports a single
remaining workspace, `setWorkspacesLocal(wsList)` replaces the array, and
both visible rows vanish — matching the user's symptom "deleting one
deletes both."

The race window is small (a few hundred ms) but real. It depends on which
transport the Firestore SDK uses to deliver the snapshot vs. the callable
response. Both transports are async and their ordering is not guaranteed.

## Fix

Make the optimistic insert idempotent — skip the prepend if the workspace
is already in `prev`:

```tsx
setWorkspacesLocal(prev => {
  if (prev.some(w => w.id === workspaceId)) return prev;
  return [created, ...prev];
});
```

This preserves the responsive local update (the dropdown advances
immediately without waiting for the snapshot) while guaranteeing no
duplicate by id.

The default-workspace bootstrap (`App.tsx:2706-2734`) is unaffected: it
calls `setWorkspacesLocal([created])` (replace, not prepend), and the
snapshot listener uses the same `setWorkspacesLocal(wsList)` overwrite
pattern. Both replace the entire array, so the prepend race cannot
apply there.

`handleUpdateWorkspace` and `handleDeleteWorkspace` were reviewed and
are not affected — `update` uses `.map` and `delete` uses `.filter`,
neither of which can produce a duplicate.

## Verification

- The button is already disabled while saving (line 386 of the modal).
- The snapshot listener cannot trigger a second create (`bootstrapInFlightRef`
  + `wsList.length === 0` guard).
- The modal is mounted once.
- The optimistic insert is now idempotent by id.
