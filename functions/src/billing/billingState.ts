/**
 * functions/src/billing/billingState.ts
 * ═══════════════════════════════════════════════════════════════════════════
 * SINGLE WRITE POINT for the derived `billingState` field on user documents.
 *
 * buildBillingState() — pure function that computes BillingState from user doc data
 * writeBillingState() — reads user doc, calls buildBillingState(), writes result
 *
 * Every backend path that touches plan/credits MUST call writeBillingState()
 * after its mutation so the frontend real-time listener stays in sync.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import * as admin from "firebase-admin";
import type { Firestore } from "firebase-admin/firestore";
import { PLAN_CREDITS, TRIAL_CREDITS } from "../entitlements.js";

// ─── TYPES ─────────────────────────────────────────────────────────────────

export type UserPlan = "starter" | "creator" | "pro" | "scaling" | "none";

export type BillingStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "cancelling"
  | "cancelled";

export interface BillingState {
  plan: UserPlan;
  isTrial: boolean;
  credits: number;
  creditsPerMonth: number;
  billingStatus: BillingStatus;
  nextResetDate: admin.firestore.Timestamp | null;
  cancelAt: admin.firestore.Timestamp | null;
  stripeCustomerId: string | null;
  canUpgrade: boolean;
  canTopUp: boolean;
  isTeamMember: boolean;
  teamOwnerUid: string | null;
  gracePeriodEndsAt: admin.firestore.Timestamp | null;
}

// ─── BUILD BILLING STATE (pure function) ───────────────────────────────────

export interface BuildBillingStateInput {
  plan?: string;
  isTrial?: boolean;
  credits?: number;
  stripeCustomerId?: string | null;
  isTeamMember?: boolean;
  teamOwnerUid?: string | null;
  cancelAtPeriodEnd?: boolean;
  cancelAt?: admin.firestore.Timestamp | null;
  billingStatus?: string;
  gracePeriodEndsAt?: admin.firestore.Timestamp | null;
  nextResetDate?: admin.firestore.Timestamp | null;
}

const VALID_PLANS = new Set<string>(["starter", "creator", "pro", "scaling", "none"]);

export function buildBillingState(data: BuildBillingStateInput): BillingState {
  const rawPlan = data.plan || "none";
  const plan: UserPlan = VALID_PLANS.has(rawPlan) ? rawPlan as UserPlan : "none";
  const isTrial = data.isTrial === true;
  const credits = data.credits ?? 0;
  const isTeamMember = data.isTeamMember === true;
  const teamOwnerUid = data.teamOwnerUid || null;
  const stripeCustomerId = data.stripeCustomerId || null;
  const cancelAtPeriodEnd = data.cancelAtPeriodEnd === true;
  const cancelAt = data.cancelAt || null;
  const gracePeriodEndsAt = data.gracePeriodEndsAt || null;
  const nextResetDate = data.nextResetDate || null;

  // ── Derive creditsPerMonth ──
  const creditsPerMonth = isTrial
    ? TRIAL_CREDITS
    : (plan !== "none" ? (PLAN_CREDITS[plan as keyof typeof PLAN_CREDITS] ?? 0) : 0);

  // ── Derive billingStatus ──
  let billingStatus: BillingStatus;

  if (data.billingStatus === "past_due" || (gracePeriodEndsAt !== null && plan !== "none")) {
    billingStatus = "past_due";
  } else if (data.billingStatus === "cancelled" || plan === "none") {
    billingStatus = "cancelled";
  } else if (data.billingStatus === "cancelling" || cancelAtPeriodEnd) {
    billingStatus = "cancelling";
  } else if (isTrial) {
    // Trial with 0 credits = cancelled (trial expired)
    billingStatus = credits > 0 ? "trialing" : "cancelled";
  } else if (data.billingStatus === "active" || (plan as string) !== "none") {
    billingStatus = "active";
  } else {
    billingStatus = "cancelled";
  }

  // ── Derive canUpgrade ──
  const canUpgrade = !isTeamMember && plan !== "scaling";

  // ── Derive canTopUp ──
  const canTopUp =
    !isTeamMember &&
    !isTrial &&
    billingStatus !== "cancelled";

  return {
    plan,
    isTrial,
    credits,
    creditsPerMonth,
    billingStatus,
    nextResetDate,
    cancelAt: cancelAtPeriodEnd ? cancelAt : null,
    stripeCustomerId,
    canUpgrade,
    canTopUp,
    isTeamMember,
    teamOwnerUid,
    gracePeriodEndsAt: billingStatus === "past_due" ? gracePeriodEndsAt : null,
  };
}

// ─── WRITE BILLING STATE (Firestore helper) ────────────────────────────────

export async function writeBillingState(
  uid: string,
  db: Firestore
): Promise<void> {
  console.log(`💳 writeBillingState START uid=${uid}`);
  const userRef = db.collection("users").doc(uid);
  const snap = await userRef.get();
  if (!snap.exists) {
    console.log(`💳 writeBillingState SKIP uid=${uid} — user doc not found`);
    return;
  }

  const data = snap.data()!;
  const state = buildBillingState({
    plan: data.plan,
    isTrial: data.isTrial,
    credits: data.credits,
    stripeCustomerId: data.stripeCustomerId,
    isTeamMember: data.isTeamMember,
    teamOwnerUid: data.teamOwnerUid,
    cancelAtPeriodEnd: data.cancelAtPeriodEnd,
    cancelAt: data.cancelAt,
    billingStatus: data.billingStatus,
    gracePeriodEndsAt: data.gracePeriodEndsAt,
    nextResetDate: data.nextResetDate,
  });
  console.log(`💳 writeBillingState BUILT uid=${uid} plan=${state.plan} status=${state.billingStatus} credits=${state.credits}`);

  try {
    await userRef.update({ billingState: state });
    console.log(`💳 writeBillingState OK uid=${uid}`);
  } catch (err) {
    console.error(`💳 writeBillingState FAIL uid=${uid}`, err);
    throw err;
  }
}
