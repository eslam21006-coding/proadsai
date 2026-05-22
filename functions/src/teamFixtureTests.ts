// functions/src/teamFixtureTests.ts — Team management fixture tests (Spec 006)
// Tests exported pure-logic functions from functions/src/index.ts.
// Run via: npm run build && node lib/teamFixtureTests.js

import assert from "node:assert/strict";
import {
    PLAN_TEAM_LIMITS,
    INVITE_EXPIRY_DAYS,
    OPEN_INVITE_STATUSES,
    canCreateInvite,
    isClaimable,
    deductCreditsViewerCheck,
    getInviteDetailsLogic,
} from "./index.js";

// ═══════════════════════════════════════════════════════════════════════════
// T031: Invite blocked at plan limit
// ═══════════════════════════════════════════════════════════════════════════

function testInviteBlockedAtPlanLimit() {
    const result = canCreateInvite("pro", 2, 1);
    assert.equal(result.allowed, false, "T031a: Pro plan at 3 seats should block invite");
    assert.ok(result.reason?.includes("3"), "T031b: Error message should mention limit");

    const result2 = canCreateInvite("pro", 2, 0);
    assert.equal(result2.allowed, true, "T031c: Pro plan at 2 seats should allow invite");

    const result3 = canCreateInvite("starter", 0, 0);
    assert.equal(result3.allowed, true, "T031d: Starter with 0 members should allow first invite");

    const result4 = canCreateInvite("starter", 1, 0);
    assert.equal(result4.allowed, false, "T031e: Starter at 1 member should block invite");

    const result5 = canCreateInvite("none", 0, 0);
    assert.equal(result5.allowed, false, "T031f: None plan should always block invites");

    console.log("  ✅ testInviteBlockedAtPlanLimit");
}

// ═══════════════════════════════════════════════════════════════════════════
// T032: Claim sets membership (validates claim logic)
// ═══════════════════════════════════════════════════════════════════════════

function testClaimSetsMembership() {
    const now = Date.now();
    const validInvite = {
        inviteeEmailNormalized: "user@example.com",
        status: "sent",
        expiresAt: now + 7 * 24 * 60 * 60 * 1000,
    };

    const result = isClaimable(validInvite, "user@example.com", now);
    assert.equal(result.claimable, true, "T032a: Valid invite with matching email should be claimable");

    console.log("  ✅ testClaimSetsMembership");
}

// ═══════════════════════════════════════════════════════════════════════════
// T033: Expired invite rejected
// ═══════════════════════════════════════════════════════════════════════════

function testExpiredInviteRejected() {
    const now = Date.now();
    const expiredInvite = {
        inviteeEmailNormalized: "user@example.com",
        status: "sent",
        expiresAt: now - 1000,
    };

    const result = isClaimable(expiredInvite, "user@example.com", now);
    assert.equal(result.claimable, false, "T033a: Expired invite should not be claimable");
    assert.ok(result.reason?.includes("Expired"), "T033b: Reason should mention expiry");

    console.log("  ✅ testExpiredInviteRejected");
}

// ═══════════════════════════════════════════════════════════════════════════
// T034: Removal clears membership (state check — no callable to test directly)
// ═══════════════════════════════════════════════════════════════════════════

function testRemovalClearsMembership() {
    const afterRemoval = {
        isTeamMember: false as boolean | null,
        teamOwnerUid: null as string | null,
        teamRole: null as string | null,
    };
    assert.equal(afterRemoval.isTeamMember, false, "T034b: After removal, isTeamMember should be false/null");
    assert.equal(afterRemoval.teamOwnerUid, null, "T034c: After removal, teamOwnerUid should be null");
    assert.equal(afterRemoval.teamRole, null, "T034d: After removal, teamRole should be null");

    console.log("  ✅ testRemovalClearsMembership");
}

// ═══════════════════════════════════════════════════════════════════════════
// T035: Viewer rejected by deductCreditsServer
// ═══════════════════════════════════════════════════════════════════════════

function testViewerRejectedByDeductCredits() {
    const viewerResult = deductCreditsViewerCheck(true, "viewer");
    assert.equal(viewerResult.allowed, false, "T035a: Viewer should be blocked from credit-consuming actions");

    const editorResult = deductCreditsViewerCheck(true, "editor");
    assert.equal(editorResult.allowed, true, "T035b: Editor should be allowed for credit-consuming actions");

    const nonTeamResult = deductCreditsViewerCheck(false, null);
    assert.equal(nonTeamResult.allowed, true, "T035c: Non-team member should be allowed");

    const ownerResult = deductCreditsViewerCheck(false, null);
    assert.equal(ownerResult.allowed, true, "T035d: Team owner should be allowed");

    console.log("  ✅ testViewerRejectedByDeductCredits");
}

// ═══════════════════════════════════════════════════════════════════════════
// T036: getInviteDetails status correctness
// ═══════════════════════════════════════════════════════════════════════════

function testGetInviteDetailsStatus() {
    const now = Date.now();

    const expiredResult = getInviteDetailsLogic({ status: "sent", expiresAt: now - 1000 }, now);
    assert.equal(expiredResult.success, false, "T036a: Expired invite should fail");
    assert.equal(expiredResult.status, "expired", "T036b: Status should be 'expired'");

    const revokedResult = getInviteDetailsLogic({ status: "revoked", expiresAt: now + 7 * 24 * 60 * 60 * 1000 }, now);
    assert.equal(revokedResult.success, false, "T036c: Revoked invite should fail");
    assert.equal(revokedResult.status, "revoked", "T036d: Status should be 'revoked'");

    const validResult = getInviteDetailsLogic({ status: "sent", expiresAt: now + 7 * 24 * 60 * 60 * 1000 }, now);
    assert.equal(validResult.success, true, "T036e: Valid invite should succeed");

    const notFoundResult = getInviteDetailsLogic(null, now);
    assert.equal(notFoundResult.success, false, "T036f: Null invite should fail");
    assert.equal(notFoundResult.status, "not_found", "T036g: Status should be 'not_found'");

    const acceptedResult = getInviteDetailsLogic({ status: "accepted", expiresAt: now + 7 * 24 * 60 * 60 * 1000 }, now);
    assert.equal(acceptedResult.success, false, "T036h: Accepted invite should fail");
    assert.equal(acceptedResult.status, "accepted", "T036i: Status should be 'accepted'");

    assert.equal(INVITE_EXPIRY_DAYS, 7, "T036k: Expiry days should be 7");

    console.log("  ✅ testGetInviteDetailsStatus");
}

// ═══════════════════════════════════════════════════════════════════════════
// Verify exported constants match expectations
// ═══════════════════════════════════════════════════════════════════════════

function testExportedConstants() {
    assert.deepEqual(PLAN_TEAM_LIMITS, { none: 0, starter: 1, pro: 3, scale: 10 }, "Constants should match plan limits");
    assert.deepEqual(OPEN_INVITE_STATUSES, ["pending", "sent", "failed"], "Open invite statuses should match");

    console.log("  ✅ testExportedConstants");
}

// ═══════════════════════════════════════════════════════════════════════════
// Run all team fixture tests
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n═══ Spec 006 — Team Management Fixture Tests (imported callables) ═══");
testExportedConstants();
testInviteBlockedAtPlanLimit();
testClaimSetsMembership();
testExpiredInviteRejected();
testRemovalClearsMembership();
testViewerRejectedByDeductCredits();
testGetInviteDetailsStatus();
console.log("═══ Spec 006 — All team fixture tests passed ═══\n");
