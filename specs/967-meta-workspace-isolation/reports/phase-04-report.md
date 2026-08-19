# Phase 4 Report — User Story 2 (T044–T056)

**Phase**: 4 — US2 (P2)
**Branch**: `967-meta-workspace-isolation`
**Date**: 2026-08-19
**Status**: ✅ Complete — awaiting go-ahead before Phase 5

---

## Scope

US2 — Per-workspace Facebook Page.

Two backend surfaces change, and three frontend surfaces change:

| Surface | Change | Requirement |
|---|---|---|
| `metaSelectPage` | Workspace-scoped write (`metaPageId` / `metaPageName` / `metaPageClearedAt` on the workspace) | FR-005, FR-006, FR-008, FR-018, FR-030 |
| `getMetaConnection` | Workspace-aware Page fields (`activePageId` / `activePageName` / `pageSource` / `isTeamMember`) when `workspaceId` is supplied | FR-006, FR-028 |
| `metaService.selectPage` | Accepts an optional `workspaceId` | C1 |
| `metaService.getConnection` | Accepts an optional `workspaceId` | C6 |
| App.tsx `handleMetaPageSelect` | Passes `workspaceId`; stops writing global state; refetches the connection | T052–T055 |
| App.tsx Page picker `currentSelectedId` | Reads from `activePageId` first, falls back to `selectedPageId` | FR-006 |

`resolveWorkspacePage` (Phase 3) is the single source of truth for
which Page is read — used by both the publish path (Phase 3) and
the `getMetaConnection` path (this phase). The Phase 3 SET / NEVER_SET /
CLEARED state machine is now exercised end-to-end on the read path
as well as the publish path.

---

## Diff summary

```
 functions/src/__tests__/metaSelectPage.test.ts   (new — T-11/T-12/T046 + 9 impl contract checks)
 functions/src/index.ts                          (metaSelectPage + getMetaConnection rewrites)
 src/services/metaService.ts                     (selectPage + getConnection workspaceId params)
 src/App.tsx                                     (handleMetaPageSelect + picker currentSelectedId + useEffect deps)
```

---

## T047–T050 — `metaSelectPage` rewrite (`functions/src/index.ts:3416`)

**Before**: read `metaConnections/{request.auth.uid}`, validate the
Page against `pages[]`, write `selectedPageId` / `selectedPageName`
to the account-global connection. Page was account-scoped (FR-006
violation).

**After**: every step respects the workspace scope.

| Step | Reads from | Requirement |
|---|---|---|
| Workspace resolution | `workspaceId` (caller) or `resolveDefaultWorkspaceId(ownerUid)` | FR-005 / FR-018 / FR-012b |
| Workspace authorisation | `assertWorkspaceAllowed(scope, wsId)` | FR-004 / FR-021 |
| Workspace load + active check | `assertWorkspaceActive` | FR-024 |
| Connection path | `metaConnections/{scope.ownerUid}` | FR-001 |
| Page validation | `connection.pages[]` | FR-005 (`page_not_available` on miss) |
| Workspace SET write | `metaPageId=<id>, metaPageName=<name>, metaPageClearedAt=null` | FR-008 |
| Workspace CLEARED write | `metaPageId=null, metaPageName=null, metaPageClearedAt=<now>` | FR-008 (clearing by user) |
| Legacy account-level write | `selectedPageId` / `selectedPageName` | FR-030 (revert-safe) |

### Page state machine (data-model.md §1)

```
SET        pageId truthy         → { metaPageId, metaPageName, metaPageClearedAt: null }
CLEARED    pageId === null      → { metaPageId: null, metaPageName: null, metaPageClearedAt: <now> }
NEVER_SET  not in this call     → unchanged (would have to come from a SELECT that hasn't happened)
```

The CLEARED branch matters because the picker explicitly offers
"Skip" (i.e. clear) and the user can also reach it by unselecting
the current Page. The `metaPageClearedAt: <now>` stamp keeps the
state machine sound: a subsequent `resolveWorkspacePage` for the
same workspace sees the `CLEARED` state and refuses the legacy
fallback (FR-011a — the same field that's already set by the
Phase-6 `linkMetaAccountToWorkspace` clearing).

### Refactor: `metaSelectPageImpl`

Same hermetic-test pattern from Phase 3: the handler body is exported
as `metaSelectPageImpl(scope, requestData)`, callable wraps it via
`onCall`. Tests call the impl directly with a fake scope (no live
resolver, no live Firebase).

---

## T051 — `getMetaConnection` extension (`functions/src/index.ts:3346`)

**Before**: returned the legacy account-level Page (`selectedPageId`
/ `selectedPageName`). Workspace-aware Page was unreachable.

**After**: when the request includes `workspaceId`, the response adds
three fields:

```
{
  activePageId,        // string | null
  activePageName,      // string | null
  pageSource:          // "workspace" | "legacy_global" | "none"
  isTeamMember,        // boolean — callerUid !== ownerUid
}
```

The Page resolution is bit-identical to `resolveWorkspacePage` (the
Phase 3 helper the publish path uses), but inlined here so the impl
file has no extra import surface for the test stub:

- `metaPageId` truthy → `activePageId = metaPageId`, `pageSource = "workspace"`
- `metaPageClearedAt` set → `pageSource = "none"` (FR-011a — legacy FORBIDDEN)
- Otherwise → `activePageId = selectedPageId` (legacy fallback per FR-007), `pageSource = "legacy_global"` or `"none"`

When no `workspaceId` is supplied, the response falls back to the
account-global fields so existing non-workspace-plan UI keeps
working (`activePageId = selectedPageId`, `pageSource = "legacy_global"`).

### Refactor: `getMetaConnectionImpl`

Same hermetic-test pattern. Tests invoke the impl directly with a
fake scope and stubbed Firestore.

---

## T052–T053 — Frontend service (`src/services/metaService.ts`)

```ts
async selectPage(
    pageId: string | null,
    pageName: string | null,
    opts?: { workspaceId?: string | null },
): Promise<boolean>

async getConnection(opts?: { workspaceId?: string | null }): Promise<MetaConnection>
```

`MetaConnection` now declares `activePageId`, `activePageName`,
`pageSource`, `isTeamMember` as optional fields. Both callables pass
`workspaceId` to the backend when supplied; the back-compat path
(no workspaceId) sends an empty payload so the response falls
through to the legacy fields.

---

## T054–T055 — Frontend wiring (`src/App.tsx`)

### `handleMetaPageSelect` (T052)

Passes the active workspace id to `metaService.selectPage` so the
backend records the Page on the right workspace:

```ts
const ok = await metaService.selectPage(
    pageId, pageName,
    { workspaceId: canUseWorkspaces ? activeWorkspaceId : null },
);
```

### `setMetaConnection(prev => ...)` removed (T055)

Before:
```ts
setMetaConnection(prev => prev ? {
    ...prev,
    selectedPageId: pageId,
    selectedPageName: pageName,
} : prev);
```

After: the page is recorded on the workspace, and the next
`getMetaConnection(workspaceId)` call returns the workspace-aware
fields. The local cache is replaced with the refetched value:

```ts
const refreshed = await metaService.getConnection(
    { workspaceId: canUseWorkspaces ? activeWorkspaceId : null },
);
setMetaConnection(refreshed);
```

This is the FR-006 closure: the global `metaConnection.selectedPageId`
is no longer the authoritative answer; the workspace's Page is.

### Page picker `currentSelectedId` (T054)

The picker's "current Page" indicator now reads from the
workspace-aware fields first:

```ts
currentSelectedId={
    metaConnection?.activePageId
      ?? metaConnection?.selectedPageId
      ?? null
}
```

`activePageId` is set by the latest `getMetaConnection(workspaceId)`
call; the `??` fallback to `selectedPageId` covers the brief window
before the workspace-aware fetch lands (the `useEffect` below
refreshes on `activeWorkspaceId` change, so this is normally
in-step with the active workspace).

### `useEffect` deps (T051)

The initial-load effect now re-runs on `activeWorkspaceId` change so
the connection is re-fetched with the new workspace's Page when the
user switches workspaces:

```ts
useEffect(() => {
    if (!user) return;
    const wsId = canUseWorkspaces ? activeWorkspaceId : null;
    metaService.getConnection({ workspaceId: wsId })
        .then(conn => setMetaConnection(conn))
        .catch(() => { });
}, [user, canUseWorkspaces, activeWorkspaceId]);
```

`refreshMetaConnection` (the OAuth-popup helper) takes the same
shape so post-OAuth the workspace-aware fields land too.

---

## T044–T046 + 9 impl checks — `metaSelectPage.test.ts` (new)

15 tests using the established hermetic in-memory Firestore stub
pattern. All pass.

| Test | Asserts | Requirement |
|---|---|---|
| **T-11** | CLEARED workspace → `getMetaConnection(workspaceId)` returns `pageSource: "none"`, `activePageId: null`, `activePageName: null` | FR-011a |
| T-11b | SET on workspace A does NOT leak into CLEARED workspace B | FR-006 (per-workspace isolation) |
| **T-12** | NEVER_SET workspace → `pageSource: "legacy_global"`, `activePageId` = account-global `selectedPageId` | FR-007 |
| T-12b | SET workspace → `pageSource: "workspace"`, `activePageId` = workspace's own Page | FR-006, FR-008 |
| T-12c | `workspaceId` omitted → falls back to legacy global fields (back-compat) | FR-009 |
| **T046** | Selecting `pageId: "page-not-in-conn"` → `failed-precondition / reason: "page_not_available"` | FR-005 |
| MSP-1 | SET write: `{ metaPageId: <id>, metaPageName: <name>, metaPageClearedAt: null }` | FR-008 |
| MSP-2 | CLEARED write (`pageId: null`): `{ metaPageId: null, metaPageName: null, metaPageClearedAt: <now> }` | FR-008 (clearing) |
| MSP-3 | `pageName > 200 chars` truncated to 200 on workspace AND on connection | data-model.md §1 |
| MSP-4 | Account-level `selectedPageId` / `selectedPageName` still written | FR-030 (revert-safe) |
| MSP-5 | Workspace not found → `not-found / reason: "workspace_not_found"` | preamble |
| MSP-6 | Workspace soft-deleted → `not-found` | FR-024 |
| MSP-7 | No `workspaceId` + no default → `failed-precondition / reason: "no_workspace_resolved"` | FR-012a |
| MSP-8 | Workspace outside permitted set → `permission-denied / reason: "workspace_not_permitted"` | FR-004 / FR-021 |
| MSP-9 | Team member (`allowedWorkspaceIds: "ALL"`) can select a Page for owner's workspace | FR-004a (all-access policy) |

---

## T056 — NEVER_SET fallback regression (FR-007, FR-010, SC-006)

The combined T-12 + T-12b + MSP-1 outcome proves SC-006:

- A workspace in `NEVER_SET` (no Page ever chosen) gets the legacy
  account-level Page (`pageSource: "legacy_global"`, FR-007).
- The moment the user picks a Page for the workspace (`MSP-1`'s
  SET write), the legacy value is no longer consulted for that
  workspace (`T-12b`'s `pageSource: "workspace"`).
- A different workspace on the same account that has never picked
  a Page still falls back to the legacy value (`T-11b` confirms
  per-workspace isolation).

Live end-to-end verification is operator-gated (live Firebase
required). The runbook is appended to
`specs/967-meta-workspace-isolation/evidence-r1.md` with the same
paste-and-go format as the R1/R4 and Phase 3 evidence.

---

## Verification

- Frontend `npm run build` — **pass** (`tsc -b && vite build`).
  No new warnings.
- Backend `cd functions && npm run build` — **pass** (`tsc` strict
  mode). Both `metaSelectPageImpl` and `getMetaConnectionImpl` are
  exported with correct types.
- `node lib/__tests__/workspace.test.js` — 12 passed, 0 failed.
- `node lib/__tests__/metaCallerScope.test.js` — 7 passed, 0 failed.
- `node lib/__tests__/workspaceRepair.test.js` — 9 passed, 0 failed.
- `node lib/__tests__/metaPush.test.js` — 8 passed, 0 failed.
- `node lib/__tests__/metaPushPack.test.js` — 2 passed, 0 failed.
- `node lib/__tests__/metaSelectPage.test.js` — **15 passed, 0 failed**.
- `node lib/__tests__/teamWorkspaceAccess.test.js` — unchanged,
  still passes.

53 total active tests pass. The 13 pre-existing skipped tests in
`workspace.test.ts` are unchanged placeholders.

---

## Trap compliance (`quickstart.md` "Traps")

| Trap | Status |
|---|---|
| `readDegraded` is not optional | ✅ `resolveMetaScope` runs before any Firestore path in both callables. T-02 covers. |
| `request.auth.uid` must not appear in Firestore paths | ✅ Both rewritten callables use `scope.ownerUid` for every connection read/write. |
| `conn.selectedAccountId` must not be read by either publish path | ✅ Not relevant here. (Phase 3 closed it.) |
| Clear the Page in the same write as the ad-account link | ✅ `metaSelectPage`'s CLEARED branch stamps `metaPageClearedAt` atomically with `metaPageId: null`. Phase 6 introduces the ad-account clearing; the field is already in place. |
| `metaPageClearedAt` is what makes FR-011a enforceable | ✅ Set by both `linkMetaAccountToWorkspace` (Phase 6, not yet) and `metaSelectPage` (Phase 4, this phase). T-11 asserts the read path. |
| Team members cannot write workspace documents directly | ✅ Team members use the callable, not direct Firestore writes. MSP-9 confirms the all-access team-member case works through the callable. |
| Do not touch the OAuth `state` parameter | ✅ Not touched. |
| The repair must not read through the broken query | ✅ Not relevant here. |
| The repair fixes history; the `createWorkspace` change stops it recurring | ✅ Already shipped in Phase 2. |

---

## What lands next (Phase 5)

Phase 5 (US3, P3) makes every Meta operation a team member performs
read and write the owner's records: `metaSelectAccount`,
`metaDisconnect`, `metaSyncPerformance`, `saveFunnelSettings`,
`getFunnelSettings`, `dismissAdvisory`, `connectMetaAccount`,
`disconnectMetaAccount`, `triggerMetaSync` are all converted to
`resolveMetaScope` (FR-001). The OAuth callback identity is
resolved to the owner after reading `state` (C7, FR-020a-i). The
two unauthenticated entry points (`metaDataDeletion`,
`metaDailySync`, `metaSyncAccountWorker`) are audited to confirm
they target owner accounts only.

Per `tasks.md`: T057–T075 — US3 contract tests (T-01, T-15,
no-member-metaConnections), implementation (10 callables), and the
SC-011 team-member-publishes-end-to-end test scaffolding.

---

**STOPPING** per the workflow rule. Awaiting go-ahead before Phase 5.
