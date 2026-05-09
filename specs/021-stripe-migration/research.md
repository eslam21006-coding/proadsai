# Research: Stripe Migration — Replace Paddle with Stripe as Billing Provider

**Branch**: `021-stripe-migration` | **Date**: 2026-05-05

All decisions in this document are derived from the 19 clarifications captured in the spec across three sessions on 2026-05-05. Each entry restates the decision in operational terms and lists the rejected alternatives so future readers understand why each path is the way it is.

## R-001: Stripe Node SDK + Stripe-Hosted Checkout & Portal

**Decision**: Use the official `stripe` Node SDK on the backend for webhook signature verification (`stripe.webhooks.constructEvent`), Checkout Session creation (`stripe.checkout.sessions.create`), Customer Portal session creation (`stripe.billingPortal.sessions.create`), and programmatic subscription cancellation on full refund (`stripe.subscriptions.cancel`). The frontend uses redirect-to-hosted-Checkout and redirect-to-hosted-Portal flows — no `@stripe/stripe-js` runtime dependency for these flows. Pin `apiVersion: '2025-01-27.acacia'` in the SDK constructor and align the Stripe Dashboard "Default API version" to the same value.

**Rationale**: Lowest PCI surface, lowest implementation complexity, mirrors the prior Paddle.js overlay UX users were getting (full-screen hosted checkout). Frontend redirect avoids a Stripe.js script tag and the global `Stripe()` object initialization.

**Alternatives Considered**:
- Stripe Payment Element embedded in-app: Rejected — adds PCI surface and custom UI burden for marginal UX gain.
- Auto-tracking the latest Stripe API version: Rejected — silent payload drift would break webhook handlers without warning.

## R-002: Stripe Customer Portal vs Custom Portal Layer

**Decision**: Generate Stripe Customer Portal sessions on demand via the `createStripePortalSession` callable. The user-facing "Manage Subscription" button calls this callable and redirects the user to the resulting URL in a new tab. Cancellation deep-links use `flow_data: { type: 'subscription_cancel', subscription_cancel: { subscription: stripeSubscriptionId } }`. Payment-method updates use `flow_data: { type: 'payment_method_update' }`. Default flow (no `flow_data`) lands on the portal home where the user can view invoices, switch plans, and update everything.

**Rationale**: Matrix 8.A.6 already configured the portal with cancel + plan switch + payment method update + return URL. Building a custom portal adds latency (one Stripe API call per surface) and code surface without benefit. Portal sessions are short-lived; on-demand generation keeps URLs always-fresh.

**Alternatives Considered**:
- Build a custom in-app portal: Rejected — reimplements Stripe-hosted functionality.
- Cache portal URL on the user document for ~23h: Rejected — risk of returning expired URLs to users.

## R-003: Webhook Event Coverage (7 events including dual-event fallback)

**Decision**: Subscribe to seven Stripe events:

| Event | Purpose |
|---|---|
| `checkout.session.completed` | Primary entry for in-app subscriptions and top-ups; branched on `mode` (`subscription` vs `payment`) and `metadata.isTopUp` |
| `customer.subscription.created` | Fallback for paths that bypass Checkout Sessions (notably GHL's native Stripe integration if it uses `customer.subscriptions.create` directly); idempotent against `checkout.session.completed` |
| `customer.subscription.updated` | Plan changes, payment method updates, trial → active conversion, scheduled cancellation |
| `customer.subscription.deleted` | Final cancellation (period end OR programmatic on refund) |
| `invoice.payment_succeeded` | Renewal — distinguish via `billing_reason: 'subscription_cycle'` vs `'subscription_create'` to skip the initial-invoice case (creation handled by `checkout.session.completed`) |
| `invoice.payment_failed` | Past_due → dunning |
| `charge.refunded` | Full subscription refund cancels via `stripe.subscriptions.cancel`; full top-up refund deducts credits; partial refund logs only |

Application-level dedup: when `customer.subscription.created` fires for a subscription whose `stripeSubscriptionId` is already on `users/{uid}`, the handler exits without re-applying state.

**Rationale**: The 5 events from LAUNCH_MATRIX 8.A.5 cover the in-app path. `customer.subscription.created` decouples the spec from GHL's internal Stripe API choice — if GHL's integration calls `customer.subscriptions.create` directly rather than `checkout.sessions.create`, the dual-write still fires. `charge.refunded` prevents silent post-refund continued use (a real reliability hazard).

**Alternatives Considered**:
- Stick to 5 events, require GHL to use Checkout Sessions only: Rejected — fragile, GHL config can drift.
- Subscribe ONLY to `customer.subscription.created` for all paths: Rejected — loses the natural `mode='subscription'` vs `mode='payment'` branch on `checkout.session.completed` for top-ups.
- Skip `charge.refunded`, handle refunds manually: Rejected — leaves a gap where the user keeps their plan until support manually cancels.

## R-004: Webhook Idempotency via Firestore Document Creation

**Decision**: Store processed Stripe event IDs in `stripe_events/{eventId}` with fields `eventType`, `processedAt`, `result`. Before processing any webhook, attempt to create the document atomically. On collision (already exists), return 200 OK without re-processing.

**Rationale**: Firestore atomic-create is reliable, doesn't require external infrastructure, and matches the prior `paddle_events/{eventId}` pattern verbatim. Stripe delivers webhook retries; dedup prevents double-crediting on top-ups, double-cancellation on refunds, and duplicate state transitions.

**Alternatives Considered**:
- In-memory dedup: Rejected — doesn't survive cold starts.
- Redis: Rejected — adds infrastructure.
- Dedup by `(object_id, event_type)`: Rejected — Stripe explicitly recommends `event.id` as the dedup key and provides it on every retry of the same event.

## R-005: Dual-Event Application-Level Dedup on `stripeSubscriptionId`

**Decision**: When both `checkout.session.completed` and `customer.subscription.created` fire for the same in-app subscription purchase (the common case for Path B), the handler that arrives second checks `users/{uid}.stripeSubscriptionId === event.data.object.id`. If it matches, the handler exits without writing. The user identifier comes from `client_reference_id` (Checkout Session) or `subscription.metadata.firebaseUid` (Subscription) — the in-app callable sets both.

**Rationale**: Event-ID-level dedup (R-004) only catches literal retries of the *same* event. Dual-event dedup catches *different* events for the same logical purchase. Without it, the second event would write a no-op, possibly corrupting derived fields like `nextResetDate`.

**Alternatives Considered**:
- Skip the second event entirely (don't subscribe to `customer.subscription.created` for in-app paths): Rejected — we need the event for the GHL fallback path; we cannot cherry-pick which webhook fires.
- Order-dependent handling (assume `checkout.session.completed` always arrives first): Rejected — Stripe makes no ordering guarantee, network reordering is real.

## R-006: Dual-Write Pattern for `pending_plans`

**Decision**: The `checkout.session.completed` handler inspects `client_reference_id`. If present (in-app user), write to `users/{uid}` and `writeBillingState(uid)`. If absent (GHL funnel buyer paid before signup), write to `pending_plans/{customer_details.email.toLowerCase()}` using the Stripe Customer's email. The `customer.subscription.created` handler does the same with `subscription.metadata.firebaseUid` and `customer.email` instead.

**Rationale**: Preserves the existing `pending_plans` consume flow on first login (matches `App.tsx` `onAuthStateChanged` logic from Phase 8). Enables seamless onboarding: buy on GHL → create app account later → pending plan auto-consumed.

**Alternatives Considered**:
- Always require `firebaseUid`: Rejected — GHL funnel buyers don't have one yet.
- Force GHL to redirect to an in-app pricing page that then creates the Checkout Session: Rejected — adds funnel friction; the user just paid and now needs to make an account first.

## R-007: Last-Write-Wins for Duplicate `pending_plans`

**Decision**: When a Stripe webhook writes a `pending_plans/{email}` document that already exists, overwrite (last-write-wins). Stripe event-ID dedup prevents the literal same event from being applied twice; this rule handles the case of two different events for the same email (e.g., user paid twice).

**Rationale**: Simpler than merge logic. Matches Stripe's state model — the most recent subscription is authoritative. Both transactions remain in Stripe's billing history for support refund review.

**Alternatives Considered**:
- Reject on collision (409): Rejected — blocks the user, requires manual support intervention.
- Merge / preserve higher tier: Rejected — complexity without clear user benefit.

## R-008: GHL Sync via Per-Event Routing to 6 Inbound Webhook URLs

**Decision**: The `notifyGHL(identifier, eventType, payloadFields)` helper accepts either a Firebase `uid` or a raw `email` string and a normalized `event_type` from a closed set of 6 values. It selects the destination URL from a per-event-type map (`URL_BY_EVENT`) and POSTs a single canonical JSON payload — see `contracts/ghl-inbound-payload.md` for the full schema and routing table. Each of the 6 destination URLs is a Firebase Cloud Functions secret: `GHL_TRIAL_STARTED_URL`, `GHL_PAYMENT_RECEIVED_URL`, `GHL_RECOVERED_URL`, `GHL_OVERDUE_FAILED_URL`, `GHL_CANCELLED_URL`, `GHL_TOPUP_URL`.

For uid identifiers, the helper reads `users/{uid}` for `email`, `displayName`, and `stripeCustomerId`. It splits `displayName` on the first whitespace into `first_name` and `last_name`; if there is no whitespace, `first_name` is the full string and `last_name` is `null`; if `displayName` itself is null, both are `null`. For email identifiers, the email is sent directly (used for `pending_plans` users who haven't signed up yet) and `first_name` / `last_name` are both `null`. Date fields are sent in both ISO 8601 (UTC, `Z`-suffixed) and human-readable formats. The `_human` variants are formatted in `en-US` locale via `Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' })` to produce strings like `May 21, 2026`. Future Arabic localization (deferred) will add `_human_ar` variants. `portal_url` is generated transiently for every event by calling `stripe.billingPortal.sessions.create({ customer: stripeCustomerId, return_url })` just before the POST. If portal generation fails, log `portal_session_generation_failed` and POST with `portal_url: null` (the field is always present, never omitted — see the stable-column rule in §2 of the contract). If the POST itself fails, log `ghl_sync_failed` and don't throw — fire-and-forget semantics are preserved.

**Rationale**: The prior 2-URL design required each GHL workflow to branch internally on a single `event` discriminator field, which made the workflow editor hard to maintain. Splitting the 6 events to 6 dedicated GHL workflows (each with its own inbound URL) eliminates the branching and gives the merchant team one workflow per business event. Generating `portal_url` for every event (rather than only failed-syncs) is a deliberate change from the prior design — GHL email templates can now embed a working "Manage Subscription" link in any of the 6 emails without bespoke logic.

**Alternatives Considered**:
- Stay on the 2-URL design: Rejected — workflow branching is brittle when each branch has its own automation tree.
- Generate one URL per Firebase deploy and send all events there with branching in Cloud Functions: Rejected — the merchant team needs the per-event GHL workflow editor, not Cloud Functions branching.
- Skip `portal_url` on success events to save Stripe API quota: Rejected — the cost (~6 portal-session calls per paying customer per year) is negligible and the operational simplicity in GHL is worth it.

## R-009: Customer Reuse on In-App Upgrades and Top-Ups

**Decision**: The `createStripeCheckoutSession` and `createStripeTopUpSession` callables MUST set `customer: users/{uid}.stripeCustomerId` if the field exists on the user document; otherwise fall back to `customer_email: auth.email`. The webhook handler also guards: when `users/{uid}` already has `stripeCustomerId`, never overwrite it with a different value (would indicate a Stripe-side bug or impersonation).

**Rationale**: One Stripe Customer record per user. Preserves invoice/refund history, accurate Customer Lifetime Value, simpler tax record reconciliation. A previously-cancelled user resubscribing reuses the same Customer (their `stripeCustomerId` survives cancellation; only the subscription/plan/credit fields are cleared).

**Alternatives Considered**:
- Always pass `customer_email` only: Rejected — Stripe's email-based matching is best-effort and can produce duplicate Customers.
- Always create a new Customer per Checkout Session (`customer_creation: 'always'`): Rejected — fragments user history.

## R-010: Mandatory Billing Modal CTA Stays In-App

**Decision**: When an authenticated user with `billingState.plan === 'none'` is shown the mandatory billing modal and clicks a plan, the click handler invokes `createStripeCheckoutSession({ priceId })` and redirects to the resulting Checkout Session URL. The user is **never** redirected back out to the GHL funnel form. The dismiss-proof modal pattern (no close button, ignores outside clicks and escape key) is preserved from Phase 8 and auto-closes when the listener detects `billingState.plan` transition from `'none'` to a real plan.

**Rationale**: Authenticated users have a `firebaseUid` and an `email` — passing both to Stripe via `client_reference_id` and `customer_email` keeps the linkage explicit and avoids the email-mismatch failure mode. Bouncing them out to GHL would lose auth state, force the user to re-enter their email, and create a risk of email-mismatch between Stripe and Firebase Auth. GHL is reserved for external acquisition where no Firebase Auth account exists yet.

**Alternatives Considered**:
- All initial subscriptions go through GHL: Rejected — broken UX for authenticated users; risk of email mismatch.
- Modal CTA opens GHL form in a new tab: Rejected — same email-mismatch risk; bad UX.

## R-011: GHL Funnel Uses GHL's Native Stripe Integration

**Decision**: The external GHL marketing funnel uses GHL's native Stripe integration to create Stripe customers and subscriptions on behalf of new buyers. The actual API path GHL uses (Checkout Sessions vs Subscriptions API) is opaque to us — both paths are handled by our webhook (`checkout.session.completed` for the former, `customer.subscription.created` for the latter; see R-003). GHL does not pass `client_reference_id` or `subscription.metadata.firebaseUid`, so all GHL-originated webhooks route to `pending_plans/{email}`.

**Rationale**: We don't control GHL's internal Stripe usage. The only contract we need is that Stripe webhooks fire to our endpoint (configured in Stripe Dashboard → Developers → Webhooks). GHL's Stripe integration is configured to use the same Stripe account, so customer/subscription records are unified.

**Alternatives Considered**:
- Require GHL to use Checkout Sessions specifically: Rejected — fragile, GHL config can drift.
- Build a custom GHL→app bridge that creates the Checkout Session ourselves: Rejected — defeats the purpose of using GHL's funnel.

## R-012: Stripe Tax Enabled at Launch — Merchant Handles Filing

**Decision**: Set `automatic_tax: { enabled: true }` on every Stripe Checkout Session and on Stripe Customer Portal configuration. Stripe Tax calculates VAT/GST/sales tax per customer location and adds it on top of the USD price. Stripe collects the tax as part of the charge. **The merchant remains responsible for tax registration in jurisdictions where Stripe collects, and for filing returns** — Stripe is **not** Merchant of Record.

**Rationale**: Pre-launch is the cheapest moment to enable tax — retro-fitting tax to existing subscribers is painful. Stripe Tax handles the calculation accurately per location. The merchant team is informed (per spec Assumptions and FR-027) that this means tax registration/filing responsibility shifts to them (vs the prior Paddle MoR model).

**Alternatives Considered**:
- No Stripe Tax at launch: Rejected — legally risky for Saudi/UAE/EU scale.
- Use Lemon Squeezy / Paddle Billing as MoR layer on top of Stripe: Rejected — defeats the purpose of moving to Stripe.

## R-013: Trial via Stripe `trial_period_days: 7` with Card Capture

**Decision**: Set `subscription_data: { trial_period_days: 7 }` on subscription Checkout Sessions. The customer enters their card on Stripe-hosted Checkout, gets 7 days free, and is automatically charged on day 8 (Stripe sends `customer.subscription.updated` with `status: 'active'`). If the trial expires without card, Stripe sends `customer.subscription.deleted` and the existing trial-ended banner fires.

**Rationale**: Auto-converts to paid, no manual cron logic, integrates cleanly with the `customer.subscription.updated` lifecycle. Matches the existing welcome-toast copy ("Welcome! Your 7-day trial has started"). Card capture is the standard SaaS trial pattern and reduces fraud (botted free trials).

**Alternatives Considered**:
- Trial without card capture (`payment_method_collection: 'if_required'`): Rejected — higher signup friction is acceptable; cardless trials drive abuse.
- Custom credit-based trial (give 30 free credits, no Stripe involvement until paid): Rejected — bifurcates the entitlement model and adds custom logic.

## R-014: Top-Up via Stripe Checkout Session `mode='payment'`

**Decision**: Top-up uses a Stripe Checkout Session in `mode='payment'` with `metadata: { firebaseUid, isTopUp: 'true', creditAmount }`. Same hosted Checkout UX as subscription. The webhook handler branches on `mode` and `metadata.isTopUp` to route the payment to atomic credit-add via Firestore transaction.

**Rationale**: Reuses the same hosted Checkout flow as subscription (one less integration to test). Avoids the lower-level PaymentIntent + custom UI complexity.

**Alternatives Considered**:
- PaymentIntent + Stripe Elements: Rejected — adds custom UI burden, more integration surface.

## R-015: Refund Handling — Subscribe to `charge.refunded` with Three Branches

**Decision**: The `charge.refunded` handler distinguishes three cases:

1. **Full refund of a subscription invoice** (`amount_refunded === amount` AND the charge's invoice has `subscription` set): Programmatically cancel via `stripe.subscriptions.cancel(subscription)`. Stripe then fires `customer.subscription.deleted`, which runs the existing cancel flow (`plan='none'`, `credits=0`, `billingStatus='cancelled'`) and emits a single GHL POST routed as `event_type: 'subscription.cancelled'` to `GHL_CANCELLED_URL` per `contracts/ghl-inbound-payload.md` §3 — no separate refund-event POST is emitted. The handler also writes `cancellation_logs/{uid}_{ts}` with `reason: 'refund'` BEFORE invoking `stripe.subscriptions.cancel(...)` so refund-driven cancellations appear in cancellation analytics alongside user-initiated ones, and so the subsequent GHL POST can read `cancellation_reason` from the log.

2. **Full refund of a top-up transaction** (`amount_refunded === amount` AND the charge's payment intent's session has `metadata.isTopUp === 'true'`): Atomically deduct the refunded `metadata.creditAmount` from `users/{uid}.credits` (clamp at zero) via Firestore transaction and write `refund_logs/{uid}_{ts}` (a dedicated collection separate from `cancellation_logs`). **No GHL POST is emitted** — top-up refunds are silent at the CRM layer.

3. **Partial refund** (`amount_refunded < amount`): Log only with classification code `refund_processed`, source `partial`, and write `result: 'partial_refund_logged'` to `stripe_events/{eventId}`. No plan or credit change. **No GHL POST.** Manual support follow-up if the merchant team chooses.

All three branches emit a structured log entry with refund amount, charge ID, and source.

**Rationale**: Prevents silent post-refund continued use of the plan or credits. Programmatic cancellation via Stripe API (vs direct Firestore write) keeps Stripe and Firebase in sync — the resulting `customer.subscription.deleted` event runs the same logic as a normal cancellation.

**Alternatives Considered**:
- Don't subscribe to `charge.refunded`, handle refunds manually via Stripe Dashboard: Rejected — leaves a gap where the user keeps their plan until manual intervention.
- Subscribe to `charge.dispute.created` AND `charge.refunded` (defensive): Deferred — adds a new `disputed` lifecycle state; revisit post-launch if disputes become frequent.

## R-016: USD-Only Currency at Launch

**Decision**: All 9 Stripe price IDs (3 monthly subscription + 3 annual subscription + 3 one-time top-up) are denominated in USD. The pricing table UI shows USD prices with no currency selector. Customers in non-USD countries pay USD on their card and their issuing bank handles FX. Stripe Tax adds VAT/GST in the customer's local currency representation, but the underlying charge is USD.

**Rationale**: Single set of price IDs, simplest reconciliation, no localization-of-prices burden. Multi-currency can be added later via Stripe's "Adaptive Pricing" feature without code changes (just a Stripe Dashboard toggle and price ID work).

**Alternatives Considered**:
- USD + AED + SAR price ID sets at launch (3× the price IDs): Rejected — premature optimization; multi-currency adds significant tax/refund complexity.
- Stripe Adaptive Pricing at launch: Deferred — adds a marginal Stripe fee; revisit post-launch.

## R-017: Annual Plan Variants from Launch

**Decision**: Each plan tier has two Stripe price IDs: monthly and annual. Annual is "2 months free" pricing (Starter $290/yr, Pro $790/yr, Scale $1,970/yr). The pricing table has a Monthly/Annual toggle; CTA buttons pass the matching price ID to `createStripeCheckoutSession`. The webhook resolves `billingType` from `subscription.items.data[0].price.recurring.interval` (`'month'` → `'monthly'`, `'year'` → `'annual'`).

**Rationale**: Annual variants are common SaaS practice and improve cash flow + retention. Adding them at launch is one extra price ID per plan and a UI toggle — cheaper than retro-fitting later.

**Alternatives Considered**:
- Monthly only at launch, add annual later: Rejected — minor delta in implementation cost, real revenue lift.

## R-018: Wholesale Paddle Code Deletion in a Single PR

**Decision**: The Phase 21 PR adds Stripe code and removes all Paddle code in the same change set. No feature flags, no dual-running period. Files deleted: `functions/src/paddle/` (4 files), `functions/src/billing/paddleWebhook.ts`, `functions/src/billing/__tests__/paddleWebhook.test.ts`, the 9 Paddle Cloud Functions in `functions/src/index.ts` (paddleGetSub, paddleCancelSub, paddleReactivateSub, paddleChangePlanFn, paddleTopupCheckout, paddlePortalSession, createPaddleCheckout, createPaddleTopUp, paddleWebhook), Paddle.js loader from `index.html`, Paddle env secrets in Cloud Functions config, Paddle test fixtures. SC-016 enforces this by audit.

**Rationale**: Pre-launch with zero paying users — gradual swap is overkill, comment-out leaves dead code rot. A single atomic PR is cleanest and reviewable. If something goes wrong, the PR can be reverted; that's safer than a half-cut state.

**Alternatives Considered**:
- Comment-out Paddle code: Rejected — encourages future "we'll clean it up later" rot.
- Feature-flag swap with both engines live: Rejected — necessary on production systems with users; overkill pre-launch.

## R-019: Stripe API Version Pin

**Decision**: Pin `apiVersion: '2025-01-27.acacia'` (or the latest stable at the time the migration PR is opened) in the `Stripe()` constructor on the backend. Set the same version in Stripe Dashboard → Developers → API version. Document the choice in `functions/src/stripe/stripeClient.ts` with a comment block listing the date and the upgrade procedure.

**Rationale**: Stripe API versions can introduce payload changes that break webhook handlers. Pinning isolates us from silent drift. Upgrades are deliberate, tested, and one-PR-at-a-time.

**Alternatives Considered**:
- Auto-track latest: Rejected — silent payload drift.
- Pin only via SDK constructor (not Dashboard): Rejected — Stripe Dashboard's "Default API version" affects what version webhooks are sent in unless overridden.

---

## Cross-Reference Index

| Spec FR | Research Decision |
|---|---|
| FR-001, FR-017 | R-002 (Portal) |
| FR-002 | R-005 (dual-event dedup), R-006 (dual-write) |
| FR-014 | R-003 (event coverage) |
| FR-015 | R-001 (signature verification) |
| FR-016 | R-004 (idempotency) |
| FR-018 | R-008 (per-event GHL routing — see contracts/ghl-inbound-payload.md), R-002 (transient portal) |
| FR-019 | R-009 (customer reuse), R-013 (trial), R-014 (top-up) |
| FR-024a | R-010 (modal CTA) |
| FR-027 | R-012 (Stripe Tax) |
| FR-028 | R-017 (annual variants) |
| FR-029 | R-019 (API version pin) |
| FR-030 | R-018 (Paddle deletion) |
| FR-031 | R-016 (USD-only) |
| FR-032 | R-015 (refund handling) |
