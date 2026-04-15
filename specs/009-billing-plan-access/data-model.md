# Data Model: Billing, Plan Access, Top-Up, Downgrade, Cancellation, and Email-Only Auth

**Branch**: `009-billing-plan-access` | **Date**: 2026-04-14

## Entities

### 1. User Document (`users/{uid}`)

Existing Firestore document extended with Paddle-specific fields and the derived `billingState` sub-object. Stripe fields are removed from active code paths.

**Billing-relevant fields**:

| Field | Type | Description |
|---|---|---|
| `plan` | string | `'starter'` \| `'creator'` \| `'pro'` \| `'scaling'` \| `'none'` |
| `credits` | number | Current credit balance |
| `isTrial` | boolean | Whether user is on trial |
| `billingStatus` | string | `'active'` \| `'past_due'` \| `'cancelled'` \| `'cancelling'` \| `'trialing'` |
| `billingType` | string | `'monthly'` \| `'annual'` |
| `paddleCustomerId` | string? | Paddle customer ID |
| `paddleSubscriptionId` | string? | Paddle subscription ID |
| `paddleUpdatePaymentUrl` | string? | Paddle-provided URL for payment method update (refreshed on every subscription event) |
| `paddleCancelUrl` | string? | Paddle-provided URL for subscription cancellation (refreshed on every subscription event) |
| `planUpdatedAt` | Timestamp? | When plan last changed |
| `lastCreditReset` | Timestamp? | When credits were last reset by monthly cron |
| `lastTopup` | Timestamp? | Timestamp of last top-up purchase |
| `lastTopupPack` | string? | Pack ID of last top-up |
| `cancelAtPeriodEnd` | boolean? | Whether cancellation is scheduled |
| `cancelAt` | Timestamp? | When subscription ends after cancellation |
| `pendingPlan` | string? | Plan the user is downgrading to at end of billing period |
| `pendingPlanEffectiveAt` | Timestamp? | When the pending downgrade takes effect |
| `cancellationReason` | string? | Reason code from cancellation dialog |
| `cancellationFeedback` | string? | Free-text feedback from cancellation dialog |
| `billingIssueAt` | Timestamp? | When payment failure was detected |
| `billingIssueType` | string? | Type of billing issue |
| `gracePeriodEndsAt` | Timestamp? | When grace period expires (payment failure) |
| `ghlContactId` | string? | GHL CRM contact ID (legacy — optional in Firebase→GHL direction) |
| `isTeamMember` | boolean? | Whether this user is a team member (not owner) |
| `teamOwnerUid` | string? | UID of the team owner (if team member) |
| `teamRole` | string? | `'admin'` \| `'editor'` \| `'viewer'` |
| `createdAt` | Timestamp? | When the Firestore user doc was created (used for welcome toast 60s check) |
| `welcomeToastShown` | boolean? | Set to `true` after the welcome trial toast is displayed for the first time. Prevents re-display on subsequent sign-ins within the 60s window. |
| `billingState` | BillingState | **Derived sub-object** — see below |

**Auth-related fields** (distinct from Firebase Auth user record):

| Field | Type | Description |
|---|---|---|
| `email` | string | User email (canonical, may be lowercased for lookup) |
| `displayName` | string? | User's display name (may come from Paddle customer name) |

### 2. BillingState (derived sub-object on User Document)

Written by `writeBillingState()` on every billing event. Read by the frontend via `useBillingState()` real-time listener.

| Field | Type | Description |
|---|---|---|
| `plan` | string | Current plan ID |
| `isTrial` | boolean | Trial status |
| `credits` | number | Current credit balance |
| `creditsPerMonth` | number | Plan's monthly credit allocation |
| `billingStatus` | string | Lifecycle state (see State Transitions) |
| `nextResetDate` | Date? | When credits will next reset |
| `paddleCustomerId` | string? | Paddle customer ID |
| `paddleSubscriptionId` | string? | Paddle subscription ID |
| `paddleUpdatePaymentUrl` | string? | URL for Update Payment Method button |
| `paddleCancelUrl` | string? | URL for Cancel Subscription button |
| `canUpgrade` | boolean | Whether user can upgrade (not on highest plan, not team member) |
| `canTopUp` | boolean | Whether user can purchase top-ups (paid plan, not team member, not past_due) |
| `isTeamMember` | boolean | Whether this is a team member |
| `teamOwnerUid` | string? | Team owner's UID |
| `teamOwnerName` | string? | Team owner's display name for UI label |
| `cancelAt` | Timestamp? | Scheduled cancellation date |
| `gracePeriodEndsAt` | Timestamp? | Grace period expiry for past_due |
| `pendingPlan` | string? | Pending downgrade plan (if any) |
| `pendingPlanEffectiveAt` | Date? | When pending downgrade takes effect |

### 3. Pending Plan (`pending_plans/{email.toLowerCase()}`)

Stores plan data for users who paid on Paddle before creating a Firebase Auth account. Document ID is the lowercased email. Consumed by the sign-in handler on first login and then deleted.

| Field | Type | Description |
|---|---|---|
| `email` | string | User email (lowercased — matches document ID) |
| `plan` | string | Plan to assign on first login |
| `credits` | number | Credits to assign |
| `isTrial` | boolean | Trial status |
| `billingType` | string | `'monthly'` \| `'annual'` |
| `paddleCustomerId` | string | Paddle customer ID |
| `paddleSubscriptionId` | string | Paddle subscription ID |
| `paddleUpdatePaymentUrl` | string | Paddle management URL |
| `paddleCancelUrl` | string | Paddle management URL |
| `purchasedAt` | Timestamp | When the purchase was made |
| `sourceEventId` | string | Paddle event ID that created this pending plan (for traceability) |

**Collision rule**: If a `pending_plans/{email}` document already exists when a new `subscription.created` webhook fires for the same email, the new webhook overwrites the existing document (last-write-wins). See R-005.

### 4. Paddle Events (`paddle_events/{eventId}`)

Stores processed Paddle webhook event IDs for idempotency deduplication. Document ID is the Paddle event ID.

| Field | Type | Description |
|---|---|---|
| `eventType` | string | Event type (e.g., `subscription.created`) |
| `processedAt` | Timestamp | When the event was processed |
| `paddleCustomerId` | string? | Associated customer |
| `paddleSubscriptionId` | string? | Associated subscription |
| `email` | string? | Associated email (for pre-signup events) |
| `result` | string | `'applied'` \| `'duplicate'` \| `'ignored'` (non-topup transactions) |

### 5. Cancellation Record (`cancellation_logs/{uid}_{timestamp}`)

Analytics collection for cancellation events. Captured by the frontend before the user is redirected to the Paddle-hosted cancel page.

| Field | Type | Description |
|---|---|---|
| `uid` | string | User ID |
| `email` | string | User email |
| `plan` | string | Plan at time of cancellation |
| `reason` | string | Cancellation reason code |
| `feedback` | string? | Optional free-text feedback |
| `cancelAt` | Timestamp? | When access ends (populated after Paddle webhook fires) |
| `createdAt` | Timestamp | When cancellation dialog was submitted |

### 6. Paddle Customer (external — reference only)

The customer record in Paddle linked to the user's account, identified by Paddle customer ID. Not stored in Firestore; referenced via `paddleCustomerId`. Paddle handles tax calculation, collection, and remittance globally as Merchant of Record.

### 7. Paddle Subscription (external — reference only)

The recurring billing relationship managed by Paddle, including billing cycle, plan/price, payment method, status, and `managementUrls`. Not stored in Firestore; referenced via `paddleSubscriptionId`. Paddle handles proration for mid-cycle changes and dunning for failed payments. Management URLs are refreshed on every subscription event.

### 8. GHL Sync Event (external — reference only)

A best-effort outbound POST from Firebase to a GHL inbound webhook URL carrying billing event data. Not persisted in Firestore — only the emission is logged (per FR-026). GHL uses the payload to run CRM automations.

### 9. Mandatory Billing Modal (UI state — not persisted)

A fullscreen, dismiss-proof React modal containing the pricing table, shown whenever an authenticated user's `billingState.plan === 'none'` AND they are NOT a team member. Not a persistent entity — purely a derived UI state. Closes automatically when the real-time `useBillingState` listener detects a plan transition.

## State Transitions

### billingStatus Lifecycle

```
trial ──────────► active ◄──────── (payment recovered)
                    │                    ▲
                    │                    │
                    ▼                    │
               past_due ───────────────┘
                    │
                    │ (grace period expires — Paddle sends subscription.canceled)
                    ▼
               cancelled ──► none
                    ▲
                    │
              (user cancels via dialog → paddleCancelUrl → Paddle webhook)
                    │
               active/cancelling
```

**Transitions**:

| From | To | Trigger |
|---|---|---|
| `trialing` | `active` | User subscribes to paid plan (`subscription.created` with paid price) |
| `trialing` | `none` | Trial credits reach 0 and user doesn't upgrade |
| `active` | `past_due` | Payment fails (`subscription.past_due` OR `transaction.payment_failed`) |
| `active` | `cancelling` | User initiates cancellation (app dialog → Paddle cancel page → `subscription.canceled` with future effective date) |
| `cancelling` | `active` | User reactivates before period end (via Paddle management portal) |
| `cancelling` | `cancelled` | Period end reached (`subscription.canceled` with effective date in past) |
| `past_due` | `active` | Payment recovered (Paddle dunning success — `subscription.updated` with `active` status) |
| `past_due` | `cancelled` | Grace period expires without recovery (`subscription.canceled`) |
| `cancelled` | `none` | Final cleanup — plan set to 'none', credits to 0 |

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
    plan + welcome           true]             billing modal]
    toast]                                         │
           │                  │                    │ pay on Paddle
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
Paddle Events (n) ──── written by ──── Paddle Webhook (idempotency dedup)
Team Owner (1) ──── owns ──── (0..n) Team Members
Team Member ──── reads ──── Team Owner's BillingState (read-only)
Firebase Auth User (1) ──── keyed by email ──── Pending Plan (lookup on first sign-in)
```

## Validation Rules

- `credits` MUST be >= 0 at all times
- `plan` MUST be one of the defined plan IDs or `'none'`
- `billingStatus` MUST follow the defined lifecycle transitions
- `paddleCustomerId` SHOULD be unique across user documents (enforced by Paddle — one customer per email)
- `paddle_events/{eventId}` document ID MUST equal the Paddle event ID (natural dedup key)
- `pending_plans/{email}` document ID MUST be the lowercased email (normalized for case-insensitive lookup)
- `cancellationReason` MUST be one of: `'too_expensive'`, `'not_using_enough'`, `'switching_competitor'`, `'missing_features'`, `'other'`
- Team members (`isTeamMember: true`) MUST NOT have their own subscription — they use the owner's
- Credit deductions MUST be atomic (Firestore transaction) to prevent overdraft
- `billingState` writes MUST be atomic with the underlying field changes (same transaction)
- Email verification (`user.emailVerified === true`) MUST be checked before routing to any authenticated screen except the VerifyEmailScreen itself
- The welcome toast MUST only fire when `users/{uid}.createdAt` is within 60 seconds of the current time AND `users/{uid}.welcomeToastShown !== true`. After the toast fires, the backend (or the frontend) MUST set `welcomeToastShown: true` so the toast never re-displays even on rapid sign-out/sign-in sequences within the 60-second window.
- The mandatory billing modal MUST only render when `billingState.plan === 'none'` AND `!isTeamMember` AND no valid pending team invite exists for the user's email
