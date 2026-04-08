# Quickstart: Billing, Plan Access, Top-Up, Downgrade, and Cancellation

**Branch**: `009-billing-plan-access` | **Date**: 2026-04-04

## Prerequisites

- Node.js 20+ (Firebase Functions v2 requirement)
- Firebase CLI (`npm install -g firebase-tools`)
- Access to Stripe dashboard (for webhook secrets and test mode)
- Access to GHL (GoHighLevel) for payment webhook testing

## Setup

```bash
# Install dependencies
npm install
cd functions && npm install && cd ..

# Start local dev server
npm run dev
```

## Key Files to Understand First

1. **`functions/src/entitlements.ts`** — Plan definitions, feature gates, `resolveEntitlement()`, `checkFeature()`. This is the authoritative source for what each plan allows.

2. **`src/planconfig.ts`** — Frontend mirror of plan config. `PLANS`, `canUse()`, `TOPUP_PACKS`, `CREDIT_COSTS`.

3. **`functions/src/index.ts`** — All Cloud Functions. The billing-related ones: `ghlpaymentwebhook`, `ghlCancellationWebhook`, `stripeWebhook`, `createTopupCheckout`, `createStripePortalSession`, `cancelSubscription`, `deductCreditsServer`, `monthlyCreditsReset`.

4. **`src/store.ts`** — Zustand store. Contains `userPlan`, `userCredits`, `setUserPlan()`, `setUserCredits()`.

5. **`src/App.tsx`** — Main app component. Phase-based navigation (no React Router). Auth state listener. Conditional rendering based on `AppPhase`.

## Implementation Order

### Phase 1: Backend Foundation
1. Verify `functions/src/billing/billingState.ts` — exports `buildBillingState()` (plan validation, derived fields) and `writeBillingState()` (reads user doc, builds state, writes to Firestore with observability logs)
2. Verify `writeBillingState()` is called in all billing call sites in `functions/src/index.ts` (ghlpaymentwebhook, ghlCancellationWebhook, monthlyCreditsReset, stripeWebhook, cancelSubscription, reactivateSubscription, deductCreditsServer)
3. Verify `monthlyCreditsReset` uses overwrite (`credits = creditsPerMonth`) — confirmed correct
4. Verify plan-gate check in `deductCreditsServer` — uses `resolveEntitlement()` + `checkFeature()` with fail-closed `Object.hasOwn()` guard on ACTION_FEATURE_MAP + re-check inside transaction
5. Verify `ACTION_FEATURE_MAP` in `entitlements.ts` — maps all COSTS action keys to feature gates
6. Verify `reactivateSubscription` callable (exists in index.ts)
7. Verify `cancelSubscription` reason/feedback fields (wired with CancellationReason enum)

### Phase 2: Frontend Foundation
1. Verify `src/hooks/useBillingState.ts` — uses `onAuthStateChanged` (not one-shot currentUser), Firestore `onSnapshot` listener, logs snapshot errors
2. Verify `'billing'` in AppPhase type and sidebar navigation wires `setPhase('billing')`
3. Verify billing nav link in header/sidebar
4. Verify `InputForm.tsx` reads from `useBillingState()` instead of `userData.plan`/`userData.credits` (FR-015)

### Phase 3: Billing Page (components already scaffolded)
1. Verify `src/pages/Billing.tsx` renders correctly once useBillingState hook exists
2. Verify components work: `CreditBar`, `PlanCard`, `TopUpSelector`, `CancelDialog`, `PaymentFailedAlert`, `ReactivateButton`
3. Wire top-up flow (calls `createTopupCheckout`)
4. Wire cancellation flow (two-step dialog → `cancelSubscription`)
5. Wire reactivation (calls `reactivateSubscription`)
6. Wire "Manage subscription" button (calls `createStripePortalSession`)

### Phase 4: App-Wide Banners & Enforcement
1. Verify `TrialBanner` and `LowCreditsBanner` components exist and work
2. Add banners to `App.tsx` (rendered outside phase-specific content)
3. Implement downgrade enforcement — `useBillingState()` drives `canUse()` checks in real-time
4. Handle `plan_downgraded` error in frontend credit-consuming actions

### Phase 5: Testing & Validation
1. Verify test fixtures for `buildBillingState()` match the current contract in `functions/src/billing/billingState.ts` (31 assertions, all passing)
2. Manual testing of all billing flows (Stripe test mode)

## Testing Approach

- **Backend**: `cd functions && npm test` — fixture-based tests for `buildBillingState()` writes
- **Frontend**: Manual testing with Stripe test mode cards
- **Stripe test cards**: `4242424242424242` (success), `4000000000000341` (payment failure)
- **Webhook testing**: Use Firebase emulator or Stripe CLI for local webhook forwarding

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| billingState location | Derived field on user doc | Single read, real-time listener, no join needed |
| Navigation | New AppPhase, not React Router | Consistent with existing app architecture |
| Credit reset | Overwrite (credits = plan allocation) | Product decision — top-up credits do not carry over past reset |
| Grace period | Stripe-managed | No app-level configuration needed |
| Plan-gate check | Fast-fail outside transaction + re-check inside transaction | Fast-fail avoids unnecessary transaction; re-check inside transaction prevents TOCTOU race |
| Reactivation | Separate function (not toggle on cancel) | Semantic clarity |
