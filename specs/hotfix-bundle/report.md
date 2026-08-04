# Hotfix Bundle — Combined Report

**Branch:** `main`
**Date:** 2026-08-01
**Total commits:** 3 new (Fixes 1, 2, 3); Fixes 4 and 5 verified already
present.
**Build status:** root (`npm run build`) green; `functions/` (`npm run build`)
green.
**Deploy status:** NOT deployed (per instructions).

| # | Fix | Commit | Status |
|---|---|---|---|
| 1 | Duplicate workspace creation | `d5d2ac4` | Done |
| 2 | Style switch workspace dialog | `b4330a9` | Done |
| 3 | ISSUE-A — Avatar bleed | `00d1233` | Done |
| 4 | Remove debug console.log | — | N/A (debug log not present) |
| 5 | Meta account picker dismiss latch | — | Already shipped in `2c45fb3` |

---

## Fix 1 — Duplicate workspace creation

**Files:** `src/App.tsx`, `specs/hotfix-bundle/duplicate-workspace.md`

### Investigation summary

| Axis | Result |
|---|---|
| Create button disabled while `saving` is true | Yes — `WorkspaceSettingsModal.tsx:386`. |
| Snapshot listener triggering a second create | No — bootstrap branch is guarded by `bootstrapInFlightRef` and `wsList.length === 0`. |
| Modal mounted twice | No — `App.tsx:12556-12566` conditionally mounts. |

### Root cause

`handleCreateWorkspace` did `setWorkspacesLocal(prev => [created, ...prev])`
unconditionally after the callable resolved. The live `onSnapshot` listener
on `users/{uid}/workspaces/` writes `setWorkspacesLocal(wsList)` from a
separate Firestore streaming transport. When the snapshot fires before
the callable response resolves, the optimistic insert prepends the same id
a second time, producing two visible rows with identical ids.

Deleting either one calls `handleDeleteWorkspace(ws.id)` → soft-delete on
the server → snapshot reports one less doc → `setWorkspacesLocal(wsList)`
collapses both rows. The user's "deleting one deletes both" symptom.

### Fix

Make the optimistic insert idempotent by id:

```tsx
setWorkspacesLocal(prev =>
  prev.some(w => w.id === workspaceId) ? prev : [created, ...prev]);
```

The snapshot listener remains the source of truth; the optimistic update
is purely a UI-latency optimisation. `handleUpdateWorkspace` and
`handleDeleteWorkspace` were reviewed and are unaffected.

Findings: `specs/hotfix-bundle/duplicate-workspace.md`.

---

## Fix 2 — Style switch workspace dialog

**Files:** `src/components/WorkspaceSwitcher.tsx`, `src/i18n.tsx`

The Save & Switch / Discard & Switch / Cancel guard dialog was functional
but visually off-brand — flat panel, no header chrome, no close button.

Restyled to match the rest of the modal vocabulary
(`MetaAccountPickerModal`, `WorkspaceSettingsModal`):

- **Header:** blue-tinted gradient (`from-blue-900/20`), `border-b`,
  eyebrow label ("Workspace switch" / "تبديل مساحة العمل") with a shuffle
  icon, explicit close (×) button, then the title and body.
- **Footer:** neutral `border-t`, the three actions in a single horizontal
  row (Save primary blue, Discard neutral, Cancel ghost).
- **Wrapper:** `p-4` viewport padding so the dialog respects narrow
  screens, plus `onClick={e => e.stopPropagation()}` on the panel so
  backdrop clicks do not leak inside.

Added i18n key `workspace.switch_guard.eyebrow` in EN and AR.

---

## Fix 3 — ISSUE-A: Avatar bleed across workspaces

**Files:** `src/components/InputForm.tsx`, `src/App.tsx`,
`specs/hotfix-bundle/avatar-bleed.md`

### Investigation summary

| Question | Answer |
|---|---|
| Where is `buildAvatarPayload` defined? | `src/components/InputForm.tsx:600-701`. No `workspaceId` field. |
| Where are avatars saved in Firestore? | Client-side `addDoc` at `src/App.tsx:2129` into flat collection `users/{uid}/avatars/`. No backend Cloud Function for avatars. |
| Where are avatars loaded? Do they filter by workspace? | `src/App.tsx:2097` reads every avatar for the effective uid. Filter at `src/App.tsx:2849-2851` uses `(a.workspaceId \|\| defaultWsId) === activeWorkspaceId` — un-tagged avatars are attributed to the default workspace. |

### Symptom

An avatar saved while in a non-default workspace has no `workspaceId`
and is invisible there; when the user switches to the default workspace,
the same avatar appears (because the fallback treats it as default-owned).
Avatars leak one-directional from non-default workspaces into the default.

### Fix scope

The two architectural options were:

1. Move to nested collection `users/{uid}/workspaces/{workspaceId}/avatars/`
   (schema change, rules change, migration).
2. Tag avatars with `workspaceId` and filter on it client-side
   (2-line change in `buildAvatarPayload`, defensive write in
   `handleSaveAvatar` / `handleUpdateAvatar`).

Option 2 is the right hotfix — minimal blast radius, no schema change,
no rules change, no migration. Existing avatars without `workspaceId`
remain visible in the default workspace via the existing fallback.

### Fix

- `buildAvatarPayload` now stamps `workspaceId: activeWorkspace?.id`
  (undefined when no active workspace — matches the optional
  `workspaceId?: string` shape on `AudienceAvatar`).
- `handleSaveAvatar` and `handleUpdateAvatar` defensively coerce
  `workspaceId` from `activeWorkspaceId` at the write layer
  (`cleanAvatar.workspaceId == null && activeWorkspaceId`) so any future
  caller that omits the field is still scoped correctly.

Findings: `specs/hotfix-bundle/avatar-bleed.md`.

---

## Fix 4 — Remove debug `console.log('🔍 WORKSPACE QUERY DEBUG:', ...)`

**Files:** none.

### Investigation summary

Searched for the literal string `WORKSPACE QUERY DEBUG` and the
pattern `🔍.*WORKSPACE` / `WORKSPACE.*🔍` across the repo and across
all git history (`git log -S`). **Not present anywhere — not in any
branch, worktree, or commit.**

The `console.log` referenced in the prompt does not exist in the current
codebase. Nothing to remove. If the line was added in a transient session
that has since been reverted, the commit history shows no trace of it.

No commit, no files touched.

---

## Fix 5 — Meta account picker dismiss latch

**Files:** none — already shipped.

### Investigation summary

The dismiss latch and surrounding wiring are already in place:

- `App.tsx:3635` — `metaPickerDismissedForWorkspaceRef` ref.
- `App.tsx:3781` — set on `closeMetaAccountPicker` to the active
  workspace id.
- `App.tsx:3955` — checked in the auto-open effect, returns early when
  the latch matches the active workspace.
- `App.tsx:3726` — cleared on successful account selection.
- `App.tsx:3941-3971` — full effect with all required deps (connection,
  plan, active workspace, picker state, account count).

Recent commit `2c45fb3 fix: stop Meta account picker from re-opening
after dismiss on new workspace` is the same fix and is already on
`main`. No additional commit needed.

---

## Build verification

```text
$ npm run build         # root
✓ built in 11.74s
dist/index.html                                 1.02 kB │ gzip:   0.54 kB
dist/assets/index-CX1-9cKI.css                128.01 kB │ gzip:  19.89 kB
dist/assets/MetaAccountPickerModal-…js          5.46 kB │ gzip:   1.95 kB
dist/assets/JoinTeam-…js                        7.68 kB │ gzip:   2.00 kB
dist/assets/WhatsWorkingDashboard-…js           9.80 kB │ gzip:   2.21 kB
dist/assets/FunnelSettingsForm-…js             14.41 kB │ gzip:   4.81 kB
dist/assets/Billing-…js                        15.43 kB │ gzip:   4.32 kB
dist/assets/PerformanceDashboard-…js           20.13 kB │ gzip:   5.72 kB
dist/assets/jszip.min-…js                      96.43 kB │ gzip:  28.34 kB
dist/assets/InputForm-…js                     107.33 kB │ gzip:  26.39 kB
dist/assets/index-…js                       1,820.82 kB │ gzip: 475.09 kB

$ cd functions && npm run build
tsc && shx mkdir -p lib/assets && shx cp -r src/assets/* lib/assets/
(no errors; lib/ produced)
```

Both builds green. Pre-existing Vite chunk-size warning is unrelated to
these fixes and was present before the bundle.

---

## What was NOT done

- **No deployment** — per instructions, this bundle is committed to
  `main` but not deployed to Firebase.
- **No Firestore migration** — Fix 3 keeps the existing flat collection
  and uses the `workspaceId` field; no data migration is required. Legacy
  avatars without `workspaceId` continue to work via the fallback in the
  client-side filter.
- **No security-rules change** — Fix 3 does not modify `firestore.rules`;
  the existing owner + team-member read/write rules on
  `users/{uid}/avatars/{avatarId}` are sufficient.
