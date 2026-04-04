// functions/src/billing/__tests__/billingState.test.ts — unit test fixtures for buildBillingState

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

// ═════════════════════════════════════════════════════════════
// Test 1: ghlpaymentwebhook with pro_monthly → active
// ═════════════════════════════════════════════════════════════
console.log("\nTest 1: Pro monthly subscription → active");
{
  const state = buildBillingState({
    plan: "pro",
    credits: 2000,
    isTrial: false,
    stripeCustomerId: "cus_test123",
    billingStatus: "active",
  });
  assert(state.plan === "pro", "plan is pro");
  assert(state.credits === 2000, "credits is 2000");
  assert(state.billingStatus === "active", "billingStatus is active");
  assert(state.creditsPerMonth === 2000, "creditsPerMonth is 2000");
  assert(state.canUpgrade === true, "canUpgrade is true");
  assert(state.canTopUp === true, "canTopUp is true");
  assert(state.isTeamMember === false, "isTeamMember is false");
}

// ═════════════════════════════════════════════════════════════
// Test 2: ghlCancellationWebhook → cancelled
// ═════════════════════════════════════════════════════════════
console.log("\nTest 2: Cancellation → cancelled");
{
  const state = buildBillingState({
    plan: "none",
    credits: 0,
    isTrial: false,
    billingStatus: "cancelled",
  });
  assert(state.plan === "none", "plan is none");
  assert(state.credits === 0, "credits is 0");
  assert(state.billingStatus === "cancelled", "billingStatus is cancelled");
  assert(state.canUpgrade === true, "canUpgrade is true (can re-subscribe)");
  assert(state.canTopUp === false, "canTopUp is false");
}

// ═════════════════════════════════════════════════════════════
// Test 3: Monthly reset overwrites credits to plan allotment
// ═════════════════════════════════════════════════════════════
console.log("\nTest 3: Monthly reset on Pro (overwrite to 2000)");
{
  const state = buildBillingState({
    plan: "pro",
    credits: 2000,
    isTrial: false,
    lastCreditReset: Timestamp.fromDate(new Date()),
  });
  assert(state.credits === 2000, "credits is 2000 (plan allotment, not accumulated)");
  assert(state.creditsPerMonth === 2000, "creditsPerMonth is 2000");
  assert(state.billingStatus === "active", "billingStatus is active");
}

// ═════════════════════════════════════════════════════════════
// Test 4: Trial user with 0 credits → billingStatus=trialing, canTopUp=false
// ═════════════════════════════════════════════════════════════
console.log("\nTest 4: Trial user with 0 credits");
{
  const state = buildBillingState({
    plan: "starter",
    credits: 0,
    isTrial: true,
  });
  assert(state.isTrial === true, "isTrial is true");
  assert(state.billingStatus === "cancelled", "billingStatus is cancelled (0 trial credits)");
  assert(state.canTopUp === false, "canTopUp is false for trial");
  assert(state.creditsPerMonth === 50, "creditsPerMonth is 50 (trial)");
}

// ═════════════════════════════════════════════════════════════
// Test 5: Team member → canUpgrade=false, canTopUp=false
// ═════════════════════════════════════════════════════════════
console.log("\nTest 5: Team member restrictions");
{
  const state = buildBillingState({
    plan: "pro",
    credits: 2000,
    isTrial: false,
    isTeamMember: true,
    teamOwnerUid: "owner123",
  });
  assert(state.isTeamMember === true, "isTeamMember is true");
  assert(state.teamOwnerUid === "owner123", "teamOwnerUid is owner123");
  assert(state.canUpgrade === false, "canUpgrade is false for team member");
  assert(state.canTopUp === false, "canTopUp is false for team member");
}

// ═════════════════════════════════════════════════════════════
// Test 6: Scaling plan → canUpgrade=false (highest plan)
// ═════════════════════════════════════════════════════════════
console.log("\nTest 6: Scaling plan (highest tier)");
{
  const state = buildBillingState({
    plan: "scaling",
    credits: 5000,
    isTrial: false,
  });
  assert(state.canUpgrade === false, "canUpgrade is false for scaling");
  assert(state.canTopUp === true, "canTopUp is true for scaling");
  assert(state.creditsPerMonth === 5000, "creditsPerMonth is 5000");
}

// ═════════════════════════════════════════════════════════════
// Test 7: Cancelling status → cancelling
// ═════════════════════════════════════════════════════════════
console.log("\nTest 7: Cancelling state");
{
  const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const state = buildBillingState({
    plan: "pro",
    credits: 1500,
    isTrial: false,
    cancelAtPeriodEnd: true,
    cancelAt: Timestamp.fromDate(futureDate),
  });
  assert(state.billingStatus === "cancelling", "billingStatus is cancelling");
  assert(state.cancelAt !== null, "cancelAt is set");
  assert(state.canTopUp === true, "canTopUp still true while cancelling");
}

// ═════════════════════════════════════════════════════════════
// Test 8: Past due with grace period
// ═════════════════════════════════════════════════════════════
console.log("\nTest 8: Past due with grace period");
{
  const graceEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const state = buildBillingState({
    plan: "pro",
    credits: 1500,
    isTrial: false,
    gracePeriodEndsAt: Timestamp.fromDate(graceEnd),
  });
  assert(state.billingStatus === "past_due", "billingStatus is past_due");
  assert(state.gracePeriodEndsAt !== null, "gracePeriodEndsAt is set");
}

// ═════════════════════════════════════════════════════════════
console.log(`\n═══ Results: ${passed} passed, ${failed} failed ═══`);
process.exit(failed > 0 ? 1 : 0);
