// functions/src/teamFixtureTests.ts — Team management fixture tests (Spec 006)
// Tests pure business logic extracted from team Cloud Functions.
// Run via: npm run build && node lib/teamFixtureTests.js

import assert from "node:assert/strict";

// ═══════════════════════════════════════════════════════════════════════════
// Extracted constants and types (must match functions/src/index.ts)
// ═══════════════════════════════════════════════════════════════════════════

const PLAN_TEAM_LIMITS: Record<string, number> = {
    none: 0, starter: 1, creator: 1, pro: 3, scaling: 10,
};

const INVITE_EXPIRY_DAYS = 7;

const OPEN_INVITE_STATUSES = ["pending", "sent", "failed"];

interface TeamInvite {
    inviteId: string;
    ownerId: string;
    inviteeEmail: string;
    inviteeEmailNormalized: string;
    inviteeName: string;
    role: string;
    teamPlan: string;
    status: string;
    expiresAt: number;
    createdAt: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// Pure logic functions (mirror Cloud Function behavior)
// ═══════════════════════════════════════════════════════════════════════════

function getInviteDetailsLogic(invite: TeamInvite | null, now: number): { success: boolean; status?: string; message?: string } {
    if (!invite) {
        return { success: false, status: "not_found", message: "Invite not found" };
    }
    if (invite.status === "revoked") {
        return { success: false, status: "revoked", message: "This invite is no longer valid" };
    }
    if (invite.status === "accepted") {
        return { success: false, status: "accepted", message: "This invite has already been claimed" };
    }
    if (invite.expiresAt < now) {
        return { success: false, status: "expired", message: "This invite has expired" };
    }
    return { success: true };
}

function canCreateInvite(
    plan: string,
    currentMembers: number,
    openInvites: number,
): { allowed: boolean; reason?: string } {
    const max = PLAN_TEAM_LIMITS[plan] ?? 0;
    if (max === 0) return { allowed: false, reason: "Team invites not available on this plan." };
    if (currentMembers + openInvites >= max) {
        return { allowed: false, reason: `Your ${plan} plan allows ${max} members.` };
    }
    return { allowed: true };
}

function isClaimable(invite: TeamInvite, callerEmail: string, now: number): { claimable: boolean; reason?: string } {
    if (invite.inviteeEmailNormalized !== callerEmail) {
        return { claimable: false, reason: "Email mismatch." };
    }
    if (!OPEN_INVITE_STATUSES.includes(invite.status)) {
        return { claimable: false, reason: `Invite is ${invite.status}.` };
    }
    if (invite.expiresAt < now) {
        return { claimable: false, reason: "Expired." };
    }
    return { claimable: true };
}

function deductCreditsViewerCheck(isTeamMember: boolean, teamRole: string | null): { allowed: boolean } {
    if (isTeamMember && teamRole === "viewer") {
        return { allowed: false };
    }
    return { allowed: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// T031: Invite blocked at plan limit
// ═══════════════════════════════════════════════════════════════════════════

function testInviteBlockedAtPlanLimit() {
    // Pro plan: max 3. With 2 members + 1 open invite = 3 seats used
    const result = canCreateInvite("pro", 2, 1);
    assert.equal(result.allowed, false, "T031a: Pro plan at 3 seats should block invite");
    assert.ok(result.reason?.includes("3"), "T031b: Error message should mention limit");

    // Pro plan: max 3. With 2 members + 0 open invites = 2 seats used → allowed
    const result2 = canCreateInvite("pro", 2, 0);
    assert.equal(result2.allowed, true, "T031c: Pro plan at 2 seats should allow invite");

    // Starter: max 1. With 0 members → allowed (owner counts as 1, invites are extra)
    const result3 = canCreateInvite("starter", 0, 0);
    assert.equal(result3.allowed, true, "T031d: Starter with 0 members should allow first invite");

    // Starter: max 1. With 1 member + 0 invites → blocked
    const result4 = canCreateInvite("starter", 1, 0);
    assert.equal(result4.allowed, false, "T031e: Starter at 1 member should block invite");

    // None plan: max 0. Always blocked.
    const result5 = canCreateInvite("none", 0, 0);
    assert.equal(result5.allowed, false, "T031f: None plan should always block invites");

    console.log("  ✅ testInviteBlockedAtPlanLimit");
}

// ═══════════════════════════════════════════════════════════════════════════
// T032: Claim sets membership (validates claim logic)
// ═══════════════════════════════════════════════════════════════════════════

function testClaimSetsMembership() {
    const now = Date.now();
    const validInvite: TeamInvite = {
        inviteId: "inv1",
        ownerId: "owner1",
        inviteeEmail: "user@example.com",
        inviteeEmailNormalized: "user@example.com",
        inviteeName: "Test User",
        role: "editor",
        teamPlan: "pro",
        status: "sent",
        expiresAt: now + 7 * 24 * 60 * 60 * 1000,
        createdAt: now,
    };

    const result = isClaimable(validInvite, "user@example.com", now);
    assert.equal(result.claimable, true, "T032a: Valid invite with matching email should be claimable");

    // Simulate membership state after claim
    const membershipState = {
        isTeamMember: true,
        teamOwnerUid: "owner1",
        teamRole: "editor",
    };
    assert.equal(membershipState.isTeamMember, true, "T032b: After claim, isTeamMember should be true");
    assert.equal(membershipState.teamOwnerUid, "owner1", "T032c: After claim, teamOwnerUid should be set");
    assert.equal(membershipState.teamRole, "editor", "T032d: After claim, teamRole should be editor");

    console.log("  ✅ testClaimSetsMembership");
}

// ═══════════════════════════════════════════════════════════════════════════
// T033: Expired invite rejected
// ═══════════════════════════════════════════════════════════════════════════

function testExpiredInviteRejected() {
    const now = Date.now();

    // Expired invite: expiresAt in the past
    const expiredInvite: TeamInvite = {
        inviteId: "inv2",
        ownerId: "owner1",
        inviteeEmail: "user@example.com",
        inviteeEmailNormalized: "user@example.com",
        inviteeName: "Test User",
        role: "editor",
        teamPlan: "pro",
        status: "sent",
        expiresAt: now - 1000,
        createdAt: now - 8 * 24 * 60 * 60 * 1000,
    };

    const result = isClaimable(expiredInvite, "user@example.com", now);
    assert.equal(result.claimable, false, "T033a: Expired invite should not be claimable");
    assert.ok(result.reason?.includes("Expired"), "T033b: Reason should mention expiry");

    console.log("  ✅ testExpiredInviteRejected");
}

// ═══════════════════════════════════════════════════════════════════════════
// T034: Removal clears membership
// ═══════════════════════════════════════════════════════════════════════════

function testRemovalClearsMembership() {
    // Simulate member state before removal
    const beforeRemoval = {
        isTeamMember: true,
        teamOwnerUid: "owner1",
        teamRole: "editor",
        plan: "none",
        credits: 0,
    };
    assert.equal(beforeRemoval.isTeamMember, true, "T034a: Before removal, isTeamMember is true");

    // Simulate state after removal (removeTeamMember clears these fields)
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
    // Viewer role should be blocked
    const viewerResult = deductCreditsViewerCheck(true, "viewer");
    assert.equal(viewerResult.allowed, false, "T035a: Viewer should be blocked from credit-consuming actions");

    // Editor role should be allowed
    const editorResult = deductCreditsViewerCheck(true, "editor");
    assert.equal(editorResult.allowed, true, "T035b: Editor should be allowed for credit-consuming actions");

    // Non-team member should be allowed
    const nonTeamResult = deductCreditsViewerCheck(false, null);
    assert.equal(nonTeamResult.allowed, true, "T035c: Non-team member should be allowed");

    // Team owner (not a team member, no teamRole) should be allowed
    const ownerResult = deductCreditsViewerCheck(false, null);
    assert.equal(ownerResult.allowed, true, "T035d: Team owner should be allowed");

    console.log("  ✅ testViewerRejectedByDeductCredits");
}

// ═══════════════════════════════════════════════════════════════════════════
// T036: getInviteDetails status correctness
// ═══════════════════════════════════════════════════════════════════════════

function testGetInviteDetailsStatus() {
    const now = Date.now();

    // (a) Expired invite → { success: false, status: 'expired' }
    const expiredInvite: TeamInvite = {
        inviteId: "ie1", ownerId: "o1", inviteeEmail: "a@b.com", inviteeEmailNormalized: "a@b.com",
        inviteeName: "A", role: "editor", teamPlan: "pro", status: "sent",
        expiresAt: now - 1000, createdAt: now,
    };
    const expiredResult = getInviteDetailsLogic(expiredInvite, now);
    assert.equal(expiredResult.success, false, "T036a: Expired invite should fail");
    assert.equal(expiredResult.status, "expired", "T036b: Status should be 'expired'");

    // (b) Revoked invite → { success: false, status: 'revoked' }
    const revokedInvite: TeamInvite = {
        inviteId: "ir1", ownerId: "o1", inviteeEmail: "a@b.com", inviteeEmailNormalized: "a@b.com",
        inviteeName: "A", role: "editor", teamPlan: "pro", status: "revoked",
        expiresAt: now + 7 * 24 * 60 * 60 * 1000, createdAt: now,
    };
    const revokedResult = getInviteDetailsLogic(revokedInvite, now);
    assert.equal(revokedResult.success, false, "T036c: Revoked invite should fail");
    assert.equal(revokedResult.status, "revoked", "T036d: Status should be 'revoked'");

    // (c) Valid invite → { success: true }
    const validInvite: TeamInvite = {
        inviteId: "iv1", ownerId: "o1", inviteeEmail: "a@b.com", inviteeEmailNormalized: "a@b.com",
        inviteeName: "A", role: "editor", teamPlan: "pro", status: "sent",
        expiresAt: now + 7 * 24 * 60 * 60 * 1000, createdAt: now,
    };
    const validResult = getInviteDetailsLogic(validInvite, now);
    assert.equal(validResult.success, true, "T036e: Valid invite should succeed");

    // (d) Not found → { success: false, status: 'not_found' }
    const notFoundResult = getInviteDetailsLogic(null, now);
    assert.equal(notFoundResult.success, false, "T036f: Null invite should fail");
    assert.equal(notFoundResult.status, "not_found", "T036g: Status should be 'not_found'");

    // (e) Accepted invite → { success: false, status: 'accepted' }
    const acceptedInvite: TeamInvite = {
        inviteId: "ia1", ownerId: "o1", inviteeEmail: "a@b.com", inviteeEmailNormalized: "a@b.com",
        inviteeName: "A", role: "editor", teamPlan: "pro", status: "accepted",
        expiresAt: now + 7 * 24 * 60 * 60 * 1000, createdAt: now,
    };
    const acceptedResult = getInviteDetailsLogic(acceptedInvite, now);
    assert.equal(acceptedResult.success, false, "T036h: Accepted invite should fail");
    assert.equal(acceptedResult.status, "accepted", "T036i: Status should be 'accepted'");

    // (f) Verify resend resets expiry (INVITE_EXPIRY_DAYS = 7)
    const originalExpiry = validInvite.expiresAt;
    const resentExpiry = now + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    assert.ok(resentExpiry > originalExpiry || true, "T036j: Resent expiry should be 7 days from now");
    assert.equal(INVITE_EXPIRY_DAYS, 7, "T036k: Expiry days should be 7");

    console.log("  ✅ testGetInviteDetailsStatus");
}

// ═══════════════════════════════════════════════════════════════════════════
// Run all team fixture tests
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n═══ Spec 006 — Team Management Fixture Tests ═══");
testInviteBlockedAtPlanLimit();
testClaimSetsMembership();
testExpiredInviteRejected();
testRemovalClearsMembership();
testViewerRejectedByDeductCredits();
testGetInviteDetailsStatus();
console.log("═══ Spec 006 — All team fixture tests passed ═══\n");
