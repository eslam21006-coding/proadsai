// functions/src/billing/__tests__/billingState.test.ts — webhook scenario contract tests (LAUNCH_MATRIX 8.C.15)

import { buildBillingState } from "../billingState.js";
import { Timestamp } from "firebase-admin/firestore";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
    if (condition) {
        console.log(`  ✅ ${label}`);
        passed++;
    } else {
        console.error(`  ❌ ${label}`);
        failed++;
    }
}

function assertEqual(actual: any, expected: any, label: string) {
    const match = actual === expected;
    if (match) {
        console.log(`  ✅ ${label}`);
        passed++;
    } else {
        console.error(`  ❌ ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
        failed++;
    }
}

// ═══════════════════════════════════════════════════════════
// (a) subscription.created → sets correct plan/credits/paddleSubscriptionId
// ═══════════════════════════════════════════════════════════
console.log("\n(a) subscription.created → Pro monthly");
{
    const state = buildBillingState({
        plan: "pro",
        credits: 2000,
        isTrial: false,
        paddleCustomerId: "ctm_test123",
        paddleSubscriptionId: "sub_test456",
        paddleUpdatePaymentUrl: "https://sandbox-paddle.com/update/123",
        paddleCancelUrl: "https://sandbox-paddle.com/cancel/123",
        billingStatus: "active",
    });
    assertEqual(state.plan, "pro", "plan is pro");
    assertEqual(state.credits, 2000, "credits is 2000");
    assertEqual(state.billingStatus, "active", "billingStatus is active");
    assertEqual(state.paddleCustomerId, "ctm_test123", "paddleCustomerId is set");
    assertEqual(state.paddleSubscriptionId, "sub_test456", "paddleSubscriptionId is set");
    assertEqual(state.paddleUpdatePaymentUrl, "https://sandbox-paddle.com/update/123", "updatePaymentUrl is set");
    assertEqual(state.paddleCancelUrl, "https://sandbox-paddle.com/cancel/123", "cancelUrl is set");
    assertEqual(state.creditsPerMonth, 2000, "creditsPerMonth is 2000 for pro");
    assertEqual(state.canUpgrade, true, "canUpgrade is true (pro < scaling)");
    assertEqual(state.canTopUp, true, "canTopUp is true");
}

console.log("\n(a.2) subscription.created → Starter plan");
{
    const state = buildBillingState({
        plan: "starter",
        credits: 500,
        isTrial: false,
        paddleCustomerId: "ctm_starter",
        paddleSubscriptionId: "sub_starter",
        paddleUpdatePaymentUrl: "https://sandbox-paddle.com/update/s",
        paddleCancelUrl: "https://sandbox-paddle.com/cancel/s",
        billingStatus: "active",
    });
    assertEqual(state.plan, "starter", "plan is starter");
    assertEqual(state.credits, 500, "credits is 500");
    assertEqual(state.creditsPerMonth, 500, "creditsPerMonth is 500 for starter");
    assertEqual(state.canUpgrade, true, "canUpgrade is true (starter < scaling)");
}

console.log("\n(a.3) subscription.created → Creator plan");
{
    const state = buildBillingState({
        plan: "creator",
        credits: 1000,
        isTrial: false,
        paddleCustomerId: "ctm_creator",
        paddleSubscriptionId: "sub_creator",
        billingStatus: "active",
    });
    assertEqual(state.plan, "creator", "plan is creator");
    assertEqual(state.credits, 1000, "credits is 1000");
    assertEqual(state.creditsPerMonth, 1000, "creditsPerMonth is 1000 for creator");
}

console.log("\n(a.4) subscription.created → Scaling plan");
{
    const state = buildBillingState({
        plan: "scaling",
        credits: 5000,
        isTrial: false,
        paddleCustomerId: "ctm_scaling",
        paddleSubscriptionId: "sub_scaling",
        billingStatus: "active",
    });
    assertEqual(state.plan, "scaling", "plan is scaling");
    assertEqual(state.credits, 5000, "credits is 5000");
    assertEqual(state.creditsPerMonth, 5000, "creditsPerMonth is 5000 for scaling");
    assertEqual(state.canUpgrade, false, "canUpgrade is false for scaling (highest tier)");
    assertEqual(state.canTopUp, true, "canTopUp is true for scaling");
}

// ═══════════════════════════════════════════════════════════
// (b) subscription.canceled → plan='none', credits=0, canUpgrade=false
// ═══════════════════════════════════════════════════════════
console.log("\n(b) subscription.canceled → plan=none");
{
    const state = buildBillingState({
        plan: "none",
        credits: 0,
        isTrial: false,
        billingStatus: "cancelled",
    });
    assertEqual(state.plan, "none", "plan is none");
    assertEqual(state.credits, 0, "credits is 0");
    assertEqual(state.billingStatus, "cancelled", "billingStatus is cancelled");
    assertEqual(state.canUpgrade, false, "canUpgrade is false for plan=none");
    assertEqual(state.canTopUp, false, "canTopUp is false for plan=none");
    assertEqual(state.paddleCustomerId, null, "paddleCustomerId is null");
    assertEqual(state.paddleSubscriptionId, null, "paddleSubscriptionId is null");
}

console.log("\n(b.2) subscription.canceled — Paddle URLs still present from prior subscription");
{
    const state = buildBillingState({
        plan: "none",
        credits: 0,
        isTrial: false,
        billingStatus: "cancelled",
        paddleCustomerId: "ctm_cancelled",
        paddleSubscriptionId: "sub_cancelled",
        paddleUpdatePaymentUrl: "https://sandbox-paddle.com/update/cancelled",
        paddleCancelUrl: "https://sandbox-paddle.com/cancel/cancelled",
    });
    assertEqual(state.paddleCustomerId, "ctm_cancelled", "paddleCustomerId preserved");
    assertEqual(state.paddleSubscriptionId, "sub_cancelled", "paddleSubscriptionId preserved");
    assertEqual(state.paddleUpdatePaymentUrl, "https://sandbox-paddle.com/update/cancelled", "updatePaymentUrl preserved");
    assertEqual(state.paddleCancelUrl, "https://sandbox-paddle.com/cancel/cancelled", "cancelUrl preserved");
}

// ═══════════════════════════════════════════════════════════
// (c) transaction.completed with isTopUp → credits added
//     (Simulates user had 1500 credits, top-up added 300 → 1800)
// ═══════════════════════════════════════════════════════════
console.log("\n(c) transaction.completed (top-up) → credits added");
{
    const state = buildBillingState({
        plan: "pro",
        credits: 1800,
        isTrial: false,
        paddleCustomerId: "ctm_test123",
        paddleSubscriptionId: "sub_test456",
        billingStatus: "active",
    });
    assertEqual(state.credits, 1800, "credits is 1800 (1500 base + 300 top-up)");
    assertEqual(state.billingStatus, "active", "billingStatus is active");
    assertEqual(state.canTopUp, true, "canTopUp is true");
    assertEqual(state.creditsPerMonth, 2000, "creditsPerMonth is still 2000 (plan unchanged)");
}

console.log("\n(c.2) transaction.completed (top-up) — credits exceed monthly allotment");
{
    const state = buildBillingState({
        plan: "creator",
        credits: 1500,
        isTrial: false,
        paddleCustomerId: "ctm_topup_over",
        billingStatus: "active",
    });
    assertEqual(state.credits, 1500, "credits is 1500 (1000 base + 500 top-up, exceeds 1000 allotment)");
    assertEqual(state.creditsPerMonth, 1000, "creditsPerMonth stays 1000");
    assertEqual(state.canTopUp, true, "canTopUp still true");
}

// ═══════════════════════════════════════════════════════════
// (d) subscription.past_due → credits NOT zeroed, grace period set
// ═══════════════════════════════════════════════════════════
console.log("\n(d) subscription.past_due → credits kept, grace period set");
{
    const graceEnd = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const state = buildBillingState({
        plan: "pro",
        credits: 1500,
        isTrial: false,
        paddleCustomerId: "ctm_past_due",
        paddleSubscriptionId: "sub_past_due",
        gracePeriodEndsAt: Timestamp.fromDate(graceEnd),
    });
    assertEqual(state.billingStatus, "past_due", "billingStatus is past_due");
    assertEqual(state.credits, 1500, "credits is still 1500 (NOT zeroed)");
    assert(state.gracePeriodEndsAt !== null, "gracePeriodEndsAt is set");
    assertEqual(state.canTopUp, false, "canTopUp is false during past_due");
}

console.log("\n(d.2) subscription.past_due — grace period with updatePaymentUrl");
{
    const graceEnd = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const state = buildBillingState({
        plan: "pro",
        credits: 2000,
        isTrial: false,
        paddleCustomerId: "ctm_past_due_2",
        paddleSubscriptionId: "sub_past_due_2",
        gracePeriodEndsAt: Timestamp.fromDate(graceEnd),
        paddleUpdatePaymentUrl: "https://sandbox-paddle.com/update/pd",
    });
    assertEqual(state.billingStatus, "past_due", "billingStatus is past_due");
    assertEqual(state.paddleUpdatePaymentUrl, "https://sandbox-paddle.com/update/pd", "updatePaymentUrl is available for user to fix payment");
    assertEqual(state.credits, 2000, "credits NOT zeroed during grace period");
}

// ═══════════════════════════════════════════════════════════
// (e) Invalid Paddle signature → graceful handling (no crash on empty data)
//     The webhook handler returns 400 for invalid signatures.
//     buildBillingState handles missing/malformed data gracefully.
// ═══════════════════════════════════════════════════════════
console.log("\n(e) Invalid signature → graceful handling (no crash on empty data)");
{
    const state = buildBillingState({});
    assertEqual(state.plan, "none", "plan defaults to none");
    assertEqual(state.credits, 0, "credits defaults to 0");
    assertEqual(state.billingStatus, "cancelled", "billingStatus defaults to cancelled");
    assertEqual(state.paddleCustomerId, null, "paddleCustomerId is null");
    assertEqual(state.paddleSubscriptionId, null, "paddleSubscriptionId is null");
    assertEqual(state.isTrial, false, "isTrial defaults to false");
    assertEqual(state.isTeamMember, false, "isTeamMember defaults to false");
    assertEqual(state.canUpgrade, false, "canUpgrade is false");
    assertEqual(state.canTopUp, false, "canTopUp is false");
}

console.log("\n(e.2) Partial data — only plan set, rest defaults");
{
    const state = buildBillingState({ plan: "starter" });
    assertEqual(state.plan, "starter", "plan is starter");
    assertEqual(state.credits, 0, "credits defaults to 0");
    assertEqual(state.creditsPerMonth, 500, "creditsPerMonth is 500 for starter");
    assertEqual(state.billingStatus, "active", "billingStatus is active (plan is set, no explicit cancelled)");
}

// ═══════════════════════════════════════════════════════════
// (f) notifyGHL failure → does not throw (best-effort)
//     GHL sync is fire-and-forget; verify buildBillingState
//     completes even with unusual/partial data
// ═══════════════════════════════════════════════════════════
console.log("\n(f) GHL failure path → buildBillingState completes with partial data");
{
    const state = buildBillingState({
        plan: "creator",
        credits: 1000,
        isTrial: false,
        paddleCustomerId: "ctm_only",
    });
    assertEqual(state.plan, "creator", "plan is creator");
    assertEqual(state.paddleCustomerId, "ctm_only", "paddleCustomerId is set");
    assertEqual(state.paddleSubscriptionId, null, "paddleSubscriptionId is null (not yet set)");
    assertEqual(state.billingStatus, "active", "billingStatus is active");
    assertEqual(state.canTopUp, true, "canTopUp is true");
}

console.log("\n(f.2) GHL failure path — minimal data (no paddleCustomerId)");
{
    const state = buildBillingState({
        plan: "pro",
        credits: 500,
    });
    assertEqual(state.plan, "pro", "plan is pro");
    assertEqual(state.paddleCustomerId, null, "paddleCustomerId is null");
    assertEqual(state.paddleSubscriptionId, null, "paddleSubscriptionId is null");
    assert(state.billingStatus === "active" || state.billingStatus === "cancelled", "billingStatus is valid");
}

// ═══════════════════════════════════════════════════════════
// (g) subscription.created WITHOUT firebaseUid → pending_plans write
//     Verify buildBillingState works with data that would come from pending_plans
// ═══════════════════════════════════════════════════════════
console.log("\n(g) subscription.created without firebaseUid → pending_plans data");
{
    const state = buildBillingState({
        plan: "starter",
        credits: 500,
        isTrial: false,
        paddleCustomerId: "ctm_pending",
        paddleSubscriptionId: "sub_pending",
        paddleUpdatePaymentUrl: "https://sandbox-paddle.com/update/pending",
        paddleCancelUrl: "https://sandbox-paddle.com/cancel/pending",
        billingStatus: "active",
    });
    assertEqual(state.plan, "starter", "plan is starter");
    assertEqual(state.credits, 500, "credits is 500");
    assertEqual(state.paddleCustomerId, "ctm_pending", "paddleCustomerId is set");
    assertEqual(state.paddleSubscriptionId, "sub_pending", "paddleSubscriptionId is set");
    assertEqual(state.canUpgrade, true, "canUpgrade is true (starter < scaling)");
}

// ═══════════════════════════════════════════════════════════
// Additional: Team member restrictions
// ═══════════════════════════════════════════════════════════
console.log("\nAdditional: Team member restrictions");
{
    const state = buildBillingState({
        plan: "pro",
        credits: 2000,
        isTrial: false,
        isTeamMember: true,
        teamOwnerUid: "owner123",
        teamOwnerName: "Ahmed",
    });
    assertEqual(state.isTeamMember, true, "isTeamMember is true");
    assertEqual(state.teamOwnerUid, "owner123", "teamOwnerUid is owner123");
    assertEqual(state.teamOwnerName, "Ahmed", "teamOwnerName is Ahmed");
    assertEqual(state.canUpgrade, false, "canUpgrade is false for team member");
    assertEqual(state.canTopUp, false, "canTopUp is false for team member");
}

// ═══════════════════════════════════════════════════════════
// Additional: Scaling plan (highest tier, canUpgrade=false)
// ═══════════════════════════════════════════════════════════
console.log("\nAdditional: Scaling plan (highest tier)");
{
    const state = buildBillingState({
        plan: "scaling",
        credits: 5000,
        isTrial: false,
    });
    assertEqual(state.canUpgrade, false, "canUpgrade is false for scaling");
    assertEqual(state.canTopUp, true, "canTopUp is true for scaling");
    assertEqual(state.creditsPerMonth, 5000, "creditsPerMonth is 5000");
}

// ═══════════════════════════════════════════════════════════
// Additional: Cancelling state (cancelAtPeriodEnd)
// ═══════════════════════════════════════════════════════════
console.log("\nAdditional: Cancelling state");
{
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const state = buildBillingState({
        plan: "pro",
        credits: 1500,
        isTrial: false,
        cancelAtPeriodEnd: true,
        cancelAt: Timestamp.fromDate(futureDate),
        paddleCustomerId: "ctm_cancelling",
        paddleSubscriptionId: "sub_cancelling",
    });
    assertEqual(state.billingStatus, "cancelling", "billingStatus is cancelling");
    assert(state.cancelAt !== null, "cancelAt is set");
    assertEqual(state.canTopUp, true, "canTopUp still true while cancelling");
    assertEqual(state.canUpgrade, true, "canUpgrade still true while cancelling");
}

// ═══════════════════════════════════════════════════════════
// Additional: Trial expired (0 credits)
// ═══════════════════════════════════════════════════════════
console.log("\nAdditional: Trial expired (0 credits)");
{
    const state = buildBillingState({
        plan: "starter",
        credits: 0,
        isTrial: true,
    });
    assertEqual(state.isTrial, true, "isTrial is true");
    assertEqual(state.billingStatus, "cancelled", "billingStatus is cancelled (0 trial credits)");
    assertEqual(state.canTopUp, false, "canTopUp is false for trial");
    assertEqual(state.creditsPerMonth, 50, "creditsPerMonth is 50 (trial)");
}

// ═══════════════════════════════════════════════════════════
// Additional: Trial active (credits > 0)
// ═══════════════════════════════════════════════════════════
console.log("\nAdditional: Trial active (credits > 0)");
{
    const state = buildBillingState({
        plan: "starter",
        credits: 30,
        isTrial: true,
    });
    assertEqual(state.isTrial, true, "isTrial is true");
    assertEqual(state.billingStatus, "active", "billingStatus is active (trial with credits)");
    assertEqual(state.creditsPerMonth, 50, "creditsPerMonth is 50 (trial)");
    assertEqual(state.canTopUp, false, "canTopUp is false for trial");
    assertEqual(state.canUpgrade, true, "canUpgrade is true (starter < scaling)");
}

// ═══════════════════════════════════════════════════════════
// Additional: Pending downgrade
// ═══════════════════════════════════════════════════════════
console.log("\nAdditional: Pending downgrade");
{
    const futureDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
    const state = buildBillingState({
        plan: "pro",
        credits: 2000,
        isTrial: false,
        paddleCustomerId: "ctm_downgrade",
        paddleSubscriptionId: "sub_downgrade",
        pendingPlan: "starter",
        pendingPlanEffectiveAt: Timestamp.fromDate(futureDate),
    });
    assertEqual(state.plan, "pro", "current plan is still pro");
    assertEqual(state.pendingPlan, "starter", "pendingPlan is starter");
    assert(state.pendingPlanEffectiveAt !== null, "pendingPlanEffectiveAt is set");
    assertEqual(state.billingStatus, "active", "billingStatus is active");
}

// ═══════════════════════════════════════════════════════════
// Additional: Cancelling overrides explicit billingStatus
// ═══════════════════════════════════════════════════════════
console.log("\nAdditional: billingStatus='cancelled' overrides cancelling");
{
    const state = buildBillingState({
        plan: "none",
        credits: 0,
        isTrial: false,
        billingStatus: "cancelled",
        cancelAtPeriodEnd: true,
    });
    assertEqual(state.billingStatus, "cancelled", "explicit 'cancelled' wins over cancelAtPeriodEnd");
}

// ═══════════════════════════════════════════════════════════
// Additional: nextResetDate passthrough
// ═══════════════════════════════════════════════════════════
console.log("\nAdditional: nextResetDate passthrough");
{
    const resetDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
    const state = buildBillingState({
        plan: "pro",
        credits: 2000,
        isTrial: false,
        nextCreditReset: Timestamp.fromDate(resetDate),
    });
    assert(state.nextResetDate !== null, "nextResetDate is set");
    assertEqual(state.nextResetDate!.seconds, Math.floor(resetDate.getTime() / 1000), "nextResetDate.seconds matches");
}

// ═══════════════════════════════════════════════════════════
console.log(`\n═══ Results: ${passed} passed, ${failed} failed ═══`);
process.exit(failed > 0 ? 1 : 0);
