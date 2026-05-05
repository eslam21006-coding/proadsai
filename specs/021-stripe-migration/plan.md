# Implementation Plan: Stripe Migration — Replace Paddle with Stripe as Billing Provider

**Branch**: `021-stripe-migration` | **Date**: 2026-05-05 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/021-stripe-migration/spec.md`

## Summary

Phase 21 swaps the billing engine from Paddle to Stripe while reusing every behavior contract from Phase 8 (`specs/009-billing-plan-access/`). External buyers come through GHL's hosted marketing funnel using GHL's native Stripe integration; authenticated in-app actions (initial subscription from the mandatory billing modal, plan changes, top-ups) use Stripe Checkout Sessions; cancellation and payment-method updates use Stripe Customer Portal. The `pending_plans/{email}` dual-write pattern, dismiss-proof billing modal, email-only auth, welcome trial toast, and Firebase→GHL sync direction are preserved exactly. Webhook event coverage is 7 events including `customer.subscription.created` (fallback for paths bypassing Checkout) and `charge.refunded` (full subscription refund cancels via Stripe API; top-up refund deducts credits; partial refund logs only). USD-only currency at launch with Stripe Tax enabled. `stripeCustomerId` is reused on every in-app upgrade/top-up. Portal URLs are never stored — generated on-demand by the user-facing callable and transiently inside the failed-sync GHL helper for dunning + refund payloads. All Paddle code (4 files in `functions/src/paddle/`, `functions/src/billing/paddleWebhook.ts`, 9 callables in `functions/src/index.ts`, Paddle.js loader, env secrets, fixtures) is deleted in the same migration PR.

## Technical Context

**Language/Version**: TypeScript 5.7 (functions), TypeScript 5.9 (frontend)
**Primary Dependencies**: Firebase Cloud Functions v2, Firebase Auth (email/password + email verification), Firestore, React 19, Zustand 4, Tailwind CSS 3, Vite 7, `stripe` Node SDK (server, replaces `@paddle/paddle-node-sdk`), `@stripe/stripe-js` (browser, replaces Paddle.js v2)
**Storage**: Firestore — `users/{uid}` (with embedded `billingState` sub-object — Paddle fields renamed to Stripe fields), `pending_plans/{email.toLowerCase()}` (pre-signup plans, schema updated), `stripe_events/{eventId}` (webhook idempotency, replaces `paddle_events/{eventId}`), `cancellation_logs/{uid}_{ts}` (analytics, unchanged)
**Testing**: Jest (functions) — rewriting `functions/src/billing/__tests__/billingState.test.ts` and `paddleWebhook.test.ts` (delete) → new `stripeWebhook.test.ts` (create). 9 webhook scenarios + 3 callable scenarios + dual-event dedup + refund branches.
**Target Platform**: Web (React SPA on Firebase Hosting, Firebase Cloud Functions v2 in `europe-west1`)
**Project Type**: Web application (React frontend + Firebase Cloud Functions backend)
**Performance Goals**: Billing page loads within 2s (SC-001); billing state changes reflected in frontend within 3s (SC-002); Stripe webhook processing under 5s end-to-end including transient portal session generation for dunning/refund (~1 extra Stripe API call adds ~300ms)
**Constraints**: Stripe is NOT Merchant of Record (unlike Paddle was) — merchant handles tax registration/filing; GHL sync is fire-and-forget; unpaid accounts MUST NOT be deleted; email verification required before app access; mandatory billing modal CTA stays in-app (never bounces to GHL); Arabic + English RTL from launch; USD-only at launch; portal URLs never stored long-lived; Paddle code deleted wholesale (no feature flags, no dual-running)
**Scale/Scope**: Pre-launch SaaS — zero existing paying users to migrate. 3 plan tiers × 2 billing cycles + 3 top-up packs = 9 Stripe price IDs. 7 Stripe webhook event types. ~50 i18n keys (en + ar) carried over from Phase 8. 14 user stories. 32 functional requirements.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Reliability Over Feature Count | PASS | Scope is intentionally narrow — engine swap only, no new billing features. Subscription pausing remains out of scope. Multi-currency deferred. Refund handling adds reliability (no silent post-refund continued use). |
| II. The Selected Mode MUST Be Obeyed | PASS | Plan selection drives feature access; server-side `deductCreditsServer` enforces entitlements unchanged from Phase 8. |
| III. Launch Surface Is Frozen and Authoritative | PASS | LAUNCH_MATRIX Section 0 says billing provider is Stripe. Phase 8 Paddle implementation diverged. Phase 21 realigns code with the matrix. |
| IV. Behavior Contracts Beat Subjective Judgment | PASS | All 7 webhook event handlers have explicit pre/post conditions in spec FR-002, FR-014, FR-018, FR-032. Idempotency rules explicit (event-ID + application-level on `stripeSubscriptionId`). Lifecycle stays `trialing → active ↔ past_due → cancelled → none`. |
| V. Arabic Quality Is First-Class | PASS | FR-025 carries Arabic + English requirement. All Phase 8 i18n keys reused. |
| VI. Hidden Machine Layers MUST Be Auditable | PASS | FR-026 mandates structured logs at every step with extended classification vocabulary (added `portal_session_generation_failed`, `refund_processed`). `stripe_events/{eventId}` preserves audit trail. |
| VII. No Silent Override Without Rule, Signal, and Trace | PASS | Refund-cancellation is rule-based (full vs partial vs top-up branches in FR-032), surfaced to user via the existing cancellation lifecycle, and traced via `refund_processed` log code + GHL sync event. Plan-downgrade rejection (FR-005) unchanged. |
| VIII. Cost Discipline Is Mandatory | PASS | Webhook idempotency (event ID + application dedup) prevents double-crediting. Portal URL generated only when needed (transiently for dunning/refund) — no per-event waste. Customer reuse prevents duplicate Customer records (revenue/support cost). |
| IX. Proof Is Required for Every Claimed Fix | PASS | Test plan in Technical Context calls out 9 webhook scenarios + 3 callables + dedup + refund branches. Each FR has at least one acceptance scenario in spec. |
| X. Spec Before Code | PASS | Spec at 32 FRs / 19 SCs / 14 user stories / 19 clarifications across three sessions. Implementation gated on this plan. |
| XI. Frontend and Backend MUST Agree on Truth | PASS | `useBillingState` reads the same derived field the backend writes. Server-side `deductCreditsServer` is the authoritative gate. Frontend `useCanUse` is a hint. Mandatory modal driven by `billingState.plan === 'none'` on both sides. |
| XII. Deferred Scope MUST Remain Deferred | PASS | Subscription pausing deferred (FR-014). Multi-currency deferred (FR-031). Stripe Adaptive Pricing deferred. Alerting infrastructure deferred (structured logs enable future metrics). |

**Initial check**: All 12 principles PASS.
**Post-Phase 1 re-check**: All 12 principles remain PASS. Data model aligns with lifecycle. Contracts define explicit boundaries. No violations.

## Project Structure

### Documentation (this feature)

```text
specs/021-stripe-migration/
├── plan.md              # This file
├── spec.md              # Feature specification (14 user stories, 32 FRs, 19 SCs)
├── research.md          # Phase 0 research decisions
├── data-model.md        # Phase 1 data model
├── quickstart.md        # Phase 1 setup guide
├── contracts/
│   ├── stripe-webhooks.md   # Backend webhook + callable contracts
│   ├── frontend-hooks.md    # Frontend hooks, components, i18n keys
│   └── billingState.ts      # TypeScript shape of derived billing state
├── tasks.md             # Phase 2 output (regenerate via /speckit.tasks)
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (repository root)

```text
functions/
├── src/
│   ├── index.ts                       # MODIFIED — drop 9 Paddle callables; add: stripeWebhook (onRequest), createStripeCheckoutSession, createStripeTopUpSession, createStripePortalSession (onCall × 3); replace Paddle secrets with Stripe secrets
│   ├── entitlements.ts                # UNCHANGED — plan features, ACTION_FEATURE_MAP, resolveEntitlement
│   ├── paddle/                        # DELETE WHOLESALE
│   │   ├── paddleCheckout.ts          # DELETE
│   │   ├── paddleClient.ts            # DELETE
│   │   ├── paddlePortal.ts            # DELETE
│   │   └── paddleSubscriptions.ts     # DELETE
│   ├── stripe/                        # NEW DIRECTORY
│   │   ├── stripeClient.ts            # NEW — Stripe SDK init + STRIPE_PRICE_TO_PLAN map (single source of truth, mirrored to frontend)
│   │   ├── stripeCheckout.ts          # NEW — createStripeCheckoutSession + createStripeTopUpSession internals
│   │   └── stripePortal.ts            # NEW — createStripePortalSession + transient portal generation helper
│   └── billing/
│       ├── billingState.ts            # MODIFIED — Paddle fields → Stripe fields (stripeCustomerId, stripeSubscriptionId; drop paddleUpdatePaymentUrl, paddleCancelUrl)
│       ├── billingLogger.ts           # MODIFIED — extend error vocabulary (stripe_signature_invalid, stripe_event_duplicate, stripe_event_unknown, stripe_price_unmapped, portal_session_generation_failed, refund_processed)
│       ├── ghlBillingSync.ts          # MODIFIED — rename event names; success-sync omits portalUrl; failed-sync generates portalUrl transiently
│       ├── paddleWebhook.ts           # DELETE
│       ├── stripeWebhook.ts           # NEW — handleStripeWebhook(req, res) onRequest handler with 7 event handlers (checkout.session.completed, customer.subscription.created/updated/deleted, invoice.payment_succeeded/failed, charge.refunded), event-ID dedup, app-level dedup on stripeSubscriptionId
│       └── __tests__/
│           ├── billingState.test.ts   # REWRITTEN — Stripe-shape billingState assertions
│           ├── paddleWebhook.test.ts  # DELETE
│           └── stripeWebhook.test.ts  # NEW — 9 webhook scenarios + 3 callable scenarios + dual-event dedup + 3 refund branches

src/
├── pages/
│   └── Billing.tsx                    # MODIFIED — "Manage Subscription" button calls createStripePortalSession; cancel deep-links via flow=subscription_cancel; payment-failed alert deep-links via flow=payment_method_update
├── components/
│   ├── billing/
│   │   ├── CancelDialog.tsx           # MODIFIED — second step calls createStripePortalSession({ flow: 'subscription_cancel' }) instead of opening Paddle URL
│   │   ├── CreditBar.tsx              # UNCHANGED
│   │   ├── PlanCard.tsx               # MODIFIED — read stripeCustomerId / stripeSubscriptionId field names
│   │   ├── TopUpSelector.tsx          # MODIFIED — calls createStripeTopUpSession; redirects to checkoutUrl returned
│   │   ├── ReactivateButton.tsx       # MODIFIED — opens Stripe Customer Portal session (no longer uses Paddle URL)
│   │   ├── PaymentFailedAlert.tsx     # MODIFIED — "Update payment method" calls createStripePortalSession({ flow: 'payment_method_update' })
│   │   ├── TrialExpiredBanner.tsx     # UNCHANGED
│   │   ├── LowCreditsWarning.tsx      # UNCHANGED
│   │   └── MandatoryBillingModal.tsx  # MODIFIED — plan-click handler calls createStripeCheckoutSession; redirects to checkoutUrl (NEVER GHL); auto-closes on plan transition unchanged
│   ├── auth/
│   │   ├── LoginTab.tsx               # UNCHANGED (referenced from Phase 8)
│   │   ├── CreateAccountTab.tsx       # UNCHANGED
│   │   ├── VerifyEmailScreen.tsx      # UNCHANGED
│   │   └── ForgotPasswordDialog.tsx   # UNCHANGED
│   └── PricingTable.tsx               # MODIFIED — Monthly/Annual toggle; CTA buttons call createStripeCheckoutSession with the matching priceId
├── hooks/
│   └── useBillingState.ts             # MODIFIED — read stripeCustomerId / stripeSubscriptionId field names; drop paddleUpdatePaymentUrl / paddleCancelUrl reads
├── i18n.tsx                           # MODIFIED — keep all billing.*, login.*, auth.* keys (en + ar); update copy that mentions "Paddle" to "Stripe" or generic terms
├── firebase.ts                        # UNCHANGED — Google sign-in already removed in Phase 8
├── planconfig.ts                      # MODIFIED — Paddle price IDs → Stripe price IDs (3 monthly + 3 annual subscription + 3 top-up = 9 total); STRIPE_PRICE_TO_PLAN map mirrors functions/src/stripe/stripeClient.ts
├── App.tsx                            # MODIFIED — drop Paddle.js initialization; mandatory modal CTA wired to createStripeCheckoutSession; onAuthStateChanged + pending_plans consume flow unchanged
└── index.html                         # MODIFIED — drop <script src="https://cdn.paddle.com/paddle/v2/paddle.js">; no Stripe.js script needed (Checkout Session redirects, Customer Portal redirects)
```

**Structure Decision**: Extend the existing React + Firebase Functions project. New backend directory `functions/src/stripe/` mirrors the deleted `functions/src/paddle/`. New backend file `functions/src/billing/stripeWebhook.ts` mirrors the deleted `functions/src/billing/paddleWebhook.ts`. No frontend Stripe SDK script tag — Stripe Checkout Sessions and Customer Portal both work via server-side session creation + browser redirect, so the SPA does not need `@stripe/stripe-js` for these flows. (Note: `@stripe/stripe-js` is added to dev dependencies only for type completeness; runtime browser code does not import it.) The existing monolithic `src/App.tsx` keeps its targeted refactor surfaces (LoginScreen tabs, onAuthStateChanged flow, mandatory modal gate) — only the modal CTA's click handler swaps from Paddle.js overlay to a redirect-to-Checkout pattern.

## Complexity Tracking

No constitution violations to justify. All principles pass. Refund handling and `customer.subscription.created` fallback both reduce reliability risk rather than adding complexity for its own sake.
