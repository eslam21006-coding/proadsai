# Data Model: Stripe Migration

**Branch**: `021-stripe-migration` | **Date**: 2026-05-05

## Entities

### 1. User Document (`users/{uid}`)

Existing Firestore document. Paddle-specific fields are removed and replaced with Stripe-specific fields. Behavior fields (plan, credits, isTrial, billingStatus, team, cancellation reason, grace period, etc.) are unchanged from Phase 8.

**Billing-relevant fields**:

| Field | Type | Description | Change vs Phase 8 |
|---|---|---|---|
| `plan` | string | `'starter'` \| `'pro'` \| `'scale'` \| `'none'` — mirrored at `billingState.plan`; see "Two-field plan mirroring" callout in entity 2 | UNCHANGED |
| `credits` | number | Current credit balance | UNCHANGED |
| `isTrial` | boolean | Whether user is on trial | UNCHANGED |
| `billingStatus` | string | `'trialing'` \| `'active'` \| `'past_due'` \| `'cancelling'` \| `'cancelled'` \| `'none'` | UNCHANGED |
| `billingType` | string | `'monthly'` \| `'annual'` | UNCHANGED (resolved from `price.recurring.interval`) |
| `stripeCustomerId` | string? | Stripe Customer ID (`cus_xxx`) | **NEW** (replaces `paddleCustomerId`) |
| `stripeSubscriptionId` | string? | Stripe Subscription ID (`sub_xxx`) | **NEW** (replaces `paddleSubscriptionId`) |
| `paddleCustomerId` | — | — | **REMOVED** |
| `paddleSubscriptionId` | — | — | **REMOVED** |
| `paddleUpdatePaymentUrl` | — | — | **REMOVED** (no equivalent — portal URL generated on demand) |
| `paddleCancelUrl` | — | — | **REMOVED** (no equivalent — portal URL generated on demand) |
| `planUpdatedAt` | Timestamp? | When plan last changed | UNCHANGED |
| `lastCreditReset` | Timestamp? | When credits were last reset by monthly cycle | UNCHANGED |
| `lastTopup` | Timestamp? | Timestamp of last top-up purchase | UNCHANGED |
| `lastTopupPack` | string? | Pack ID of last top-up (`'topup100'` / `'topup300'` / `'topup800'`) | UNCHANGED |
| `cancelAtPeriodEnd` | boolean? | Whether cancellation is scheduled | UNCHANGED |
| `cancelAt` | Timestamp? | When subscription ends after cancellation | UNCHANGED |
| `pendingPlan` | string? | Plan the user is downgrading to at end of period | UNCHANGED |
| `pendingPlanEffectiveAt` | Timestamp? | When the pending downgrade takes effect | UNCHANGED |
| `cancellationReason` | string? | Reason code from in-app cancellation dialog | UNCHANGED |
| `cancellationFeedback` | string? | Free-text feedback | UNCHANGED |
| `billingIssueAt` | Timestamp? | When payment failure was detected | UNCHANGED |
| `billingIssueType` | string? | Type of billing issue | UNCHANGED |
| `gracePeriodEndsAt` | Timestamp? | When grace period expires | UNCHANGED |
| `ghlContactId` | string? | GHL CRM contact ID (legacy — optional in Firebase→GHL direction) | UNCHANGED |
| `isTeamMember` | boolean? | Whether this user is a team member (not owner) | UNCHANGED |
| `teamOwnerUid` | string? | UID of the team owner (if team member) | UNCHANGED |
| `teamRole` | string? | `'admin'` \| `'editor'` \| `'viewer'` | UNCHANGED |
| `createdAt` | Timestamp? | When the Firestore user doc was created (welcome toast 60s window) | UNCHANGED |
| `welcomeToastShown` | boolean? | Set after the welcome trial toast is displayed | UNCHANGED |
| `billingState` | BillingState | **Derived sub-object** — see entity 2 | SHAPE UPDATED |

**Auth-related fields** (distinct from Firebase Auth user record):

| Field | Type | Description |
|---|---|---|
| `email` | string | User email (canonical, may be lowercased for lookup) |
| `displayName` | string? | User's display name (may come from Stripe Customer name) |

### 2. BillingState (derived sub-object on `users/{uid}.billingState`)

Written by `writeBillingState(uid)` on every billing event. Read by the frontend via `useBillingState()` real-time listener.

| Field | Type | Description |
|---|---|---|
| `plan` | string | Current plan ID (`'starter'` / `'pro'` / `'scale'` / `'none'`) |
| `isTrial` | boolean | Trial status |
| `credits` | number | Current credit balance |
| `creditsPerMonth` | number | Plan's monthly credit allocation |
| `billingStatus` | string | Lifecycle state |
| `nextResetDate` | Date? | When credits will next reset |
| `stripeCustomerId` | string? | Stripe Customer ID |
| `stripeSubscriptionId` | string? | Stripe Subscription ID |
| `canUpgrade` | boolean | Whether user can upgrade (not on highest plan, not team member) |
| `canTopUp` | boolean | Whether user can purchase top-ups (paid plan, not team member, not past_due) |
| `isTeamMember` | boolean | Whether this is a team member |
| `teamOwnerUid` | string? | Team owner's UID |
| `teamOwnerName` | string? | Team owner's display name for UI label |
| `cancelAt` | Timestamp? | Scheduled cancellation date |
| `gracePeriodEndsAt` | Timestamp? | Grace period expiry for past_due |
| `pendingPlan` | string? | Pending downgrade plan (if any) |
| `pendingPlanEffectiveAt` | Date? | When pending downgrade takes effect |

**Removed from billingState** (vs Phase 8): `paddleUpdatePaymentUrl`, `paddleCancelUrl`. Portal URLs are generated on demand by `createStripePortalSession` callable; never stored.

**Two-field plan mirroring**: The `plan` value lives at TWO locations in `users/{uid}` — the top-level field (read by server-side code like `entitlements.ts`) and the nested `billingState.plan` (read by the realtime listener in `useBillingState.ts`). Both must agree. The `writeBillingState()` function is responsible for writing both atomically. Any data migration script that touches `plan` MUST query and rewrite both fields. Detected during M1 backfill — single-field migration left `billingState.plan` stale until the script was updated to handle both.

### 3. Pending Plan (`pending_plans/{email.toLowerCase()}`)

Stores plan data for users who paid via the GHL funnel before creating a Firebase Auth account. Document ID is the lowercased email. Consumed by the sign-in handler on first login and then deleted.

| Field | Type | Description | Change vs Phase 8 |
|---|---|---|---|
| `email` | string | User email (lowercased — matches document ID) | UNCHANGED |
| `plan` | string | Plan to assign on first login | UNCHANGED |
| `credits` | number | Credits to assign | UNCHANGED |
| `isTrial` | boolean | Trial status | UNCHANGED |
| `billingType` | string | `'monthly'` \| `'annual'` | UNCHANGED |
| `stripeCustomerId` | string | Stripe Customer ID | **NEW** (replaces `paddleCustomerId`) |
| `stripeSubscriptionId` | string | Stripe Subscription ID | **NEW** (replaces `paddleSubscriptionId`) |
| `paddleCustomerId` | — | — | **REMOVED** |
| `paddleSubscriptionId` | — | — | **REMOVED** |
| `paddleUpdatePaymentUrl` | — | — | **REMOVED** |
| `paddleCancelUrl` | — | — | **REMOVED** |
| `purchasedAt` | Timestamp | When the purchase was made | UNCHANGED |
| `sourceEventId` | string | Stripe event ID that created this pending plan (for traceability) | UNCHANGED (was Paddle event ID) |

**Collision rule**: Last-write-wins (R-007). Stripe event-ID dedup (R-004) prevents literal duplicate event delivery from being applied twice.

### 4. Stripe Events (`stripe_events/{eventId}`)

Stores processed Stripe webhook event IDs for idempotency deduplication. Document ID is the Stripe event ID (e.g., `evt_1NxYz...`). Replaces `paddle_events/{eventId}`.

| Field | Type | Description |
|---|---|---|
| `eventType` | string | Stripe event type (e.g., `checkout.session.completed`) |
| `processedAt` | Timestamp | When the event was processed |
| `stripeCustomerId` | string? | Associated customer |
| `stripeSubscriptionId` | string? | Associated subscription |
| `email` | string? | Associated email (for pre-signup events) |
| `result` | string | `'applied'` \| `'duplicate'` \| `'noop_dual_event'` \| `'ignored'` |

**`'noop_dual_event'`** is the result code when application-level dedup detects that this event's subscription is already linked to a `users/{uid}` document via a prior event (R-005).

### 5. Cancellation Record (`cancellation_logs/{uid}_{timestamp}`)

Analytics collection for cancellation events. Captured by the frontend before redirecting to the Stripe Customer Portal cancellation flow. Schema unchanged from Phase 8.

| Field | Type | Description |
|---|---|---|
| `uid` | string | User ID |
| `email` | string | User email |
| `plan` | string | Plan at time of cancellation |
| `reason` | string | Cancellation reason code |
| `feedback` | string? | Optional free-text feedback |
| `cancelAt` | Timestamp? | When access ends (populated after Stripe webhook fires) |
| `createdAt` | Timestamp | When the cancellation dialog was submitted |

### 6. Stripe Customer (external — reference only)

The customer record in Stripe linked to the user's account, identified by `stripeCustomerId`. Not stored in Firestore beyond the ID reference. Reused on every in-app upgrade/top-up (R-009). Stripe handles tax calculation; tax filing is the merchant's responsibility (R-012).

### 7. Stripe Subscription (external — reference only)

The recurring billing relationship managed by Stripe, including billing cycle, price, payment method, status, `current_period_end`, `cancel_at_period_end`, `trial_end`. Referenced via `stripeSubscriptionId`. Stripe handles proration on plan changes; the app reads the resulting state from `customer.subscription.updated` events.

### 8. GHL Sync Event (external — reference only)

Best-effort outbound POST from Firebase to one of six GHL inbound webhook URLs, routed by normalized `event_type` per `contracts/ghl-inbound-payload.md`. Not persisted in Firestore — only the emission is logged with classification code (FR-026). The 6 URLs (`GHL_TRIAL_STARTED_URL`, `GHL_PAYMENT_RECEIVED_URL`, `GHL_RECOVERED_URL`, `GHL_OVERDUE_FAILED_URL`, `GHL_CANCELLED_URL`, `GHL_TOPUP_URL`) each correspond to one `event_type`. Payload is the canonical 21-field shape from contract §1; `portal_url` is generated transiently for every event. Top-up refunds and partial refunds do NOT emit a GHL POST.

### 9. Mandatory Billing Modal (UI state — not persisted)

A fullscreen dismiss-proof React modal containing the pricing table. Shown when `billingState.plan === 'none'` AND `!isTeamMember` AND no valid pending team invite exists. CTA invokes `createStripeCheckoutSession` (in-app Stripe Checkout, never GHL). Closes automatically when the listener detects a plan transition.

### 10. Refund Record (`refund_logs/{uid}_{timestamp}`)

Analytics collection for top-up refund events. Written by the `charge.refunded` handler when the refunded charge is identified as a top-up (`mode='payment'` with `metadata.isTopUp='true'`). Distinct from `cancellation_logs`, which is reserved strictly for plan-cancellation events (user-initiated or refund-driven). Schema:

| Field | Type | Description |
|---|---|---|
| `uid` | string | User ID |
| `email` | string | User email |
| `chargeId` | string | Stripe charge ID (`ch_xxx`) |
| `paymentIntentId` | string? | Stripe payment intent ID |
| `sessionId` | string? | Originating Stripe Checkout Session ID |
| `creditAmountDeducted` | number | Credits decremented from balance (clamped at 0; MAY be less than `metadata.creditAmount` if the user had already spent some) |
| `amount` | number | Refund amount in major USD units (e.g., `9.00`) |
| `reason` | string? | Refund reason from Stripe `metadata.reason` if present |
| `createdAt` | Timestamp | When the refund was processed |
| `sourceEventId` | string | Stripe event ID (`evt_xxx`) for traceability against `stripe_events/{eventId}` |

No GHL POST is emitted for entries in this collection (per FR-032 (b)).

## State Transitions

### billingStatus Lifecycle

```
trialing ──────────► active ◄──────── (payment recovered)
                       │                     ▲
                       │                     │
                       ▼                     │
                  past_due ───────────────┘
                       │
                       │ (grace period expires — Stripe sends customer.subscription.deleted)
                       ▼
                  cancelled ──► none
                       ▲
                       │
                 (user cancels via in-app dialog → Stripe Portal subscription_cancel flow → customer.subscription.updated with cancel_at_period_end=true)
                       │
                  active/cancelling
                       │
                       │ (period end OR full subscription refund triggers stripe.subscriptions.cancel)
                       ▼
                  cancelled ──► none
```

**Transitions**:

| From | To | Trigger |
|---|---|---|
| `trialing` | `active` | Trial converts (`customer.subscription.updated` with `status='active'`, fires after `trial_end` is reached and payment succeeds) |
| `trialing` | `cancelled` | Trial expires without card or with declined card (`customer.subscription.deleted`) |
| `active` | `past_due` | Payment fails (`invoice.payment_failed`) |
| `active` | `cancelling` | User cancels via in-app dialog → Stripe Portal → `customer.subscription.updated` with `cancel_at_period_end=true` |
| `cancelling` | `active` | User reactivates before period end (Stripe Portal — `customer.subscription.updated` with `cancel_at_period_end=false`) |
| `cancelling` | `cancelled` | Period end reached (`customer.subscription.deleted`) |
| `past_due` | `active` | Payment recovered (Stripe Smart Retries success — `invoice.payment_succeeded` followed by `customer.subscription.updated` with `status='active'`) |
| `past_due` | `cancelled` | Grace period expires (`customer.subscription.deleted`) |
| `active`/`cancelling` | `cancelled` | Full subscription refund triggers `stripe.subscriptions.cancel(stripeSubscriptionId)` → `customer.subscription.deleted` (R-015 branch 1) |
| `cancelled` | `none` | Final cleanup — plan set to `'none'`, credits to `0` |

### Authentication State Transitions

```
[no account] ──create──► [account created, email unverified]
                              │
                              │ click verification link
                              ▼
                         [email verified]
                              │
                              │ onAuthStateChanged / sign-in
                              ▼
           ┌──────────────────┼──────────────────┐
           │                  │                  │
           ▼                  ▼                  ▼
   [pending plan           [team invite      [no plan,
    consumed →               claimed →         no invite →
    users/{uid} with         isTeamMember:     mandatory
    plan + welcome           true]             billing modal
    toast]                                     (in-app Stripe
                                                Checkout)]
           │                  │                    │ pay
           └──────────────────┴────────────┐       ▼
                                           │   [plan transitions
                                           │    from 'none' →
                                           │    real plan, modal
                                           │    closes, welcome
                                           │    toast shown]
                                           │       │
                                           ▼       │
                                     [authenticated app access]
                                           ▲───────┘
```

## Relationships

```
User (1) ──── has ──── (1) BillingState (derived, embedded)
User (1) ──── has ──── (0..1) Pending Plan (pre-signup) — consumed on first login
User (1) ──── has ──── (0..n) Cancellation Records (analytics)
Stripe Events (n) ──── written by ──── Stripe Webhook (idempotency dedup)
Team Owner (1) ──── owns ──── (0..n) Team Members
Team Member ──── reads ──── Team Owner's BillingState (read-only)
Firebase Auth User (1) ──── keyed by email ──── Pending Plan (lookup on first sign-in)
Stripe Customer (1) ──── 1:1 ──── User (via stripeCustomerId; preserved across cancel/resubscribe)
Stripe Subscription (n) ──── 1:n ──── Stripe Customer (history of subscriptions; current one is users/{uid}.stripeSubscriptionId)
```

## Validation Rules

- `credits` MUST be >= 0 at all times (Firestore transaction enforces this on top-up refund deductions per R-015 branch 2)
- `plan` MUST be one of `'starter'`, `'pro'`, `'scale'`, `'none'`
- `billingStatus` MUST follow the defined lifecycle transitions
- `stripeCustomerId` SHOULD be unique across user documents (one customer per user — R-009)
- Once `users/{uid}.stripeCustomerId` is set, it MUST NOT be overwritten with a different value by a subsequent webhook (defensive guard against Stripe-side bugs or impersonation)
- `stripe_events/{eventId}` document ID MUST equal the Stripe `event.id` (natural dedup key)
- `pending_plans/{email}` document ID MUST be the lowercased email
- `cancellationReason` MUST be one of: `'too_expensive'`, `'not_using_enough'`, `'switching_competitor'`, `'missing_features'`, `'other'`, `'refund'` (the `'refund'` value is reserved for system-written `cancellation_logs` entries created by the `charge.refunded` handler per FR-032 (a))
- Team members (`isTeamMember: true`) MUST NOT have their own subscription — they use the owner's
- Credit deductions MUST be atomic (Firestore transaction)
- `billingState` writes MUST be atomic with the underlying field changes (same transaction)
- Email verification (`user.emailVerified === true`) MUST be checked before routing to any authenticated screen except the VerifyEmailScreen itself
- The welcome toast MUST only fire when `users/{uid}.createdAt` is within 60 seconds of the current time AND `users/{uid}.welcomeToastShown !== true`
- The mandatory billing modal MUST only render when `billingState.plan === 'none'` AND `!isTeamMember` AND no valid pending team invite exists for the user's email
- Application-level dedup: when `customer.subscription.created` arrives for a subscription whose `subscription.id` is already on `users/{uid}.stripeSubscriptionId`, the handler MUST exit without re-applying state and write `result: 'noop_dual_event'` to `stripe_events/{eventId}`
- Refund handler `charge.refunded` MUST distinguish full vs partial via `amount_refunded === amount` and subscription vs top-up via the underlying invoice/session metadata (R-015)
- For a full subscription refund, the handler MUST write `cancellation_logs/{uid}_{ts}` with `reason: 'refund'` BEFORE invoking `stripe.subscriptions.cancel(...)` so the subsequent `customer.subscription.deleted` GHL POST can read `cancellation_reason` from the log
- For a full top-up refund, the handler MUST write `refund_logs/{uid}_{ts}` (NOT `cancellation_logs`) and MUST NOT emit a GHL POST
