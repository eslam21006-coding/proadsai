# Billing API Contracts

**Branch**: `009-billing-plan-access` | **Date**: 2026-04-04

## Cloud Function Callables (existing — extended)

### `deductCreditsServer` (extended)

**Change**: Add plan-gate enforcement before credit deduction.

```typescript
// Request (unchanged)
{ action: string, count?: number, onBehalfOf?: string }

// Response — NEW error case
// When action is not allowed under current plan:
throw HttpsError('failed-precondition', 'Feature requires a higher plan', {
  code: 'plan_downgraded',
  requiredPlan: string,  // e.g., 'Pro'
  currentPlan: string    // e.g., 'Starter'
})
```

### `cancelSubscription` (extended)

**Change**: Add reason/feedback fields to request. Write to `cancellations` collection. Set billingStatus to `cancelling` and populate `cancelAt`.

```typescript
// Request (extended)
{ reason: CancellationReason, feedback?: string }

// Response
{ success: true, cancelAt: string /* ISO date */ }
```

### `createTopupCheckout` (unchanged)

```typescript
// Request
{ packId: 'topup_100' | 'topup_300' | 'topup_800' }

// Response
{ url: string /* Stripe checkout URL */ }
```

### `createStripePortalSession` (unchanged)

```typescript
// Request
{ }  // No params needed — uses caller's auth UID

// Response
{ url: string /* Stripe billing portal URL */ }
```

## Cloud Function Callables (new)

### `reactivateSubscription`

Clears cancel-at-period-end on Stripe subscription. Transitions billingStatus from `cancelling` → `active`.

```typescript
// Request
{ }  // No params needed — uses caller's auth UID

// Response
{ success: true }

// Errors
throw HttpsError('failed-precondition', 'No pending cancellation to reactivate')
throw HttpsError('failed-precondition', 'Team members cannot manage billing')
```

## Webhook Endpoints (existing — extended)

### `ghlpaymentwebhook` (extended)

**Change**: Write `billingState` after plan/credit update.

### `ghlCancellationWebhook` (extended)

**Change**: Write `billingState` with `billingStatus: 'cancelled'`, `plan: 'none'`, `credits: 0`.

### `stripeWebhook` (extended)

**Change**: Write `billingState` after top-up credit addition and subscription status changes. On `customer.subscription.updated` with `status: 'past_due'`, read `gracePeriodEndsAt` from Stripe subscription and include in billingState.

### `monthlyCreditsReset` (modified)

**Change**: Overwrite credit reset (`credits = creditsPerMonth`) — existing behavior preserved. Write `billingState` after reset. Top-up credits do not carry over past the next reset.

## Frontend Hook

### `useBillingState()`

```typescript
// Location: src/hooks/useBillingState.ts
// Returns reactive billing state from Firestore real-time listener

function useBillingState(): {
  billingState: BillingState | null;  // null while loading
  isLoading: boolean;
}
```

Subscribes to `users/{uid}` document and extracts the `billingState` field. Unsubscribes on unmount. Returns null before first snapshot.
