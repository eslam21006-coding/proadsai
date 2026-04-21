# Implementation Plan: Billing, Plan Access, Top-Up, Downgrade, Cancellation, and Email-Only Auth

**Branch**: `009-billing-plan-access` | **Date**: 2026-04-14 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/009-billing-plan-access/spec.md`

## Summary

Phase 8 of the launch matrix: migrate billing from Stripe to Paddle as sole Merchant of Record, reverse the GHL integration so Firebase pushes billing events to GHL (not the other way around), and replace Google sign-in with email-only authentication that requires email verification. Paddle writes plan data to `pending_plans/{email}` when a user pays before signing up, and to `users/{uid}` when the firebaseUid is known. Management flows (update payment method, cancel) use Paddle-provided `managementUrls` stored on the user document — no custom portal session layer. Unpaid users are retained (not deleted) and shown a dismiss-proof mandatory billing modal; the modal auto-closes when the real-time billing state listener detects a plan transition. Team members bypass the modal. All billing operations emit structured logs with explicit error classification codes.

## Technical Context

**Language/Version**: TypeScript 5.7 (functions), TypeScript 5.9 (frontend)  
**Primary Dependencies**: Firebase Cloud Functions v2, Firebase Auth (email/password + email verification), React 19, Zustand, Tailwind CSS 3, `@paddle/paddle-node-sdk` (backend), Paddle.js v2 (client-side overlay checkout)  
**Storage**: Firestore — `users/{uid}` (with embedded `billingState` sub-object), `pending_plans/{email.toLowerCase()}` (pre-signup plans), `paddle_events/{eventId}` (webhook idempotency), `cancellation_logs/{uid}_{ts}` (analytics)  
**Testing**: Jest (functions) — rewriting `functions/src/billing/__tests__/billingState.test.ts` against the new Paddle handlers  
**Target Platform**: Web (React SPA on Firebase Hosting, Firebase Cloud Functions v2 in `europe-west1`)  
**Project Type**: Web application (React frontend + Firebase Cloud Functions backend)  
**Performance Goals**: Billing page loads within 2s; billing state changes reflected in frontend within 3s; Paddle webhook processing under 5s end-to-end  
**Constraints**: Paddle is Merchant of Record (no custom tax/invoice logic); GHL sync is fire-and-forget; unpaid accounts MUST NOT be deleted; email verification required before app access; Arabic + English RTL from launch  
**Scale/Scope**: Pre-launch SaaS — no existing users to migrate. 4 plan tiers, 3 top-up packs, 6 Paddle webhook event types, ~50 i18n keys (en + ar), 14 user stories

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Reliability Over Feature Count | PASS | Scope is intentionally narrow: no subscription pausing, no custom portal session layer, no multi-currency UI work. Paddle handles tax/invoices/dunning. Deleting unpaid accounts (prior behavior) is explicitly replaced with a safer mandatory modal. |
| II. The Selected Mode MUST Be Obeyed | PASS | Plan selection drives feature access. Server-side gate (`deductCreditsServer`) enforces plan entitlements. |
| III. Launch Surface Is Frozen and Authoritative | PASS | Phase 8 tasks from LAUNCH_MATRIX.md (sections 8.A, 8.B, 8.C, 8.D) are the authoritative contract. Spec + plan follow them. |
| IV. Behavior Contracts Beat Subjective Judgment | PASS | Webhook contracts and state transitions are explicit (see `contracts/paddle-webhooks.md`, data-model.md). billingStatus lifecycle is defined. |
| V. Arabic Quality Is First-Class | PASS | FR-025 requires Arabic + English for all billing + auth surfaces from launch. i18n keys listed in contracts/frontend-hooks.md. |
| VI. Hidden Machine Layers MUST Be Auditable | PASS | FR-026 mandates structured logging at every billing pipeline step with explicit error classification codes. `paddle_events` collection preserves audit trail. |
| VII. No Silent Override Without Rule, Signal, and Trace | PASS | Every override is explicit: plan_downgraded error, trial_expired error, GHL sync best-effort with logged failures, mandatory modal is signaled to user, webhook dedup logs duplicates. |
| VIII. Cost Discipline Is Mandatory | PASS | Webhook idempotency prevents double-crediting. Plan gate prevents unauthorized consumption. No retry loops, no wasteful generation. |
| IX. Proof Is Required for Every Claimed Fix | PASS | `billingState.test.ts` is rewritten with explicit test scenarios (webhook types × state transitions). Every FR has an acceptance scenario. |
| X. Spec Before Code | PASS | Spec has 14 user stories, 31 functional requirements (FR-001 through FR-026 plus sub-requirements), 15 success criteria, and three clarify sessions. |
| XI. Frontend and Backend MUST Agree on Truth | PASS | `useBillingState` reads the same derived field the backend writes. `deductCreditsServer` is the authoritative gate — frontend `useCanUse` is a hint only. Mandatory modal is driven by `billingState.plan === 'none'` on both sides. |
| XII. Deferred Scope MUST Remain Deferred | PASS | Subscription pausing out of scope (FR-014). Alerting infrastructure deferred (structured logs enable future metrics). No feature creep. |

**Post-Phase 1 Re-check**: All principles remain PASS. Data model aligns with lifecycle. Contracts define explicit boundaries. No violations detected.

## Project Structure

### Documentation (this feature)

```text
specs/009-billing-plan-access/
├── plan.md              # This file
├── spec.md              # Feature specification (14 user stories, 31 FRs, 15 SCs)
├── research.md          # Phase 0 research decisions
├── data-model.md        # Phase 1 data model
├── quickstart.md        # Phase 1 setup guide
├── contracts/
│   ├── paddle-webhooks.md   # Backend endpoint contracts (webhook + callables)
│   └── frontend-hooks.md    # Frontend hooks, components, i18n keys
├── tasks.md             # Phase 2 output (regenerate via /speckit.tasks)
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (repository root)

```text
functions/
├── src/
│   ├── index.ts                       # Cloud Functions entry (paddleWebhook, callables, secrets)
│   ├── entitlements.ts                # Plan features, ACTION_FEATURE_MAP, resolveEntitlement
│   └── billing/
│       ├── billingState.ts            # buildBillingState(), writeBillingState(), idempotency helpers
│       ├── paddleWebhook.ts           # handlePaddleWebhook() + event-type handlers [NEW]
│       ├── ghlBillingSync.ts          # notifyGHL(identifier, event), notifyGHLFailed [NEW]
│       └── __tests__/
│           └── billingState.test.ts   # Rewritten for Paddle (6 scenarios)

src/
├── pages/
│   └── Billing.tsx                    # Billing dashboard (uses paddleUpdatePaymentUrl, paddleCancelUrl)
├── components/
│   ├── billing/
│   │   ├── CancelDialog.tsx           # 2-step reason capture (exists)
│   │   ├── CreditBar.tsx              # Credit usage bar
│   │   ├── PlanCard.tsx               # Plan + billing status display
│   │   ├── TopUpSelector.tsx          # 3 top-up packs
│   │   ├── ReactivateButton.tsx       # Opens Paddle portal URL
│   │   ├── PaymentFailedAlert.tsx     # past_due alert with countdown
│   │   ├── TrialExpiredBanner.tsx     # Trial 0-credits banner [NEW]
│   │   ├── LowCreditsWarning.tsx      # <20% threshold banner [NEW]
│   │   └── MandatoryBillingModal.tsx  # Dismiss-proof fullscreen pricing modal [NEW]
│   ├── auth/
│   │   ├── LoginTab.tsx               # Email + password + forgot password [REFACTORED]
│   │   ├── CreateAccountTab.tsx       # Email + password + confirm [NEW]
│   │   ├── VerifyEmailScreen.tsx      # Post-create-account verify email gate [NEW]
│   │   └── ForgotPasswordDialog.tsx   # Firebase sendPasswordResetEmail wrapper [NEW]
│   └── PricingTable.tsx               # CTA buttons call createPaddleCheckout
├── hooks/
│   └── useBillingState.ts             # Real-time billing state listener + useCanUse
├── i18n.tsx                           # Add billing.*, login.*, auth.* keys (en + ar)
├── firebase.ts                        # Remove GoogleAuthProvider
├── planconfig.ts                      # paddlePriceId, paddleTopUpPriceIds
└── App.tsx                            # Refactored LoginScreen, onAuthStateChanged, mandatory modal gate
```

**Structure Decision**: Extend the existing React + Firebase Functions project. New backend files live under `functions/src/billing/` (paddleWebhook.ts, ghlBillingSync.ts). New frontend components group under `src/components/billing/` and `src/components/auth/`. The existing monolithic `src/App.tsx` receives targeted refactors (LoginScreen tabs, onAuthStateChanged flow, mandatory modal gate). This matches the existing project layout — no new top-level directories.

## Complexity Tracking

No constitution violations to justify. All principles pass.
