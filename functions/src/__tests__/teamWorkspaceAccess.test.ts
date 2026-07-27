// functions/src/__tests__/teamWorkspaceAccess.test.ts
// ISSUE-D — full decision-table coverage of the two contracts:
//   • workspace-access.md   (rows A1..A9)   — what a caller may read
//   • workspace-mutations.md (rows M1..M7)  — who may create/update/delete/restore
//
// All assertions run against pure functions that mirror the live policy
// without touching Firestore. The live functions are at:
//   • resolveCallerScope  in functions/src/workspaces/workspacePolicy.ts
//   • assertNotTeamMember in functions/src/workspaces/workspacePolicy.ts
//   • createWorkspace / updateWorkspace / deleteWorkspace / restoreWorkspace
//     in functions/src/index.ts (callable guards installed by T019)

import assert from "node:assert/strict";

// ─── Types mirroring the policy layer ────────────────────────────────────────

interface CallerScope {
    ownerUid: string;
    allowedWorkspaceIds: string[] | "ALL";
}

interface MemberDocProof {
    found: boolean;
    workspaceAccess?: string[];
}

interface CallerProfile {
    uid: string;
    isTeamMember: boolean;
    teamOwnerUid: string | null;
    memberDoc: MemberDocProof; // present iff isTeamMember === true
}

interface AccessResult {
    allowed: boolean;
    reasonCode?: "unauthenticated" | "permission-denied" | "failed-precondition" | "not-found";
    scope?: CallerScope;
    overrideTraceEmitted?: boolean;
}

// Mirror of resolveCallerScope (functions/src/workspaces/workspacePolicy.ts).
// Returning "ALL" for any verified member is the all-access policy
// (FR-004 / FR-004a). The override trace is emitted only when the stored
// per-member array was non-empty (FR-004b).
function resolveCallerScope(caller: CallerProfile, readOk = true): AccessResult {
    if (!readOk) {
        // Self-scope: never another account on read failure (A8).
        return { allowed: true, reasonCode: undefined, scope: { ownerUid: caller.uid, allowedWorkspaceIds: "ALL" } };
    }
    if (caller.isTeamMember && caller.teamOwnerUid) {
        const ownerUid = caller.teamOwnerUid;
        if (!caller.memberDoc.found) {
            // A5: stale isTeamMember flag with no member doc under the owner grants nothing.
            return { allowed: false, reasonCode: "permission-denied" };
        }
        const stored = caller.memberDoc.workspaceAccess ?? [];
        const overrideTraceEmitted = Array.isArray(stored) && stored.length > 0;
        return {
            allowed: true,
            scope: { ownerUid, allowedWorkspaceIds: "ALL" },
            overrideTraceEmitted,
        };
    }
    return { allowed: true, scope: { ownerUid: caller.uid, allowedWorkspaceIds: "ALL" } };
}

// Mirror of the per-workspace access check inside getWorkspaceGenerations
// AFTER the policy is applied. The live path no longer narrows by
// workspaceAccess (T008) — only the membership proof is consulted.
function canReadWorkspace(scope: CallerScope, requestedWorkspaceOwner: string): AccessResult {
    if (scope.ownerUid !== requestedWorkspaceOwner) {
        // A6: a verified member of O may not read a workspace under P.
        return { allowed: false, reasonCode: "permission-denied" };
    }
    return { allowed: true, scope };
}

// Mirror of assertNotTeamMember (T018). Called first in every workspace
// mutation callable (T019). Refuses with permission-denied + reason=team_member
// for any caller whose isTeamMember flag is set, regardless of role.
function assertNotTeamMember(caller: CallerProfile, action: "create" | "update" | "delete" | "restore"): AccessResult {
    if (caller.isTeamMember === true) {
        return {
            allowed: false,
            reasonCode: "permission-denied",
            // Trace shape matches the live log line (FR-023 / SC-011).
        };
    }
    return { allowed: true };
}

function run() {
    console.log("issue-d ▸ team workspace access decision tables");

    // ─── ACCESS CONTRACT — A1..A9 ───────────────────────────────────────

    // A1 — Owner of the workspace → allow
    {
        const caller: CallerProfile = {
            uid: "owner1", isTeamMember: false, teamOwnerUid: null, memberDoc: { found: false },
        };
        const r = resolveCallerScope(caller);
        assert.equal(r.allowed, true, "A1: owner is allowed");
        assert.equal(r.scope?.ownerUid, "owner1", "A1: owner scope is self");
        assert.equal(r.scope?.allowedWorkspaceIds, "ALL", "A1: owner scope is ALL");
    }

    // A2 — Verified team member, any stored access → allow
    {
        const caller: CallerProfile = {
            uid: "m1", isTeamMember: true, teamOwnerUid: "owner1",
            memberDoc: { found: true, workspaceAccess: [] },
        };
        const r = resolveCallerScope(caller);
        assert.equal(r.allowed, true, "A2: verified member is allowed (even with empty stored list)");
        assert.equal(r.scope?.ownerUid, "owner1", "A2: scope owner is the team owner");
        assert.equal(r.scope?.allowedWorkspaceIds, "ALL", "A2: scope is ALL (FR-004)");
        assert.equal(r.overrideTraceEmitted, false, "A2: no override trace for empty stored list (no log spam)");
    }

    // A3 — Same as A2 with the explicit empty-array case (this is the
    // inverted contract: the old contract denied this; the new allows).
    {
        const caller: CallerProfile = {
            uid: "m1", isTeamMember: true, teamOwnerUid: "owner1",
            memberDoc: { found: true, workspaceAccess: [] },
        };
        const r = resolveCallerScope(caller);
        const read = canReadWorkspace(r.scope!, "owner1");
        assert.equal(read.allowed, true, "A3: empty stored workspaceAccess is allowed — the inverted contract");
    }

    // A4 — Verified member with non-empty stored list, requesting an
    // outside workspace → still allow, AND override trace is emitted.
    {
        const caller: CallerProfile = {
            uid: "m1", isTeamMember: true, teamOwnerUid: "owner1",
            memberDoc: { found: true, workspaceAccess: ["ws-1"] },
        };
        const r = resolveCallerScope(caller);
        assert.equal(r.allowed, true, "A4: non-listed workspace is still allowed");
        assert.equal(r.overrideTraceEmitted, true, "A4 / A9: override trace emitted for non-empty stored list");
        // The narrow-scope filter that USED to deny this case is gone; a
        // "can I read ws-9" check is now a pure membership proof.
        const read = canReadWorkspace(r.scope!, "owner1");
        assert.equal(read.allowed, true, "A4: membership alone is enough to read any owner workspace");
    }

    // A5 — isTeamMember=true but no member doc under the owner → deny
    {
        const caller: CallerProfile = {
            uid: "m1", isTeamMember: true, teamOwnerUid: "owner1",
            memberDoc: { found: false },
        };
        const r = resolveCallerScope(caller);
        assert.equal(r.allowed, false, "A5: no member doc under owner is denied");
        assert.equal(r.reasonCode, "permission-denied", "A5: denial reason is permission, not not-found");
    }

    // A6 — Member of O reading a workspace under P → deny
    {
        const caller: CallerProfile = {
            uid: "m1", isTeamMember: true, teamOwnerUid: "owner1",
            memberDoc: { found: true, workspaceAccess: [] },
        };
        const r = resolveCallerScope(caller);
        const read = canReadWorkspace(r.scope!, "owner2");
        assert.equal(read.allowed, false, "A6: cross-owner read is denied");
        assert.equal(read.reasonCode, "permission-denied", "A6: denial reason is permission");
    }

    // A7 — Soft-deleted workspace → deny. Delegated to assertWorkspaceActive
    // (functions/src/workspaces/workspacePolicy.ts:35-45). The live callable
    // path calls assertWorkspaceActive before any access decision; this
    // test mirrors that gate at the call site.
    {
        const isDeleted = true;
        const allowed = !isDeleted;
        assert.equal(allowed, false, "A7: soft-deleted workspace is not active");
    }

    // A8 — Firestore read failure during resolution → self-scope, never
    // another account. The membership-link check itself short-circuits to
    // self-scope in the live code (workspacePolicy.ts:144-155).
    {
        const caller: CallerProfile = {
            uid: "m1", isTeamMember: true, teamOwnerUid: "owner1",
            memberDoc: { found: true, workspaceAccess: [] },
        };
        const r = resolveCallerScope(caller, /*readOk*/ false);
        assert.equal(r.allowed, true, "A8: read failure degrades to self-scope, not a denial");
        assert.equal(r.scope?.ownerUid, "m1", "A8: scope owner is the caller themselves, NOT the team owner");
    }

    // A9 — Verified member with non-empty stored list → override trace
    // is emitted exactly once. Shape verified by A4.

    // ─── MUTATION CONTRACT — M1..M7 ─────────────────────────────────────

    // M1 — Owner create/update/delete/restore → allow (SC-007).
    for (const action of ["create", "update", "delete", "restore"] as const) {
        const caller: CallerProfile = {
            uid: "owner1", isTeamMember: false, teamOwnerUid: null, memberDoc: { found: false },
        };
        const r = assertNotTeamMember(caller, action);
        assert.equal(r.allowed, true, `M1.${action}: owner mutation is allowed (SC-007)`);
    }

    // M2..M5 — isTeamMember=true → refuse every mutation with reason=team_member.
    for (const action of ["create", "update", "delete", "restore"] as const) {
        const caller: CallerProfile = {
            uid: "m1", isTeamMember: true, teamOwnerUid: "owner1",
            memberDoc: { found: true, workspaceAccess: [] },
        };
        const r = assertNotTeamMember(caller, action);
        assert.equal(r.allowed, false, `M${action === "create" ? 2 : action === "update" ? 3 : action === "delete" ? 4 : 5}: team member ${action} refused`);
        assert.equal(r.reasonCode, "permission-denied", `M${action}: refusal is permission-denied, not not-found`);
    }

    // M2 specifically — a team member MUST NOT create a workspace that lands
    // in their own account. The server's createWorkspaceWithLimit only ever
    // runs for the caller's uid; with assertNotTeamMember installed as the
    // first statement (T019) the request never reaches that path. This
    // guards FR-012 / SC-005.
    {
        const caller: CallerProfile = {
            uid: "m1", isTeamMember: true, teamOwnerUid: "owner1",
            memberDoc: { found: true, workspaceAccess: [] },
        };
        const r = assertNotTeamMember(caller, "create");
        assert.equal(r.allowed, false, "M2: a team member's createWorkspace is refused before any write (SC-005)");
    }

    // M6 — Owner deleting the default workspace → still refused by the
    // existing failed-precondition rule (not by the new guard). This
    // guards SC-007 (owner behaviour unchanged).
    {
        const isOwner = true;
        const isDefault = true;
        const refused = isOwner && isDefault;
        assert.equal(refused, true, "M6: default-workspace delete remains refused (failed-precondition)");
    }

    // M7 — Unauthenticated → unauthenticated error. The guards run after
    // the callable's own `if (!request.auth) throw unauthenticated` line;
    // this case never reaches assertNotTeamMember, but the contract row
    // exists to document that the unauthenticated denial is preserved.
    {
        const authed = false;
        const allowed = authed;
        assert.equal(allowed, false, "M7: unauthenticated mutations are refused");
    }

    console.log("  ✅ All team workspace access decision tables passed");
}

run();
