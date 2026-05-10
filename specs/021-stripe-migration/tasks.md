---
description: "Phase 21 — Stripe Migration tasks"
---

# Tasks: Stripe Migration — Replace Paddle with Stripe as Billing Provider

**Input**: Design documents from `/specs/021-stripe-migration/`
**Prerequisites**: plan.md (✓), spec.md (✓), research.md (✓), data-model.md (✓), contracts/ (✓), quickstart.md (✓)

**Tests**: Backend webhook + callable tests are MANDATORY for this migration (FR-002, FR-014, FR-018, FR-032 all carry explicit acceptance scenarios; Constitution Principle IX requires evidence). Frontend tests follow existing project conventions (no new framework adoption).

**Organization**: Tasks are grouped first by setup/foundation, then by user story priority. Refund handling (FR-032 / R-015) is folded into the US2 webhook phase because it is a webhook-event handler. Paddle wholesale deletion (FR-030 / R-018) is its own dedicated phase late in the sequence so it can run after Stripe parity is verified.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US14)
- File paths are absolute from repository root

## Path Conventions

Web application:
- **Backend**: `functions/src/`
- **Frontend**: `src/`

---

## Phase 1: Setup (Stripe Dashboard + GHL + Cloud Functions Secrets)

**Purpose**: Owner-driven, non-code setup that blocks every code task. All steps detailed in `quickstart.md` sections A, B, C.

- [x] T001 Activate Stripe account, switch to Test mode, set Default API version to `2025-01-27.acacia` in Stripe Dashboard → Developers → API version (quickstart A.1)
- [x] T002 [P] Create 3 subscription products with monthly + annual variants in Stripe Dashboard → Products: Starter $29/$290, Pro $79/$790, Scale $197/$1,970 — all USD; record 6 price IDs (quickstart A.2)
- [x] T003 [P] Create 1 one-time "Credit Top-Up" product with 3 prices in Stripe Dashboard → Products: 100/$9, 300/$24, 800/$59 — all USD; record 3 price IDs (quickstart A.3)
- [x] T004 [P] Copy Stripe Test mode Secret key (`sk_test_xxx`) and Publishable key (`pk_test_xxx`) from Stripe Dashboard → Developers → API keys (quickstart A.4)
- [x] T005 Add Stripe webhook endpoint at `https://europe-west1-proadsai-saas.cloudfunctions.net/stripeWebhook` subscribing to 7 events (`checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`, `charge.refunded`); copy signing secret; pin webhook API version (quickstart A.5)
- [x] T006 [P] Configure Stripe Customer Portal in Stripe Dashboard → Settings → Billing → Customer portal: enable cancellation, plan switching across all 6 sub price IDs, payment method updates, invoice history; set return URL to `https://app.proadsai.com/billing`; upload branding; enable EN + AR localization (quickstart A.6)
- [x] T007 [P] Enable Stripe Tax in Stripe Dashboard → Settings → Tax; record tax registrations for launch jurisdictions (Saudi Arabia VAT, UAE VAT, EU VAT MOSS as applicable); confirm merchant team owns filing (quickstart A.7)
- [x] T008 [P] Enable Stripe Smart Retries (3 retries / 14 days) and subscriber emails in Stripe Dashboard → Settings → Billing → Subscriptions and emails (quickstart A.8)
- [x] T009 [P] Connect GHL to the same Stripe account in GHL → Sub-account Settings → Integrations → Stripe; verify with $1 test product round-trip (quickstart B.1)
- [x] T010 [P] Audit GHL marketing funnel CTAs to confirm they route to GHL-hosted checkout form wired to the Stripe price IDs from T002 (quickstart B.2)
- [x] T011 [P] Create GHL "Stripe — Trial Started" workflow with inbound webhook trigger; record URL as `GHL_TRIAL_STARTED_URL`; paste payload schema from `contracts/ghl-inbound-payload.md` §1 as Mapping Reference; configure trial-started automation (welcome email + tag) (quickstart B.3)
- [x] T011a [P] Create GHL "Stripe — Payment Received" workflow with inbound webhook trigger; record URL as `GHL_PAYMENT_RECEIVED_URL`; paste payload schema as Mapping Reference; configure paid-subscription automation (welcome + plan tag) (quickstart B.3)
- [x] T011b [P] Create GHL "Stripe — Payment Recovered" workflow with inbound webhook trigger; record URL as `GHL_RECOVERED_URL`; paste payload schema as Mapping Reference; configure recovery automation (clear past_due tag, send "thanks for catching up" email) (quickstart B.3)
- [x] T012 [P] Create GHL "Stripe — Payment Overdue / Failed" workflow with inbound webhook trigger; record URL as `GHL_OVERDUE_FAILED_URL`; paste payload schema as Mapping Reference; configure dunning automation referencing `{{portal_url}}` with fallback per quickstart B.4 (quickstart B.3)
- [x] T012a [P] Create GHL "Stripe — Subscription Cancelled" workflow with inbound webhook trigger; record URL as `GHL_CANCELLED_URL`; paste payload schema as Mapping Reference; configure win-back automation (referencing `cancel_at` and `cancellation_reason` if present) (quickstart B.3)
- [x] T012b [P] Create GHL "Stripe — Top-Up Completed" workflow with inbound webhook trigger; record URL as `GHL_TOPUP_URL`; paste payload schema as Mapping Reference; configure top-up confirmation automation (quickstart B.3)
- [x] T013 [P] Update GHL email templates to handle missing `portalUrl` gracefully (fallback link to `https://app.proadsai.com/billing`) (quickstart B.4)
- [x] T014 Set Firebase Cloud Functions secrets via `firebase functions:secrets:set`: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, plus the 6 per-event GHL URLs from `contracts/ghl-inbound-payload.md` §3 — `GHL_TRIAL_STARTED_URL`, `GHL_PAYMENT_RECEIVED_URL`, `GHL_RECOVERED_URL`, `GHL_OVERDUE_FAILED_URL`, `GHL_CANCELLED_URL`, `GHL_TOPUP_URL` (8 secrets total) (quickstart C)
- [x] T015 Add `stripe` (Node SDK) to `functions/package.json` via `npm install stripe` in `functions/`; add `@stripe/stripe-js` to dev dependencies via `npm install --save-dev @stripe/stripe-js` in root (runtime browser code never imports it; type-completeness only — see plan.md Structure Decision). **Do NOT remove `@paddle/paddle-node-sdk` yet** — it stays installed until T085 because Paddle source code in `functions/src/index.ts` and `functions/src/paddle/*` still imports it through Phase 12. Removing it now would break the build.
- [x] T015a Create `functions/scripts/backfillScalingPlan.ts` — Firebase Admin SDK script that scans `users/*` for `plan === 'scaling'` and updates to `'scale'`. Dry-run mode by default; `--apply` flag required for actual writes; audit log written to `functions/scripts/backfill-scaling-{timestamp}.log` recording each affected uid + before/after values. Idempotent. Run locally with service account against the current Firebase project (dev/test seed data; no paying customers yet). Phase 15 (Live mode cutover) re-runs the same script against the live Firebase project with the same dry-run + audit-log discipline.

**Checkpoint**: Stripe dashboard ready, GHL workflows ready, Cloud Functions secrets set, dependencies installed. Code work can begin.

---

## Phase 2: Foundational (Backend Infrastructure)

**Purpose**: Shared backend scaffolding that every user story phase depends on. Without this complete, no webhook handler or callable can run.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T016 Create directory `functions/src/stripe/` for new Stripe-specific modules
- [x] T017 Create `functions/src/stripe/stripeClient.ts` exporting initialized Stripe SDK (`new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2025-01-27.acacia' })`) and `STRIPE_PRICE_TO_PLAN` map covering all 9 price IDs (3 monthly + 3 annual subscription + 3 top-up) — single source of truth (R-019, R-012)
- [x] T018 [P] Update `src/planconfig.ts` — replace `paddlePriceId` / `paddleTopUpPriceIds` with `stripePriceId: { monthly, annual }` per plan and `TOPUP_PRICES: { 100, 300, 800 }`; mirror `STRIPE_PRICE_TO_PLAN` constant from T017
- [x] T019 [P] Update `functions/src/billing/billingState.ts` — replace Paddle fields (`paddleCustomerId`, `paddleSubscriptionId`, `paddleUpdatePaymentUrl`, `paddleCancelUrl`) in `BillingState` shape with Stripe fields (`stripeCustomerId`, `stripeSubscriptionId`); update `writeBillingState(uid)` to read new fields; remove portal URL fields from emitted shape (FR-001, R-002)
- [x] T020 [P] Update `functions/src/billing/billingLogger.ts` — replace Paddle error codes with Stripe vocabulary: `stripe_signature_invalid`, `stripe_event_duplicate`, `stripe_event_unknown`, `stripe_price_unmapped`, `ghl_sync_failed`, `portal_session_generation_failed`, `user_doc_missing`, `pending_plan_write_failed`, `billing_state_write_failed`, `refund_processed` (FR-026)
- [x] T021 [P] Copy `specs/021-stripe-migration/contracts/billingState.ts` shape into `functions/src/billing/billingStateShape.ts` (or inline into `billingState.ts`) so backend and frontend share the type literally per Constitution Principle XI
- [x] T022 Update `src/hooks/useBillingState.ts` — change field reads from Paddle to Stripe (`stripeCustomerId`, `stripeSubscriptionId`); drop `paddleUpdatePaymentUrl` / `paddleCancelUrl` reads; update TypeScript shape to match `contracts/billingState.ts`
- [x] T023 Add Stripe secrets to `functions/src/index.ts` imports — `defineSecret("STRIPE_SECRET_KEY")`, `defineSecret("STRIPE_WEBHOOK_SECRET")`, plus the 6 per-event GHL URL secrets: `defineSecret("GHL_TRIAL_STARTED_URL")`, `defineSecret("GHL_PAYMENT_RECEIVED_URL")`, `defineSecret("GHL_RECOVERED_URL")`, `defineSecret("GHL_OVERDUE_FAILED_URL")`, `defineSecret("GHL_CANCELLED_URL")`, `defineSecret("GHL_TOPUP_URL")` — DO NOT remove Paddle secrets yet (Phase 13 deletes them)
- [x] T023a [P] Update `firestore.rules` to gate the new `refund_logs/{uid}_{ts}` collection per data-model.md §10: admin-only writes (from Cloud Functions Admin SDK; no client writes); the owning user MAY read their own (`request.auth.uid == resource.data.uid`). Also verify existing rules for `cancellation_logs/{uid}_{ts}` and `stripe_events/{eventId}` still hold — if any reference `paddle_events` or Paddle-era field names, update them. Must land in Phase 2 because T037 (Phase 3) writes to `refund_logs` and the rules must be in place first.

**Checkpoint**: Foundation ready — Stripe SDK initialized, billingState shape updated, error vocabulary extended, field renames complete. User story implementation can now begin.

---

## Phase 3: User Story 14 + User Story 2 — Webhook Pipeline & Two-Path Acquisition (Priority: P1) 🎯 MVP

**Goal**: A user (in-app or GHL funnel) can complete a Stripe Checkout, the webhook fires, the dual-write pattern correctly routes to either `users/{uid}` or `pending_plans/{email}`, idempotency holds, and the `billingState` is written. This is the foundation every other story depends on.

**Independent Test**: (a) Trigger a GHL funnel checkout with a fresh email; verify `pending_plans/{email}` is created. (b) Create a Firebase Auth account with that email; verify the pending doc is consumed. (c) Separately create a fresh Firebase Auth account with no pending plan; verify the mandatory billing modal appears. (d) Click a plan in the modal; verify the user is redirected to a Stripe-hosted Checkout Session (NOT GHL); verify the webhook writes to `users/{uid}` and the modal auto-closes.

**M2 review checklist (added during M1 close-out, 2026-05-10)**: When verifying the new Stripe webhook handler's `writeBillingState()` invocations during M2 audit, confirm BOTH `users/{uid}.plan` AND `users/{uid}.billingState.plan` are written atomically. The existing implementation should preserve this dual-write guarantee, but the M1 backfill (commit `d9ed612`) discovered drift was possible. M2 audit must explicitly verify code paths that touch `plan`.

### Tests for User Story 14 + 2

- [x] T024 [US2] (a) Create `functions/src/billing/__tests__/stripeWebhook.test.ts` with 9 webhook scenarios stub (subscription create in-app, subscription create GHL, dual-event dedup, subscription update plan-change, subscription update trial→active, subscription deleted, payment_succeeded renewal, payment_failed, charge.refunded subscription full); (b) rewrite `functions/src/billing/__tests__/billingState.test.ts` — drop Paddle field assertions (`paddleCustomerId`, `paddleSubscriptionId`, `paddleUpdatePaymentUrl`, `paddleCancelUrl`), add Stripe-shape assertions (`stripeCustomerId`, `stripeSubscriptionId`), update mock Subscription objects to Stripe shape per data-model.md
- [x] T025 [P] [US2] Add 3 callable scenarios to `functions/src/billing/__tests__/stripeWebhook.test.ts`: `createStripeCheckoutSession` happy path, `createStripeTopUpSession` happy path, `createStripePortalSession` happy path
- [x] T026 [P] [US2] Add 3 refund-branch scenarios to `functions/src/billing/__tests__/stripeWebhook.test.ts`: full subscription refund (calls `stripe.subscriptions.cancel`), full top-up refund (deducts credits clamped at 0), partial refund (logs only)

### Backend Webhook Handler — `stripeWebhook`

- [x] T027 [US2] Create `functions/src/billing/stripeWebhook.ts` with `handleStripeWebhook(req, res)` `onRequest` handler skeleton: read `req.rawBody`, verify signature via `stripe.webhooks.constructEvent`, return 400 on signature failure with log code `stripe_signature_invalid`
- [x] T028 [US2] Add event-ID idempotency check in `functions/src/billing/stripeWebhook.ts`: atomic create `stripe_events/{event.id}` document; on collision log `stripe_event_duplicate` and return 200 (FR-016, R-004)
- [x] T029 [US2] Add event-type router in `functions/src/billing/stripeWebhook.ts` that dispatches to per-event handlers; unknown types log `stripe_event_unknown` and return 200
- [x] T030 [US2] Implement `checkout.session.completed` handler in `functions/src/billing/stripeWebhook.ts`: branch on `session.mode` (`subscription` vs `payment`); for subscription with `client_reference_id` write `users/{uid}` then `writeBillingState(uid)`; for subscription without `client_reference_id` write `pending_plans/{customer_details.email.toLowerCase()}` (FR-002, R-006)
- [x] T031 [US2] Implement `mode='payment'` top-up branch in T030: detect `metadata.isTopUp === 'true'`, atomically add `metadata.creditAmount` to `users/{uid}.credits` via Firestore transaction (FR-009)
- [x] T032 [US2] Implement `customer.subscription.created` fallback handler in `functions/src/billing/stripeWebhook.ts`: read `subscription.metadata.firebaseUid`; if present run application-level dedup against `users/{uid}.stripeSubscriptionId` and noop if match (write `result: 'noop_dual_event'` to `stripe_events/{eventId}`); if no match write `users/{uid}`; if `firebaseUid` absent retrieve customer email and write `pending_plans/{email.toLowerCase()}` (R-005, R-006)
- [x] T033 [US2] Implement `customer.subscription.updated` handler in `functions/src/billing/stripeWebhook.ts`: branch on status change (`trialing` → `active`), price change (plan change), `cancel_at_period_end` toggle (cancelling/active); update `users/{uid}` accordingly and call `writeBillingState(uid)`
- [x] T034 [US2] Implement `customer.subscription.deleted` handler in `functions/src/billing/stripeWebhook.ts`: set `plan='none'`, `credits=0`, `billingStatus='cancelled'`, clear `stripeSubscriptionId`; preserve `stripeCustomerId` for resubscription (R-009)
- [x] T035 [US2] Implement `invoice.payment_succeeded` handler in `functions/src/billing/stripeWebhook.ts`: skip if `billing_reason='subscription_create'`; on `subscription_cycle` reset credits to plan allocation and update `nextResetDate`
- [x] T036 [US2] Implement `invoice.payment_failed` handler in `functions/src/billing/stripeWebhook.ts`: set `billingStatus='past_due'`, set `gracePeriodEndsAt` to 2 days from now, leave credits unchanged
- [x] T037 [US2] Implement `charge.refunded` handler in `functions/src/billing/stripeWebhook.ts` with three branches per FR-032/R-015: (a) full subscription refund → write `cancellation_logs/{uid}_{ts}` with `reason: 'refund'`, `feedback: null` (populated from refund `metadata.reason` if present) FIRST, then call `stripe.subscriptions.cancel(stripeSubscriptionId)` with default params (immediate cancellation, no `cancel_at_period_end`, no `prorate`); the resulting `customer.subscription.deleted` runs the existing cancel flow and emits a single GHL POST routed as `subscription.cancelled` → `GHL_CANCELLED_URL` per `contracts/ghl-inbound-payload.md` (no separate refund-event POST); (b) full top-up refund → atomically deduct `metadata.creditAmount` clamped at 0 AND write `refund_logs/{uid}_{ts}` (NEW collection — separate from `cancellation_logs`, schema per data-model.md §10); **NO GHL POST**; (c) partial refund → write `result: 'partial_refund_logged'` to `stripe_events/{eventId}`; NO plan/credit change; **NO GHL POST**. All three branches emit a structured log entry with code `refund_processed`, refund amount, charge ID, and source (`subscription` / `topup` / `partial`).
- [x] T038 [US2] Add structured log emission at every step in `functions/src/billing/stripeWebhook.ts` per FR-026: webhook received, signature verified, idempotency check, routing decision, billing state write, GHL sync attempt, GHL sync result; every error includes a classification code

### Backend Callable — `createStripeCheckoutSession`

- [x] T039 [P] [US14] Create `functions/src/stripe/stripeCheckout.ts` exporting `createStripeCheckoutSessionImpl(uid, email, priceId)` that builds the Stripe Checkout Session per contracts/stripe-webhooks.md: `mode='subscription'`, `client_reference_id=uid`, `metadata.firebaseUid=uid`, `subscription_data.metadata.firebaseUid=uid`, `subscription_data.trial_period_days=7`, `automatic_tax: { enabled: true }`, `customer: stripeCustomerId` if present else `customer_email`, `success_url`/`cancel_url` (R-009, R-013, R-005)
- [x] T040 [US14] Register `createStripeCheckoutSession` `onCall` in `functions/src/index.ts` calling `createStripeCheckoutSessionImpl`; validate priceId against `STRIPE_PRICE_TO_PLAN`; reject team members with `failed-precondition`; secrets: `[stripeSecretKey]`
- [x] T041 [US14] Add top-up Checkout Session function to `functions/src/stripe/stripeCheckout.ts` exporting `createStripeTopUpSessionImpl(uid, email, creditAmount, priceId)` with `mode='payment'`, `metadata: { firebaseUid, isTopUp: 'true', creditAmount: String(creditAmount) }`, customer reuse rule (R-014, R-009)
- [x] T042 [US14] Register `createStripeTopUpSession` `onCall` in `functions/src/index.ts` calling `createStripeTopUpSessionImpl`; validate `creditAmount ∈ {100, 300, 800}` and `priceId` against `TOPUP_PRICES`; reject if `canTopUp: false`; secrets: `[stripeSecretKey]`

### Backend onRequest — `stripeWebhook`

- [x] T043 [US2] Register `stripeWebhook` `onRequest` in `functions/src/index.ts` with `cors: true`, `secrets: [stripeSecretKey, stripeWebhookSecret, ghlTrialStartedUrl, ghlPaymentReceivedUrl, ghlRecoveredUrl, ghlOverdueFailedUrl, ghlCancelledUrl, ghlTopupUrl]`; route to `handleStripeWebhook` (FR-014)

### Frontend — Mandatory Billing Modal CTA

- [x] T044 [US14] Update `src/components/billing/MandatoryBillingModal.tsx` plan-card click handler: call `httpsCallable(functions, 'createStripeCheckoutSession')` with `priceId` from `planconfig.ts`; redirect via `window.location.href = data.checkoutUrl`; remove any Paddle.js / GHL redirect fallback paths (FR-024a, SC-018)
- [x] T045 [US14] Verify dismiss-proof behavior in `src/components/billing/MandatoryBillingModal.tsx`: no close button, `onClose={undefined}`, escape and outside-click event handlers preventDefault; auto-close `useEffect` watches `billingState.plan` transition from `'none'` → real plan
- [x] T046 [US14] Verify welcome toast trigger in `src/App.tsx` (or modal close handler): on plan transition AND `createdAt` within 60s AND `welcomeToastShown !== true`, fire toast and write `welcomeToastShown: true` to `users/{uid}` (FR-024b)
- [x] T047 [US14] Verify `pending_plans` consume flow in `src/App.tsx` `onAuthStateChanged` handler: on first sign-in, look up `pending_plans/{email.toLowerCase()}`; if exists, copy fields into `users/{uid}` and delete pending doc; if absent, create minimal `users/{uid}` with `plan: 'none'`, `credits: 0` (FR-024)
- [x] T047a [US14] Update `src/App.tsx:1566` `useState` for `billingStatus` to use the full 6-value `BillingStatus` union from `contracts/billingState.ts` (`'trialing' | 'active' | 'past_due' | 'cancelling' | 'cancelled' | 'none'`) — current code narrows to 3 values which causes type drift if Firestore writes `trialing` or `cancelling`. Audit downstream comparisons in `App.tsx` (notably the past_due full-screen at ~line 2603 and the cancelled full-screen at ~line 2633): `if (billingStatus === 'past_due')` does NOT block `cancelling` users — verify this is intentional (cancelling users retain access through period end, per data-model.md §lifecycle); if any comparison needs to fan out to additional states, add explicit branches with i18n copy. Constitution Principle XI (Frontend and Backend MUST Agree on Truth) requires this alignment.
- [x] T048 [US14] Update `src/components/PricingTable.tsx`: add Monthly/Annual toggle UI; CTA buttons call `createStripeCheckoutSession` with `PLANS[planId].stripePriceId.monthly` or `.annual`; remove Paddle.Checkout.open calls
- [x] T049 [US14] Update `src/pages/Billing.tsx`: handle `?paid=1` query param → show "Subscription activated" toast (consume + clear param); `?canceled=1` → no-op; `?topup=1` → show "Credits added" toast; `?topup_canceled=1` → no-op

### Frontend — Drop Paddle.js Loader

- [x] T050 [US14] Remove `<script src="https://cdn.paddle.com/paddle/v2/paddle.js" defer></script>` from `index.html`
- [x] T051 [US14] Remove `Paddle.Setup({...})` initialization from `src/App.tsx` and any other location where it appears

**Checkpoint**: Two-path acquisition working — GHL funnel buyers land on `pending_plans` and consume on first sign-in; in-app authenticated users complete in-app Stripe Checkout from the mandatory modal. Webhook handles all 7 events including refund branches. Application-level dual-event dedup prevents double-write. MVP unblocked.

---

## Phase 4: User Story 12 — Firebase-to-GHL Sync (Priority: P1)

**Goal**: Every successful Stripe webhook triggers a best-effort GHL POST. Success-sync omits `portalUrl`; failed-sync (dunning + refund) generates a fresh portal URL transiently and includes it.

**Independent Test**: Simulate each Stripe webhook event with a stubbed `fetch` and verify the correct GHL URL is hit with the correct payload shape; verify failed-sync includes a transiently-generated `portalUrl`; verify GHL POST failures don't block billing state updates.

### Tests for User Story 12

- [x] T052 [P] [US12] Create `functions/src/billing/__tests__/ghlBillingSync.test.ts` covering: (a) each of the 6 `event_type` values routes to its matching URL per the `URL_BY_EVENT` map in `contracts/ghl-inbound-payload.md` §3; (b) `notifyGHL` with uid (reads user doc), with raw email (pre-signup); (c) every payload includes the full 21-field stable-column shape with `null` for inapplicable fields, including the `first_name` / `last_name` split (covering: displayName with whitespace, displayName without whitespace → `last_name: null`, displayName null → both null); (d) POST failure logs `ghl_sync_failed` and doesn't throw; (e) transient `portal_url` generation failure logs `portal_session_generation_failed` and POSTs with `portal_url: null`; (f) `trial_end_date_human` and `next_billing_date_human` render as `MMMM D, YYYY` (e.g., `"May 21, 2026"`) when the ISO date is set, and as `null` when the ISO date is `null`

### Implementation for User Story 12

- [x] T053 [US12] Rewrite `functions/src/billing/ghlBillingSync.ts` to export `notifyGHL(identifier, eventType, payloadFields)` per `contracts/ghl-inbound-payload.md`. `eventType` is one of the 6 values from §3. Build the 21-field canonical payload (every field always present; inapplicable fields set to `null` per the stable-column rule); resolve `email` / `displayName` / `stripeCustomerId` from `users/{uid}` if uid, else use email directly; split `displayName` on the first whitespace into `first_name` (full string if no whitespace) and `last_name` (`null` if no whitespace), with both `null` when `displayName` is `null` or when called with a raw email identifier. Format `trial_end_date` and `next_billing_date` ISO strings into human-readable English dates (`MMMM D, YYYY`) using `Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' })` and include them as `trial_end_date_human` and `next_billing_date_human` respectively. Both human variants are `null` when the underlying ISO field is `null`. (R-008, FR-018)
- [x] T054 [US12] Add the per-event-type URL routing map `URL_BY_EVENT` in `functions/src/billing/ghlBillingSync.ts` keying each of the 6 `event_type` values to its matching Firebase secret accessor (`GHL_TRIAL_STARTED_URL.value()`, `GHL_PAYMENT_RECEIVED_URL.value()`, `GHL_RECOVERED_URL.value()`, `GHL_OVERDUE_FAILED_URL.value()`, `GHL_CANCELLED_URL.value()`, `GHL_TOPUP_URL.value()`); reject unknown event types at call site with TypeScript exhaustiveness check
- [x] T055 [US12] Add transient `portal_url` generation in `notifyGHL`: when `stripeCustomerId` is available, call `stripe.billingPortal.sessions.create({ customer, return_url: 'https://app.proadsai.com/billing' })` before the POST. On failure, log `portal_session_generation_failed` and continue with `portal_url: null`. Wrap the POST itself in try/catch; on failure log `ghl_sync_failed` and return without throwing (fire-and-forget). The single helper handles all 6 event types — no separate `notifyGHLFailed` function (the prior 2-URL design's split is collapsed into per-event-type routing).
- [x] T056 [US12] Wire `notifyGHL` invocations into success-path handlers in `functions/src/billing/stripeWebhook.ts` after billing-state write: `checkout.session.completed` (mode='subscription', trial set) → `event_type: 'trial.started'`; `checkout.session.completed` (mode='subscription', no trial) and `customer.subscription.updated` (`trialing` → `active`) → `event_type: 'subscription.created'`; `invoice.payment_succeeded` after `past_due` → `event_type: 'payment.recovered'`; `customer.subscription.deleted` → `event_type: 'subscription.cancelled'` (include `cancel_at` and `cancellation_reason` from `cancellation_logs/{uid}_{ts}` if present); `checkout.session.completed` (mode='payment', `metadata.isTopUp='true'`) → `event_type: 'top_up.completed'`
- [x] T057 [US12] Wire `notifyGHL` into `invoice.payment_failed` handler with `event_type: 'payment.failed'` (no separate failed-sync helper anymore — routing is by event type only). Refund-driven cancellations naturally route through `customer.subscription.deleted` → `subscription.cancelled` (per T037, refunds call `stripe.subscriptions.cancel` which fires the deleted event); top-up refunds do NOT notify GHL (credits are silently decremented).

**Checkpoint**: GHL sync working end-to-end. Welcome emails, win-back, dunning, and refund acknowledgements all triggered correctly. GHL failures never block billing state.

---

## Phase 5: User Story 1 + User Story 4 — Billing Dashboard & Customer Portal (Priority: P1)

**Goal**: Users can view their plan/credits/status on the Billing page in real time and click "Manage Subscription" to open Stripe Customer Portal.

**Independent Test**: Subscribe via Stripe Checkout; verify Billing page shows correct plan, credits, status, and that the "Manage Subscription" button opens the Stripe-hosted portal in a new tab.

### Backend Callable — `createStripePortalSession`

- [x] T058 [P] [US4] Create `functions/src/stripe/stripePortal.ts` exporting `createStripePortalSessionImpl(uid, flow?, returnUrl?)` that builds a Stripe Customer Portal session per contracts/stripe-webhooks.md with optional `flow_data` deep-links for `subscription_cancel` (with `subscription` ID) and `payment_method_update` (FR-017, R-002)
- [x] T059 [US4] Register `createStripePortalSession` `onCall` in `functions/src/index.ts` calling `createStripePortalSessionImpl`; reject if no `stripeCustomerId`; reject `flow=subscription_cancel` if no `stripeSubscriptionId`; secrets: `[stripeSecretKey]`

### Frontend — Billing Dashboard

- [x] T060 [US1] Update `src/pages/Billing.tsx` to read `useBillingState()` (already updated in T022); render plan name, credit bar `credits / creditsPerMonth`, `nextResetDate`, `billingStatus`; conditionally show trial label, low-credits banner, payment-failed alert; remove any Paddle URL reads
- [x] T061 [US1] Update `src/components/billing/PlanCard.tsx`: read `stripeCustomerId` / `stripeSubscriptionId` for debug only; "Manage Subscription" button calls `createStripePortalSession({})` and opens `portalUrl` in a new tab
- [x] T062 [US1] Update `src/components/billing/CreditBar.tsx`: no behavior change; verify it reads `credits` and `creditsPerMonth` from `billingState`
- [x] T063 [US1] Verify `src/hooks/useBillingState.ts` switches its listener to `users/{teamOwnerUid}` when `isTeamMember` is true and overlays read-only fields (FR-012)

**Checkpoint**: Billing page renders correctly for all status states. Portal opens with one click. Real-time updates work.

---

## Phase 6: User Story 5 — Top-Up Credits via Stripe Checkout (Priority: P2)

**Goal**: User selects a top-up pack, completes Stripe Checkout, and sees their credit balance increase in real time.

**Independent Test**: Click 100-credit top-up; complete Stripe Checkout with test card; verify credit balance increases by 100 within 3 seconds and a success toast fires.

- [x] T064 [US5] Update `src/components/billing/TopUpSelector.tsx`: click handler calls `httpsCallable(functions, 'createStripeTopUpSession')` with `creditAmount` and the matching `TOPUP_PRICES[creditAmount]`; redirect via `window.location.href = data.checkoutUrl`; remove Paddle.Checkout.open calls
- [x] T065 [US5] Verify the `mode='payment'` branch in `functions/src/billing/stripeWebhook.ts` (T031) atomically adds credits via Firestore transaction with `FieldValue.increment(creditAmount)`; clamp protection (`credits >= 0`) per data-model.md validation rules

**Checkpoint**: Top-up flow round-trips end to end. Success toast on return. Credits increment via webhook.

---

## Phase 7: User Story 6 + User Story 9 — Cancel & Upgrade Flows (Priority: P2)

**Goal**: Users can cancel via in-app reason dialog → Stripe portal subscription_cancel deep-link, and can upgrade via in-app Stripe Checkout for a new price ID.

**Independent Test**: Cancel: click Cancel → submit reason → verify `cancellation_logs/{uid}_{ts}` written → redirect to Stripe portal cancel flow → confirm → verify Billing page shows "Cancelled — access until {date}". Upgrade: click "Upgrade to Pro" as a Starter user → complete Stripe Checkout → verify plan updates.

- [x] T066 [US6] Update `src/components/billing/CancelDialog.tsx` two-step flow: step 1 unchanged (confirmation + reason + feedback); step 2 calls `createStripePortalSession({ flow: 'subscription_cancel' })` and `window.open(data.portalUrl, '_blank')`; remove Paddle cancel URL usage (FR-010)
- [x] T067 [US6] Verify `cancellation_logs/{uid}_{ts}` write happens before the portal redirect (FR-010)
- [x] T068 [US9] Update `src/components/billing/PlanCard.tsx` "Upgrade" button (or wherever upgrade CTA lives): call `createStripeCheckoutSession` with the target plan's `priceId`; redirect to `checkoutUrl` (FR-019)
- [x] T069 [US9] Update `src/components/billing/ReactivateButton.tsx`: call `createStripePortalSession({})` (no flow) and open portal home; user clears `cancel_at_period_end` themselves in the portal

**Checkpoint**: Cancel and upgrade both work via in-app initiation + Stripe-hosted completion. Webhooks propagate state changes back to the app.

---

## Phase 8: User Story 11 — Payment Failure Visibility & Dunning (Priority: P2)

**Goal**: When a user is `past_due`, the Billing page shows an alert with an "Update payment method" button that opens the Stripe portal payment_method_update flow, plus a countdown to grace-period expiry.

**Independent Test**: Simulate `invoice.payment_failed`; verify Billing page shows alert; click "Update payment method"; verify portal opens to payment_method_update flow; verify GHL receives dunning sync with transient `portalUrl`.

- [x] T070 [US11] Update `src/components/billing/PaymentFailedAlert.tsx`: render when `billingStatus === 'past_due'`; show countdown using `gracePeriodEndsAt`; "Update payment method" button calls `createStripePortalSession({ flow: 'payment_method_update' })` and opens `portalUrl` in new tab (FR-013)
- [x] T071 [US11] Verify recovery handling: `invoice.payment_succeeded` handler in `functions/src/billing/stripeWebhook.ts` (T035) clears `gracePeriodEndsAt`, restores `billingStatus='active'`; alert disappears via real-time listener

**Checkpoint**: Payment failure surfaced to user, recovery surfaced to user, GHL dunning sync flows through.

---

## Phase 9: User Story 7 — Trial Expiry Handling (Priority: P2)

**Goal**: When a trial user reaches 0 credits OR the Stripe trial expires without conversion, a persistent banner appears across the app and generation actions are blocked server-side.

**Independent Test**: Create a trial user; deplete credits to 0; verify the banner appears on every page; verify generation actions are rejected server-side.

- [x] T072 [US7] Verify `src/components/billing/TrialExpiredBanner.tsx`: render when `isTrial && credits === 0` OR `billingStatus === 'cancelled' && plan === 'none'` immediately after a trial; uses i18n key `billing.trialEnded` (FR-007)
- [x] T073 [US7] Verify server-side block in `functions/src/index.ts` `deductCreditsServer` (existing from Phase 8): rejects with `trial_expired` when `isTrial && credits === 0` (FR-007)

**Checkpoint**: Trial end is visible to user and enforced on the server.

---

## Phase 10: User Story 10 — Low Credits Warning (Priority: P3)

**Goal**: When credits drop below 20% of plan allocation, a banner appears with a top-up CTA.

**Independent Test**: Reduce a Pro user's credits to 350 (out of 2,000 = 17.5%); verify banner appears; top up to above 20%; verify banner disappears.

- [x] T074 [US10] Verify `src/components/billing/LowCreditsWarning.tsx`: render when `credits / creditsPerMonth < 0.2`; uses i18n key `billing.lowCredits`; CTA links to top-up section (FR-011)

**Checkpoint**: Low-credits warning fires correctly.

---

## Phase 11: User Story 3 + User Story 8 — Plan Gate & Downgrade Enforcement (Priority: P1 + P2)

**Goal**: Server-side plan gate rejects credit-consuming actions the user is not entitled to. Frontend re-evaluates feature visibility on `billingState` change without page refresh.

**Independent Test**: Downgrade a user from Pro to Starter; attempt a carousel generation; verify server rejects with `plan_downgraded`; verify the carousel button is hidden in the UI within 5 seconds without refresh.

- [x] T075 [US3] Verify `functions/src/index.ts` `deductCreditsServer` (or equivalent) checks `ACTION_FEATURE_MAP[action]` against the user's current plan entitlements before deducting; rejects with `plan_downgraded` on mismatch (FR-005)
- [x] T076 [US8] Verify frontend feature visibility logic reads `useCanUse(action)` (real-time) so plan downgrades hide/disable features without page refresh (FR-008)

**Checkpoint**: Plan gate enforced server-side; UI re-evaluates in real time.

---

## Phase 12: User Story 13 — Email-Only Authentication (Priority: P1)

**Goal**: Verify that the email-only auth flow from Phase 8 still works end to end against the new Stripe-backed `pending_plans` consume path.

**Independent Test**: (a) Create a new account with a fresh email; verify email verification gate. (b) Enter an unknown email on Login; verify auto-switch to Create Account. (c) Click "Forgot Password?"; verify Firebase password reset email arrives.

- [x] T077 [US13] Smoke-test the existing `src/components/auth/LoginTab.tsx`, `CreateAccountTab.tsx`, `VerifyEmailScreen.tsx`, `ForgotPasswordDialog.tsx` against the new `pending_plans` shape (with Stripe fields) — no code changes expected, but confirm acceptance scenarios from US13 still pass after Phase 2/3 changes (FR-020, FR-021, FR-022, FR-022a, FR-023, FR-023a)

**Checkpoint**: Email-only auth verified against Stripe-backed pending_plans.

---

## Phase 13: Wholesale Paddle Code Deletion (FR-030 / R-018)

**Purpose**: Remove all Paddle code in a single atomic step now that Stripe parity is verified. Pre-launch with zero paying users — no migration period, no feature flags.

**⚠️ CRITICAL**: Run only after Phases 3–12 are verified working in Stripe Test mode. SC-016 enforces zero remaining `paddle`/`Paddle` matches in `functions/src/` and `src/` after this phase.

- [x] T078 Delete directory `functions/src/paddle/` (4 files: `paddleCheckout.ts`, `paddleClient.ts`, `paddlePortal.ts`, `paddleSubscriptions.ts`)
- [x] T079 Delete `functions/src/billing/paddleWebhook.ts`
- [x] T080 Delete `functions/src/billing/__tests__/paddleWebhook.test.ts` (if it exists)
- [x] T081 Remove all 9 Paddle Cloud Functions from `functions/src/index.ts`: `paddleGetSub`, `paddleCancelSub`, `paddleReactivateSub`, `paddleChangePlanFn`, `paddleTopupCheckout`, `paddlePortalSession`, `createPaddleCheckout`, `createPaddleTopUp`, `paddleWebhook`
- [x] T082 Remove all Paddle imports from `functions/src/index.ts` (the 5 `import` statements at lines 23–27 referencing `./paddle/...` and `./billing/paddleWebhook.js`)
- [x] T083 Remove Paddle secret declarations from `functions/src/index.ts`: `paddleApiKey`, `paddleWebhookSecret`, `ghlPaddleSyncUrl`, `ghlPaddleFailedUrl`
- [x] T084 Remove all DEPRECATED comment blocks in `functions/src/index.ts` that reference Paddle replacements (cleanup of stale historical commentary)
- [x] T085 Remove `@paddle/paddle-node-sdk` from `functions/package.json` (this is the actual removal — T015 deliberately deferred it to here); run `npm prune` in `functions/`. Safe now because T078–T084 deleted all Paddle source code.
- [ ] T086 Destroy Paddle secrets via `firebase functions:secrets:destroy PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, `GHL_PADDLE_SYNC_WEBHOOK_URL`, `GHL_PADDLE_FAILED_WEBHOOK_URL`
- [x] T087 Run `npm run build` in `functions/` and root; fix any remaining TypeScript errors caused by dropped imports
- [x] T088 Run `npm run lint` and fix any unused-import warnings
- [x] T089 Audit: confirm zero matches for `paddle`/`Paddle` in `functions/src/` and `src/` (excluding `specs/`) — SC-016

**Checkpoint**: All Paddle code deleted. Build is green. Audit confirms zero Paddle references.

---

## Phase 14: Polish & Cross-Cutting

**Purpose**: i18n updates, smoke tests from `quickstart.md` sections E.1–E.10, final audits.

- [ ] T090 [P] Update `src/i18n.tsx`: review all `billing.*`, `cancelDialog.*`, `login.*`, `auth.*` keys; replace any "Paddle" copy with "Stripe" or generic terms; verify Arabic translations cover all new key paths (FR-025); add new keys per contracts/frontend-hooks.md if missing (`billing.refundProcessed`, `billing.subscriptionActivated`, `billing.creditsAdded`, `billing.annualSavings`)
- [ ] T091 [P] Run `npm run build` (frontend) and confirm no errors after all field-rename and import updates
- [ ] T092 Run quickstart.md smoke test E.1 — In-App Subscription (Path B): fresh signup → mandatory modal → Pro Monthly Checkout → expect dual-event dedup, welcome toast fires, modal auto-closes
- [ ] T093 Run quickstart.md smoke test E.2 — GHL Funnel Subscription (Path A): incognito GHL pay → `pending_plans` written → app signup with same email → consume flow runs
- [ ] T094 Run quickstart.md smoke test E.3 — Top-Up: 100-credit top-up flow round-trip; credit balance increments
- [ ] T095 Run quickstart.md smoke test E.4 — Cancel Subscription: in-app reason dialog → portal cancel → period-end flow via Stripe Test Clock
- [ ] T096 Run quickstart.md smoke test E.5 — Payment Failure & Recovery: card `4000 0000 0000 0341` + Test Clock advance → past_due alert → portal payment_method_update → recovery
- [ ] T097 Run quickstart.md smoke test E.6 — Subscription Refund: full refund in Stripe Dashboard → `charge.refunded` → `stripe.subscriptions.cancel` → `customer.subscription.deleted` → plan='none'
- [ ] T098 Run quickstart.md smoke test E.7 — Top-Up Refund: full refund of top-up → atomic credit deduction (clamped at 0)
- [ ] T099 Run quickstart.md smoke test E.8 — Partial Refund: 50% refund → log only, no plan/credit change
- [ ] T100 Run quickstart.md smoke test E.9 — Webhook Replay: re-send already-delivered event → `stripe_event_duplicate` log, no state change
- [ ] T101 Run quickstart.md smoke test E.10 — Idempotency Under Load: Stripe CLI 5x trigger of same event → only first applies
- [ ] T102 Run jest test suite in `functions/`: `npm test` — all webhook + callable + GHL sync tests pass
- [ ] T103 [P] Update `MEMORY.md` (if applicable) and `CLAUDE.md` "Recent Changes" section with the migration summary and the date
- [ ] T104 Final audit: SC-016 (`paddle` zero hits), SC-017 (Stripe Tax on every Checkout Session), SC-018 (modal CTA never redirects to GHL), SC-019 (USD-only price audit)
- [ ] T105 Tag the migration commit / PR description with the test sequence run results, and link to the green Stripe Dashboard webhook log

**Checkpoint**: Migration is launch-ready. All 10 smoke tests pass. Audits clean. PR ready for merge.

---

## Phase 15: Production Cutover (Owner Steps)

**Purpose**: Move from Stripe Test mode to Live mode and ship.

- [ ] T106 Activate Stripe Live mode (legal entity verified, bank account linked, identity verification complete)
- [ ] T107 [P] Recreate all 9 price IDs in Live mode (Test mode IDs do NOT carry over) — record them in a separate Live config commit
- [ ] T108 [P] Set Live `STRIPE_SECRET_KEY` (sk_live_xxx) in Firebase Cloud Functions secrets
- [ ] T109 [P] Add Live webhook endpoint with the same 7 events; copy Live signing secret; set Live `STRIPE_WEBHOOK_SECRET`
- [ ] T110 [P] Finalize Stripe Tax registrations for all launch jurisdictions; confirm filing cadence with merchant accountant
- [ ] T111 [P] Connect GHL to Live Stripe; verify GHL workflows fire against Live webhook URLs
- [ ] T112 Update `planconfig.ts` and `functions/src/stripe/stripeClient.ts` to Live price IDs (single PR; tag the SHA used for cutover)
- [ ] T113 Deploy Cloud Functions to production
- [ ] T114 Run E.1 + E.2 manually in production with a real test customer (refund afterwards)
- [ ] T115 Announce launch

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: Owner-driven dashboard work; no code dependency. Can start immediately. T002, T003, T004, T006, T007, T008 are parallel within Stripe; T009–T013 are parallel within GHL. T014 (secrets) and T015 (npm) must come after Stripe + GHL URLs are recorded.
- **Phase 2 (Foundational)**: Depends on Phase 1 secrets + dependencies. T016 → T017 (sequential) → T018, T019, T020, T021 (parallel) → T022 (depends on contracts/billingState.ts). T023 can run in parallel with T022.
- **Phase 3 (US14 + US2 — MVP)**: Depends on Phase 2. Backend webhook tasks T027–T038 are sequential within `stripeWebhook.ts` (same file). Backend callables T039–T043 are parallel with the webhook (different files). Frontend T044–T051 can run in parallel with backend after T040 (the callable) lands.
- **Phase 4 (US12 — GHL sync)**: Depends on Phase 3 (the webhook handlers must call into the helpers). T053–T055 are sequential within `ghlBillingSync.ts`. T056–T057 wire helpers into webhook (depends on Phase 3 webhook handlers existing).
- **Phase 5 (US1 + US4 — dashboard + portal)**: Depends on Phase 2 (billingState shape). Backend T058–T059 parallel with frontend T060–T063.
- **Phase 6 (US5 — top-up)**: Depends on Phase 3 (webhook payment-mode branch + topup callable).
- **Phase 7 (US6 + US9 — cancel + upgrade)**: Depends on Phase 5 (portal callable for cancel deep-link).
- **Phase 8 (US11 — payment failure)**: Depends on Phase 5 (portal callable for payment_method_update).
- **Phase 9 (US7 — trial)**: Depends on Phase 3 (webhook handles trial → active transition).
- **Phase 10 (US10 — low credits)**: Depends on Phase 5 (Billing page reads billingState).
- **Phase 11 (US3 + US8 — gate + downgrade)**: Depends on Phase 2 (billingState shape) — mostly verification.
- **Phase 12 (US13 — auth)**: Depends on Phase 3 (pending_plans consume now uses Stripe fields). Verification only.
- **Phase 13 (Paddle deletion)**: Depends on Phases 3–12 all verified. **Must NOT run earlier** — it removes the safety net.
- **Phase 14 (Polish)**: Depends on Phase 13. Runs all smoke tests against the now-Paddle-free code.
- **Phase 15 (Cutover)**: Depends on Phase 14 all green.

### User Story Dependencies

| Story | Depends on |
|---|---|
| US14 (acquisition) | Phase 2 (foundation) |
| US2 (webhook) | Phase 2 + integrates with US14 acquisition |
| US12 (GHL sync) | US2 (webhook handlers must invoke helpers) |
| US1 (dashboard) | Phase 2 (shape) |
| US4 (portal) | Phase 2 (shape) |
| US5 (top-up) | US14 callable + US2 webhook payment branch |
| US6 (cancel) | US4 portal |
| US9 (upgrade) | US14 callable |
| US11 (payment fail) | US4 portal + US2 invoice.payment_failed handler |
| US7 (trial) | US2 lifecycle handlers |
| US10 (low credits) | US1 dashboard |
| US3 (gate) | Phase 2 only — mostly verification |
| US8 (downgrade) | US3 + US1 |
| US13 (auth) | US14 (pending_plans) — verification only |

### Parallel Opportunities

- **Phase 1**: T002, T003, T004 (Stripe products) parallel; T006, T007, T008 (Stripe portal/tax/dunning) parallel; T009–T013 (GHL) parallel.
- **Phase 2**: T018, T019, T020, T021 parallel.
- **Phase 3**: Backend test stubs T024, T025, T026 parallel. Backend webhook handlers T030–T037 sequential within file. Frontend T044, T048, T049 parallel after callable T040 lands.
- **Phase 5**: Backend T058 + frontend T060–T063 parallel after Phase 2.
- **Phase 14**: Smoke tests T092–T101 are sequential (each tests a distinct flow; running in parallel is possible but order documented for clarity).

### Within Each Story Phase

- Tests stubbed first (T024–T026, T052) to define the expected behavior.
- Backend models/helpers before route handlers (e.g., T053 → T054 → T056).
- Backend handlers before frontend wiring (e.g., T040 callable → T044 modal CTA).
- Each story phase ends with a checkpoint that validates the story end to end.

---

## Parallel Example: Phase 3 (MVP)

```bash
# Three test stubs together (different test files / different scenarios in same file are still parallel):
Task: "Create stripeWebhook.test.ts with 9 webhook scenario stubs"
Task: "Add 3 callable scenarios to stripeWebhook.test.ts"
Task: "Add 3 refund-branch scenarios to stripeWebhook.test.ts"

# After T040 (callable registered): frontend wiring tasks parallel:
Task: "Update MandatoryBillingModal.tsx CTA"
Task: "Update PricingTable.tsx Monthly/Annual toggle"
Task: "Update Billing.tsx ?paid=1 query handling"
Task: "Drop Paddle.js script from index.html"
```

---

## Implementation Strategy

### MVP Scope (Phase 1 + Phase 2 + Phase 3 + Phase 4)

This is the smallest set of phases that delivers an end-to-end paying customer:
- Stripe Dashboard + GHL setup (Phase 1)
- Backend foundation (Phase 2)
- Webhook + acquisition + idempotency + refund handlers (Phase 3)
- GHL sync (Phase 4)

Stop after Phase 4 to **validate** with a manual round trip in Stripe Test mode (E.1, E.2, E.6, E.7, E.9 from quickstart). Demo if ready.

### Incremental Delivery

1. **MVP**: Phases 1–4 → smoke E.1, E.2, E.6, E.7 → demo
2. **+ Self-service dashboard**: Phase 5 (US1, US4) → smoke E.4
3. **+ Top-up**: Phase 6 → smoke E.3
4. **+ Cancellation + upgrade**: Phase 7
5. **+ Payment failure**: Phase 8 → smoke E.5
6. **+ Trial / low-credits / gate / auth verification**: Phases 9–12
7. **+ Wholesale Paddle deletion**: Phase 13 (one-shot)
8. **Polish**: Phase 14 → all 10 smoke tests pass
9. **Cutover**: Phase 15

Each milestone adds value without breaking previous ones. Phase 13 (Paddle deletion) is the only "destructive" milestone — gated on Phase 12 verification.

### Parallel Team Strategy

With multiple developers:

- **Phase 1**: Owner does Stripe + GHL dashboard work. Developer prepares npm dependency PR (T015) in parallel.
- **Phase 2**: One developer takes T017 (stripeClient + price map), another takes T019 + T020 + T021 (billing state + logger + shape file), a third takes T018 + T022 (frontend planconfig + useBillingState).
- **Phase 3**: One developer owns the webhook file (sequential T027–T038); another owns the callables (T039–T043); a third owns frontend modal/pricing wiring (T044–T051).
- **Phases 4–12**: Distribute by user story; most can run in parallel after Phase 3 lands.
- **Phase 13**: Single developer owns the deletion PR (one atomic change).
- **Phase 14**: Distribute smoke tests across team for speed.

---

## Notes

- [P] tasks = different files, no dependencies — parallel-safe.
- [Story] label maps to user stories US1–US14 from spec.md.
- Phase 13 is the **only** destructive phase. Do not attempt earlier; verify Stripe parity first.
- Refund handling lives in Phase 3 (US2) because `charge.refunded` is a webhook event.
- Email-only auth (US13) is mostly verification — Phase 8 already implemented it; this phase confirms it still works against the new pending_plans Stripe shape.
- Constitutional Principle XI (Frontend and Backend MUST Agree on Truth) is enforced via the shared `contracts/billingState.ts` shape — backend writes the same fields the frontend reads.
- Constitutional Principle IX (Proof Is Required for Every Claimed Fix) is enforced by the mandatory webhook + callable + GHL sync test suite (Phase 3 + Phase 4 tests) and the 10 smoke tests in Phase 14.
- Each task is small enough that an LLM can complete it without additional context, given access to the file paths and the linked spec/research/contracts.
