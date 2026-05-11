// functions/src/billing/billingStateShape.ts — TypeScript shape of derived billing state
// Contract: this file defines the canonical BillingState shape shared between
// backend (functions/src/billing/billingState.ts) and frontend (src/hooks/useBillingState.ts).
// Drift between backend and frontend is forbidden by Constitution Principle XI.

export type Plan = "starter" | "pro" | "scale" | "none";

export type BillingStatus =
    | "trialing"
    | "active"
    | "past_due"
    | "cancelling"
    | "cancelled"
    | "none";

export type BillingType = "monthly" | "annual";

export interface BillingStateShape {
    plan: Plan;
    isTrial: boolean;
    credits: number;
    creditsPerMonth: number;
    billingStatus: BillingStatus;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    nextResetDate: Date | null;
    canUpgrade: boolean;
    canTopUp: boolean;
    isTeamMember: boolean;
    teamOwnerUid: string | null;
    teamOwnerName: string | null;
    cancelAt: Date | null;
    gracePeriodEndsAt: Date | null;
    pendingPlan: Plan | null;
    pendingPlanEffectiveAt: Date | null;
}

export const STRIPE_WEBHOOK_EVENTS = [
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "invoice.payment_succeeded",
    "invoice.payment_failed",
    "charge.refunded",
] as const;

export type StripeWebhookEvent = (typeof STRIPE_WEBHOOK_EVENTS)[number];

export const STRIPE_ERROR_CODES = [
    "stripe_signature_invalid",
    "stripe_event_duplicate",
    "stripe_event_unknown",
    "stripe_price_unmapped",
    "ghl_sync_failed",
    "portal_session_generation_failed",
    "user_doc_missing",
    "pending_plan_write_failed",
    "billing_state_write_failed",
    "refund_processed",
] as const;

export type StripeErrorCode = (typeof STRIPE_ERROR_CODES)[number];

export interface StripeEventRecord {
    eventType: StripeWebhookEvent;
    processedAt: Date;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    email: string | null;
    result: "applied" | "duplicate" | "noop_dual_event" | "ignored" | "partial_refund_logged";
}

export interface PendingPlanRecord {
    email: string;
    plan: Plan;
    credits: number;
    isTrial: boolean;
    billingType: BillingType;
    stripeCustomerId: string;
    stripeSubscriptionId: string;
    purchasedAt: Date;
    sourceEventId: string;
}
