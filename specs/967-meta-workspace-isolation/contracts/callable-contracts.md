# Phase 1 Contracts: Meta Callables

**Feature**: `967-meta-workspace-isolation` | **Date**: 2026-08-18
**Region**: all callables deploy to `europe-west1` (unchanged)

Conventions below apply to every contract in this document.

---

## Universal preamble (applies to all 15 authenticated operations)

```ts
if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
const scope = await resolveCallerScope(request.auth.uid);

// FR-003 — MUST come before any use of scope.ownerUid.
if (scope.readDegraded) {
  throw new HttpsError("unavailable", "Could not verify your account. Please retry.");
}
const ownerUid = scope.ownerUid;      // every Firestore path uses this
const callerUid = request.auth.uid;   // audit only, never a data path
```

**Invariants**

- `request.auth.uid` MUST NOT appear in any Firestore path in these files after this phase.
- Workspace-scoped operations MUST additionally pass the FR-004 guard below.
- Region, CORS, and secret bindings are unchanged.

```ts
// FR-004 / FR-021 — workspace authorisation
function assertWorkspaceAllowed(scope, workspaceId) {
  if (scope.allowedWorkspaceIds !== "ALL" &&
      !scope.allowedWorkspaceIds.includes(workspaceId)) {
    throw new HttpsError("permission-denied", "No access to this workspace.",
                         { reason: "workspace_not_permitted" });
  }
}
```

---

## C1 · `metaSelectPage` — becomes workspace-scoped

| | |
|---|---|
| **Requirement** | FR-005, FR-006, FR-008, FR-018 |
| **Breaking** | No — `workspaceId` is optional; omitting it preserves today's behaviour |

**Request**
```ts
{ pageId: string; pageName?: string; workspaceId?: string }
```

**Behaviour**
1. Universal preamble.
2. Resolve `wsId = workspaceId ?? await resolveDefaultWorkspaceId(ownerUid)`.
3. `assertWorkspaceAllowed(scope, wsId)`; load the workspace; assert active.
4. Verify `pageId` exists in `metaConnections/{ownerUid}.pages[]` → else `failed-precondition`, `reason: 'page_not_available'`.
5. Write `{ metaPageId, metaPageName: name.slice(0,200), metaPageClearedAt: null }` to the workspace.
6. Also write `selectedPageId`/`selectedPageName` on `metaConnections/{ownerUid}` — keeps a code-only revert clean (FR-030).

**Response** `{ ok: true, workspaceId: string }`

**Errors** `unauthenticated` · `unavailable` (degraded) · `permission-denied` (`workspace_not_permitted`) · `not-found` (workspace) · `failed-precondition` (`page_not_available`, `workspace_deleted`)

---

## C2 · `linkMetaAccountToWorkspace` — team members permitted, Page cleared

| | |
|---|---|
| **Requirement** | FR-011, FR-011a, FR-011b, FR-017 |
| **Breaking** | No |

**Request** `{ workspaceId: string; metaAdAccountId: string; metaAdAccountName?: string }`

**Behaviour**
1. Universal preamble. **Remove `assertNotTeamMember(uid, "link_meta")`** (Bug 5).
2. `assertWorkspaceAllowed`; load workspace under `ownerUid`; assert active.
3. Verify the ad account is in `metaConnections/{ownerUid}.adAccounts[]` (existing check, now owner-scoped) → else `failed-precondition`.
4. `probeMetaRole(token, metaAdAccountId)`.
5. Write atomically:
   ```ts
   { metaAdAccountId, metaAdAccountName, metaRoleAtLinkTime: role,
     metaPageId: null, metaPageName: null,        // FR-011 unconditional clear
     metaPageClearedAt: Date.now() }              // FR-011a
   ```
   The clear MUST be in the same write as the link — a separate write can leave the workspace holding one client's Page against another's ad account.

**Response** `{ ok: true, metaRoleAtLinkTime: string, pageCleared: boolean }`
`pageCleared` drives the FR-011b notice.

---

## C3 · `unlinkMetaAccountFromWorkspace` — Page cleared on removal too

| | |
|---|---|
| **Requirement** | FR-011 ("including removing it entirely"), FR-017 |

Same as C2 without the ad-account validation. Writes `metaAdAccountId: null, metaAdAccountName: null, metaRoleAtLinkTime: null, metaPageId: null, metaPageName: null, metaPageClearedAt: Date.now()`.

Without the clear, an unlink→relink to a different client's account would inherit the previous client's Page.

---

## C4 · `metaPushCreative` — workspace-routed

| | |
|---|---|
| **Requirement** | FR-012, FR-012a, FR-012b, FR-013, FR-014, FR-015, FR-015a, FR-027 |
| **Breaking** | No — `workspaceId` optional, server resolves the default |

**Request** `{ imageBase64: string; adName?: string; workspaceId?: string; …existing metadata }`

**Behaviour**
1. Universal preamble.
2. **Resolve exactly one workspace** (FR-012):
   ```ts
   let wsId = request.data.workspaceId ?? null;
   let workspaceIdSource = wsId ? 'request' : 'default';
   if (!wsId) {
     try { wsId = await resolveDefaultWorkspaceId(ownerUid); }
     catch { throw new HttpsError("failed-precondition",
              "No workspace could be determined for this publish.",
              { reason: 'no_workspace_resolved' }); }   // FR-012a
   }
   ```
3. `assertWorkspaceAllowed`; load workspace; assert active (FR-004; covers the soft-delete-mid-publish edge case).
4. **Resolve the ad account from the workspace only** (FR-013, FR-014):
   ```ts
   const accountId = ws.metaAdAccountId;
   if (!accountId) throw new HttpsError("failed-precondition",
      `"${ws.name}" has no Meta ad account linked. Link one to publish from it.`,
      { reason: 'workspace_no_ad_account', workspaceName: ws.name });   // FR-015
   ```
   **`conn.selectedAccountId` MUST NOT be read.** This line is the bug.
5. **Resolve the Page — never blocking** (FR-015a):
   ```ts
   let pageId = ws.metaPageId ?? null, pageSource = 'workspace';
   if (!pageId && ws.metaPageClearedAt == null) {          // NEVER_SET only
     pageId = conn.selectedPageId ?? null;                 // FR-007
     pageSource = pageId ? 'legacy_global' : 'none';
   } else if (!pageId) { pageSource = 'none'; }            // CLEARED — FR-011a
   ```
6. Upload to `/{accountId}/adimages` (unchanged).
7. Record with `workspaceId`, `workspaceIdSource`, `pageId`, `pageSource`, `pushedByUid` (FR-027).

**Response** `{ success: true, imageHash, workspaceId, pageSource }`

**Errors** as preamble, plus `failed-precondition` (`no_workspace_resolved`, `workspace_no_ad_account`, `workspace_deleted`)

---

## C5 · `metaPushCreativePack` — same rules, per pack

| | |
|---|---|
| **Requirement** | FR-012–FR-016 |

Identical resolution to C4. Two changes to current behaviour:
- The existing `activeWorkspaceId` parameter is accepted as an alias of `workspaceId`.
- **Delete the fallback** at `index.ts:5732-5734` (`accountId = conn.selectedAccountId`) — FR-014.

Per FR-016 the workspace is resolved **once** for the whole pack; every item reuses that ad account and Page. No per-item re-resolution.

---

## C6 · `getMetaConnection` — owner-scoped, workspace-aware Page

| | |
|---|---|
| **Requirement** | FR-001, FR-006 |

Reads `metaConnections/{ownerUid}`. Accepts optional `workspaceId`; when the workspace resolves, the response's active Page reflects the workspace (FR-006), with `pageSource` telling the client whether it came from the workspace or the legacy global.

**Response adds** `{ activePageId, activePageName, pageSource: 'workspace'|'legacy_global'|'none', isTeamMember: boolean }`

---

## C7 · `metaOAuthCallback` — resolve identity to owner

| | |
|---|---|
| **Requirement** | FR-020, FR-020a-i, FR-020a-ii |
| **Type** | `onRequest` — **no `request.auth`** |

**Behaviour**
1. Read `state` exactly as today. **Do not change how it is produced, transmitted, or validated** (FR-020a-ii) — the state-trust work is a separate phase.
2. Resolve after reading:
   ```ts
   const scope = await resolveCallerScope(state);
   if (scope.readDegraded) { /* render retry page, write nothing */ }
   const ownerUid = scope.ownerUid;
   ```
3. Write the connection to `metaConnections/{ownerUid}` with `userId: ownerUid`, plus `connectedByUid: state` for audit.

A team member's authorisation therefore lands on the owner's record and is usable by everyone immediately (FR-020).

---

## C8 · `metaDisconnect` / `disconnectMetaAccount` — scoped, warned, recorded

| | |
|---|---|
| **Requirement** | FR-020, FR-020a |

Universal preamble; delete `metaConnections/{ownerUid}`. Record `disconnectedByUid: callerUid` in the audit log.
The account-wide scope warning (FR-020a) is a **client-side** confirmation before the call; the server records who acted.

---

## C9 · `metaSyncPerformance` / `triggerMetaSync` — identity only

| | |
|---|---|
| **Requirement** | FR-001, FR-009a |

Universal preamble; swap every `uid` for `ownerUid`. **No other change** — the sync keeps iterating all active ad accounts, and performance data stays account-global (FR-009a and the stated non-goal).

---

## C10 · `saveFunnelSettings` / `getFunnelSettings` / `dismissAdvisory`

| | |
|---|---|
| **Requirement** | FR-001, FR-004 |

Universal preamble; `assertWorkspaceAllowed` on the supplied `workspaceId`; all paths under `ownerUid`.

---

## C11 · `connectMetaAccount` — team members permitted

| | |
|---|---|
| **Requirement** | FR-020 |

Universal preamble; writes to `metaConnections/{ownerUid}`. Any team-member block is removed.

---

## Frontend contract changes

| Surface | Change | Requirement |
|---|---|---|
| Page picker (`MetaPagePickerModal` via `App.tsx:3785`) | Pass `workspaceId` to `metaService.selectPage` | FR-005, FR-008 |
| `metaService.pushCreative` | Send `workspaceId` | FR-012 |
| `metaService.pushCreativePack` | Rename `activeWorkspaceId` → `workspaceId` (accept both server-side) | FR-012 |
| Workspace switch (`App.tsx`) | Stop writing global Page/account state; read the workspace's own | FR-006 |
| Ad-account linker | Surface `pageCleared` from C2 as a notice | FR-011b |
| Funnel Settings selector | No change once R1 lands — the data was always the problem | FR-022 |
| `src/i18n.tsx` | Paired en/ar keys for every new message, simple Fusha | FR-028a–c |

---

## Contract test matrix

| Test | Asserts | Requirement |
|---|---|---|
| T-01 | Team member call reads/writes owner paths only | FR-001, FR-002 |
| T-02 | `readDegraded` → `unavailable`, no write | FR-003 |
| T-03 | Workspace outside permitted set → `permission-denied` | FR-004, FR-021 |
| T-04 | Push with workspace A ignores `selectedAccountId` set to B | FR-014 |
| T-05 | Push without `workspaceId` uses the default workspace | FR-012, FR-012b |
| T-06 | Push with no resolvable workspace → `no_workspace_resolved` | FR-012a |
| T-07 | Push from workspace with no ad account → refused, names workspace | FR-015 |
| T-08 | Push from workspace with no Page → **succeeds**, `pageSource: 'none'` | FR-015a |
| T-09 | Link ad account clears Page in the same write | FR-011 |
| T-10 | Unlink clears Page | FR-011 |
| T-11 | CLEARED workspace does not inherit the legacy global Page | FR-011a |
| T-12 | NEVER_SET workspace does inherit it | FR-007 |
| T-13 | Team member links ad account successfully | FR-017 |
| T-14 | Team member create/delete/restore workspace still refused | FR-019 |
| T-15 | OAuth callback with a member's state writes to the owner's record | FR-020a-i |
| T-16 | Pack: all items share one workspace's account and Page | FR-016 |
| T-17 | Workspace list returns documents lacking `deletedAt` | FR-022, R1 |
| T-18 | Every new i18n key exists in both languages | FR-028a |
| T-19 | `createWorkspace` marks the first workspace on an account as default; the second is not | FR-026d |
| T-20 | Repair is idempotent — second run writes nothing | FR-026e |
| T-21 | Repair writes no Page field | FR-026f |
| T-22 | Repair picks the oldest active workspace when an account has no default | FR-026d |
| T-23 | A record with a non-null `deletedAt` is untouched by both repair passes and cannot become the default | FR-024, FR-026d |
| T-24 | Every deployment record has all five traceability fields populated across a publish sample | FR-027, SC-008 |
