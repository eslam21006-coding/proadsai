# Data Model: Billing, Plan Access, Top-Up, Downgrade, and Cancellation

**Branch**: `009-billing-plan-access` | **Date**: 2026-04-04

## Entities

### BillingState (derived field on `users/{uid}`)

A denormalized snapshot written by backend functions, consumed by frontend via real-time listener.

| Field | Type | Description |
|-------|------|-------------|
| plan | `'starter' \| 'creator' \| 'pro' \| 'scaling' \| 'none'` | Current plan tier |
| isTrial | `boolean` | Whether user is on a trial (full features, limited credits, no reset) |
| credits | `number` | Current credit balance (accumulates across cycles) |
| creditsPerMonth | `number` | Monthly allocation for the plan (0 for trial/none) |
| billingStatus | `'active' \| 'trialing' \| 'past_due' \| 'cancelling' \| 'cancelled'` | Subscription lifecycle state |
| nextResetDate | `Timestamp \| null` | Next monthly credit reset date (null for trial/cancelled) |
| cancelAt | `Timestamp \| null` | Period end date when subscription is set to cancel (null when not pending) |
| stripeCustomerId | `string \| null` | Stripe customer ID for portal/checkout |
| canUpgrade | `boolean` | Whether user can upgrade (false for Scaling, team members) |
| canTopUp | `boolean` | Whether user can top up (false for trial, cancelled, team members) |
| isTeamMember | `boolean` | Whether user is a team member (not owner) |
| teamOwnerUid | `string \| null` | UID of team owner (null if not a team member) |
| gracePeriodEndsAt | `Timestamp \| null` | Stripe-managed grace period expiry (null unless past_due) |

**Write paths** (every path that touches plan/credits must also write billingState):
1. `ghlpaymentwebhook` — new subscription or upgrade
2. `ghlCancellationWebhook` — final cancellation (period end)
3. `monthlyCreditsReset` — additive credit reset
4. `stripeWebhook` (checkout.session.completed) — top-up credit addition
5. `stripeWebhook` (customer.subscription.updated) — payment failure / recovery
6. `cancelSubscription` — user-initiated cancel (sets `cancelling`)
7. `reactivateSubscription` — clears cancel-at-period-end (sets `active`)

### BillingStatus State Transitions

```
trialing ──→ active        (first payment via ghlpaymentwebhook)
trialing ──→ cancelled     (trial expired, 0 credits, no upgrade)
active ────→ past_due      (payment failed via stripeWebhook)
active ────→ cancelling    (user cancels via cancelSubscription)
past_due ──→ active        (payment recovered via stripeWebhook)
past_due ──→ cancelled     (grace period expired via ghlCancellationWebhook)
cancelling → active        (reactivated via reactivateSubscription)
cancelling → cancelled     (period end via ghlCancellationWebhook)
cancelled ─→ active        (new subscription via ghlpaymentwebhook)
```

### Cancellation Record (`cancellations/{docId}`)

Existing collection — extended with structured reason/feedback fields.

| Field | Type | Description |
|-------|------|-------------|
| uid | `string` | User ID |
| email | `string` | User email at time of cancellation |
| plan | `UserPlan` | Plan at time of cancellation |
| reason | `string` | Selected reason from dropdown |
| feedback | `string \| null` | Optional free-text feedback |
| cancelAt | `Timestamp` | When access ends (period end date) |
| createdAt | `Timestamp` | When cancellation was initiated |

**Reason enum values**: `too_expensive`, `not_using_enough`, `switching_competitor`, `missing_features`, `other`

### Top-Up Packs (static config)

Defined in `src/planconfig.ts` as `TOPUP_PACKS`. No Firestore storage needed.

| Pack ID | Credits | Price |
|---------|---------|-------|
| small | 100 | $9 |
| medium | 300 | $17 |
| large | 800 | $39 |

### Action-Feature Map (new, in `entitlements.ts`)

Maps credit action keys to feature gate keys for plan-gate enforcement.

| Action Key | Feature Gate | Notes |
|------------|-------------|-------|
| generateHooks | `null` | All paid plans |
| refreshHooks | `null` | All paid plans |
| editOneHook | `null` | All paid plans |
| generateConcepts | `null` | All paid plans |
| editOneConcept | `null` | All paid plans |
| buildPlan | `null` | Free action |
| generateImage | `null` | All paid plans |
| polishImage | `null` | All paid plans |
| reflowImage | `null` | All paid plans |
| analyzePolishes | `null` | All paid plans |
| generateCaption | `null` | All paid plans |
| refineCaption | `null` | All paid plans |
| generateCarouselCopies | `carousel` | Pro+ |
| competitorResearch | `competitorResearch` | Pro+ |
| brandUrlScraping | `brandUrlScraping` | Starter+ |
| editRegion | `regionEditing` | Creator+ |

## Validation Rules

- `credits` must be >= 0 (enforced by deductCreditsServer transaction)
- `billingStatus` must be one of the 5 defined states
- `plan` must be one of: starter, creator, pro, scaling, none
- `cancelAt` must be null unless `billingStatus === 'cancelling'`
- `gracePeriodEndsAt` must be null unless `billingStatus === 'past_due'`
- `canUpgrade` is false when `plan === 'scaling'` or `isTeamMember === true`
- `canTopUp` is false when `isTrial === true` or `billingStatus === 'cancelled'` or `isTeamMember === true`
- Monthly reset: `credits = credits + creditsPerMonth` (additive, not replacement)
