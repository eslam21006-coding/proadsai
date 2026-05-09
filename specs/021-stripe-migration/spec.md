# Feature Specification: Stripe Migration — Replace Paddle with Stripe as Billing Provider

**Feature Branch**: `021-stripe-migration`
**Pre-implementation QA observations**: see /MANUAL_QA_LOG.md (top of file → most recent entry) for bugs found in current code that must be addressed during this migration.
**Created**: 2026-05-05
**Status**: Draft
**Input**: User description: "Phase 21 — Stripe Migration. Replace the existing Paddle billing engine (`functions/src/paddle/`, `functions/src/billing/paddleWebhook.ts`, Paddle fields in `billing/billingState.ts`, `billing/billingLogger.ts`, `billing/ghlBillingSync.ts`, and 9 Paddle Cloud Functions in `functions/src/index.ts`) with Stripe. Reuse the Phase 8 behavioral spec at `specs/009-billing-plan-access/` (user stories, FRs, state transitions, GHL sync rules, dual-write `pending_plans` pattern, mandatory billing modal, email-only auth). Only the billing engine changes."

## Summary

Replace Paddle with Stripe as the sole payment processor while preserving every behavior contract established in Phase 8. New external buyers come through a GHL-hosted marketing funnel that uses GHL's native Stripe integration to create the Stripe customer and subscription; all authenticated in-app billing actions (initial subscription from the mandatory billing modal, plan changes, top-ups) use Stripe Checkout Sessions; cancellation and payment-method updates use Stripe Customer Portal. GHL remains the CRM and continues to receive best-effort post-payment sync events from Firebase. The `pending_plans/{email.toLowerCase()}` dual-write pattern, the email-only auth flow, the dismiss-proof mandatory billing modal, the welcome trial toast, and the Firebase→GHL sync direction are preserved unchanged. Paddle code is deleted wholesale in a single migration PR — safe because the product is pre-launch with zero paying users.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Stripe-Backed Billing Dashboard (Priority: P1)

A subscribed user navigates to the Billing page to see their current plan, remaining credits, next credit reset date, and subscription status at a glance. A "Manage Subscription" link opens the Stripe Customer Portal in a new tab where they can update payment method, change plan, cancel, or download invoices. The information updates in real time — credits consumed in another tab reflect immediately.

**Why this priority**: Without a reliable billing dashboard, users cannot make informed decisions about upgrades, top-ups, or cancellations. Foundation for every other billing interaction.

**Independent Test**: Subscribe on any plan via Stripe Checkout Session; verify the Billing page displays accurate plan name, credit count, reset date, status "Active", and that the "Manage Subscription" button opens the Stripe Customer Portal.

**Acceptance Scenarios**:

1. **Given** a user on the Pro plan with 1,450 credits remaining, **When** they open the Billing page, **Then** they see "Pro Plan", a credit bar showing 1,450 / 2,000, next reset date, and status "Active".
2. **Given** a user whose credits are consumed in another browser tab, **When** the Billing page is already open, **Then** the credit bar updates in real time without manual refresh.
3. **Given** a subscribed user clicks "Manage Subscription", **Then** the Stripe Customer Portal opens in a new tab via a freshly generated portal session URL.
4. **Given** a trial user with 23 credits remaining, **When** they open the Billing page, **Then** they see "Trial" label, a countdown, and a prominent upgrade CTA.

---

### User Story 2 - Unified Billing State Driven by Stripe Webhooks (Priority: P1)

Every backend path that changes a user's plan or credits — Stripe webhook events (`checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`) and the scheduled monthly credit reset — writes a single derived `billingState` field on the user document. The frontend reads this one field via a real-time listener.

**Why this priority**: A single source of truth eliminates race conditions and stale-state bugs across the app. Every downstream story depends on `billingState` being accurate and consistent.

**Independent Test**: Simulate each Stripe event type and verify the `billingState` field is written with the correct shape and values.

**Acceptance Scenarios**:

1. **Given** `checkout.session.completed` fires with `mode='subscription'` and `client_reference_id` populated (existing user upgrading from inside the app), **When** processing completes, **Then** `users/{uid}` is updated with the resolved plan, credits, `billingStatus='active'`, `stripeCustomerId`, and `stripeSubscriptionId`; `billingState` is recomputed.
2. **Given** `checkout.session.completed` fires with `mode='subscription'` and NO `client_reference_id` (new user paid via GHL funnel before signing up), **When** processing completes, **Then** a `pending_plans/{customer_details.email.toLowerCase()}` document is created and will be consumed on first sign-in.
3. **Given** `customer.subscription.deleted` fires, **When** processing completes, **Then** `billingState.plan='none'`, `credits=0`, `billingStatus='cancelled'`.
4. **Given** `invoice.payment_succeeded` fires for a renewal invoice (not the initial subscription invoice), **When** processing completes, **Then** `billingState.credits` is reset to the plan's monthly allocation and `nextResetDate` is updated.
5. **Given** `checkout.session.completed` fires with `mode='payment'` and `metadata.isTopUp='true'`, **When** processing completes, **Then** `billingState.credits` increases atomically by `metadata.creditAmount`.
6. **Given** `invoice.payment_failed` fires, **When** processing completes, **Then** `billingStatus='past_due'`, credits remain unchanged, grace period countdown begins.

---

### User Story 3 - Plan-Gate Enforcement at Credit Deduction (Priority: P1)

When a user triggers a credit-consuming action, the server verifies the action is allowed under the user's current plan before deducting credits. If the user's plan was downgraded since the frontend last loaded, the server rejects the action with `plan_downgraded` rather than silently deducting.

**Why this priority**: Without server-side plan gating, users could consume features they no longer pay for — leading to revenue loss and entitlement inconsistency.

**Independent Test**: Downgrade a user's plan in the database and attempt a credit-consuming action that requires the old plan — the server must reject.

**Acceptance Scenarios**:

1. **Given** a user on the Starter plan, **When** they attempt a carousel generation (Pro+ only), **Then** the server rejects with `plan_downgraded` and an upgrade message.
2. **Given** a user on the Pro plan, **When** they attempt a standard generation they are entitled to, **Then** credits are deducted normally.
3. **Given** a user whose plan was downgraded between page loads, **When** they click generate on a Pro-only feature still visible, **Then** the server rejects and the frontend shows an upgrade prompt.

---

### User Story 4 - Self-Service Subscription Management via Stripe Customer Portal (Priority: P1)

A subscribed user can open the Stripe Customer Portal directly from the Billing page to update payment method, change plan, cancel, view invoices, and download receipts. The portal session is generated on demand by `createStripePortalSession` callable when the user clicks "Manage Subscription". Stripe Customer Portal sessions are short-lived; the callable always returns a fresh URL.

**Why this priority**: Self-service subscription management is table-stakes for SaaS. Stripe Customer Portal handles all of it — invoices, receipts, plan switching, cancellation, payment method updates — at zero engineering cost beyond the portal session callable.

**Independent Test**: Click "Manage Subscription" on the Billing page; verify the Stripe-hosted portal opens with accurate subscription information.

**Acceptance Scenarios**:

1. **Given** a subscribed user clicks "Manage Subscription", **When** the click handler runs, **Then** `createStripePortalSession({ returnUrl })` is called and the user is redirected to the resulting Stripe Customer Portal URL in a new tab.
2. **Given** a user clicks "Cancel Subscription" specifically, **Then** the in-app cancellation reason dialog appears first; on submit, a Stripe Customer Portal session with `flow_data: { type: 'subscription_cancel' }` is generated and the user is deep-linked into the cancellation flow.
3. **Given** Stripe emails an invoice or receipt, **When** the user clicks the link, **Then** Stripe-hosted PDF rendering occurs without app involvement.
4. **Given** a user updates payment method or changes plan in the portal, **When** Stripe fires `customer.subscription.updated`, **Then** the app reflects the change in real time.

---

### User Story 5 - Top-Up Credits via Stripe Checkout (Priority: P2)

A user running low on credits can purchase additional credits from the Billing page. They select a top-up pack (100, 300, or 800 credits), are redirected to a Stripe Checkout Session in `mode='payment'`, complete payment, and return to the app where their credit balance increases in real time with a confirmation message.

**Why this priority**: Top-ups are direct revenue and prevent users from hitting credit walls.

**Independent Test**: Select a top-up pack, complete Stripe Checkout, verify the credit bar increases by the correct amount and a success toast appears.

**Acceptance Scenarios**:

1. **Given** a paid user clicks the 100-credit top-up, **When** the click handler runs, **Then** `createStripeTopUpSession({ creditAmount: 100, priceId })` is called and the user is redirected to a Stripe Checkout Session with `mode='payment'`, `metadata.firebaseUid=auth.uid`, `metadata.isTopUp='true'`, `metadata.creditAmount='100'`.
2. **Given** the user completes payment, **When** `checkout.session.completed` fires with `mode='payment'` and `metadata.isTopUp='true'`, **Then** the credit balance increases atomically by `metadata.creditAmount` and a success toast appears: "100 credits added to your account."
3. **Given** the user abandons checkout, **Then** no credits are added and no error is shown.

---

### User Story 6 - Cancel Subscription via Stripe Customer Portal (Priority: P2)

A user decides to cancel. They click Cancel on the Billing page, see a two-step in-app dialog (confirmation + reason + optional feedback), then are deep-linked into the Stripe Customer Portal cancellation flow where Stripe finalizes the cancellation. The resulting `customer.subscription.updated` (with `cancel_at_period_end=true`) and later `customer.subscription.deleted` (at period end) webhooks update the app.

**Why this priority**: Honest, frictionless cancellation builds trust and meets regulatory expectations.

**Independent Test**: Initiate cancellation, complete the in-app reason dialog, complete Stripe portal cancellation, verify the Billing page shows "Cancelled — access until [date]" and access continues until that date.

**Acceptance Scenarios**:

1. **Given** a subscribed user clicks Cancel, **Then** an in-app confirmation dialog appears explaining access continues until period end, followed by a reason selector and optional feedback field.
2. **Given** the user submits the reason, **Then** the cancellation log is written and the user is opened the Stripe Customer Portal cancellation deep-link via `createStripePortalSession({ flow: 'subscription_cancel' })`.
3. **Given** the user confirms cancellation in the portal, **When** `customer.subscription.updated` fires with `cancel_at_period_end=true`, **Then** the Billing header shows "Cancelled — access until [date]" and all features remain accessible until that date.
4. **Given** the period ends, **When** `customer.subscription.deleted` fires, **Then** `plan='none'`, `credits=0`, `billingStatus='cancelled'`.

---

### User Story 7 - Trial Expiry Handling (Priority: P2)

Stripe `trial_period_days: 7` is set on subscription Checkout Sessions. During the trial, `customer.subscription.updated` events report `status='trialing'` and `billingState.isTrial=true`. When the trial converts (`status='active'`), `isTrial` flips to false. If the trial expires without payment (Stripe sends `customer.subscription.deleted`), the app shows a persistent "trial ended" banner with all generation actions blocked server-side until upgrade.

**Why this priority**: Trial-to-paid conversion is a key business metric. Clear trial expiry messaging drives upgrades.

**Independent Test**: Create a trial user, deplete credits to zero or let the trial expire, verify the persistent banner appears and generation actions are blocked.

**Acceptance Scenarios**:

1. **Given** a trial user with 0 credits remaining, **When** they navigate to any page, **Then** a persistent banner appears: "Your trial has ended — upgrade to keep generating."
2. **Given** a trial user with 0 credits, **When** they attempt any generation, **Then** the server rejects and the UI shows an upgrade prompt.
3. **Given** a trial user with credits remaining, **Then** no trial-ended banner is shown.

---

### User Story 8 - Downgrade Enforcement (Priority: P2)

When a user's plan drops, features they no longer have access to are hidden or disabled on the next UI evaluation without page refresh. The real-time billing state listener triggers immediate re-evaluation.

**Why this priority**: Users must not see or interact with features they no longer pay for. Real-time enforcement prevents confusion and unauthorized feature access.

**Independent Test**: Downgrade a user's plan and verify previously accessible features are immediately hidden or disabled in the UI without refresh.

**Acceptance Scenarios**:

1. **Given** a user downgraded from Scale to Pro, **When** the billing state updates, **Then** Scale-only features (batch generation, creative scoring, smart recommendations, multi-brand workspaces) are hidden or disabled without refresh.
2. **Given** a user downgraded from Pro to Starter, **Then** Pro-only features (carousel ads, competitor research, reference ad upload, push to Meta, creative memory) are hidden or disabled.
3. **Given** a user upgrades from Starter to Pro, **Then** newly available features become visible without refresh.

---

### User Story 9 - Upgrade and Plan Change via Stripe Checkout or Portal (Priority: P2)

A user changing plan can either (a) click "Upgrade" inside the app, which redirects to a fresh Stripe Checkout Session for the target price, or (b) open the Stripe Customer Portal and use its plan-switching flow. Either path generates `customer.subscription.updated` and the app reflects the new plan in real time.

**Why this priority**: Plan changes are a core subscription lifecycle event. Users expect to upgrade instantly when they need more features.

**Independent Test**: Upgrade a plan through Stripe Checkout, verify `customer.subscription.updated` fires, check that feature access updates immediately.

**Acceptance Scenarios**:

1. **Given** a Starter user clicks "Upgrade to Pro" on the Billing page or pricing table, **Then** `createStripeCheckoutSession({ priceId: PRO_MONTHLY })` is called and the user is redirected to the resulting Stripe Checkout URL.
2. **Given** the user completes the upgrade, **When** `checkout.session.completed` fires followed by `customer.subscription.updated`, **Then** plan, credits, and feature access update in real time.
3. **Given** the user changes plan via the Stripe Customer Portal instead, **When** `customer.subscription.updated` fires, **Then** the app reflects the new plan without manual intervention.

---

### User Story 10 - Low Credits Warning (Priority: P3)

When a user's remaining credits drop below 20% of the plan's monthly allocation, a persistent banner appears with a top-up CTA. Helps users avoid hitting zero credits mid-workflow.

**Why this priority**: Proactive low-credit warnings reduce user frustration and drive top-up revenue. Lower priority because the system still functions — it is a quality-of-life improvement.

**Independent Test**: Reduce a user's credits below the 20% threshold and verify the warning banner appears with a top-up link.

**Acceptance Scenarios**:

1. **Given** a Pro user (2,000 credits/month) with 350 credits remaining, **Then** a persistent banner appears: "Credits running low" with a top-up link.
2. **Given** a user with credits above 20%, **Then** no banner is shown.
3. **Given** a user tops up above the threshold, **Then** the banner disappears.

---

### User Story 11 - Payment Failure Visibility and Dunning (Priority: P2)

When a user's payment fails, the Billing page shows a "Payment failed" alert with an "Update payment method" button (deep-links to the Stripe Customer Portal `payment_method_update` flow) and a countdown to grace-period expiry. Stripe Smart Retries handles dunning automatically (configured in the Stripe Dashboard). The app surfaces `past_due` from `invoice.payment_failed`. GHL is notified via the `payment.failed` event routed to `GHL_OVERDUE_FAILED_URL` per `contracts/ghl-inbound-payload.md`, triggering the dunning automation in GHL.

**Why this priority**: Users must know their payment failed so they can fix it before auto-cancellation. Silent grace periods lead to surprise cancellations and support tickets.

**Independent Test**: Simulate a payment failure event and verify the Billing page shows the alert, the update button opens the Stripe portal, the countdown reflects the grace period end, and GHL receives the dunning sync webhook.

**Acceptance Scenarios**:

1. **Given** a user whose payment failed and is in the grace period, **When** they open the Billing page, **Then** they see a "Payment failed" alert with an "Update payment method" button and a countdown.
2. **Given** a user in `past_due` status, **When** they click "Update payment method", **Then** they are deep-linked to the Stripe Customer Portal `payment_method_update` flow.
3. **Given** payment recovery occurs (via Smart Retries or manual update), **When** `invoice.payment_succeeded` fires, **Then** the alert disappears and `billingStatus` returns to `active` in real time.

---

### User Story 12 - Firebase-to-GHL Sync (Priority: P1)

Every Stripe webhook successfully processed by Firebase triggers a best-effort sync POST to one of six GHL inbound webhook URLs, routed by normalized `event_type` per `contracts/ghl-inbound-payload.md` §3. GHL uses the canonical 21-field payload (contract §1 + §2) to run CRM automations (tagging, welcome emails, win-back, dunning, refund acknowledgement). GHL sync failures never block the billing state update.

**Why this priority**: GHL is the CRM and marketing automation engine. Losing sync means broken welcome emails, missing plan tags, no dunning. But blocking billing on a third-party CRM would be catastrophic — hence the best-effort pattern.

**Independent Test**: Simulate each Stripe webhook and verify GHL receives the correct sync payload. Also test by deliberately breaking the GHL URL and confirming billing state still updates with a logged failure.

**Acceptance Scenarios**:

1. **Given** `checkout.session.completed` succeeds for an existing user with a paid subscription (no trial), **When** GHL sync runs, **Then** GHL receives the canonical 21-field payload at `GHL_PAYMENT_RECEIVED_URL` with `event_type: 'subscription.created'` — email/`first_name`/`last_name` resolved from `users/{uid}` per the contract.
2. **Given** `checkout.session.completed` succeeds for a pre-signup user (no `client_reference_id`), **When** GHL sync runs, **Then** GHL receives the same payload at the same URL with `event_type: 'subscription.created'` — email taken from `customer_details.email`; `first_name` / `last_name` are both `null` (no Firebase Auth account exists yet).
3. **Given** `checkout.session.completed` succeeds with `subscription.trial_end` set, **When** GHL sync runs, **Then** GHL receives the payload at `GHL_TRIAL_STARTED_URL` with `event_type: 'trial.started'`, `is_trial: true`, and populated `trial_end_date` / `trial_end_date_human`.
4. **Given** `customer.subscription.deleted` succeeds, **Then** GHL receives the payload at `GHL_CANCELLED_URL` with `event_type: 'subscription.cancelled'`, populating `cancel_at` and `cancellation_reason` from `cancellation_logs/{uid}_{ts}` if present.
5. **Given** `invoice.payment_failed` succeeds, **Then** GHL receives the payload at `GHL_OVERDUE_FAILED_URL` with `event_type: 'payment.failed'` and a transiently-generated `portal_url`.
6. **Given** `charge.refunded` succeeds for a full subscription refund, **Then** the resulting `customer.subscription.deleted` produces a single `subscription.cancelled` POST to `GHL_CANCELLED_URL` (no separate `refund_processed` event); a `cancellation_logs/{uid}_{ts}` entry is also written with `reason: 'refund'`.
7. **Given** `charge.refunded` succeeds for a full top-up refund, **Then** credits are decremented and `refund_logs/{uid}_{ts}` is written; **NO GHL POST is emitted**.
8. **Given** `charge.refunded` succeeds with `amount_refunded < amount` (partial refund), **Then** `stripe_events/{eventId}.result = 'partial_refund_logged'` is written; plan/credits unchanged; **NO GHL POST is emitted**.
9. **Given** transient portal session generation fails inside the sync helper, **Then** the GHL POST is still made with `portal_url: null` and the failure is logged with code `portal_session_generation_failed`.
10. **Given** the GHL sync POST itself fails, **Then** the billing state update still completes and the failure is logged without throwing.

---

### User Story 13 - Email-Only Authentication (Priority: P1)

Email + password only. No Google sign-in. Login screen has Login / Create Account tabs with auto-switching on email collisions or missing accounts. Email verification required before app access. Forgot password flow uses Firebase's built-in password reset.

**Why this priority**: The new billing flow requires exact email matching between Stripe payment records and Firebase Auth accounts. Google sign-in introduces mismatch risk that would break the billing-to-auth link.

**Independent Test**: (a) log in with an existing email+password account, (b) create a new account with a fresh email, (c) enter an unknown email on Login and verify auto-switch to Create Account with email pre-filled, (d) confirm Google sign-in is completely absent from the UI.

**Acceptance Scenarios**:

1. **Given** a user visits login, **Then** they see two tabs (Login / Create Account) with email + password fields, no Google sign-in button, no Google-related UI.
2. **Given** a user enters an unknown email on Login, **Then** an inline error appears AND the tab auto-switches to Create Account with email pre-filled.
3. **Given** a user enters an existing email on Create Account, **Then** an inline error appears AND the tab auto-switches to Login with email pre-filled.
4. **Given** a user submits Create Account with valid input, **Then** a Firebase Auth account is created, an email verification link is sent, and the user lands on the "Verify your email" screen.
5. **Given** a user submits Create Account with mismatched passwords, **Then** an inline error appears and the account is not created.
6. **Given** a user submits Create Account with a password shorter than 8 characters, **Then** an inline error appears and the account is not created.
7. **Given** a user clicks "Forgot Password?", **Then** Firebase's password reset email is sent and a non-revealing confirmation message is shown.

---

### User Story 14 - Two-Path Acquisition: GHL Funnel + In-App Stripe Checkout (Priority: P1)

The app supports two acquisition paths into the Stripe billing engine:

**Path A — External (GHL funnel)**: A visitor sees a GHL-hosted marketing page, clicks the CTA, and is taken to a GHL-hosted checkout form. GHL uses its native Stripe integration to create the Stripe customer + subscription server-side via Stripe API. Stripe sends `checkout.session.completed` (if GHL uses Checkout Sessions) OR `customer.subscription.created` followed by `invoice.payment_succeeded` (if GHL uses the Subscriptions API directly) to the app's `stripeWebhook` endpoint. Both event handlers implement the dual-write pattern: because GHL's integration does not pass `client_reference_id` or `subscription.metadata.firebaseUid`, the webhook detects the missing identifier and writes plan data to `pending_plans/{customer.email.toLowerCase()}`. The user later visits the app, creates a Firebase Auth account with the SAME email, and the existing `pending_plans` consume flow runs: doc consumed into `users/{uid}`, doc deleted, welcome toast shown.

**Path B — Internal (mandatory billing modal + in-app upgrades + top-ups)**: A Firebase Auth user with `plan='none'` (signed up without paying first) sees the dismiss-proof billing modal containing the pricing table. Clicking a plan calls `createStripeCheckoutSession({ priceId })`; the server creates a Stripe Checkout Session with `client_reference_id=auth.uid`, `customer_email=auth.email`, `metadata.firebaseUid=auth.uid`, `subscription_data.metadata.firebaseUid=auth.uid` (so the subsequent `customer.subscription.created` event also carries the identifier), `subscription_data.trial_period_days=7`, `automatic_tax: { enabled: true }`. The user is redirected to the Stripe-hosted Checkout. On completion, `checkout.session.completed` fires WITH `client_reference_id` → webhook writes `users/{uid}` directly. `customer.subscription.created` fires shortly after with the same `firebaseUid` in `subscription.metadata`; the handler detects `users/{uid}.stripeSubscriptionId` already matches and is a no-op. The real-time `billingState` listener detects the plan transition from `'none'` to a real plan and auto-closes the modal. The welcome toast fires.

Path B is also the path for in-app upgrades by users who already have a paid plan, and for top-ups (`mode='payment'`).

**Why this priority**: This is the primary onboarding path. Every paying customer goes through it. Missing or broken handling means paid customers cannot access what they paid for, or unpaid users get trapped or deleted.

**Independent Test**: (a) Trigger a GHL funnel checkout with a fresh email; verify `pending_plans/{email}` is created from the Stripe webhook. (b) Create a Firebase Auth account with that email; verify the pending doc is consumed. (c) Separately create a Firebase Auth account with a fresh email that has no pending plan; verify the mandatory billing modal appears. (d) Click a plan in the modal; verify the user is redirected to a Stripe-hosted Checkout Session (NOT a GHL form); verify the webhook writes to `users/{uid}` with `client_reference_id` matching; verify the modal auto-closes and the welcome toast fires.

**Acceptance Scenarios**:

1. **Given** a GHL funnel buyer pays, **When** the resulting Stripe webhook fires WITHOUT `client_reference_id`, **Then** plan data is written to `pending_plans/{customer_details.email.toLowerCase()}`.
2. **Given** an authenticated Firebase Auth user with `plan='none'` clicks a plan in the mandatory billing modal, **When** the click handler runs, **Then** `createStripeCheckoutSession` is called with `client_reference_id=auth.uid` and the user is redirected to a Stripe-hosted Checkout Session — they are NOT redirected back out to the GHL funnel form.
3. **Given** the email case differs between Stripe (`User@Example.com`) and Firebase Auth (`user@example.com`), **When** the `pending_plans` lookup runs, **Then** the case-insensitive lowercased match succeeds.
4. **Given** a user is a team member or has a valid pending team invite, **When** they sign in, **Then** the mandatory billing modal is suppressed.
5. **Given** the user is in the mandatory billing modal, **When** they attempt to dismiss it, **Then** the modal cannot be closed — no close button, no outside-click dismissal, no escape key. Only a successful Stripe Checkout closes it.
6. **Given** the user successfully signs in with a fresh account (`createdAt` within last 60 seconds, `welcomeToastShown !== true`), **Then** the welcome toast appears exactly once and `welcomeToastShown` is set to `true`.

---

### Edge Cases

- **Stripe webhook fires before user creates Firebase Auth account**: The `checkout.session.completed` handler (or `customer.subscription.created` handler if GHL bypassed Checkout Sessions) detects missing identifier and writes `pending_plans/{customer.email.toLowerCase()}`. Consumed on first sign-in.
- **Both `checkout.session.completed` and `customer.subscription.created` fire for the same in-app purchase**: Application-level dedup applies. Whichever event arrives first writes `users/{uid}.stripeSubscriptionId`; the second event's handler detects the match and exits without re-applying state. Event-ID-level dedup (`stripe_events/{eventId}`) is unaffected — these are different events with different IDs.
- **A previously-cancelled user resubscribes**: Their `users/{uid}.stripeCustomerId` is preserved across cancellation (only plan/credits/subscription fields are cleared). The new Checkout Session reuses the existing Customer (`customer: stripeCustomerId`), preserving invoice/refund history in the Stripe Dashboard. A new `stripeSubscriptionId` is assigned for the new subscription.
- **Subscription refund issued**: `charge.refunded` fires for the full subscription charge. Handler invokes `stripe.subscriptions.cancel(stripeSubscriptionId)`, which fires `customer.subscription.deleted` → plan='none', credits=0, billingStatus='cancelled'. The resulting `subscription.cancelled` event_type routes to `GHL_CANCELLED_URL` per `contracts/ghl-inbound-payload.md` — no separate refund-event POST is emitted. A `cancellation_logs/{uid}_{ts}` entry is written with `reason: 'refund'`.
- **Top-up refund issued**: `charge.refunded` fires for a `mode='payment'` transaction (identified by the underlying PaymentIntent's session having `metadata.isTopUp='true'`). Handler atomically deducts the refunded credit amount from the user's balance (clamped at zero) and writes `refund_logs/{uid}_{ts}`. Plan and subscription state are unaffected. **No GHL POST is emitted.**
- **Partial refund issued**: `charge.refunded` fires with `amount_refunded < amount`. Handler logs the event with `result: 'partial_refund_logged'` on `stripe_events/{eventId}` but does NOT change plan or credits and does NOT emit a GHL POST. Manual support follow-up if needed.
- **Two billing events fire near-simultaneously (top-up + monthly reset)**: Firestore transactions on credit writes prevent race conditions.
- **Cancelled user attempts to reactivate before period ends**: Directed to the Stripe Customer Portal, which Stripe handles natively; `customer.subscription.updated` restores active status.
- **Team member views the Billing page**: They see the owner's billing info as read-only with a "Team credits — [Owner Name]'s account" label. Cannot modify billing.
- **Payment failure grace period expires without recovery**: Stripe Smart Retries exhausts retries; eventually `customer.subscription.deleted` fires, plan='none'.
- **Stripe webhook signature verification fails**: Webhook returns 400 and is logged. Billing state is not modified.
- **Stripe delivers the same event twice**: Dedup by `event.id` in `stripe_events/{eventId}` prevents reapplying state changes.
- **GHL sync fails (network error, GHL down, URL misconfigured)**: Billing state update still proceeds. Sync failure is logged but does not throw.
- **`customer.subscription.updated` fires with same price ID (metadata-only change)**: Handler refreshes `cancel_at_period_end` and `current_period_end` flags but does not change plan or credits.
- **User pays with email A on Stripe but creates Firebase Auth account with email B**: The Firebase Auth account is created; no pending plan is found for email B; user sees the mandatory billing modal as if they never paid. Recovery requires support contact.
- **User completes Firebase Auth signup but never completes a Stripe Checkout from the modal**: Firebase Auth account is retained, `users/{uid}` stays at `plan='none'`, modal continues to show on every sign-in. Account is NOT deleted.
- **Welcome toast logic runs twice (React StrictMode)**: 60-second `createdAt` window + `welcomeToastShown` flag prevent visual duplication.
- **User pays via GHL twice before signing up (two webhooks for same email)**: Last-write-wins on `pending_plans/{email}`. Both Stripe transactions remain in Stripe billing history for support refund review.
- **`invoice.payment_succeeded` fires for the initial subscription invoice (creation)**: Handler detects `billing_reason: 'subscription_create'` and skips the renewal credit reset (initial credits already set by `checkout.session.completed`).
- **`invoice.payment_succeeded` fires for a renewal invoice (`billing_reason: 'subscription_cycle'`)**: Handler resets credits to plan allocation and updates `nextResetDate`.
- **Stripe Tax fails to determine tax for a jurisdiction**: Stripe Checkout falls back to no tax for that session and the transaction completes; this is a Stripe-side concern, not an app-side one.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST maintain a single derived `billingState` field on each user document containing: `plan`, `isTrial`, `credits`, `creditsPerMonth`, `billingStatus`, `nextResetDate`, `stripeCustomerId`, `stripeSubscriptionId`, `canUpgrade`, `canTopUp`, `isTeamMember`, `teamOwnerUid`, `teamOwnerName`, `cancelAt`, `gracePeriodEndsAt`, `pendingPlan`, `pendingPlanEffectiveAt`. The `stripePortalUrl` is NOT stored on the user document because portal sessions are short-lived; it is generated on demand by `createStripePortalSession`.
- **FR-002**: System MUST write `billingState` on every path that changes plan or credits: all Stripe webhook handlers (`checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`) and the monthly credit reset cron. The `checkout.session.completed` handler MUST use dual-write logic: if `client_reference_id` is present, write to `users/{uid}` and call `writeBillingState(uid)`; if absent, write plan data to `pending_plans/{customer_details.email.toLowerCase()}` instead. The `customer.subscription.created` handler MUST run as a fallback dual-write trigger for paths that bypass Checkout Sessions (including GHL's native Stripe integration if it creates subscriptions via the Subscriptions API directly): if `subscription.metadata.firebaseUid` is present, write to `users/{uid}`; if absent, retrieve the Stripe Customer for the subscription and write to `pending_plans/{customer.email.toLowerCase()}`. Application-level dedup MUST ensure that when both `checkout.session.completed` and `customer.subscription.created` fire for the same in-app purchase, the second event handler detects that `users/{uid}.stripeSubscriptionId` already matches and is a no-op.
- **FR-003**: System MUST provide a real-time frontend hook (`useBillingState`) that subscribes to `billingState` changes via a live database listener.
- **FR-004**: System MUST verify plan entitlement at credit-deduction time by checking whether the requested action is allowed under the user's current plan before deducting credits.
- **FR-005**: System MUST reject credit-consuming actions with error code `plan_downgraded` when the user's current plan does not permit the action, even if the frontend still displays the feature.
- **FR-006**: System MUST provide a Billing page displaying: current plan and credits bar, upgrade CTA, top-up options (100/300/800 credits), "Manage Subscription" button (opens Stripe Customer Portal via `createStripePortalSession`), trial indicator if applicable, payment failure alert if `past_due`.
- **FR-007**: System MUST handle trial expiry: when a trial user reaches 0 credits OR the Stripe `trial_end` date passes without conversion, display a persistent app-wide banner prompting upgrade and block all generation actions server-side.
- **FR-008**: System MUST enforce plan downgrade in real time: when a user's plan drops, features they no longer have access to MUST be hidden or disabled without page refresh.
- **FR-009**: System MUST implement the top-up flow end-to-end: user selects pack, redirects to Stripe Checkout Session in `mode='payment'` with `metadata: { firebaseUid, isTopUp: 'true', creditAmount }`. The `checkout.session.completed` webhook adds credits atomically. Billing state updates and frontend credit bar reflects the change in real time.
- **FR-010**: System MUST implement a two-step cancellation flow: first step collects cancellation reason and optional feedback (stored in `cancellation_logs` for analytics); second step generates a Stripe Customer Portal session with `flow_data: { type: 'subscription_cancel' }` and redirects the user. The resulting `customer.subscription.updated` (with `cancel_at_period_end=true`) and later `customer.subscription.deleted` webhooks update the app.
- **FR-011**: System MUST display a low-credits warning banner when credits drop below 20% of the plan's monthly allocation.
- **FR-012**: System MUST show team members a read-only view of the owner's billing state and prevent them from modifying billing.
- **FR-013**: System MUST display a "Payment failed" alert on the Billing page when `billingStatus='past_due'`, including an "Update payment method" button that opens the Stripe Customer Portal in the `payment_method_update` flow, and a countdown to grace-period expiry.
- **FR-014**: System MUST process Stripe webhook events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`, `charge.refunded`. The `customer.subscription.created` handler is a fallback for paths that bypass Checkout Sessions; it MUST be idempotent against `checkout.session.completed` (no-op when the subscription is already linked to a `users/{uid}` document). Subscription pausing is out of scope for this phase.
- **FR-015**: System MUST verify Stripe webhook signatures on all incoming webhook requests using the raw request body and `stripe.webhooks.constructEvent(rawBody, signature, secret)`. Invalid signatures MUST return 400 without modifying billing state.
- **FR-016**: System MUST deduplicate all incoming Stripe webhooks by `event.id` — if an event has already been processed, acknowledge it without re-applying any state changes. Dedup records live in `stripe_events/{eventId}`.
- **FR-017**: System MUST NOT store a long-lived Stripe Customer Portal URL on `users/{uid}` — portal sessions are short-lived. All portal URLs MUST be generated on demand: (a) the user-facing "Manage Subscription" / cancellation / payment-method-update flows generate via the `createStripePortalSession` callable; (b) the GHL failed-sync helper generates transiently per FR-018; (c) no other code path generates portal URLs.
- **FR-018**: System MUST forward a best-effort sync POST to GHL after every successful Stripe webhook processing per the per-event-type routing contract `contracts/ghl-inbound-payload.md`. The sync helper `notifyGHL(identifier, eventType, payloadFields)` builds the canonical 21-field payload (contract §1 + §2) and selects the destination URL from a closed set of 6 GHL inbound webhook secrets — `GHL_TRIAL_STARTED_URL`, `GHL_PAYMENT_RECEIVED_URL`, `GHL_RECOVERED_URL`, `GHL_OVERDUE_FAILED_URL`, `GHL_CANCELLED_URL`, `GHL_TOPUP_URL` — based on the normalized `event_type` (contract §3). The sync helper MUST accept either a Firebase `uid` (reads user doc for `email`, `displayName`, and `stripeCustomerId`) or a raw `email` string (for pre-signup users in `pending_plans`); `displayName` is split on the first whitespace into `first_name` and `last_name` per the contract. The helper MUST generate a fresh Stripe Customer Portal session URL transiently via `stripe.billingPortal.sessions.create({ customer: stripeCustomerId, return_url })` just before every POST and include it as `portal_url` in the payload (the contract removes the prior 2-URL split that omitted portalUrl on success events). Portal-session generation failures MUST be logged with code `portal_session_generation_failed` but MUST NOT block the GHL POST — the payload is sent with `portal_url: null` and GHL email templates MUST handle the missing field gracefully (per quickstart B.4). GHL POST failures MUST be logged with code `ghl_sync_failed` but MUST NOT throw or block billing state updates. Top-up refunds and partial refunds MUST NOT trigger a GHL POST (per FR-032 (b) / (c)); subscription-refund-driven cancellations route naturally through the `customer.subscription.deleted` → `subscription.cancelled` path.
- **FR-019**: System MUST provide a callable `createStripeCheckoutSession({ priceId })` that generates a Stripe Checkout Session with `mode='subscription'`, `client_reference_id=auth.uid`, `metadata.firebaseUid=auth.uid`, `subscription_data.metadata.firebaseUid=auth.uid`, `subscription_data.trial_period_days=7`, `automatic_tax: { enabled: true }`, `success_url=https://app.proadsai.com/billing?paid=1`, `cancel_url=https://app.proadsai.com/billing?canceled=1`. The callable MUST set `customer: users/{uid}.stripeCustomerId` if it exists on the user document; otherwise fall back to `customer_email: auth.email`. System MUST provide a separate callable `createStripeTopUpSession({ creditAmount, priceId })` that generates a Stripe Checkout Session with `mode='payment'`, `metadata: { firebaseUid, isTopUp: 'true', creditAmount }`, and the same customer reuse rule (`customer: stripeCustomerId` if present, else `customer_email`). System MUST provide a callable `createStripePortalSession({ flow?, returnUrl? })` that generates a Stripe Customer Portal session against `users/{uid}.stripeCustomerId`, optionally deep-linked to `subscription_cancel` or `payment_method_update`.
- **FR-020**: System MUST remove Google sign-in entirely. The login screen MUST NOT contain any Google sign-in button, Google provider configuration, or Google-related error states.
- **FR-021**: System MUST provide a login screen with two tabs: Login (email + password + submit + forgot-password link) and Create Account (email + password + confirm password + submit). Tab switching is a state toggle — no route change.
- **FR-022**: System MUST support account creation via `createUserWithEmailAndPassword` with validations: password length ≥ 8 characters, password matches confirm-password.
- **FR-022a**: System MUST send an email verification message immediately after account creation and MUST block access to the app (including the mandatory billing modal and all paid features) until the user's email is verified. Unverified users MUST see a dedicated "Verify your email" screen with a resend-verification button.
- **FR-023**: System MUST handle email collision: existing email on Create Account → inline error + auto-switch to Login with email pre-filled. Unknown email on Login → inline error + auto-switch to Create Account with email pre-filled.
- **FR-023a**: System MUST provide a "Forgot Password?" link on the Login tab that triggers Firebase's built-in password reset email flow with a non-revealing confirmation message ("If an account exists for this email, a reset link has been sent"). Firebase hosts the reset page — no custom in-app reset UI.
- **FR-024**: System MUST detect post-payment users on first sign-in. After a Firebase Auth account is created (or on any sign-in where `users/{uid}` does not yet exist), the system MUST look up `pending_plans/{email.toLowerCase()}`. If a pending document exists: (a) create `users/{uid}` using the pending plan data, (b) delete the pending document, (c) show a welcome toast if `createdAt` is within the last 60 seconds AND `welcomeToastShown !== true`. If no pending document exists: (a) keep the Firebase Auth account, (b) create a minimal `users/{uid}` with `plan: 'none'`, `credits: 0`, (c) display the mandatory fullscreen billing modal.
- **FR-024a**: The mandatory billing modal MUST have no close button, MUST NOT respond to outside clicks or the escape key, and MUST remain visible until `billingState.plan` transitions from `'none'` to a real plan. The transition MUST be detected by the real-time `useBillingState` listener; the modal MUST close automatically and the welcome toast MUST be displayed. The modal MUST NOT be shown when `isTeamMember=true` or when the user's email matches a valid unclaimed pending team invite. Clicking a plan in the modal MUST invoke `createStripeCheckoutSession` and redirect the user to the Stripe-hosted Checkout — the user MUST NOT be redirected back out to the external GHL funnel.
- **FR-024b**: The welcome toast MUST only be shown on the very first sign-in after account creation. The system MUST check that `users/{uid}.createdAt` is within the last 60 seconds AND `users/{uid}.welcomeToastShown !== true`. Immediately after the toast is displayed, the system MUST set `users/{uid}.welcomeToastShown=true`.
- **FR-025**: System MUST support Arabic (RTL) and English for all billing UI surfaces — Billing page, banners (trial expiry, low credits, payment failure), cancellation dialog, top-up flow, login screen, create account screen, welcome toast, mandatory billing modal — from launch.
- **FR-026**: System MUST emit structured logs at every step of the billing pipeline: webhook received (with `event.id`, `event.type`), signature verification result, idempotency check result, event routing decision, billing state write result, GHL sync attempt, GHL sync result. Every error MUST include an explicit classification code: `stripe_signature_invalid`, `stripe_event_duplicate`, `stripe_event_unknown`, `stripe_price_unmapped`, `ghl_sync_failed`, `portal_session_generation_failed`, `user_doc_missing`, `pending_plan_write_failed`, `billing_state_write_failed`, `refund_processed`. Success logs are required at each step.
- **FR-027**: System MUST configure Stripe Tax (`automatic_tax: { enabled: true }`) on every Stripe Checkout Session and on the Stripe Customer Portal. Tax calculation, collection, and display are handled by Stripe; tax filing remains the merchant's responsibility outside this system.
- **FR-028**: System MUST support both monthly and annual billing cycles from launch. Each plan tier (Starter, Pro, Scale) has two Stripe price IDs (`{ monthly, annual }`). The pricing table UI has a Monthly/Annual toggle. The webhook resolves `billingType` from `subscription.items.data[0].price.recurring.interval`.
- **FR-029**: System MUST pin the Stripe API version explicitly in the SDK constructor (e.g., `apiVersion: '2025-01-27.acacia'`) and align the Stripe Dashboard "Default API version" to the same value. API version upgrades MUST be deliberate and tested.
- **FR-030**: System MUST delete all Paddle code (`functions/src/paddle/`, `functions/src/billing/paddleWebhook.ts`, Paddle fields in `billingState.ts`, `billingLogger.ts`, `ghlBillingSync.ts`, all 9 Paddle Cloud Functions in `functions/src/index.ts`, the Paddle.js loader in `index.html`, all Paddle env secrets, and the Paddle test fixtures) in the same migration PR that introduces the Stripe code. No Paddle code path may survive the migration.
- **FR-031**: System MUST configure a single global currency at launch: USD. All 9 Stripe price IDs (3 monthly subscription + 3 annual subscription + 3 one-time top-up) MUST be denominated in USD. The pricing table UI MUST display USD prices with no currency selector. Customers in non-USD countries pay USD on their card and their issuing bank handles FX. Stripe Tax MUST add VAT/GST on top of the USD price per customer location. Multi-currency support (additional price ID sets or Stripe Adaptive Pricing) is explicitly deferred to a post-launch phase.
- **FR-032**: System MUST handle `charge.refunded` webhooks. The handler MUST distinguish (a) full refund of a subscription invoice, (b) full refund of a top-up transaction, and (c) partial refund of either. For (a): the handler MUST programmatically cancel the user's subscription via the Stripe API using **immediate cancellation** (`stripe.subscriptions.cancel(stripeSubscriptionId)` with default parameters — no `cancel_at_period_end`, no `prorate`). The user has been refunded for the unused period, so continued access through period-end is unjustified. Stripe then fires `customer.subscription.deleted`, which runs the existing cancellation flow (plan='none', credits=0, billingStatus='cancelled') and emits a single GHL POST routed as `event_type: 'subscription.cancelled'` to `GHL_CANCELLED_URL` per `contracts/ghl-inbound-payload.md` §3 — no separate refund-event POST is emitted. The handler MUST also write `cancellation_logs/{uid}_{ts}` with `reason: 'refund'`, `feedback: null` (populated from the refund's `metadata.reason` if present), so refund-driven cancellations appear in cancellation analytics alongside user-initiated ones. For (b): the handler MUST atomically deduct the refunded credit amount from `users/{uid}.credits` (clamped at zero) and log the refund in `refund_logs/{uid}_{ts}` (a dedicated collection separate from `cancellation_logs`, which is reserved strictly for plan-cancellation events). Top-up refunds MUST NOT trigger any GHL notification — credits are silently decremented and the refund is recorded only in `refund_logs` and the structured log. For (c) partial refunds: the handler MUST log the refund event but MUST NOT change plan or credits. Partial refunds MUST NOT trigger any GHL notification — the partial refund is recorded only in `stripe_events/{eventId}` (`result: 'partial_refund_logged'`) and the structured log. All three branches MUST emit a structured log entry with classification code `refund_processed` and the refund amount, charge ID, and source (`subscription` vs `topup`).

### Key Entities

- **Billing State**: A derived, denormalized snapshot of a user's billing context (plan, credits, status, Stripe customer/subscription IDs, capabilities) written by backend functions and consumed by the frontend in real time. Single source of truth for plan-gating and billing UI. Lifecycle: `trialing -> active <-> past_due -> cancelled -> none`. No `paused` status in this phase.
- **Plan**: One of three subscription tiers (Starter, Pro, Scale) or special states (trialing, none/cancelled). Each plan defines credit allocation, feature access, team limits, and a `stripePriceId` map `{ monthly, annual }`.
- **Top-Up Pack**: A one-time credit purchase (100, 300, or 800 credits) processed as a Stripe Checkout Session in `mode='payment'` with `metadata.isTopUp='true'` and `metadata.creditAmount`. Each pack has a `stripeTopUpPriceId`.
- **Cancellation Record**: A log of the user's cancellation event including reason, feedback, plan at time of cancellation, and timestamp — used for analytics and retention. Captured before the user is deep-linked to the Stripe Customer Portal cancellation flow.
- **Stripe Customer**: External record in Stripe linked to the user's account, identified by `stripeCustomerId`. Stripe handles tax calculation and payment processing globally; tax filing and registration remain the merchant's responsibility.
- **Stripe Subscription**: External recurring billing relationship managed by Stripe, including billing cycle, price, payment method, status, `current_period_end`, `cancel_at_period_end`, `trial_end`. Referenced via `stripeSubscriptionId`.
- **Stripe Event Record (`stripe_events/{eventId}`)**: A processed Stripe webhook event, stored by `event.id` for idempotency deduplication. Replaces the prior `paddle_events/{eventId}` collection.
- **GHL Sync Event**: A best-effort outbound POST from Firebase to a GHL inbound webhook URL. Not persisted in Firestore — only the emission is logged.
- **Pending Plan (`pending_plans/{email.toLowerCase()}`)**: A Firestore document holding plan data for a user who paid via the GHL funnel before creating a Firebase Auth account. Consumed by the sign-in handler on first login and then deleted.
- **Mandatory Billing Modal**: A fullscreen, dismiss-proof React modal containing the pricing table, shown to any authenticated user whose `billingState.plan='none'` AND who is NOT a team member. Closes automatically when the listener detects a plan transition. CTA invokes `createStripeCheckoutSession` (in-app Stripe Checkout) — never redirects out to GHL.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can view their current plan, credits, and billing status on the Billing page within 2 seconds of navigation.
- **SC-002**: All billing state changes (Stripe events, monthly reset, top-up) are reflected in the frontend within 3 seconds of the backend event completing, without manual page refresh.
- **SC-003**: 100% of credit-consuming actions are validated against the user's current plan entitlements at deduction time — no feature can be consumed without server-side plan verification.
- **SC-004**: Users can complete a top-up purchase (select pack through to seeing updated credits) in under 2 minutes.
- **SC-005**: Trial users with 0 credits see the trial-ended banner on 100% of app pages and are blocked from 100% of generation actions.
- **SC-006**: Plan downgrade feature enforcement takes effect within 5 seconds of the billing state change — no stale feature access after downgrade.
- **SC-007**: Low-credits banner appears for 100% of users whose credits drop below the 20% threshold, with no false positives.
- **SC-008**: 100% of Stripe webhook events are signature-verified before processing — no unverified webhook can modify billing state.
- **SC-009**: 100% of successful Stripe webhooks for the 6 routable event_types result in a GHL sync attempt; top-up refunds and partial refunds are documented skips per FR-032 (b)/(c).
- **SC-010**: Users can complete Stripe-hosted payment method updates or cancellations in a single click from the Billing page (no intermediate loading screens, direct portal redirect).
- **SC-011**: 100% of new Firebase Auth accounts created for paid GHL-funnel users (pending_plans document exists) are correctly linked to their existing plan data on first sign-in — no paid user sees the mandatory billing modal instead of the app.
- **SC-012**: The login screen contains zero Google sign-in references, buttons, provider imports, or error messages.
- **SC-013**: 0% of unpaid users have their Firebase Auth accounts deleted — all unpaid users retain their account and see the mandatory billing modal.
- **SC-014**: The welcome toast is shown exactly once per new account. It never appears on subsequent sign-ins.
- **SC-015**: 100% of Stripe webhook deliveries produce a structured log entry with `event.id`, `event.type`, processing result, and any error classification code.
- **SC-016**: 0% of Paddle code paths remain after the migration PR merges. Verified by code audit and grep for `paddle`/`Paddle` returning zero hits in `functions/src/` and `src/` (excluding historical specs and migration documentation).
- **SC-017**: Stripe Tax is enabled on 100% of Stripe Checkout Sessions and 100% of Stripe Customer Portal sessions — no transaction completes without automatic tax calculation.
- **SC-018**: Mandatory billing modal CTA invokes in-app Stripe Checkout Session redirect on 100% of authenticated user click-throughs — 0% of authenticated users in the modal are redirected to the external GHL funnel form.
- **SC-019**: 100% of plan and top-up prices are denominated in USD at launch. The pricing table contains zero non-USD currency selectors or symbols. Verified by code audit.

## Clarifications

### Session 2026-05-05

- Q: Stripe Checkout Sessions vs Payment Element? → A: Stripe Checkout Sessions (hosted). Lowest PCI surface, mirrors the prior overlay UX users were getting.
- Q: Stripe Customer Portal vs custom portal UI? → A: Stripe Customer Portal. Already configured in matrix 8.A.6 with cancel + plan switch + payment method update + return to `/billing`.
- Q: Which Stripe events to subscribe to? → A: The 5 events from matrix 8.A.5: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`. `checkout.session.completed` does double duty for subscriptions and top-ups (branched on `mode` and `metadata.isTopUp`).
- Q: Idempotency strategy under Stripe? → A: Dedup by `event.id` in a new Firestore collection `stripe_events/{eventId}`, atomic-create pattern identical to the prior `paddle_events/{eventId}`.
- Q: How does `pending_plans/{email}` dual-write work under Stripe (no overlay checkout)? → A: Logged-in user → callable sets `client_reference_id=auth.uid` and `customer_email=auth.email`. Anonymous GHL-funnel buyer → no `client_reference_id`. The webhook reads `client_reference_id`; if present → write `users/{uid}`; if absent → write `pending_plans/{customer_details.email.toLowerCase()}`.
- Q: Can Stripe Checkout's `success_url` carry firebaseUid back, and how do email-first paid users still get matched? → A: Webhook is the source of truth; `success_url` is cosmetic only (`https://app.proadsai.com/billing?paid=1`). Email-first matching uses `customer_details.email` → lowercased → `pending_plans/{email}` write. Existing `onAuthStateChanged` consume logic handles the rest.
- Q: Tax handling — Stripe Tax vs none? → A: Stripe Tax enabled at launch (`automatic_tax: { enabled: true }`). Merchant handles registration/filing in jurisdictions where required.
- Q: Trial implementation — Stripe trial period vs custom credit-based? → A: Stripe trial with card capture (`subscription_data.trial_period_days: 7`). Auto-converts to paid, integrates cleanly with `customer.subscription.updated` lifecycle.
- Q: Top-up implementation — Checkout one-time mode vs PaymentIntent? → A: Stripe Checkout Session in `mode='payment'` with `metadata: { firebaseUid, isTopUp: 'true', creditAmount }`. Same hosted UX as subscription, branched in the webhook handler.
- Q: What to do with existing Paddle code — comment, delete, or gradual swap? → A: Delete wholesale in a single PR. Pre-launch with zero paying users; gradual swap is overkill, comment-out leaves dead code rot.
- Q: Stripe API version pin? → A: Pin `apiVersion: '2025-01-27.acacia'` (or current at spec write time) explicitly in the SDK constructor and Stripe Dashboard. Document upgrades.
- Q: Annual plan variants? → A: Annual variants from launch. Pricing table has Monthly/Annual toggle. 6 price IDs (3 monthly + 3 annual). Webhook reads `price.recurring.interval` for `billingType`.

### Session 2026-05-05 (second pass — Q1 + Q2 refinement)

- Q: For the mandatory billing modal (authenticated user with `plan='none'`), does the CTA go to GHL checkout form or in-app Stripe Checkout? → A: In-app Stripe Checkout. Authenticated users never get bounced out to GHL. GHL is reserved for external acquisition (visitors with no Firebase Auth account yet).
- Q: GHL Stripe integration architecture? → A: GHL hosts its own checkout form and uses GHL's native Stripe integration to create the Stripe customer + subscription via Stripe API. Stripe webhooks fire to our endpoint. GHL does not pass `client_reference_id`, so all GHL-originated webhooks route to `pending_plans/{customer_details.email.toLowerCase()}`.

### Session 2026-05-05 (third pass — clarify)

- Q: Should `customer.subscription.created` be added to the webhook event list to handle GHL-funnel buyers (in case GHL's Stripe integration uses the Subscriptions API directly rather than Checkout Sessions)? → A: Yes — subscribe to `customer.subscription.created` in addition to the original 5 events. Treat it as a fallback dual-write trigger so the path is decoupled from GHL's internal Stripe API choice. Application-level dedup ensures the same subscription is not written twice when both `checkout.session.completed` and `customer.subscription.created` fire for the same in-app purchase.
- Q: Currency policy at launch — single currency, multi-currency, or Adaptive Pricing? → A: USD only. Single global price per plan (Starter $29, Pro $79, Scale $197 monthly; annual variants 2 months free). 9 price IDs total (3 monthly subscription + 3 annual subscription + 3 one-time top-up). Stripe Tax adds VAT/GST on top of USD per customer location. Multi-currency is deferred and can be added later via Stripe Adaptive Pricing without code changes.
- Q: Customer reuse on in-app upgrades — pass `customer=stripeCustomerId`, pass `customer_email` only, or always create a new Customer? → A: Reuse `stripeCustomerId`. The `createStripeCheckoutSession` and `createStripeTopUpSession` callables MUST pass `customer: users/{uid}.stripeCustomerId` if it exists on the user document, and fall back to `customer_email: auth.email` otherwise. One Stripe Customer record per user; history (invoices, refunds, prior subscriptions) preserved across resubscriptions and top-ups.
- Q: Refund handling — subscribe to `charge.refunded` or handle manually? → A: Subscribe to `charge.refunded`. Full refund of a subscription charge cancels the user's subscription via Stripe API (which fires `customer.subscription.deleted` and runs the existing cancellation flow), sets plan='none', and sends a `refund_processed` event to GHL. Partial refunds or top-up refunds log only — no plan change.
- Q: Portal URL handling in GHL sync payloads (FR-001 says not stored, FR-018 says it's in the payload — how reconciled)? → A: Generate transiently only for events where GHL needs the URL — `invoice.payment_failed` and `charge.refunded` — by calling `stripe.billingPortal.sessions.create({ customer })` inside the failed-sync helper just before the POST. Success-sync events (subscription created/updated/deleted, payment succeeded, top-up) omit `portalUrl` from the payload entirely. The user-facing portal URL on the Billing page is generated by the existing `createStripePortalSession` callable on demand. No long-lived portal URL is ever stored.

## Assumptions

- Stripe is the sole billing provider from day one. No existing Paddle subscribers need migration; the product is pre-launch with zero paying users at the time of this migration.
- Stripe handles payment processing, tax calculation/collection, dunning (Smart Retries), proration, hosted checkout, and Customer Portal. Tax filing/registration is the merchant's responsibility (Stripe is not Merchant of Record).
- GHL remains the CRM and marketing automation engine. The GHL marketing funnel uses GHL's native Stripe integration to process payments. Firebase POSTs billing events to GHL inbound webhook URLs on every successful Stripe webhook processing. Sync is best-effort.
- The existing plan definitions in `entitlements.ts` and credit costs in the `COSTS` map remain authoritative. Only the Stripe price IDs and management fields change.
- Team billing follows the shared-pool model: team members draw from the owner's credits; only the owner can manage billing.
- The `pending_plans/{email.toLowerCase()}` collection is retained. Behavior is unchanged from Phase 8 — only field names update from Paddle to Stripe (`stripeCustomerId`, `stripeSubscriptionId`).
- Firestore email lookups for post-payment account linking remain case-insensitive on both write and read paths.
- Unpaid users (Firebase Auth account, no pending plan, no team invite) MUST NOT have their accounts deleted. The mandatory billing modal pattern is preserved exactly.
- The mandatory billing modal is dismiss-proof and closes only when the listener detects a plan transition.
- Google sign-in remains permanently removed (no backwards compatibility — there are no existing Google users).
- A grace period of 2 days applies after a payment failure before the subscription is at risk of full cancellation. Stripe Smart Retries operates within this window.
- All billing-related UI (banners, dialogs, toasts, login, create account, welcome toast, mandatory billing modal) supports Arabic (RTL) and English from launch.
- Stripe Tax is enabled at launch. The merchant team is aware they must register for VAT/GST/sales tax in jurisdictions where Stripe collects it.
- The Stripe API version is pinned (e.g., `'2025-01-27.acacia'`); upgrades are deliberate, tested, and documented.
- The migration is delivered as a single PR that adds Stripe code and removes all Paddle code in the same change set. No feature flags, no dual-running period.
- The Stripe Customer Portal is configured in the Stripe Dashboard with cancellation, plan switching, payment method update, and invoice history enabled. Return URL is set to `https://app.proadsai.com/billing`.
- The GHL marketing funnel's checkout form is configured with GHL's native Stripe integration, using the same Stripe account as the in-app Checkout Sessions, so customer/subscription records are unified.
