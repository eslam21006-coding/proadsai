# Phase 3 Report — User Story 1 (T023–T043)

**Phase**: 3 — US1 (P1) 🎯 MVP
**Branch**: `967-meta-workspace-isolation`
**Date**: 2026-08-19
**Status**: ✅ Complete — awaiting go-ahead before Phase 4

---

## Scope

US1 — Publishing lands in the correct client's ad account and Page.

The Phase 2 work is now load-bearing: every publish flows through the
shared `resolveMetaScope` preamble, resolves exactly one workspace,
reads the ad account and Page from that workspace server-side, and
records the five traceability fields on every deployment. The pre-967
fallback to `metaConnections/{ownerUid}.selectedAccountId` (Bug 3)
is gone.

---

## Diff summary

```
 functions/src/__tests__/metaPush.test.ts        (new — T-04/05/06/07/08/24)
 functions/src/__tests__/metaPushPack.test.ts    (new — T-16)
 functions/src/index.ts                          (metaPushCreative + metaPushCreativePack rewrites)
 functions/src/workspaces/index.ts               (barrel export update)
 functions/src/workspaces/metaCallerScope.ts     (resolvePublishWorkspace + resolveWorkspacePage)
 src/App.tsx                                     (metaPublishFailureMessage helper + 5 call sites)
 src/services/metaService.ts                     (rename activeWorkspaceId→workspaceId, expose reason/workspaceName)
```

Plus 9 contract tests covering T-04, T-05, T-06, T-07, T-08 (×3 page-state
variants), T-16 (×2), and T-24 (cross-cutting traceability).

---

## T030–T031 — Workspace and Page resolvers (`metaCallerScope.ts`)

Two new exports sit alongside `resolveMetaScope` / `assertWorkspaceAllowed`
/ `loadActiveWorkspace`:

| Symbol | Returns | Throws |
|---|---|---|
| `resolvePublishWorkspace(scope, requestedWorkspaceId)` | `{ workspace, workspaceIdSource: "request" \| "default" }` | `permission-denied / workspace_not_permitted` (FR-004 / FR-021), `not-found / workspace_not_found` (workspace absent or soft-deleted — FR-024), `failed-precondition / no_workspace_resolved` (FR-012a) |
| `resolveWorkspacePage(workspace, connection)` | `{ pageId, pageName, pageSource: "workspace" \| "legacy_global" \| "none" }` | — (no throws; pure read) |

### `resolvePublishWorkspace` (T030)

Resolves exactly one workspace for a publish. Three branches:

1. **Caller named a workspace** → assert `assertWorkspaceAllowed`
   (FR-004 / FR-021), then `loadActiveWorkspace` (FR-024).
2. **Caller omitted workspaceId** → fall back to
   `resolveDefaultWorkspaceId(scope.ownerUid)`. Throws
   `failed-precondition / reason: 'no_workspace_resolved'` when no
   default exists (FR-012a).
3. **Default resolved** → re-assert `assertWorkspaceAllowed` against
   the resolved id (defence in depth; a no-op for the all-access
   member case).

`workspaceIdSource` records which branch fired, for FR-027 / SC-008.

### `resolveWorkspacePage` (T031)

Three-state page lifecycle (`data-model.md` §1):

```
SET        metaPageId set, metaPageClearedAt null   → workspace's Page
NEVER_SET  metaPageId null, metaPageClearedAt null   → legacy fallback (FR-007)
CLEARED    metaPageId null, metaPageClearedAt set    → 'none' (FR-011a — legacy FORBIDDEN)
```

`metaPageClearedAt` is the load-bearing field — without it
`NEVER_SET` and `CLEARED` are indistinguishable and FR-011a cannot
be enforced (T-013's page field-write lock ensures the field is
server-set only).

`pageSource` is recorded on every deployment so an audit can count
remaining un-migrated workspaces (FR-028).

The function deliberately does NOT throw on a missing Page (FR-015a):
publishing is not gated on a Page while no Meta request consumes it.
A code comment records this as a deferred decision to be reconsidered
when ad creation lands (FR-015b, Constitution Principle XII).

---

## T032–T035 — `metaPushCreative` rewrite (`functions/src/index.ts:3691`)

**Before**: read `metaConnections/{request.auth.uid}`, used
`conn.selectedAccountId` as the ad account (Bug 3 — ignores the
active workspace), read `conn.selectedPageId`/`selectedPageName` as
the Page (FR-006 violation), recorded no workspace routing trace.

**After**: every step reads from the resolved workspace.

| Step | Reads from | Requirement |
|---|---|---|
| Workspace resolution | `resolvePublishWorkspace(scope, requestedWorkspaceId)` | FR-012 / FR-012a / FR-012b |
| Ad account | `wsData.metaAdAccountId` (never `conn.selectedAccountId`) | FR-013 / FR-014 |
| Refusal when no account | `failed-precondition / reason: 'workspace_no_ad_account'` with the workspace name | FR-015 |
| Meta connection path | `metaConnections/{scope.ownerUid}` (owner, not caller) | FR-001 |
| Page | `resolveWorkspacePage(workspace, conn)` | FR-006 / FR-007 / FR-011a / FR-015a |
| Deployment `userId` | `scope.ownerUid` | FR-001 |
| Deployment `pushedByUid` | `scope.callerUid` (audit) | FR-027 |
| Deployment `workspaceId` | resolved workspace id (always populated) | FR-027 |
| Deployment `workspaceIdSource` | `'request'` or `'default'` | FR-027, FR-012 |
| Deployment `pageSource` | `'workspace'` / `'legacy_global'` / `'none'` | FR-027, FR-028 |
| Deployment `pageId` / `pageName` | workspace's resolved values (null is valid) | FR-006, FR-027 |

### Refactor: extracted `metaPushCreativeImpl`

The handler body is now a standalone exported function
`metaPushCreativeImpl(scope, requestData, deps)`. Production wraps it
in `onCall`. The test injects a fake `fetchImpl` and
`metaAppSecretValue` via the `deps` parameter — no live Firebase
emulator, no live Meta API.

Why this matters:

- The test pattern in `workspace.test.ts` (in-memory Firestore stub,
  pure-function mirror) was the established convention. Calling the
  onCall wrapper directly requires `firebase-functions-test`; calling
  the extracted impl is hermetic.
- The callable now wires only Firebase Functions options (region,
  secrets, timeout, memory, cors, maxInstances) — the work is in the
  impl. Single-responsibility.

---

## T036–T038 — `metaPushCreativePack` rewrite (`functions/src/index.ts:5834`)

Identical resolution to C4, with three additions:

1. **Back-compat alias**: `request.data?.workspaceId ?? activeWorkspaceId ?? null`
   (the existing parameter is still accepted alongside the canonical
   `workspaceId`, with the server reading `workspaceId` first).
2. **Resolved once for the whole pack** (FR-016): every `/adimages`
   call and every `/adcreatives` call reuses the same ad account and
   Page — there is no per-item re-resolution, and the `callerPageId`
   passed in the request is **ignored** (FR-013 / FR-014).
3. **Pack deployment record**: one `creativeDeployments/{id}` record
   per pack with the same five traceability fields plus `pack: true`,
   `primaryText`, and the creative id (when /adcreatives succeeds).

**Bug 3 fallback deleted**: the line
`if (!accountId) { accountId = conn.selectedAccountId || null; }` is
gone. A workspace with no linked ad account now refuses with the
named-workspace message instead of falling through to the
account-global selection.

### Refactor: `metaPushCreativePackImpl`

Same pattern as `metaPushCreativeImpl`: standalone function with a
`deps` injection seam for tests.

---

## T039–T042 — Frontend wiring

### T039: `pushCreative` already sends `workspaceId`

`src/services/metaService.ts:234` already accepted `workspaceId`
inside `deploymentMeta` and spread it into the `httpsCallable` payload.
`buildDeploymentMeta` (`src/App.tsx:7872`) writes
`workspaceId: canUseWorkspaces ? activeWorkspaceId : null` for every
publish call site. The pre-existing code path was correct; Phase 3
didn't need to change it.

### T040: `pushCreativePack` parameter rename

```diff
- async pushCreativePack(imageSource: string, adName: string, primaryText: string, pageId?: string, activeWorkspaceId?: string)
+ async pushCreativePack(imageSource: string, adName: string, primaryText: string, pageId?: string, workspaceId?: string)
```

The function now sends both `workspaceId` (canonical) and
`activeWorkspaceId` (legacy alias the backend still accepts per
contract C5). The return shape is enriched with `reason` and
`workspaceName` for the same i18n mapping the single push exposes.

### T041: `activeWorkspaceId` is already passed

The five `pushCreative` call sites in `App.tsx` were already routed
through `buildDeploymentMeta()` which carries the active workspace id.
No call-site changes were needed for workspace propagation.

### T042: i18n key surfacing

Added `metaPublishFailureMessage(result)` next to
`buildDeploymentMeta` in `App.tsx`:

```ts
const metaPublishFailureMessage = (result: {
  message: string;
  reason?: string;
  workspaceName?: string | null;
}): string => {
  switch (result.reason) {
    case "workspace_no_ad_account":
      return t("meta.workspace_no_ad_account", { name: result.workspaceName ?? "" });
    case "no_workspace_resolved":
      return t("meta.no_workspace_resolved");
    default:
      return result.message;
  }
};
```

The five call sites that previously did
`showToast(result.message || 'Push failed', 'error')` now do
`showToast(metaPublishFailureMessage(result) || 'Push failed', 'error')`.
The Phase 1 i18n keys (`meta.workspace_no_ad_account`,
`meta.no_workspace_resolved`) drive the Arabic localisation per
FR-028a / SC-012 — the call site falls through to `result.message`
when the reason is unknown, so the backend's authoritative English
text is preserved as a safe default.

The carousel-slides "Push all" path (no per-item error surfacing)
was updated to use `t('meta.no_workspace_resolved')` directly when
every slide fails (the same `no_workspace_resolved` failure applies
to the whole batch because the workspace was unresolvable before any
slide could be pushed).

---

## T023–T029 — Contract tests

Two new test files use the established in-memory Firestore stub
pattern from `workspace.test.ts`. Both stub `admin.firestore` before
importing `../index.js`, set `process.env.META_APP_SECRET` indirectly
via `deps.metaAppSecretValue`, and inject a fake `fetch` via
`deps.fetchImpl`.

### `functions/src/__tests__/metaPush.test.ts` (new — 8 tests)

| Test | Asserts | Requirement |
|---|---|---|
| T-04 | Publish from `ws-A` ignores `conn.selectedAccountId = "act_WS_B"` — the upload URL targets `act_WS_A` | FR-014 |
| T-05 | No `workspaceId` in request → `resolveDefaultWorkspaceId` returns `ws-default`, `workspaceIdSource: 'default'`, upload hits `act_DEFAULT` | FR-012, FR-012b |
| T-06 | Two workspaces, neither `isDefault: true` → `failed-precondition / reason: 'no_workspace_resolved'` | FR-012a |
| T-07 | Workspace with `metaAdAccountId: null` → `failed-precondition / reason: 'workspace_no_ad_account'`, message includes the workspace name ("Brand X"), no Meta upload attempted | FR-015 |
| T-08 | Workspace `NEVER_SET` (no Page, no clearedAt) → publish SUCCEEDS, `pageSource: 'legacy_global'` | FR-015a, FR-007 |
| T-08b | Workspace `CLEARED` (no Page, clearedAt set) → publish SUCCEEDS, `pageSource: 'none'` (legacy FORBIDDEN per FR-011a) | FR-011a |
| T-08c | Workspace `SET` (own Page) → publish SUCCEEDS, `pageSource: 'workspace'` | FR-006, FR-008 |
| T-24 | Across three publishes covering `workspace` / `none` / `legacy_global` × `request` / `default`, every deployment record has `workspaceId`, `workspaceIdSource`, `adAccountId`, `pageSource`, and `pushedByUid` populated (no field undefined) | FR-027, SC-008 |

### `functions/src/__tests__/metaPushPack.test.ts` (new — 2 tests)

| Test | Asserts | Requirement |
|---|---|---|
| T-16 | Pack from `ws-pack` → both `/adimages` and `/adcreatives` hit `act_PACK`, the `/adcreatives` `object_story_spec.page_id` is `page-pack` (workspace's Page, NOT legacy fallback), the deployment record carries the five traceability fields plus `pack: true` | FR-013, FR-014, FR-016, FR-027 |
| T-16b | `activeWorkspaceId` accepted as alias of `workspaceId` (back-compat) | C5 |

### Stub enhancements

The pre-existing in-memory Firestore stub from `workspace.test.ts`
was reused with two extensions:

1. **`settings()` no-op**: `index.ts:88` calls `admin.firestore().settings(...)`
   at module load. The stub returns an object whose `settings()` is a
   self-recursive no-op so the import doesn't throw.
2. **`where().limit()` chainable filters**: `resolveDefaultWorkspaceId`
   uses `where('isDefault', '==', true).limit(1)`. The stub now
   implements the `==` / `!=` operator family and `.limit(n)` so the
   T-06 ("no default workspace") and T-05 ("default workspace
   resolved") assertions reflect production query semantics.

---

## T043 — Single-workspace-plan regression

Starter and Pro plans both have `workspaceLimit: 1` and never populate
an active workspace client-side. The path is identical to a
multi-workspace publish where the caller omits `workspaceId`: the
server falls back to `resolveDefaultWorkspaceId`.

The T-05 contract test IS the single-workspace-plan regression proof
— it asserts the "no workspaceId → default" path end-to-end
(resolution, `workspaceIdSource: 'default'`, ad-account targeting,
Page source, deployment record). The frontend never added a new
step for these plans because `buildDeploymentMeta` already wrote
`workspaceId: null` for them and `canUseWorkspaces` hides the
workspace selector.

Live end-to-end verification on a Starter and a Pro account is
operator-gated (live Firebase required). The runbook is appended to
`specs/967-meta-workspace-isolation/evidence-r1.md` with the same
paste-and-go format as the R1/R4 repair evidence.

---

## Verification

- `npm run build` (frontend) — **pass** (`tsc -b && vite build`).
  No new warnings.
- `cd functions && npm run build` — **pass** (`tsc` strict mode
  + asset copy). `metaPushCreativeImpl` and `metaPushCreativePackImpl`
  are exported with the right types; the callable wrappers compile.
- `node lib/__tests__/workspace.test.js` — 12 passed, 0 failed,
  13 pre-existing skipped.
- `node lib/__tests__/metaCallerScope.test.js` — 7 passed, 0 failed.
- `node lib/__tests__/workspaceRepair.test.js` — 9 passed, 0 failed.
- `node lib/__tests__/metaPush.test.js` — **8 passed, 0 failed**.
- `node lib/__tests__/metaPushPack.test.js` — **2 passed, 0 failed**.
- `node lib/__tests__/teamWorkspaceAccess.test.js` — unchanged,
  still passes.

38 total active tests pass (US1 contract tests + Phase 2
foundational tests). The 13 pre-existing skipped tests in
`workspace.test.ts` are unchanged placeholders.

---

## Trap compliance (`quickstart.md` "Traps")

| Trap | Status |
|---|---|
| `readDegraded` is not optional | ✅ `resolveMetaScope` runs before any Firestore path. T-02 covers. |
| `request.auth.uid` must not appear in Firestore paths | ✅ The publish path now uses `scope.ownerUid` (resolved) for every Firestore read/write. The deployment `userId` is the owner; `pushedByUid` is the caller (audit only). |
| `conn.selectedAccountId` must not be read by either publish path | ✅ Deleted from both `metaPushCreative` and `metaPushCreativePack`. T-04 + T-16 assert. |
| Clear the Page in the same write as the ad-account link | ✅ Not relevant here (Phase 6 introduces the writes; `resolveWorkspacePage` already honours the cleared state — T-08b). |
| `metaPageClearedAt` is what makes FR-011a enforceable | ✅ `resolveWorkspacePage` reads `metaPageClearedAt` and refuses the legacy fallback when set. T-08b asserts. |
| Team members cannot write workspace documents directly | ✅ Not relevant here (security rules unchanged); `updateWorkspace` still gated by `assertNotTeamMember`. |
| Do not touch the OAuth `state` parameter | ✅ Not touched. |
| The repair must not read through the broken query | ✅ Not relevant here. |
| The repair fixes history; the `createWorkspace` change stops it recurring | ✅ Phase 2 source fix already shipped; Phase 3 depends on it (T-05 / T-12 / T-19a). |

---

## What lands next (Phase 4)

Phase 4 (US2, P2) makes Page selection per-workspace: `metaSelectPage`
becomes workspace-scoped (C1), `getMetaConnection` learns the
workspace-aware Page surface (C6), and the Funnel Settings selector
+ page picker call sites in `src/App.tsx` read from the workspace
rather than the account-global selection. The Phase 2 Page field
shape and Phase 3 `resolveWorkspacePage` are the load-bearing pieces
— Phase 4 writes to them.

Per `tasks.md`: T044–T056 — US2 contract tests (T-11, T-12,
`page_not_available`), implementation (C1 + C6), and the SC-006
regression check (NEVER_SET still falls back to the legacy Page
until a per-workspace Page is chosen).

---

**STOPPING** per the workflow rule. Awaiting go-ahead before Phase 4.
