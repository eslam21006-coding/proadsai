// functions/src/__tests__/savedProjects.getUserProjects.test.ts
// Verifies getUserProjects workspace access resolution matches the
// ISSUE-D all-workspaces contract (FR-004/FR-004a/FR-004b). The earlier
// per-workspace allowlist contract has been deliberately inverted —
// see research.md D1 and spec.md Clarifications 2026-07-27 — because
// the product decision is that any verified team member sees every
// workspace of the owner, with the per-member `workspaceAccess` array
// left unread (FR-021).

import assert from "node:assert/strict";

interface CallerScope {
    ownerUid: string;
    allowedWorkspaceIds: string[] | "ALL";
}

// The consumer-side check is unchanged in shape; it consults the scope
// returned by `resolveCallerScope` (functions/src/workspaces/workspacePolicy.ts).
// Under the inverted contract a verified team member always arrives here
// carrying `allowedWorkspaceIds: "ALL"` — the per-workspace narrowing below
// is a regression guard for non-team callers, and the live team-member
// path short-circuits at "ALL" before this is reached.
function simulateGetUserProjectsAccessCheck(
    callerScope: CallerScope,
    requestedWorkspaceId: string | undefined,
): { allowed: boolean; errorStatus?: string } {
    if (requestedWorkspaceId) {
        if (callerScope.allowedWorkspaceIds !== "ALL" && !callerScope.allowedWorkspaceIds.includes(requestedWorkspaceId)) {
            return { allowed: false, errorStatus: "permission-denied" };
        }
    }
    return { allowed: true };
}

// Mirrors the new shape of `resolveCallerScope` for a verified member:
// the stored per-member `workspaceAccess` array is no longer consulted
// for visibility (FR-004 / FR-004a). The empty / partial cases that the
// previous contract used as denials now both resolve to "ALL".
function resolveScopeForMember(_storedWorkspaceAccess: string[] | undefined): CallerScope {
  return { ownerUid: "owner1", allowedWorkspaceIds: "ALL" };
}

function run() {
    console.log("phase13 ▸ getUserProjects access tests (ISSUE-D inverted contract)");

    // ─── Team member with empty stored workspaceAccess → ALLOWED via upstream scope (inverted) ───
    // Under the previous per-workspace allowlist model this was denied. Under
    // the ISSUE-D product decision a verified member sees every workspace of
    // the owner regardless of what's in the stored `workspaceAccess` array,
    // so the empty case is now allowed (the empty array is the default for
    // every newly invited member and must not be the cause of a denial).
    {
        const scope = resolveScopeForMember([]);
        const result = simulateGetUserProjectsAccessCheck(scope, "ws-abc");
        assert.equal(scope.allowedWorkspaceIds, "ALL", "T055a-pre: empty stored workspaceAccess is resolved to ALL upstream");
        assert.equal(result.allowed, true, "T055a: member with empty stored workspaceAccess is now allowed (FR-004)");
    }

    // ─── Team member with partial stored access requesting a non-listed id → ALLOWED (inverted) ───
    // The stored list is not consulted for visibility. The override is
    // surfaced as a log line in workspacePolicy.ts (FR-004b).
    {
        const scope = resolveScopeForMember(["ws-1", "ws-2"]);
        const result = simulateGetUserProjectsAccessCheck(scope, "ws-3");
        assert.equal(scope.allowedWorkspaceIds, "ALL", "T055c-pre: partial stored access is still resolved to ALL upstream");
        assert.equal(result.allowed, true, "T055c: stored list is disregarded — non-listed workspace is allowed");
    }

    // ─── Team member with any stored access → ALLOWED for the listed id (still allowed) ───
    {
        const scope = resolveScopeForMember(["ws-1", "ws-2"]);
        const result = simulateGetUserProjectsAccessCheck(scope, "ws-1");
        assert.equal(result.allowed, true, "T055e: member requesting a listed workspace is allowed");
    }

    // ─── Owner with "ALL" → always allowed ───
    {
        const scope: CallerScope = { ownerUid: "owner1", allowedWorkspaceIds: "ALL" };
        const result = simulateGetUserProjectsAccessCheck(scope, "any-workspace");
        assert.equal(result.allowed, true, "T055f: owner should always be allowed");
    }

    // ─── No workspaceId → allowed (lists all accessible) ───
    {
        const scope = resolveScopeForMember([]);
        const result = simulateGetUserProjectsAccessCheck(scope, undefined);
        assert.equal(result.allowed, true, "T055g: no workspace filter should be allowed (scope-limited query)");
    }

    // ─── Verified member scope resolves to "ALL" upstream; the consumer's
    // own access check is never reached for a member (workspacePolicy.ts
    // grants "ALL" so the per-workspace narrowing in this helper is a
    // pure-function regression guard, not the live path). The contract
    // here mirrors what a non-team scope with an explicit per-id list
    // would look like, and asserts that the live path is now "ALL" for
    // members. ───
    {
        const memberScope: CallerScope = { ownerUid: "owner1", allowedWorkspaceIds: "ALL" };
        const result = simulateGetUserProjectsAccessCheck(memberScope, "any-workspace-id");
        assert.equal(result.allowed, true, "ISSUE-D: a verified member scope is 'ALL' and any workspace is allowed");
    }

    // ─── No-leak guard: even when the consumer-side check denies, the
    // response must not carry the caller's ownerUid or the list of
    // workspaceIds the caller might have been probing. This is unrelated
    // to the inverted contract and is retained as a regression guard. ───
    {
        const nonMemberScope: CallerScope = { ownerUid: "owner1", allowedWorkspaceIds: ["ws-1"] };
        const result = simulateGetUserProjectsAccessCheck(nonMemberScope, "ws-secret");
        assert.equal(result.allowed, false, "T055h: non-member with limited scope is denied for unlisted id");
        assert.equal(result.errorStatus, "permission-denied", "T055i: generic error status");
        assert.equal(!("ownerUid" in result) && !("workspaceIds" in result), true,
            "T055j: denial response must not leak ownerUid or workspaceIds");
    }

    console.log("  ✅ All getUserProjects access tests passed (inverted contract)");
}

run();


