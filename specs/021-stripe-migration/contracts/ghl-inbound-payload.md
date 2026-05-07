# Contract: GHL Inbound Webhook Payload (Stripe → Firebase → GHL)

**Branch**: `021-stripe-migration` | **Date**: 2026-05-07
**Supersedes**: the single `GHL_STRIPE_SYNC_WEBHOOK_URL` / `GHL_STRIPE_FAILED_WEBHOOK_URL` design described in `research.md` R-008 and `quickstart.md` sections B.3 / C.

After Firebase's `stripeWebhook` Cloud Function processes a Stripe event and writes the resulting state to Firestore, it POSTs a single normalized JSON payload to one of six GHL inbound webhook URLs. The destination URL is selected by `event_type` (see §3). The user pastes the schema in §1 into all six GHL workflows as the Mapping Reference.

The payload shape is identical across all six events. Fields not applicable to a given event are sent as `null` (never omitted) so GHL's inbound-webhook field mapper sees a stable column set every time.

---

## 1. Payload Schema (verbatim — paste into all 6 GHL workflows)

```json
{
  "event_type": "subscription.created",
  "event_id": "evt_1Abc123",
  "stripe_customer_id": "cus_AbcDef",
  "stripe_subscription_id": "sub_AbcDef",
  "email": "user@example.com",
  "first_name": "User",
  "last_name": "Name",
  "plan": "pro",
  "billing_status": "active",
  "is_trial": false,
  "credits": 2500,
  "billing_type": "monthly",
  "currency": "USD",
  "amount": 79.00,
  "trial_end_date": "2026-05-21T00:00:00Z",
  "next_billing_date": "2026-06-07T00:00:00Z",
  "portal_url": "https://billing.stripe.com/p/session/...",
  "cancel_at": null,
  "cancellation_reason": null
}
```

---

## 2. Field Reference

| Field | Type | Required / Nullable | Description | Populated By |
|---|---|---|---|---|
| `event_type` | string | required, enum | One of the 6 values in §3 | all events |
| `event_id` | string | required | Stripe event ID (`evt_xxx`) for traceability + correlation against `stripe_events/{eventId}` | all events |
| `stripe_customer_id` | string | required | `cus_xxx` from the Stripe Customer | all events |
| `stripe_subscription_id` | string \| null | nullable | `sub_xxx` from the Stripe Subscription. `null` for `top_up.completed` (top-ups have no subscription). | subscription events; `null` for top-up |
| `email` | string | required | Lowercased email from `users/{uid}.email` (or `customer.email` for pre-signup pending plans) | all events |
| `first_name` | string \| null | nullable | First token of `users/{uid}.displayName`, split on the first whitespace. If `displayName` has no whitespace, `first_name` is the entire string. `null` if `displayName` is null. | all events |
| `last_name` | string \| null | nullable | Remainder of `users/{uid}.displayName` after the first whitespace (preserves any further whitespace verbatim — e.g., `"de la Cruz"` for `"María de la Cruz"`). `null` if `displayName` has no whitespace or is null. | all events |
| `plan` | string | required, enum (`none` \| `starter` \| `pro` \| `scale`) | Current plan AFTER the event was applied. For `subscription.cancelled` this is `none`. For `top_up.completed` this is the user's existing plan (top-ups don't change plan). | all events |
| `billing_status` | string | required, enum (`trialing` \| `active` \| `past_due` \| `cancelling` \| `cancelled` \| `none`) | Current `billingStatus` AFTER the event was applied | all events |
| `is_trial` | boolean | required | `true` only when `billing_status === 'trialing'`. `false` on `payment.recovered`, `payment.failed`, `subscription.cancelled`, `top_up.completed`. | all events |
| `credits` | number | required | Current credit balance AFTER the event was applied. For `top_up.completed`, this is the post-credit-add balance. | all events |
| `billing_type` | string | required, enum (`monthly` \| `annual` \| `one_time`) | Resolved from `subscription.items.data[0].price.recurring.interval` (`month` → `monthly`, `year` → `annual`). `one_time` for `top_up.completed`. | all events |
| `currency` | string | required, enum (`USD`) | Always `USD` at launch (R-016) | all events |
| `amount` | number | required | Charge amount in major units (e.g., `79.00`, not `7900`). For `payment.failed`, the failed renewal amount. For `subscription.cancelled`, the most recent invoice amount. | all events |
| `trial_end_date` | ISO 8601 string \| null | nullable | UTC, `Z`-suffixed. Set to `subscription.trial_end` on `trial.started`. `null` on all paid events. | `trial.started` only |
| `next_billing_date` | ISO 8601 string \| null | nullable | `subscription.current_period_end`. `null` for `subscription.cancelled` and `top_up.completed`. | `trial.started`, `subscription.created`, `payment.recovered`, `payment.failed` |
| `portal_url` | string \| null | nullable | Transient Stripe Customer Portal session URL generated just before the POST via `stripe.billingPortal.sessions.create({ customer, return_url: 'https://app.proadsai.com/billing' })`. `null` if portal generation failed (logged as `portal_session_generation_failed`). | all events — populated when `stripe_customer_id` resolves successfully |
| `cancel_at` | ISO 8601 string \| null | nullable | `subscription.cancel_at` when the subscription was scheduled to cancel at period end. Populated only on `subscription.cancelled`. `null` otherwise. | `subscription.cancelled` only |
| `cancellation_reason` | string \| null | nullable | Free-text reason from `cancellation_logs/{uid}_{ts}` (in-app cancel flow) or Stripe portal cancellation reason. `null` if not provided. | `subscription.cancelled` only |

**Stable-column rule**: every field is always present in the payload. Fields not applicable to a given event are sent as `null`, never omitted. This guarantees GHL's inbound-webhook field mapper sees the same column set every time and does not silently drop mappings on subsequent events.

---

## 3. Event Routing Table (6 events → 6 GHL URLs)

The `stripeWebhook` Cloud Function selects the destination URL based on `event_type`. Each URL is a Firebase Cloud Functions secret set per `quickstart.md` section C.

| `event_type` | Stripe trigger | Firebase secret (env var name) |
|---|---|---|
| `trial.started` | `checkout.session.completed` (mode='subscription') with `subscription.trial_end` set | `GHL_TRIAL_STARTED_URL` |
| `subscription.created` | `checkout.session.completed` (mode='subscription') without trial, OR `customer.subscription.updated` on `trialing` → `active` conversion | `GHL_PAYMENT_RECEIVED_URL` |
| `payment.recovered` | `invoice.payment_succeeded` after a `past_due` state (Smart Retries success) | `GHL_RECOVERED_URL` |
| `payment.failed` | `invoice.payment_failed` | `GHL_OVERDUE_FAILED_URL` |
| `subscription.cancelled` | `customer.subscription.deleted` (period end OR refund-driven via `stripe.subscriptions.cancel`) | `GHL_CANCELLED_URL` |
| `top_up.completed` | `checkout.session.completed` (mode='payment') with `metadata.isTopUp='true'` | `GHL_TOPUP_URL` |

**Routing logic** (lives in `functions/src/billing/ghlBillingSync.ts`):

```typescript
const URL_BY_EVENT: Record<EventType, () => string> = {
  'trial.started':          () => GHL_TRIAL_STARTED_URL.value(),
  'subscription.created':   () => GHL_PAYMENT_RECEIVED_URL.value(),
  'payment.recovered':      () => GHL_RECOVERED_URL.value(),
  'payment.failed':         () => GHL_OVERDUE_FAILED_URL.value(),
  'subscription.cancelled': () => GHL_CANCELLED_URL.value(),
  'top_up.completed':       () => GHL_TOPUP_URL.value(),
};
```

**Fire-and-forget semantics** (preserved from R-008): the POST is wrapped in try/catch; on failure, log classification code `ghl_sync_failed` and return without throwing. A GHL outage MUST NEVER block Firestore billing-state writes.

**Plan-change handling**: a `customer.subscription.updated` event whose only change is a price-ID swap (plan switch with no status transition) is NOT routed to GHL under this contract. Plan-change tagging is handled in GHL by inspecting the `plan` field on the next `subscription.created` or `payment.recovered` event for that contact, or by a dedicated GHL contact-tag automation if the merchant team chooses to add one later. This keeps the routing table at exactly 6 URLs.

---

## 4. Relationship to Prior Design

The previous R-008 design used two GHL URLs:
- `GHL_STRIPE_SYNC_WEBHOOK_URL` — all success events, with a single `event` discriminator field
- `GHL_STRIPE_FAILED_WEBHOOK_URL` — `past_due` and `refund_processed`

That design forced GHL to branch inside the workflow on the `event` field, which made the workflow editor hard to maintain at scale. The 6-URL routing in this contract is operationally equivalent — the same logical events that fired on the prior 2 URLs now each get a dedicated workflow with no branching, at the cost of 4 extra Firebase secrets.

`research.md` R-008, `quickstart.md` sections B.3 and C, and `tasks.md` T011/T012/T014/T023/T043/T053–T057 are updated to reference this contract.
