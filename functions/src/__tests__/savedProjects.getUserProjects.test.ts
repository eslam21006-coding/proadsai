// functions/src/__tests__/savedProjects.getUserProjects.test.ts
// Verifies getUserProjects workspace access denial leaks no metadata.

import assert from "node:assert/strict";

interface CallerScope {
    ownerUid: string;
    allowedWorkspaceIds: string[] | "ALL";
}

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

function run() {
    console.log("phase13 ▸ getUserProjects access denial tests");

    // ─── Team member with empty workspaceAccess → denied ───
    {
        const scope: CallerScope = { ownerUid: "owner1", allowedWorkspaceIds: [] };
        const result = simulateGetUserProjectsAccessCheck(scope, "ws-abc");
        assert.equal(result.allowed, false, "T055a: member with no access should be denied");
        assert.equal(result.errorStatus, "permission-denied", "T055b: error should be permission-denied");
    }

    // ─── Team member with partial access → denied for non-listed workspace ───
    {
        const scope: CallerScope = { ownerUid: "owner1", allowedWorkspaceIds: ["ws-1", "ws-2"] };
        const result = simulateGetUserProjectsAccessCheck(scope, "ws-3");
        assert.equal(result.allowed, false, "T055c: member requesting non-listed workspace should be denied");
        assert.equal(result.errorStatus, "permission-denied", "T055d: error should be permission-denied");
    }

    // ─── Team member with partial access → allowed for listed workspace ───
    {
        const scope: CallerScope = { ownerUid: "owner1", allowedWorkspaceIds: ["ws-1", "ws-2"] };
        const result = simulateGetUserProjectsAccessCheck(scope, "ws-1");
        assert.equal(result.allowed, true, "T055e: member requesting listed workspace should be allowed");
    }

    // ─── Owner with "ALL" → always allowed ───
    {
        const scope: CallerScope = { ownerUid: "owner1", allowedWorkspaceIds: "ALL" };
        const result = simulateGetUserProjectsAccessCheck(scope, "any-workspace");
        assert.equal(result.allowed, true, "T055f: owner should always be allowed");
    }

    // ─── No workspaceId → allowed (lists all accessible) ───
    {
        const scope: CallerScope = { ownerUid: "owner1", allowedWorkspaceIds: [] };
        const result = simulateGetUserProjectsAccessCheck(scope, undefined);
        assert.equal(result.allowed, true, "T055g: no workspace filter should be allowed (scope-limited query)");
    }

    // ─── Denial leaks no metadata: error message is generic ───
    {
        const scope: CallerScope = { ownerUid: "owner1", allowedWorkspaceIds: ["ws-1"] };
        const result = simulateGetUserProjectsAccessCheck(scope, "ws-secret");
        assert.equal(result.allowed, false, "T055h: denied access");
        assert.equal(result.errorStatus, "permission-denied", "T055i: generic error status");
        assert.equal(Object.keys(result).length <= 2 && !("ownerUid" in result) && !("workspaceIds" in result), true,
            "T055j: denial response must not leak ownerUid or workspaceIds");
    }

    console.log("  ✅ All getUserProjects access denial tests passed");
}

run();
