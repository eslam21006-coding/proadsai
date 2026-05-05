/**
 * Contract: BillingState shape (single source of truth)
 *
 * This file defines the TypeScript shape of the derived `billingState` sub-object
 * written to `users/{uid}.billingState` by the backend and consumed by the
 * frontend `useBillingState()` hook.
 *
 * Backend source: functions/src/billing/billingState.ts (writeBillingState)
 * Frontend consumer: src/hooks/useBillingState.ts
 *
 * Both must import (or duplicate verbatim) this shape. Drift between backend
 * and frontend is forbidden by Constitution Principle XI.
 *
 * Phase 21 changes vs Phase 8:
 *  - Added: stripeCustomerId, stripeSubscriptionId
 *  - Removed: paddleCustomerId, paddleSubscriptionId, paddleUpdatePaymentUrl, paddleCancelUrl
 *  - Portal URLs are NEVER stored on this object — generated on demand by
 *    createStripePortalSession callable.
 */

export type Plan = 'starter' | 'pro' | 'scale' | 'none';

export type BillingStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'cancelling'
  | 'cancelled'
  | 'none';

export type BillingType = 'monthly' | 'annual';

export interface BillingState {
  /** Current plan ID. */
  plan: Plan;

  /** Whether the user is currently on a Stripe trial (`trial_period_days`). */
  isTrial: boolean;

  /** Current credit balance. Decremented on credit-consuming actions, reset on renewals or top-ups. */
  credits: number;

  /** The plan's monthly credit allocation. */
  creditsPerMonth: number;

  /** Lifecycle state. See data-model.md state transitions. */
  billingStatus: BillingStatus;

  /** Stripe Customer ID (`cus_xxx`). Reused across resubscriptions. */
  stripeCustomerId: string | null;

  /** Stripe Subscription ID (`sub_xxx`). Cleared on cancellation. */
  stripeSubscriptionId: string | null;

  /** When credits will next reset (subscription renewal date). Null for `none`/`cancelled`. */
  nextResetDate: Date | null;

  /** Whether the user can upgrade (not on highest plan, not team member). */
  canUpgrade: boolean;

  /** Whether the user can purchase top-ups (paid plan, not team member, not past_due). */
  canTopUp: boolean;

  /** Whether this user is a team member (reads owner's billing). */
  isTeamMember: boolean;

  /** Owner's UID (if isTeamMember). */
  teamOwnerUid: string | null;

  /** Owner's display name for UI label "Team credits — {teamOwnerName}'s account". */
  teamOwnerName: string | null;

  /** Scheduled cancellation date (when `cancel_at_period_end=true`). */
  cancelAt: Date | null;

  /** Grace period expiry for `past_due`. */
  gracePeriodEndsAt: Date | null;

  /** Pending downgrade plan (if user scheduled one via Stripe Customer Portal). */
  pendingPlan: Plan | null;

  /** When the pending downgrade takes effect. */
  pendingPlanEffectiveAt: Date | null;
}

/**
 * Stripe webhook event types subscribed by Phase 21 (FR-014).
 * Order matters: `checkout.session.completed` is the primary entry for in-app subs;
 * `customer.subscription.created` is the dual-event fallback for paths bypassing
 * Checkout Sessions (e.g., GHL native Stripe integration).
 */
export const STRIPE_WEBHOOK_EVENTS = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
  'charge.refunded',
] as const;

export type StripeWebhookEvent = (typeof STRIPE_WEBHOOK_EVENTS)[number];

/**
 * Error classification codes (FR-026 vocabulary). All billing pipeline
 * structured logs MUST carry one of these codes when status is error.
 */
export const STRIPE_ERROR_CODES = [
  'stripe_signature_invalid',
  'stripe_event_duplicate',
  'stripe_event_unknown',
  'stripe_price_unmapped',
  'ghl_sync_failed',
  'portal_session_generation_failed',
  'user_doc_missing',
  'pending_plan_write_failed',
  'billing_state_write_failed',
  'refund_processed',
] as const;

export type StripeErrorCode = (typeof STRIPE_ERROR_CODES)[number];

/**
 * Stripe event idempotency record (`stripe_events/{eventId}`).
 */
export interface StripeEventRecord {
  eventType: StripeWebhookEvent;
  processedAt: Date;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  email: string | null;
  result: 'applied' | 'duplicate' | 'noop_dual_event' | 'ignored' | 'partial_refund_logged';
}

/**
 * Pending plan record (`pending_plans/{email.toLowerCase()}`).
 * Created when a user pays via the GHL funnel before signing up.
 * Consumed on first Firebase Auth sign-in.
 */
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
