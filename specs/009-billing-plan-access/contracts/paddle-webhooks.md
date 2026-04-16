# Contract: Paddle Webhook Endpoints and Billing Callables

**Branch**: `009-billing-plan-access` | **Date**: 2026-04-14

## Endpoint: `paddleWebhook`

**Type**: HTTP POST (Firebase Cloud Functions v2 `onRequest`)  
**URL**: `https://europe-west1-proadsai-saas.cloudfunctions.net/paddleWebhook`  
**Authentication**: Paddle webhook signature verification via SDK (`paddle.webhooks.unmarshal`)  
**Secrets**: `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, `GHL_PADDLE_SYNC_WEBHOOK_URL`, `GHL_PADDLE_FAILED_WEBHOOK_URL`

### Request

**Headers**:
- `paddle-signature`: Webhook signature for verification
- `content-type`: `application/json`

**Body**: Paddle notification payload. CRITICAL: read via `req.rawBody` — never `req.body` — to preserve the exact byte sequence for signature verification.

### Handled Event Types

| Event Type | Action | billingState Change |
|---|---|---|
| `subscription.created` | **Dual-write**: if `customData.firebaseUid` present, update `users/{uid}`; else write `pending_plans/{email.toLowerCase()}` | `billingStatus` → `active` |
| `subscription.updated` | Update plan + credits if price changed, always refresh `managementUrls` | Varies by change type |
| `subscription.canceled` | Set plan to `none`, credits to 0 | `billingStatus` → `cancelled` |
| `subscription.past_due` | Set billingStatus past_due, keep credits | `billingStatus` → `past_due` |
| `transaction.completed` | If `customData.isTopUp === true`, add `customData.creditAmount` to user's credits (transactional) | No status change |
| `transaction.payment_failed` | Set billingStatus past_due | `billingStatus` → `past_due` |

### Processing Pipeline (per webhook)

1. Read `req.rawBody` (NOT `req.body`)
2. Verify signature via `paddle.webhooks.unmarshal(rawBody, secret, signature)` — on failure: log `paddle_signature_invalid`, return 400
3. Check idempotency via `paddle_events/{eventId}` — on duplicate: log `paddle_event_duplicate`, return 200
4. Route by `event.eventType` — on unknown type: log `paddle_event_unknown`, return 200 (acknowledge but skip)
5. Apply state changes per handler
6. Mark event processed (write `paddle_events/{eventId}`)
7. Call `writeBillingState()` (for users with a `uid`) or skip (for pending plans)
8. Fire-and-forget GHL sync via `notifyGHL` or `notifyGHLFailed`
9. Log success with step, event ID, duration, and result
10. Return 200

### Response

| Status | Condition |
|---|---|
| 200 OK | Event processed successfully OR event already processed (idempotent) OR unknown event type (ignored) |
| 400 Bad Request | Signature verification failed |
| 500 Internal Error | Processing failure (Paddle will retry) |

---

## Callable: `createPaddleCheckout`

**Type**: Firebase Cloud Functions v2 `onCall`  
**Authentication**: Firebase Auth (requires authenticated user)  
**Secrets**: `PADDLE_API_KEY`

### Request

```typescript
{
  priceId: string;  // Paddle price ID from planconfig.ts
}
```

### Response

```typescript
{
  checkoutUrl: string;  // Paddle checkout URL to open
}
```

### Behavior

Uses Paddle Node SDK: `paddle.checkout.create({ items: [{ priceId }], customData: { firebaseUid: auth.uid }, customer: { email: auth.email } })`. Returns the checkout URL. Frontend opens via Paddle.js overlay.

### Errors

| Code | Condition |
|---|---|
| `unauthenticated` | No authenticated user |
| `invalid-argument` | Invalid priceId |
| `failed-precondition` | Team member cannot subscribe directly |
| `internal` | Paddle API error |

---

## Callable: `createPaddleTopUp`

**Type**: Firebase Cloud Functions v2 `onCall`  
**Authentication**: Firebase Auth (requires authenticated user)  
**Secrets**: `PADDLE_API_KEY`

### Request

```typescript
{
  creditAmount: 100 | 300 | 800;
  topUpPriceId: string;  // Paddle one-time price ID from planconfig.ts
}
```

### Response

```typescript
{
  checkoutUrl: string;  // Paddle one-time checkout URL
}
```

### Behavior

Creates a Paddle one-time checkout with `customData: { firebaseUid: auth.uid, isTopUp: true, creditAmount }`. The `transaction.completed` webhook handler later reads `customData.isTopUp` and adds the credits.

### Errors

| Code | Condition |
|---|---|
| `unauthenticated` | No authenticated user |
| `invalid-argument` | Invalid creditAmount or topUpPriceId |
| `failed-precondition` | `canTopUp: false` (trial, cancelled, team member, or past_due) |
| `internal` | Paddle API error |

---

## Helper: `notifyGHL(identifier, event)`

**Type**: Internal helper in `functions/src/billing/ghlBillingSync.ts`  
**Invocation**: Called from Paddle webhook handlers after billing state is written  
**Secrets**: `GHL_PADDLE_SYNC_WEBHOOK_URL`

### Signature

```typescript
notifyGHL(identifier: string, event: 'subscription.created' | 'subscription.updated' | 'subscription.canceled' | 'topup'): Promise<void>
```

`identifier` is either:
- A Firebase `uid` (looks up `users/{uid}` for email and displayName)
- A raw `email` string (used for pre-signup users whose only identity is their email from `pending_plans`)

### POST Payload

```typescript
{
  email: string;
  contactName?: string;
  plan: string;
  billingStatus: string;
  event: string;
  credits: number;
  paddleSubscriptionId?: string;
  updatePaymentUrl?: string;
}
```

### Behavior

Fire-and-forget POST to `GHL_PADDLE_SYNC_WEBHOOK_URL`. Errors are logged with code `ghl_sync_failed` but NEVER thrown. Must never block the webhook processing pipeline.

---

## Helper: `notifyGHLFailed(identifier, event)`

**Type**: Internal helper in `functions/src/billing/ghlBillingSync.ts`  
**Invocation**: Called from `subscription.past_due` and `transaction.payment_failed` handlers  
**Secrets**: `GHL_PADDLE_FAILED_WEBHOOK_URL`

### Signature

```typescript
notifyGHLFailed(identifier: string, event: 'past_due' | 'payment_failed'): Promise<void>
```

### POST Payload

```typescript
{
  email: string;
  contactName?: string;
  event: string;
  updatePaymentUrl?: string;
}
```

### Behavior

Same fire-and-forget semantics as `notifyGHL`. POSTs to the separate failed-payment GHL webhook URL which triggers the dunning email workflow.

---

## Removed Endpoints (Deprecated)

These Stripe-era and reversed-direction endpoints are removed from active code paths:

- `ghlpaymentwebhook` — reversed to `paddleWebhook` + `notifyGHL`
- `ghlCancellationWebhook` — reversed to `paddleWebhook` + `notifyGHL`
- `ghlPaymentFailedWebhook` — reversed to `paddleWebhook` + `notifyGHLFailed`
- `createStripePortalSession` — replaced by stored `paddleUpdatePaymentUrl` / `paddleCancelUrl`
- `stripeWebhook` — replaced by `paddleWebhook`
- Previous `createTopupCheckout` (Stripe version) — replaced by `createPaddleTopUp`
