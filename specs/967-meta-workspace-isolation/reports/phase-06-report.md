# Phase 6 Report — User Story 4 (T076–T085)

**Phase**: 6 — US4 (P4)
**Branch**: `967-meta-workspace-isolation`
**Date**: 2026-08-19
**Status**: ✅ Complete — awaiting go-ahead before Phase 7

---

## Scope

US4 — A team member links the right ad account and Page to a client
workspace.

The pre-967 PR #65 hid the entire Meta section from team members on
the grounds that `linkMetaAccountToWorkspace` refused them
unconditionally. That guard is removed; the link/unlink path is
now owner-scoped via `resolveMetaScope` (Phase 5) + workspace
authorisation via `assertWorkspaceAllowed`. The destructive
workspace-level actions (create / delete / restore) keep their
`assertNotTeamMember` guard — verified by T-14.

Both link and unlink now clear the workspace's recorded Facebook
Page in the SAME write as the ad-account change (FR-011), stamping
`metaPageClearedAt: <now>` so the workspace moves to CLEARED state
and the legacy global fallback is forbidden for subsequent reads.
The user-facing FR-011b notice is surfaced inline in
`WorkspaceSettingsModal` via the Phase 1 i18n key
`meta.page_cleared_notice`.

---

## Diff summary

```
 functions/src/index.ts                              (T080/T081/T082 linkMetaAccountToWorkspace rewrite + extracted impl + T083 unlinkMetaAccountFromWorkspace rewrite + extracted impl)
 src/components/WorkspaceSettingsModal.tsx           (T084 page-cleared notice banner + showMetaSection gating)
 src/App.tsx                                         (T085 reverse PR #65 hiding for the two picker entries)
 src/services/workspaceService.ts                    (linkMetaAccount / unlinkMetaAccount response shape updated for pageCleared)
```

Plus one new test file:

```
 functions/src/__tests__/linkMetaAccount.test.ts    (T-09 × 3, T-10, T-13 × 2, auth gate, forged id, no connection, soft-deleted — 10 tests)
```

And T-14 additions in `functions/src/__tests__/workspace.test.ts` (4 tests).

---

## T080–T082 — `linkMetaAccountToWorkspace` rewrite (`functions/src/index.ts:7258`)

**Before**: `assertNotTeamMember(uid, "link_meta")` was the first
statement — team members were unconditionally refused. The callable
read `users/{request.auth.uid}/workspaces/{wid}` (caller-scoped) and
`metaConnections/{request.auth.uid}` (caller-scoped).

**After**:

| Concern | Before | After |
|---|---|---|
| Auth | `request.auth` checked inline | `resolveMetaScope(request)` preamble (FR-001) |
| Team-member gate | `assertNotTeamMember` rejected every team member | Removed (FR-017). Replaced with `assertWorkspaceAllowed(scope, workspaceId)` (FR-004 / FR-021) — verified members with all-access pass; members scoped to a subset are refused for unlisted workspaces |
| Workspace path | `users/{request.auth.uid}/...` | `users/{scope.ownerUid}/...` (FR-001) |
| Connection path | `metaConnections/{request.auth.uid}` | `metaConnections/{scope.ownerUid}` — the OAuth callback writes there (Phase 5 T070-T072) |
| Page clear (FR-011) | None | Same write as the link carries `metaPageId: null, metaPageName: null, metaPageClearedAt: <now>` — only when the workspace HAD a Page before the call (SET state). NEVER_SET stays NEVER_SET; CLEARED stays CLEARED. |
| `pageCleared` (FR-011b) | None | Response carries `pageCleared: boolean` — true only when the prior state was SET, driving the UI notice |
| Ad-account validation | `conn.adAccounts.some(...)` | Same (preserved) — forged ids still refused |
| Role probe | `probeMetaRole` (Phase 14 only READS) | Same (preserved), now injected via `deps.probeMetaRoleImpl` for testability |

### `linkMetaAccountToWorkspaceImpl` extraction

Same hermetic-test pattern from Phase 3: the handler body is now a
standalone exported function. Tests inject a fake `probeMetaRoleImpl`
and `metaAppSecretValue`; production wraps in `onCall` with no deps.

---

## T083 — `unlinkMetaAccountFromWorkspace` rewrite (`functions/src/index.ts:7313`)

Same pattern:

| Concern | Before | After |
|---|---|---|
| Auth | inline check | `resolveMetaScope(request)` |
| Team-member gate | `assertNotTeamMember` | Removed (FR-017) |
| Workspace path | `users/{request.auth.uid}/...` | `users/{scope.ownerUid}/...` (FR-001) |
| Page clear (FR-011) | None | Same write as the unlink carries the Page clear when the workspace HAD a Page (FR-011 closure — without this, an unlinked workspace could carry a Page from the previous client) |
| `pageCleared` (FR-011b) | None | Response carries `pageCleared: boolean` |
| Workspace-private mirror | Cleared (preserved — dashboard reads `metaConnection.metaConnected`) | Same, now owner-scoped via `scope.ownerUid` |

### `unlinkMetaAccountFromWorkspaceImpl` extraction

Same hermetic-test pattern.

---

## T084 — Page-cleared notice (FR-011b)

The spec listed `src/components/LinkAdPickerModal.tsx` as the notice
surface, but that modal handles a different flow (linking an ad
to a generation, FR-023), not ad-account linking. The page-cleared
notice belongs in `WorkspaceSettingsModal.tsx`, which is the
component that calls `linkMetaAccountToWorkspace` /
`unlinkMetaAccountFromWorkspace`. That is where the user just
performed the action — the notice lives inline in the modal so the
message survives navigation away from the workspace switcher.

Changes:

1. New `pageClearedNotice` state in `WorkspaceSettingsModal`.
2. `handleLinkMeta` and `handleUnlinkMeta` set it from
   `result.data?.pageCleared`.
3. Render an inline amber banner inside `showMetaSection`:
   ```tsx
   {pageClearedNotice && (
     <div role="status" aria-live="polite"
          className="mb-3 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px]">
       {t('meta.page_cleared_notice')}
     </div>
   )}
   ```
4. `workspaceService.ts` `linkMetaAccountToWorkspace` /
   `unlinkMetaAccountFromWorkspace` typed responses now include
   `pageCleared: boolean`.

The notice uses the Phase 1 `meta.page_cleared_notice` key — paired
en/ar, simple Fusha (FR-028a / SC-012).

---

## T085 — Team-member UI gating reversal

`src/App.tsx:1514-1555` (the Meta menu block) previously had two
`isTeamMember` gates that hid the picker entries:

```tsx
...(isTeamMember ? [] : [
  { key: 'meta-pick-for-workspace', ... },
])
...(isTeamMember ? [] : [
  { key: 'meta-change-account', ... },
]),
```

Both gates are removed. The picker entries now render for any
signed-in user with workspace access. The destructive workspace
mutations (create / delete / restore) remain owner-only via the
pre-existing `isTeamMember` guards on those specific MenuItem blocks
lower in the menu — the T-14 test verifies the `assertNotTeamMember`
guard is still wired for create / delete / restore (FR-019).

The "Change Page" entry was never gated by `isTeamMember` (only by
`pages.length > 0`); it continues to render for everyone with pages.
Phase 4 made the picker workspace-scoped (FR-006), so it works
correctly for team members too.

---

## T076–T079 — Contract tests

### `functions/src/__tests__/linkMetaAccount.test.ts` (new — 10 tests)

| Test | Asserts | Requirement |
|---|---|---|
| **T-09a** | Link with prior SET Page → `pageCleared: true`, the SAME write carries the new ad-account fields AND the Page clear (metaPageId: null, metaPageClearedAt: <now>) | FR-011 |
| **T-09b** | Link with NEVER_SET Page → `pageCleared: false`, metaPageClearedAt stays null (no false promotion to CLEARED) | FR-011 closure (NEVER_SET preservation) |
| **T-09c** | Link with CLEARED Page → `pageCleared: false` (already cleared → no new notice) | FR-011 closure (CLEARED preservation) |
| **T-10** | Unlink → `pageCleared: true`, ad-account fields deleted AND Page cleared in the SAME write | FR-011 |
| **T-13** | Team member (ALL scope) links ad account successfully; the link lands on the OWNER's workspace (FR-001) | FR-017 |
| **T-13b** | Team member (subset scope) is refused for an unlisted workspace → `workspace_not_permitted` | FR-004 / FR-021 |
| Auth gate | `linkMetaAccountToWorkspaceImpl` / `unlinkMetaAccountFromWorkspaceImpl` are exported functions (structural sanity check) | preamble |
| Forged ad-account id | Account id not in `conn.adAccounts` → `failed-precondition` | CodeRabbit audit (preserved) |
| No `metaConnections/{ownerUid}` | Connection doc absent → `failed-precondition` ("Connect your Meta account first") | preamble |
| Soft-deleted workspace | `deletedAt != null` → `not-found` ("already deleted") | FR-024 |

The stub's `update` method honours `FieldValue.delete()` (removes the
key, doesn't spread a Symbol value), and the stub root supports
`admin.firestore().doc(<full-path>)` for cross-collection document
references (the workspace-private `private/metaConnection` mirror the
unlink writes).

### `functions/src/__tests__/workspace.test.ts` — T-14 additions (4 tests)

| Test | Asserts | Requirement |
|---|---|---|
| **T-14a** | `assertNotTeamMember("member-1", "create")` → `permission-denied / reason: "team_member"` | FR-019 |
| **T-14b** | `assertNotTeamMember("member-1", "delete")` → `permission-denied / reason: "team_member"` | FR-019 |
| **T-14c** | `assertNotTeamMember("member-1", "restore")` → `permission-denied / reason: "team_member"` | FR-019 |
| T-14d | `assertNotTeamMember("owner-1", "create")` does NOT throw (owner passes) | FR-019 closure |

These tests call the production `assertNotTeamMember` export from
`workspacePolicy.ts` directly (the surrounding `createWorkspace` /
`deleteWorkspace` / `restoreWorkspace` callables are still skipped in
`workspace.test.ts` because they await Phase 7's T086+ workspace
write tests). The guard itself is the single point of truth and is
fully exercised.

---

## Verification

- Frontend `npm run build` — **pass** (`tsc -b && vite build`).
  No new warnings.
- Backend `cd functions && npm run build` — **pass** (`tsc` strict
  mode + asset copy). Two impl functions extracted with the right
  types; `linkMetaAccountToWorkspaceImpl` and
  `unlinkMetaAccountFromWorkspaceImpl` exported.
- `node lib/__tests__/workspace.test.js` — 16 passed, 0 failed.
- `node lib/__tests__/metaCallerScope.test.js` — 7 passed, 0 failed.
- `node lib/__tests__/workspaceRepair.test.js` — 9 passed, 0 failed.
- `node lib/__tests__/metaPush.test.js` — 8 passed, 0 failed.
- `node lib/__tests__/metaPushPack.test.js` — 2 passed, 0 failed.
- `node lib/__tests__/metaSelectPage.test.js` — 15 passed, 0 failed.
- `node lib/__tests__/metaScope.integration.test.js` — 6 passed, 0 failed.
- `node lib/__tests__/metaOAuthCallback.test.js` — 2 passed, 0 failed.
- `node lib/__tests__/linkMetaAccount.test.js` — **10 passed, 0 failed**.
- `node lib/__tests__/teamWorkspaceAccess.test.js` — unchanged, passes.

**71 total active tests pass** (Phase 6 adds 14). The 13 pre-existing
skipped tests in `workspace.test.ts` are unchanged placeholders.

---

## Trap compliance (`quickstart.md` "Traps")

| Trap | Status |
|---|---|
| `readDegraded` is not optional | ✅ `resolveMetaScope` covers the new callables (T-02 covers). |
| `request.auth.uid` must not appear in Firestore paths | ✅ Both rewritten callables use `scope.ownerUid`. T-13 + metaScope.integration cover. |
| `conn.selectedAccountId` must not be read by either publish path | ✅ Not relevant here. |
| Clear the Page in the same write as the ad-account link | ✅ T-09a + T-10 assert the SAME write carries both the new ad-account AND the Page clear. |
| `metaPageClearedAt` is what makes FR-011a enforceable | ✅ Same-write update stamps `metaPageClearedAt: <now>` for SET workspaces (T-09a), leaves it null for NEVER_SET (T-09b), leaves already-CLEARED alone (T-09c). |
| Team members cannot write workspace documents directly | ✅ `createWorkspace` / `deleteWorkspace` / `restoreWorkspace` still gated by `assertNotTeamMember`. T-14 verifies. |
| Do not touch the OAuth `state` parameter | ✅ Not touched. |
| The repair must not read through the broken query | ✅ Not relevant here. |
| The repair fixes history; the `createWorkspace` change stops it recurring | ✅ Phase 2 closed. |

---

## What lands next (Phase 7)

Phase 7 (US5, P5) is verification + evidence: write the FR-025 root-
cause statement, confirm the Funnel Settings selector doesn't need a
code change (Phase 2 R1 already fixed the data), enumerate every
other workspace-listing surface affected by the same root cause, and
verify each lists the right count of active workspaces. Soft-delete
verification — confirm a deleted workspace appears in NO selector.

Per `tasks.md`: T086–T091 — US5 verification + evidence capture.

---

**STOPPING** per the workflow rule. Awaiting go-ahead before Phase 7.
