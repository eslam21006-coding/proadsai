# Contract: Stripe Webhook Endpoints and Billing Callables

**Branch**: `021-stripe-migration` | **Date**: 2026-05-05

## Endpoint: `stripeWebhook`

**Type**: HTTP POST (Firebase Cloud Functions v2 `onRequest`)
**URL**: `https://europe-west1-proadsai-saas.cloudfunctions.net/stripeWebhook`
**Authentication**: Stripe webhook signature verification via SDK (`stripe.webhooks.constructEvent`)
**Secrets**: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `GHL_STRIPE_SYNC_WEBHOOK_URL`, `GHL_STRIPE_FAILED_WEBHOOK_URL`
**Stripe API version pin**: `apiVersion: '2025-01-27.acacia'` (R-019)

### Request

**Headers**:
- `stripe-signature`: Webhook signature for verification
- `content-type`: `application/json`

**Body**: Stripe event payload. CRITICAL: read via `req.rawBody` — never `req.body` — to preserve the exact byte sequence for signature verification.

### Handled Event Types

| Event Type | Mode / Branch | Action | billingState Change |
|---|---|---|---|
| `checkout.session.completed` | `mode='subscription'` + `client_reference_id` present | Write to `users/{uid}` with plan/credits/customer/subscription IDs | `billingStatus` → `trialing` (during trial) or `active` |
| `checkout.session.completed` | `mode='subscription'` + `client_reference_id` absent | Write to `pending_plans/{email.toLowerCase()}` from `customer_details.email` | (consumed on first sign-in) |
| `checkout.session.completed` | `mode='payment'` + `metadata.isTopUp='true'` | Atomically add `metadata.creditAmount` to user's credits | No status change |
| `customer.subscription.created` | `subscription.metadata.firebaseUid` present | Idempotent fallback: if `users/{uid}.stripeSubscriptionId` already matches → noop; else write to `users/{uid}` | Same as `checkout.session.completed` (subscription mode) |
| `customer.subscription.created` | `subscription.metadata.firebaseUid` absent (GHL path) | Idempotent fallback: read Stripe Customer for email → write to `pending_plans/{email}` | (consumed on first sign-in) |
| `customer.subscription.updated` | trial → active (status change) | Update plan + flip `isTrial`; refresh `current_period_end` | `billingStatus` → `active` |
| `customer.subscription.updated` | plan change (price ID change) | Update plan + credits per new price | Varies |
| `customer.subscription.updated` | `cancel_at_period_end=true` | Set `billingStatus='cancelling'`, `cancelAt=current_period_end` | `billingStatus` → `cancelling` |
| `customer.subscription.updated` | `cancel_at_period_end=false` (reactivate) | Clear `cancelAt`, restore active | `billingStatus` → `active` |
| `customer.subscription.deleted` | Period end OR refund-driven cancel | Set plan='none', credits=0 | `billingStatus` → `cancelled` |
| `invoice.payment_succeeded` | `billing_reason='subscription_create'` | Skip (initial invoice — credits already set by `checkout.session.completed`) | No change |
| `invoice.payment_succeeded` | `billing_reason='subscription_cycle'` | Reset `credits` to plan allocation; update `nextResetDate` | No status change |
| `invoice.payment_failed` | — | Set `billingStatus='past_due'`; start grace period countdown | `billingStatus` → `past_due` |
| `charge.refunded` | Full subscription refund | `stripe.subscriptions.cancel(subscription)` → `customer.subscription.deleted` fires | `billingStatus` → `cancelled` |
| `charge.refunded` | Full top-up refund | Atomically deduct `metadata.creditAmount` (clamped at 0) | No status change |
| `charge.refunded` | Partial refund | Log only with `result: 'partial_refund_logged'` | No change |

### Processing Pipeline (per webhook)

1. Read `req.rawBody` (NOT `req.body`)
2. Verify signature via `stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET)` — on failure: log `stripe_signature_invalid`, return 400
3. Check event-ID idempotency via atomic create `stripe_events/{eventId}` — on collision: log `stripe_event_duplicate`, return 200
4. Route by `event.type` — on unknown type: log `stripe_event_unknown`, return 200 (acknowledge but skip)
5. For `customer.subscription.created`: check application-level dedup against `users/{uid}.stripeSubscriptionId`. If match → write `result: 'noop_dual_event'` and return 200
6. Apply state changes per handler (with Firestore transaction for credit changes)
7. Mark event as processed (`stripe_events/{eventId}.result = 'applied'`)
8. Call `writeBillingState(uid)` (for users with a `uid`) or skip (for pending plans)
9. Fire-and-forget GHL sync via `notifyGHL` (success path) or `notifyGHLFailed` (dunning + refund paths)
10. Log success with step, event ID, duration, result
11. Return 200

### Response

| Status | Condition |
|---|---|
| 200 OK | Event processed successfully OR event already processed (idempotent) OR unknown event type (ignored) OR dual-event noop |
| 400 Bad Request | Signature verification failed |
| 500 Internal Error | Processing failure (Stripe will retry) |

### Error Classification Codes (FR-026 vocabulary)

`stripe_signature_invalid`, `stripe_event_duplicate`, `stripe_event_unknown`, `stripe_price_unmapped`, `ghl_sync_failed`, `portal_session_generation_failed`, `user_doc_missing`, `pending_plan_write_failed`, `billing_state_write_failed`, `refund_processed`.

---

## Callable: `createStripeCheckoutSession`

**Type**: Firebase Cloud Functions v2 `onCall`
**Authentication**: Firebase Auth (requires authenticated user)
**Secrets**: `STRIPE_SECRET_KEY`

### Request

```typescript
{
  priceId: string;  // Stripe price ID from planconfig.ts (one of 6 subscription prices)
}
```

### Response

```typescript
{
  checkoutUrl: string;  // Stripe Checkout Session URL — frontend redirects to this
}
```

### Behavior

```typescript
const session = await stripe.checkout.sessions.create({
  mode: 'subscription',
  line_items: [{ price: priceId, quantity: 1 }],
  client_reference_id: auth.uid,
  metadata: { firebaseUid: auth.uid },
  subscription_data: {
    trial_period_days: 7,
    metadata: { firebaseUid: auth.uid },  // R-005: propagate identity to customer.subscription.created
  },
  automatic_tax: { enabled: true },
  customer: existingStripeCustomerId,        // R-009: reuse if present
  customer_email: existingStripeCustomerId ? undefined : auth.email,  // fallback only
  success_url: 'https://app.proadsai.com/billing?paid=1',
  cancel_url: 'https://app.proadsai.com/billing?canceled=1',
});
return { checkoutUrl: session.url };
```

### Errors

| Code | Condition |
|---|---|
| `unauthenticated` | No authenticated user |
| `invalid-argument` | Invalid priceId (not in `STRIPE_PRICE_TO_PLAN` map) |
| `failed-precondition` | Team member cannot subscribe directly |
| `internal` | Stripe API error |

---

## Callable: `createStripeTopUpSession`

**Type**: Firebase Cloud Functions v2 `onCall`
**Authentication**: Firebase Auth (requires authenticated user)
**Secrets**: `STRIPE_SECRET_KEY`

### Request

```typescript
{
  creditAmount: 100 | 300 | 800;
  priceId: string;  // Stripe one-time price ID from planconfig.ts (one of 3 top-up prices)
}
```

### Response

```typescript
{
  checkoutUrl: string;  // Stripe Checkout Session URL — frontend redirects to this
}
```

### Behavior

```typescript
const session = await stripe.checkout.sessions.create({
  mode: 'payment',
  line_items: [{ price: priceId, quantity: 1 }],
  metadata: {
    firebaseUid: auth.uid,
    isTopUp: 'true',
    creditAmount: String(creditAmount),
  },
  automatic_tax: { enabled: true },
  customer: existingStripeCustomerId,
  customer_email: existingStripeCustomerId ? undefined : auth.email,
  success_url: 'https://app.proadsai.com/billing?topup=1',
  cancel_url: 'https://app.proadsai.com/billing?topup_canceled=1',
});
return { checkoutUrl: session.url };
```

### Errors

| Code | Condition |
|---|---|
| `unauthenticated` | No authenticated user |
| `invalid-argument` | Invalid creditAmount or priceId |
| `failed-precondition` | `canTopUp: false` (trial, cancelled, team member, or past_due) |
| `internal` | Stripe API error |

---

## Callable: `createStripePortalSession`

**Type**: Firebase Cloud Functions v2 `onCall`
**Authentication**: Firebase Auth (requires authenticated user)
**Secrets**: `STRIPE_SECRET_KEY`

### Request

```typescript
{
  flow?: 'subscription_cancel' | 'payment_method_update';  // Optional deep-link
  returnUrl?: string;  // Override default return URL (default: https://app.proadsai.com/billing)
}
```

### Response

```typescript
{
  portalUrl: string;  // Short-lived Stripe Customer Portal session URL
}
```

### Behavior

```typescript
const portalSession = await stripe.billingPortal.sessions.create({
  customer: stripeCustomerId,  // from users/{uid}.stripeCustomerId
  return_url: returnUrl ?? 'https://app.proadsai.com/billing',
  flow_data: flow === 'subscription_cancel'
    ? { type: 'subscription_cancel', subscription_cancel: { subscription: stripeSubscriptionId } }
    : flow === 'payment_method_update'
    ? { type: 'payment_method_update' }
    : undefined,
});
return { portalUrl: portalSession.url };
```

### Errors

| Code | Condition |
|---|---|
| `unauthenticated` | No authenticated user |
| `failed-precondition` | No `stripeCustomerId` on user document (user has never paid) |
| `failed-precondition` | `flow=subscription_cancel` but no `stripeSubscriptionId` |
| `internal` | Stripe API error |

---

## Helper: `notifyGHL(identifier, event)`

**Type**: Internal helper in `functions/src/billing/ghlBillingSync.ts`
**Invocation**: Called from Stripe webhook handlers after billing state is written for success-path events
**Secrets**: `GHL_STRIPE_SYNC_WEBHOOK_URL`

### Signature

```typescript
notifyGHL(
  identifier: string,
  event: 'subscription.created' | 'subscription.updated' | 'subscription.deleted' | 'topup'
): Promise<void>
```

`identifier` is either:
- A Firebase `uid` (looks up `users/{uid}` for email and displayName)
- A raw `email` string (for pre-signup users in `pending_plans`)

### POST Payload

```typescript
{
  email: string;
  contactName?: string;
  plan: string;
  billingStatus: string;
  event: string;
  credits: number;
  stripeSubscriptionId?: string;
  // portalUrl is INTENTIONALLY OMITTED from success-sync payloads (R-008)
}
```

### Behavior

Fire-and-forget POST to `GHL_STRIPE_SYNC_WEBHOOK_URL`. Errors logged with code `ghl_sync_failed` but NEVER thrown. Must never block the webhook processing pipeline.

---

## Helper: `notifyGHLFailed(identifier, event, extras?)`

**Type**: Internal helper in `functions/src/billing/ghlBillingSync.ts`
**Invocation**: Called from `invoice.payment_failed` and `charge.refunded` handlers
**Secrets**: `GHL_STRIPE_FAILED_WEBHOOK_URL`, `STRIPE_SECRET_KEY` (for transient portal session generation)

### Signature

```typescript
notifyGHLFailed(
  identifier: string,
  event: 'past_due' | 'refund_processed',
  extras?: { amount?: number; reason?: string }
): Promise<void>
```

### POST Payload

```typescript
{
  email: string;
  contactName?: string;
  event: string;
  portalUrl?: string;  // generated transiently via stripe.billingPortal.sessions.create just before POST
  amount?: number;     // for refund events: amount refunded in cents
  reason?: string;     // for refund events: refund reason
}
```

### Behavior

1. Resolve `email`, `contactName`, `stripeCustomerId` from identifier
2. If `stripeCustomerId` is available, call `stripe.billingPortal.sessions.create({ customer, return_url: 'https://app.proadsai.com/billing' })` to generate a fresh portal URL. On failure, log `portal_session_generation_failed` and proceed with `portalUrl` undefined.
3. Fire-and-forget POST to `GHL_STRIPE_FAILED_WEBHOOK_URL` with the payload above.
4. Errors on the POST itself logged with code `ghl_sync_failed` but NEVER thrown.

---

## Removed Endpoints (Deprecated)

These Paddle-era endpoints are removed in the same PR (R-018, FR-030):

- `paddleWebhook` — replaced by `stripeWebhook`
- `paddleGetSub` — replaced by `useBillingState` real-time read
- `paddleCancelSub` — replaced by `createStripePortalSession({ flow: 'subscription_cancel' })`
- `paddleReactivateSub` — replaced by Stripe Customer Portal reactivate flow
- `paddleChangePlanFn` — replaced by `createStripeCheckoutSession` (new price) or Stripe Customer Portal plan switch
- `paddleTopupCheckout` — replaced by `createStripeTopUpSession`
- `paddlePortalSession` — replaced by `createStripePortalSession`
- `createPaddleCheckout` — replaced by `createStripeCheckoutSession`
- `createPaddleTopUp` — replaced by `createStripeTopUpSession`

Also removed: `STRIPE_PRICE_TO_PLAN` map at `functions/src/paddle/paddleClient.ts` is replaced by a new map at `functions/src/stripe/stripeClient.ts` mirrored to `src/planconfig.ts`.
