# Pre-Existing Issues — Investigation and Dependency Analysis

**Date:** 2026-07-13
**Scope:** Phase 14 / pre-batch-02 / investigation
**Branch:** `phase-14-rag-meta`
**Status:** Investigation complete. **NO fixes applied** — this document is the
inventory and the recommended fix order. All gate code (build, tests, SC-11)
remains as it was at the end of the workspace-account-fix batch.

---

## 0. Executive summary

| Issue | One-line description | Effort | Blocks Batch 02? |
|---|---|---|---|
| A — Avatar bleed | `buildAvatarPayload` never writes `workspaceId`; fallback filter mis-fils all avatars under the default workspace. | 1-line + small backfill | **No** (avatars are out of scope for sync) |
| B — Workspace deletion | `deleteWorkspace` throws "Default workspace not found" the moment a user with no `isDefault:true` workspace tries to delete. | Medium (1-day) | **No** (function path is broken, but Batch 02's worker does not call it; cascade is on `pendingReassign` not on `deletedAt`) |
| C — Team UI missing | Pre-Phase-26 sidebar "Team" button + handler deleted; `src/pages/Team.tsx` orphaned; `setShowTeamModal(true)` no longer reachable from the UI. | Medium | **No** (UI only; backend callables all still deployed) |
| D — Team workspace access | `<WorkspaceSwitcher>` is not passed `isTeamMember` / `workspaceAccess`; no client callable to load the team member's `workspaceAccess` array. | Medium | **No** (rules enforce server-side; UI shows the wrong set, but the data layer is correct) |
| E — Ad account connection visibility | **NOT A BUG.** `metaConnection.connected` is the user-level OAuth state (correctly shown across workspaces). Workspace-level link is `activeWorkspace?.metaAdAccountId` (correctly handled by the workspace-account-fix). | None | **No** |

**Bottom line:** **Yes, we can safely proceed with Phase 14 Batch 02 without
fixing any of these.** None of Issues A–E block the dispatcher, the worker,
the image-matching flow, the verdict engine, the aggregates, or the
dashboard. All five should be triaged in a separate batch (post-Batch 02)
with Issue B first because it's a data-integrity bug, then D, then C and A
together, then verify E is correctly documented for support.

---

## 1. Issue A — Avatar bleed across workspaces

### 1.1 Root cause

`buildAvatarPayload` in `src/components/InputForm.tsx:595` returns a plain
object with no `workspaceId`. The workspace id is never plumbed through.
`handleSaveAvatar` in `src/App.tsx:1959-1980` writes the payload to
`users/{uid}/avatars` with no `workspaceId` either. Result: every avatar
doc in the collection has `workspaceId === undefined`.

`src/App.tsx:2444-2448` then filters avatars by:

```ts
const filteredAvatars = canUseWorkspaces && activeWorkspaceId
  ? avatars.filter(a => (a.workspaceId || defaultWsId) === activeWorkspaceId)
  : avatars;
```

`a.workspaceId || defaultWsId` falls back to the default workspace id for
any avatar missing the field, so every avatar (in the default workspace
AND any other one) is "shown" only when the user is in the default
workspace. From any non-default workspace the avatar list appears empty.
This is the "bleed" — not that the wrong avatar shows up in the wrong
workspace, but that the wrong workspace sees the wrong set of avatars
because of the fallback.

The `AudienceAvatar` interface at `src/types.ts:475` already declares
`workspaceId?: string` as optional, so the type is not the blocker — the
write path just doesn't populate it.

### 1.2 Affected files

- `src/components/InputForm.tsx:595-660` — `buildAvatarPayload` (omits `workspaceId`).
- `src/App.tsx:1959-1980` — `handleSaveAvatar` (no `workspaceId` injection before `addDoc`).
- `src/App.tsx:2444-2448` — the fallback filter (root of the visible symptom).
- `src/components/InputForm.tsx:319` — `InputForm` already receives `activeWorkspace` as a prop, so the value is in scope when `buildAvatarPayload` runs.
- `src/types.ts:475` — `workspaceId?: string` already in the type (no schema change required).

### 1.3 1-line fix

Add one line to the `handleSaveAvatar` payload in `App.tsx` (right after
line 1973, the `cleanAvatar` filter):

```ts
const cleanAvatar = Object.fromEntries(
  Object.entries({ ...avatar, workspaceId: activeWorkspaceId }).filter(([, v]) => v !== undefined)
);
```

`activeWorkspaceId` is already in scope at the `App.tsx` call site. The
fix can also be done at the `buildAvatarPayload` layer by adding
`workspaceId: activeWorkspace?.id` to the returned object — both are
~1 line, both are equivalent.

### 1.4 Backfill strategy for legacy avatars

Legacy avatars (created before the fix) have no `workspaceId` and need to
be re-classified. Two non-mutating and one mutating approach are possible.
**Recommendation: a dedicated `backfillAvatarWorkspaceId` callable** (the
safest of the three per the existing `ui-investigation.md` §3.5 note).

| Approach | Reversibility | Risk |
|---|---|---|
| **A. Client-side lazy tag on read** — when the filter encounters an avatar with no `workspaceId`, tag it with `defaultWsId` and write back. | Reversible (writes can be undone) | Silent mutation in user-visible code paths; surfaces in the user's editor mid-flow. |
| **B. Server-side idempotent backfill callable** — walks `users/{uid}/avatars` where `workspaceId == null` and tags them with `defaultWsId` (or with the most recently-used workspace, derived from the user's own generation history). | Reversible (idempotent — re-running is a no-op) | Safe; one-time script + a once-per-user dry run. |
| **C. One-time server prompt** — show the user "We found N avatars without a workspace. Tag them as Default?" with confirm. | Fully user-controlled | Worst UX of the three but the only option that doesn't make a decision for the user. |

**Recommended choice: B with C as a follow-up.** The script tags legacy
avatars with `defaultWsId`; if the user later complains, a manual
reassignment flow can move them to a specific workspace.

### 1.5 Phase 14 Batch 02 impact

**None.** `metaSyncAccountWorker` and the image-matching flow never read
the `avatars` collection. Avatars are an editor convenience; they are not
on the read path of the sync. Fixing Issue A does not affect Batch 02
correctness, but should be tracked so users can find their saved avatars
under the correct workspace when they later return to it.

### 1.6 Estimated effort

- 1-line code change: trivial.
- Backfill callable + idempotency test: small (1 day).
- Verify via the per-user avatar UI + a one-time Cloud Function log: small.

---

## 2. Issue B — Workspace deletion fails: "Default workspace not found"

### 2.1 Full trace

The error surfaces at `src/components/WorkspaceSettingsModal.tsx:121`
(`setUiError(t('workspace.settings.delete_failed'))`) when the backend
callable throws. The actual string **"Default workspace not found"** is
thrown server-side by `resolveDefaultWorkspaceId` in
`functions/src/workspaces/workspacePolicy.ts:111`.

The flow:

1. **User clicks "Delete"** in `WorkspaceSettingsModal.tsx`.
2. **`handleDelete`** at `WorkspaceSettingsModal.tsx:113-126` calls
   `workspaceService.deleteWorkspace(workspace.id)`.
3. **Backend `deleteWorkspace`** in `functions/src/index.ts:6316-6360`:
   - Reads the workspace doc; throws `not-found` if missing.
   - Rejects if `wsData.isDefault === true` (line 6329-6331): "The default workspace can't be deleted."
   - Sets `deletedAt` + `pendingReassign: true` (line 6344-6347).
   - **Calls `resolveDefaultWorkspaceId(uid)`** at line 6350.
4. **`resolveDefaultWorkspaceId`** in
   `functions/src/workspaces/workspacePolicy.ts:102-114` queries
   `users/{uid}/workspaces` where `isDefault == true`. **If `snap.empty`,
   throws `HttpsError("not-found", "Default workspace not found")`**.
5. The error propagates back to `handleDelete` which renders the
   generic "delete failed" toast (line 122). The user sees a vague
   failure and has no way to know why.

### 2.2 Why is the default workspace missing?

Three realistic paths reach this error:

1. **Legacy user without any workspace.** `createWorkspace` at
   `functions/src/index.ts:6199-6253` **always sets `isDefault: false`**
   (line 6242). The codebase has no `onUserCreate` or first-login
   bootstrap that creates a default workspace. A user who signs up and
   goes directly to a non-workspace-plan flow never has a default;
   later upgrading to Scale and creating a non-default workspace will
   trap their delete attempt.
2. **All workspaces soft-deleted, none default.** A user can soft-delete
   all of their non-default workspaces; if for any reason the default
   was also soft-deleted (e.g., the user clicked the wrong button on
   the default or the system has a separate path that soft-deletes it),
   then no `isDefault:true && deletedAt:null` doc exists. The 30-day
   purge timer does not help — `purgeExpiredWorkspaces` explicitly
   skips default workspaces (line 60-65 of `workspacePurge.ts`) but
   also skips any workspace with `pendingReassign === true`.
3. **Data corruption / manual console edit.** The `isDefault` flag
   could be cleared by a partial update (the `forbidden` list in
   `updateWorkspace` at `functions/src/index.ts:6264` does block
   client-side `isDefault` writes, but Admin SDK or manual Firestore
   console writes can still bypass it).

### 2.3 Was this ever working? Git history

`git log -- src/components/WorkspaceSettingsModal.tsx` and
`git log -- functions/src/workspaces/workspacePolicy.ts`:

- `5f4c52b` — `feat: workspace logic Phase 12 — multi-workspace scale plan + meta binding + team access` (Apr 22 2026). Introduced `createWorkspaceWithLimit`, `resolveDefaultWorkspaceId`, and the `deleteWorkspace` cascade. The "Default workspace not found" error string was added in this commit.
- `7fe7917` — `fix: workspace logic Phase 12 review — meta probe, txn limit, paged purge, a11y/i18n, spec reconciliation` (review pass).
- `ccb1f75` — `fix: workspace review round 2 — retry-safe cascade, owner-scoped purge, i18n gaps, skipped placeholder tests` — preserved the behaviour.
- `a96b4e6`, `66864d9`, `6c03750`, `d85fd80`, `31a4061`, `2ce29e9`, `9d89b35` — further review passes, none of which addressed the missing-default case.

The string was **added in Phase 12 and never changed since.** The bug has
been latent for ~3 months. It was likely masked during Phase 12/13
testing because testers always started with a freshly-created
Scale-plan user (who has a default workspace) and never exercised the
legacy-user path.

The Phase 26 commit (`9c28960`) replaced the sidebar UI but did **not**
touch the deletion flow.

### 2.4 Phase 14 cascade dependency (Edge Case 15)

`specs/phase-14/data-model.md:238` states:

> **Lifecycle (Edge Case 15)**: **disconnect** → delete `encryptedToken`/`tokenExpiresAt`, set `metaConnected:false`, halt syncs, **retain** performance data + aggregates. **Workspace deletion** → cascade purge of settings, snapshots, adPerformance, baselines, hook/visual aggregates, fingerprint index, and this doc.

`specs/phase-14/tasks.md:234` has T062:

> - [ ] T062 [P] Verify workspace-deletion cascade purges settings, snapshots, adPerformance, baselines, aggregates, fingerprint index, and the Meta connection (Edge Case 15)

The cascade is implemented in `functions/src/workspaces/workspacePurge.ts`
(`cascadeReassignOnDelete` and `cascadeRevertOnRestore`). However, these
run **inside the `deleteWorkspace` callable** (line 6352 of
`functions/src/index.ts`). If the callable throws "Default workspace not
found" before line 6352, the cascade never runs. So:
- A user on a workspace plan who hits this bug also has a half-deletion
  state: `deletedAt` and `pendingReassign` ARE set (lines 6344-6347), but
  no reassignment happens. The workspace is "stuck" in pendingReassign
  until a retry.
- The retry hits the same "Default workspace not found" and is stuck
  forever.

This means **for users who hit Issue B, the Edge Case 15 cascade
silently fails.** They retain their old workspace doc (now soft-deleted)
and **all** Phase 14 sub-collections (settings, syncSnapshots,
adPerformance, baselines, hookPerformance, visualPerformance,
imageFingerprints) keep accumulating against the orphaned workspace id
forever. The orphan is invisible to the user (the workspace is filtered
out of the switcher) but is a data-integrity bug for Batch 02
(snapshots and adPerformance keep writing to a deleted workspace).

### 2.5 Fix needed (not applied in this investigation)

Two-pronged fix:

1. **Guard the resolver / the callable**: if `snap.empty` in
   `resolveDefaultWorkspaceId`, **synthesize a default workspace** before
   attempting the cascade (a) or **auto-undelete the most recently
   soft-deleted workspace if it's the only one with `isDefault: true`
   ever set** (b). The chosen strategy depends on product intent:
   - Strategy (a) — re-create the default under a new doc id, tag
     reassignments to it, return success. Reversible: the user can
     re-name or delete the synthetic default.
   - Strategy (b) — keep the historical default; revert `deletedAt` to
     null; re-run the cascade. Reversible: same.
2. **Add a one-time bootstrap** for users without a default: in
   `createWorkspace`, if the user has zero workspaces, set
   `isDefault: true` instead of `false`. The current `isDefault: false`
   is correct **only** when other workspaces (including a default) exist.
3. **Surface the real error string** in the UI: `t('workspace.settings.delete_failed_default_missing')` so support can correlate.

### 2.6 Phase 14 Batch 02 impact

**Indirect.** Batch 02 does not call `deleteWorkspace`; the daily sync
**creates** `syncSnapshots` and `adPerformance` rows but never deletes
them. However, if a user has an orphaned workspace from a prior failed
delete (Issue B), the orphan will accumulate Phase 14 rows that the
dashboard / verdict engine can never read (the user is filtered out).
This is wasted quota + storage. It is NOT a correctness bug for the
sync, but it IS a data-integrity bug for the product.

### 2.7 Estimated effort

- Fix `resolveDefaultWorkspaceId` + `createWorkspace` bootstrap: small.
- Add error-string localization: trivial.
- Add regression test: T062 itself is the natural place. ~1 day total.

---

## 3. Issue C — Team management UI missing from sidebar

### 3.1 Pre-Phase-26 state (commit `9c28960^`)

In `src/App.tsx` before commit `9c28960`, the sidebar had:

```tsx
{!teamOwnerUid && (
  <button
    onClick={() => { setShowSidebar(false); setShowTeamModal(true); loadTeamMembers(); loadTeamInvites(); }}
    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left hover:bg-slate-800/60 transition-all group"
  >
    <p className="text-[11px] font-bold text-white group-hover:text-emerald-400 transition-colors">Team</p>
    <p className="text-[8px] text-slate-500">Chat with our team</p>
  </button>
)}
```

Commit `9c28960` (Phase 26 — Generation History with filters and
pagination) deleted this button. The `+1048 -…` diff in `App.tsx` is
where the sidebar was rebuilt without the Team entry. The other
sidebar entries (EarnCreditsPanel, WatchVideo, ManageBilling, etc.)
were similarly rebuilt but Team was not preserved.

### 3.2 Current state of team-related code

| Item | State |
|---|---|
| `setShowTeamModal` state | Still declared in `App.tsx:2303` |
| Team Modal JSX | Still mounted at `App.tsx:11494-11620` |
| `loadTeamMembers`, `loadTeamInvites` handlers | Still defined (`App.tsx:2453, ~2470`) |
| `handleTeamInvite`, `handleRemoveTeamMember` | Still defined |
| Trigger to open the Team Modal | **GONE** — no `setShowTeamModal(true)` call site remains in the rendered JSX |
| `src/pages/Team.tsx` | Exists (full 786-line page) but **NEVER IMPORTED** anywhere in the app (verified by `grep` against `src/**`) |
| `src/services/teamService.ts` | Exists with `getInviteDetails`, `claimTeamInvite` |
| `src/pages/JoinTeam.tsx` | Mounted at `/join` only (for invite acceptance) |
| `joinTeam`, `claimTeamInvite` Cloud Functions | Live |

The team-management infrastructure is **intact but unreachable** from
the UI. The owner can no longer:
- Invite team members
- See the current team list
- Revoke a member's access
- Set per-workspace `workspaceAccess` for each member

### 3.3 Team members who already exist — do they still work?

A team member who is already `isTeamMember: true` on their user doc and
has `teamOwnerUid` set will:
- Be detected by the auth listener (`App.tsx:1717-1719`) on login.
- Be scoped to the owner's UID for Firestore operations (via
  `effectiveUid = teamOwnerUid || user?.uid`, `App.tsx:2198`).
- Be able to navigate the app, generate ads, and view history
  (Firestore rules at lines 17-32 of `firestore.rules` allow owner +
  team-member read/write on `avatars` and `projects`).

So a **pre-existing** team member still has access. The breakage is
**inviting new members** and **managing existing members' access
revocation** — both are owner actions and both go through the deleted
UI.

### 3.4 Phase 14 Batch 02 impact

**None.** The daily sync uses the OWNER's `metaConnections` doc (not the
team member's). A team member does not need to do anything for the sync
to run — it runs on the owner side and the data lives in the owner's
namespace. `metaSyncAccountWorker` reads from
`users/{ownerUid}/workspaces/...` and the `metaConnections/{uid}` doc
referenced is the owner's, not the team member's.

### 3.5 Fix needed (not applied)

- Restore the Team entry in the sidebar (or wherever the post-Phase-26
  menu lives) with `onClick={() => setShowTeamModal(true); loadTeamMembers(); loadTeamInvites();}`.
- Optionally: route to the existing `src/pages/Team.tsx` page (full
  per-member workspace-access matrix UI) instead of the modal.

### 3.6 Estimated effort

- 1 button + 1 onClick = trivial. ~1 hour.

---

## 4. Issue D — Team member cannot see workspace tab

### 4.1 Root cause

Two distinct gaps:

**Gap 1 — `WorkspaceSwitcher` is not passed team props.**
`App.tsx:7222-7231` renders `<WorkspaceSwitcher>` without
`isTeamMember` or `workspaceAccess`:

```tsx
<WorkspaceSwitcher
  workspaces={workspaces}
  activeWorkspaceId={activeWorkspaceId}
  onSwitch={setActiveWorkspaceIdLocal}
  onCreateNew={() => { setEditingWorkspace(null); setShowWorkspaceModal(true); }}
  onEditWorkspace={(ws) => { setEditingWorkspace(ws); setShowWorkspaceModal(true); }}
  hasInProgressWork={isLoading || !!tovText || ...}
/>
```

`WorkspaceSwitcher.tsx:43-45` filters:

```ts
const visibleWorkspaces = isTeamMember && workspaceAccess
  ? activeWorkspaces.filter(ws => workspaceAccess.includes(ws.id))
  : activeWorkspaces;
```

With `isTeamMember === undefined` and `workspaceAccess === undefined`,
**all** of the owner's workspaces show up in the dropdown for a team
member. Worse, line 161-170 also renders the "New workspace" button to
team members (it should be owner-only). The "No access" copy at
`WorkspaceSwitcher.tsx:91-94` never triggers because `visibleWorkspaces`
is non-empty by construction.

**Gap 2 — No client-side load of `workspaceAccess`.**
Even if Gap 1 were fixed, there is no callable to load the team
member's own `workspaceAccess` array. The server's
`setTeamMemberWorkspaceAccess` callable (in `functions/src/index.ts`)
**writes** the array (called from `src/pages/Team.tsx:250`) but there
is no `getMyTeamProfile` / `getMyWorkspaceAccess` callable to **read**
it. `grep` of `functions/src/**` confirms no such callable exists.

### 4.2 What a team member actually experiences

1. Logs in, is detected as a team member (`App.tsx:1717-1719`).
2. Sees the workspace switcher with ALL of the owner's workspaces.
3. Can "select" any workspace — the switcher's `onSwitch` does
   `setActiveWorkspaceIdLocal(id)`, then `canUseWorkspaces` + the active
   workspace checks pass locally, but the **Firestore rules
   (`isWorkspaceMember` at `firestore.rules:139-147`) only check
   `isTeamMember` and `teamOwnerUid`** — they do NOT consult
   `workspaceAccess`. So a team member can read any non-deleted
   workspace doc but their actual `workspaceAccess` is enforced
   server-side only inside specific callables (`resolveCallerScope` in
   `functions/src/workspaces/workspacePolicy.ts:116-156`,
   `cascadeReassignOnDelete`, `getWorkspaceGenerations`, etc.).
4. The dropdown shows the wrong "New workspace" button.

### 4.3 Workaround

A team member can generate ads and view history as long as the active
workspace is one they have access to (rules allow it). They will see
all workspaces in the switcher, so they can "navigate" by selecting
one. The data layer is correct (Firestore rules + callables) but the UI
lies about the access scope.

### 4.4 Phase 14 Batch 02 impact

**None for correctness.** The sync runs on the owner side; team members
read the resulting `adPerformance` / `baselines` / `verdict` data via
the existing per-collection `isWorkspaceMember` checks. A team member
who somehow selects a workspace they don't have access to will get an
empty data set (rules block), but the sync itself is unaffected.

**However**, Batch 04 (the dashboard) and Batch 05 (RAG injection into
Step 1) WILL surface this gap because those flows:
- Surface per-workspace verdicts + recent winners. A team member with
  no access to the active workspace will see empty cards and not
  understand why.
- Inject RAG context from the active workspace's `pastWinningAds`. A
  team member with no access to a workspace gets an empty
  `pastWinningAds` query — silent no-op.

If we don't fix Issue D, the dashboard and RAG will work **correctly for
the owner** but will appear broken or empty for team members.

### 4.5 Fix needed (not applied)

1. **Add a `getMyTeamProfile` (or `getMyWorkspaceAccess`) callable** in
   `functions/src/index.ts` that returns the caller's `workspaceAccess`
   array (and `teamRole`, `teamOwnerUid`, `teamOwnerName` for context).
   Use `resolveCallerScope` internally to find the team member doc.
2. **Wire the load** in `App.tsx`: when `data.isTeamMember` becomes
   true, call the new callable and stash `workspaceAccess` in state.
3. **Pass `isTeamMember` + `workspaceAccess`** to `<WorkspaceSwitcher>`
   (1-line prop addition per prop, plus the surrounding state).
4. **Render "No access" copy** in the switcher when the team member has
   no accessible workspaces (already implemented in
   `WorkspaceSwitcher.tsx:91-94`, just unreachable today).

### 4.6 Estimated effort

- New callable + i18n: small (1 day).
- App.tsx wiring + state: small (half day).
- Regression test (team member switches workspace, gets correct set):
  small (half day).

---

## 5. Issue E — Ad account connection visible across all workspaces

### 5.1 What's actually happening

The "Meta Ads Connected" badge that Eslam sees on every workspace is
**the user-level OAuth connection state**, not the workspace-level
account link. There are two distinct pieces of state:

| State | Location | Scope | Drives UI |
|---|---|---|---|
| `users/{uid}/metaConnections.connected` | USER | OAuth session — once connected, the user can talk to Meta | The "Meta Ads Connected" / "Connect Meta Ads" menu entry (`MenuItems` in `App.tsx:1403-1412`) |
| `users/{uid}/workspaces/{wid}.metaAdAccountId` | WORKSPACE | The ad account this workspace is linked to | The `activeWorkspace?.metaAdAccountId` check; the "Funnel Settings" availability; the "Select ad account for this workspace" prompt (the batch just landed) |

The `metaConnection` is fetched from `getMetaConnection`
(`functions/src/index.ts:3277-3297`), which reads
`users/{uid}/metaConnections`. The workspace-level link is fetched as
part of the workspace doc and used for `activeMetaAccountId` /
`funnelSettingsAvailable` / `activeWorkspaceNeedsMetaAccount`.

### 5.2 Is this a bug?

**No.** Per `FR-026` (1:1 workspace→account), **OAuth is user-level and
account selection is workspace-level.** Showing the OAuth state on
every workspace is correct — the user has one OAuth session per
account lifetime. Showing the workspace-level link state correctly
depends on the per-workspace `metaAdAccountId`, which the menu now
displays via the auto-open picker + highlighted prompt (the
workspace-account-fix batch just landed).

What the user observed:

> "When you connect a Meta account, the 'connected' status shows on every
> workspace even though each workspace should independently link its own
> ad account."

Two distinct states conflated. The "connected" status is the OAuth
state. The "linked" status is per-workspace. Both are correct; the
distinction just needs to be visible in the UI.

### 5.3 Recommended UI improvement (not a fix)

A future polish could be: when the user is on a workspace that DOES NOT
have a workspace-level link yet, show the "Meta Ads Connected" label in
**muted** text + the "Select ad account for this workspace" prompt
together (which the workspace-account-fix already does). When the
workspace IS linked, show the OAuth label with the account name as
sub-label (which the same fix already does). **No code change needed** —
this is documentation for support.

### 5.4 Phase 14 Batch 02 impact

**None.** Batch 02 reads `users/{ownerUid}/workspaces/{wid}/adAccounts/{aid}/...`
directly. It does not consult the user-level `metaConnections.connected`
flag (it uses the workspace's `private/metaConnection` sub-doc instead,
which is server-only). The Batch 02 worker is unaffected by how the
frontend displays the OAuth state.

### 5.5 Estimated effort

- Zero code change. ~1 paragraph in the support docs / i18n
  copy-comments.

---

## 6. Dependency matrix

| Issue | Blocks Batch 02? | Blocks Batch 03? | Blocks Batch 04? | Blocks Batch 05? | Rework if fixed after Phase 14? |
|---|---|---|---|---|---|
| A — Avatar bleed | No | No | No | No | **Yes — minor.** Legacy avatars will keep appearing under the default workspace until a backfill runs; users will silently lose their saved-avatar history on non-default workspaces if they expect it. Not breaking, but the next time someone touches the avatar feature they'll have to redo the fix anyway. |
| B — Workspace deletion | No (correctness) / **Yes (data integrity)** | No (correctness) / **Yes (data integrity)** | No (correctness) / **Yes (data integrity)** | No (correctness) / **Yes (data integrity)** | **Yes — high.** A user who hits this bug today silently has a half-deleted workspace with stale `syncSnapshots` / `adPerformance` rows. Once Batch 02 lands, the daily sync will continue to write to that orphan forever. A retroactive cleanup will need a backfill that knows which orphaned workspaces exist — but no current code path exposes that list. |
| C — Team UI missing | No | No | No | No (technically) | **No.** Pure UI. Backend callables all work. Re-introducing the menu entry is a one-button restore. |
| D — Team workspace access | No (correctness) / **Yes (UX for team members)** | No (correctness) / **Yes (UX for team members)** | **Yes.** Dashboard shows per-workspace verdicts. A team member with a misaligned switcher sees the wrong empty workspace. | **Yes.** RAG injection uses `pastWinningAds` for the active workspace. A team member with a misaligned switcher gets empty RAG context — silent no-op that the user can't diagnose. | **Yes — medium.** Once Batch 04 + Batch 05 ship, team members will see empty / wrong dashboards and empty RAG, with no client-side way to diagnose. The fix is independent (a new callable + a few state props) but it will look like a Phase 14 bug to the user. |
| E — Ad account visibility | No | No | No | No | No. The behavior is correct. |

---

## 7. Recommended fix order

Prioritize by **risk × surface area × Batch 02 impact**. Lower number =
fix first.

1. **Issue E** — already correct. **Action: nothing.** Document for
   support (1 paragraph, can ship in the same PR as the next fix).
2. **Issue B** — data-integrity bug with cascading effect. **Fix in
   parallel with Batch 02** (1 day). The fix can land as a small
   callable change in `workspacePolicy.ts` + a one-time bootstrap in
   `createWorkspace` + a localized error string. Pairs naturally with
   T062 (the existing "Verify workspace-deletion cascade" task) so
   they ship together.
3. **Issue A** — 1-line code change + a small backfill callable. **Fix
   as a separate small batch** (1-2 days). Trivial to land and gives
   users back their saved-avatar history on non-default workspaces.
4. **Issue D** — add `getMyTeamProfile` callable + wire `isTeamMember` /
   `workspaceAccess` to `<WorkspaceSwitcher>`. **Fix before Batch 04
   ships** (1-2 days). Can land in parallel with Batch 02 / Batch 03.
5. **Issue C** — restore the sidebar button or link to `pages/Team.tsx`.
   **Fix before the next release that includes team features** (1 hour).
   Lowest priority; only matters if a customer needs to invite /
   manage team members soon.

**Recommended sequencing:**

| Week | Work |
|---|---|
| Now | Ship this investigation report. Proceed with Batch 02. |
| Same week (parallel) | Issue B fix (pairs with T062) |
| Next | Issue A fix + backfill |
| Before Batch 04 | Issue D fix |
| Whenever team invites need to flow | Issue C fix |

---

## 8. Can we safely proceed with Phase 14 Batch 02 without fixing any of these?

**Yes.** Concretely:

- **Batch 02 (daily Meta sync + image matching)** does not depend on
  any of Issues A–E for correctness. The dispatcher and worker operate
  on the owner's `metaConnections`, the owner's `workspaces`, and
  the workspace's `private/metaConnection` sub-doc. None of these paths
  touch the `avatars` collection, the Team modal, the WorkspaceSwitcher
  props, or the OAuth-connection UI.
- **Issue B** has indirect data-integrity impact (orphaned workspaces
  accumulate Phase 14 rows) but does not stop Batch 02 from working
  for the 95% of users who don't hit the bug.
- **Issues A, C, D, E** are user-facing only; Batch 02's read/write
  surface is unaffected.

If we want to ship Batch 02 with **zero** known pre-existing bugs
silently rotting in the codebase, the lowest-cost parallel fix is
**Issue B** (1 day, pairs with T062). Everything else can be triaged
after Batch 02 lands.

---

## 9. Files of interest (no changes made)

- `src/components/InputForm.tsx:595` — `buildAvatarPayload` (Issue A)
- `src/App.tsx:1959-1980` — `handleSaveAvatar` (Issue A)
- `src/App.tsx:2444-2448` — the workspace filter fallback (Issue A symptom)
- `src/components/WorkspaceSettingsModal.tsx:113-126` — `handleDelete` (Issue B entry point)
- `functions/src/index.ts:6316-6360` — `deleteWorkspace` callable (Issue B)
- `functions/src/workspaces/workspacePolicy.ts:102-114` — `resolveDefaultWorkspaceId` (Issue B source of the error string)
- `functions/src/workspaces/workspacePurge.ts:121-` — `cascadeReassignOnDelete` (Issue B + Edge Case 15 cascade)
- `src/App.tsx:7222-7231` — `<WorkspaceSwitcher>` call site (Issue D)
- `src/components/WorkspaceSwitcher.tsx:21-45` — `visibleWorkspaces` filter (Issue D)
- `src/pages/Team.tsx` — orphaned page (Issue C)
- `src/services/metaService.ts:22-30` — `MetaConnection` interface (Issue E proof: it's user-level)
- `functions/src/index.ts:3277-3297` — `getMetaConnection` callable (Issue E proof)
- `functions/src/index.ts:6316-6360` — `deleteWorkspace` + the `isDefault: true` guard (Issue B context)
- `src/services/workspaceService.ts:33-40` — `WorkspaceServiceRequest` shape
- `src/types.ts:413-415` — `Workspace.metaRoleAtLinkTime` type (used by Issue E flow)
- `src/types.ts:471-475` — `AudienceAvatar.workspaceId` (Issue A)
- `firestore.rules:139-147` — `isWorkspaceMember` helper (Issue D backend enforcement)
- `specs/phase-14/tasks.md:234` — T062 (Issue B + Edge Case 15)
- `specs/phase-14/data-model.md:238` — Edge Case 15 contract (Issue B dependency)
- `specs/phase-14/spec.md` — workspace + team + account contracts (cross-reference)
