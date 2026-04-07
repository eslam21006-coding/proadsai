/**
 * BillingState — derived field on users/{uid} Firestore document.
 *
 * Written by backend Cloud Functions on every billing event.
 * Consumed by frontend via real-time Firestore listener (useBillingState hook).
 *
 * This is the SINGLE SOURCE OF TRUTH for all plan-gating and billing UI.
 */

import { Timestamp } from "firebase-admin/firestore";

export type UserPlan = "starter" | "creator" | "pro" | "scaling" | "none";

export type BillingStatus =
  | "active"       // Paid and current
  | "trialing"     // Free trial with credits remaining
  | "past_due"     // Payment failed, in Stripe-managed grace period
  | "cancelling"   // User cancelled, access continues until period end
  | "cancelled";   // Access fully revoked, credits = 0

export interface BillingState {
  plan: UserPlan;
  isTrial: boolean;
  credits: number;
  creditsPerMonth: number;
  billingStatus: BillingStatus;
  nextResetDate: Timestamp | null;
  cancelAt: Timestamp | null;
  stripeCustomerId: string | null;
  canUpgrade: boolean;
  canTopUp: boolean;
  isTeamMember: boolean;
  teamOwnerUid: string | null;
  gracePeriodEndsAt: Timestamp | null;
}

/**
 * Cancellation reason — dropdown values for the two-step cancellation flow.
 */
export type CancellationReason =
  | "too_expensive"
  | "not_using_enough"
  | "switching_competitor"
  | "missing_features"
  | "other";

/**
 * CancellationRecord — written to cancellations/{docId} collection.
 */
export interface CancellationRecord {
  uid: string;
  email: string;
  plan: UserPlan;
  reason: CancellationReason;
  feedback: string | null;
  cancelAt: Timestamp;
  createdAt: Timestamp;
}
