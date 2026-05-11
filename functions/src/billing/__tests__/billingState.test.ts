// functions/src/billing/__tests__/billingState.test.ts — billingState contract tests (Stripe fields)

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
// (a) subscription.created → sets correct plan/credits/stripeCustomerId/stripeSubscriptionId
// ═══════════════════════════════════════════════════════════
console.log("\n(a) subscription.created → Pro monthly");
{
    const state = buildBillingState({
        plan: "pro",
        credits: 2500,
        isTrial: false,
        stripeCustomerId: "cus_test123",
        stripeSubscriptionId: "sub_test456",
        billingStatus: "active",
    });
    assertEqual(state.plan, "pro", "plan is pro");
    assertEqual(state.credits, 2500, "credits is 2500");
    assertEqual(state.billingStatus, "active", "billingStatus is active");
    assertEqual(state.stripeCustomerId, "cus_test123", "stripeCustomerId is set");
    assertEqual(state.stripeSubscriptionId, "sub_test456", "stripeSubscriptionId is set");
    assertEqual(state.creditsPerMonth, 2500, "creditsPerMonth is 2500 for pro");
    assertEqual(state.canUpgrade, true, "canUpgrade is true (pro < scale)");
    assertEqual(state.canTopUp, true, "canTopUp is true");
}

console.log("\n(a.2) subscription.created → Starter plan");
{
    const state = buildBillingState({
        plan: "starter",
        credits: 800,
        isTrial: false,
        stripeCustomerId: "cus_starter",
        stripeSubscriptionId: "sub_starter",
        billingStatus: "active",
    });
    assertEqual(state.plan, "starter", "plan is starter");
    assertEqual(state.credits, 800, "credits is 800");
    assertEqual(state.creditsPerMonth, 800, "creditsPerMonth is 800 for starter");
    assertEqual(state.canUpgrade, true, "canUpgrade is true (starter < scale)");
}

console.log("\n(a.3) Legacy mapping: creator → pro");
{
    const state = buildBillingState({
        plan: "creator",
        credits: 2500,
        isTrial: false,
        stripeCustomerId: "cus_creator",
        stripeSubscriptionId: "sub_creator",
        billingStatus: "active",
    });
    assertEqual(state.plan, "pro", "plan mapped from creator to pro");
    assertEqual(state.credits, 2500, "credits is 2500");
    assertEqual(state.creditsPerMonth, 2500, "creditsPerMonth is 2500 (pro after mapping)");
}

console.log("\n(a.4) subscription.created → Scale plan");
{
    const state = buildBillingState({
        plan: "scale",
        credits: 6500,
        isTrial: false,
        stripeCustomerId: "cus_scale",
        stripeSubscriptionId: "sub_scale",
        billingStatus: "active",
    });
    assertEqual(state.plan, "scale", "plan is scale");
    assertEqual(state.credits, 6500, "credits is 6500");
    assertEqual(state.creditsPerMonth, 6500, "creditsPerMonth is 6500 for scale");
    assertEqual(state.canUpgrade, false, "canUpgrade is false for scale (highest tier)");
    assertEqual(state.canTopUp, true, "canTopUp is true for scale");
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
    assertEqual(state.stripeCustomerId, null, "stripeCustomerId is null");
    assertEqual(state.stripeSubscriptionId, null, "stripeSubscriptionId is null");
}

console.log("\n(b.2) subscription.canceled — Stripe fields still present from prior subscription");
{
    const state = buildBillingState({
        plan: "none",
        credits: 0,
        isTrial: false,
        billingStatus: "cancelled",
        stripeCustomerId: "cus_cancelled",
        stripeSubscriptionId: "sub_cancelled",
    });
    assertEqual(state.stripeCustomerId, "cus_cancelled", "stripeCustomerId preserved");
    assertEqual(state.stripeSubscriptionId, "sub_cancelled", "stripeSubscriptionId preserved");
}

// ═══════════════════════════════════════════════════════════
// (c) Top-up → credits added, status unchanged
// ═══════════════════════════════════════════════════════════
console.log("\n(c) top-up → credits added");
{
    const state = buildBillingState({
        plan: "pro",
        credits: 2800,
        isTrial: false,
        stripeCustomerId: "cus_test123",
        stripeSubscriptionId: "sub_test456",
        billingStatus: "active",
    });
    assertEqual(state.credits, 2800, "credits is 2800 (2500 base + 300 top-up)");
    assertEqual(state.billingStatus, "active", "billingStatus is active");
    assertEqual(state.canTopUp, true, "canTopUp is true");
    assertEqual(state.creditsPerMonth, 2500, "creditsPerMonth is still 2500 (plan unchanged)");
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
        stripeCustomerId: "cus_past_due",
        stripeSubscriptionId: "sub_past_due",
        gracePeriodEndsAt: Timestamp.fromDate(graceEnd),
    });
    assertEqual(state.billingStatus, "past_due", "billingStatus is past_due");
    assertEqual(state.credits, 1500, "credits is still 1500 (NOT zeroed)");
    assert(state.gracePeriodEndsAt !== null, "gracePeriodEndsAt is set");
    assertEqual(state.canTopUp, false, "canTopUp is false during past_due");
}

// ═══════════════════════════════════════════════════════════
// (e) Empty data → graceful defaults
// ═══════════════════════════════════════════════════════════
console.log("\n(e) Empty data → graceful defaults");
{
    const state = buildBillingState({});
    assertEqual(state.plan, "none", "plan defaults to none");
    assertEqual(state.credits, 0, "credits defaults to 0");
    assertEqual(state.billingStatus, "cancelled", "billingStatus defaults to cancelled");
    assertEqual(state.stripeCustomerId, null, "stripeCustomerId is null");
    assertEqual(state.stripeSubscriptionId, null, "stripeSubscriptionId is null");
    assertEqual(state.isTrial, false, "isTrial defaults to false");
    assertEqual(state.isTeamMember, false, "isTeamMember defaults to false");
}

console.log("\n(e.2) Partial data — only plan set");
{
    const state = buildBillingState({ plan: "starter" });
    assertEqual(state.plan, "starter", "plan is starter");
    assertEqual(state.credits, 0, "credits defaults to 0");
    assertEqual(state.creditsPerMonth, 800, "creditsPerMonth is 800 for starter");
    assertEqual(state.billingStatus, "active", "billingStatus is active");
}

// ═══════════════════════════════════════════════════════════
// (f) Minimal Stripe data
// ═══════════════════════════════════════════════════════════
console.log("\n(f) Minimal data with stripeCustomerId only");
{
    const state = buildBillingState({
        plan: "pro",
        credits: 2500,
        isTrial: false,
        stripeCustomerId: "cus_only",
    });
    assertEqual(state.plan, "pro", "plan is pro");
    assertEqual(state.stripeCustomerId, "cus_only", "stripeCustomerId is set");
    assertEqual(state.stripeSubscriptionId, null, "stripeSubscriptionId is null");
    assertEqual(state.billingStatus, "active", "billingStatus is active");
    assertEqual(state.canTopUp, true, "canTopUp is true");
}

// ═══════════════════════════════════════════════════════════
// (g) pending_plans data shape (Stripe fields)
// ═══════════════════════════════════════════════════════════
console.log("\n(g) pending_plans data → correct Stripe fields");
{
    const state = buildBillingState({
        plan: "starter",
        credits: 800,
        isTrial: false,
        stripeCustomerId: "cus_pending",
        stripeSubscriptionId: "sub_pending",
        billingStatus: "active",
    });
    assertEqual(state.plan, "starter", "plan is starter");
    assertEqual(state.credits, 800, "credits is 800");
    assertEqual(state.stripeCustomerId, "cus_pending", "stripeCustomerId is set");
    assertEqual(state.stripeSubscriptionId, "sub_pending", "stripeSubscriptionId is set");
    assertEqual(state.canUpgrade, true, "canUpgrade is true");
}

// ═══════════════════════════════════════════════════════════
// Additional: Team member restrictions
// ═══════════════════════════════════════════════════════════
console.log("\nAdditional: Team member restrictions");
{
    const state = buildBillingState({
        plan: "pro",
        credits: 2500,
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
// Additional: Cancelling state
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
        stripeCustomerId: "cus_cancelling",
        stripeSubscriptionId: "sub_cancelling",
    });
    assertEqual(state.billingStatus, "cancelling", "billingStatus is cancelling");
    assert(state.cancelAt !== null, "cancelAt is set");
    assertEqual(state.canTopUp, true, "canTopUp still true while cancelling");
    assertEqual(state.canUpgrade, true, "canUpgrade still true while cancelling");
}

// ═══════════════════════════════════════════════════════════
// Additional: Trial expired
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
// Additional: Trial active
// ═══════════════════════════════════════════════════════════
console.log("\nAdditional: Trial active (credits > 0)");
{
    const state = buildBillingState({
        plan: "starter",
        credits: 30,
        isTrial: true,
    });
    assertEqual(state.isTrial, true, "isTrial is true");
    assertEqual(state.billingStatus, "active", "billingStatus is active");
    assertEqual(state.creditsPerMonth, 50, "creditsPerMonth is 50 (trial)");
    assertEqual(state.canTopUp, false, "canTopUp is false for trial");
}

// ═══════════════════════════════════════════════════════════
// Additional: Legacy mappings
// ═══════════════════════════════════════════════════════════
console.log("\nLegacy: creator → pro");
{
    const state = buildBillingState({ plan: "creator" });
    assertEqual(state.plan, "pro", "creator mapped to pro");
}

console.log("\nLegacy: scaling → scale");
{
    const state = buildBillingState({ plan: "scaling" });
    assertEqual(state.plan, "scale", "scaling mapped to scale");
}

// ═══════════════════════════════════════════════════════════
console.log(`\n═══ Results: ${passed} passed, ${failed} failed ═══`);
process.exit(failed > 0 ? 1 : 0);
