# Batch 01 Verification — T008 + T006 consumer audit

**Branch**: `965-team-workspace-access` (worktree `D:\proads-worktrees\fix-issue-d`)
**Date**: 2026-07-27
**Verdict**: **Both items verified safe** — proceed to Batch 02.

## Verify 1 — T008 membership check preserved in `getWorkspaceGenerations`

**File**: `functions/src/index.ts:6731-6764`
**Verdict**: ✅ **Safe.** The `memberQuery` membership check is still in place. Only the per-workspace `workspaceAccess.includes(workspaceId)` narrowing was removed.

### Current code (verbatim, lines 6731–6764)

```ts
export const getWorkspaceGenerations = onCall({
    region: "europe-west1",
    cors: true,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
    const uid = request.auth.uid;
    const data = asObjectPayload(request.data);
    const workspaceId = requireNonEmptyString(data.workspaceId, "workspaceId");
    const reqLimit = validatePositiveIntLimit(data.limit, "limit", 50);
    const cursor = validateTimestampIdCursor(data.cursor, "cursor");

    const wsSnap = await admin.firestore().collectionGroup("workspaces").where(admin.firestore.FieldPath.documentId(), "==", workspaceId).limit(1).get();
    if (wsSnap.empty) throw new HttpsError("not-found", "Workspace not found.");

    const wsDoc = wsSnap.docs[0];
    const ownerUid = wsDoc.ref.parent.parent?.id;
    if (!ownerUid) throw new HttpsError("not-found", "Workspace not found.");
    assertWorkspaceActive(wsDoc);

    if (uid !== ownerUid) {
        // Team docs are auto-IDed; member doc stores the teammate's auth uid as `uid`
        // (see createTeamInvite accept path — txn.set({ uid: callerUid, ... })).
        // ISSUE-D FR-004 / FR-004a: once a member doc under the owner is found,
        // the caller's reach is the full account — the stored per-workspace
        // allowlist is NOT consulted here. The membership check is the
        // boundary; the workspace allowlist is intentionally ignored.
        const memberQuery = await admin.firestore()
            .collection(`users/${ownerUid}/team`)
            .where("uid", "==", uid)
            .limit(1)
            .get();
        if (memberQuery.empty) {
            throw new HttpsError("permission-denied", "You don't have access to this workspace.");
        }
    }
```

### What this means

- The `if (uid !== ownerUid)` gate only runs for non-owners. The owner still has direct access (no membership check needed).
- The `memberQuery` lookup against `users/${ownerUid}/team` is preserved. An empty result still throws `permission-denied`. Only after that membership proof succeeds does the callable proceed.
- The removed line is the per-workspace narrowing that used `memberData.workspaceAccess ?? []`. The member doc is still read (line 6730) for the existence check; the `workspaceAccess.includes(workspaceId)` test is gone.
- The `assertWorkspaceActive(wsDoc)` soft-delete check is preserved (line 6725 of the file before this block, line 6748 of the current file).
- A non-member authenticated user (caller with no `isTeamMember` flag and not the owner) reaches the empty `memberQuery` and is denied. The check still functions as a security boundary.

## Verify 2 — T006 "ALL" handled by every consumer of `resolveCallerScope`

**File**: `functions/src/workspaces/workspacePolicy.ts:150-202`
**Verdict**: ✅ **Safe.** Every consumer of the scope shape correctly handles `"ALL"` before calling `.includes()` or `.length`. The only production consumer is `getUserProjects.ts`; `getWorkspaceGenerations` does its own per-callable membership check (verified in Verify 1 above) and does not consume `allowedWorkspaceIds`.

### Production consumer inventory

`grep "resolveCallerScope" functions/src/**/*.ts` returns 16 matches. Filtering for the only callable consumers in production code:

| Consumer | File | Reads `allowedWorkspaceIds`? | Handles `"ALL"`? |
|---|---|---|---|
| `getUserProjects` | `functions/src/savedProjects/getUserProjects.ts:39` | Yes | ✅ Yes — both call sites guard with `!== "ALL"` before `.includes()` / `.length` |
| `getWorkspaceGenerations` | `functions/src/index.ts:6731` | No (does its own member-doc check — see Verify 1) | N/A |

### `getUserProjects.ts` (verbatim, lines 39–66)

```ts
const { ownerUid, allowedWorkspaceIds } = await resolveCallerScope(callerUid);

if (workspaceId) {
    if (allowedWorkspaceIds !== "ALL" && !allowedWorkspaceIds.includes(workspaceId)) {
        console.warn(`phase13 ▸ permission-denied caller=${callerUid} workspace=${workspaceId}`);
        throw new HttpsError("permission-denied", "Workspace access denied");
    }
}

// Fetch one extra row so we can tell "exactly N items returned" apart from
// "there's a next page" without an extra round-trip.
let q: admin.firestore.Query = admin.firestore().collection(`users/${ownerUid}/projects`)
    .orderBy("timestamp", "desc")
    .orderBy("id", "desc")
    .limit(effectivePageSize + 1);

if (workspaceId) {
    q = q.where("workspaceId", "==", workspaceId);
} else if (allowedWorkspaceIds !== "ALL" && allowedWorkspaceIds.length > 0) {
    const wsSlice = allowedWorkspaceIds.slice(0, 30);
    if (allowedWorkspaceIds.length > wsSlice.length) {
        console.warn(
            `phase13 ▸ getUserProjects allowedWorkspaceIds truncated for caller=${callerUid} ` +
            `total=${allowedWorkspaceIds.length} kept=${wsSlice.length} omitted=${allowedWorkspaceIds.length - wsSlice.length}`,
        );
    }
    q = q.where("workspaceId", "in", wsSlice);
}
```

### Why this is correct

- **Line 42** (`if (workspaceId) { … }`): the explicit `allowedWorkspaceIds !== "ALL" &&` short-circuits before `.includes()`. A verified member with `"ALL"` scope and a request for *any* workspace id passes through.
- **Line 57** (`else if (allowedWorkspaceIds !== "ALL" && allowedWorkspaceIds.length > 0) { … }`): the same guard. A `"ALL"` scope skips the `where('workspaceId', 'in', …)` filter entirely and falls through to the unfiltered base query (which is correct: every project for the owner is in scope for the member).
- The `slice(0, 30)` truncation only runs in the non-`"ALL"` branch, so a member with `"ALL"` scope never hits the 30-item slice cap.
- The `length` access is also guarded with `!== "ALL"`. `"ALL".length` would be `3`, which would be truthy but wrong — the guard prevents that case.

### Test consumer (non-production, included for completeness)

`teamWorkspaceAccess.test.ts` mirrors `resolveCallerScope` and `canReadWorkspace` for the decision-table assertions. The `canReadWorkspace` helper compares `scope.ownerUid !== requestedWorkspaceOwner` and does not call `.includes()`. It is unaffected by the `"ALL"` sentinel and works correctly with both branches.

`savedProjects.getUserProjects.test.ts` line 28 also guards with `!== "ALL"` before `.includes()`:
```ts
if (callerScope.allowedWorkspaceIds !== "ALL" && !callerScope.allowedWorkspaceIds.includes(requestedWorkspaceId)) {
```

## Sign-off

Both verifications pass. The T008 narrowing removal leaves the membership boundary intact, and the T006 `"ALL"` return value is safely handled at every consumer site. Proceeding to Batch 02 (T018, T019, T023, T025, T026, T027).
